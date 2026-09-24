// F17.3a (D-1): camada pura de compatibilidade para chegada (atracacao
// maritima / chegada aerea), CE/terminal, free time e presenca de carga.
// F17.3b (D-1): DUIMP completa (numero + datas de registro/parametrizacao),
// conferencia/exigencia por canal, pre-preenchimento do desembaraco no
// Verde. ZERO imports - roda no app, no script de migracao (Node ESM puro) e
// e' seguro pro mock fechado de `tests/ui/ProcessesPage.test.jsx`. Categorias
// e texto comparados por literal/normalizacao LOCAL (mesmo padrao de
// `./licenses.js`, D-1 do F17.2b). Ver PLAN.md secao "Decisoes tomadas" D-1.

export const FREE_TIME_CATEGORIES = ['FCL', 'CONSOLIDADO']
export const CE_HOUSE_CATEGORIES = ['LCL', 'CONSOLIDADO']
export const APPROX_DATE_FIELDS = ['berthedAt', 'arrivedAt']

export const DUIMP_STATUS_WAITING_REGISTRATION = 'Aguardando registro da DUIMP'
export const DUIMP_STATUS_WAITING_PARAMETERIZATION = 'Aguardando parametrização da DUIMP'
export const DUIMP_STATUS_PARAMETERIZED = 'Parametrizada'
export const CUSTOMS_INSPECTION_CHANNELS = ['Amarelo', 'Vermelho']
export const CUSTOMS_REQUIREMENT_CHANNELS = ['Amarelo', 'Vermelho', 'Cinza']
export const CUSTOMS_DATE_FIELDS = ['duimpRegisteredAt', 'parameterizedAt']

// F17.3b (D-1): objeto congelado usado em TODOS os ramos de "limpa tudo" da
// pagina e do repositorio no lugar do trio literal
// `duimpStatus`/`parameterizationChannel`/`clearanceCompletedAt`.
export const EMPTY_CUSTOMS_CLEARANCE_FIELDS = Object.freeze({
  duimpStatus: '',
  parameterizationChannel: '',
  clearanceCompletedAt: '',
  duimpNumber: '',
  duimpRegisteredAt: '',
  parameterizedAt: '',
  customsInspectionScheduledAt: '',
  customsRequirement: false,
  customsRequirementNotes: '',
})

function isMaritimeCategoryLocal(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

function isAirCategoryLocal(category) {
  return category === 'AEREO'
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function hasDateValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return false
}

// D-1: NUNCA `toISOString()` - horario local (`getFullYear/getMonth/...`)
// pra nao virar o dia anterior em BRT (UTC-3).
export function normalizeDateTimeLocal(value) {
  if (value == null) return ''

  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const date = value.toDate()
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  const trimmed = String(value).trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return trimmed.slice(0, 16)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00`
  }

  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

// D-1: `0` e' valor VALIDO ("sem free time"), distinto de "nao informado"
// (`null`). NAO usar `normalizeInteger`/`normalizeDecimal` de
// `operationalOptions.js` (devolvem 0 pra entrada invalida).
export function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

export function normalizeOptionalDecimal(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).trim().replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

// Mesma semantica da funcao privada `hasArrivalSignal` de
// `deriveProcessStatus.js` (D-15 - o arquivo passa a importar daqui).
export function hasArrivalSignal(process) {
  if (isMaritimeCategoryLocal(process?.category)) {
    return hasDateValue(process?.berthedAt) || process?.berthed === true
  }
  if (isAirCategoryLocal(process?.category)) {
    return hasDateValue(process?.arrivedAt) || process?.arrived === true
  }
  return false
}

export function hasCargoPresenceSignal(process) {
  return hasDateValue(process?.cargoPresenceInformedAt) || process?.cargoPresenceInformed === true
}

// F17.3b (D-1): normalizacao de texto LOCAL (mesmo padrao de
// `normalizeComparableText` de `./processStatus.js`, mas sem import - este
// arquivo continua ZERO imports).
function normalizeComparableLocal(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// F17.3b (D-1): mesmo vocabulario da (agora removida) `canonicalizeDuimpStatus`
// de `processesRepository.js`. `duimpStatus` gravado ->
// 1 (aguardando registro) / 2 (aguardando parametrizacao) / 3 (parametrizada)
// / 0 (vazio ou desconhecido).
export function getLegacyDuimpLevel(duimpStatus) {
  const normalized = normalizeComparableLocal(duimpStatus)
  if (normalized === 'aguardando registro' || normalized === 'aguardando registro da duimp') return 1
  if (
    normalized === 'registrada, aguardando parametrizacao' ||
    normalized === 'aguardando parametrizacao da duimp'
  ) {
    return 2
  }
  if (normalized === 'parametrizada') return 3
  return 0
}

// F17.3b (D-1): nivel pelas DATAS (fonte nova) + presenca de carga (nivel 1,
// mesma semantica do legado "aguardando registro").
export function getDateDuimpLevel(process) {
  if (hasDateValue(process?.parameterizedAt)) return 3
  if (hasDateValue(process?.duimpRegisteredAt)) return 2
  if (hasCargoPresenceSignal(process)) return 1
  return 0
}

// F17.3b (D-1): maior dos dois niveis - data OU legado, o que estiver mais
// avancado vence (compat com doc antigo sem as datas novas).
export function getEffectiveDuimpLevel(process) {
  return Math.max(getDateDuimpLevel(process), getLegacyDuimpLevel(process?.duimpStatus))
}

export function hasDuimpRegistrationSignal(process) {
  return getEffectiveDuimpLevel(process) >= 2
}

export function hasParameterizationSignal(process) {
  return getEffectiveDuimpLevel(process) >= 3
}

export function isLegacyDuimpRegisteredWithoutDate(process) {
  return getLegacyDuimpLevel(process?.duimpStatus) >= 2 && !hasDateValue(process?.duimpRegisteredAt)
}

export function isLegacyParameterizedWithoutDate(process) {
  return getLegacyDuimpLevel(process?.duimpStatus) === 3 && !hasDateValue(process?.parameterizedAt)
}

// F17.3b (D-1): `duimpStatus` DERIVADO das datas (com fallback pro legado,
// salvo `ignoreLegacy`). Presenca de carga sozinha NUNCA vira "Aguardando
// registro" (evita notificacao espuria no 1o save - ver D-8 do PLAN.md).
export function deriveDuimpStatus(process, { ignoreLegacy = false } = {}) {
  const level = ignoreLegacy ? getDateDuimpLevel(process) : getEffectiveDuimpLevel(process)

  if (level === 3) return DUIMP_STATUS_PARAMETERIZED
  if (level === 2) return DUIMP_STATUS_WAITING_PARAMETERIZATION
  if (!ignoreLegacy && getLegacyDuimpLevel(process?.duimpStatus) === 1) {
    return DUIMP_STATUS_WAITING_REGISTRATION
  }
  return ''
}

// F17.3b (D-1): limpeza/derivacao dos 9 campos de liberacao (DUIMP + canal +
// conferencia + exigencia + desembaraco) - mesmo padrao de
// `sanitizeArrivalFields`. So' recebe os campos que le; o chamador espalha o
// resultado por cima do objeto normalizado.
export function sanitizeCustomsClearanceFields(process, { trimText = true } = {}) {
  if (!hasCargoPresenceSignal(process)) {
    return { ...EMPTY_CUSTOMS_CLEARANCE_FIELDS }
  }

  const duimpNumberRaw = String(process?.duimpNumber ?? '')
  const duimpNumber = trimText ? duimpNumberRaw.trim() : duimpNumberRaw
  const duimpRegisteredAt = normalizeDateTimeLocal(process?.duimpRegisteredAt)
  const parameterizedAt = normalizeDateTimeLocal(process?.parameterizedAt)
  const duimpStatus = deriveDuimpStatus({ ...process, duimpRegisteredAt, parameterizedAt })
  const level3 = duimpStatus === DUIMP_STATUS_PARAMETERIZED
  const parameterizationChannel = level3 ? String(process?.parameterizationChannel ?? '') : ''
  const clearanceCompletedAt = level3 ? String(process?.clearanceCompletedAt ?? '') : ''
  const isInspectionChannel = CUSTOMS_INSPECTION_CHANNELS.includes(parameterizationChannel)
  const isRequirementChannel = CUSTOMS_REQUIREMENT_CHANNELS.includes(parameterizationChannel)
  const customsInspectionScheduledAt =
    level3 && isInspectionChannel ? normalizeDateTimeLocal(process?.customsInspectionScheduledAt) : ''
  const customsRequirement = level3 && isRequirementChannel && process?.customsRequirement === true
  const isCinza = parameterizationChannel === 'Cinza'
  const showRequirementNotes = level3 && (isCinza || (isInspectionChannel && customsRequirement))
  const customsRequirementNotesRaw = String(process?.customsRequirementNotes ?? '')
  const customsRequirementNotes = showRequirementNotes
    ? trimText
      ? customsRequirementNotesRaw.trim()
      : customsRequirementNotesRaw
    : ''

  return {
    duimpNumber,
    duimpRegisteredAt,
    parameterizedAt,
    duimpStatus,
    parameterizationChannel,
    clearanceCompletedAt,
    customsInspectionScheduledAt,
    customsRequirement,
    customsRequirementNotes,
  }
}

// F17.3b (D-1): edicao de `duimpRegisteredAt`/`parameterizedAt`/
// `parameterizationChannel` no draft - recalcula `duimpStatus` pelas datas
// (descarta o legado ao limpar uma data) e pre-preenche o desembaraco no
// Verde (D-4).
export function applyCustomsEdit(draft, field, value) {
  if (field === 'duimpRegisteredAt' || field === 'parameterizedAt') {
    const next = { ...draft, [field]: value }
    next.duimpStatus = deriveDuimpStatus(next, { ignoreLegacy: !hasDateValue(value) })

    if (field === 'parameterizedAt' && draft?.parameterizationChannel === 'Verde') {
      if (!hasDateValue(draft?.clearanceCompletedAt) || draft?.clearanceCompletedAt === draft?.parameterizedAt) {
        next.clearanceCompletedAt = value
      }
    }

    return next
  }

  if (field === 'parameterizationChannel') {
    const next = { ...draft, parameterizationChannel: value }

    if (value === 'Verde' && !hasDateValue(draft?.clearanceCompletedAt) && hasDateValue(draft?.parameterizedAt)) {
      next.clearanceCompletedAt = draft.parameterizedAt
    } else if (
      draft?.parameterizationChannel === 'Verde' &&
      value !== 'Verde' &&
      draft?.clearanceCompletedAt === draft?.parameterizedAt
    ) {
      next.clearanceCompletedAt = ''
    }

    return next
  }

  return { ...draft, [field]: value }
}

export function isLegacyArrivalWithoutDate(process) {
  if (isMaritimeCategoryLocal(process?.category)) {
    return process?.berthed === true && !hasDateValue(process?.berthedAt)
  }
  if (isAirCategoryLocal(process?.category)) {
    return process?.arrived === true && !hasDateValue(process?.arrivedAt)
  }
  return false
}

export function isLegacyCargoPresenceWithoutDate(process) {
  return process?.cargoPresenceInformed === true && !hasDateValue(process?.cargoPresenceInformedAt)
}

export function isApproxDate(process, field) {
  return Array.isArray(process?.migratedApproxFields) && process.migratedApproxFields.includes(field)
}

// D-1: so' as strings de `APPROX_DATE_FIELDS`, dedup, e so' as que AINDA tem
// data preenchida no processo (o marcador cai sozinho quando a data e'
// limpa/editada).
export function normalizeMigratedApproxFields(raw, process) {
  if (!Array.isArray(raw)) return []
  const deduped = [...new Set(raw.filter((field) => APPROX_DATE_FIELDS.includes(field)))]
  return deduped.filter((field) => hasDateValue(process?.[field]))
}

// D-1: so' pra `berthedAt`/`arrivedAt`/`cargoPresenceInformedAt` - grava a
// data, espelha o bool legado (preencher -> true; limpar -> false) e remove
// o campo de `migratedApproxFields` (a edicao manual encerra a aproximacao).
export function applyArrivalDateEdit(draft, field, value) {
  if (field !== 'berthedAt' && field !== 'arrivedAt' && field !== 'cargoPresenceInformedAt') {
    return { ...draft, [field]: value }
  }

  const boolField =
    field === 'berthedAt' ? 'berthed' : field === 'arrivedAt' ? 'arrived' : 'cargoPresenceInformed'
  const nextHasDate = hasDateValue(value)
  const migratedApproxFields = Array.isArray(draft?.migratedApproxFields)
    ? draft.migratedApproxFields.filter((item) => item !== field)
    : []

  return {
    ...draft,
    [field]: value,
    [boolField]: nextHasDate,
    migratedApproxFields,
  }
}

// D-1: limpeza por categoria dos campos novos - mesmo padrao de
// `sanitizeCargoAndTransitFields` (F17.2a). So' recebe os campos que le; o
// chamador espalha o resultado por cima do objeto normalizado.
export function sanitizeArrivalFields(process) {
  const category = process?.category
  const migratedApproxFields = normalizeMigratedApproxFields(process?.migratedApproxFields, process)

  if (isMaritimeCategoryLocal(category)) {
    const berthedAt = normalizeDateTimeLocal(process?.berthedAt)
    const berthed = hasArrivalSignal({ category, berthedAt, berthed: process?.berthed })

    return {
      berthedAt,
      arrivedAt: '',
      berthed,
      arrived: false,
      ceMercante: String(process?.ceMercante ?? '').trim(),
      ceHouse: CE_HOUSE_CATEGORIES.includes(category) ? String(process?.ceHouse ?? '').trim() : '',
      terminalName: String(process?.terminalName ?? '').trim(),
      freeTimeDays: FREE_TIME_CATEGORIES.includes(category)
        ? normalizeOptionalInteger(process?.freeTimeDays)
        : null,
      demurrageDailyRateUsd: FREE_TIME_CATEGORIES.includes(category)
        ? normalizeOptionalDecimal(process?.demurrageDailyRateUsd)
        : null,
      migratedApproxFields,
    }
  }

  if (isAirCategoryLocal(category)) {
    const arrivedAt = normalizeDateTimeLocal(process?.arrivedAt)
    const arrived = hasArrivalSignal({ category, arrivedAt, arrived: process?.arrived })

    return {
      berthedAt: '',
      arrivedAt,
      berthed: false,
      arrived,
      ceMercante: '',
      ceHouse: '',
      terminalName: String(process?.terminalName ?? '').trim(),
      freeTimeDays: null,
      demurrageDailyRateUsd: null,
      migratedApproxFields,
    }
  }

  return {
    berthedAt: '',
    arrivedAt: '',
    berthed: false,
    arrived: false,
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: null,
    demurrageDailyRateUsd: null,
    migratedApproxFields: [],
  }
}

function toLocalDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// D-1 (A1): prazo de devolucao do vazio conta da PRESENCA DE CARGA (nao da
// atracacao). So' FCL/CONSOLIDADO (`FREE_TIME_CATEGORIES`).
export function getFreeTimeStatus(process, today = new Date()) {
  if (!FREE_TIME_CATEGORIES.includes(process?.category)) return null

  if (process?.freeTimeDays == null) {
    return { state: 'not-informed', deadlineKey: null, daysRemaining: null }
  }

  if (!hasCargoPresenceSignal(process)) {
    return { state: 'waiting-presence', deadlineKey: null, daysRemaining: null }
  }

  if (!hasDateValue(process?.cargoPresenceInformedAt)) {
    return { state: 'presence-without-date', deadlineKey: null, daysRemaining: null }
  }

  const containers = Array.isArray(process?.containers) ? process.containers : []
  if (containers.length > 0 && containers.every((container) => hasDateValue(container?.returnedAt))) {
    return { state: 'closed', deadlineKey: null, daysRemaining: null }
  }

  const presenceDateKey = String(process.cargoPresenceInformedAt).slice(0, 10)
  const [year, month, day] = presenceDateKey.split('-').map(Number)
  const deadlineDate = new Date(year, month - 1, day + Number(process.freeTimeDays))
  const deadlineKey = toLocalDateKey(deadlineDate)

  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysRemaining = Math.round((deadlineDate.getTime() - todayDate.getTime()) / 86400000)

  let state = 'running'
  if (daysRemaining === 0) state = 'due-today'
  else if (daysRemaining < 0) state = 'overdue'

  return { state, deadlineKey, daysRemaining }
}
