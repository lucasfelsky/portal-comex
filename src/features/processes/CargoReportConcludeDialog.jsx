import { useRef, useState } from 'react'
import ActionSheet from '../../components/ActionSheet'
import ConfirmDialog from '../../components/ConfirmDialog'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import {
  closeCargoReportConference,
  concludeCargoReport,
  getCargoReport,
  reopenCargoReport,
  reopenCargoReportConference,
  retryCloseConferenceWrite,
  retryConcludeWrite,
} from '../../services/cargoReportRepository'
import { saveBlobAsFile } from '../../services/processDocumentsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import CargoReportPrintSheet from './CargoReportPrintSheet'
import {
  CARGO_CONFERENCE_STATUS,
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
  CARGO_STAGE,
  buildCargoReportPayload,
  buildClosedConferencePayload,
  buildConcludedCargoReportPayload,
  buildReopenedCargoReportPayload,
  canCloseCargoConference,
  canConcludeCargoReport,
  canEditCargoReport,
  canReopenCargoConference,
  canReopenCargoReportComex,
  canSaveCargoConference,
  fromConferenceDoc,
  isCargoReportRowEmpty,
  toCargoDateKey,
} from './cargoReportFormModel'
import { buildCargoReportSheet, describeCargoReportAlerts } from './cargoReportSheet'

// S4/S7 do Relatório de Carga: diálogos de "Salvar e fechar" (COMEX) e "Salvar e fechar conferência"
// (logística) e a barra de ações do formulário (Exportar Excel, Imprimir / Salvar PDF, salvar, fechar e
// reabrir). A barra vive aqui para o CargoReportForm não passar de 900 linhas; ela só conversa com o
// formulário por callbacks (feedback, recarregar, estado persistido).

const CONCLUDE_ERROR_PREFIX = 'Não foi possível salvar e fechar o relatório.'
const CLOSE_ERROR_PREFIX = 'Não foi possível salvar e fechar a conferência.'
const REOPEN_ERROR_PREFIX = 'Não foi possível reabrir.'
const EXPORT_ERROR_PREFIX = 'Não foi possível gerar o Excel.'
const MESSAGES = {
  concluded:
    'Parte do COMEX fechada e Excel anexado. O aviso por e-mail foi enviado aos destinatários do Relatório de carga. A logística já pode fechar a conferência.',
  reopened: 'Parte do COMEX reaberta. Para gerar uma nova versão, salve e feche de novo.',
  conferenceClosed:
    'Conferência fechada e Excel anexado como nova versão. O aviso da conferência foi enviado aos destinatários do Relatório de carga.',
  conferenceReopened: 'Conferência reaberta. A logística pode corrigir e fechar de novo.',
  reopenPartial:
    'A conferência foi reaberta, mas a parte do COMEX não. O relatório continua com a parte do COMEX fechada.',
  attachedNotSaved: 'O Excel foi anexado e o aviso enviado, mas a parte do COMEX não foi marcada como fechada.',
  attachedConflict:
    'O Excel foi anexado e o aviso enviado, mas outra pessoa salvou o relatório antes. Recarregue e confira.',
  conferenceAttachedNotSaved: 'O Excel foi anexado e o aviso enviado, mas a conferência não foi marcada como fechada.',
  conferenceAttachedConflict:
    'O Excel foi anexado e o aviso enviado, mas o COMEX ou outra pessoa alterou o relatório antes. Recarregue e confira.',
  currentChanged:
    'O COMEX alterou ou reabriu o relatório depois que você abriu. Recarregue antes de fechar a conferência.',
  conferHint:
    'Você marca o OK? e a contagem, preenche as etiquetas e os dados do recebimento. As demais colunas são só do COMEX.',
  conferWaiting: 'Disponível depois que o COMEX fechar: "Salvar e fechar conferência".',
  conferenceChanged:
    'A logística salvou a conferência depois que você abriu o relatório. Recarregue para ver o OK?, as etiquetas e a contagem antes de fechar.',
  catalogMissing:
    'A tabela Item x Emb. não está disponível: peso líquido e nº de embalagens vão vazios no relatório fechado, e ao reabrir a tabela volta a calcular.',
  reopenComexTitle: 'Reabrir parte do COMEX?',
  reopenComexMessage:
    'Reabrir a parte do COMEX também reabre a conferência da logística. O conteúdo da conferência é mantido; ao fechar de novo, a logística gera uma nova versão do Excel.',
}

function pluralLines(count, text) {
  return `${count} ${count === 1 ? 'linha' : 'linhas'} ${text}`
}

// `alertCount`/`alertsText` vêm de `buildCargoReportSheet` + `describeCargoReportAlerts`.
export default function CargoReportConcludeDialog({
  open,
  processName,
  alertCount = 0,
  alertsText = '',
  catalogMissing = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)
  const alertsLead = alertCount === 1 ? '1 alerta continua aberto' : `${alertCount} alertas continuam abertos`

  // Enquanto `busy`, Esc, fundo e "x" não fecham: o anexo e o e-mail já podem estar a caminho.
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title="Salvar e fechar a parte do COMEX"
      closeOnBackdrop={!busy}
      initialFocusRef={cancelRef}
    >
      <div className="crf-dlg">
        <p>
          {'O Portal vai gerar o Excel do FR.CMX.001 e anexar ao processo '}
          <b>{processName}</b>
          {' como Relatório de carga.'}
        </p>
        <ul className="crf-dlg__list">
          <li>
            {'Cria uma '}
            <b>nova versão</b>
            {' do Relatório de carga. A atual vira "versão anterior" e a mais antiga é removida.'}
          </li>
          <li>
            {'Envia o '}
            <b>aviso por e-mail</b>
            {' para Comex, Técnico, Logística e Faturamento/fiscal, com o assunto padrão.'}
          </li>
          <li>
            {'A parte do COMEX fica '}
            <b>fechada</b>
            {': os campos travam e a logística passa a poder conferir e fechar a parte dela. Para corrigir, use "Reabrir parte do COMEX".'}
          </li>
        </ul>
        {alertCount > 0 ? (
          <div className="crf-dlg__warn" role="note">
            {`${alertsLead}: ${alertsText}. Dá para fechar assim.`}
          </div>
        ) : null}
        {catalogMissing ? (
          <div className="crf-dlg__warn" role="note">
            {MESSAGES.catalogMissing}
          </div>
        ) : null}
        <div className="crf-dlg__actions">
          <button type="button" className="secondary-button" ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Fechando…' : 'Salvar e fechar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// S7: fechamento da conferência pela logística. `pendingText` = pendências (não bloqueiam).
export function CargoReportCloseConferenceDialog({ open, processName, pendingText = '', busy = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title="Salvar e fechar conferência"
      closeOnBackdrop={!busy}
      initialFocusRef={cancelRef}
    >
      <div className="crf-dlg">
        <p>
          {'O Portal vai gerar o Excel do FR.CMX.001 com a sua conferência e anexar ao processo '}
          <b>{processName}</b>
          {' como Relatório de carga.'}
        </p>
        <ul className="crf-dlg__list">
          <li>
            {'Gera o Excel do FR.CMX.001 com OK?, contagem, etiquetas e recebimento e anexa como '}
            <b>nova versão</b>
            {' do Relatório de carga.'}
          </li>
          <li>
            {'O Portal guarda as '}
            <b>2 últimas versões</b>
            {': a versão do COMEX vira "versão anterior".'}
          </li>
          <li>
            {'Envia o '}
            <b>aviso da conferência</b>
            {' por e-mail para Comex, Técnico, Logística e Faturamento/fiscal (e-mail próprio da conferência) e uma notificação no Portal para os admins.'}
          </li>
          <li>
            {'A conferência fica '}
            <b>fechada</b>
            {'. Para corrigir, peça ao COMEX para reabrir.'}
          </li>
        </ul>
        {pendingText ? (
          <div className="crf-dlg__warn" role="note">
            {`Pendências: ${pendingText}. Dá para fechar assim.`}
          </div>
        ) : null}
        <div className="crf-dlg__actions">
          <button type="button" className="secondary-button" ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Fechando…' : 'Salvar e fechar conferência'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Barra de ações do formulário (S7, por papel e estado).
//   Admin: rascunho = importar, exportar, imprimir, salvar rascunho, salvar e fechar;
//          COMEX fechado = imprimir, exportar, reabrir parte do COMEX; concluído = + reabrir conferência.
//   Logística: descartar, salvar conferência e (só com o COMEX fechado) salvar e fechar conferência.
export function CargoReportActionBar({
  process,
  processId,
  profile,
  form,
  conference,
  savedConference,
  catalog,
  stage,
  isDesktop,
  isSaving,
  canSave,
  conferenceDirty,
  onSaveDraft,
  onSaveConference,
  onDiscardConference,
  describeSaveError,
  onErrors,
  onPersisted,
  onConferencePersisted,
  onFeedback,
  renderImport,
}) {
  const role = profile?.role
  const canEdit = canEditCargoReport(role)
  const canConclude = canConcludeCargoReport(role)
  const canSaveConference = canSaveCargoConference(role, stage)
  const canClose = canCloseCargoConference(role, stage)
  const canReopenConference = canReopenCargoConference(role, stage)
  const canReopenComex = canReopenCargoReportComex(role, stage)
  const isDraft = stage === CARGO_STAGE.draft
  const isDone = stage === CARGO_STAGE.done
  const actorName = String(profile?.name ?? profile?.email ?? '').trim()
  const [isConcludeOpen, setIsConcludeOpen] = useState(false)
  const [isCloseOpen, setIsCloseOpen] = useState(false)
  const [isReopenComexOpen, setIsReopenComexOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [printToken, setPrintToken] = useState(0)
  const workingRef = useRef(false)
  const isBusy = isSaving || isWorking

  const buildSheet = (source, sheetConference = conference) =>
    buildCargoReportSheet(source, { process, conference: sheetConference, catalog })

  // Uma tarefa por vez (exportar, fechar, gravar de novo, reabrir).
  async function runWork(task) {
    if (workingRef.current) return
    workingRef.current = true
    setIsWorking(true)
    try {
      await task()
    } finally {
      workingRef.current = false
      setIsWorking(false)
    }
  }

  // Exportar, imprimir e fechar usam o estado atual da tela; número inválido bloqueia como no salvar.
  function hasBlockingErrors() {
    const { errors } = buildCargoReportPayload(form, {})
    if (errors.length === 0) return false
    onErrors(errors)
    return true
  }

  function handleExport() {
    if (!canConclude || isBusy || hasBlockingErrors()) return
    onFeedback(null)
    runWork(async () => {
      try {
        const { generateCargoReportFile } = await import('./cargoReportExcel')
        const file = await generateCargoReportFile(buildSheet(form))
        saveBlobAsFile(file, file.name)
      } catch (error) {
        onFeedback({ kind: 'error', text: buildActionErrorMessage(EXPORT_ERROR_PREFIX, error) })
      }
    })
  }

  function handlePrint() {
    if (!canConclude || isBusy || hasBlockingErrors()) return
    onFeedback(null)
    setPrintToken((token) => token + 1)
    setIsPrinting(true)
  }

  // ---------- COMEX: salvar e fechar ----------

  function handleOpenConclude() {
    if (!canConclude || isBusy || !isDraft) return
    onFeedback(null)
    const { errors } = buildConcludedCargoReportPayload(form, {})
    if (errors.length > 0) {
      onErrors(errors)
      return
    }
    setIsConcludeOpen(true)
  }

  function finishConcluded(payload, documentId) {
    const lastGenerated = {
      documentId,
      revision: payload.revision,
      at: new Date(),
      byId: String(profile?.uid ?? ''),
    }
    onPersisted(payload, { lastGenerated })
    onFeedback({ kind: 'success', text: MESSAGES.concluded })
  }

  function describeConcludeError(error, payload) {
    if (error?.code === CARGO_REPORT_ATTACHED_NOT_SAVED_CODE) {
      if (error.cause?.code === CARGO_REPORT_CONFLICT_CODE) return { kind: 'conflict', text: MESSAGES.attachedConflict }
      return {
        kind: 'retry',
        text: MESSAGES.attachedNotSaved,
        action: { label: 'Gravar de novo', run: () => handleRetryWrite(payload, error.documentId) },
      }
    }
    if (error?.code === CARGO_REPORT_CONFLICT_CODE || error?.code === 'permission-denied') {
      return describeSaveError(error, 'draft')
    }
    return { kind: 'error', text: buildActionErrorMessage(CONCLUDE_ERROR_PREFIX, error) }
  }

  // Gera o Excel, anexa pelo fluxo de documentos e grava o `current` como fechado. Antes de tudo relê a
  // conferência no servidor: se a logística salvou depois que a tela abriu, o Excel sairia com OK?, contagem
  // e etiquetas velhos; nesse caso nada é anexado nem enviado. O admin não grava mais a conferência (S7).
  async function handleConfirmConclude() {
    if (!canConclude || isBusy) return
    await runWork(async () => {
      onFeedback(null)
      let concluded = null
      try {
        const built = buildConcludedCargoReportPayload(form, {
          catalogVersion: catalog?.exists ? catalog.version : 0,
          catalog,
          today: toCargoDateKey(new Date()),
        })
        if (built.errors.length > 0) {
          onErrors(built.errors)
          return
        }
        concluded = built.payload

        const latest = await getCargoReport(processId)
        if (fromConferenceDoc(latest.conference).revision !== savedConference.revision) {
          onFeedback({ kind: 'conflict', text: MESSAGES.conferenceChanged })
          return
        }

        const { generateCargoReportFile } = await import('./cargoReportExcel')
        const file = await generateCargoReportFile(buildSheet(concluded))
        const result = await concludeCargoReport(processId, {
          payload: concluded,
          file,
          category: process?.category,
          actor: profile,
        })
        finishConcluded(concluded, result.documentId)
      } catch (error) {
        onFeedback(describeConcludeError(error, concluded))
      } finally {
        setIsConcludeOpen(false)
      }
    })
  }

  // O arquivo já está anexado e o aviso já saiu: grava só o formulário, sem anexar de novo.
  async function handleRetryWrite(payload, documentId) {
    await runWork(async () => {
      onFeedback(null)
      try {
        await retryConcludeWrite(processId, { payload, documentId, actor: profile })
        finishConcluded(payload, documentId)
      } catch (error) {
        onFeedback(
          error?.code === CARGO_REPORT_CONFLICT_CODE
            ? { kind: 'conflict', text: MESSAGES.attachedConflict }
            : {
                kind: 'retry',
                text: buildActionErrorMessage(MESSAGES.attachedNotSaved, error),
                action: { label: 'Gravar de novo', run: () => handleRetryWrite(payload, documentId) },
              }
        )
      }
    })
  }

  // ---------- Logística: salvar e fechar conferência ----------

  const filledRows = (Array.isArray(form.rows) ? form.rows : []).filter((row) => !isCargoReportRowEmpty(row))

  function buildPendingText() {
    const withoutOk = filledRows.filter((row) => conference.okByRowId?.[row.id] !== true).length
    const withoutCount = filledRows.filter((row) => conference.countOkByRowId?.[row.id] !== true).length
    return [
      withoutOk > 0 ? pluralLines(withoutOk, 'sem OK?') : '',
      withoutCount > 0 ? pluralLines(withoutCount, 'sem contagem') : '',
      conference.receiptStatus ? '' : 'Status do recebimento não informado',
    ]
      .filter(Boolean)
      .join(', ')
  }

  function buildClosedPayload() {
    return buildClosedConferencePayload(
      { ...conference, revision: savedConference.revision },
      form.rows,
      { actorName, actorUid: String(profile?.uid ?? ''), today: toCargoDateKey(new Date()) }
    )
  }

  function finishClosedConference(payload, documentId) {
    onConferencePersisted({
      ...payload,
      closedDocumentId: documentId,
      updatedAt: new Date(),
      updatedByName: actorName,
    })
    onFeedback({ kind: 'success', text: MESSAGES.conferenceClosed })
  }

  function describeCloseError(error, payload) {
    if (error?.code === CARGO_REPORT_ATTACHED_NOT_SAVED_CODE) {
      if (error.cause?.code === CARGO_REPORT_CONFLICT_CODE) {
        return { kind: 'conflict', text: MESSAGES.conferenceAttachedConflict }
      }
      return {
        kind: 'retry',
        text: MESSAGES.conferenceAttachedNotSaved,
        action: { label: 'Gravar de novo', run: () => handleRetryClose(payload, error.documentId) },
      }
    }
    if (error?.code === CARGO_REPORT_CONFLICT_CODE) {
      return error.scope === 'current'
        ? { kind: 'conflict', text: MESSAGES.currentChanged }
        : describeSaveError(error, 'conference')
    }
    if (error?.code === 'permission-denied') return describeSaveError(error, 'conference')
    return { kind: 'error', text: buildActionErrorMessage(CLOSE_ERROR_PREFIX, error) }
  }

  function handleOpenClose() {
    if (!canClose || isBusy) return
    onFeedback(null)
    setIsCloseOpen(true)
  }

  // Gera o Excel com a conferência fechada (nome, data de fechamento e recebimento) e anexa como nova
  // versão; o servidor rotaciona as versões e manda o aviso da conferência.
  async function handleConfirmClose() {
    if (!canClose || isBusy) return
    await runWork(async () => {
      onFeedback(null)
      let payload = null
      try {
        payload = buildClosedPayload()
        const { generateCargoReportFile } = await import('./cargoReportExcel')
        const file = await generateCargoReportFile(buildSheet(form, payload))
        const result = await closeCargoReportConference(processId, {
          payload,
          file,
          category: process?.category,
          actor: profile,
          currentRevision: form.revision,
        })
        finishClosedConference(payload, result.documentId)
      } catch (error) {
        onFeedback(describeCloseError(error, payload))
      } finally {
        setIsCloseOpen(false)
      }
    })
  }

  // O arquivo já está anexado e o aviso já saiu: grava só a conferência, sem anexar de novo.
  async function handleRetryClose(payload, documentId) {
    await runWork(async () => {
      onFeedback(null)
      try {
        await retryCloseConferenceWrite(processId, { payload, documentId, actor: profile })
        finishClosedConference(payload, documentId)
      } catch (error) {
        onFeedback(
          error?.code === CARGO_REPORT_CONFLICT_CODE
            ? { kind: 'conflict', text: MESSAGES.conferenceAttachedConflict }
            : {
                kind: 'retry',
                text: buildActionErrorMessage(MESSAGES.conferenceAttachedNotSaved, error),
                action: { label: 'Gravar de novo', run: () => handleRetryClose(payload, documentId) },
              }
        )
      }
    })
  }

  // ---------- Admin: reabrir ----------

  // Estado 3 -> 2: o conteúdo da conferência fica intacto; só status e fechamento voltam.
  async function reopenConferenceNow() {
    const result = await reopenCargoReportConference(processId, profile)
    onConferencePersisted({
      ...savedConference,
      revision: result.revision,
      status: CARGO_CONFERENCE_STATUS.open,
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
      updatedAt: new Date(),
      updatedByName: actorName,
    })
  }

  function handleReopenConference() {
    if (!canReopenConference || isBusy) return
    runWork(async () => {
      onFeedback(null)
      try {
        await reopenConferenceNow()
        onFeedback({ kind: 'success', text: MESSAGES.conferenceReopened })
      } catch (error) {
        onFeedback(
          error?.code === CARGO_REPORT_CONFLICT_CODE || error?.code === 'permission-denied'
            ? describeSaveError(error, 'conference')
            : { kind: 'error', text: buildActionErrorMessage(REOPEN_ERROR_PREFIX, error) }
        )
      }
    })
  }

  // Estado 2 -> 1 (direto) ou 3 -> 1 (confirma; reabre a conferência primeiro e depois o `current`).
  function handleReopenComexClick() {
    if (!canReopenComex || isBusy) return
    if (isDone) setIsReopenComexOpen(true)
    else handleReopenComex()
  }

  function handleReopenComex() {
    setIsReopenComexOpen(false)
    if (!canReopenComex || isBusy) return
    runWork(async () => {
      onFeedback(null)
      let conferenceReopened = false
      try {
        if (isDone) {
          await reopenConferenceNow()
          conferenceReopened = true
        }
        const { payload } = buildReopenedCargoReportPayload(form, { catalogVersion: form.catalogVersion })
        await reopenCargoReport(processId, payload, profile)
        onPersisted(payload, {})
        onFeedback({ kind: 'success', text: MESSAGES.reopened })
      } catch (error) {
        const described = describeSaveError(error, isDone && !conferenceReopened ? 'conference' : 'draft')
        onFeedback(conferenceReopened ? { ...described, text: `${MESSAGES.reopenPartial} ${described.text}` } : described)
      }
    })
  }

  const exportButton = (
    <button type="button" className="secondary-button" disabled={isBusy} onClick={handleExport}>
      Exportar Excel
    </button>
  )
  const printButton = (
    <button type="button" className="secondary-button" disabled={isBusy} onClick={handlePrint}>
      {isDraft ? null : <Icon name="print" size={16} />}
      Imprimir / Salvar PDF
    </button>
  )

  const concludeSheet = isConcludeOpen ? buildSheet(form) : null
  const isLogisticsView = !canEdit && (stage === CARGO_STAGE.draft || stage === CARGO_STAGE.comexClosed)

  return (
    <>
      {canEdit || isLogisticsView ? (
        <div className="crf-bar">
          <div className="l">
            {isSaving ? (
              <span className="field-hint" role="status">
                {canEdit ? 'Salvando rascunho…' : 'Salvando conferência…'}
              </span>
            ) : null}
            {isLogisticsView && !isSaving ? (
              <span className="docs-note">{canClose ? MESSAGES.conferHint : MESSAGES.conferWaiting}</span>
            ) : null}
            {/* S5: "Importar de planilha" (arquivo + diálogo ficam no formulário); some depois que o COMEX fecha. */}
            {canEdit && isDraft ? renderImport?.(isBusy) : null}
            {canEdit && isDesktop ? (
              isDraft ? (
                <>
                  {exportButton}
                  {printButton}
                </>
              ) : (
                <>
                  {printButton}
                  {exportButton}
                </>
              )
            ) : null}
          </div>
          <div className="r">
            {canReopenConference ? (
              <button
                type="button"
                className="secondary-button crf-bar__wide"
                disabled={isBusy}
                onClick={handleReopenConference}
              >
                Reabrir conferência
              </button>
            ) : null}
            {canReopenComex ? (
              <button
                type="button"
                className="secondary-button crf-bar__wide"
                disabled={isBusy}
                onClick={handleReopenComexClick}
              >
                Reabrir parte do COMEX
              </button>
            ) : null}
            {canEdit && isDraft ? (
              <>
                <button type="button" className="secondary-button" disabled={isBusy || !canSave} onClick={onSaveDraft}>
                  Salvar rascunho
                </button>
                <button type="button" className="primary-button" disabled={isBusy} onClick={handleOpenConclude}>
                  Salvar e fechar
                </button>
              </>
            ) : null}
            {canEdit && !isDesktop ? (
              <button type="button" className="secondary-button crf-bar__wide" onClick={() => setIsMoreOpen(true)}>
                Mais ações
              </button>
            ) : null}
            {canSaveConference ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isBusy || !conferenceDirty}
                  onClick={onDiscardConference}
                >
                  Descartar
                </button>
                <button
                  type="button"
                  className={canClose ? 'secondary-button' : 'primary-button'}
                  disabled={isBusy || !canSave}
                  onClick={onSaveConference}
                >
                  Salvar conferência
                </button>
                {canClose ? (
                  <button
                    type="button"
                    className="primary-button crf-bar__wide"
                    disabled={isBusy}
                    onClick={handleOpenClose}
                  >
                    Salvar e fechar conferência
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-button crf-bar__wide"
                    disabled
                    title="Disponível depois que o COMEX fechar"
                  >
                    Salvar e fechar conferência
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <CargoReportConcludeDialog
        open={isConcludeOpen}
        processName={process?.name || form.titleSuffix}
        alertCount={concludeSheet?.alerts.length ?? 0}
        alertsText={describeCargoReportAlerts(concludeSheet?.alerts)}
        catalogMissing={!catalog?.exists}
        busy={isWorking}
        onConfirm={handleConfirmConclude}
        onCancel={() => setIsConcludeOpen(false)}
      />

      <CargoReportCloseConferenceDialog
        open={isCloseOpen}
        processName={process?.name || form.titleSuffix}
        pendingText={isCloseOpen ? buildPendingText() : ''}
        busy={isWorking}
        onConfirm={handleConfirmClose}
        onCancel={() => setIsCloseOpen(false)}
      />

      <ConfirmDialog
        open={isReopenComexOpen}
        title={MESSAGES.reopenComexTitle}
        message={MESSAGES.reopenComexMessage}
        confirmLabel="Reabrir parte do COMEX"
        onConfirm={handleReopenComex}
        onCancel={() => setIsReopenComexOpen(false)}
      />

      {isMoreOpen ? (
        <ActionSheet
          title="Mais ações"
          options={[
            { value: 'export', label: 'Exportar Excel' },
            { value: 'print', label: 'Imprimir / Salvar PDF' },
          ]}
          value=""
          onSelect={(value) => {
            setIsMoreOpen(false)
            if (value === 'export') handleExport()
            else handlePrint()
          }}
          onClose={() => setIsMoreOpen(false)}
        />
      ) : null}

      {isPrinting ? (
        <CargoReportPrintSheet key={printToken} sheet={buildSheet(form)} onDone={() => setIsPrinting(false)} />
      ) : null}
    </>
  )
}
