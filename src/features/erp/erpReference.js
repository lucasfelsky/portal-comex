// Referencia do ERP (PR 3, "Importar do DBCorp"). Modulo PURO e nao-UI: monta o
// payload que o servico grava (recorte por embarque, sem dado financeiro), fatia
// a gravacao em lotes e, ao vivo, transforma a comparacao com a referencia nos
// avisos "ERP" do detalhe do processo. Nao le rede, nao grava e nao importa
// servico (guarda em `erpReadOnlyGuard.test.js`). Camada: erpText + reconcileErp
// <- erpReference.
import { cleanCell } from './erpText.js'
import {
  ERP_MATCH_RULES,
  ERP_REFERENCE_CONFLICT_FIELDS,
  diffProcessAgainstReference,
  erpItemGroupKey,
  erpOrderKey,
  toErpReferenceShipment,
} from './reconcileErp.js'

export { ERP_REFERENCE_CONFLICT_FIELDS, erpItemGroupKey, erpOrderKey }

// Nomes das colecoes e do documento-ponteiro. Fonte unica: o servico e o teste
// de paridade com as rules leem daqui.
export const ERP_SNAPSHOTS_COLLECTION = 'erpSnapshots'
export const ERP_PROCESS_HINTS_COLLECTION = 'erpProcessHints'
export const ERP_REFERENCE_LATEST_ID = 'latest'

// Tetos, uma unica fonte. Os de lista/tamanho espelham o `firestore.rules`
// (teste de paridade); passar de qualquer um PULA o hint (nunca trunca: truncar
// criaria divergencia falsa ou mudaria o `erp_conflito`).
export const ERP_HINT_LIMITS = {
  maxItems: 300,
  maxOrders: 100,
  maxConflicts: 20,
  maxConflictValues: 20,
  maxStatuses: 20,
  maxStatusNf: 10,
  maxHintBytes: 200000,
  maxProcessIdLength: 128,
  maxFileName: 255,
  maxName: 120,
  maxOps: 450,
  maxBatchBytes: 4194304,
}

// Orcamento fixo do documento de meta e do `latest` num lote.
const RESERVED_DOC_BYTES = 4096

// Motivos de um hint pulado (`skipped[].reason`).
export const ERP_HINT_SKIP_REASONS = [
  'id_invalido',
  'regra_desconhecida',
  'sem_recorte',
  'itens_demais',
  'pedidos_demais',
  'conflitos_demais',
  'status_demais',
  'tamanho',
]

// So' esses 2 tipos de diferenca acendem o aviso: valor diferente e campo vazio
// no Portal com valor no ERP. `erp_conflito`, `formato`, `informativo`,
// `erp_sem_dado` e `erp_atrasado` nao acendem.
export const ERP_HINT_KINDS = ['divergente', 'portal_sem_dado']

// Rotulos do `ariaLabel` (o `FIELD_LABELS` do nucleo nao separa Nº e Registro da DUIMP).
export const ERP_HINT_TARGET_LABELS = {
  destination: 'Destino',
  etd: 'ETD',
  eta: 'ETA',
  vessel: 'Navio',
  bl: 'BL',
  duimpNumber: 'Nº da DUIMP',
  duimpRegisteredAt: 'Registro da DUIMP',
  incoterm: 'Incoterm',
  supplier: 'Fornecedor',
  origin: 'Origem',
  poSet: 'POs consolidadas',
}

const DATE_TARGETS = ['etd', 'eta', 'duimpRegisteredAt']
const DISPLAY_LIMIT = 120

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const asText = (value) => (typeof value === 'string' ? value : '')
const asCount = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

// Corta rotulos (nome de arquivo, nome do ator). Nunca usado em dado comparado.
export function clipText(value, max) {
  const text = asText(value)
  return text.length > max ? text.slice(0, max) : text
}

// Bytes UTF-8 de um texto (sem depender de TextEncoder no ambiente de teste).
function utf8ByteLength(text) {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code < 0x10000) bytes += 3
    else bytes += 4
  }
  return bytes
}

function isInvalidProcessId(processId) {
  return (
    processId === '' ||
    processId.length > ERP_HINT_LIMITS.maxProcessIdLength ||
    processId.includes('/') ||
    processId === '.' ||
    processId === '..' ||
    /^__.*__$/.test(processId)
  )
}

// Primeiro teto estourado pelo recorte (ou '').
function limitReasonOf(shipment) {
  if (shipment.items.length > ERP_HINT_LIMITS.maxItems) return 'itens_demais'
  if (shipment.orders.length > ERP_HINT_LIMITS.maxOrders) return 'pedidos_demais'
  if (
    shipment.conflicts.length > ERP_HINT_LIMITS.maxConflicts ||
    shipment.conflicts.some((conflict) => conflict.values.length > ERP_HINT_LIMITS.maxConflictValues)
  ) {
    return 'conflitos_demais'
  }
  if (
    shipment.statuses.length > ERP_HINT_LIMITS.maxStatuses ||
    shipment.statusNf.length > ERP_HINT_LIMITS.maxStatusNf
  ) {
    return 'status_demais'
  }
  if (utf8ByteLength(JSON.stringify(shipment)) > ERP_HINT_LIMITS.maxHintBytes) return 'tamanho'
  return ''
}

// Tamanho aproximado (bytes) de um hint na gravacao: o recorte + folga para
// ids, timestamp e nome das chaves. Alimenta `planErpReferenceBatches`.
export function estimateErpHintBytes(hint) {
  return utf8ByteLength(JSON.stringify(hint?.shipment ?? null)) + 512
}

// Resultado da conciliacao -> o que o servico grava.
//   -> { sourceInfo, counts, hints: [{ processId, matchRule, shipment }], skipped: [{ processId, reason }] }
// Lanca com resultado bloqueado (nada foi conciliado).
export function buildErpReferencePayload(result) {
  if (!isRecord(result)) throw new Error('Resultado da conciliação inválido: não há referência do ERP para salvar.')
  if (result.blocked) throw new Error('A conciliação foi bloqueada: não há referência do ERP para salvar.')

  const hints = []
  const skipped = []
  for (const entry of Array.isArray(result.matched) ? result.matched : []) {
    const processId = typeof entry?.processId === 'string' ? entry.processId : String(entry?.processId ?? '')
    if (isInvalidProcessId(processId)) {
      skipped.push({ processId, reason: 'id_invalido' })
      continue
    }
    if (!ERP_MATCH_RULES.includes(entry.matchRule)) {
      skipped.push({ processId, reason: 'regra_desconhecida' })
      continue
    }
    if (!isRecord(entry.referenceShipment)) {
      skipped.push({ processId, reason: 'sem_recorte' })
      continue
    }
    // O recorte ja nasce do normalizador do nucleo; passar de novo e' idempotente.
    const shipment = toErpReferenceShipment(entry.referenceShipment)
    const reason = limitReasonOf(shipment)
    if (reason) {
      skipped.push({ processId, reason })
      continue
    }
    hints.push({ processId, matchRule: entry.matchRule, shipment })
  }

  const info = isRecord(result.sourceInfo) ? result.sourceInfo : {}
  const summary = isRecord(result.summary) ? result.summary : {}
  return {
    sourceInfo: {
      source: asText(info.source),
      label: asText(info.label),
      fileName: clipText(info.fileName, ERP_HINT_LIMITS.maxFileName),
      fetchedAt: asText(info.fetchedAt),
      rowCount: asCount(info.rowCount),
      generatedOn: asText(info.generatedOn),
    },
    counts: {
      erpRows: asCount(summary.erpRows),
      shipments: asCount(summary.shipments),
      activeShipments: asCount(summary.activeShipments),
      matched: asCount(summary.matched),
      matchedArchived: asCount(summary.matchedArchived),
      matchedWithDiffs: asCount(summary.matchedWithDiffs),
      erpOnly: asCount(summary.erpOnly),
      portalOnly: asCount(summary.portalOnly),
      warnings: asCount(summary.warnings),
      hints: hints.length,
      hintsSkipped: skipped.length,
    },
    hints,
    skipped,
  }
}

// Fatia a gravacao por operacoes E por bytes. `hintBytes[i]` = tamanho do hint i.
// O meta entra so' no 1o lote; o `latest` so' no ultimo (vai sozinho num lote
// proprio quando o ultimo esta cheio). Cada lote:
//   { ops, bytes, hasMeta, hasLatest, hintIndexes }
export function planErpReferenceBatches(
  hintBytes,
  { maxOps = ERP_HINT_LIMITS.maxOps, maxBatchBytes = ERP_HINT_LIMITS.maxBatchBytes } = {}
) {
  const open = (hasMeta) => ({
    ops: hasMeta ? 1 : 0,
    bytes: hasMeta ? RESERVED_DOC_BYTES : 0,
    hasMeta,
    hasLatest: false,
    hintIndexes: [],
  })
  const batches = []
  let current = open(true)
  const sizes = Array.isArray(hintBytes) ? hintBytes : []
  sizes.forEach((size, index) => {
    const bytes = asCount(size)
    const overflows = current.ops + 1 > maxOps || current.bytes + bytes > maxBatchBytes
    if (overflows && current.ops > 0) {
      batches.push(current)
      current = open(false)
    }
    current.ops += 1
    current.bytes += bytes
    current.hintIndexes.push(index)
  })
  if (current.ops + 1 > maxOps || current.bytes + RESERVED_DOC_BYTES > maxBatchBytes) {
    batches.push(current)
    current = open(false)
  }
  current.ops += 1
  current.bytes += RESERVED_DOC_BYTES
  current.hasLatest = true
  batches.push(current)
  return batches
}

// "planilha de DD/MM/AAAA [HH:mm]": hora LOCAL do import (`new Date(ms)` + getters
// locais; nunca ISO, que em BRT viraria o dia anterior).
export function formatErpReferenceStamp(ms, { withTime = false } = {}) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
  return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}

// ---------------------------------------------------------------------------
// Avisos "ERP" do detalhe
// ---------------------------------------------------------------------------

export const EMPTY_ERP_HINTS = Object.freeze({
  fields: Object.freeze({}),
  po: Object.freeze({}),
  quantity: Object.freeze({}),
})

// Data ISO do ERP -> DD/MM/AAAA, por texto (sem Date). Qualquer outra coisa passa crua.
function displayDate(value) {
  const text = cleanCell(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text
}

// Valor longo so' e' cortado na exibicao.
function clipForDisplay(value) {
  const text = cleanCell(value)
  return text.length > DISPLAY_LIMIT ? `${text.slice(0, DISPLAY_LIMIT)}…` : text
}

// Campo do detalhe (`erpHints.fields.<chave>`) a que o diff se refere; '' = nenhum.
function fieldTargetOf(diff) {
  switch (diff.field) {
    case 'destination':
    case 'etd':
    case 'eta':
    case 'vessel':
    case 'bl':
    case 'incoterm':
    case 'origin':
    case 'poSet':
      return diff.field
    case 'di':
      if (diff.portalFields?.[0] === 'duimpNumber') return 'duimpNumber'
      if (diff.portalFields?.[0] === 'duimpRegisteredAt') return 'duimpRegisteredAt'
      return ''
    case 'supplier':
      // Com `scope` e' o fornecedor de uma PO do consolidado (chip da PO).
      return diff.scope ? '' : 'supplier'
    default:
      return ''
  }
}

function fieldHint(diff, target, stampText) {
  const raw = DATE_TARGETS.includes(target) ? displayDate(diff.erp) : cleanCell(diff.erp)
  const value = clipForDisplay(raw)
  const isEmpty = diff.kind === 'portal_sem_dado'
  return {
    kind: diff.kind,
    ariaLabel: `${ERP_HINT_TARGET_LABELS[target]} no ERP: ${value}`,
    text: `No ERP: ${value}${isEmpty ? ' · vazio no Portal' : ''}${stampText}`,
    portalFields: [...(diff.portalFields ?? [])],
  }
}

function quantityHint(diff, stampText) {
  const name = String(diff.label ?? '').replace(/^Quantidade \(kg\): /, '')
  const erp = clipForDisplay(diff.erp)
  const isEmpty = diff.kind === 'portal_sem_dado'
  const middle = isEmpty ? ' · vazio no Portal' : ` · Portal soma ${cleanCell(diff.portal)} kg`
  return {
    kind: diff.kind,
    ariaLabel: `Quantidade de ${clipForDisplay(name)} no ERP (soma do item): ${erp} kg`,
    text: `No ERP (soma do item): ${erp} kg${middle}${stampText}`,
    portalFields: [...(diff.portalFields ?? [])],
  }
}

// 1 chip por PO do consolidado, juntando Ref. e Fornecedor com `; `.
function purchaseOrderHint(po, parts, stampText) {
  const allEmpty = parts.every((part) => part.isEmpty)
  const mixed = !allEmpty && parts.some((part) => part.isEmpty)
  const body = parts
    .map((part) => (mixed && part.isEmpty ? `${part.text} (vazio no Portal)` : part.text))
    .join('; ')
  return {
    kind: allEmpty ? 'portal_sem_dado' : 'divergente',
    ariaLabel: `PO ${clipForDisplay(po)} no ERP: ${parts.map((part) => part.text).join('; ')}`,
    text: `No ERP: ${body}${allEmpty ? ' · vazio no Portal' : ''}${stampText}`,
    portalFields: ['purchaseOrders'],
  }
}

// Avisos de um processo contra a referencia gravada (so' admin chama):
//   reference = { snapshot: { snapshotId, updatedAtMs }, hint: { snapshotId, matchRule, shipment } | null }
//   -> { fields: { <campo>: hint }, po: { [poKey]: hint }, quantity: { [`${poKey}|${nameKey}`]: hint } }
//   hint = { kind, ariaLabel, text, portalFields }
// Hint de outro snapshot, sem referencia ou sem diferenca acesa -> mapas vazios.
export function buildErpFieldHints(process, reference) {
  const empty = () => ({ fields: {}, po: {}, quantity: {} })
  const snapshot = reference?.snapshot
  const hint = reference?.hint
  if (!isRecord(process) || !isRecord(snapshot) || !isRecord(hint)) return empty()
  if (typeof hint.snapshotId !== 'string' || hint.snapshotId !== snapshot.snapshotId) return empty()

  const stamp = formatErpReferenceStamp(snapshot.updatedAtMs)
  const stampText = stamp ? ` · planilha de ${stamp}` : ''
  const fields = {}
  const quantity = {}
  const poParts = new Map()

  for (const diff of diffProcessAgainstReference(process, hint)) {
    if (!ERP_HINT_KINDS.includes(diff.kind)) continue
    if (diff.field === 'quantity') {
      if (diff.scope) quantity[`${diff.scope.poKey}|${diff.scope.nameKey}`] = quantityHint(diff, stampText)
      continue
    }
    if ((diff.field === 'poReference' || diff.field === 'supplier') && diff.scope) {
      const poKey = diff.scope.poKey
      if (!poParts.has(poKey)) poParts.set(poKey, { po: diff.scope.po, parts: [] })
      const prefix = diff.field === 'poReference' ? 'Ref.' : 'Fornecedor'
      poParts.get(poKey).parts.push({
        text: `${prefix} ${clipForDisplay(diff.erp)}`,
        isEmpty: diff.kind === 'portal_sem_dado',
      })
      continue
    }
    const target = fieldTargetOf(diff)
    if (target) fields[target] = fieldHint(diff, target, stampText)
  }

  const po = Object.fromEntries(
    [...poParts].map(([poKey, group]) => [poKey, purchaseOrderHint(group.po, group.parts, stampText)])
  )
  return { fields, po, quantity }
}
