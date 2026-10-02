// Conciliacao ERP (DBCorp) x Portal - F1. Matriz da planilha -> `looseRows`
// (chaves canonicas, valores CRUS). So' mapeia coluna -> chave: nao converte
// data, nao converte quantidade e NAO le as colunas financeiras nem as
// descartadas (elas nem entram no mapa de colunas).
import { DBCORP_COLUMNS, findDbcorpHeaderRow, resolveDbcorpColumns } from './dbcorpColumns.js'
import { cleanCell, makeErpWarning } from './erpText.js'

const CANONICAL_KEYS = DBCORP_COLUMNS.filter((column) => column.group === 'canonical').map(
  (column) => column.key
)

// -> { rows: looseRows, warnings, headerRowNumber }. Lanca Error quando nao ha
// cabecalho reconhecivel ou faltam colunas obrigatorias.
export function parseDbcorpRows(matrix) {
  const rows = Array.isArray(matrix) ? matrix : []
  const header = findDbcorpHeaderRow(rows)
  if (!header) {
    throw new Error('Cabeçalho do DBCorp não encontrado nas 5 primeiras linhas')
  }

  const resolved = resolveDbcorpColumns(rows[header.rowIndex])
  if (resolved.missingRequired.length > 0) {
    throw new Error(
      `Colunas obrigatórias ausentes no DBCorp: ${resolved.missingRequired.join(', ')}`
    )
  }

  const warnings = []
  const headerRef = { rowNumber: header.rowNumber }
  if (header.rowNumber > 1) {
    warnings.push(
      makeErpWarning(
        'cabecalho_deslocado',
        `Cabeçalho encontrado na linha ${header.rowNumber} (o esperado é a linha 1).`,
        headerRef
      )
    )
  }
  for (const name of resolved.duplicated) {
    warnings.push(
      makeErpWarning('coluna_duplicada', `Coluna "${name}" repetida; vale a primeira.`, headerRef)
    )
  }
  for (const name of resolved.unknown) {
    warnings.push(
      makeErpWarning('coluna_desconhecida', `Coluna "${name}" não reconhecida; ignorada.`, headerRef)
    )
  }

  const looseRows = []
  for (let position = header.rowIndex + 1; position < rows.length; position += 1) {
    const cells = Array.isArray(rows[position]) ? rows[position] : []
    const loose = {}
    let hasContent = false
    for (const key of CANONICAL_KEYS) {
      const columnIndex = resolved.index[key]
      const value = columnIndex === undefined ? undefined : cells[columnIndex]
      loose[key] = value === undefined || value === null ? '' : value
      if (cleanCell(loose[key]) !== '') hasContent = true
    }
    if (!hasContent) continue
    loose.rowNumber = position + 1
    looseRows.push(loose)
  }

  return { rows: looseRows, warnings, headerRowNumber: header.rowNumber }
}
