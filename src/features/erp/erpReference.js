// Referencia do ERP (PR 3, "Importar do DBCorp"). Modulo PURO e nao-UI: monta o
// payload que o servico grava (recorte por embarque, sem dado financeiro), fatia
// a gravacao em lotes e, ao vivo, transforma a comparacao com a referencia nos
// avisos "ERP" do detalhe do processo. Nao le rede, nao grava e nao importa
// servico (guarda em `erpReadOnlyGuard.test.js`). Camada: erpText + reconcileErp
// <- erpReference.
import { cleanCell, foldText } from './erpText.js'
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
  const scan = scanErpHints(process, reference)
  if (!scan) return { fields: {}, po: {}, quantity: {} }
  const base = (entries) =>
    Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, entry.hint]))
  return { fields: base(scan.fields), po: base(scan.po), quantity: base(scan.quantity) }
}

// Varredura unica dos diffs acesos, usada pelo detalhe (`buildErpFieldHints`) e
// pelo formulario (`buildErpFormHints`). Cada entrada guarda o aviso base e os
// diffs de origem (o formulario deriva o valor aplicavel deles). null = sem
// referencia utilizavel (outro snapshot, hint ausente, processo invalido).
function scanErpHints(process, reference) {
  const snapshot = reference?.snapshot
  const hint = reference?.hint
  if (!isRecord(process) || !isRecord(snapshot) || !isRecord(hint)) return null
  if (typeof hint.snapshotId !== 'string' || hint.snapshotId !== snapshot.snapshotId) return null

  const stamp = formatErpReferenceStamp(snapshot.updatedAtMs)
  const stampText = stamp ? ` · planilha de ${stamp}` : ''
  const fields = {}
  const quantity = {}
  const poParts = new Map()

  for (const diff of diffProcessAgainstReference(process, hint)) {
    if (!ERP_HINT_KINDS.includes(diff.kind)) continue
    if (diff.field === 'quantity') {
      if (diff.scope) {
        quantity[`${diff.scope.poKey}|${diff.scope.nameKey}`] = { hint: quantityHint(diff, stampText), diff }
      }
      continue
    }
    if ((diff.field === 'poReference' || diff.field === 'supplier') && diff.scope) {
      const poKey = diff.scope.poKey
      if (!poParts.has(poKey)) poParts.set(poKey, { po: diff.scope.po, parts: [], diffs: [] })
      const prefix = diff.field === 'poReference' ? 'Ref.' : 'Fornecedor'
      const group = poParts.get(poKey)
      group.parts.push({
        text: `${prefix} ${clipForDisplay(diff.erp)}`,
        isEmpty: diff.kind === 'portal_sem_dado',
      })
      group.diffs.push(diff)
      continue
    }
    const target = fieldTargetOf(diff)
    if (target) fields[target] = { hint: fieldHint(diff, target, stampText), diff, target }
  }

  const po = Object.fromEntries(
    [...poParts].map(([poKey, group]) => [
      poKey,
      { hint: purchaseOrderHint(group.po, group.parts, stampText), diffs: group.diffs },
    ])
  )
  return { fields, po, quantity, shipment: toErpReferenceShipment(hint.shipment) }
}

// ---------------------------------------------------------------------------
// Avisos "ERP" do formulario de edicao (clique preenche o campo)
// ---------------------------------------------------------------------------

// Campos do rascunho que o clique no chip pode gravar (o `handleDraftChange` da
// pagina cuida dos efeitos colaterais de cada um). Nunca status, categoria, nº
// do processo/pedido, MAWB/HAWB nem campo financeiro.
export const ERP_FORM_APPLY_FIELDS = [
  'destination',
  'etd',
  'eta',
  'vesselName',
  'voyage',
  'houseBl',
  'duimpNumber',
  'duimpRegisteredAt',
  'incoterm',
  'supplierName',
  'originLocation',
  'purchaseOrders',
  'items',
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SUFFIX_BAD_DATE = ' · data do ERP em formato inesperado'
const SUFFIX_AIR_BL = ' · Aéreo: confira se é MAWB ou HAWB e preencha à mão'
const SUFFIX_DUIMP_HOUR = ' · a hora entra como 00:00; ajuste se precisar'
const SUFFIX_INCOTERM = ' · fora da lista de Incoterms do Portal'
const SUFFIX_PO_EXTRA = ' · sobram POs no Portal: remova à mão se for o caso'

const hasValue = (value) => typeof value === 'string' && cleanCell(value) !== ''
const op = (field, value) => ({ field, value })

// Resultado de um alvo: `apply` (ou null = so' aviso) e o texto extra do motivo.
const applicable = (apply, suffix = '') => ({ apply, suffix })
const notApplicable = (suffix = '') => ({ apply: null, suffix })

function purchaseOrderKeyOf(entry) {
  return erpOrderKey(typeof entry === 'string' ? entry : entry?.po)
}

function purchaseOrderListOf(draft) {
  return Array.isArray(draft?.purchaseOrders) ? draft.purchaseOrders : []
}

// Pedidos do ERP ausentes no Portal -> POs novas (ref. e fornecedor ja' preenchidos).
function missingPurchaseOrders(draft, shipment) {
  const portalKeys = new Set(purchaseOrderListOf(draft).map(purchaseOrderKeyOf))
  const byKey = new Map()
  for (const order of shipment.orders) {
    const key = erpOrderKey(order.pedido)
    if (key === '') continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(order)
  }
  const missing = []
  for (const [key, orders] of byKey) {
    if (portalKeys.has(key)) continue
    missing.push({
      po: cleanCell(orders[0].pedido),
      reference: cleanCell(orders.find((order) => hasValue(order.poRef))?.poRef),
      supplierName: cleanCell(orders.find((order) => hasValue(order.exporter))?.exporter),
    })
  }
  return { missing }
}

// Valor aplicavel de um campo simples (alvos de `fieldTargetOf`).
function applyForTarget(entry, draft, shipment, incotermOptions) {
  const { target, diff } = entry
  const erpValue = diff.erpValue
  switch (target) {
    case 'destination':
      return hasValue(erpValue) ? applicable([op('destination', erpValue)]) : notApplicable()
    case 'etd':
    case 'eta':
      return typeof erpValue === 'string' && ISO_DATE.test(erpValue)
        ? applicable([op(target, erpValue)])
        : notApplicable(SUFFIX_BAD_DATE)
    case 'vessel': {
      const ops = []
      if (isRecord(erpValue) && hasValue(erpValue.vesselName)) ops.push(op('vesselName', erpValue.vesselName))
      // Nunca manda `voyage: ''`: so' leva a viagem que o ERP informa.
      if (isRecord(erpValue) && hasValue(erpValue.voyage)) ops.push(op('voyage', erpValue.voyage))
      return ops.length > 0 ? applicable(ops) : notApplicable()
    }
    case 'bl':
      // O ERP tem uma coluna so' (BL/AWB): no aereo nao da' para saber se e' MAWB ou HAWB.
      if (foldText(draft.category) === 'AEREO') return notApplicable(SUFFIX_AIR_BL)
      return hasValue(erpValue) ? applicable([op('houseBl', erpValue)]) : notApplicable()
    case 'duimpNumber':
      return hasValue(erpValue) ? applicable([op('duimpNumber', erpValue)]) : notApplicable()
    case 'duimpRegisteredAt': {
      if (typeof erpValue !== 'string' || !ISO_DATE.test(erpValue)) return notApplicable(SUFFIX_BAD_DATE)
      const hour = /T(\d{2}:\d{2})/.exec(cleanCell(draft.duimpRegisteredAt))
      return hour
        ? applicable([op('duimpRegisteredAt', `${erpValue}T${hour[1]}`)])
        : applicable([op('duimpRegisteredAt', `${erpValue}T00:00`)], SUFFIX_DUIMP_HOUR)
    }
    case 'incoterm': {
      const option = (Array.isArray(incotermOptions) ? incotermOptions : []).find(
        (candidate) => foldText(candidate) === foldText(erpValue)
      )
      return option ? applicable([op('incoterm', option)]) : notApplicable(SUFFIX_INCOTERM)
    }
    case 'supplier':
      return hasValue(erpValue) ? applicable([op('supplierName', erpValue)]) : notApplicable()
    case 'origin':
      return hasValue(erpValue) ? applicable([op('originLocation', erpValue)]) : notApplicable()
    case 'poSet': {
      // So' acrescenta as POs que faltam; as que sobram nao sao removidas (remover
      // desvincula itens e a sobra pode ser legitima).
      const { missing } = missingPurchaseOrders(draft, shipment)
      if (missing.length > 0) return applicable([op('purchaseOrders', [...purchaseOrderListOf(draft), ...missing])])
      return notApplicable(SUFFIX_PO_EXTRA)
    }
    default:
      return notApplicable()
  }
}

// Ref./fornecedor de UMA PO do consolidado: troca so' a PO alvo e so' os campos acesos.
function applyForPurchaseOrder(poKey, entry, draft) {
  const changes = {}
  for (const diff of entry.diffs) {
    if (!hasValue(diff.erpValue)) continue
    changes[diff.field === 'poReference' ? 'reference' : 'supplierName'] = diff.erpValue
  }
  if (Object.keys(changes).length === 0) return notApplicable()
  const list = purchaseOrderListOf(draft)
  if (!list.some((order) => purchaseOrderKeyOf(order) === poKey)) return notApplicable()
  let done = false
  const next = list.map((order) => {
    if (done || purchaseOrderKeyOf(order) !== poKey) return order
    done = true
    return {
      po: typeof order === 'string' ? order : order.po,
      reference: typeof order === 'string' ? '' : order?.reference ?? '',
      supplierName: typeof order === 'string' ? '' : order?.supplierName ?? '',
      ...changes,
    }
  })
  return applicable([op('purchaseOrders', next)])
}

// Quantidade: o ERP da' a SOMA do item. Com 1 linha so' no grupo preenche essa
// linha; com 2 ou mais nao distribui (inventaria dado por lote/contêiner).
function applyForQuantity(groupKey, entry, draft) {
  const erpValue = entry.diff.erpValue
  if (typeof erpValue !== 'number' || !Number.isFinite(erpValue)) return notApplicable()
  const isConsolidated = foldText(draft.category) === 'CONSOLIDADO'
  const items = Array.isArray(draft.items) ? draft.items : []
  const lines = []
  items.forEach((item, index) => {
    if (cleanCell(item?.commercialName ?? item?.name) === '') return
    if (erpItemGroupKey(item, isConsolidated) === groupKey) lines.push(index)
  })
  if (lines.length === 0) return notApplicable()
  if (lines.length > 1) return notApplicable(` · o Portal tem ${lines.length} linhas deste item: ajuste à mão`)
  const target = lines[0]
  return applicable([op('items', items.map((item, index) => (index === target ? { ...item, quantity: erpValue } : item)))])
}

function withApply(hint, { apply, suffix }) {
  return { ...hint, text: `${hint.text}${suffix}`, apply }
}

// Mesmo mapa de `buildErpFieldHints`, para o RASCUNHO do formulario, com o que o
// clique no chip grava: cada aviso ganha `apply: Array<{ field, value }> | null`
// (null = so' aviso; o texto ganha o motivo). Recalculado a cada alteracao do
// rascunho, entao o chip some quando o campo passa a bater com o ERP. Nunca muta
// `draft`. `incotermOptions` = lista de Incoterms do formulario.
export function buildErpFormHints(draft, reference, { incotermOptions = [] } = {}) {
  const scan = scanErpHints(draft, reference)
  if (!scan) return { fields: {}, po: {}, quantity: {} }
  const { shipment } = scan
  return {
    fields: Object.fromEntries(
      Object.entries(scan.fields).map(([target, entry]) => [
        target,
        withApply(entry.hint, applyForTarget(entry, draft, shipment, incotermOptions)),
      ])
    ),
    po: Object.fromEntries(
      Object.entries(scan.po).map(([poKey, entry]) => [
        poKey,
        { ...entry.hint, apply: applyForPurchaseOrder(poKey, entry, draft).apply },
      ])
    ),
    quantity: Object.fromEntries(
      Object.entries(scan.quantity).map(([groupKey, entry]) => [
        groupKey,
        withApply(entry.hint, applyForQuantity(groupKey, entry, draft)),
      ])
    ),
  }
}
