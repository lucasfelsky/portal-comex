import { useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext'
import useMediaQuery from '../../hooks/useMediaQuery'
import { describeCargoConferenceCategory, describeCargoConferenceSupplier } from './cargoConferenceList'
import {
  cargoRowPallets,
  formatCargoPalletsSummary,
  hasCargoRowIssue,
  listCargoIssueRows,
  readCargoRowIssue,
} from './cargoConferenceIssues'
import { describeCargoRow, isCargoRowConferred } from './cargoConferenceModel'
import CargoConferenceItemCard from './CargoConferenceItemCard'
import CargoConferenceReceiptPanel from './CargoConferenceReceiptPanel'
import { CARGO_STAGE } from './cargoReportFormModel'
import { CARGO_ORPHAN_GROUP_LABEL, getCargoReportPurchaseOrders, groupCargoRowsByPurchaseOrder } from './cargoReportGroups'
import { purchaseOrderLabel } from './cargoReportRowOps'
import { getDerivedStatusToneClass, getProcessDerivedStatus } from './processDerivedStatus'
import { getProcessTitle } from './processLabels'
import useCargoConferenceScreen from './useCargoConferenceScreen'

// S9-F do Relatório de Carga: tela de conferência de um processo no celular (mock aprovado). Faixa com voltar, nome,
// fase, progresso e (S10-I) os pallets contados x o total do COMEX; abas Itens | Recebimento; barra inferior (por portal
// no body, fora do `.page-fade`) com Salvar, Voltar à lista ou Reabrir conferência. S9-H: o celular só salva; fechar a
// conferência é do computador. A logística confere; o admin só acompanha e reabre. Estados somente leitura:
// conferência fechada e papel admin.

const TABS = [
  { value: 'itens', label: 'Itens' },
  { value: 'recebimento', label: 'Recebimento' },
]

const NOTES = {
  admin: 'Admin só acompanha no celular. Quem preenche e fecha a conferência é a logística',
  adminClosed: '; você pode reabrir esta.',
  closed: 'Conferência fechada. Para corrigir, peça ao COMEX para reabrir.',
  // S9-H: no celular a logística só salva; o fechamento é no computador.
  useComputer: 'Para fechar a conferência, use o computador.',
}

// Barra inferior fixa por portal no body: `position: fixed` não pode ficar dentro do `.page-fade` (transform).
// `aboveNav` (celular, <= 720 px): a barra de navegação de baixo existe e a barra de ações fica EM CIMA dela, sem
// sobreposição; acima de 720 px (paisagem, tablet) não há barra de navegação e a barra de ações cola na base.
function renderActionBar(children, aboveNav) {
  return createPortal(
    <div className={`ccf-actionbar${aboveNav ? ' ccf-actionbar--above-nav' : ''}`} role="group" aria-label="Ações da conferência">
      {children}
    </div>,
    document.body
  )
}

const PALLETS_BADGES = {
  divergente: { className: 'ccf-badge ccf-badge--warn', label: 'Divergente' },
  confere: { className: 'ccf-badge ccf-badge--ok', label: 'Confere' },
  semTotal: { className: 'ccf-badge', label: 'Sem total' },
}

function ProgressLine({ done, total, process, pallets }) {
  const percent = total > 0 ? Math.round((done * 100) / total) : 0
  const badge = PALLETS_BADGES[pallets.state]
  return (
    <>
      <span className="ccf-bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
      <p className="ccf-sub">
        <b>{done}</b> de {total} itens conferidos · {describeCargoConferenceCategory(process?.category)} ·{' '}
        {describeCargoConferenceSupplier(process)}
      </p>
      <p className="ccf-pallets">
        <span>{formatCargoPalletsSummary(pallets, { withState: false })}</span>
        <span className={badge.className}>{badge.label}</span>
      </p>
    </>
  )
}

export default function CargoConferenceScreen({ process, profile, canSeeName, onBack }) {
  const screen = useCargoConferenceScreen({ process, profile })
  const { requestLeave } = useUnsavedChanges()
  const aboveNav = useMediaQuery('(max-width: 720px)')
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
        <ProgressLine
          done={screen.progress.done}
          total={screen.progress.total}
          process={process}
          pallets={screen.pallets}
        />
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
          </button>,
          aboveNav
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
  else if (screen.canSave) note = NOTES.useComputer
  const noteClass = isClosed && !isAdmin ? 'ccf-note ccf-note--ok' : 'ccf-note'

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
        conferred={isCargoRowConferred(conference, row.id)}
        pallets={cargoRowPallets(conference, row.id)}
        issue={readCargoRowIssue(conference, row.id)}
        hasIssue={hasCargoRowIssue(conference, row.id)}
        labels={conference.labelsByRowId?.[row.id]}
        editable={screen.canSave}
        idPrefix={`${baseId}-r${rowIndex}`}
        onToggleOk={screen.toggleOk}
        onStepPallets={screen.stepPallets}
        onIssueChange={screen.setIssue}
        onLabelChange={screen.setLabel}
      />
    )
  }

  const issueItems = listCargoIssueRows(rows, conference).map((row) => {
    const rowIndex = rows.indexOf(row)
    return {
      id: row.id,
      number: rowIndex + 1,
      title: describeCargoRow(row, rowIndex + 1),
      note: readCargoRowIssue(conference, row.id).note.trim(),
    }
  })
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
  let actions
  if (screen.canSave) {
    actions = (
      <>
        <button type="button" className="primary-button" disabled={saveDisabled} onClick={screen.save}>
          Salvar
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
        <div className={noteClass} id={noteId} role="note">
          {note}
        </div>
      ) : null}

      {feedback ? (
        feedback.kind === 'success' ? (
          <>
            <div className="success-banner" role="status">
              {feedback.text}
            </div>
            {feedback.notice ? (
              <div className="ccf-note ccf-note--warn" role="status">
                {feedback.notice}
              </div>
            ) : null}
          </>
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
            issueItems={issueItems}
            statusSuggestion={
              screen.suggestStatus
                ? { text: 'Há item com avaria. Status sugerido: Com ressalva.', onApply: screen.applySuggestedStatus }
                : null
            }
          />
        )}
      </div>

      {renderActionBar(actions, aboveNav)}
    </div>
  )
}
