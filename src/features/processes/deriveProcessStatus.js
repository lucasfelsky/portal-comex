// F17.1a/F17.2a/F17.2b: camada de compatibilidade para o `processStatus`
// derivado. Funcao pura (sem React, sem firebase) - roda no app E no script
// de migracao (Node puro). Ver PLAN.md secoes "Decisoes tomadas" (D-A a D-G,
// D-3 do F17.2a; D-4 do F17.2b) para o raciocinio completo.
//
// F17.2a (D-3): `shippedAt` encerra o select manual pre-chegada. Os ramos
// de `shippedAt` (linhas 8 e 9 da tabela D-B) agora usam `hasShippedSignal`
// - sinal real (`shippedAt` preenchido) OU legado (processo gravado num
// status pos-embarque antes do F17.2a, sem `shippedAt`). O fallback final
// (sem nenhum sinal) e' sempre 'Aguardando Embarque'.
//
// F17.2b (D-4): o gate de coleta (linha 3 da derivacao) usa `licenses[]`
// multi-orgao (`isCollectionReleased`) em vez da checagem privada de MAPA -
// `areLicensesCleared` mora agora em `./licenses.js` (fonte unica,
// AEREO incluido).

import { normalizeComparableText, isCdUnloadingOrReceivedStatus, processStatusOptions } from './processStatus.js'
import { getCollectionWindows } from '../../utils/collectionWindows.js'
import { areLicensesCleared } from './licenses.js'
import { hasArrivalSignal, hasCargoPresenceSignal } from './arrivalCustoms.js'

export const PRE_ARRIVAL_STATUSES = ['Aguardando Embarque', 'Embarcou', 'Aguardando atracação']

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'object' && typeof value.toDate === 'function') return true
  return Boolean(value)
}

function normalizeDuimpCanonical(value) {
  return normalizeComparableText(value).trim()
}

function isDuimpParametrizada(process) {
  return normalizeDuimpCanonical(process?.duimpStatus) === 'parametrizada'
}

// Linha 5 da tabela D-B: NUNCA usar `!== 'Aguardando registro da DUIMP'`
// (vazio tambem seria "diferente" e daria falso positivo).
function isDuimpRegisteredWaitingParam(process) {
  const normalized = normalizeDuimpCanonical(process?.duimpStatus)
  return (
    normalized === 'aguardando parametrizacao da duimp' ||
    normalized === 'registrada, aguardando parametrizacao'
  )
}

// AD-1: desembaraco concluido. `clearanceCompletedAt` preenchido OU,
// enquanto nao existir, duimp parametrizada + canal Verde (comportamento
// legado). Exportada para reuso no gate de coleta (sanitize/form/filtro).
export function isCustomsCleared(process) {
  if (hasValue(process?.clearanceCompletedAt)) return true
  return (
    isDuimpParametrizada(process) &&
    normalizeComparableText(process?.parameterizationChannel).trim() === 'verde'
  )
}

/**
 * D-4: gate de coleta - unifica desembaraco concluido + todas as anuencias
 * deferidas (`./licenses.js`, com compat de leitura MAPA - D-3). Exportada
 * pro reuso no gate de coleta (sanitize/form/filtro) - AGORA tambem
 * bloqueia AEREO (mudanca intencional do spec D5).
 */
export function isCollectionReleased(process) {
  return isCustomsCleared(process) && areLicensesCleared(process)
}

function hasCollectionWindowScheduled(process) {
  return getCollectionWindows(process).some((window) => hasValue(window?.scheduledAt))
}

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// D-3: sinal de embarque real (`shippedAt`) OU legado - processo gravado
// num status pos-'Aguardando Embarque' antes do F17.2a existir, sem
// `shippedAt` preenchido (nunca fabricamos a data a partir de `etd`/`eta`).
function isLegacyShipped(process) {
  if (hasValue(process?.shippedAt)) return false
  const gravado = String(process?.processStatus ?? '').trim()
  return processStatusOptions.includes(gravado) && gravado !== 'Aguardando Embarque'
}

function hasShippedSignal(process) {
  return hasValue(process?.shippedAt) || isLegacyShipped(process)
}

/**
 * Deriva o `processStatus` a partir dos campos operacionais do processo
 * (tabela D-B do PLAN.md). Le campo novo OU o equivalente atual - camada de
 * compatibilidade, nenhum campo novo existe em producao ainda (exceto
 * `clearanceCompletedAt`, antecipado pelo AD-1).
 */
export function deriveProcessStatus(process, today = new Date()) {
  if (isCdUnloadingOrReceivedStatus(process?.collectionStatus)) {
    return 'Carga recebida'
  }

  const normalizedCollectionStatus = normalizeComparableText(process?.collectionStatus).trim()
  if (
    (normalizedCollectionStatus === 'coleta agendada' ||
      normalizedCollectionStatus === 'carga a caminho do cd') &&
    hasCollectionWindowScheduled(process)
  ) {
    return 'Coleta Agendada'
  }

  if (isCollectionReleased(process)) {
    return 'Aguardando agendamento de coleta'
  }

  if (hasValue(process?.parameterizedAt) || isDuimpParametrizada(process)) {
    return 'Aguardando desembaraço'
  }

  if (hasValue(process?.duimpRegisteredAt) || isDuimpRegisteredWaitingParam(process)) {
    return 'Aguardando parametrização da DUIMP'
  }

  if (hasCargoPresenceSignal(process)) {
    return 'Aguardando registro da DUIMP'
  }

  if (hasArrivalSignal(process)) {
    return 'Atracação Confirmada'
  }

  if (hasShippedSignal(process)) {
    const eta = String(process?.eta ?? '').slice(0, 10)
    const todayKey = getLocalDateKey(today)
    if (eta && eta <= todayKey) {
      return 'Aguardando atracação'
    }
    return 'Embarcou'
  }

  return 'Aguardando Embarque'
}

/**
 * D-D: `cargoReceivedAt` acompanha a derivacao. Entra `nowIso` quando o
 * processo passa a ser `Carga recebida` sem data gravada; preserva a data
 * existente; zera ao sair de `Carga recebida`.
 */
export function resolveCargoReceivedAt(derivedStatus, currentReceivedAt, nowIso) {
  if (derivedStatus !== 'Carga recebida') return ''

  const normalizedCurrent =
    typeof currentReceivedAt === 'object' && typeof currentReceivedAt?.toDate === 'function'
      ? currentReceivedAt.toDate().toISOString()
      : String(currentReceivedAt ?? '').trim()

  return normalizedCurrent || nowIso
}
