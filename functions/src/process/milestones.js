// F17.1b: regras puras de marcos operacionais (historico de eventos).
//
// Este arquivo NAO importa nada (nem `../core/shared.js`, que carrega
// `defineSecret`/`nodemailer` no load) - fica puro e testavel no Node sem
// mocks. Espelha (sem importar) trechos de `src/features/processes/
// deriveProcessStatus.js` e `src/features/processes/processStatus.js`
// porque `functions/` nao pode importar de `src/` (o deploy empacota so
// `functions/`). O teste de paridade (`tests/unit/processMilestones.test.js`)
// compara os dois lados.
//
// Ver PLAN.md secoes D-4 a D-6 para a tabela de regras e o formato do
// documento gravado.

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
  {
    type: 'berthed',
    field: 'berthed',
    detect(before, after) {
      if (!isMaritimeCategory(after?.category)) return null
      if (before?.berthed === true) return null
      if (after?.berthed !== true) return null
      return { value: true, previousValue: false }
    },
  },
  {
    type: 'arrived',
    field: 'arrived',
    detect(before, after) {
      if (!isAirCategory(after?.category)) return null
      if (before?.arrived === true) return null
      if (after?.arrived !== true) return null
      return { value: true, previousValue: false }
    },
  },
  {
    type: 'cargoPresence',
    field: 'cargoPresenceInformed',
    detect(before, after) {
      if (before?.cargoPresenceInformed === true) return null
      if (after?.cargoPresenceInformed !== true) return null
      return { value: true, previousValue: false }
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
    type: 'licenseDeferred',
    field: 'mapaStatus',
    detect(before, after) {
      if (isMapaReleasedMirror(before?.mapaStatus)) return null
      if (!isMapaReleasedMirror(after?.mapaStatus)) return null
      return { value: 'MAPA', previousValue: before?.mapaStatus ?? '' }
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
    const detected = rule.detect(before, after)
    if (!detected) continue

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

    events.push({
      id: buildEventDocId(eventId, rule.type, processId, after?.updatedAt),
      data,
    })
  }

  return events
}
