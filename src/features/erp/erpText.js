// Conciliacao ERP (DBCorp) x Portal - F1 (somente leitura). Normalizadores
// puros do nucleo: texto, datas, quantidade, navio, documentos, REF do
// embarque. ZERO imports (camada base: todos os outros modulos de
// `src/features/erp/` importam daqui, nunca o contrario).
//
// Regras de data (D-8, fuso): toda aritmetica de data usa `Date.UTC` +
// `getUTC*`. PROIBIDO neste modulo: conversao para ISO via objeto Date,
// construir Date a partir de string, `Date.parse` e getters locais - o CI roda
// em UTC e esconde o bug que o Lucas veria em BRT (UTC-3).

// Lista local de incoterms. A paridade com `INCOTERM_OPTIONS`
// (`operationalOptions.js`) e' garantida por teste, sem importar o modulo.
export const INCOTERMS = [
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
]

// Incoterms em que o local da REF e' a origem (grupos E e F). Nos grupos C e D
// o local e' o destino e nao serve de dica de origem.
export const ORIGIN_INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB']

const MS_PER_DAY = 86400000
// Serial do Excel (sistema 1900) para 1970-01-01.
const UNIX_EPOCH_SERIAL = 25569
// 2000-01-01 .. 2099-12-31 em serial do Excel.
const SERIAL_MIN = 36526
const SERIAL_MAX = 73050

const VESSEL_PLACEHOLDERS = ['AMOSTRA', 'COURIER', 'NACIONAL']

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatUtcDate(ms) {
  const date = new Date(ms)
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

// Valida o calendario por ida e volta (31/02 nao existe).
function buildCalendarDate(year, month, day) {
  const ms = Date.UTC(year, month - 1, day)
  const probe = new Date(ms)
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return ''
  }
  return formatUtcDate(ms)
}

// NBSP vira espaco, espacos colapsados, trim. `" "` vira `''`.
export function cleanCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return ''
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

// NFD, sem diacritico, maiusculas, espacos colapsados.
export function foldText(value) {
  return cleanCell(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Documento (BL/AWB/DI): maiusculas, so' [A-Z0-9].
export function normalizeDocNumber(value) {
  return foldText(value).replace(/[^A-Z0-9]/g, '')
}

// So' os digitos, sem zero a esquerda ('PO-09036' -> '9036'; '0' -> '0').
// Sem nenhum digito -> '' (e '' NUNCA casa com nada).
export function digitsOnly(value) {
  const digits = cleanCell(value).replace(/\D/g, '')
  if (digits === '') return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed === '' ? '0' : trimmed
}

// -> { date: 'YYYY-MM-DD' | '', warning: codigo | null }
export function parseErpDate(value) {
  const empty = { date: '', warning: null }
  if (value === null || value === undefined || value === '') return empty
  if (value instanceof Date) return { date: '', warning: 'data_invalida' }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { date: '', warning: 'data_invalida' }
    const whole = Math.floor(value)
    if (whole < SERIAL_MIN || whole > SERIAL_MAX) {
      return { date: '', warning: 'data_fora_do_intervalo' }
    }
    return {
      date: formatUtcDate((whole - UNIX_EPOCH_SERIAL) * MS_PER_DAY),
      warning: whole !== value ? 'data_com_hora' : null,
    }
  }

  if (typeof value !== 'string') return { date: '', warning: 'data_invalida' }

  const text = cleanCell(value)
  if (text === '') return empty

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (match) {
    const date = buildCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    return date ? { date, warning: null } : { date: '', warning: 'data_invalida' }
  }

  match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    const date = buildCalendarDate(Number(match[3]), month, day)
    if (!date) return { date: '', warning: 'data_invalida' }
    // Dia <= 12 admite a leitura MM/DD; com dia = mes as duas leituras coincidem.
    return { date, warning: day <= 12 && day !== month ? 'data_ambigua' : null }
  }

  match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(text)
  if (match) {
    // Com fuso (Z/offset) a data depende de uma decisao da F5: nao adivinha.
    if (match[7]) return { date: '', warning: 'data_com_fuso' }
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = match[6] === undefined ? 0 : Number(match[6])
    if (hour > 23 || minute > 59 || second > 59) return { date: '', warning: 'data_invalida' }
    const date = buildCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    return date ? { date, warning: null } : { date: '', warning: 'data_invalida' }
  }

  return { date: '', warning: 'data_invalida' }
}

// Dias de isoA ate isoB (positivo quando B e' depois). null se algum for invalido.
export function daysBetween(isoA, isoB) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleanCell(isoA))
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(cleanCell(isoB))
  if (!a || !b) return null
  const msA = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const msB = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.round((msB - msA) / MS_PER_DAY)
}

// -> { value: number | null, warning: 'quantidade_invalida' | null }
export function parseQuantityKg(value) {
  const invalid = { value: null, warning: 'quantidade_invalida' }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? { value, warning: null } : invalid
  }
  let text = cleanCell(value).replace(/\s/g, '')
  if (text === '') return invalid
  if (text.includes(',')) {
    // pt-BR: '1.234,56' -> remove o separador de milhar e troca a virgula.
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(text)) {
    // Sem virgula, so' grupos de 3 digitos apos o ponto: milhar ('1.234' -> 1234).
    // '0.500' e '1.5' nao casam e seguem como decimal.
    text = text.replace(/\./g, '')
  }
  // Quantidade nunca e' negativa: o sinal '-' nao e' aceito.
  if (!/^\+?(?:\d+\.?\d*|\.\d+)$/.test(text)) return invalid
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 ? { value: parsed, warning: null } : invalid
}

// Taxas (IPI/II): fracao como numero. Vazio ou invalido -> null.
export function parseRate(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = cleanCell(value).replace(/\s/g, '')
  if (text === '') return null
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

// Formatos: `NOME/VIAGEM`, `NOME / V`, `NOME (VIAGEM)` e `NOME VIAGEM`
// (ultima palavra com digito). Placeholders -> vazio.
export function parseVessel(raw) {
  const text = cleanCell(raw)
  if (text === '' || VESSEL_PLACEHOLDERS.includes(foldText(text))) {
    return { name: '', voyage: '' }
  }

  const parenthesis = /^(.*\S)\s*\(([^()]*)\)$/.exec(text)
  if (parenthesis) {
    return { name: cleanCell(parenthesis[1]), voyage: cleanCell(parenthesis[2]) }
  }

  const slash = text.lastIndexOf('/')
  if (slash > 0 && cleanCell(text.slice(0, slash)) !== '') {
    return { name: cleanCell(text.slice(0, slash)), voyage: cleanCell(text.slice(slash + 1)) }
  }

  const lastWord = /^(.*\S)\s+(\S*\d\S*)$/.exec(text)
  if (lastWord) {
    return { name: cleanCell(lastWord[1]), voyage: cleanCell(lastWord[2]) }
  }

  return { name: text, voyage: '' }
}

// Forma comparavel do navio: fold, sem `V-`/`V.`/`VOY` no comeco da viagem,
// so' [A-Z0-9]. Invariante a onde a viagem foi separada.
export function squashVessel(name, voyage = '') {
  const cleanVoyage = foldText(voyage).replace(/^(?:VOY\.?|V[-.])\s*/, '')
  return (foldText(name) + cleanVoyage).replace(/[^A-Z0-9]/g, '')
}

// Classificacao do embarque pela REF (nunca pela palavra SAMPLE da PO).
// -> { shipmentKind, consolidatedRef, incoterm, originHint, warning }
//   warning: null | 'aereo_inferido' | 'ref_desconhecida'
export function parseRefEmbarque(ref, poRef = '') {
  const folded = foldText(ref)
  const base = { shipmentKind: 'INDEFINIDO', consolidatedRef: '', incoterm: '', originHint: '', warning: null }

  // 1. CON CN|DG nnn-aa
  const consolidated = /^CON (CN|DG) (\d{3})-(\d{2})\b/.exec(folded)
  if (consolidated) {
    return {
      ...base,
      shipmentKind: 'CONSOLIDADO',
      consolidatedRef: `CON ${consolidated[1]} ${consolidated[2]}-${consolidated[3]}`,
    }
  }

  // 2. FCL|LCL - <INCOTERM> <LOCAL> (antes do aereo: FCL - FCA <LOCAL> e' FCL).
  const modal = /^(FCL|LCL)\b(.*)$/.exec(folded)
  if (modal) {
    const rest = modal[2].replace(/^\s*[-–—]?\s*/, '')
    const incotermMatch = new RegExp(`^(${INCOTERMS.join('|')})(?:\\s+(.*))?$`).exec(rest)
    // O local so' e' origem nos incoterms de origem (E/F); nos C/D e' destino.
    const hasOrigin = incotermMatch && ORIGIN_INCOTERMS.includes(incotermMatch[1])
    return {
      ...base,
      shipmentKind: modal[1],
      incoterm: incotermMatch ? incotermMatch[1] : '',
      originHint: hasOrigin && incotermMatch[2] ? incotermMatch[2].trim() : '',
    }
  }

  // 3. AMOSTRA / COURIER
  if (/^(AMOSTRA|COURIER)\b/.test(folded)) return { ...base, shipmentKind: 'AMOSTRA' }

  // 4. NACIONAL
  if (/^NACIONAL\b/.test(folded)) return { ...base, shipmentKind: 'NACIONAL' }

  // 5. Hipotese D-9b: REF DAP|FCA + local, ou token AIR na PO.
  const air = /^(DAP|FCA)(?:\s*[-–—]\s*|\s+)(\S.*)$/.exec(folded)
  if (air) {
    return {
      ...base,
      shipmentKind: 'AEREO',
      incoterm: air[1],
      originHint: air[1] === 'FCA' ? air[2].trim() : '',
      warning: 'aereo_inferido',
    }
  }
  if (/\bAIR\b/.test(foldText(poRef))) {
    return { ...base, shipmentKind: 'AEREO', warning: 'aereo_inferido' }
  }

  // 6. O resto.
  return { ...base, warning: 'ref_desconhecida' }
}

// 'ok' (igual apos fold) | 'formato' (um comeca pelo outro) | 'diverge'.
export function supplierMatches(portal, erp) {
  const a = foldText(portal)
  const b = foldText(erp)
  if (a === '' || b === '') return 'diverge'
  if (a === b) return 'ok'
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (longer.startsWith(shorter) && !/[A-Z0-9]/.test(longer.charAt(shorter.length))) {
    return 'formato'
  }
  return 'diverge'
}

// Aviso padrao do nucleo: `ref` sempre com as 5 chaves.
export function makeErpWarning(code, message, ref = {}) {
  return {
    code,
    message,
    ref: {
      rowNumber: ref.rowNumber ?? null,
      itemId: ref.itemId ?? '',
      pedido: ref.pedido ?? '',
      shipmentKey: ref.shipmentKey ?? '',
      processId: ref.processId ?? '',
    },
  }
}

function compareText(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// Ordem dos avisos: code, rowNumber (null por ultimo), itemId, pedido; o
// restante so' desempata para a saida ser deterministica.
export function compareErpWarnings(a, b) {
  const byCode = compareText(a.code, b.code)
  if (byCode !== 0) return byCode
  const rowA = a.ref.rowNumber
  const rowB = b.ref.rowNumber
  if (rowA !== rowB) {
    if (rowA === null) return 1
    if (rowB === null) return -1
    return rowA - rowB
  }
  return (
    compareText(a.ref.itemId, b.ref.itemId) ||
    compareText(a.ref.pedido, b.ref.pedido) ||
    compareText(a.ref.shipmentKey, b.ref.shipmentKey) ||
    compareText(a.ref.processId, b.ref.processId) ||
    compareText(a.message, b.message)
  )
}
