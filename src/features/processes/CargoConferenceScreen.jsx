import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext'
import { describeCargoConferenceCategory, describeCargoConferenceSupplier } from './cargoConferenceList'
import { isCargoRowConferred } from './cargoConferenceModel'
import CargoConferenceCloseSheet from './CargoConferenceCloseSheet'
import CargoConferenceItemCard from './CargoConferenceItemCard'
import CargoConferenceReceiptPanel from './CargoConferenceReceiptPanel'
import { CARGO_STAGE } from './cargoReportFormModel'
import { CARGO_ORPHAN_GROUP_LABEL, getCargoReportPurchaseOrders, groupCargoRowsByPurchaseOrder } from './cargoReportGroups'
import { purchaseOrderLabel } from './cargoReportRowOps'
import { getDerivedStatusToneClass, getProcessDerivedStatus } from './processDerivedStatus'
import { getProcessTitle } from './processLabels'
import useCargoConferenceScreen from './useCargoConferenceScreen'

// S9-F do Relatório de Carga: tela de conferência de um processo no celular (mock aprovado). Faixa com voltar, nome,
// fase e progresso; abas Itens | Recebimento; barra inferior (por portal no body, fora do `.page-fade`) com Salvar |
// Salvar e fechar, Voltar à lista ou Reabrir conferência; folha de fechamento com as pendências. A logística confere;
// o admin só acompanha e reabre. Estados somente leitura: conferência fechada e papel admin.

const TABS = [
  { value: 'itens', label: 'Itens' },
  { value: 'recebimento', label: 'Recebimento' },
]

const NOTES = {
  admin: 'Admin só acompanha no celular. Quem preenche e fecha a conferência é a logística',
  adminClosed: '; você pode reabrir esta.',
  closed: 'Conferência fechada. Para corrigir, peça ao COMEX para reabrir.',
  comexDraft: 'O COMEX ainda não fechou a parte dele. Você já pode conferir e salvar; fechar só depois que ele fechar.',
}

// Barra inferior fixa por portal no body: `position: fixed` não pode ficar dentro do `.page-fade` (transform).
function renderActionBar(children) {
  return createPortal(
    <div className="ccf-actionbar" role="group" aria-label="Ações da conferência">
      {children}
    </div>,
    document.body
  )
}

function ProgressLine({ done, total, process }) {
  const percent = total > 0 ? Math.round((done * 100) / total) : 0
  return (
    <>
      <span className="ccf-bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
      <p className="ccf-sub">
        <b>{done}</b> de {total} itens conferidos · {describeCargoConferenceCategory(process?.category)} ·{' '}
        {describeCargoConferenceSupplier(process)}
      </p>
    </>
  )
}

export default function CargoConferenceScreen({ process, profile, canSeeName, onBack, onClosed }) {
  const screen = useCargoConferenceScreen({ process, profile, onClosed })
  const { requestLeave } = useUnsavedChanges()
  const [tab, setTab] = useState('itens')
  const [onlyPending, setOnlyPending] = useState(false)
  const tabRefs = useRef({})
  const baseId = useId()
  const noteId = `${baseId}-note`
  const isAdmin = profile?.role === 'admin'
  const phase = getProcessDerivedStatus(process)
  const purchaseOrders = useMemo(() => getCargoReportPurchaseOrders(process), [process])
  const { rows, conference, stage } = screen
  const isClosed = stage === CARGO_STAGE.done
  const comexDraft = stage === CARGO_STAGE.draft

  const groups = useMemo(
    () => (purchaseOrders.length > 0 ? groupCargoRowsByPurchaseOrder(rows, purchaseOrders) : []),
    [purchaseOrders, rows]
  )

  const header = (
    <div className="ccf-strip">
      <div className="ccf-strip__row">
        <button
          type="button"
          className="ccf-iconbtn"
          aria-label="Voltar para a lista"
          onClick={() => requestLeave(onBack)}
        >
          <Icon name="chevron-left" size={20} />
        </button>
        <h2 className="ccf-strip__title">{getProcessTitle(process, canSeeName)}</h2>
        <span className={getDerivedStatusToneClass(phase)}>{phase.label}</span>
      </div>
      {screen.loadState === 'ready' ? (
        <ProgressLine done={screen.progress.done} total={screen.progress.total} process={process} />
      ) : null}
    </div>
  )

  if (screen.loadState === 'loading') {
    return (
      <div className="ccf-screen">
        {header}
        <div className="ccf-skeletons" role="status" aria-label="Carregando conferência">
          <Skeleton variant="card" />
          <Skeleton variant="card" />
        </div>
      </div>
    )
  }

  if (screen.loadState === 'error' || screen.loadState === 'missing') {
    return (
      <div className="ccf-screen">
        {header}
        {screen.loadState === 'error' ? (
          <div className="error-banner error-banner--retry" role="alert">
            <span>{screen.loadError}</span>
            <button type="button" className="secondary-button" onClick={screen.reload}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="ccf-note ccf-note--warn" role="status">
            O COMEX ainda não criou o Relatório de Carga deste processo. Sem ele não há o que conferir.
          </div>
        )}
        {renderActionBar(
          <button type="button" className="secondary-button" onClick={onBack}>
            Voltar à lista
          </button>
        )}
      </div>
    )
  }

  function handleTabKeyDown(event) {
    const index = TABS.findIndex((item) => item.value === tab)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    if (next < 0) return
    event.preventDefault()
    setTab(TABS[next].value)
    tabRefs.current[TABS[next].value]?.focus()
  }

  let note = null
  if (isAdmin) note = `${NOTES.admin}${isClosed ? NOTES.adminClosed : '.'}`
  else if (isClosed) note = NOTES.closed
  else if (comexDraft) note = NOTES.comexDraft
  const noteClass = isClosed && !isAdmin ? 'ccf-note ccf-note--ok' : comexDraft && !isAdmin ? 'ccf-note ccf-note--warn' : 'ccf-note'

  const feedback = screen.feedback
  const feedbackAction =
    feedback?.action ?? (feedback?.kind === 'conflict' ? { label: 'Recarregar', run: screen.reload } : null)

  function renderCard(row, rowIndex) {
    return (
      <CargoConferenceItemCard
        key={row.id}
        row={row}
        number={rowIndex + 1}
        derived={screen.derived[rowIndex]}
        ok={conference.okByRowId?.[row.id]}
        countOk={conference.countOkByRowId?.[row.id]}
        labels={conference.labelsByRowId?.[row.id]}
        editable={screen.canSave}
        idPrefix={`${baseId}-r${rowIndex}`}
        onToggleOk={screen.toggleOk}
        onToggleCount={screen.toggleCount}
        onLabelChange={screen.setLabel}
      />
    )
  }

  const isPending = (row) => !isCargoRowConferred(conference, row.id)
  const showOnlyPending = screen.canSave && onlyPending
  let itemsContent
  if (rows.length === 0) {
    itemsContent = <div className="ccf-note">Este relatório não tem itens.</div>
  } else if (showOnlyPending && !rows.some(isPending)) {
    itemsContent = (
      <div className="ccf-note ccf-note--ok" role="status">
        Todos os itens estão conferidos.
      </div>
    )
  } else if (groups.length > 0) {
    itemsContent = groups
      .filter((group) => group.rows.length > 0)
      .map((group) => {
        const done = group.rows.filter(({ row }) => !isPending(row)).length
        const label = group.purchaseOrder ? purchaseOrderLabel(group.purchaseOrder) : CARGO_ORPHAN_GROUP_LABEL
        const supplier = group.purchaseOrder?.supplierName
        return (
          <section className="ccf-groupblock" key={group.purchaseOrder?.po ?? 'orphans'} aria-label={label}>
            <div className="ccf-group">
              {label}
              <small>
                {supplier ? `${supplier} · ` : ''}
                {done} de {group.rows.length} conferidos
              </small>
            </div>
            {group.rows
              .filter(({ row }) => !showOnlyPending || isPending(row))
              .map(({ row, rowIndex }) => renderCard(row, rowIndex))}
          </section>
        )
      })
  } else {
    itemsContent = rows.map((row, rowIndex) => (showOnlyPending && !isPending(row) ? null : renderCard(row, rowIndex)))
  }

  const saveDisabled = screen.isBusy || !screen.dirty
  const closeDisabled = screen.isBusy || !screen.canClose
  let actions
  if (screen.canSave) {
    actions = (
      <>
        <button type="button" className="secondary-button" disabled={saveDisabled} onClick={screen.save}>
          Salvar
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={closeDisabled}
          aria-describedby={comexDraft ? noteId : undefined}
          onClick={screen.openClose}
        >
          Salvar e fechar
        </button>
      </>
    )
  } else if (screen.canReopen) {
    actions = (
      <button type="button" className="secondary-button ccf-danger" disabled={screen.isBusy} onClick={screen.reopen}>
        Reabrir conferência
      </button>
    )
  } else {
    actions = (
      <button type="button" className="secondary-button" onClick={() => requestLeave(onBack)}>
        Voltar à lista
      </button>
    )
  }

  return (
    <div className="ccf-screen">
      {header}

      <div className="ccf-tabs" role="tablist" aria-label="Seções da conferência" onKeyDown={handleTabKeyDown}>
        {TABS.map((item) => (
          <button
            key={item.value}
            ref={(element) => {
              tabRefs.current[item.value] = element
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls={tab === item.value ? `${baseId}-panel` : undefined}
            tabIndex={tab === item.value ? 0 : -1}
            className="ccf-tab"
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {note ? (
        <div className={noteClass} id={noteId}>
          {note}
        </div>
      ) : null}

      {feedback ? (
        feedback.kind === 'success' ? (
          <div className="success-banner" role="status">
            {feedback.text}
          </div>
        ) : (
          <div className={`error-banner${feedbackAction ? ' error-banner--retry' : ''}`} role="alert">
            <span>{feedback.text}</span>
            {feedbackAction ? (
              <button type="button" className="secondary-button" onClick={feedbackAction.run}>
                {feedbackAction.label}
              </button>
            ) : null}
          </div>
        )
      ) : null}

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`} className="ccf-body">
        {tab === 'itens' ? (
          <>
            {screen.canSave ? (
              <div className="ccf-tools">
                <button type="button" className="secondary-button ccf-markall" onClick={screen.markAllOk}>
                  <Icon name="check" size={16} strokeWidth={2.2} />
                  Marcar todos OK
                </button>
                <label className="ccf-check">
                  <input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
                  Só pendentes
                </label>
              </div>
            ) : null}
            {itemsContent}
          </>
        ) : (
          <CargoConferenceReceiptPanel
            conference={conference}
            onChange={screen.patch}
            canEdit={screen.canSave}
            checkedBy={screen.canSave ? screen.actorName : ''}
            isAdmin={isAdmin}
            unloadErrors={screen.unloadErrors}
          />
        )}
      </div>

      {renderActionBar(actions)}

      <CargoConferenceCloseSheet
        open={screen.isCloseOpen}
        pendings={screen.pendings}
        busy={screen.isBusy}
        onConfirm={screen.confirmClose}
        onCancel={screen.cancelClose}
      />
    </div>
  )
}
