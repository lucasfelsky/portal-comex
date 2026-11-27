// S11-E: fila ÚNICA da leitura automática de COA ao anexar na aba Documentos ("sempre ligado", só admin).
//
// Por que um store de módulo (e não prop/contexto): o card do COA (FCL/LCL/AÉREO) e as células por PO do CONSOLIDADO
// são componentes irmãos que enviam ao mesmo tempo; a fila precisa ser UMA só para o painel inteiro (um arquivo por
// vez: a callable roda com `maxInstances: 1` e a Tess aceita 1 req/s). Passar a fila por prop ou por contexto exigiria
// linhas no `ProcessDocumentsPanel` (teto de 1700). `subscribe`/`getSnapshot` alimentam `useSyncExternalStore`.
// Isolamento entre testes: `resetCoaAutoRead()`.
//
// Regras (todas testadas em tests/unit/coaAutoRead*.test.js*):
// - Só entra o que acabou de ser enviado com sucesso, em PDF, de um componente montado e habilitado (admin).
// - UMA tentativa por documento (nunca laço de retry; a tentativa já conta nas 3 do limite da callable).
// - `report-closed`, `not-pdf` e `too-large`: pula em silêncio (not-pdf/too-large já estão em `COA_READ_FILE_ERROR_CODES`: a
//   fila segue sem aviso). `report-closed` vale para o processo todo (o resto
//   do processo é descartado sem chamar a callable de novo).
// - Erro só do arquivo (mesma lista do "Ler COAs", `COA_READ_FILE_ERROR_CODES`): a fila segue. Qualquer outro código
//   (busy, unknown, tess-auth, tess-rate-limit, tess-storage-full, daily-limit...) esvazia o resto e deixa um aviso.
// - S11-F: a fila NÃO depende de componente montado. Sair da aba Documentos ou trocar de processo não descarta nada: ela
//   segue um arquivo por vez até esvaziar enquanto o Portal estiver aberto (navegação dentro do app). Ao voltar, o
//   componente relê o store (`useSyncExternalStore`) e mostra "Lendo os COAs: X de Y" / "Na fila" / o aviso. Fechar ou
//   recarregar a página interrompe (a fila é só memória: nada vai para localStorage).
// - S11-F: sair da conta (logout) ou trocar de usuário/perfil PARA e LIMPA a fila (`coaAutoReadSession`: a leitura é só
//   admin e gasta créditos). O arquivo em andamento termina (a callable já está no servidor) e o resultado dele é
//   ignorado pela fila (época antiga), sem mexer na fila do usuário novo.
// - Quem pode ENFILEIRAR continua sendo um componente montado e habilitado (admin) no INÍCIO do envio (`mounts`).
// - S11-H (L157): cada arquivo é enfileirado assim que sobe com sucesso (não no fim do lote). O envio leva um bilhete
//   (`beginCoaAutoReadSend`) com a época da sessão: se o componente desmontar no meio, o arquivo que ainda termina de
//   subir entra na fila; se a conta mudar no meio, nenhum arquivo do envio antigo entra (época).
// - Nenhum timer: nada para vazar.

import { describeCoaReadError, readProcessCoa } from '../../services/coaReadsRepository'
import { subscribeCoaAutoReadActor, resetCoaAutoReadActor } from './coaAutoReadSession'
import { COA_READ_FILE_ERROR_CODES } from './coaReadErrors'

const REPORT_CLOSED = 'report-closed'
const KEY_SEPARATOR = '|'

export const COA_AUTO_READ_HINT = 'Cada arquivo pode levar até 2 minutos.'
export const COA_AUTO_READ_WAITING = 'Na fila para leitura.'

function emptyState() {
  // `activeKey`: escopo do arquivo que está sendo lido agora (os demais com itens na fila só esperam a vez).
  return { progress: {}, notices: {}, readVersions: {}, activeKey: '' }
}

let state = emptyState()
let queue = []
let running = false
let generation = 0
// Época da sessão: sobe quando a conta sai ou muda; o arquivo em andamento de uma época antiga não mexe na fila nova.
let epoch = 0
let watchingSession = false
// S11-H: marcadores para os envios em andamento (bilhete): erro de serviço (esvazia tudo) e report-closed (descarta o
// processo) valem também para os arquivos do mesmo lote que ainda estão subindo e entrarão depois.
let faultSeq = 0
const closedSeq = new Map()
let attempted = new Set()
const mounts = new Map()
const listeners = new Set()

// `scope` separa quem enviou: '' = card do COA; número da PO = célula do CONSOLIDADO.
export function buildCoaAutoReadKey(processId, scope = '') {
  return `${processId}${KEY_SEPARATOR}${scope ?? ''}`
}

function emit(next) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

export function subscribeCoaAutoRead(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCoaAutoReadState() {
  return state
}

function withoutKeys(map, keys) {
  if (keys.length === 0) return map
  const next = { ...map }
  for (const key of keys) delete next[key]
  return next
}

function bumpReadVersion(processId) {
  return { ...state.readVersions, [processId]: (state.readVersions[processId] ?? 0) + 1 }
}

function itemKey(item) {
  return buildCoaAutoReadKey(item.processId, item.scope)
}

// Um arquivo da fila terminou (qualquer desfecho): avança o contador do escopo e some com a linha ao zerar.
function markDone(item) {
  const key = itemKey(item)
  const entry = state.progress[key]
  if (!entry) return state.progress
  const done = entry.done + 1
  if (done >= entry.total) return withoutKeys(state.progress, [key])
  return { ...state.progress, [key]: { done, total: entry.total } }
}

// Tira da fila (sem chamar nada) os itens que casam com `predicate`; devolve as chaves de escopo afetadas.
function dropQueued(predicate) {
  const dropped = queue.filter(predicate)
  if (dropped.length === 0) return []
  queue = queue.filter((item) => !predicate(item))
  return [...new Set(dropped.map(itemKey))]
}

function interrupt(failedItem, code) {
  faultSeq += 1
  const message = describeCoaReadError(code).replace(/[.\s]+$/, '')
  const text = `Leitura automática interrompida: ${message}. Use Ler COAs no formulário.`
  const keys = new Set([itemKey(failedItem), ...dropQueued(() => true)])
  const notices = { ...state.notices }
  for (const key of keys) notices[key] = text
  emit({
    progress: withoutKeys(state.progress, [...keys]),
    notices,
    readVersions: bumpReadVersion(failedItem.processId),
  })
}

function classify(code) {
  if (code === REPORT_CLOSED) return 'closed'
  if (COA_READ_FILE_ERROR_CODES.has(code)) return 'file'
  return 'interrupt'
}

// Chama a callable UMA vez. Devolve o código de falha ('' quando leu, estava em leitura ou veio do cache).
async function readOne(item) {
  try {
    const result = await readProcessCoa(item.processId, item.documentId, { force: false })
    if (result?.read?.status === 'failed') return result.read.error?.code ?? 'unknown'
    return ''
  } catch (error) {
    return error?.code ?? 'unknown'
  }
}

// Logout ou troca de usuário/perfil: esvazia a fila e os avisos. O arquivo em andamento termina sozinho.
function stopForSessionChange() {
  epoch += 1
  queue = []
  emit({ progress: {}, notices: {}, activeKey: '' })
}

function watchSession() {
  if (watchingSession) return
  watchingSession = true
  subscribeCoaAutoReadActor(stopForSessionChange)
}

async function pump() {
  if (running) return
  running = true
  const run = generation
  try {
    while (run === generation) {
      const item = queue.shift()
      if (!item) break
      if (state.activeKey !== itemKey(item)) emit({ activeKey: itemKey(item) })
      const code = await readOne(item)
      if (run !== generation) return
      if (item.epoch !== epoch) {
        // A conta mudou durante a leitura: o resultado já está gravado no servidor; só o selo é relido.
        emit({ readVersions: bumpReadVersion(item.processId) })
        continue
      }
      const kind = code ? classify(code) : 'ok'
      if (kind === 'interrupt') {
        interrupt(item, code)
        break
      }
      let progress = markDone(item)
      if (kind === 'closed') {
        closedSeq.set(item.processId, (closedSeq.get(item.processId) ?? 0) + 1)
        const keys = dropQueued((queued) => queued.processId === item.processId)
        progress = withoutKeys(progress, keys)
      }
      emit({ progress, readVersions: bumpReadVersion(item.processId) })
    }
  } finally {
    if (run === generation) {
      running = false
      if (state.activeKey) emit({ activeKey: '' })
    }
  }
}

// Registra um componente de COA montado para o processo (habilitado = admin): só quem tem componente montado no
// momento do envio pode enfileirar. Desmontar NÃO mexe na fila (S11-F). Devolve o "desmontar".
export function registerCoaAutoReadMount(processId) {
  if (!processId) return () => {}
  mounts.set(processId, (mounts.get(processId) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (mounts.get(processId) ?? 1) - 1
    if (left > 0) mounts.set(processId, left)
    else mounts.delete(processId)
  }
}

// S11-H (L157): "bilhete" do envio. Quem vai subir arquivos o pede NO INÍCIO do envio: só existe com componente de COA
// habilitado (admin) montado para o processo, e guarda a época da sessão e a geração da fila daquele instante. Cada
// arquivo é enfileirado assim que sobe (`enqueueCoaAutoRead(..., send)`), mesmo que o componente desmonte no meio do
// envio; o bilhete vale enquanto a sessão for a mesma (logout/troca de usuário/perda do admin o invalida). Assina a
// sessão aqui (e não só no 1º enfileiramento) para que um logout ANTES do 1º arquivo subir também invalide o bilhete.
export function beginCoaAutoReadSend(processId) {
  if (!processId || (mounts.get(processId) ?? 0) <= 0) return null
  watchSession()
  return { processId, epoch, generation, fault: faultSeq, closed: closedSeq.get(processId) ?? 0 }
}

// `documents`: o que `uploadProcessDocument` devolveu (precisa de `id` e `mimeType` PDF). Qualquer outro entra mudo.
// `send` (opcional): bilhete de `beginCoaAutoReadSend`; com ele o componente não precisa estar montado agora, mas o
// bilhete precisa ser do mesmo processo, da mesma sessão e da mesma geração. Sem ele vale a regra antiga (montado agora).
export function enqueueCoaAutoRead(processId, documents, scope = '', send = null) {
  if (!processId) return 0
  if (send) {
    if (send.processId !== processId || send.epoch !== epoch || send.generation !== generation) return 0
    // Depois de erro de serviço ou de relatório fechado, o resto do lote que ainda sobe não entra (como na fila já montada).
    if (send.fault !== faultSeq || send.closed !== (closedSeq.get(processId) ?? 0)) return 0
  } else if ((mounts.get(processId) ?? 0) <= 0) {
    return 0
  }
  const fresh = []
  for (const document of Array.isArray(documents) ? documents : []) {
    const documentId = String(document?.id ?? '')
    if (!documentId || String(document?.mimeType ?? '').toLowerCase() !== 'application/pdf') continue
    const attemptKey = `${processId}${KEY_SEPARATOR}${documentId}`
    if (attempted.has(attemptKey)) continue
    attempted.add(attemptKey)
    fresh.push({ processId, documentId, scope, epoch })
  }
  if (fresh.length === 0) return 0
  watchSession()

  const key = buildCoaAutoReadKey(processId, scope)
  const entry = state.progress[key]
  queue.push(...fresh)
  const notices = { ...state.notices }
  delete notices[key]
  emit({
    progress: { ...state.progress, [key]: { done: entry?.done ?? 0, total: (entry?.total ?? 0) + fresh.length } },
    notices,
  })
  pump().catch(() => {})
  return fresh.length
}

export function resetCoaAutoRead() {
  generation += 1
  epoch = 0
  resetCoaAutoReadActor()
  state = emptyState()
  queue = []
  running = false
  attempted = new Set()
  faultSeq = 0
  closedSeq.clear()
  mounts.clear()
  listeners.clear()
}
