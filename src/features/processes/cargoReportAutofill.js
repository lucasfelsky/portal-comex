import { cleanCell, foldText } from '../erp/erpText'
import {
  CARGO_AUTOFILL_KEY_MAX,
  CARGO_REPORT_LIMITS,
  CARGO_REPORT_MAX_ROWS,
  cargoOrderKey,
  createCargoReportRowId,
  createEmptyCargoAutofill,
  createEmptyCargoReportRow,
  buildInitialCargoReport,
  isCargoReportRowEmpty,
  parseCargoNumber,
  resolveCargoProcessReference,
  resolveCargoPurchaseOrderReference,
} from './cargoReportFormModel'
import {
  formatCargoKgText,
  getCargoReportPurchaseOrders,
  orderCargoRowsByPurchaseOrder,
  resolveCargoRowPurchaseOrder,
} from './cargoReportGroups'

// S9-C do Relatório de Carga: preenchimento automático (processo + FUP) e prévia do "Atualizar". Módulo puro, sem
// React nem firebase. A fonte é o processo (`items`, `purchaseOrders`) mais o recorte do FUP guardado em
// `erpProcessHints` (itens com `sqCode`, `supplierRef` e `itemId`). O que foi preenchido fica registrado em
// `form.autofill` ({ rows: { [rowId]: { key, base } } }): célula igual à base = marca de origem (P, F, C);
// diferente = "editado por você". O "Atualizar" só PROPÕE diferenças; o que o usuário editou à mão nunca é
// sobrescrito sem aparecer na prévia, e nada vem marcado quando a origem é desconhecida (relatório antigo).

export { resolveCargoProcessReference }

const QUANTITY_TOLERANCE_KG = 0.0005
const KEY_PROCESS = 'proc:'
const KEY_FUP = 'fup:'

export const CARGO_DIFF_KINDS = {
  text: 'texto',
  code: 'código',
  quantity: 'quantidade',
  po: 'PO',
  onlyFup: 'só no FUP',
  onlyProcess: 'só no processo',
  gone: 'fora do FUP',
}

export const CARGO_DIFF_SUFFIX = {
  edited: ' (você editou esta célula)',
  unknown: ' (origem não registrada)',
}

// Campos que o processo e o FUP preenchem (ordem de exibição na prévia) e o selo de origem de cada um.
const SOURCE_FIELDS = [
  { field: 'po', kind: CARGO_DIFF_KINDS.po, label: 'PO / PROCESSO', source: 'P' },
  { field: 'dbcorpCode', kind: CARGO_DIFF_KINDS.code, label: 'código DBCorp', source: 'F' },
  { field: 'supplierDescription', kind: CARGO_DIFF_KINDS.text, label: 'descrição do fornecedor', source: 'F' },
  { field: 'sqDescription', kind: CARGO_DIFF_KINDS.text, label: 'descrição SQ', source: 'P' },
  { field: 'quantityKg', kind: CARGO_DIFF_KINDS.quantity, label: 'quantidade', source: 'F' },
]

const TEXT_LIMITS = {
  po: CARGO_REPORT_LIMITS.text,
  dbcorpCode: CARGO_REPORT_LIMITS.text,
  supplierDescription: CARGO_REPORT_LIMITS.description,
  sqDescription: CARGO_REPORT_LIMITS.description,
}

function clipText(value, max) {
  return cleanCell(value).slice(0, max).trim()
}

function toNumberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = parseCargoNumber(value)
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function sameQuantity(a, b) {
  const left = toNumberOrNull(a)
  const right = toNumberOrNull(b)
  if (left === null || right === null) return left === right
  return Math.abs(left - right) < QUANTITY_TOLERANCE_KG
}

function sameValue(field, a, b) {
  if (field === 'quantityKg' || field === 'packageWeightKg') return sameQuantity(a, b)
  return String(a ?? '').trim() === String(b ?? '').trim()
}

function roundKg(value) {
  return Math.round(value * 1000) / 1000
}

function nameKey(name, fallback) {
  return foldText(name) || fallback
}

// ---------- fontes ----------

// -> { candidates, fupInfo, context }.
// Candidate = { key, origin: 'match'|'fupOnly'|'processOnly', groupKey, purchaseOrderIndex, values, processQuantityKg }
//   match: item do processo ligado a uma linha do FUP (uma linha do relatório por linha do FUP); sem FUP utilizável,
//     cada item do processo vira `match` com `key = 'proc:<id>'` (valores só do processo);
//   fupOnly: linha do FUP sem item no processo; processOnly: item do processo sem linha no FUP.
// `reference` = saída de `loadErpProcessReference` (ou null). Chave de ligação = pedido (só CONSOLIDADO) + nome dobrado
// (a mesma expressão de `erpItemGroupKey`).
export function buildCargoSources(process, reference) {
  const isConsolidated = process?.category === 'CONSOLIDADO'
  const purchaseOrders = getCargoReportPurchaseOrders(process)
  const processReference = resolveCargoProcessReference(process)
  const hint = reference?.hint ?? null
  const fupItems = Array.isArray(hint?.shipment?.items) ? hint.shipment.items : []
  const hasFup = fupItems.length > 0
  const items = Array.isArray(process?.items) ? process.items : []

  const poIndexOf = (orderNumber) => {
    const key = cargoOrderKey(orderNumber)
    if (key === '') return -1
    return purchaseOrders.findIndex((order) => cargoOrderKey(order.po) === key)
  }
  const poTextOf = (orderNumber) =>
    isConsolidated ? resolveCargoPurchaseOrderReference(process, orderNumber) : processReference
  const groupKeyOf = (orderNumber, name, fallback) =>
    `${isConsolidated ? cargoOrderKey(orderNumber) : ''}|${nameKey(name, fallback)}`

  // Grupos do processo, na ordem em que aparecem.
  const processGroups = new Map()
  items.forEach((item, index) => {
    const groupKey = groupKeyOf(item?.poNumber, item?.commercialName, `#proc${index}`)
    if (!processGroups.has(groupKey)) processGroups.set(groupKey, { groupKey, items: [], sum: 0 })
    const group = processGroups.get(groupKey)
    group.items.push({ item, index })
    const quantity = Number(item?.quantity)
    group.sum += Number.isFinite(quantity) ? quantity : 0
  })

  // Linhas do FUP por grupo (a ordem do FUP vale dentro do grupo).
  const usedKeys = new Set()
  const fupGroups = new Map()
  fupItems.forEach((item, index) => {
    const groupKey = groupKeyOf(item.pedido, item.commercialName, `#fup${index}`)
    if (!fupGroups.has(groupKey)) fupGroups.set(groupKey, [])
    const list = fupGroups.get(groupKey)
    const position = list.length + 1
    let key = item.itemId
      ? `${KEY_FUP}${item.itemId}`
      : `${KEY_FUP}${groupKey.slice(0, CARGO_AUTOFILL_KEY_MAX - 12)}#${position}`
    if (usedKeys.has(key)) key = `${key.slice(0, CARGO_AUTOFILL_KEY_MAX - 8)}#${index + 1}`
    usedKeys.add(key)
    list.push({ item, key })
  })

  const candidates = []
  const fupOnly = []

  const fupCandidate = ({ item, key }, groupKey, processGroup) => ({
    key,
    origin: processGroup ? 'match' : 'fupOnly',
    groupKey,
    purchaseOrderIndex: poIndexOf(item.pedido),
    values: {
      po: clipText(poTextOf(item.pedido), TEXT_LIMITS.po),
      dbcorpCode: clipText(item.sqCode, TEXT_LIMITS.dbcorpCode),
      supplierDescription: clipText(item.supplierRef, TEXT_LIMITS.supplierDescription),
      sqDescription: clipText(
        processGroup ? processGroup.items[0].item.commercialName : item.commercialName,
        TEXT_LIMITS.sqDescription
      ),
      quantityKg: typeof item.quantityKg === 'number' && Number.isFinite(item.quantityKg) ? item.quantityKg : null,
    },
    processQuantityKg: processGroup ? roundKg(processGroup.sum) : null,
  })

  const processCandidate = ({ item, index }, origin) => {
    const quantity = Number(item?.quantity)
    return {
      key: `${KEY_PROCESS}${cleanCell(item?.id) || index}`.slice(0, CARGO_AUTOFILL_KEY_MAX),
      origin,
      groupKey: groupKeyOf(item?.poNumber, item?.commercialName, `#proc${index}`),
      purchaseOrderIndex: poIndexOf(item?.poNumber),
      values: {
        po: clipText(poTextOf(item?.poNumber), TEXT_LIMITS.po),
        dbcorpCode: '',
        supplierDescription: '',
        sqDescription: clipText(item?.commercialName, TEXT_LIMITS.sqDescription),
        quantityKg: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      },
      processQuantityKg: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    }
  }

  for (const [groupKey, group] of processGroups) {
    const lines = fupGroups.get(groupKey)
    if (hasFup && lines) {
      lines.forEach((line) => candidates.push(fupCandidate(line, groupKey, group)))
    } else {
      group.items.forEach((entry) => candidates.push(processCandidate(entry, hasFup ? 'processOnly' : 'match')))
    }
  }
  if (hasFup) {
    for (const [groupKey, lines] of fupGroups) {
      if (processGroups.has(groupKey)) continue
      lines.forEach((line) => fupOnly.push(fupCandidate(line, groupKey, null)))
    }
  }

  const noFupField = (item) => item.sqCode === '' && item.supplierRef === '' && item.itemId === ''
  return {
    candidates: [...candidates, ...fupOnly],
    fupInfo: {
      hasReference: Boolean(reference),
      hasFup,
      stale: Boolean(reference?.stale),
      snapshotId: hasFup ? String(hint.snapshotId ?? '') : '',
      updatedAtMs: typeof reference?.snapshot?.updatedAtMs === 'number' ? reference.snapshot.updatedAtMs : null,
      itemCount: fupItems.length,
      // Hint gravado antes da S9 (sem Cód. SQ, Ref. fornecedor e ItemPedCpId): o FUP precisa ser importado de novo.
      missingFields: hasFup && fupItems.every(noFupField),
    },
    context: { isConsolidated, purchaseOrders, processReference },
  }
}

// Fornecedor do processo (FCL/LCL/AÉREO): `supplierName` do processo; sem ele, o EXPORTADOR do FUP (vários
// exportadores diferentes: o 1º em ordem alfabética). -> { name, via: 'process'|'fup'|'', multiple }.
export function resolveCargoSupplierName(process, reference) {
  const fromProcess = cleanCell(process?.supplierName)
  if (fromProcess) return { name: fromProcess, via: 'process', multiple: false }
  const orders = Array.isArray(reference?.hint?.shipment?.orders) ? reference.hint.shipment.orders : []
  const exporters = [...new Set(orders.map((order) => cleanCell(order?.exporter)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  )
  if (exporters.length === 0) return { name: '', via: '', multiple: false }
  return { name: exporters[0], via: 'fup', multiple: exporters.length > 1 }
}

// ---------- marcas de origem ----------

function fieldSource(field, entry) {
  if (field === 'packageWeightKg') return 'C'
  if (field === 'po') return 'P'
  if (field === 'sqDescription') return entry?.fupOnly ? 'F' : 'P'
  if (field === 'quantityKg') return String(entry?.key ?? '').startsWith(KEY_PROCESS) ? 'P' : 'F'
  return 'F'
}

// Textos (title e nome acessível) das marcas de origem.
export const SOURCE_MARK_TITLES = {
  P: 'Veio do processo',
  F: 'Veio do FUP do DBCorp',
  C: 'Veio do cadastro de embalagens',
  E: 'Editado por você',
}

// Campos das linhas que o processo e o FUP preenchem (a tara entra com o cadastro de embalagens).
export const SOURCE_MARK_FIELDS = new Set([
  'po',
  'dbcorpCode',
  'supplierDescription',
  'sqDescription',
  'quantityKg',
  'packageWeightKg',
])

// Marca da célula: 'P' (processo), 'F' (FUP), 'C' (cadastro de embalagens) quando o valor ainda é o da base; 'E'
// quando foi editado; '' quando a célula não veio do processo nem do FUP.
export function cellOrigin(row, autofillRow, field) {
  if (!row || !autofillRow?.base || !Object.prototype.hasOwnProperty.call(autofillRow.base, field)) return ''
  return sameValue(field, row[field], autofillRow.base[field]) ? fieldSource(field, autofillRow) : 'E'
}

// ---------- montagem do relatório novo ----------

function valuesToRow(values, id = createCargoReportRowId()) {
  const row = createEmptyCargoReportRow(id)
  row.po = values.po ?? ''
  row.dbcorpCode = values.dbcorpCode ?? ''
  row.supplierDescription = values.supplierDescription ?? ''
  row.sqDescription = values.sqDescription ?? ''
  row.quantityKg = typeof values.quantityKg === 'number' ? values.quantityKg : null
  return row
}

function valuesToBase(values) {
  const base = {}
  for (const { field } of SOURCE_FIELDS) {
    const value = values[field]
    if (field === 'quantityKg' ? typeof value === 'number' : !isBlank(value)) base[field] = value
  }
  return base
}

function entryFromCandidate(candidate) {
  const entry = { key: candidate.key, base: valuesToBase(candidate.values) }
  if (candidate.origin === 'fupOnly') entry.fupOnly = true
  return entry
}

function candidateLabel(candidate) {
  return candidate.values.sqDescription || candidate.values.dbcorpCode || 'Item'
}

function describeCandidate(candidate) {
  const quantity = candidate.values.quantityKg
  const parts = [
    candidate.values.dbcorpCode,
    candidate.values.supplierDescription || candidate.values.sqDescription,
    typeof quantity === 'number' ? formatCargoKgText(quantity) : '',
  ].filter(Boolean)
  const where =
    candidate.origin === 'fupOnly'
      ? 'não existe no processo'
      : candidate.origin === 'processOnly'
        ? 'não existe no FUP'
        : 'não está no relatório'
  return [...parts, where].join(' · ')
}

// Item de prévia "só no FUP" / "só no processo": nada vem marcado e aplicar insere a linha.
function buildAddItem(candidate) {
  const fromProcess = candidate.origin === 'processOnly' || candidate.key.startsWith(KEY_PROCESS)
  return {
    id: `add|${candidate.key}`,
    kind: fromProcess ? CARGO_DIFF_KINDS.onlyProcess : CARGO_DIFF_KINDS.onlyFup,
    source: fromProcess ? 'P' : 'F',
    title: `${fromProcess ? 'Item só no processo' : 'Linha só no FUP'}: ${candidateLabel(candidate)}`,
    detail: describeCandidate(candidate),
    edited: false,
    defaultOn: false,
    applicable: true,
    rowIds: [],
    apply: { type: 'addRow', candidate },
  }
}

// -> { form, autofill, pending }. As linhas vêm dos itens `match`; `fupOnly` e `processOnly` ficam em `pending`
// (prévia, desmarcados) e não entram sozinhos. Consolidado: ordem do array = ordem da tela (por PO).
export function buildAutofilledCargoReport(process, sources) {
  const initial = buildInitialCargoReport(process)
  const candidates = sources?.candidates ?? []
  const filled = candidates.filter((candidate) => candidate.origin === 'match').slice(0, CARGO_REPORT_MAX_ROWS)
  const overflow = candidates.filter((candidate) => candidate.origin === 'match').slice(CARGO_REPORT_MAX_ROWS)

  const autofill = createEmptyCargoAutofill(sources?.fupInfo?.hasFup ? sources.fupInfo.snapshotId : '')
  const rows = filled.map((candidate) => {
    const row = valuesToRow(candidate.values)
    autofill.rows[row.id] = entryFromCandidate(candidate)
    return row
  })

  const purchaseOrders = sources?.context?.purchaseOrders ?? []
  const form = { ...initial, rows: orderCargoRowsByPurchaseOrder(rows, purchaseOrders), autofill }
  const pending = [
    ...candidates.filter((candidate) => candidate.origin !== 'match'),
    ...overflow,
  ].map(buildAddItem)
  return { form, autofill, pending }
}

// ---------- prévia do "Atualizar" ----------

// Chave de ligação de uma linha do relatório com um item da fonte (nome da Descrição SQ + PO do consolidado).
function rowGroupKey(row, context) {
  const name = foldText(row?.sqDescription)
  if (!name) return ''
  if (!context.isConsolidated) return `|${name}`
  const index = resolveCargoRowPurchaseOrder(row?.po, context.purchaseOrders)
  return index < 0 ? '' : `${cargoOrderKey(context.purchaseOrders[index].po)}|${name}`
}

function rowNumbers(form, rowIds) {
  const numbers = rowIds
    .map((id) => form.rows.findIndex((row) => row.id === id) + 1)
    .filter((number) => number > 0)
    .sort((a, b) => a - b)
  if (numbers.length === 0) return ''
  return numbers.length === 1 ? `Linha ${numbers[0]}` : `Linhas ${numbers.join(', ')}`
}

function formatValue(field, value) {
  if (field === 'quantityKg') return typeof value === 'number' ? formatCargoKgText(value) : '(vazio)'
  return isBlank(value) ? '(vazio)' : `“${String(value).trim()}”`
}

// -> 'edited' (valor diferente da base) | 'unknown' (origem não registrada) | ''.
function editState(row, entry, field, hasEntry) {
  if (!hasEntry) return 'unknown'
  const hasBase = Object.prototype.hasOwnProperty.call(entry.base ?? {}, field)
  if (hasBase) return sameValue(field, row[field], entry.base[field]) ? '' : 'edited'
  return isBlank(row[field]) ? '' : 'unknown'
}

function buildFieldItems(form, pair, sourceInfo) {
  const { candidate, rowIds } = pair
  const rows = rowIds.map((id) => form.rows.find((row) => row.id === id)).filter(Boolean)
  const items = []

  for (const spec of SOURCE_FIELDS) {
    const next = candidate.values[spec.field]
    if (spec.field === 'quantityKg' ? typeof next !== 'number' : isBlank(next)) continue
    const source = spec.field === 'quantityKg' ? fieldSource('quantityKg', { key: candidate.key }) : spec.source
    const origin = spec.field === 'sqDescription' && candidate.origin === 'fupOnly' ? 'F' : source
    const sourceName = origin === 'F' ? 'FUP' : 'processo'

    if (spec.field === 'quantityKg' && rows.length > 1) {
      const sum = roundKg(rows.reduce((total, row) => total + (toNumberOrNull(row.quantityKg) ?? 0), 0))
      if (!sameQuantity(sum, next)) {
        items.push({
          id: `${pair.id}|${spec.field}`,
          kind: spec.kind,
          source: origin,
          title: `${pair.label}: ${spec.label}`,
          detail: `A linha foi dividida em ${rows.length} lotes: ajuste à mão (soma ${formatCargoKgText(sum)} → ${formatCargoKgText(next)} do ${sourceName})`,
          edited: false,
          defaultOn: false,
          applicable: false,
          rowIds,
          apply: null,
        })
      }
      continue
    }

    const different = rows.filter((row) => !sameValue(spec.field, row[spec.field], next))
    if (different.length === 0) continue
    const states = different.map((row) => editState(row, sourceInfo.entryOf(row.id), spec.field, sourceInfo.hasEntry(row.id)))
    const edited = states.some(Boolean)
    const suffix = states.includes('unknown') ? CARGO_DIFF_SUFFIX.unknown : states.includes('edited') ? CARGO_DIFF_SUFFIX.edited : ''
    const first = different[0]
    const change =
      spec.field === 'quantityKg'
        ? `${formatValue(spec.field, toNumberOrNull(first.quantityKg))} → ${formatValue(spec.field, next)} (${sourceName})`
        : `${formatValue(spec.field, first[spec.field])} → ${formatValue(spec.field, next)}`
    const differentIds = different.map((row) => row.id)
    items.push({
      id: `${pair.id}|${spec.field}`,
      kind: spec.kind,
      source: origin,
      title: `${pair.label}: ${spec.label}`,
      detail: `${rowNumbers(form, differentIds)}: ${change}${suffix}`,
      edited,
      defaultOn: !edited,
      applicable: true,
      rowIds: differentIds,
      apply: { type: 'field', rowIds: differentIds, field: spec.field, value: next, key: candidate.key },
    })
  }
  return items
}

// Diferenças entre o relatório e a fonte atual (processo + FUP). -> DiffItem[]
//   DiffItem = { id, kind, source, title, detail, edited, defaultOn, applicable, rowIds, apply }
//   apply = { type: 'field', rowIds, field, value, key } | { type: 'addRow', candidate } | null (só informativo)
// Linha ligada pela `key` do autofill; sem `key` (relatório antigo) ou com `key` que não existe mais, pelo nome da
// Descrição SQ (e PO, no consolidado). Em relatório antigo toda diferença vem desmarcada ("origem não registrada").
export function diffCargoReportAgainstSources(form, autofill, sources) {
  const rows = Array.isArray(form?.rows) ? form.rows : []
  const candidates = Array.isArray(sources?.candidates) ? sources.candidates : []
  const context = sources?.context ?? { isConsolidated: false, purchaseOrders: [], processReference: '' }
  const hasFup = Boolean(sources?.fupInfo?.hasFup)
  const entries = autofill?.rows ?? {}
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))

  const claimed = new Map() // key -> rowIds
  const unclaimedRows = []
  const goneRows = []
  const keptFupGroups = new Set() // grupos de linhas do FUP mantidas como estão (sem FUP utilizável agora)
  for (const row of rows) {
    const entry = entries[row.id]
    const key = entry?.key ?? ''
    if (key && byKey.has(key)) {
      if (!claimed.has(key)) claimed.set(key, [])
      claimed.get(key).push(row.id)
    } else if (key.startsWith(KEY_FUP) && !hasFup) {
      // Sem FUP utilizável agora (não importado ou de outro snapshot): a linha do FUP fica como está e o item do
      // processo do mesmo grupo NÃO é proposto como linha nova (duplicaria a linha que já existe).
      const groupKey = rowGroupKey(row, context)
      if (groupKey) keptFupGroups.add(groupKey)
    } else if (!isCargoReportRowEmpty(row)) {
      unclaimedRows.push(row)
      if (key) goneRows.push(row)
    }
  }

  // Ligação por nome para o que a `key` não resolveu.
  const freeCandidates = candidates.filter((candidate) => !claimed.has(candidate.key))
  const heuristic = new Map() // candidate.key -> rowIds
  const pairedRowIds = new Set()
  const groups = new Map()
  for (const row of unclaimedRows) {
    const groupKey = rowGroupKey(row, context)
    if (!groupKey) continue
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(row)
  }
  const candidatesByGroup = new Map()
  for (const candidate of freeCandidates) {
    if (!candidatesByGroup.has(candidate.groupKey)) candidatesByGroup.set(candidate.groupKey, [])
    candidatesByGroup.get(candidate.groupKey).push(candidate)
  }
  for (const [groupKey, groupRows] of groups) {
    const list = candidatesByGroup.get(groupKey) ?? []
    if (list.length === 1) {
      heuristic.set(list[0].key, groupRows.map((row) => row.id))
      groupRows.forEach((row) => pairedRowIds.add(row.id))
    } else if (list.length > 1) {
      list.forEach((candidate, index) => {
        if (!groupRows[index]) return
        heuristic.set(candidate.key, [groupRows[index].id])
        pairedRowIds.add(groupRows[index].id)
      })
    }
  }

  const sourceInfo = {
    hasEntry: (id) => Boolean(entries[id]),
    entryOf: (id) => entries[id] ?? { key: '', base: {} },
  }
  const firstIndex = (rowIds) => Math.min(...rowIds.map((id) => rows.findIndex((row) => row.id === id)))
  const pairs = []
  for (const candidate of candidates) {
    const rowIds = claimed.get(candidate.key) ?? heuristic.get(candidate.key)
    if (!rowIds) continue
    const first = rows.find((row) => row.id === rowIds[0])
    pairs.push({
      id: candidate.key,
      candidate,
      rowIds,
      label: first?.sqDescription || first?.dbcorpCode || candidateLabel(candidate),
    })
  }
  pairs.sort((a, b) => firstIndex(a.rowIds) - firstIndex(b.rowIds))

  const items = pairs.flatMap((pair) => buildFieldItems(form, pair, sourceInfo))

  for (const candidate of freeCandidates) {
    if (heuristic.has(candidate.key)) continue
    if (!hasFup && keptFupGroups.has(candidate.groupKey)) continue
    // Sem FUP utilizável, `proc:` sem linha é item do processo que o usuário tirou do relatório.
    items.push(buildAddItem(candidate))
  }

  for (const row of goneRows) {
    if (pairedRowIds.has(row.id)) continue
    const key = entries[row.id]?.key ?? ''
    if (key.startsWith(KEY_FUP) && !hasFup) continue
    items.push({
      id: `gone|${row.id}`,
      kind: CARGO_DIFF_KINDS.gone,
      source: key.startsWith(KEY_PROCESS) ? 'P' : 'F',
      title: `${rowNumbers(form, [row.id])} sem correspondente: ${row.sqDescription || row.dbcorpCode || 'item'}`,
      detail: 'Este item não está mais no FUP nem no processo. Remova pelo ⋯ se for o caso.',
      edited: false,
      defaultOn: false,
      applicable: false,
      rowIds: [row.id],
      apply: null,
    })
  }
  return items
}

// Aplica só os itens marcados e `applicable`; atualiza a base do campo aplicado (a célula volta a ter a marca de
// origem). Atômico: passaria de 200 linhas -> { form, autofill, error: 'limit' } sem aplicar nada.
// `options`: { purchaseOrders } (reordena o consolidado), { snapshotId } (guarda o FUP usado).
export function applyCargoDiff(form, autofill, items, selectedIds, options = {}) {
  const selected = new Set(selectedIds ?? [])
  const chosen = (Array.isArray(items) ? items : []).filter((item) => item.applicable && selected.has(item.id) && item.apply)
  const additions = chosen.filter((item) => item.apply.type === 'addRow')
  if (form.rows.length + additions.length > CARGO_REPORT_MAX_ROWS) return { form, autofill, error: 'limit' }
  if (chosen.length === 0) return { form, autofill }

  let rows = form.rows.map((row) => ({ ...row }))
  const entries = { ...(autofill?.rows ?? {}) }

  for (const item of chosen) {
    const { apply } = item
    if (apply.type === 'field') {
      for (const rowId of apply.rowIds) {
        const row = rows.find((candidate) => candidate.id === rowId)
        if (!row) continue
        row[apply.field] = apply.value
        const current = entries[rowId] ?? { key: '', base: {} }
        entries[rowId] = { ...current, key: apply.key || current.key, base: { ...current.base, [apply.field]: apply.value } }
      }
    } else if (apply.type === 'addRow') {
      const row = valuesToRow(apply.candidate.values)
      rows.push(row)
      entries[row.id] = entryFromCandidate(apply.candidate)
    }
  }

  const purchaseOrders = options.purchaseOrders ?? []
  if (purchaseOrders.length > 0) rows = orderCargoRowsByPurchaseOrder(rows, purchaseOrders)
  const nextAutofill = {
    ...createEmptyCargoAutofill(options.snapshotId ?? autofill?.snapshotId ?? ''),
    rows: entries,
  }
  return { form: { ...form, rows, autofill: nextAutofill }, autofill: nextAutofill }
}

// ---------- aviso de quantidade divergente ----------

// { [rowId]: kg do processo } das linhas cujo grupo (PO + nome no consolidado; nome nos demais) soma mais ou menos
// do que o item no processo (diferença > 0,0005 kg). Grupo sem quantidade digitada não avisa.
export function quantityMismatchByRowId(form, process) {
  const result = {}
  const context = {
    isConsolidated: process?.category === 'CONSOLIDADO',
    purchaseOrders: getCargoReportPurchaseOrders(process),
  }
  const processByGroup = new Map()
  for (const item of Array.isArray(process?.items) ? process.items : []) {
    const groupKey = `${context.isConsolidated ? cargoOrderKey(item?.poNumber) : ''}|${foldText(item?.commercialName)}`
    if (groupKey.endsWith('|')) continue
    const quantity = Number(item?.quantity)
    processByGroup.set(groupKey, (processByGroup.get(groupKey) ?? 0) + (Number.isFinite(quantity) ? quantity : 0))
  }
  const groups = new Map()
  for (const row of Array.isArray(form?.rows) ? form.rows : []) {
    const groupKey = rowGroupKey(row, context)
    if (!groupKey || !processByGroup.has(groupKey)) continue
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(row)
  }
  for (const [groupKey, groupRows] of groups) {
    const quantities = groupRows.map((row) => toNumberOrNull(row.quantityKg))
    if (quantities.every((value) => value === null)) continue
    const sum = roundKg(quantities.reduce((total, value) => total + (value ?? 0), 0))
    const processKg = roundKg(processByGroup.get(groupKey))
    if (Math.abs(sum - processKg) <= QUANTITY_TOLERANCE_KG) continue
    for (const row of groupRows) result[row.id] = processKg
  }
  return result
}

// ---------- autofill acompanha as operações por linha (menu ⋯) ----------
// Funções puras sobre o mapa `autofill.rows`; devolvem um mapa NOVO.

function cloneEntry(entry) {
  const copy = { key: entry.key ?? '', base: { ...(entry.base ?? {}) } }
  if (entry.fupOnly) copy.fupOnly = true
  return copy
}

// Linha nova e vazia (inserir acima/abaixo): herda só a base do PO / PROCESSO da linha de referência.
export function autofillForBlankRow(entries, sourceRowId, newRowId) {
  const po = entries?.[sourceRowId]?.base?.po
  if (typeof po !== 'string') return { ...entries }
  return { ...entries, [newRowId]: { key: '', base: { po } } }
}

// Duplicar e dividir: a linha nova herda a chave e a base inteira; ao dividir a linha original sai do mapa.
export function autofillForCopies(entries, sourceRowId, newRowIds, { dropSource = false } = {}) {
  const next = { ...entries }
  const source = entries?.[sourceRowId]
  if (!source) return next
  for (const id of newRowIds) next[id] = cloneEntry(source)
  if (dropSource) delete next[sourceRowId]
  return next
}

// "Linha nesta PO" e mover para outra PO: o PO / PROCESSO vem do processo, então a base dele é o texto novo (marca P).
export function autofillForPurchaseOrder(entries, rowId, po) {
  const current = entries?.[rowId] ? cloneEntry(entries[rowId]) : { key: '', base: {} }
  current.base.po = po
  return { ...entries, [rowId]: current }
}

// Remover leva a entrada junto (para o "Desfazer" devolvê-la) e a tira do mapa.
export function takeAutofillEntry(entries, rowId) {
  const next = { ...entries }
  const entry = next[rowId] ?? null
  delete next[rowId]
  return { entries: next, entry }
}

export function restoreAutofillEntry(entries, rowId, entry) {
  return entry ? { ...entries, [rowId]: entry } : { ...entries }
}

// ---------- texto da nota do relatório novo ----------

// Nota depois de preencher um relatório novo (a frase "Relatório novo." vem da tela).
export function describeCargoAutofillNote({ fupInfo, readError } = {}) {
  if (readError) return 'Não foi possível ler o FUP; o relatório foi preenchido só com o processo.'
  if (fupInfo?.stale) {
    return 'O FUP deste processo está desatualizado (importação interrompida): importe o FUP de novo em Processos › Importar do DBCorp. O relatório foi preenchido só com o processo.'
  }
  if (!fupInfo?.hasFup) {
    return 'Sem FUP para este processo: Cód. DBCorp, Descrição Fornecedor e Qtd do FUP ficam vazios. Importe o FUP em Processos › Importar do DBCorp.'
  }
  if (fupInfo.missingFields) {
    return 'O Portal preencheu PO / PROCESSO, Descrição SQ e Qtd. FUP importado antes da atualização: importe o FUP de novo para trazer Cód. SQ e Ref. fornecedor.'
  }
  return 'O Portal já preencheu as linhas com o que ele sabe: PO / PROCESSO e Descrição SQ vêm do processo; Cód. DBCorp, Descrição Fornecedor e Qtd vêm do FUP importado. Falta só lote e conferência.'
}
