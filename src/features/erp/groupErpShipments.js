// Conciliacao ERP (DBCorp) x Portal - F1. Agrupa as linhas do ERP (1 por item
// de pedido) em EMBARQUES. Le SO' os slots estruturados (`shipmentKind`,
// `consolidatedRef`...) - nunca o texto cru da REF. Unico import: `./erpText.js`.
import {
  cleanCell,
  digitsOnly,
  foldText,
  makeErpWarning,
  normalizeDocNumber,
  squashVessel,
} from './erpText.js'

// Vocabulario de STATUS do DBCorp (D-9) -> estagio. Os 4 estagios espelham os
// do Portal (0 pre-embarque, 1 embarcou, 2 atracado/liberacao, 3 concluido).
export const ERP_STATUS_STAGES = {
  'AG. PAGAMENTO (ANT)': 0,
  'AG. PRONT. DA CARGA': 0,
  'AG. EMBARQUE': 0,
  EMBARCOU: 1,
  'ATRAC. AG. LIBERAÇÃO': 2,
  CONCLUÍDO: 3,
}

const STAGE_BY_FOLDED_STATUS = new Map(
  Object.entries(ERP_STATUS_STAGES).map(([label, stage]) => [foldText(label), stage])
)
const CONCLUDED_STATUS = foldText('CONCLUÍDO')
const RECEIVED_TOTAL = foldText('Recebido Total')
const PORTAL_CATEGORY_BY_KIND = { CONSOLIDADO: 'CONSOLIDADO', FCL: 'FCL', LCL: 'LCL', AEREO: 'AEREO' }

function compareText(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== ''))].sort(compareText)
}

function pedidoSortKey(pedido) {
  const digits = digitsOnly(pedido)
  return digits === '' ? cleanCell(pedido) : digits.padStart(12, '0')
}

function getShipmentKey(row, kind) {
  if (kind === 'CONSOLIDADO' && row.consolidatedRef) return row.consolidatedRef
  const byPo = foldText(row.poRef)
  if (byPo) return byPo
  const pedido = digitsOnly(row.pedido)
  if (pedido) return `PEDIDO ${pedido}`
  return `LINHA ${row.rowNumber ?? row.itemId}`
}

// PO dividida: 'LAMBDA SEA 901-26.1' -> base 'LAMBDA SEA 901-26', parte '1'.
function splitPoRef(poRef) {
  const folded = foldText(poRef)
  const match = /^(.*\S)\.(\d{1,3})$/.exec(folded)
  return match ? { poBase: match[1], poPart: match[2] } : { poBase: '', poPart: '' }
}

// Valor unico (nao vazio, apos normalizacao) -> esse valor; mais de um ->
// '' + conflito com os valores crus. O valor "cru" escolhido numa mesma classe
// normalizada e' o menor (ordem de texto), para nao depender da ordem das linhas.
function resolveField(rows, pick) {
  const rawsByNorm = new Map()
  for (const row of rows) {
    const { norm, raw } = pick(row)
    if (norm === '') continue
    if (!rawsByNorm.has(norm)) rawsByNorm.set(norm, [])
    rawsByNorm.get(norm).push(raw)
  }
  const chosen = [...rawsByNorm.values()].map((raws) => [...raws].sort(compareText)[0])
  chosen.sort(compareText)
  if (chosen.length === 0) return { value: '', conflict: null }
  if (chosen.length === 1) return { value: chosen[0], conflict: null }
  return { value: '', conflict: chosen }
}

function buildTransport(rows) {
  const conflicts = []
  const field = (name, pick) => {
    const { value, conflict } = resolveField(rows, pick)
    if (conflict) conflicts.push({ field: name, values: conflict })
    return value
  }
  const place = (key) => (row) => ({ norm: foldText(row[key]), raw: cleanCell(row[key]) })
  const doc = (key) => (row) => ({ norm: normalizeDocNumber(row[key]), raw: cleanCell(row[key]) })
  const exact = (key) => (row) => ({ norm: row[key], raw: row[key] })

  const etd = field('etd', exact('etd'))
  const eta = field('eta', exact('eta'))
  const etaFinal = field('etaFinal', exact('etaFinal'))
  const blAwb = field('blAwb', doc('blAwb'))
  const tracking = field('tracking', doc('tracking'))
  const origin = field('origin', place('origin'))
  const destination = field('destination', place('destination'))
  const diNumber = field('diNumber', doc('diNumber'))
  const diDate = field('diDate', exact('diDate'))

  // Navio: compara pela forma "squash"; placeholders (AMOSTRA...) ja chegam
  // vazios e ficam de fora.
  const vesselRawOf = (row) => cleanCell(row.vesselRaw) || cleanCell(`${row.vesselName} ${row.voyage}`)
  const vesselResolved = resolveField(rows, (row) => ({
    norm: squashVessel(row.vesselName, row.voyage),
    raw: vesselRawOf(row),
  }))
  let vessel = { raw: '', name: '', voyage: '' }
  if (vesselResolved.conflict) {
    conflicts.push({ field: 'vessel', values: vesselResolved.conflict })
  } else if (vesselResolved.value !== '') {
    const chosenRow = rows
      .filter((row) => squashVessel(row.vesselName, row.voyage) !== '' && vesselRawOf(row) === vesselResolved.value)
      .sort((a, b) => compareText(a.vesselName, b.vesselName) || compareText(a.voyage, b.voyage))[0]
    vessel = { raw: vesselResolved.value, name: chosenRow.vesselName, voyage: chosenRow.voyage }
  }

  return {
    transport: { etd, eta, etaFinal, vessel, blAwb, tracking, origin, destination, diNumber, diDate },
    conflicts,
  }
}

// Incoterm e dica de origem do embarque (slots da REF). Fora do CONSOLIDADO,
// linhas do mesmo embarque com valores diferentes sao CONFLITO (como os campos de
// transporte): o slot fica vazio e o conflito vai para `conflicts`, em vez de
// escolher o primeiro valor em ordem de texto (que acenderia um aviso errado).
// No CONSOLIDADO cada PO pode ter o seu incoterm/origem e o nucleo nao compara o
// incoterm, entao la' vale o menor valor, como antes.
function resolveShipmentSlot(kind, rows, field, conflicts) {
  if (kind === 'CONSOLIDADO') return sortedUnique(rows.map((row) => row[field]))[0] ?? ''
  const { value, conflict } = resolveField(rows, (row) => ({ norm: foldText(row[field]), raw: cleanCell(row[field]) }))
  if (conflict) conflicts.push({ field, values: conflict })
  return value
}

function buildOrders(rows) {
  const byKey = new Map()
  for (const row of rows) {
    const pedido = cleanCell(row.pedido)
    const poRef = cleanCell(row.poRef)
    const key = `${digitsOnly(pedido) || pedido}|${foldText(poRef)}`
    if (!byKey.has(key)) byKey.set(key, { pedido, poRef, exporters: [] })
    const entry = byKey.get(key)
    // Menor valor cru de cada classe: independe da ordem das linhas.
    if (compareText(pedido, entry.pedido) < 0) entry.pedido = pedido
    if (compareText(poRef, entry.poRef) < 0) entry.poRef = poRef
    if (cleanCell(row.exporter) !== '') entry.exporters.push(cleanCell(row.exporter))
  }
  return [...byKey.values()]
    .map((entry) => ({
      pedido: entry.pedido,
      poRef: entry.poRef,
      ...splitPoRefFields(entry.poRef),
      exporter: [...entry.exporters].sort(compareText)[0] ?? '',
    }))
    .sort(
      (a, b) =>
        compareText(pedidoSortKey(a.pedido), pedidoSortKey(b.pedido)) ||
        compareText(foldText(a.poRef), foldText(b.poRef))
    )
}

function splitPoRefFields(poRef) {
  const { poBase, poPart } = splitPoRef(poRef)
  return { poBase, poPart }
}

function buildShipment(kind, key, rows, warnings) {
  const open = rows.filter((row) => foldText(row.status) !== CONCLUDED_STATUS)
  const active = open.length > 0
  const concludedByNf = active && open.every((row) => foldText(row.statusNf) === RECEIVED_TOTAL)

  // Estagio = menor estagio entre as linhas abertas; grupo todo concluido = 3.
  let stage = null
  if (!active) {
    stage = 3
  } else {
    const stages = open
      .map((row) => STAGE_BY_FOLDED_STATUS.get(foldText(row.status)))
      .filter((value) => value !== undefined)
    stage = stages.length > 0 ? Math.min(...stages) : null
  }

  const unknownStatuses = sortedUnique(
    rows
      .filter((row) => !STAGE_BY_FOLDED_STATUS.has(foldText(row.status)))
      .map((row) => cleanCell(row.status))
      .concat(rows.some((row) => cleanCell(row.status) === '') ? ['(vazio)'] : [])
  )
  for (const status of unknownStatuses) {
    const sample = rows.find(
      (row) => (cleanCell(row.status) || '(vazio)') === status
    )
    warnings.push(
      makeErpWarning(
        'status_desconhecido',
        `Embarque ${key}: STATUS "${status}" fora do vocabulário conhecido do DBCorp.`,
        { rowNumber: sample?.rowNumber ?? null, itemId: sample?.itemId ?? '', pedido: sample?.pedido ?? '', shipmentKey: key }
      )
    )
  }

  const { transport, conflicts } = buildTransport(rows)
  const incoterm = resolveShipmentSlot(kind, rows, 'incoterm', conflicts)
  const originHint = resolveShipmentSlot(kind, rows, 'originHint', conflicts)
  for (const conflict of conflicts) {
    warnings.push(
      makeErpWarning(
        'conflito_no_grupo',
        `Embarque ${key}: ${conflict.field} com valores diferentes nas linhas (${conflict.values.join(' | ')}).`,
        { shipmentKey: key }
      )
    )
  }

  const orders = buildOrders(rows)

  for (const poRef of sortedUnique(orders.map((order) => order.poRef))) {
    const { poBase } = splitPoRef(poRef)
    if (poBase === '') continue
    warnings.push(
      makeErpWarning('po_dividida', `PO dividida: ${poRef} (base ${poBase}).`, {
        shipmentKey: key,
        pedido: orders.find((order) => order.poRef === poRef)?.pedido ?? '',
      })
    )
  }

  if (kind === 'CONSOLIDADO') {
    const pedidos = new Set(orders.map((order) => digitsOnly(order.pedido) || order.pedido))
    if (pedidos.size === 1) {
      warnings.push(
        makeErpWarning(
          'consolidado_com_1_po',
          `Consolidado ${key} com apenas 1 PO (o Portal avisa "POs consolidadas (mín. 2)"; é aviso, nunca bloqueio).`,
          { shipmentKey: key, pedido: orders[0]?.pedido ?? '' }
        )
      )
    }
  }

  const items = rows
    .map((row) => ({
      itemId: row.itemId,
      pedido: cleanCell(row.pedido),
      poRef: cleanCell(row.poRef),
      commercialName: row.commercialName,
      quantityKg: row.quantityKg,
      sqCode: row.sqCode,
      ncm: row.ncm,
    }))
    .sort(
      (a, b) =>
        compareText(pedidoSortKey(a.pedido), pedidoSortKey(b.pedido)) ||
        compareText(foldText(a.commercialName), foldText(b.commercialName)) ||
        compareText(a.itemId, b.itemId)
    )

  const nfDates = sortedUnique(rows.map((row) => row.nfDate))

  return {
    key,
    kind,
    portalCategory: PORTAL_CATEGORY_BY_KIND[kind] ?? null,
    incoterm,
    originHint,
    statuses: sortedUnique(rows.map((row) => cleanCell(row.status))),
    statusNf: sortedUnique(rows.map((row) => cleanCell(row.statusNf))),
    stage,
    active,
    concludedByNf,
    nfDate: nfDates.length > 0 ? nfDates[nfDates.length - 1] : '',
    orders,
    items,
    transport,
    conflicts,
    rowNumbers: rows
      .map((row) => row.rowNumber)
      .filter((value) => value !== null)
      .sort((a, b) => a - b),
  }
}

// Avisos globais (entre embarques): PEDIDO em varias POs e PO com varios PEDIDOs.
function buildCrossWarnings(rows) {
  const warnings = []
  const posByPedido = new Map()
  const pedidosByPo = new Map()
  for (const row of rows) {
    const pedido = digitsOnly(row.pedido) || cleanCell(row.pedido)
    const poRef = foldText(row.poRef)
    if (pedido === '' || poRef === '') continue
    const base = splitPoRef(poRef).poBase || poRef
    if (!posByPedido.has(pedido)) posByPedido.set(pedido, new Set())
    posByPedido.get(pedido).add(base)
    if (!pedidosByPo.has(poRef)) pedidosByPo.set(poRef, new Set())
    pedidosByPo.get(poRef).add(pedido)
  }
  for (const [pedido, pos] of posByPedido) {
    if (pos.size > 1) {
      warnings.push(
        makeErpWarning(
          'pedido_com_varias_pos',
          `PEDIDO ${pedido} aparece em várias POs: ${[...pos].sort(compareText).join(', ')}.`,
          { pedido }
        )
      )
    }
  }
  for (const [poRef, pedidos] of pedidosByPo) {
    if (pedidos.size > 1) {
      const sorted = [...pedidos].sort(compareText)
      warnings.push(
        makeErpWarning(
          'po_com_varios_pedidos',
          `A PO ${poRef} tem vários PEDIDOs: ${sorted.join(', ')}.`,
          { pedido: sorted[0] }
        )
      )
    }
  }
  return warnings
}

// Coluna STATUS com mais de 50% das linhas vazias ou fora do vocabulario do
// DBCorp (a partir de 5 linhas): o formato mudou, nao adianta conciliar.
const STATUS_BLOCKING_MIN_ROWS = 5

function detectStatusBlocking(list) {
  if (list.length < STATUS_BLOCKING_MIN_ROWS) return null
  const unrecognized = list.filter((row) => !STAGE_BY_FOLDED_STATUS.has(foldText(row.status))).length
  if (unrecognized * 2 <= list.length) return null
  return {
    code: 'coluna_status_irreconhecivel',
    column: 'STATUS',
    message: `A coluna STATUS tem ${unrecognized} de ${list.length} linhas vazias ou fora do vocabulário do DBCorp. Exporte o .xlsx do DBCorp com a coluna STATUS preenchida.`,
  }
}

// -> { shipments: ErpShipment[], warnings, blocking }
//   blocking: null | { code: 'coluna_status_irreconhecivel', column, message }
export function groupErpShipments(rows) {
  const list = Array.isArray(rows) ? rows : []
  const warnings = buildCrossWarnings(list)
  const groups = new Map()

  for (const row of list) {
    const kind = row.shipmentKind || 'INDEFINIDO'
    const key = getShipmentKey(row, kind)
    const id = `${kind}|${key}`
    if (!groups.has(id)) groups.set(id, { kind, key, rows: [] })
    groups.get(id).rows.push(row)
  }

  const shipments = [...groups.values()]
    .sort((a, b) => compareText(`${a.kind}|${a.key}`, `${b.kind}|${b.key}`))
    .map((group) => buildShipment(group.kind, group.key, group.rows, warnings))

  return { shipments, warnings, blocking: detectStatusBlocking(list) }
}
