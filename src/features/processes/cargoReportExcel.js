// S4 do Relatório de Carga: gera o Excel do FR.CMX.001 R5 a partir do modelo oficial.
// Não monta uma planilha nova: abre o template saneado (`cargoReportTemplate.xlsx`, a aba
// `SQ QUIMICA` do modelo com logo, estilos e caixas de seleção) e reescreve só as células de
// `xl/worksheets/sheet1.xml`, sempre preservando o estilo (`s`). Todo o resto do zip sai idêntico.
// Único módulo com `fflate`; o formulário o carrega sob demanda (`import('./cargoReportExcel')`).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import templateUrl from './cargoReportTemplate.xlsx?url'
import { CARGO_REPORT_MAX_ROWS, CARGO_REPORT_TEMPLATE_ROWS } from './cargoReportFormModel'
import { buildCargoReportFileName } from './cargoReportSheet'

export const CARGO_REPORT_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const SHEET_PATH = 'xl/worksheets/sheet1.xml'
const WORKBOOK_PATH = 'xl/workbook.xml'
const FIRST_DATA_ROW = 9
// Linhas de dados do modelo (9 a 36) e o ponto onde entram as extras: antes da penúltima linha de dados
// (35), para a borda grossa da última linha e o rodapé descerem juntos. A linha 34 é o molde de estilo.
const TEMPLATE_CLONE_SOURCE_ROW = 34
const TEMPLATE_FIRST_SHIFTED_ROW = 35
const TEMPLATE_LAST_ROW = 40
const ZIP_MTIME = Date.UTC(2026, 10, 24)
const STORED_ENTRY = /\.(png|bin)$/

// ---------- escrita de células ----------

// Remove caracteres inválidos em XML 1.0 (controles, exceto tab, LF e CR) e escapa o texto.
function escapeXml(value) {
  let clean = ''
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0)
    const valid =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
    if (valid) clean += char
  }
  return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function findCell(xml, ref) {
  const pattern = new RegExp(`<c r="${ref}"((?: [A-Za-z:]+="[^"]*")*)\\s*(?:/>|>[\\s\\S]*?</c>)`)
  const match = pattern.exec(xml)
  if (!match) throw new Error(`Célula ${ref} não encontrada no modelo FR.CMX.001`)
  const style = /(?:^| )s="(\d+)"/.exec(match[1])
  return { start: match.index, end: match.index + match[0].length, style: style ? style[1] : '' }
}

function buildCell(ref, style, spec) {
  const open = `<c r="${ref}"${style ? ` s="${style}"` : ''}`
  switch (spec.kind) {
    case 'empty':
      return `${open}/>`
    case 'text':
      return `${open} t="inlineStr"><is><t xml:space="preserve">${escapeXml(spec.value)}</t></is></c>`
    case 'number':
      return `${open}><v>${String(spec.value)}</v></c>`
    case 'bool':
      return `${open} t="b"><v>${spec.value ? 1 : 0}</v></c>`
    case 'formula': {
      const isText = typeof spec.cache === 'string'
      return `${open}${isText ? ' t="str"' : ''}><f>${escapeXml(spec.formula)}</f><v>${escapeXml(String(spec.cache))}</v></c>`
    }
    default:
      throw new Error(`Tipo de célula desconhecido: ${spec.kind}`)
  }
}

// Troca o elemento da célula por fatiamento (sem `String.replace`: o texto pode ter padrões especiais).
function writeCell(xml, ref, spec) {
  const { start, end, style } = findCell(xml, ref)
  return xml.slice(0, start) + buildCell(ref, style, spec) + xml.slice(end)
}

const isFilled = (value) => value !== null && value !== undefined && value !== ''

function toSpec(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'empty' }
  }
  return isFilled(value) ? { kind: 'text', value } : { kind: 'empty' }
}

// ---------- linhas extras (N > 28) ----------

// Desloca os números de linha >= 35 de uma referência ("D40", "I37:K37") em `extra` linhas.
function shiftCellRef(ref, extra) {
  return ref.replace(/([A-Z]+)(\d+)/g, (_, col, row) => {
    const number = Number(row)
    return `${col}${number >= TEMPLATE_FIRST_SHIFTED_ROW ? number + extra : number}`
  })
}

// Insere `extra` linhas de dados clonando o estilo da linha 34 e desce tudo o que vem depois (linhas e
// células, mesclas, formatação condicional, dimensão). O rodapé (observações, responsáveis, caixas de
// ressalva) vai junto: as caixas são valores de célula, então não há âncora de desenho para mover.
function insertDataRows(sourceXml, extra) {
  const start = sourceXml.indexOf(`<row r="${TEMPLATE_FIRST_SHIFTED_ROW}"`)
  const end = sourceXml.indexOf('</sheetData>')
  const cloneStart = sourceXml.indexOf(`<row r="${TEMPLATE_CLONE_SOURCE_ROW}"`)
  if (start < 0 || end < 0 || cloneStart < 0 || cloneStart > start) {
    throw new Error('Estrutura de linhas do modelo FR.CMX.001 não reconhecida')
  }

  const cloneSource = sourceXml.slice(cloneStart, start)
  const clones = Array.from({ length: extra }, (_, index) => {
    const row = TEMPLATE_FIRST_SHIFTED_ROW + index
    return cloneSource
      .replace(`<row r="${TEMPLATE_CLONE_SOURCE_ROW}"`, `<row r="${row}"`)
      .replace(/<c r="([A-Z]+)34"/g, (_, col) => `<c r="${col}${row}"`)
  }).join('')

  const shiftedTail = sourceXml
    .slice(start, end)
    .replace(/<row r="(\d+)"/g, (_, row) => `<row r="${Number(row) + extra}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (_, col, row) => `<c r="${col}${Number(row) + extra}"`)

  let xml = sourceXml.slice(0, start) + clones + shiftedTail + sourceXml.slice(end)

  xml = xml.replace(/<mergeCell ref="([^"]+)"\/>/g, (_, ref) => `<mergeCell ref="${shiftCellRef(ref, extra)}"/>`)
  xml = xml.replace(/<dimension ref="([^"]+)"\/>/, (_, ref) => `<dimension ref="${shiftCellRef(ref, extra)}"/>`)
  // Formatação condicional das colunas G e N cobre também as linhas novas (9:36 -> 9:36+extra).
  xml = xml.replace(/sqref="([A-Z]+)9:([A-Z]+)36"/g, (_, from, to) => `sqref="${from}9:${to}${36 + extra}"`)
  // Mais de uma página: largura 1, altura livre (sem escala fixa de 48%).
  xml = xml.replace(' scale="48"', '').replace('<pageSetup ', '<pageSetup fitToHeight="0" ')
  if (!xml.includes('fitToHeight="0"')) throw new Error('pageSetup do modelo FR.CMX.001 não reconhecido')
  return xml
}

// Área de impressão acompanha o rodapé deslocado e o cabeçalho da tabela (linha 8) repete em cada página.
function adjustWorkbookXml(sourceXml, extra) {
  const printArea = `$B$2:$O$${TEMPLATE_LAST_ROW}</definedName>`
  if (!sourceXml.includes(printArea)) throw new Error('Área de impressão do modelo FR.CMX.001 não encontrada')
  const newArea = `$B$2:$O$${TEMPLATE_LAST_ROW + extra}</definedName>`
  const titles = `<definedName name="_xlnm.Print_Titles" localSheetId="0">'SQ QUIMICA'!$8:$8</definedName></definedNames>`
  // Função de troca: os "$" das referências não podem virar padrões de substituição.
  return sourceXml.replace(printArea, () => newArea).replace('</definedNames>', () => titles)
}

// ---------- folha -> xml ----------

function withLabel(label, value) {
  return `${label} ${value}`
}

function patchSheetXml(sourceXml, sheet, extra) {
  let xml = extra > 0 ? insertDataRows(sourceXml, extra) : sourceXml
  const put = (ref, spec) => {
    xml = writeCell(xml, ref, spec)
  }
  // Só escreve quando há valor: vazio mantém o texto original do modelo (o rótulo).
  const putIfFilled = (ref, value) => {
    if (isFilled(value)) put(ref, toSpec(value))
  }

  put('D2', { kind: 'text', value: sheet.title })
  // O modelo diz "Nº da DI"; o Portal escreve "Nº da DUIMP" (decisão da Qualidade). Sempre reescrito, mesmo sem número.
  put('B5', { kind: 'text', value: sheet.duimpNumber ? withLabel('Nº da DUIMP:', sheet.duimpNumber) : 'Nº da DUIMP:' })

  // Tipo de carga: as 3 caixas do modelo; AÉREO não tem caixa, vira texto ao lado delas.
  put('C7', { kind: 'bool', value: sheet.cargoType === 'FCL' })
  put('D7', { kind: 'bool', value: sheet.cargoType === 'LCL' })
  put('E7', { kind: 'bool', value: sheet.cargoType === 'CONSOLIDADO' })
  if (sheet.cargoType === 'AEREO') {
    put('G6', { kind: 'text', value: 'AÉREO' })
    put('G7', { kind: 'text', value: 'X' })
  }

  sheet.rows.forEach((row, index) => {
    const line = FIRST_DATA_ROW + index
    putIfFilled(`B${line}`, row.po)
    putIfFilled(`C${line}`, row.dbcorpCode)
    putIfFilled(`D${line}`, row.supplierDescription)
    putIfFilled(`E${line}`, row.sqDescription)
    // O modelo traz um espaço em F36: a coluna OK? é sempre reescrita.
    put(`F${line}`, row.ok ? { kind: 'text', value: 'OK' } : { kind: 'empty' })
    putIfFilled(`G${line}`, row.supplierLot)
    if (isFilled(row.lotSq)) {
      put(`H${line}`, { kind: 'formula', formula: `G${line}&(LEFT(B${line},3))`, cache: String(row.lotSq) })
    }
    putIfFilled(`I${line}`, row.wmsLabel)
    putIfFilled(`J${line}`, row.sqLabel)
    putIfFilled(`K${line}`, row.quantityKg)
    // Contagem OK da conferência da logística: texto `OK`, igual à coluna F; sem OK a célula fica como no modelo.
    if (row.countOk) put(`L${line}`, { kind: 'text', value: 'OK' })
    putIfFilled(`M${line}`, row.netWeightKg)
    putIfFilled(`N${line}`, row.packageWeightKg)
    if (typeof row.packages === 'number' && Number.isFinite(row.packages)) {
      put(`O${line}`, { kind: 'formula', formula: `K${line}/M${line}`, cache: row.packages })
    }
  })

  if (isFilled(sheet.notes)) put(`B${38 + extra}`, { kind: 'text', value: sheet.notes })
  if (isFilled(sheet.checkedByName)) put(`I${38 + extra}`, { kind: 'text', value: withLabel('CONFERÊNCIA:', sheet.checkedByName) })
  if (isFilled(sheet.labeledBy)) put(`L${37 + extra}`, { kind: 'text', value: withLabel('ETIQUETAGEM:', sheet.labeledBy) })
  if (isFilled(sheet.labelMadeBy)) {
    put(`L${38 + extra}`, { kind: 'text', value: withLabel('CONFECÇÃO ETIQUETA:', sheet.labelMadeBy) })
  }
  if (isFilled(sheet.receivedDateBr)) {
    put(`I${39 + extra}`, { kind: 'text', value: withLabel('DATA RECEBIMENTO:', sheet.receivedDateBr) })
  }
  if (isFilled(sheet.completedDateBr)) {
    put(`L${39 + extra}`, { kind: 'text', value: withLabel('DATA CONCLUSÃO:', sheet.completedDateBr) })
  }
  if (isFilled(sheet.nfNumber)) put(`I${40 + extra}`, { kind: 'text', value: withLabel('Nº DA NF:', sheet.nfNumber) })
  put(`D${40 + extra}`, { kind: 'bool', value: sheet.receiptStatus === 'com_ressalva' })
  put(`E${40 + extra}`, { kind: 'bool', value: sheet.receiptStatus === 'sem_ressalva' })

  return xml
}

// -> Uint8Array do .xlsx. Reescreve só `sheet1.xml`; as demais entradas do zip saem inalteradas.
export function buildCargoReportXlsx(templateBytes, sheet) {
  const entries = unzipSync(templateBytes)
  if (!entries[SHEET_PATH]) throw new Error(`O modelo FR.CMX.001 não tem ${SHEET_PATH}`)

  const rowCount = sheet.rows.length
  if (rowCount > CARGO_REPORT_MAX_ROWS) {
    throw new Error(`O Portal comporta ${CARGO_REPORT_MAX_ROWS} linhas por relatório; a folha tem ${rowCount}.`)
  }
  // Até 28 linhas o arquivo sai idêntico ao modelo; acima disso entram (N - 28) linhas extras.
  const extra = Math.max(0, rowCount - CARGO_REPORT_TEMPLATE_ROWS)
  const patched = patchSheetXml(strFromU8(entries[SHEET_PATH]), sheet, extra)
  const workbook = extra > 0 ? adjustWorkbookXml(strFromU8(entries[WORKBOOK_PATH]), extra) : null
  const files = {}
  for (const [name, data] of Object.entries(entries)) {
    let content = data
    if (name === SHEET_PATH) content = strToU8(patched)
    else if (name === WORKBOOK_PATH && workbook) content = strToU8(workbook)
    files[name] = [
      content,
      { level: STORED_ENTRY.test(name) ? 0 : 6, mtime: ZIP_MTIME },
    ]
  }
  return zipSync(files)
}

// ---------- template e arquivo ----------

let templatePromise = null

// Cache de módulo; a promessa é zerada em erro para o próximo clique tentar de novo.
export function loadCargoReportTemplate() {
  if (!templatePromise) {
    const promise = fetch(templateUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Não foi possível carregar o modelo do Excel (HTTP ${response.status}).`)
      return new Uint8Array(await response.arrayBuffer())
    })
    promise.catch(() => {
      if (templatePromise === promise) templatePromise = null
    })
    templatePromise = promise
  }
  return templatePromise
}

export async function generateCargoReportFile(sheet) {
  const bytes = buildCargoReportXlsx(await loadCargoReportTemplate(), sheet)
  return new File([bytes], buildCargoReportFileName(sheet.titleSuffix), { type: CARGO_REPORT_XLSX_MIME })
}
