import {
  CARGO_UNLOAD_MAX_MINUTES,
  CARGO_UNLOAD_MESSAGES,
  computeCargoUnloadMinutes,
  readDateTimeKey,
} from './cargoReportFormModel'
import { CONTAINER_TYPE_OPTIONS, normalizeContainers } from './containers'

// Conferência por item (Fatia C): descarga por unidade (contêiner). Módulo puro (sem React e sem Firebase). O ciclo com
// `cargoReportFormModel.js` é só por funções (usadas em tempo de chamada), como `cargoConferenceIssues.js` já faz.
// Dados (doc `conference`, chave OPCIONAL e "pegajosa" nas rules: mapa de até 50 entradas):
//   - `unloadByUnit` { [unitId]: { startAt, endAt } }: `unitId` = `containers[].id`, `unica` (processo sem contêiner:
//     LCL ou aéreo) ou `legado` (início/fim de uma conferência anterior à fatia C, D-5). `startAt`/`endAt` = '' ou
//     `YYYY-MM-DDTHH:mm` (hora de parede de Brasília, sem fuso). Entrada com os dois vazios é PODADA.
//   - `unloadStartAt`/`unloadEndAt` continuam gravados, agora CALCULADOS: menor início de qualquer unidade e maior fim entre
//     as unidades finalizadas e válidas. O Excel e a impressão do FR.CMX.001 leem só esses dois (fim - início) e NÃO mudam;
//     a soma das durações e o tempo corrido existem só na tela do celular.
// A regra de 24 h vale POR UNIDADE (as unidades podem estar em dias diferentes).

export const CARGO_UNLOAD_UNITS_MAX = 50
export const CARGO_UNLOAD_UNIT_ID_MAX = 64
export const CARGO_UNLOAD_SINGLE_ID = 'unica'
export const CARGO_UNLOAD_LEGACY_ID = 'legado'

const ORPHAN_TITLE = 'Unidade fora do processo'
const ORPHAN_SUBTITLE = 'Não existe mais neste processo.'
const UNTYPED_SUBTITLE = 'Tipo não informado'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Id aceito como chave do mapa: texto de 1 a 64 caracteres, sem o nome reservado do protótipo nem o formato `__x__` que o
// Firestore proíbe em campo.
function isUnitId(value) {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= CARGO_UNLOAD_UNIT_ID_MAX &&
    value !== '__proto__' &&
    !/^__.*__$/.test(value)
  )
}

function readEntry(value) {
  if (!isPlainObject(value)) return null
  const startAt = readDateTimeKey(value.startAt)
  const endAt = readDateTimeKey(value.endAt)
  return startAt || endAt ? { startAt, endAt } : null
}

// { [unitId]: { startAt, endAt } } podado: outro tipo, id inválido, data inválida e entrada com os dois vazios saem; até 50.
export function readUnloadByUnit(value) {
  const result = {}
  if (!isPlainObject(value)) return result
  let count = 0
  for (const [unitId, raw] of Object.entries(value)) {
    if (!isUnitId(unitId)) continue
    const entry = readEntry(raw)
    if (!entry) continue
    result[unitId] = entry
    count += 1
    if (count >= CARGO_UNLOAD_UNITS_MAX) break
  }
  return result
}

function hasEntries(map) {
  return Object.keys(map).length > 0
}

// Conferência anterior à fatia C: tem início/fim e nenhuma unidade. O início/fim antigo aparece como a linha "Registro
// anterior (sem unidade)" e entra na primeira edição de unidade (D-5).
function readLegacyEntry(conference) {
  if (hasEntries(readUnloadByUnit(conference?.unloadByUnit))) return null
  return readEntry({ startAt: conference?.unloadStartAt, endAt: conference?.unloadEndAt })
}

// O mapa que a tela mostra: o gravado, ou (conferência anterior) o início/fim antigo como `legado`.
export function readCargoUnloadView(conference) {
  const map = readUnloadByUnit(conference?.unloadByUnit)
  const legacy = readLegacyEntry(conference)
  return legacy ? { [CARGO_UNLOAD_LEGACY_ID]: legacy } : map
}

function containerTitle(container, index) {
  return container.number ? `Contêiner ${index + 1} · ${container.number}` : `Contêiner ${index + 1}`
}

function containerSubtitle(container) {
  const option = CONTAINER_TYPE_OPTIONS.find((item) => item.value === container.type)
  return option ? option.label : UNTYPED_SUBTITLE
}

// As unidades de descarga do processo, na ordem da tela (D-C5): contêineres na ordem de `containers[]` (ou a "Descarga
// única" quando o processo não tem contêiner), depois as unidades gravadas que não existem mais no processo (D-4: nunca
// somem), por último o "Registro anterior (sem unidade)". `legacy` = true lista o registro anterior mesmo sem a entrada.
// -> [{ id, title, subtitle, kind: 'container' | 'unica' | 'orphan' | 'legado' }]
export function listCargoUnloadUnits(process, unloadByUnit, { legacy = false } = {}) {
  const map = readUnloadByUnit(unloadByUnit)
  const containers = normalizeContainers(process?.containers, {
    category: process?.category,
    containerQuantity: process?.containerQuantity,
    collectionWindows: process?.collectionWindows,
  })
  const units =
    containers.length > 0
      ? containers.map((container, index) => ({
          id: container.id,
          title: containerTitle(container, index),
          subtitle: containerSubtitle(container),
          kind: 'container',
        }))
      : [
          {
            id: CARGO_UNLOAD_SINGLE_ID,
            title: 'Descarga única',
            subtitle: 'Sem contêiner no processo (LCL ou aéreo)',
            kind: 'unica',
          },
        ]
  const known = new Set(units.map((unit) => unit.id))
  const orphanIds = Object.keys(map).filter((id) => !known.has(id) && id !== CARGO_UNLOAD_LEGACY_ID)
  orphanIds.forEach((id, index) => {
    const title = orphanIds.length > 1 ? `${ORPHAN_TITLE} ${index + 1}` : ORPHAN_TITLE
    units.push({ id, title, subtitle: ORPHAN_SUBTITLE, kind: 'orphan' })
  })
  if (legacy === true || CARGO_UNLOAD_LEGACY_ID in map) {
    units.push({
      id: CARGO_UNLOAD_LEGACY_ID,
      title: 'Registro anterior (sem unidade)',
      subtitle: 'Horários gravados antes da descarga por unidade.',
      kind: 'legado',
    })
  }
  return units
}

// Menor início (qualquer unidade, inclusive em andamento) e maior fim entre as unidades FINALIZADAS e válidas (início e fim,
// fim >= início, até 24 h). Sem nenhuma, '' (a tela e o payload tratam o mapa vazio como hoje).
export function deriveCargoUnloadBounds(unloadByUnit) {
  let unloadStartAt = ''
  let unloadEndAt = ''
  for (const { startAt, endAt } of Object.values(readUnloadByUnit(unloadByUnit))) {
    if (startAt && (!unloadStartAt || startAt < unloadStartAt)) unloadStartAt = startAt
    const minutes = startAt && endAt ? computeCargoUnloadMinutes(startAt, endAt) : null
    if (minutes !== null && minutes <= CARGO_UNLOAD_MAX_MINUTES && endAt > unloadEndAt) unloadEndAt = endAt
  }
  return { unloadStartAt, unloadEndAt }
}

// Aplica o mapa na conferência com os calculados (início, fim e "Data de recebimento" = dia do início). Mapa vazio depois de
// uma edição zera os três (como apagar o início no campo único de antes).
function withUnloadMap(conference, unloadByUnit) {
  const { unloadStartAt, unloadEndAt } = deriveCargoUnloadBounds(unloadByUnit)
  return { ...conference, unloadByUnit, unloadStartAt, unloadEndAt, receivedDate: unloadStartAt.slice(0, 10) }
}

// Edita o início e/ou o fim de uma unidade (`patch` = { startAt?, endAt? }). A 1ª edição de uma conferência anterior leva o
// início/fim antigo para a entrada `legado` (D-5). Entrada que fica com os dois vazios sai do mapa.
export function patchCargoUnloadUnit(conference, unitId, patch) {
  if (!isUnitId(unitId)) return conference
  const map = { ...readUnloadByUnit(conference?.unloadByUnit) }
  const legacy = readLegacyEntry(conference)
  if (legacy) map[CARGO_UNLOAD_LEGACY_ID] = legacy
  const current = map[unitId] ?? { startAt: '', endAt: '' }
  if (!(unitId in map) && Object.keys(map).length >= CARGO_UNLOAD_UNITS_MAX) return conference
  const entry = readEntry({ ...current, ...patch })
  if (entry) map[unitId] = entry
  else delete map[unitId]
  return withUnloadMap(conference, map)
}

// "Remover horários" de uma unidade fora do processo ou do registro anterior (D-4/D-5).
export function removeCargoUnloadUnit(conference, unitId) {
  const map = { ...readUnloadByUnit(conference?.unloadByUnit) }
  delete map[unitId]
  return withUnloadMap(conference, map)
}

// { start, end } com a mensagem de cada campo ('' = sem erro): fim sem início = erro no Início; fim antes do início e mais
// de 24 h = erro no Fim. Só início, só fim vazio ou os dois vazios não são erro.
export function validateCargoUnloadUnit({ startAt, endAt } = {}) {
  const result = { start: '', end: '' }
  const start = readDateTimeKey(startAt)
  const end = readDateTimeKey(endAt)
  if (!end) return result
  if (!start) {
    result.start = CARGO_UNLOAD_MESSAGES.missingStart
    return result
  }
  const minutes = computeCargoUnloadMinutes(start, end)
  if (minutes === null) result.end = CARGO_UNLOAD_MESSAGES.endBeforeStart
  else if (minutes > CARGO_UNLOAD_MAX_MINUTES) result.end = CARGO_UNLOAD_MESSAGES.tooLong
  return result
}

// Validação do mapa inteiro, unidade por unidade. Sem entradas devolve null (quem chama usa o par início/fim de sempre).
// `start`/`end` = a 1ª mensagem de erro de cada campo, para os chamadores atuais (computador, fechamento) barrarem como hoje.
// -> null | { start, end, byUnit: { [unitId]: { start, end } } } (`byUnit` só com as unidades que têm erro)
export function validateCargoUnloadByUnit(unloadByUnit) {
  const map = readUnloadByUnit(unloadByUnit)
  if (!hasEntries(map)) return null
  const result = { start: '', end: '', byUnit: {} }
  for (const [unitId, entry] of Object.entries(map)) {
    const errors = validateCargoUnloadUnit(entry)
    if (!errors.start && !errors.end) continue
    result.byUnit[unitId] = errors
    result.start = result.start || errors.start
    result.end = result.end || errors.end
  }
  return result
}

// Estado de uma unidade (selo e erro do cartão): vazio | andamento (minutos até agora) | semFim (conferência fechada) |
// erro (`field` = campo com a mensagem) | ok (minutos). `nowKey` = agora como `YYYY-MM-DDTHH:mm`.
export function cargoUnloadUnitState(entry, { nowKey = '', closed = false } = {}) {
  const startAt = readDateTimeKey(entry?.startAt)
  const endAt = readDateTimeKey(entry?.endAt)
  if (!startAt && !endAt) return { state: 'vazio' }
  if (!startAt) return { state: 'erro', field: 'start', message: CARGO_UNLOAD_MESSAGES.missingStart }
  if (!endAt) {
    if (closed) return { state: 'semFim' }
    return { state: 'andamento', minutes: computeCargoUnloadMinutes(startAt, nowKey) ?? 0 }
  }
  const minutes = computeCargoUnloadMinutes(startAt, endAt)
  if (minutes === null) return { state: 'erro', field: 'end', message: CARGO_UNLOAD_MESSAGES.endBeforeStart }
  if (minutes > CARGO_UNLOAD_MAX_MINUTES) return { state: 'erro', field: 'end', message: CARGO_UNLOAD_MESSAGES.tooLong }
  return { state: 'ok', minutes }
}

// Estado da unidade DA LISTA: a que o celular não consegue finalizar (fora do processo ou registro anterior, só leitura) sem
// fim é "sem fim", nunca "em andamento".
export function cargoUnloadUnitInfo(unit, entry, { nowKey = '', closed = false } = {}) {
  const locked = unit?.kind === 'orphan' || unit?.kind === 'legado'
  return cargoUnloadUnitState(entry, { nowKey, closed: closed || locked })
}

function toMinuteNumber(key) {
  return Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), +key.slice(11, 13), +key.slice(14, 16)) / 60000
}

// Totais da tela. `sumMinutes` = soma das durações das unidades FINALIZADAS (mão de obra); `wallMinutes` = tempo corrido (união
// dos intervalos, sem repetir a sobreposição); `overlap` = há sobreposição real (intervalos que só se encostam não contam);
// `running`/`withoutEnd` = unidades em andamento / sem fim (conferência fechada), fora do total; `finished` = N finalizadas;
// `firstStart` = menor início de qualquer unidade; `lastEnd` = maior fim entre as finalizadas.
export function summarizeCargoUnload(units, unloadByUnit, { nowKey = '', closed = false } = {}) {
  const map = readUnloadByUnit(unloadByUnit)
  const summary = { sumMinutes: 0, wallMinutes: 0, overlap: false, running: 0, withoutEnd: 0, finished: 0, firstStart: '', lastEnd: '' }
  const intervals = []
  for (const unit of Array.isArray(units) ? units : []) {
    const entry = map[unit.id]
    if (!entry) continue
    if (entry.startAt && (!summary.firstStart || entry.startAt < summary.firstStart)) summary.firstStart = entry.startAt
    const info = cargoUnloadUnitInfo(unit, entry, { nowKey, closed })
    if (info.state === 'andamento') summary.running += 1
    else if (info.state === 'semFim') summary.withoutEnd += 1
    else if (info.state === 'ok') {
      summary.sumMinutes += info.minutes
      summary.finished += 1
      if (entry.endAt > summary.lastEnd) summary.lastEnd = entry.endAt
      intervals.push([toMinuteNumber(entry.startAt), toMinuteNumber(entry.endAt)])
    }
  }
  intervals.sort((a, b) => a[0] - b[0])
  let from = null
  let to = null
  for (const [start, end] of intervals) {
    if (from === null) {
      from = start
      to = end
    } else if (start <= to) {
      to = Math.max(to, end)
    } else {
      summary.wallMinutes += to - from
      from = start
      to = end
    }
  }
  if (from !== null) summary.wallMinutes += to - from
  summary.overlap = summary.sumMinutes - summary.wallMinutes > 0.5
  return summary
}

// "1 h 25 min", "45 min", "2 h"; sem valor, "—".
export function formatCargoDuration(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

// "Agora" como `YYYY-MM-DDTHH:mm` pelos getters LOCAIS (hora de parede do aparelho; nunca `toISOString()`, que é UTC).
export function toCargoDateTimeKeyLocal(date) {
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
