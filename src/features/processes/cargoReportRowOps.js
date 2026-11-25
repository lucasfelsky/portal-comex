import {
  CARGO_REPORT_MAX_ROWS,
  createCargoReportRowId,
  createEmptyCargoReportRow,
  parseCargoNumber,
} from './cargoReportFormModel'
import { resolveCargoRowPurchaseOrder } from './cargoReportGroups'

// S9-B do Relatório de Carga: operações por linha (inserir, duplicar, dividir em lotes, mover, remover,
// desfazer, mover de PO). Módulo puro, sem React: toda função devolve um array NOVO e nunca muta a entrada;
// linhas novas ganham id novo (`createCargoReportRowId`) e o teto de `CARGO_REPORT_MAX_ROWS` é respeitado.

export const CARGO_SPLIT_MIN_LOTS = 2
export const CARGO_SPLIT_MAX_LOTS = 10
// Tolerância da soma dos lotes contra a quantidade da linha (kg).
export const CARGO_SPLIT_SUM_TOLERANCE_KG = 0.0005

function indexOfRow(rows, rowId) {
  return rows.findIndex((row) => row.id === rowId)
}

function roundKg(value) {
  return Math.round(value * 1000) / 1000
}

// Quantidade da linha como número (a edição guarda texto): `null` se vazia ou inválida.
export function readCargoRowQuantity(row) {
  const value = parseCargoNumber(row?.quantityKg)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Linha nova e vazia que herda só o PO / PROCESSO da linha de referência.
function blankLike(row) {
  const blank = createEmptyCargoReportRow(createCargoReportRowId())
  blank.po = row?.po ?? ''
  return blank
}

// Inserir acima/abaixo: linha vazia que herda só o `po` da linha de referência.
export function insertCargoRow(rows, rowId, where) {
  const index = indexOfRow(rows, rowId)
  if (index < 0) return { rows: [...rows], error: 'invalid' }
  if (rows.length >= CARGO_REPORT_MAX_ROWS) return { rows: [...rows], error: 'limit' }
  const inserted = blankLike(rows[index])
  const next = [...rows]
  next.splice(where === 'above' ? index : index + 1, 0, inserted)
  return { rows: next, insertedId: inserted.id }
}

// Duplicar (outro lote): cópia logo abaixo, sem o lote do fornecedor e sem os valores congelados.
export function duplicateCargoRow(rows, rowId) {
  const index = indexOfRow(rows, rowId)
  if (index < 0) return { rows: [...rows], error: 'invalid' }
  if (rows.length >= CARGO_REPORT_MAX_ROWS) return { rows: [...rows], error: 'limit' }
  const copy = {
    ...rows[index],
    id: createCargoReportRowId(),
    supplierLot: '',
    frozenNetWeightKg: null,
    frozenPackages: null,
  }
  const next = [...rows]
  next.splice(index + 1, 0, copy)
  return { rows: next, insertedId: copy.id }
}

// Sugestão de divisão: base = floor(total / n / 10) * 10 e o resto no último lote (1000 em 3 = 330/330/340).
// Total pequeno demais para blocos de 10 kg usa a divisão inteira; a soma sempre fecha no total.
export function suggestCargoSplit(totalKg, count) {
  const total = Number(totalKg)
  const lots = Math.max(1, Math.floor(Number(count)) || 1)
  if (!Number.isFinite(total) || total <= 0) {
    return Array.from({ length: lots }, () => ({ supplierLot: '', quantityKg: 0 }))
  }
  let base = Math.floor(total / lots / 10) * 10
  if (base <= 0) base = Math.floor(total / lots)
  if (base <= 0) base = roundKg(total / lots)
  const last = roundKg(total - base * (lots - 1))
  return Array.from({ length: lots }, (_, index) => ({
    supplierLot: '',
    quantityKg: index === lots - 1 ? last : base,
  }))
}

// Dividir em lotes: troca a linha por 2 a 10 linhas (mesmas descrições/PO/código/peso da emb.), cada uma com o
// seu lote e a sua quantidade. A soma das quantidades tem que fechar com a da linha (tolerância 0,0005 kg).
// Erros (nada muda): 'count' (fora de 2..10), 'invalid' (linha sem quantidade ou lote com quantidade <= 0 ou
// inválida), 'sum' (soma diferente), 'limit' (passaria de 200 linhas).
export function splitCargoRow(rows, rowId, lots) {
  const index = indexOfRow(rows, rowId)
  if (index < 0) return { rows: [...rows], error: 'invalid' }
  const list = Array.isArray(lots) ? lots : []
  if (list.length < CARGO_SPLIT_MIN_LOTS || list.length > CARGO_SPLIT_MAX_LOTS) {
    return { rows: [...rows], error: 'count' }
  }

  const total = readCargoRowQuantity(rows[index])
  const quantities = list.map((lot) => {
    const value = parseCargoNumber(lot?.quantityKg)
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
  })
  if (total === null || total <= 0 || quantities.some((value) => value === null)) {
    return { rows: [...rows], error: 'invalid' }
  }

  const sum = quantities.reduce((acc, value) => acc + value, 0)
  if (Math.abs(sum - total) >= CARGO_SPLIT_SUM_TOLERANCE_KG) return { rows: [...rows], error: 'sum' }
  if (rows.length - 1 + list.length > CARGO_REPORT_MAX_ROWS) return { rows: [...rows], error: 'limit' }

  const created = list.map((lot, position) => ({
    ...rows[index],
    id: createCargoReportRowId(),
    supplierLot: String(lot?.supplierLot ?? '').trim(),
    quantityKg: quantities[position],
    frozenNetWeightKg: null,
    frozenPackages: null,
  }))
  const next = [...rows]
  next.splice(index, 1, ...created)
  return { rows: next, insertedIds: created.map((row) => row.id) }
}

// Mover ±1. Com `groupOf` (consolidado) só troca com o vizinho do mesmo grupo; nas pontas é no-op.
export function moveCargoRow(rows, rowId, delta, groupOf) {
  const index = indexOfRow(rows, rowId)
  const target = index + delta
  if (index < 0 || (delta !== -1 && delta !== 1) || target < 0 || target >= rows.length) return [...rows]
  if (typeof groupOf === 'function' && groupOf(rows[target]) !== groupOf(rows[index])) return [...rows]
  const next = [...rows]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// Remover: devolve também a linha removida e o índice, para o "Desfazer".
export function removeCargoRow(rows, rowId) {
  const index = indexOfRow(rows, rowId)
  if (index < 0) return { rows: [...rows], removed: null }
  const next = [...rows]
  const [row] = next.splice(index, 1)
  return { rows: next, removed: { row, index } }
}

// Desfazer: reinsere no índice de origem (limitado ao tamanho atual). Não duplica se o id já existe e não passa
// do teto de linhas.
export function restoreCargoRow(rows, removed) {
  if (!removed?.row || indexOfRow(rows, removed.row.id) >= 0 || rows.length >= CARGO_REPORT_MAX_ROWS) {
    return [...rows]
  }
  const next = [...rows]
  const index = Math.max(0, Math.min(Number(removed.index) || 0, next.length))
  next.splice(index, 0, removed.row)
  return next
}

// Texto que vai em PO / PROCESSO quando a linha pertence a uma PO do consolidado.
export function purchaseOrderLabel(purchaseOrder) {
  return String(purchaseOrder?.reference ?? '').trim() || String(purchaseOrder?.po ?? '').trim()
}

// Posição de inserção no fim do grupo da PO de destino. Sem linha nela, entra depois da última linha de uma PO
// anterior (ou no começo); linhas sem PO reconhecida contam como o último grupo.
function endOfPurchaseOrderGroup(rows, destinationIndex, purchaseOrders) {
  let position = 0
  rows.forEach((row, index) => {
    const group = resolveCargoRowPurchaseOrder(row.po, purchaseOrders)
    const rank = group < 0 ? Number.POSITIVE_INFINITY : group
    if (rank <= destinationIndex) position = index + 1
  })
  return position
}

function indexOfPurchaseOrder(purchaseOrder, purchaseOrders) {
  const number = String(purchaseOrder?.po ?? '').trim()
  return purchaseOrders.findIndex((order) => String(order?.po ?? '').trim() === number)
}

// Mover para outra PO: troca o `po` pela referência (ou pelo número, se a PO não tem referência) e reposiciona a
// linha no fim do grupo de destino. Mesma PO ou PO desconhecida = no-op.
export function moveCargoRowToPurchaseOrder(rows, rowId, purchaseOrder, purchaseOrders) {
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const index = indexOfRow(rows, rowId)
  const destination = indexOfPurchaseOrder(purchaseOrder, orders)
  if (index < 0 || destination < 0) return [...rows]
  if (resolveCargoRowPurchaseOrder(rows[index].po, orders) === destination) return [...rows]

  const moved = { ...rows[index], po: purchaseOrderLabel(orders[destination]) }
  const rest = rows.filter((row) => row.id !== rowId)
  rest.splice(endOfPurchaseOrderGroup(rest, destination, orders), 0, moved)
  return rest
}

// "+ Linha nesta PO": linha vazia no fim do grupo da PO, já com o PO / PROCESSO dela.
export function insertCargoRowInPurchaseOrder(rows, purchaseOrder, purchaseOrders) {
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const destination = indexOfPurchaseOrder(purchaseOrder, orders)
  if (destination < 0) return { rows: [...rows], error: 'invalid' }
  if (rows.length >= CARGO_REPORT_MAX_ROWS) return { rows: [...rows], error: 'limit' }
  const inserted = createEmptyCargoReportRow(createCargoReportRowId())
  inserted.po = purchaseOrderLabel(orders[destination])
  const next = [...rows]
  next.splice(endOfPurchaseOrderGroup(rows, destination, orders), 0, inserted)
  return { rows: next, insertedId: inserted.id }
}
