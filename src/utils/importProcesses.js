// F11 (backlog 2026-07-12): parser e validador de planilhas de processos
// em lote. Util puro — recebe um File/Blob e devolve {validRows, errors}
// sem chamar nenhum service. O caller (UI) decide o que fazer com as
// validRows (criar em lote via saveProcess, que preenche
// updatedById/Name exigidos pelas rules).
//
// O parser segue o mesmo molde do `extractItemsFromWorksheet` que já
// existia no ProcessesPage (import de itens de um processo aberto), mas
// valida CAMPOS DE PROCESSO ao invés de só itens. As colunas
// reconhecidas são um subset dos campos das rules de `processes`
// (firestore.rules:159-167) — só os campos que fazem sentido ser
// preenchidos por planilha no cadastro em lote (campos operacionais como
// `berthed`, `duimpStatus`, etc. são preenchidos depois pelo admin no
// detalhe do processo, não no cadastro).
//
// F17.5b: 14 colunas novas (identificação/rastreio + contêineres/POs do
// consolidado). Mapeamento em 2 fases (ver `findColumnIndexes`) - campos
// novos NUNCA sao fuzzy, pra nao roubar coluna de um campo legado (ex.:
// `destination` ('porto') roubando "Porto de origem").

import { processCategoryOptions } from '../features/processes/processCategories'
import { processStatusOptions } from '../features/processes/processStatus'
import { INCOTERM_OPTIONS } from '../features/processes/operationalOptions'
import {
  MAX_CONTAINERS,
  CONTAINER_TYPE_OPTIONS,
  normalizeContainerNumber,
  validateContainerNumber,
  getContainerNumberWarning,
} from '../features/processes/containers'
import { MAX_PURCHASE_ORDERS, normalizePurchaseOrders } from '../features/processes/purchaseOrders'

// Colunas legadas (intocadas). O normalizador aceita variações (com/sem
// acento, case-insensitive, sinonimos).
const LEGACY_COLUMN_ALIASES = {
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

// F17.5b: 14 colunas novas. O 1o alias de cada campo e' o cabecalho
// canonico PT-BR usado no hint da UI. NUNCA entram na fase fuzzy (D-passo 11).
const NEW_COLUMN_ALIASES = {
  supplierName: ['fornecedor', 'exportador', 'supplier', 'shipper'],
  originLocation: ['origem', 'porto de origem', 'aeroporto de origem', 'local de origem', 'origin', 'pol'],
  incoterm: ['incoterm', 'incoterms'],
  forwarderName: ['agente de carga', 'agente', 'forwarder'],
  masterBl: ['mbl', 'master bl', 'bl master', 'bl'],
  houseBl: ['hbl', 'house bl', 'bl house'],
  mawb: ['mawb', 'awb master', 'awb'],
  hawb: ['hawb', 'awb house'],
  vesselName: ['navio', 'nome do navio', 'vessel'],
  voyage: ['viagem', 'numero da viagem', 'voyage'],
  flightNumber: ['voo', 'numero do voo', 'flight'],
  containerNumbers: [
    'numeros dos conteineres',
    'numeros dos containers',
    'numero dos conteineres',
    'numero dos containers',
    'container numbers',
  ],
  containerTypes: [
    'tipos dos conteineres',
    'tipos dos containers',
    'tipo de conteiner',
    'tipo de container',
    'tipo do conteiner',
    'tipo do container',
    'tipos de container',
    'container type',
    'container types',
  ],
  purchaseOrders: ['pos do consolidado', 'pos', 'pos consolidadas', 'purchase orders'],
}

const REQUIRED_COLUMNS = ['name', 'category']

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// F17.5b (passo 11): mapeamento em 2 fases. Fase 1 = match EXATO para TODOS
// os campos (legados + novos), 1o cabecalho livre que casar, marcando o
// indice como tomado. Fase 2 = fuzzy (>= 4 chars, `includes` nos 2
// sentidos) SO' para campos LEGADOS ainda sem coluna e SO' sobre cabecalhos
// nao tomados. Campos novos NUNCA sao fuzzy.
function findColumnIndexes(headerRow) {
  const allAliases = { ...LEGACY_COLUMN_ALIASES, ...NEW_COLUMN_ALIASES }
  const columnIndex = {}
  const takenIndexes = new Set()

  for (const field of Object.keys(allAliases)) {
    const aliases = allAliases[field]
    let found = -1
    for (let index = 0; index < headerRow.length; index += 1) {
      if (takenIndexes.has(index)) continue
      const normalized = normalizeHeader(headerRow[index])
      if (aliases.some((alias) => normalized === alias)) {
        found = index
        break
      }
    }
    columnIndex[field] = found
    if (found >= 0) takenIndexes.add(found)
  }

  for (const field of Object.keys(LEGACY_COLUMN_ALIASES)) {
    if (columnIndex[field] >= 0) continue
    const aliases = LEGACY_COLUMN_ALIASES[field]
    for (let index = 0; index < headerRow.length; index += 1) {
      if (takenIndexes.has(index)) continue
      const normalized = normalizeHeader(headerRow[index])
      if (
        normalized.length >= 4 &&
        aliases.some((alias) => alias.length >= 4 && (normalized.includes(alias) || alias.includes(normalized)))
      ) {
        columnIndex[field] = index
        takenIndexes.add(index)
        break
      }
    }
  }

  return columnIndex
}

// F17.5b (passo 12): fix de fuso. `value instanceof Date` (celula-serial OU
// `Date` real do xlsx com `cellDates: true`) -> arredonda ao minuto ANTES de
// ler os getters LOCAIS (probe: o round-trip do xlsx pode devolver
// `23:59:59.999` do dia anterior em BRT - arredondar corrige os dois
// fusos). Texto `YYYY-MM-DD`/`DD/MM/YYYY` seguem como antes. Fallback
// `new Date(trimmed)` tambem passa a usar getters locais - NUNCA
// `toISOString()` (vira o dia anterior em BRT).
function normalizeDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const rounded = new Date(Math.round(value.getTime() / 60000) * 60000)
    if (Number.isNaN(rounded.getTime())) return ''
    const year = rounded.getFullYear()
    const month = String(rounded.getMonth() + 1).padStart(2, '0')
    const day = String(rounded.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  // DD/MM/YYYY -> YYYY-MM-DD
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
  // Tenta Date - getters LOCAIS, nunca toISOString().
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
      option.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() ===
      normalized.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  )
  return match ?? processStatusOptions[0]
}

function isContainerCategory(category) {
  return category === 'FCL' || category === 'CONSOLIDADO'
}

// F17.5b: separadores `;` `,` `/` ou quebra de linha (numeros/tipos de
// contêiner). POs do consolidado NAO aceitam `/` (PO pode ter barra, ex.
// "123/2026") - `allowSlash: false`.
function splitMultiValue(value, { allowSlash = true } = {}) {
  const separatorPattern = allowSlash ? /[;,/\n]+/ : /[;,\n]+/
  return String(value ?? '')
    .split(separatorPattern)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeContainerTypeKey(value) {
  return normalizeHeader(value).replace(/[^a-z0-9]/g, '')
}

function matchContainerType(rawType) {
  const key = normalizeContainerTypeKey(rawType)
  const match = CONTAINER_TYPE_OPTIONS.find(
    (option) => normalizeContainerTypeKey(option.value) === key || normalizeContainerTypeKey(option.label) === key
  )
  return match ? match.value : null
}

// F17.5b (passo 13): resolve `containers[]`/`containerQuantity` a partir
// das colunas novas "Números dos contêineres"/"Tipos dos contêineres" (so'
// FCL/CONSOLIDADO). `containers: undefined` -> NAO setar a chave (mantem a
// expansao lazy do repositorio pelo `containerQuantity`).
function resolveContainersColumn({ rawNumbers, rawTypes, category, sheetContainerQuantity }) {
  const warnings = []
  const numbersFilled = String(rawNumbers ?? '').trim() !== ''
  const typesFilled = String(rawTypes ?? '').trim() !== ''

  if (!numbersFilled && !typesFilled) {
    return { containers: undefined, containerQuantity: undefined, warnings }
  }

  if (!isContainerCategory(category)) {
    warnings.push('Números/tipos de contêineres ignorados (categoria não é FCL/CONSOLIDADO).')
    return { containers: undefined, containerQuantity: undefined, warnings }
  }

  const numberList = numbersFilled
    ? splitMultiValue(rawNumbers).map(normalizeContainerNumber).filter(Boolean)
    : []

  if (numberList.length > MAX_CONTAINERS) {
    return { error: `Número de contêineres excede o limite de ${MAX_CONTAINERS}.` }
  }

  let typeList = []
  if (typesFilled) {
    typeList = splitMultiValue(rawTypes).map(matchContainerType)
    if (typeList.some((type) => type === null)) {
      return { error: 'Tipo de contêiner desconhecido.' }
    }
  }

  let baseCount = numberList.length
  if (baseCount === 0 && typeList.length > 0) {
    const quantityFromSheet = Number(sheetContainerQuantity) || 0
    if (quantityFromSheet > MAX_CONTAINERS) {
      return { error: `Número de contêineres excede o limite de ${MAX_CONTAINERS}.` }
    }
    baseCount = quantityFromSheet
  }

  if (baseCount === 0) {
    return { containers: undefined, containerQuantity: undefined, warnings }
  }

  let typesResolved
  if (typeList.length === 0) {
    typesResolved = Array.from({ length: baseCount }, () => '')
  } else if (typeList.length === 1) {
    typesResolved = Array.from({ length: baseCount }, () => typeList[0])
  } else if (typeList.length === baseCount) {
    typesResolved = typeList
  } else {
    return { error: 'Quantidade de tipos de contêiner não confere com a quantidade de números.' }
  }

  const containers = []
  for (let index = 0; index < baseCount; index += 1) {
    const number = numberList[index] ?? ''
    if (number) {
      const { status } = validateContainerNumber(number)
      if (status === 'format' || status === 'checkDigit') {
        warnings.push(getContainerNumberWarning(number))
      }
    }
    containers.push({ id: `CNT-${index + 1}`, number, seal: '', type: typesResolved[index] ?? '', returnedAt: '' })
  }

  if (Number(sheetContainerQuantity) > 0 && Number(sheetContainerQuantity) !== containers.length) {
    warnings.push('Quantidade de contêineres da planilha ignorada - vale a lista de contêineres.')
  }

  return { containers, containerQuantity: containers.length, warnings }
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

  // Mapeia índices das colunas reconhecidas (2 fases - passo 11).
  const columnIndex = findColumnIndexes(headerRow)

  // Checa colunas obrigatórias
  const missingRequired = REQUIRED_COLUMNS.filter((field) => columnIndex[field] < 0)
  if (missingRequired.length > 0) {
    const aliases = missingRequired.map((f) => LEGACY_COLUMN_ALIASES[f][0]).join(', ')
    throw new Error(
      `Colunas obrigatórias não encontradas: ${aliases}. Verifique o cabeçalho da planilha.`
    )
  }

  const validRows = []
  const errors = []
  const warnings = []
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

    const rowWarnings = []

    // F17.5b (passo 13): strings simples - sempre presentes ('' se sem
    // coluna). Modal errado (ex. MBL preenchido em AEREO) passa direto:
    // `sanitizeCargoAndTransitFields` limpa por categoria no repositorio.
    const originLocation =
      columnIndex.originLocation >= 0 ? String(row[columnIndex.originLocation] ?? '').trim() : ''
    const forwarderName =
      columnIndex.forwarderName >= 0 ? String(row[columnIndex.forwarderName] ?? '').trim() : ''
    const masterBl = columnIndex.masterBl >= 0 ? String(row[columnIndex.masterBl] ?? '').trim() : ''
    const houseBl = columnIndex.houseBl >= 0 ? String(row[columnIndex.houseBl] ?? '').trim() : ''
    const mawb = columnIndex.mawb >= 0 ? String(row[columnIndex.mawb] ?? '').trim() : ''
    const hawb = columnIndex.hawb >= 0 ? String(row[columnIndex.hawb] ?? '').trim() : ''
    const vesselName = columnIndex.vesselName >= 0 ? String(row[columnIndex.vesselName] ?? '').trim() : ''
    const voyage = columnIndex.voyage >= 0 ? String(row[columnIndex.voyage] ?? '').trim() : ''
    const flightNumber =
      columnIndex.flightNumber >= 0 ? String(row[columnIndex.flightNumber] ?? '').trim() : ''

    // F17.2d-2 (D-4, Q1): fornecedor de nivel-processo sai do CONSOLIDADO -
    // o fornecedor e' informado POR PO (aviso, nao erro).
    let supplierName =
      columnIndex.supplierName >= 0 ? String(row[columnIndex.supplierName] ?? '').trim() : ''
    if (category === 'CONSOLIDADO' && supplierName) {
      rowWarnings.push({
        linha: lineNumber,
        motivo: 'Fornecedor ignorado no CONSOLIDADO (informe por PO no detalhe do processo).',
      })
      supplierName = ''
    }

    // Incoterm: vazio ok; fora da lista fechada -> ERRO.
    let incoterm = ''
    if (columnIndex.incoterm >= 0) {
      const rawIncoterm = String(row[columnIndex.incoterm] ?? '').trim()
      if (rawIncoterm) {
        incoterm = rawIncoterm.toUpperCase()
      }
    }
    if (incoterm && !INCOTERM_OPTIONS.includes(incoterm)) {
      errors.push({
        linha: lineNumber,
        motivo: `Incoterm inválido: ${incoterm}. Valores aceitos: ${INCOTERM_OPTIONS.join(', ')}.`,
      })
      continue
    }

    // Contêineres (so' FCL/CONSOLIDADO).
    const rawContainerNumbers = columnIndex.containerNumbers >= 0 ? row[columnIndex.containerNumbers] : ''
    const rawContainerTypes = columnIndex.containerTypes >= 0 ? row[columnIndex.containerTypes] : ''
    const containerResult = resolveContainersColumn({
      rawNumbers: rawContainerNumbers,
      rawTypes: rawContainerTypes,
      category,
      sheetContainerQuantity: containerQuantity,
    })

    if (containerResult.error) {
      errors.push({ linha: lineNumber, motivo: containerResult.error })
      continue
    }

    containerResult.warnings.forEach((motivo) => rowWarnings.push({ linha: lineNumber, motivo }))
    const finalContainerQuantity =
      containerResult.containerQuantity !== undefined ? containerResult.containerQuantity : containerQuantity

    // POs do consolidado (so' CONSOLIDADO). `/` NAO e' separador (PO pode
    // ter barra, ex. "123/2026").
    let purchaseOrders
    const rawPurchaseOrders = columnIndex.purchaseOrders >= 0 ? row[columnIndex.purchaseOrders] : ''
    const purchaseOrdersFilled = String(rawPurchaseOrders ?? '').trim() !== ''

    if (purchaseOrdersFilled) {
      if (category !== 'CONSOLIDADO') {
        rowWarnings.push({
          linha: lineNumber,
          motivo: 'POs do consolidado ignoradas (categoria não é CONSOLIDADO).',
        })
      } else {
        const poList = splitMultiValue(rawPurchaseOrders, { allowSlash: false })
        if (poList.length > MAX_PURCHASE_ORDERS) {
          errors.push({
            linha: lineNumber,
            motivo: `Número de POs do consolidado excede o limite de ${MAX_PURCHASE_ORDERS}.`,
          })
          continue
        }
        purchaseOrders = normalizePurchaseOrders(
          poList.map((po) => ({ po, reference: '', supplierName: '' }))
        )
      }
    }

    const validRow = {
      name,
      category,
      processNumber,
      destination: String(
        columnIndex.destination >= 0 ? row[columnIndex.destination] ?? '' : ''
      ).trim().toUpperCase(),
      etd,
      eta,
      etaOriginal: eta,
      containerQuantity: finalContainerQuantity,
      palletQuantity,
      processStatus,
      processNotes,
      supplierName,
      originLocation,
      incoterm,
      forwarderName,
      masterBl,
      houseBl,
      mawb,
      hawb,
      vesselName,
      voyage,
      flightNumber,
      // F17.2d-1 (D-6): a planilha nao suporta itens/IMO - itens seguem
      // sendo lancados no detalhe do processo.
      items: [],
    }

    if (containerResult.containers !== undefined) {
      validRow.containers = containerResult.containers
    }
    if (purchaseOrders !== undefined) {
      validRow.purchaseOrders = purchaseOrders
    }

    validRows.push(validRow)
    warnings.push(...rowWarnings)
  }

  if (validRows.length === 0 && errors.length === 0) {
    throw new Error('Nenhum processo válido encontrado na planilha.')
  }

  return { validRows, errors, warnings }
}
