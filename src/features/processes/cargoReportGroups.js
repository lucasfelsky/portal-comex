import { formatCargoNumber, parseCargoNumber } from './cargoReportFormModel'
import { getProcessPurchaseOrders } from './purchaseOrders'

// S9-B do Relatório de Carga: agrupamento das linhas por PO no CONSOLIDADO. Módulo puro (sem React).
// A linha liga à PO pelo texto de `row.po`: a referência da PO (comparação sem acento/caixa) ou, em relatório
// antigo (PO / PROCESSO = número do pedido), pelo número da PO.

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Texto só de dígitos e separadores ("4500901", "4.500.901", "450-0901"): candidato a número de PO legado.
const NUMERIC_PO_PATTERN = /^[\d\s.\-/]+$/

function digitsOf(value) {
  return String(value ?? '').replace(/\D/g, '')
}

// -> índice da PO em `purchaseOrders` ou -1 (linha sem PO reconhecida).
export function resolveCargoRowPurchaseOrder(rowPo, purchaseOrders) {
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const text = fold(rowPo)
  if (!text) return -1

  const byReference = orders.findIndex((order) => fold(order?.reference) === text)
  if (byReference >= 0) return byReference

  const byNumber = orders.findIndex((order) => fold(order?.po) === text)
  if (byNumber >= 0) return byNumber

  if (NUMERIC_PO_PATTERN.test(String(rowPo ?? '').trim())) {
    const digits = digitsOf(rowPo)
    if (digits) return orders.findIndex((order) => digitsOf(order?.po) === digits)
  }
  return -1
}

function quantityOf(row) {
  const raw = row?.quantityKg
  const value = typeof raw === 'string' ? parseCargoNumber(raw) : raw
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

// -> [{ purchaseOrder | null, index, rows: [{ row, rowIndex }], totalKg }]
// POs na ordem do processo (inclusive a que não tem linha); o grupo `null` ("linhas sem PO") vem por último e só
// existe se houver linha sem PO reconhecida. `rowIndex` é a posição da linha em `rows`.
export function groupCargoRowsByPurchaseOrder(rows, purchaseOrders) {
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  const list = Array.isArray(rows) ? rows : []
  const groups = orders.map((purchaseOrder, index) => ({ purchaseOrder, index, rows: [], totalKg: 0 }))
  const orphans = { purchaseOrder: null, index: -1, rows: [], totalKg: 0 }

  list.forEach((row, rowIndex) => {
    const target = groups[resolveCargoRowPurchaseOrder(row?.po, orders)] ?? orphans
    target.rows.push({ row, rowIndex })
    target.totalKg += quantityOf(row)
  })

  const result = groups.map((group) => ({ ...group, totalKg: roundKg(group.totalKg) }))
  if (orphans.rows.length > 0) result.push({ ...orphans, totalKg: roundKg(orphans.totalKg) })
  return result
}

function roundKg(value) {
  return Math.round(value * 1000) / 1000
}

export const CARGO_ORPHAN_GROUP_LABEL = 'Linhas sem PO desta consolidada'

// "1.000 kg" (pt-BR, ate 3 casas) e "3 linhas" dos subtotais e totais do consolidado.
export function formatCargoKgText(value) {
  return `${formatCargoNumber(value, { maxDecimals: 3 }) || '0'} kg`
}

export function pluralCargoLines(count) {
  return `${count} ${count === 1 ? 'linha' : 'linhas'}`
}

// Soma da Qtd (kg) das linhas (texto inválido ou vazio conta 0).
export function sumCargoRowsKg(rows) {
  return roundKg((Array.isArray(rows) ? rows : []).reduce((total, row) => total + quantityOf(row), 0))
}

// Ordem do array = ordem da tela: linhas agrupadas pela ordem de `purchaseOrders`, as sem PO reconhecida por
// último, mantendo a ordem relativa dentro de cada grupo (estável). Sem POs devolve uma cópia na mesma ordem.
export function orderCargoRowsByPurchaseOrder(rows, purchaseOrders) {
  const list = Array.isArray(rows) ? rows : []
  const orders = Array.isArray(purchaseOrders) ? purchaseOrders : []
  if (orders.length === 0) return [...list]
  return groupCargoRowsByPurchaseOrder(list, orders).flatMap((group) => group.rows.map((entry) => entry.row))
}

// PO do consolidado a que o relatório pertence; vazio fora do CONSOLIDADO (ou sem POs cadastradas).
export function getCargoReportPurchaseOrders(process) {
  return getProcessPurchaseOrders(process)
}

// Aplica a ordem por PO ao formulário inteiro (só CONSOLIDADO com POs). Devolve o próprio `form` se nada mudou.
export function orderCargoFormByPurchaseOrder(form, process) {
  const orders = getCargoReportPurchaseOrders(process)
  if (!form || orders.length === 0) return form
  const ordered = orderCargoRowsByPurchaseOrder(form.rows, orders)
  const changed = ordered.some((row, index) => row !== form.rows[index])
  return changed ? { ...form, rows: ordered } : form
}
