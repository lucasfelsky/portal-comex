// F17.1b/F17.2b: regras puras de marcos operacionais (historico de eventos).
//
// Este arquivo continua proibido de importar `../core/shared.js` (carrega
// `defineSecret`/`nodemailer` no load) - fica puro e testavel no Node sem
// mocks. Importa `../core/licenses.js` (tambem puro, D-8). Espelha (sem
// importar) trechos de `src/features/processes/deriveProcessStatus.js` e
// `src/features/processes/processStatus.js` porque `functions/` nao pode
// importar de `src/` (o deploy empacota so `functions/`). O teste de
// paridade (`tests/unit/processMilestones.test.js`) compara os dois lados.
//
// Ver PLAN.md secoes D-4 a D-6 (F17.1b) e D-8 (F17.2b, `licenseDeferred`
// multi-orgao) para a tabela de regras e o formato do documento gravado.

import { getComparableLicensesMirror, isLicenseDeferredMirror } from '../core/licenses.js'

function normalizeComparable(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return Boolean(value)
}

function isMaritimeCategory(category) {
  return category === 'FCL' || category === 'LCL' || category === 'CONSOLIDADO'
}

function isAirCategory(category) {
  return category === 'AEREO'
}

// F17.3a (D-7): espelhos de `hasArrivalSignal`/`hasCargoPresenceSignal`
// (`src/features/processes/arrivalCustoms.js`) - sem importar de `src/`
// (deploy so empacota `functions/`). Teste de paridade em
// `tests/unit/processMilestones.test.js`.
export function hasArrivalSignalMirror(process) {
  if (isMaritimeCategory(process?.category)) {
    return hasValue(process?.berthedAt) || process?.berthed === true
  }
  if (isAirCategory(process?.category)) {
    return hasValue(process?.arrivedAt) || process?.arrived === true
  }
  return false
}

export function hasCargoPresenceSignalMirror(process) {
  return hasValue(process?.cargoPresenceInformedAt) || process?.cargoPresenceInformed === true
}

// Espelho de `isDuimpParametrizada` (deriveProcessStatus.js).
function isDuimpParametrizada(process) {
  return normalizeComparable(process?.duimpStatus) === 'parametrizada'
}

function isDuimpRegisteredOrParametrized(duimpStatus) {
  const normalized = normalizeComparable(duimpStatus)
  return (
    normalized === 'aguardando parametrizacao da duimp' ||
    normalized === 'registrada, aguardando parametrizacao' ||
    normalized === 'parametrizada'
  )
}

// Espelho de `isCustomsCleared` (deriveProcessStatus.js:50-56, AD-1).
export function isCustomsClearedMirror(process) {
  if (hasValue(process?.clearanceCompletedAt)) return true
  return (
    isDuimpParametrizada(process) &&
    normalizeComparable(process?.parameterizationChannel) === 'verde'
  )
}

// Espelho de `mapaAllowsCollectionStatus` (processStatus.js:53-56) SEM o
// "vazio libera" (D-4: `licenseDeferred` so dispara com valor NAO vazio).
export function isMapaReleasedMirror(status) {
  const trimmed = String(status ?? '').trim()
  if (!trimmed) return false
  return status === 'Liberado' || status === 'LPCO deferida, MAPA liberado'
}

function isCollectionScheduledStatus(status) {
  return normalizeComparable(status) === 'coleta agendada'
}

// Espelho simplificado de `getCollectionWindows` (src/utils/collectionWindows.js)
// - so o suficiente pra extrair o `scheduledAt` mais recente (dual schema).
function getFirstScheduledAt(process) {
  const windows = Array.isArray(process?.collectionWindows) ? process.collectionWindows : []
  for (const window of windows) {
    const scheduledAt = String(window?.scheduledAt ?? '').trim()
    if (scheduledAt) return scheduledAt
  }
  return String(process?.collectionScheduledAt ?? '').trim()
}

function toIsoString(value) {
  if (value == null) return ''
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  const trimmed = String(value).trim()
  if (!trimmed) return ''

  // datetime-local sem fuso (`YYYY-MM-DDTHH:mm`): interpretar como horario
  // de Brasilia (Brasil sem horario de verao desde 2019) - D-6.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed
    const date = new Date(`${withSeconds}-03:00`)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  // Data pura `YYYY-MM-DD`.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00-03:00`)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

// D-6: cadeia de fallback do `occurredAt`.
export function toIsoOccurredAt({ fieldValue, updatedAt, eventTime } = {}) {
  const fromField = toIsoString(fieldValue)
  if (fromField) return { occurredAt: fromField, occurredAtSource: 'field' }

  const fromUpdatedAt = toIsoString(updatedAt)
  if (fromUpdatedAt) return { occurredAt: fromUpdatedAt, occurredAtSource: 'updatedAt' }

  const fromEventTime = toIsoString(eventTime)
  if (fromEventTime) return { occurredAt: fromEventTime, occurredAtSource: 'eventTime' }

  return { occurredAt: new Date().toISOString(), occurredAtSource: 'eventTime' }
}

function toComparableValue(value) {
  if (value == null) return ''
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return value
}

// D-3: id deterministico da entrega do CloudEvent + tipo (idempotente em
// reentrega). Sanitiza qualquer caractere fora de [A-Za-z0-9_-].
export function buildEventDocId(eventId, type, processId, updatedAt) {
  const sanitize = (value) => String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '_')
  const trimmedEventId = String(eventId ?? '').trim()

  if (trimmedEventId) {
    return sanitize(`${trimmedEventId}_${type}`)
  }

  const updatedAtMillis = (() => {
    if (updatedAt == null) return Date.now()
    if (typeof updatedAt === 'object' && typeof updatedAt.toDate === 'function') {
      return updatedAt.toDate().getTime()
    }
    const date = new Date(updatedAt)
    return Number.isNaN(date.getTime()) ? Date.now() : date.getTime()
  })()

  return sanitize(`${processId}_${updatedAtMillis}_${type}`)
}

// D-4/D-5: tabela de regras. `detect` recebe (before, after) crus e devolve
// `null` (sem evento) ou `{ value, previousValue, occurredAtField? }`.
export const MILESTONE_RULES = [
  // F17.2a (D-9): dispara na transicao !hasValue(shippedAt) -> hasValue.
  // Legado sem `shippedAt` NAO gera (nao ha transicao detectavel). Editar a
  // data depois NAO gera evento novo (mesma semantica dos outros).
  {
    type: 'shipped',
    field: 'shippedAt',
    detect(before, after) {
      if (hasValue(before?.shippedAt)) return null
      if (!hasValue(after?.shippedAt)) return null
      return { value: after.shippedAt, previousValue: '', occurredAtField: after.shippedAt }
    },
  },
  // F17.3a (D-7): sinal compat (`berthedAt` OU `berthed` legado) em vez do
  // bool isolado; `field` passa a ser a data. `value`/`occurredAtField` = a
  // data quando houver, senao `true` (legado sem data - compat, mesma regra
  // do bool). `previousValue` continua `false` (transicao sinal-antes
  // `false` -> sinal-depois `true` - o "antes" desta regra sempre parte de
  // "sem sinal").
  {
    type: 'berthed',
    field: 'berthedAt',
    detect(before, after) {
      if (!isMaritimeCategory(after?.category)) return null
      if (hasArrivalSignalMirror(before)) return null
      if (!hasArrivalSignalMirror(after)) return null
      const dateValue = hasValue(after?.berthedAt) ? after.berthedAt : null
      return { value: dateValue ?? true, previousValue: false, occurredAtField: dateValue }
    },
  },
  {
    type: 'arrived',
    field: 'arrivedAt',
    detect(before, after) {
      if (!isAirCategory(after?.category)) return null
      if (hasArrivalSignalMirror(before)) return null
      if (!hasArrivalSignalMirror(after)) return null
      const dateValue = hasValue(after?.arrivedAt) ? after.arrivedAt : null
      return { value: dateValue ?? true, previousValue: false, occurredAtField: dateValue }
    },
  },
  {
    type: 'cargoPresence',
    field: 'cargoPresenceInformedAt',
    detect(before, after) {
      if (hasCargoPresenceSignalMirror(before)) return null
      if (!hasCargoPresenceSignalMirror(after)) return null
      const dateValue = hasValue(after?.cargoPresenceInformedAt) ? after.cargoPresenceInformedAt : null
      return { value: dateValue ?? true, previousValue: false, occurredAtField: dateValue }
    },
  },
  {
    type: 'duimpRegistered',
    field: 'duimpStatus',
    detect(before, after) {
      if (isDuimpRegisteredOrParametrized(before?.duimpStatus)) return null
      if (!isDuimpRegisteredOrParametrized(after?.duimpStatus)) return null
      return { value: after?.duimpStatus ?? '', previousValue: before?.duimpStatus ?? '' }
    },
  },
  {
    type: 'parameterized',
    field: 'parameterizationChannel',
    detect(before, after) {
      const wasParametrized =
        isDuimpParametrizada(before) && hasValue(before?.parameterizationChannel)
      const isParametrized =
        isDuimpParametrizada(after) && hasValue(after?.parameterizationChannel)
      if (wasParametrized || !isParametrized) return null
      return {
        value: after?.parameterizationChannel ?? '',
        previousValue: before?.parameterizationChannel ?? '',
      }
    },
  },
  {
    type: 'cleared',
    field: 'clearanceCompletedAt',
    detect(before, after) {
      if (isCustomsClearedMirror(before)) return null
      if (!isCustomsClearedMirror(after)) return null
      const value = hasValue(after?.clearanceCompletedAt)
        ? after.clearanceCompletedAt
        : 'Canal Verde'
      return {
        value,
        previousValue: before?.clearanceCompletedAt ?? '',
        occurredAtField: hasValue(after?.clearanceCompletedAt) ? after.clearanceCompletedAt : null,
      }
    },
  },
  {
    // F17.2b (D-8): multi-orgao - compara `licenses[]` por `id` (via
    // `getComparableLicensesMirror`, que ja aplica a compat de leitura
    // MAPA - D-3). Um evento por licenca recem-deferida no mesmo save
    // (`idSuffix` evita colisao de doc id).
    type: 'licenseDeferred',
    field: 'licenses',
    detect(before, after) {
      const beforeLicenses = getComparableLicensesMirror(before)
      const afterLicenses = getComparableLicensesMirror(after)

      const events = []
      for (const license of afterLicenses) {
        if (!isLicenseDeferredMirror(license.status)) continue
        const beforeLicense = beforeLicenses.find((item) => item.id === license.id)
        if (beforeLicense && isLicenseDeferredMirror(beforeLicense.status)) continue

        events.push({
          value: license.agency,
          previousValue: beforeLicense?.status ?? '',
          occurredAtField: license.deferredAt || null,
          idSuffix: license.id,
        })
      }
      return events
    },
  },
  {
    type: 'collectionScheduled',
    field: 'collectionStatus',
    detect(before, after) {
      if (isCollectionScheduledStatus(before?.collectionStatus)) return null
      if (!isCollectionScheduledStatus(after?.collectionStatus)) return null
      return {
        value: getFirstScheduledAt(after),
        previousValue: before?.collectionStatus ?? '',
      }
    },
  },
  {
    type: 'received',
    field: 'processStatus',
    detect(before, after) {
      if (String(before?.processStatus ?? '').trim() === 'Carga recebida') return null
      if (String(after?.processStatus ?? '').trim() !== 'Carga recebida') return null
      return {
        value: after?.cargoReceivedAt ?? '',
        previousValue: before?.processStatus ?? '',
        occurredAtField: after?.cargoReceivedAt ?? null,
      }
    },
  },
  {
    type: 'statusChanged',
    field: 'processStatus',
    detect(before, after) {
      const beforeStatus = String(before?.processStatus ?? '').trim()
      const afterStatus = String(after?.processStatus ?? '').trim()
      if (!afterStatus) return null
      if (beforeStatus === afterStatus) return null
      return { value: afterStatus, previousValue: beforeStatus }
    },
  },
]

// D-5/D-6: monta os documentos de evento a partir de (before, after).
// `repairText` e injetavel (default identidade); o trigger injeta
// `repairTextEncoding` de `shared.js`. Nao acrescenta `recordedAt` (o
// trigger acrescenta o `serverTimestamp`, mantendo a funcao pura).
export function buildMilestoneEvents(before, after, { processId, eventId, eventTime, repairText } = {}) {
  const repair = typeof repairText === 'function' ? repairText : (value) => value
  const actorId = String(after?.updatedById ?? '').trim()
  const actorName = repair(String(after?.updatedByName ?? '').trim())
  const events = []

  for (const rule of MILESTONE_RULES) {
    const detectedResult = rule.detect(before, after)
    if (!detectedResult) continue

    // F17.2b (D-8): `detect` pode devolver um unico objeto (regras
    // legadas) ou um array (licenseDeferred multi-orgao - 0..N licencas
    // recem-deferidas no mesmo save).
    const detectedList = Array.isArray(detectedResult) ? detectedResult : [detectedResult]

    for (const detected of detectedList) {
      const { occurredAt, occurredAtSource } = toIsoOccurredAt({
        fieldValue: detected.occurredAtField ?? undefined,
        updatedAt: after?.updatedAt,
        eventTime,
      })

      const data = {
        type: rule.type,
        field: rule.field,
        value: toComparableValue(detected.value) ?? '',
        previousValue: toComparableValue(detected.previousValue) ?? '',
        actorId,
        actorName,
        occurredAt,
        occurredAtSource,
        processId,
      }

      for (const key of Object.keys(data)) {
        if (data[key] === undefined) data[key] = ''
      }

      // `idSuffix` (D-8) evita colisao quando o mesmo `rule.type` gera mais
      // de um evento no mesmo save (2 licencas deferidas juntas).
      const eventType = detected.idSuffix ? `${rule.type}_${detected.idSuffix}` : rule.type

      events.push({
        id: buildEventDocId(eventId, eventType, processId, after?.updatedAt),
        data,
      })
    }
  }

  return events
}
