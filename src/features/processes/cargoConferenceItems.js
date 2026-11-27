import { cargoRowPallets, hasCargoRowIssue } from './cargoConferenceIssues'
import { describeCargoRow, isCargoRowConferred } from './cargoConferenceModel'
import { getCargoRowUnits, isCargoRowUnitsDivergent, listCargoPartialPallets } from './cargoConferenceUnits'
import { normalizeItemCode } from './cargoReportCatalog'
import { computeLotSq } from './cargoReportFormModel'
import { CARGO_ORPHAN_GROUP_LABEL, groupCargoRowsByPurchaseOrder } from './cargoReportGroups'
import { purchaseOrderLabel } from './cargoReportRowOps'

// Conferência por item (Fatia A): módulo puro (sem React) que agrupa as linhas do relatório em ITENS dentro de cada
// grupo de PO. Só a leitura muda: nenhum dado novo, nenhuma chave nova na conferência.
//   - Chave do item (D-2): código DBCorp normalizado; sem código, a descrição SQ; sem as duas, a descrição do
//     fornecedor; sem nada, a linha é um item sozinho. Sempre DENTRO do grupo de PO (o mesmo código em 2 POs = 2 itens).
//   - Nome de referência do fornecedor (D-3): o `supplierDescription` do primeiro lote do item que o tenha; o lote
//     cujo nome (dobrado) é diferente do de referência ganha o selo "Nome diferente do fornecedor".
//   - Busca: nome SQ, nome do fornecedor, código e lote (do fornecedor e SQ, de qualquer lote do item), sem diferenciar
//     caixa, acento nem espaço repetido; casa por trecho (a pontuação do lote conta: "2231" acha "L-2231").

// Texto de comparação da busca: NFD sem diacrítico, minúsculas e espaços colapsados (mesma regra de
// `normalizeComparableText`, processStatus.js, mais o colapso de espaço).
export function foldCargoSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export const CARGO_SEARCH_BY_SUPPLIER = 'Achado pelo nome no fornecedor'
export const CARGO_SEARCH_BY_LOT = 'Achado pelo lote'
export const CARGO_NO_LOT_TITLE = 'Sem lote informado'

// "Lote L-2231" ou "Sem lote informado".
export function describeCargoLot(row) {
  const lot = String(row?.supplierLot ?? '').trim()
  return lot ? `Lote ${lot}` : CARGO_NO_LOT_TITLE
}

function itemIdentity(row) {
  const code = normalizeItemCode(row?.dbcorpCode)
  if (code) return `c:${code}`
  const sq = foldCargoSearchText(row?.sqDescription)
  if (sq) return `d:${sq}`
  const supplier = foldCargoSearchText(row?.supplierDescription)
  if (supplier) return `s:${supplier}`
  return `r:${row?.id}`
}

function buildItem(group, identity, entries) {
  // `lotSq`: o mesmo valor de `deriveCargoReportRow(...).lotSq` (mesma função), só para a busca pelo lote.
  const lots = entries.map(({ row, rowIndex }) => ({
    row,
    rowIndex,
    title: describeCargoLot(row),
    lotSq: computeLotSq(row?.supplierLot, row?.po),
    differentName: false,
  }))
  const reference = lots.map((lot) => String(lot.row.supplierDescription ?? '').trim()).find(Boolean) ?? ''
  const referenceFolded = foldCargoSearchText(reference)
  for (const lot of lots) {
    const own = foldCargoSearchText(lot.row.supplierDescription)
    lot.differentName = own !== '' && referenceFolded !== '' && own !== referenceFolded
  }
  const named = lots.map((lot) => String(lot.row.sqDescription ?? '').trim()).find(Boolean)
  const first = lots[0]
  return {
    key: `${group.id}~${identity}`,
    groupId: group.id,
    code: normalizeItemCode(first.row.dbcorpCode),
    name: named || describeCargoRow(first.row, first.rowIndex + 1),
    supplierName: reference,
    lots,
    rowIds: lots.map((lot) => lot.row.id),
  }
}

function buildGroupItems(group) {
  const order = []
  const byIdentity = new Map()
  for (const entry of group.entries) {
    const identity = itemIdentity(entry.row)
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, [])
      order.push(identity)
    }
    byIdentity.get(identity).push(entry)
  }
  return order.map((identity) => buildItem(group, identity, byIdentity.get(identity)))
}

// -> { grouped, groups: [{ id, label, supplier, purchaseOrder, items }], items (ordem da tela), itemByKey, keyByRowId,
// infoByRowId }. `infoByRowId` (Fatia B) = { name (nome SQ do item), lot (lote ou '') } de cada linha: os pallets parciais
// e a folha mostram "<nome> · <lote>" do outro lote.
// Com POs (consolidado) a ordem é a do processo e as linhas sem PO reconhecida vão no grupo final; sem POs, um grupo só.
export function buildCargoConferenceItems(rows, purchaseOrders) {
  const list = Array.isArray(rows) ? rows : []
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const grouped = orders.length > 0
  const rawGroups = grouped
    ? groupCargoRowsByPurchaseOrder(list, orders)
        .filter((group) => group.rows.length > 0)
        .map((group) => ({
          id: group.purchaseOrder ? `po${group.index}` : 'orphans',
          label: group.purchaseOrder ? purchaseOrderLabel(group.purchaseOrder) : CARGO_ORPHAN_GROUP_LABEL,
          supplier: group.purchaseOrder?.supplierName ?? '',
          purchaseOrder: group.purchaseOrder,
          entries: group.rows,
        }))
    : [{ id: 'all', label: '', supplier: '', purchaseOrder: null, entries: list.map((row, rowIndex) => ({ row, rowIndex })) }]

  const groups = rawGroups.map((group) => ({ ...group, items: buildGroupItems(group) }))
  const items = groups.flatMap((group) => group.items)
  const itemByKey = new Map(items.map((item) => [item.key, item]))
  const keyByRowId = new Map()
  const infoByRowId = new Map()
  for (const item of items) {
    for (const rowId of item.rowIds) keyByRowId.set(rowId, item.key)
    for (const lot of item.lots) infoByRowId.set(lot.row.id, { name: item.name, lot: String(lot.row.supplierLot ?? '').trim() })
  }
  return { grouped, groups, items, itemByKey, keyByRowId, infoByRowId }
}

// Progresso e selos de um item (lê a conferência): item conferido = todos os lotes conferidos. Fatia B: `pallets` =
// INTEIROS (`whole`, de `palletsByRowId`) + PARCIAIS (`partial`: um parcial dividido entre dois lotes do mesmo item conta
// 1) e `units` = unidades contadas x esperadas do item. `expectedUnits` = { [rowId]: Nº de emb. inteiro | null } (sem ele,
// nada é esperado); o lote sem esperado fica fora da soma do esperado e nunca é divergente (D-11).
export function summarizeCargoConferenceItem(item, conference, expectedUnits = null) {
  const total = item.lots.length
  const done = item.lots.filter((lot) => isCargoRowConferred(conference, lot.row.id)).length
  const whole = item.lots.reduce((sum, lot) => sum + (cargoRowPallets(conference, lot.row.id).count ?? 0), 0)
  const itemRowIds = new Set(item.rowIds)
  const partial = listCargoPartialPallets(conference).filter((entry) => entry.parts.some((part) => itemRowIds.has(part.rowId))).length
  const known = item.lots.filter((lot) => Number.isInteger(expectedUnits?.[lot.row.id]))
  return {
    total,
    done,
    full: total > 0 && done === total,
    percent: total > 0 ? Math.round((done * 100) / total) : 0,
    pallets: whole + partial,
    whole,
    partial,
    // Contados e esperados somam sobre o MESMO conjunto de lotes (os com Nº de emb. inteiro): nunca "150 de 100 unidades" sem
    // selo. Sem nenhum lote com esperado, só o contado de todos os lotes.
    units: {
      counted: (known.length > 0 ? known : item.lots).reduce((sum, lot) => sum + (getCargoRowUnits(conference, lot.row.id) ?? 0), 0),
      expected: known.length > 0 ? known.reduce((sum, lot) => sum + expectedUnits[lot.row.id], 0) : null,
    },
    unitsDivergent: item.lots.some((lot) =>
      isCargoRowUnitsDivergent(getCargoRowUnits(conference, lot.row.id), expectedUnits?.[lot.row.id])
    ),
    hasIssue: item.lots.some((lot) => hasCargoRowIssue(conference, lot.row.id)),
  }
}

// Trecho do lote (mesma dobra da busca). Texto vazio nunca casa: lote vazio ("Sem lote informado") não aparece por busca vazia.
function lotFieldMatches(value, folded) {
  return folded !== '' && foldCargoSearchText(value).includes(folded)
}

// Lotes do item que casam com a busca, na ordem do item: [{ rowId, label, sq }]. Um lote conta UMA vez: pelo lote do fornecedor
// (`supplierLot`) e, se este não casar, pelo lote SQ (`lotSq` = lote + 3 primeiras letras da PO, o da coluna "LOTE SQ").
export function matchCargoLots(item, query) {
  const folded = foldCargoSearchText(query)
  const found = []
  for (const lot of item.lots) {
    const supplierLot = String(lot.row.supplierLot ?? '').trim()
    if (lotFieldMatches(supplierLot, folded)) found.push({ rowId: lot.row.id, label: supplierLot, sq: false })
    else if (lotFieldMatches(lot.lotSq, folded)) found.push({ rowId: lot.row.id, label: lot.lotSq, sq: true })
  }
  return found
}

// "Achado pelo lote L-2231", "Achado pelo lote SQ L-2231DEM" e, com mais de um lote casando, o primeiro + "+N lotes".
function describeLotMatch(found) {
  const [first] = found
  const extra = found.length - 1
  const base = `${CARGO_SEARCH_BY_LOT}${first.sq ? ' SQ' : ''} ${first.label}`
  return extra > 0 ? `${base} +${extra} ${extra === 1 ? 'lote' : 'lotes'}` : base
}

// { ok, by }: `by` diz por que o item apareceu quando não foi pelo nome da SQ.
// Precedência do motivo: nome da SQ (sem motivo) > nome no fornecedor > código > lote.
export function matchCargoConferenceItem(item, query) {
  const folded = foldCargoSearchText(query)
  if (!folded) return { ok: true, by: '' }
  if (foldCargoSearchText(item.name).includes(folded)) return { ok: true, by: '' }
  if (item.lots.some((lot) => foldCargoSearchText(lot.row.supplierDescription).includes(folded))) {
    return { ok: true, by: CARGO_SEARCH_BY_SUPPLIER }
  }
  if (item.code && foldCargoSearchText(item.code).includes(folded)) return { ok: true, by: `Achado pelo código ${item.code}` }
  const lots = matchCargoLots(item, query)
  if (lots.length > 0) return { ok: true, by: describeLotMatch(lots) }
  return { ok: false, by: '' }
}

// Itens que o "Próximo item" percorre: os da busca (o filtro "Só pendentes" não entra).
export function listCargoSearchItems(items, query) {
  return items.filter((item) => matchCargoConferenceItem(item, query).ok)
}

// Posição do item na lista SEM filtro ("Item 2 de 4").
export function locateCargoItem(items, key) {
  const index = items.findIndex((item) => item.key === key)
  return { index: index + 1, total: items.length }
}
