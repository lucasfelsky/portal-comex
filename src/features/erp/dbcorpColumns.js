// Conciliacao ERP (DBCorp) x Portal - F1. As 39 colunas da planilha do DBCorp,
// na ordem da planilha, e a resolucao de cabecalho. Unico import: `./erpText.js`.
//
// `group`:
//   - canonical: vira chave do `ErpItemRow` (29 colunas);
//   - financial: financeira (D-2). Reconhecida para nao virar "desconhecida",
//     mas NUNCA lida nem repassada (`key: null`);
//   - discarded: constante/vazia, tambem nunca lida (`key: null`).
//
// O cabecalho real de `NF'S ` tem espaco no fim: o `header` guarda o texto
// exato, e o casamento e' feito pela forma normalizada.
import { cleanCell } from './erpText.js'

export const DBCORP_COLUMNS = [
  { key: 'status', header: 'STATUS', required: true, group: 'canonical' },
  { key: 'exporter', header: 'EXPORTADOR', required: true, group: 'canonical' },
  { key: null, header: 'IMPORTADOR', required: false, group: 'discarded' },
  { key: 'pedido', header: 'PEDIDO', required: true, group: 'canonical' },
  { key: 'poRef', header: 'PO', required: true, group: 'canonical' },
  { key: 'refEmbarque', header: 'REF. EMBARQUE', required: true, group: 'canonical' },
  { key: 'poDate', header: 'DATA PO', required: false, group: 'canonical' },
  { key: 'readinessText', header: 'DATA PRONTIDÃO', required: false, group: 'canonical' },
  { key: 'sqCode', header: 'CÓD. SQ', required: false, group: 'canonical' },
  { key: null, header: 'CÓD. SUL', required: false, group: 'discarded' },
  { key: 'supplierRef', header: 'REF. FORNECEDOR', required: false, group: 'canonical' },
  { key: 'commercialName', header: 'NOME COMERCIAL', required: true, group: 'canonical' },
  { key: 'ncm', header: 'NCM', required: false, group: 'canonical' },
  { key: 'ipiRate', header: 'IPI (%)', required: false, group: 'canonical' },
  { key: 'iiRate', header: 'II (%)', required: false, group: 'canonical' },
  { key: 'quantityKg', header: 'QTD - KGS', required: true, group: 'canonical' },
  { key: null, header: 'MOEDA', required: false, group: 'financial' },
  { key: null, header: 'PREÇO FOB', required: false, group: 'financial' },
  { key: null, header: 'ADI. FRETE', required: false, group: 'financial' },
  { key: null, header: 'PREÇO CFR', required: false, group: 'financial' },
  { key: null, header: 'TOTAL', required: false, group: 'financial' },
  { key: 'invoice', header: 'INVOICE', required: false, group: 'canonical' },
  { key: 'blAwb', header: 'BL / AWB', required: true, group: 'canonical' },
  { key: 'tracking', header: 'TRACKING NUMBER', required: false, group: 'canonical' },
  { key: 'origin', header: 'ORIGEM (POL)', required: true, group: 'canonical' },
  { key: 'destination', header: 'DESTINO (POD)', required: true, group: 'canonical' },
  { key: 'vesselRaw', header: 'NAVIO', required: true, group: 'canonical' },
  { key: 'etd', header: 'ETD (EMBARQUE)', required: true, group: 'canonical' },
  { key: 'eta', header: 'ETA (CHEGADA)', required: true, group: 'canonical' },
  { key: 'etaFinal', header: 'ETA FINAL', required: false, group: 'canonical' },
  { key: null, header: 'PAYMENT TERM', required: false, group: 'financial' },
  { key: null, header: 'VENCIMENTO', required: false, group: 'financial' },
  { key: null, header: 'PTAX (DI)', required: false, group: 'financial' },
  { key: 'diNumber', header: 'Nº DI', required: true, group: 'canonical' },
  { key: 'diDate', header: 'DATA EMISSÃO (DI)', required: true, group: 'canonical' },
  { key: 'nfNumbers', header: "NF'S ", required: false, group: 'canonical' },
  { key: 'nfDate', header: "DATA EMISSÃO (NF'S)", required: false, group: 'canonical' },
  { key: 'statusNf', header: 'STATUS NF', required: true, group: 'canonical' },
  { key: 'itemId', header: 'ItemPedCpId', required: true, group: 'canonical' },
]

const MAX_HEADER_SCAN_ROWS = 5

// trim, espacos colapsados, fold de acento, maiusculas, `º`/`°` -> `O`,
// `’` -> `'`. Nenhum outro alias.
export function normalizeDbcorpHeader(value) {
  return cleanCell(value)
    .replace(/[º°]/g, 'O')
    .replace(/[’‘]/g, "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const COLUMN_BY_HEADER = new Map(
  DBCORP_COLUMNS.map((column) => [normalizeDbcorpHeader(column.header), column])
)

const REQUIRED_COLUMNS = DBCORP_COLUMNS.filter((column) => column.required)

// -> { index: { [key]: posicao }, missingRequired, missingOptional, unknown, duplicated }
// Os nomes nas listas sao os ORIGINAIS (o da planilha em unknown/duplicated;
// o do DBCorp em missing*).
export function resolveDbcorpColumns(headerRow) {
  const cells = Array.isArray(headerRow) ? headerRow : []
  const index = {}
  const seenIgnored = new Set()
  const unknown = []
  const duplicated = []

  cells.forEach((cell, position) => {
    const original = cleanCell(cell)
    if (original === '') return
    const column = COLUMN_BY_HEADER.get(normalizeDbcorpHeader(original))
    if (!column) {
      unknown.push(original)
      return
    }
    if (column.key === null) {
      // Financeira/descartada: reconhecida, nunca mapeada.
      if (seenIgnored.has(column.header)) duplicated.push(original)
      seenIgnored.add(column.header)
      return
    }
    if (Object.prototype.hasOwnProperty.call(index, column.key)) {
      duplicated.push(original)
      return
    }
    index[column.key] = position
  })

  const absent = (column) => !Object.prototype.hasOwnProperty.call(index, column.key)
  return {
    index,
    missingRequired: REQUIRED_COLUMNS.filter(absent).map((column) => column.header.trim()),
    missingOptional: DBCORP_COLUMNS.filter(
      (column) => column.group === 'canonical' && !column.required && absent(column)
    ).map((column) => column.header.trim()),
    unknown,
    duplicated,
  }
}

// Procura o cabecalho nas 5 primeiras linhas: vale a primeira em que ao menos
// metade das obrigatorias resolve. -> { rowIndex, rowNumber } | null
export function findDbcorpHeaderRow(matrix) {
  const rows = Array.isArray(matrix) ? matrix : []
  const limit = Math.min(MAX_HEADER_SCAN_ROWS, rows.length)
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const resolved = resolveDbcorpColumns(rows[rowIndex])
    const found = REQUIRED_COLUMNS.length - resolved.missingRequired.length
    if (found * 2 >= REQUIRED_COLUMNS.length) {
      return { rowIndex, rowNumber: rowIndex + 1 }
    }
  }
  return null
}
