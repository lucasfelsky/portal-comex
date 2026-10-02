// Conciliacao ERP (DBCorp) x Portal - F1. PONTO UNICO de normalizacao: toda
// fonte (planilha .xlsx hoje, API na F5) entrega `looseRows` (chaves canonicas,
// valores crus) e passa por aqui antes de qualquer agrupamento ou casamento.
// Unico import: `./erpText.js`.
import {
  cleanCell,
  foldText,
  makeErpWarning,
  parseErpDate,
  parseQuantityKg,
  parseRate,
  parseRefEmbarque,
  parseVessel,
} from './erpText.js'

// 29 chaves canonicas (ordem da planilha) + origem/linha + 6 slots estruturados.
const CANONICAL_TEXT_KEYS = [
  'status', 'exporter', 'pedido', 'poRef', 'refEmbarque', 'readinessText', 'sqCode',
  'supplierRef', 'commercialName', 'ncm', 'invoice', 'blAwb', 'tracking', 'origin',
  'destination', 'vesselRaw', 'diNumber', 'nfNumbers', 'statusNf', 'itemId',
]
const DATE_KEYS = ['poDate', 'etd', 'eta', 'etaFinal', 'diDate', 'nfDate']
const NUMBER_KEYS = ['quantityKg', 'ipiRate', 'iiRate']
const SLOT_KEYS = ['shipmentKind', 'consolidatedRef', 'incoterm', 'originHint', 'vesselName', 'voyage']

export const ERP_ITEM_ROW_KEYS = [
  'source',
  'rowNumber',
  'itemId',
  ...CANONICAL_TEXT_KEYS.filter((key) => key !== 'itemId'),
  ...DATE_KEYS,
  ...NUMBER_KEYS,
  ...SLOT_KEYS,
]

const DATE_COLUMN_LABELS = {
  poDate: 'DATA PO',
  etd: 'ETD (EMBARQUE)',
  eta: 'ETA (CHEGADA)',
  etaFinal: 'ETA FINAL',
  diDate: 'DATA EMISSÃO (DI)',
  nfDate: "DATA EMISSÃO (NF'S)",
}

// Colunas de data obrigatorias vigiadas pelo bloqueio "irreconhecivel".
const BLOCKING_DATE_KEYS = ['etd', 'eta', 'diDate']
const BLOCKING_MIN_FILLED = 5

const DATE_WARNING_TEXT = {
  data_invalida: 'data inválida',
  data_fora_do_intervalo: 'data fora do intervalo (2000 a 2099)',
  data_com_hora: 'data com hora (a hora foi descartada)',
  data_com_fuso: 'data com fuso horário (não interpretada)',
}

function describeRow(rowNumber, itemId) {
  if (rowNumber !== null) return `linha ${rowNumber}`
  if (itemId) return `item ${itemId}`
  return 'linha sem número'
}

function normalizeCarrierPrefix(row) {
  // `FEDEX:`/`DHL:` na coluna BL / AWB e' rastreio de courier, nao documento.
  if (/^(FEDEX|DHL)\s*:/i.test(row.blAwb)) {
    if (row.tracking === '') row.tracking = row.blAwb
    row.blAwb = ''
  }
}

function pickRefSlots(loose, row, rowRef, warnings) {
  if (cleanCell(loose.shipmentKind) !== '') {
    // Fonte que ja manda os slots (API): nao sobrescreve.
    row.shipmentKind = foldText(loose.shipmentKind)
    row.consolidatedRef = cleanCell(loose.consolidatedRef)
    row.incoterm = foldText(loose.incoterm)
    row.originHint = foldText(loose.originHint)
    return
  }
  const parsed = parseRefEmbarque(row.refEmbarque, row.poRef)
  row.shipmentKind = parsed.shipmentKind
  row.consolidatedRef = parsed.consolidatedRef
  row.incoterm = parsed.incoterm
  row.originHint = parsed.originHint
  if (parsed.warning === 'aereo_inferido') {
    warnings.push(
      makeErpWarning(
        'aereo_inferido',
        `${describeRow(row.rowNumber, row.itemId)}: embarque tratado como aéreo pela REF/PO (hipótese D-9b).`,
        rowRef
      )
    )
  } else if (parsed.warning === 'ref_desconhecida') {
    warnings.push(
      makeErpWarning(
        'ref_desconhecida',
        `${describeRow(row.rowNumber, row.itemId)}: REF. EMBARQUE não reconhecida; embarque classificado como indefinido.`,
        rowRef
      )
    )
  }
}

function pickVesselSlots(loose, row) {
  if (cleanCell(loose.vesselName) !== '' || cleanCell(loose.voyage) !== '') {
    row.vesselName = cleanCell(loose.vesselName)
    row.voyage = cleanCell(loose.voyage)
    return
  }
  const parsed = parseVessel(row.vesselRaw)
  row.vesselName = parsed.name
  row.voyage = parsed.voyage
}

function buildRow(loose, source, warnings, invalidDateKeys) {
  const row = {}
  row.source = typeof source === 'string' ? source : ''
  row.rowNumber = Number.isInteger(loose.rowNumber) ? loose.rowNumber : null
  for (const key of CANONICAL_TEXT_KEYS) row[key] = cleanCell(loose[key])

  const rowRef = { rowNumber: row.rowNumber, itemId: row.itemId, pedido: row.pedido }

  for (const key of DATE_KEYS) {
    const { date, warning } = parseErpDate(loose[key])
    row[key] = date
    if (warning) {
      if (date === '') invalidDateKeys.add(key)
      const raw = cleanCell(loose[key])
      warnings.push(
        makeErpWarning(
          warning,
          `${describeRow(row.rowNumber, row.itemId)}: ${DATE_COLUMN_LABELS[key]} com ${DATE_WARNING_TEXT[warning] ?? warning}${raw ? ` ("${raw}")` : ''}.`,
          rowRef
        )
      )
    }
  }

  const quantity = parseQuantityKg(loose.quantityKg)
  row.quantityKg = quantity.value
  if (quantity.warning) {
    warnings.push(
      makeErpWarning(
        quantity.warning,
        `${describeRow(row.rowNumber, row.itemId)}: QTD - KGS vazia ou inválida; a linha fica fora da soma de quantidades.`,
        rowRef
      )
    )
  }
  row.ipiRate = parseRate(loose.ipiRate)
  row.iiRate = parseRate(loose.iiRate)

  normalizeCarrierPrefix(row)
  pickRefSlots(loose, row, rowRef, warnings)
  pickVesselSlots(loose, row)

  // Ordem estavel das chaves = ERP_ITEM_ROW_KEYS.
  const ordered = {}
  for (const key of ERP_ITEM_ROW_KEYS) ordered[key] = row[key]
  return ordered
}

// -> { rows: ErpItemRow[], warnings, blocking }
//   blocking: null | { code: 'coluna_data_irreconhecivel', column, message }
export function normalizeErpItemRows(looseRows, { source = '' } = {}) {
  const warnings = []
  const built = []

  for (const loose of Array.isArray(looseRows) ? looseRows : []) {
    if (!loose || typeof loose !== 'object') continue
    const invalidDateKeys = new Set()
    const row = buildRow(loose, source, warnings, invalidDateKeys)
    built.push({ row, invalidDateKeys })
  }

  // itemId duplicado: mantem a 1a linha; itemId vazio: so' avisa.
  const kept = []
  const firstById = new Map()
  const discardedById = new Map()
  for (const entry of built) {
    const { row } = entry
    if (row.itemId === '') {
      warnings.push(
        makeErpWarning(
          'item_id_vazio',
          `${describeRow(row.rowNumber, row.itemId)}: ItemPedCpId vazio; a linha não pode ser deduplicada.`,
          { rowNumber: row.rowNumber, pedido: row.pedido }
        )
      )
      kept.push(entry)
      continue
    }
    if (firstById.has(row.itemId)) {
      if (!discardedById.has(row.itemId)) discardedById.set(row.itemId, [])
      discardedById.get(row.itemId).push(row.rowNumber)
      continue
    }
    firstById.set(row.itemId, row)
    kept.push(entry)
  }
  for (const [itemId, discardedRows] of discardedById) {
    const keptRow = firstById.get(itemId)
    const listed = discardedRows.filter((value) => value !== null)
    warnings.push(
      makeErpWarning(
        'item_id_duplicado',
        `ItemPedCpId ${itemId} repetido: mantida a ${describeRow(keptRow.rowNumber, itemId)}; descartadas ${
          listed.length > 0 ? `as linhas ${listed.join(', ')}` : `${discardedRows.length} linha(s) sem número`
        }.`,
        { rowNumber: keptRow.rowNumber, itemId, pedido: keptRow.pedido }
      )
    )
  }

  // Coluna de data obrigatoria com mais de 50% de celulas invalidas: o
  // formato da planilha mudou, nao adianta conciliar.
  let blocking = null
  for (const key of BLOCKING_DATE_KEYS) {
    let filled = 0
    let invalid = 0
    for (const { row, invalidDateKeys } of kept) {
      const wasFilled = row[key] !== '' || invalidDateKeys.has(key)
      if (!wasFilled) continue
      filled += 1
      if (invalidDateKeys.has(key)) invalid += 1
    }
    if (filled >= BLOCKING_MIN_FILLED && invalid * 2 > filled) {
      blocking = {
        code: 'coluna_data_irreconhecivel',
        column: DATE_COLUMN_LABELS[key],
        message: `A coluna ${DATE_COLUMN_LABELS[key]} tem ${invalid} de ${filled} datas em formato irreconhecível. Exporte o .xlsx do DBCorp com a coluna em formato de data.`,
      }
      break
    }
  }

  return { rows: kept.map((entry) => entry.row), warnings, blocking }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Erros de forma (chaves conhecidas e tipos). Lista vazia = linha valida.
export function validateErpItemRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return ['a linha precisa ser um objeto']
  const errors = []
  for (const key of Object.keys(row)) {
    if (!ERP_ITEM_ROW_KEYS.includes(key)) errors.push(`chave desconhecida: ${key}`)
  }
  for (const key of ERP_ITEM_ROW_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      errors.push(`chave ausente: ${key}`)
      continue
    }
    const value = row[key]
    if (key === 'rowNumber') {
      if (value !== null && !Number.isInteger(value)) errors.push('rowNumber deve ser inteiro ou null')
    } else if (DATE_KEYS.includes(key)) {
      if (typeof value !== 'string' || (value !== '' && !DATE_PATTERN.test(value))) {
        errors.push(`${key} deve ser YYYY-MM-DD ou vazio`)
      }
    } else if (NUMBER_KEYS.includes(key)) {
      if (value !== null && !(typeof value === 'number' && Number.isFinite(value))) {
        errors.push(`${key} deve ser número ou null`)
      }
    } else if (typeof value !== 'string') {
      errors.push(`${key} deve ser texto`)
    }
  }
  return errors
}
