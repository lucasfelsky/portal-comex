import { useRef, useState } from 'react'
import ActionSheet from '../../components/ActionSheet'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import {
  concludeCargoReport,
  reopenCargoReport,
  retryConcludeWrite,
} from '../../services/cargoReportRepository'
import { saveBlobAsFile } from '../../services/processDocumentsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import CargoReportPrintSheet from './CargoReportPrintSheet'
import {
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
  buildCargoReportPayload,
  buildConcludedCargoReportPayload,
  buildReopenedCargoReportPayload,
  canConcludeCargoReport,
  canEditCargoReport,
  toCargoDateKey,
} from './cargoReportFormModel'
import { buildCargoReportSheet, describeCargoReportAlerts } from './cargoReportSheet'

// S4 do Relatório de Carga: confirmação de "Concluir e anexar" (mock s4-confirm) e a barra de ações
// do formulário (Exportar Excel, Imprimir / Salvar PDF, Concluir e anexar, Reabrir para corrigir).
// A barra vive aqui para o CargoReportForm não passar de 900 linhas; ela só conversa com o
// formulário por callbacks (feedback, recarregar, estado persistido).

const CONCLUDE_ERROR_PREFIX = 'Não foi possível concluir e anexar o relatório.'
const EXPORT_ERROR_PREFIX = 'Não foi possível gerar o Excel.'
const MESSAGES = {
  concluded: 'Relatório concluído e anexado. O aviso por e-mail foi enviado aos destinatários do Relatório de carga.',
  reopened: 'Relatório reaberto. Para gerar uma nova versão, conclua de novo.',
  attachedNotSaved: 'O Excel foi anexado e o aviso enviado, mas o relatório não foi marcado como concluído.',
  attachedConflict:
    'O Excel foi anexado e o aviso enviado, mas outra pessoa salvou o relatório antes. Recarregue e confira.',
  conferHint: 'Você marca o OK? e informa quem conferiu. As demais colunas são só do COMEX.',
  catalogMissing:
    'A tabela Item x Emb. não está disponível: peso líquido e nº de embalagens vão vazios no relatório concluído, e ao reabrir a tabela volta a calcular.',
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
      title="Concluir e anexar"
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
            {'O formulário passa a '}
            <b>Concluído</b>
            {'. Para corrigir, use "Reabrir para corrigir".'}
          </li>
        </ul>
        {alertCount > 0 ? (
          <div className="crf-dlg__warn" role="note">
            {`${alertsLead}: ${alertsText}. Dá para concluir assim.`}
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
            {busy ? 'Concluindo…' : 'Concluir e anexar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Barra de ações do formulário. Admin: exportar, imprimir, salvar rascunho, concluir e reabrir.
// Logística: descartar / salvar conferência (some quando o relatório está concluído).
export function CargoReportActionBar({
  process,
  processId,
  profile,
  form,
  conference,
  savedConference,
  catalog,
  isDesktop,
  isSaving,
  canSave,
  conferenceDirty,
  onSaveDraft,
  onSaveConference,
  onDiscardConference,
  saveConference,
  describeSaveError,
  onErrors,
  onPersisted,
  onFeedback,
  renderImport,
}) {
  const canEdit = canEditCargoReport(profile?.role)
  const canConclude = canConcludeCargoReport(profile?.role)
  const isConcluded = form.status === 'concluido'
  const [isConcludeOpen, setIsConcludeOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [printToken, setPrintToken] = useState(0)
  const workingRef = useRef(false)
  const isBusy = isSaving || isWorking

  const buildSheet = (source) => buildCargoReportSheet(source, { process, conference, catalog })

  // Uma tarefa por vez (exportar, concluir, gravar de novo, reabrir).
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

  // Exportar, imprimir e concluir usam o estado atual da tela; número inválido bloqueia como no salvar.
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

  function handleOpenConclude() {
    if (!canConclude || isBusy || isConcluded) return
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

  // Salva o "Conferido por" se mudou, gera o Excel, anexa pelo fluxo de documentos e grava o concluído.
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

        const nameChanged =
          String(conference.checkedByName ?? '').trim() !== String(savedConference.checkedByName ?? '').trim()
        if (nameChanged) {
          try {
            await saveConference(savedConference.revision, concluded.rows)
          } catch (error) {
            onFeedback(describeSaveError(error, 'conference'))
            return
          }
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

  function handleReopen() {
    if (!canConclude || isBusy || !isConcluded) return
    runWork(async () => {
      onFeedback(null)
      try {
        const { payload } = buildReopenedCargoReportPayload(form, { catalogVersion: form.catalogVersion })
        await reopenCargoReport(processId, payload, profile)
        onPersisted(payload, {})
        onFeedback({ kind: 'success', text: MESSAGES.reopened })
      } catch (error) {
        onFeedback(describeSaveError(error, 'draft'))
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
      {isConcluded ? <Icon name="print" size={16} /> : null}
      Imprimir / Salvar PDF
    </button>
  )

  const concludeSheet = isConcludeOpen ? buildSheet(form) : null

  return (
    <>
      <div className="crf-bar">
        <div className="l">
          {isSaving ? (
            <span className="field-hint" role="status">
              {canEdit ? 'Salvando rascunho…' : 'Salvando conferência…'}
            </span>
          ) : null}
          {!canEdit && !isSaving && !isConcluded ? <span className="docs-note">{MESSAGES.conferHint}</span> : null}
          {/* S5: "Importar de planilha" (arquivo + diálogo ficam no formulário); some quando concluído. */}
          {canEdit && !isConcluded ? renderImport?.(isBusy) : null}
          {canEdit && isDesktop ? (
            isConcluded ? (
              <>
                {printButton}
                {exportButton}
              </>
            ) : (
              <>
                {exportButton}
                {printButton}
              </>
            )
          ) : null}
        </div>
        <div className="r">
          {canEdit && isConcluded ? (
            <button type="button" className="secondary-button crf-bar__wide" disabled={isBusy} onClick={handleReopen}>
              Reabrir para corrigir
            </button>
          ) : null}
          {canEdit && !isConcluded ? (
            <>
              <button type="button" className="secondary-button" disabled={isBusy || !canSave} onClick={onSaveDraft}>
                Salvar rascunho
              </button>
              <button type="button" className="primary-button" disabled={isBusy} onClick={handleOpenConclude}>
                Concluir e anexar
              </button>
            </>
          ) : null}
          {canEdit && !isDesktop ? (
            <button type="button" className="secondary-button crf-bar__wide" onClick={() => setIsMoreOpen(true)}>
              Mais ações
            </button>
          ) : null}
          {!canEdit && !isConcluded ? (
            <>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy || !conferenceDirty}
                onClick={onDiscardConference}
              >
                Descartar
              </button>
              <button type="button" className="primary-button" disabled={isBusy || !canSave} onClick={onSaveConference}>
                Salvar conferência
              </button>
            </>
          ) : null}
        </div>
      </div>

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
