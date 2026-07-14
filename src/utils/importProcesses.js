// F11 (backlog 2026-07-12): parser e validador de planilhas de processos
// em lote. Util puro — recebe um File/Blob e devolve {validRows, errors}
// sem chamar nenhum service. O caller (UI) decide o que fazer com as
// validRows (criar em lote via saveProcess, que preenche
// updatedById/Name exigidos pelas rules).
//
// O parser segue o mesmo molde do `extractItemsFromWorksheet` que já
// existia no ProcessesPage (import de itens de um processo aberto), mas
// valida CAMPOS DE PROCESSO ao invés de só itens. As colunas
// reconhecidas são um subset dos 32 campos das rules de `processes`
// (firestore.rules:159-167) — só os campos que fazem sentido ser
// preenchidos por planilha no cadastro em lote (campos operacionais como
// `berthed`, `duimpStatus`, etc. são preenchidos depois pelo admin no
// detalhe do processo, não no cadastro).

import { processCategoryOptions } from '../features/processes/processCategories'
import { processStatusOptions } from '../features/processes/processStatus'

// Colunas reconhecidas na planilha. O normalizador aceita variações
// (com/sem acento, case-insensitive, sinonimos).
const COLUMN_ALIASES = {
  name: ['nome', 'nome do processo', 'processo', 'cliente', 'client'],
  processNumber: ['po', 'codigo', 'numero do processo', 'process number', 'code'],
  category: ['categoria', 'category', 'tipo'],
  destination: ['destino', 'destination', 'porto', 'aeroporto'],
  etd: ['etd', 'embarque'],
  eta: ['eta', 'chegada'],
  containerQuantity: ['containers', 'quantidade de containers', 'container qty', 'qtd containers'],
  palletQuantity: ['pallets', 'quantidade de pallets', 'pallet qty', 'qtd pallets'],
  processStatus: ['status', 'status do processo', 'process status'],
  processNotes: ['observacoes', 'obs', 'notes', 'notas'],
}

const REQUIRED_COLUMNS = ['name', 'category']

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function findColumnIndex(headerRow, field) {
  const aliases = COLUMN_ALIASES[field]
  // Exact match (case-insensitive, sem acento)
  for (let index = 0; index < headerRow.length; index += 1) {
    const normalized = normalizeHeader(headerRow[index])
    if (aliases.some((alias) => normalized === alias)) return index
  }
  // Fuzzy: só pra aliases com 4+ chars (evita "po" bater com "tipo")
  for (let index = 0; index < headerRow.length; index += 1) {
    const normalized = normalizeHeader(headerRow[index])
    if (
      normalized.length >= 4 &&
      aliases.some((alias) => alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized)))
    ) {
      return index
    }
  }
  return -1
}

function normalizeDate(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // DD/MM/YYYY -> YYYY-MM-DD
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
  // Tenta Date
  const date = new Date(trimmed)
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  return ''
}

function normalizeQuantity(value) {
  const num = Number(String(value ?? '').replace(/[^\d-]/g, ''))
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0
}

function normalizeCategory(value) {
  const normalized = normalizeHeader(value).toUpperCase()
  return processCategoryOptions.includes(normalized) ? normalized : ''
}

function normalizeProcessStatus(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return processStatusOptions[0]
  // Match case-insensitive, com ou sem acento
  const match = processStatusOptions.find(
    (option) =>
      option.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ===
      normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  )
  return match ?? processStatusOptions[0]
}

export async function parseProcessesFromWorkbook(file) {
  const { read, utils } = await import('xlsx')

  // Aceita File (navegador), Blob, ou ArrayBuffer/Uint8Array direto
  // (testes). xlsx.read() aceita qualquer um.
  let buffer
  if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
    buffer = file
  } else if (typeof file?.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer()
  } else if (file instanceof Blob) {
    buffer = await file.arrayBuffer()
  } else {
    throw new Error('Arquivo inválido: esperado File, Blob ou ArrayBuffer.')
  }

  const workbook = read(buffer, { type: 'array', cellDates: true })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('A planilha não possui abas válidas.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rows = utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (rows.length === 0) {
    throw new Error('A planilha enviada está vazia.')
  }

  const headerRow = rows[0].map((value) => String(value ?? '').trim())

  // Mapeia índices das colunas reconhecidas
  const columnIndex = {}
  for (const field of Object.keys(COLUMN_ALIASES)) {
    columnIndex[field] = findColumnIndex(headerRow, field)
  }

  // Checa colunas obrigatórias
  const missingRequired = REQUIRED_COLUMNS.filter((field) => columnIndex[field] < 0)
  if (missingRequired.length > 0) {
    const aliases = missingRequired.map((f) => COLUMN_ALIASES[f][0]).join(', ')
    throw new Error(
      `Colunas obrigatórias não encontradas: ${aliases}. Verifique o cabeçalho da planilha.`
    )
  }

  const validRows = []
  const errors = []
  const seenProcessNumbers = new Set()

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const lineNumber = rowIndex + 1

    // Pula linhas totalmente vazias
    const hasContent = row.some((cell) => String(cell ?? '').trim() !== '')
    if (!hasContent) continue

    const name = String(row[columnIndex.name] ?? '').trim()
    if (!name) {
      errors.push({ linha: lineNumber, motivo: 'Nome do processo é obrigatório.' })
      continue
    }

    const category = normalizeCategory(row[columnIndex.category])
    if (!category) {
      errors.push({
        linha: lineNumber,
        motivo: `Categoria inválida. Valores aceitos: ${processCategoryOptions.join(', ')}.`,
      })
      continue
    }

    const processNumber =
      category === 'CONSOLIDADO' || columnIndex.processNumber < 0
        ? ''
        : String(row[columnIndex.processNumber] ?? '').trim()

    // Idempotência: checa duplicata por nº de processo dentro da própria planilha
    if (processNumber) {
      if (seenProcessNumbers.has(processNumber)) {
        errors.push({
          linha: lineNumber,
          motivo: `PO duplicado na planilha: ${processNumber}.`,
        })
        continue
      }
      seenProcessNumbers.add(processNumber)
    }

    const etd = columnIndex.etd >= 0 ? normalizeDate(row[columnIndex.etd]) : ''
    const eta = columnIndex.eta >= 0 ? normalizeDate(row[columnIndex.eta]) : ''
    if (columnIndex.etd >= 0 && row[columnIndex.etd] && !etd) {
      errors.push({ linha: lineNumber, motivo: `ETD inválida: ${row[columnIndex.etd]}.` })
      continue
    }
    if (columnIndex.eta >= 0 && row[columnIndex.eta] && !eta) {
      errors.push({ linha: lineNumber, motivo: `ETA inválida: ${row[columnIndex.eta]}.` })
      continue
    }

    const containerQuantity =
      columnIndex.containerQuantity >= 0
        ? normalizeQuantity(row[columnIndex.containerQuantity])
        : 0
    const palletQuantity =
      columnIndex.palletQuantity >= 0
        ? normalizeQuantity(row[columnIndex.palletQuantity])
        : 0
    const processStatus =
      columnIndex.processStatus >= 0
        ? normalizeProcessStatus(row[columnIndex.processStatus])
        : processStatusOptions[0]
    const processNotes =
      columnIndex.processNotes >= 0 ? String(row[columnIndex.processNotes] ?? '').trim() : ''

    validRows.push({
      name,
      category,
      processNumber,
      destination: String(
        columnIndex.destination >= 0 ? row[columnIndex.destination] ?? '' : ''
      ).trim().toUpperCase(),
      etd,
      eta,
      etaOriginal: eta,
      containerQuantity,
      palletQuantity,
      processStatus,
      processNotes,
      items: [],
    })
  }

  if (validRows.length === 0 && errors.length === 0) {
    throw new Error('Nenhum processo válido encontrado na planilha.')
  }

  return { validRows, errors }
}