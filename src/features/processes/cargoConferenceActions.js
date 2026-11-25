import {
  closeCargoReportConference,
  reopenCargoReportConference,
  retryCloseConferenceWrite,
} from '../../services/cargoReportRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import {
  CARGO_CONFERENCE_STATUS,
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
  buildClosedConferencePayload,
  toCargoDateKey,
} from './cargoReportFormModel'
import { buildCargoReportSheet } from './cargoReportSheet'

// S9-F do Relatório de Carga: ações da conferência (gravar, fechar, gravar de novo, reabrir) e o mapeamento dos erros
// delas para texto, compartilhados entre a barra de ações do computador (CargoReportActionBar / CargoReportForm) e a
// aba Conferência do celular. Funções, não hooks: quem chama guarda o estado. Os textos foram MOVIDOS do formulário e
// da barra sem alteração; só o ramo de "sem conexão" é novo.

export const CLOSE_ERROR_PREFIX = 'Não foi possível salvar e fechar a conferência.'
export const REOPEN_ERROR_PREFIX = 'Não foi possível reabrir.'
const SAVE_ERROR_PREFIX = 'Não foi possível salvar o relatório de carga.'

export const CARGO_CONFERENCE_MESSAGES = {
  conflictDraft: 'Outra pessoa salvou este relatório. Recarregue para ver a versão atual antes de salvar de novo.',
  conflictConference:
    'Outra pessoa salvou a conferência. Recarregue para ver a versão atual antes de salvar de novo.',
  permissionDenied:
    'Sem permissão para editar. O COMEX preenche o relatório; a logística marca o OK? e a contagem, preenche as etiquetas e o recebimento e fecha a conferência.',
  invalidUnload: 'Corrija o horário da descarga antes de salvar.',
  conferenceClosed:
    'Conferência fechada e Excel anexado como nova versão. O aviso da conferência foi enviado aos destinatários do Relatório de carga.',
  conferenceReopened: 'Conferência reaberta. A logística pode corrigir e fechar de novo.',
  conferenceAttachedNotSaved: 'O Excel foi anexado e o aviso enviado, mas a conferência não foi marcada como fechada.',
  conferenceAttachedConflict:
    'O Excel foi anexado e o aviso enviado, mas o COMEX ou outra pessoa alterou o relatório antes. Recarregue e confira.',
  currentChanged:
    'O COMEX alterou ou reabriu o relatório depois que você abriu. Recarregue antes de fechar a conferência.',
  // S9-F: sem conexão nada é enviado e o que foi digitado fica na tela (sem fila offline).
  offline: 'Sem conexão. A conferência não foi salva: confira o sinal e toque em Salvar de novo.',
  offlineDraft: 'Sem conexão. O relatório não foi salvo: confira o sinal e toque em Salvar de novo.',
  offlineClose: 'Sem conexão. A conferência não foi fechada: confira o sinal e toque em Salvar e fechar de novo.',
  offlineReopen: 'Sem conexão. A conferência não foi reaberta: confira o sinal e tente de novo.',
}

const NETWORK_ERROR_CODES = new Set(['unavailable', 'deadline-exceeded'])
// Falha de `fetch` do navegador: "Failed to fetch" (Chrome), "Load failed" (Safari), "NetworkError when…" (Firefox).
const NETWORK_ERROR_MESSAGE = /failed to fetch|load failed|network ?error|network request failed/i

export function isCargoOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Sem conexão: aparelho offline, erro `unavailable`/`deadline-exceeded` do Firestore ou falha de rede do navegador.
export function isCargoNetworkError(error) {
  if (isCargoOffline()) return true
  if (NETWORK_ERROR_CODES.has(error?.code)) return true
  return error instanceof TypeError && NETWORK_ERROR_MESSAGE.test(String(error.message ?? ''))
}

// -> { kind: 'conflict' | 'error', text }. `kind`: 'draft' (rascunho do COMEX) ou 'conference' (conferência).
export function describeCargoSaveError(error, kind) {
  if (error?.code === CARGO_REPORT_CONFLICT_CODE) {
    return {
      kind: 'conflict',
      text: kind === 'conference' ? CARGO_CONFERENCE_MESSAGES.conflictConference : CARGO_CONFERENCE_MESSAGES.conflictDraft,
    }
  }
  if (error?.code === 'permission-denied') return { kind: 'error', text: CARGO_CONFERENCE_MESSAGES.permissionDenied }
  if (isCargoNetworkError(error)) {
    return {
      kind: 'error',
      text: kind === 'conference' ? CARGO_CONFERENCE_MESSAGES.offline : CARGO_CONFERENCE_MESSAGES.offlineDraft,
    }
  }
  return { kind: 'error', text: buildActionErrorMessage(SAVE_ERROR_PREFIX, error) }
}

// Excel do FR.CMX.001 com a conferência (a mesma folha da barra do computador).
export async function buildCargoConferenceCloseFile({ form, process, catalog, packaging, payload }) {
  const { generateCargoReportFile } = await import('./cargoReportExcel')
  return generateCargoReportFile(buildCargoReportSheet(form, { process, conference: payload, catalog, packaging }))
}

// Fecha a conferência: monta o payload fechado, gera o Excel e chama o repositório (que anexa e grava).
// Em erro, anexa o payload montado em `error.closePayload` (a tela precisa dele para o "Gravar de novo").
export async function closeCargoConference({
  processId,
  process,
  profile,
  form,
  conference,
  savedRevision,
  catalog,
  packaging,
  today = toCargoDateKey(new Date()),
}) {
  const actorName = String(profile?.name ?? profile?.email ?? '').trim()
  let payload = null
  try {
    payload = buildClosedConferencePayload({ ...conference, revision: savedRevision }, form.rows, {
      actorName,
      actorUid: String(profile?.uid ?? ''),
      today,
    })
    const file = await buildCargoConferenceCloseFile({ form, process, catalog, packaging, payload })
    const result = await closeCargoReportConference(processId, {
      payload,
      file,
      category: process?.category,
      actor: profile,
      currentRevision: form.revision,
    })
    return { payload, documentId: result.documentId }
  } catch (error) {
    // Não enumerável: o payload não aparece quando o erro é impresso no console.
    if (error && typeof error === 'object') {
      Object.defineProperty(error, 'closePayload', { value: payload, configurable: true, writable: true })
    }
    throw error
  }
}

// `onRetry(payload, documentId)`: o que o botão "Gravar de novo" executa.
export function describeCargoCloseError(error, payload, { onRetry } = {}) {
  if (error?.code === CARGO_REPORT_ATTACHED_NOT_SAVED_CODE) {
    if (error.cause?.code === CARGO_REPORT_CONFLICT_CODE) {
      return { kind: 'conflict', text: CARGO_CONFERENCE_MESSAGES.conferenceAttachedConflict }
    }
    return {
      kind: 'retry',
      text: CARGO_CONFERENCE_MESSAGES.conferenceAttachedNotSaved,
      action: { label: 'Gravar de novo', run: () => onRetry?.(payload, error.documentId) },
    }
  }
  if (error?.code === CARGO_REPORT_CONFLICT_CODE) {
    return error.scope === 'current'
      ? { kind: 'conflict', text: CARGO_CONFERENCE_MESSAGES.currentChanged }
      : describeCargoSaveError(error, 'conference')
  }
  if (error?.code === 'permission-denied') return describeCargoSaveError(error, 'conference')
  if (isCargoNetworkError(error)) return { kind: 'error', text: CARGO_CONFERENCE_MESSAGES.offlineClose }
  return { kind: 'error', text: buildActionErrorMessage(CLOSE_ERROR_PREFIX, error) }
}

// O arquivo já está anexado e o aviso já saiu: grava só a conferência, sem anexar de novo.
export function retryCargoConferenceClose({ processId, payload, documentId, profile }) {
  return retryCloseConferenceWrite(processId, { payload, documentId, actor: profile })
}

// Falha do "Gravar de novo": conflito vira aviso de conflito; o resto continua oferecendo gravar de novo.
export function describeCargoRetryError(error, payload, documentId, { onRetry } = {}) {
  return error?.code === CARGO_REPORT_CONFLICT_CODE
    ? { kind: 'conflict', text: CARGO_CONFERENCE_MESSAGES.conferenceAttachedConflict }
    : {
        kind: 'retry',
        text: buildActionErrorMessage(CARGO_CONFERENCE_MESSAGES.conferenceAttachedNotSaved, error),
        action: { label: 'Gravar de novo', run: () => onRetry?.(payload, documentId) },
      }
}

// Estado 3 -> 2: o conteúdo da conferência fica intacto; só status e fechamento voltam. Devolve a conferência aberta
// (revisão nova) para a tela passar a refletir o que foi gravado.
export async function reopenCargoConference({ processId, profile, savedConference, actorName }) {
  const result = await reopenCargoReportConference(processId, profile)
  return {
    ...savedConference,
    revision: result.revision,
    status: CARGO_CONFERENCE_STATUS.open,
    closedDate: '',
    closedById: '',
    closedByName: '',
    closedDocumentId: '',
    updatedAt: new Date(),
    updatedByName: actorName,
  }
}

export function describeCargoReopenError(error) {
  return error?.code === CARGO_REPORT_CONFLICT_CODE || error?.code === 'permission-denied'
    ? describeCargoSaveError(error, 'conference')
    : isCargoNetworkError(error)
      ? { kind: 'error', text: CARGO_CONFERENCE_MESSAGES.offlineReopen }
      : { kind: 'error', text: buildActionErrorMessage(REOPEN_ERROR_PREFIX, error) }
}
