// S11-I: envio de COA em SEGUNDO PLANO. O laço que sobe os arquivos (um por vez) mora aqui, fora do componente: sair da
// aba Documentos ou trocar de processo não interrompe o envio, e ao voltar o card ou a célula relê o andamento
// (`useSyncExternalStore`), no mesmo padrão de `coaAutoReadQueue`. Isolamento entre testes: `resetCoaUploads()`.
//
// Regras:
// - Tudo do envio é capturado no INÍCIO (processo, PO, categoria, usuário, bilhete da leitura, toast) e nada é relido
//   do componente durante o laço: trocar de processo não manda arquivo para o processo errado.
// - Uma chave `processId|escopo` (card = '' / célula = número da PO) só tem UM envio por vez (sem arquivo duplicado).
// - Logout, troca de usuário ou perda do admin (`coaAutoReadSession`) interrompem: nenhum arquivo NOVO começa. O que já
//   está subindo termina em nome de quem iniciou.
// - Erro de permissão interrompe o laço (os demais não sobem, evita N erros iguais). Outros erros seguem por arquivo.
// - Fechar ou recarregar a página interrompe o envio (só memória; nada é persistido).
// - Nenhum timer. Cada arquivo que sobe entra na fila da leitura pelo bilhete (a fila continua com 1 leitura por vez).

import { getFriendlyErrorDetail } from '../../utils/errorMessages'
import { uploadProcessDocument } from '../../services/processDocumentsRepository'
import { buildCoaAutoReadKey, enqueueCoaAutoRead } from './coaAutoReadQueue'
import { subscribeCoaAutoReadActor } from './coaAutoReadSession'

const COA_TYPE = 'coaOriginal'
export const COA_UPLOAD_ERROR_TITLE = 'Não foi possível enviar o documento.'
export const COA_UPLOAD_INTERRUPTED_DETAIL = 'Não enviado: envio interrompido.'

const PERMISSION_CODES = new Set(['permission-denied', 'unauthenticated', 'storage/unauthorized', 'storage/unauthenticated'])

let state = { entries: {} }
let sessionEpoch = 0
let watchingSession = false
const watchers = new Map()
const listeners = new Set()

function emit(entries) {
  state = { entries }
  listeners.forEach((listener) => listener())
}

function putEntry(key, entry) {
  emit({ ...state.entries, [key]: entry })
}

function dropEntry(key) {
  if (!state.entries[key]) return
  const next = { ...state.entries }
  delete next[key]
  emit(next)
}

export function subscribeCoaUpload(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCoaUploadState() {
  return state
}

export function isCoaUploadBusy(key) {
  return state.entries[key]?.status === 'sending'
}

function watchSession() {
  if (watchingSession) return
  watchingSession = true
  // A conta mudou: o envio antigo não começa mais nenhum arquivo e a tela não mostra nada dele (sem toast).
  subscribeCoaAutoReadActor(() => {
    sessionEpoch += 1
    emit({})
  })
}

function buildToastText(failed, total, label) {
  const subject = label ? `Envio de COA (${label})` : 'Envio de COA'
  const verb = failed === 1 && total === 1 ? 'não foi enviado' : 'não foram enviados'
  const noun = total === 1 ? 'arquivo' : 'arquivos'
  return `${subject}: ${failed} de ${total} ${noun} ${verb}. Abra a aba Documentos do processo para ver quais.`
}

async function runUpload(job) {
  const { key, epoch, processId, scope, category, actor, files, send, notify, label } = job
  const failures = []
  let sent = 0
  const base = state.entries[key]

  for (let index = 0; index < files.length; index += 1) {
    // Sessão trocada: nenhum arquivo novo começa (a entrada já foi limpa pela troca).
    if (epoch !== sessionEpoch) return
    putEntry(key, { ...state.entries[key], current: index + 1 })
    const file = files[index]
    try {
      const created = await uploadProcessDocument(processId, {
        type: COA_TYPE,
        file,
        category,
        po: scope || undefined,
        actor,
      })
      sent += 1
      // O bilhete continua sendo a única porta da fila: época, geração e falha do serviço seguem valendo.
      if (send) enqueueCoaAutoRead(processId, [created], scope, send)
    } catch (error) {
      console.error(COA_UPLOAD_ERROR_TITLE, error)
      failures.push({ name: file?.name ?? '', detail: getFriendlyErrorDetail(error) })
      if (PERMISSION_CODES.has(error?.code)) {
        for (let rest = index + 1; rest < files.length; rest += 1) {
          failures.push({ name: files[rest]?.name ?? '', detail: COA_UPLOAD_INTERRUPTED_DETAIL })
        }
        break
      }
    }
  }

  if (epoch !== sessionEpoch) return
  const seen = (watchers.get(key) ?? 0) > 0
  putEntry(key, {
    status: 'done',
    current: files.length,
    total: files.length,
    sent,
    errors: failures,
    doneSeq: (base?.doneSeq ?? 0) + (sent > 0 ? 1 : 0),
    seen,
  })
  // Falha com a tela fechada: ninguém viu o erro inline, então avisa por toast (sem toast de sucesso).
  if (failures.length > 0 && !seen) notify?.error?.(buildToastText(failures.length, files.length, label))
}

// Devolve `true` se começou; `false` se a chave já está enviando, se não há arquivos, processo ou usuário, ou se é
// consolidado sem PO (defesa dupla: o hook já barra antes). Tudo até o 1º `await` é síncrono.
export function startCoaUpload({ processId, scope = '', category, actor, files, send = null, notify = null, label = '' }) {
  const list = Array.isArray(files) ? files : []
  const normalizedScope = String(scope ?? '').trim()
  if (!processId || !actor?.uid || list.length === 0) return false
  if (category === 'CONSOLIDADO' && !normalizedScope) return false
  const key = buildCoaAutoReadKey(processId, normalizedScope)
  if (isCoaUploadBusy(key)) return false

  watchSession()
  putEntry(key, {
    status: 'sending',
    current: 1,
    total: list.length,
    sent: 0,
    errors: [],
    doneSeq: state.entries[key]?.doneSeq ?? 0,
    seen: false,
  })
  runUpload({
    key,
    epoch: sessionEpoch,
    processId,
    scope: normalizedScope,
    category,
    actor: { uid: actor.uid, name: actor.name, role: actor.role },
    files: list,
    send,
    notify,
    label,
  }).catch((error) => console.error(COA_UPLOAD_ERROR_TITLE, error))
  return true
}

// Conta os componentes (card ou célula) montados para a chave. Ao montar com resultado pronto, ele passa a "visto"; ao
// sair o último, o resultado visto é apagado (aparece uma vez ao voltar). A checagem fica numa microtarefa para o
// efeito duplo do StrictMode não apagar o resultado antes de ele ser mostrado.
export function watchCoaUpload(key) {
  watchers.set(key, (watchers.get(key) ?? 0) + 1)
  const entry = state.entries[key]
  if (entry?.status === 'done' && !entry.seen) putEntry(key, { ...entry, seen: true })
  let released = false
  return () => {
    if (released) return
    released = true
    const left = (watchers.get(key) ?? 1) - 1
    if (left > 0) {
      watchers.set(key, left)
      return
    }
    watchers.delete(key)
    queueMicrotask(() => {
      const current = state.entries[key]
      if ((watchers.get(key) ?? 0) === 0 && current?.status === 'done' && current.seen) dropEntry(key)
    })
  }
}

export function resetCoaUploads() {
  // A época sobe (e não volta a zero): um laço de teste anterior ainda pendente nunca escreve no estado novo.
  sessionEpoch += 1
  state = { entries: {} }
  watchers.clear()
  listeners.clear()
}
