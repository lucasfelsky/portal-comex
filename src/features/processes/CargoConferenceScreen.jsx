import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext'
import useMediaQuery from '../../hooks/useMediaQuery'
import { describeCargoConferenceCategory, describeCargoConferenceSupplier } from './cargoConferenceList'
import {
  CARGO_PHOTOS_PER_CONFERENCE,
  listCargoIssueRows,
  readCargoRowIssue,
} from './cargoConferenceIssues'
import { describeCargoLot, buildCargoConferenceItems, listCargoSearchItems, locateCargoItem, summarizeCargoConferenceItem } from './cargoConferenceItems'
import { countCargoPhotos } from './cargoConferencePhotos'
import { describeCargoRow } from './cargoConferenceModel'
import CargoConferenceItemList from './CargoConferenceItemList'
import CargoConferenceItemView from './CargoConferenceItemView'
import CargoConferenceReceiptPanel from './CargoConferenceReceiptPanel'
import CargoPartialPalletSheet from './CargoPartialPalletSheet'
import { formatCargoPalletsStrip } from './cargoConferenceUnits'
import { CARGO_STAGE } from './cargoReportFormModel'
import { getCargoReportPurchaseOrders } from './cargoReportGroups'
import { getDerivedStatusToneClass, getProcessDerivedStatus } from './processDerivedStatus'
import { getProcessTitle } from './processLabels'
import useCargoConferenceScreen from './useCargoConferenceScreen'
import { readCargoScrollTop, writeCargoScrollTop } from './useCargoStickyStuck'

// S9-F do Relatório de Carga: tela de conferência de um processo no celular (mock aprovado). Faixa com voltar, nome,
// fase, progresso e (S10-I) os pallets contados x o total do COMEX; abas Itens | Recebimento; barra inferior (por portal
// no body, fora do `.page-fade`) com Salvar, Voltar à lista ou Reabrir conferência. S9-H: o celular só salva; fechar a
// conferência é do computador. A logística confere; o admin só acompanha e reabre. Estados somente leitura:
// conferência fechada e papel admin.
// Conferência por item (Fatia A): a aba Itens lista só os ITENS (com busca); a tela do item (parâmetro de URL `item`,
// D-14) mostra todos os lotes dele. A busca e o "Só pendentes" vivem aqui e sobrevivem a abrir e voltar do item; a
// rolagem da lista é restaurada ao voltar. "Próximo item" anda pelos itens da busca.
// Fatia B: a folha "Pallet parcial" (aberta pelo botão de um lote) é montada aqui; a faixa da lista conta os pallets com os
// parciais ("N pallets contados de M informados pelo COMEX (inclui K parciais)").
// Fatia C: a aba Recebimento ganha o cartão "Descarga por unidade" (um início e um fim por contêiner do `process`).

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

// "Poliol Flex 3000 · L-2232" (sem lote: "· sem lote"), como o mock mostra na folha.
function describePartialLot({ name, lot }) {
  return `${name} · ${lot || 'sem lote'}`
}

const PALLETS_BADGES = {
  divergente: { className: 'ccf-badge ccf-badge--warn', label: 'Divergente' },
  confere: { className: 'ccf-badge ccf-badge--ok', label: 'Confere' },
  semTotal: { className: 'ccf-badge', label: 'Sem total' },
}

function ProgressLine({ itemsDone, itemsTotal, lotsDone, lotsTotal, process, pallets, photoCount }) {
  const percent = itemsTotal > 0 ? Math.round((itemsDone * 100) / itemsTotal) : 0
  const badge = PALLETS_BADGES[pallets.state]
  return (
    <>
      <span className="ccf-bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </span>
      <p className="ccf-sub">
        <b>{itemsDone}</b> de {itemsTotal} itens conferidos · {lotsDone} de {lotsTotal} lotes ·{' '}
        {describeCargoConferenceCategory(process?.category)} · {describeCargoConferenceSupplier(process)}
      </p>
      <p className="ccf-pallets">
        <span>{formatCargoPalletsStrip(pallets)}</span>
        <span className={badge.className}>{badge.label}</span>
        {photoCount > 0 ? <span>{`${photoCount} de ${CARGO_PHOTOS_PER_CONFERENCE} fotos de avaria`}</span> : null}
      </p>
    </>
  )
}

export default function CargoConferenceScreen({ process, profile, canSeeName, onBack }) {
  const screen = useCargoConferenceScreen({ process, profile })
  const { requestLeave } = useUnsavedChanges()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const aboveNav = useMediaQuery('(max-width: 720px)')
  const [tab, setTab] = useState('itens')
  const [onlyPending, setOnlyPending] = useState(false)
  const [query, setQuery] = useState('')
  // Itens "fixados" no filtro "Só pendentes": o que a pessoa tocou/editou nesta sessão de tela fica visível mesmo depois
  // de deixar de ser pendente (o item não some sob o dedo). Zera ao trocar o filtro e ao sair da tela; só afeta a lista.
  const [pinnedKeys, setPinnedKeys] = useState(() => new Set())
  // Etiquetas, fotos e avaria: aberto/fechado por lote (sem valor = abre sozinho quando há avaria).
  const [detailsOpen, setDetailsOpen] = useState({})
  // Folha "Pallet parcial": { rowId, itemKey } do lote que a abriu. Vale só para o item em que foi aberta: trocar de item
  // (voltar do aparelho, Próximo item, voltar aos itens) a fecha sem efeito colateral.
  const [sheet, setSheet] = useState(null)
  const rootRef = useRef(null)
  const listScroll = useRef(0)
  const shownKey = useRef('')
  const tabRefs = useRef({})
  const baseId = useId()
  const noteId = `${baseId}-note`
  const isAdmin = profile?.role === 'admin'
  const phase = getProcessDerivedStatus(process)
  const purchaseOrders = useMemo(() => getCargoReportPurchaseOrders(process), [process])
  const { rows, conference, stage } = screen
  const isClosed = stage === CARGO_STAGE.done
  const isReady = screen.loadState === 'ready'
  const model = useMemo(() => buildCargoConferenceItems(rows, purchaseOrders), [rows, purchaseOrders])
  const itemKey = searchParams.get('item') ?? ''
  const activeItem = isReady && itemKey ? (model.itemByKey.get(itemKey) ?? null) : null
  const activeKey = activeItem?.key ?? ''

  // Sair do item que abriu a folha (voltar do aparelho, "Voltar aos itens", Próximo item) ZERA a folha: reabrir o mesmo item não
  // a traz de volta (ajuste de estado na renderização, sem efeito).
  if (sheet && sheet.itemKey !== activeKey) setSheet(null)
  const sheetRowId = sheet && sheet.itemKey === activeKey ? sheet.rowId : ''

  const pinRow = (rowId) => {
    const key = model.keyByRowId.get(rowId)
    if (!key) return
    setPinnedKeys((current) => (current.has(key) ? current : new Set(current).add(key)))
  }
  const withPin = (action) => (rowId, ...args) => {
    pinRow(rowId)
    return action(rowId, ...args)
  }

  // Abrir o item sobe ao topo; voltar à lista devolve a rolagem de antes (D-14). A área que rola é a página no celular.
  useLayoutEffect(() => {
    if (!isReady || shownKey.current === activeKey) return
    shownKey.current = activeKey
    if (rootRef.current) writeCargoScrollTop(rootRef.current, activeKey ? 0 : listScroll.current)
  }, [isReady, activeKey])

  function withItemParam(mutate) {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    const search = next.toString()
    return { search: search ? `?${search}` : '' }
  }

  function openItem(item) {
    if (rootRef.current) listScroll.current = readCargoScrollTop(rootRef.current)
    navigate(withItemParam((params) => params.set('item', item.key)), { state: { ...(location.state ?? {}), ccfItem: true } })
  }

  // Voltar do item: veio da lista, volta no histórico (o voltar do aparelho fica coerente); senão troca a URL.
  function backToItems() {
    if (location.state?.ccfItem) navigate(-1)
    else navigate(withItemParam((params) => params.delete('item')), { replace: true })
  }

  const searchItems = listCargoSearchItems(model.items, query)
  const activeIndex = searchItems.findIndex((item) => item.key === activeKey)
  const isLastItem = activeIndex >= searchItems.length - 1

  function nextItem() {
    const next = searchItems[Math.min(searchItems.length - 1, activeIndex + 1)]
    if (!next || next.key === activeKey) return
    navigate(withItemParam((params) => params.set('item', next.key)), { replace: true, state: location.state })
  }

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
      {isReady ? (
        <ProgressLine
          itemsDone={model.items.filter((item) => summarizeCargoConferenceItem(item, conference).full).length}
          itemsTotal={model.items.length}
          lotsDone={screen.progress.done}
          lotsTotal={screen.progress.total}
          process={process}
          pallets={screen.pallets}
          photoCount={countCargoPhotos(conference)}
        />
      ) : null}
    </div>
  )

  if (screen.loadState === 'loading') {
    return (
      <div className="ccf-screen" ref={rootRef}>
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
      <div className="ccf-screen" ref={rootRef}>
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

  function handleOnlyPendingChange(checked) {
    setOnlyPending(checked)
    setPinnedKeys(new Set())
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

  const noteAndFeedback = (
    <>
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
    </>
  )

  // Selo neutro "A contar": só quando o COMEX informou o total da carga (sem total não há contra o quê contar) e dá
  // para contar (conferência editável); fechada ou só leitura, o lote nunca contado segue "Sem contagem".
  const awaitingCount = screen.canSave && screen.pallets?.expected !== null && screen.pallets?.expected !== undefined

  const issueItems = listCargoIssueRows(rows, conference).map((row) => {
    const rowIndex = rows.indexOf(row)
    return {
      id: row.id,
      title: `${describeCargoRow(row, rowIndex + 1)} · ${describeCargoLot(row)}`,
      note: readCargoRowIssue(conference, row.id).note.trim(),
      photoCount: readCargoRowIssue(conference, row.id).photos.length,
    }
  })

  const saveDisabled = screen.isBusy || !screen.dirty || screen.isUploading
  const saveButton = (
    <button type="button" className="primary-button" disabled={saveDisabled} onClick={screen.save}>
      Salvar
    </button>
  )
  const uploadHint = screen.isUploading ? (
    <p className="ccf-actionbar__hint" role="status">
      Aguarde o envio das fotos.
    </p>
  ) : null
  const backButton = (
    <button type="button" className="secondary-button" onClick={backToItems}>
      Voltar aos itens
    </button>
  )
  const nextButton = (
    <button type="button" className="secondary-button" onClick={nextItem}>
      Próximo item
      <Icon name="chevron-right" size={16} strokeWidth={2} />
    </button>
  )

  let actions
  if (activeItem) {
    // No item: Próximo item (no último, Voltar aos itens) + Salvar; só leitura: Voltar aos itens + Próximo item.
    actions = screen.canSave ? (
      <>
        {uploadHint}
        {isLastItem ? backButton : nextButton}
        {saveButton}
      </>
    ) : (
      <>
        {backButton}
        {isLastItem ? null : nextButton}
      </>
    )
  } else if (screen.canSave) {
    actions = (
      <>
        {uploadHint}
        {saveButton}
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

  if (activeItem) {
    const cards = {
      conference,
      derived: screen.derived,
      expectedUnits: screen.expectedUnits,
      infoByRowId: model.infoByRowId,
      awaitingCount,
      editable: screen.canSave,
      photoTools: screen.photoTools,
      idPrefix: baseId,
      detailsOpen,
      actions: {
        toggleDetails: (rowId, open) =>
          setDetailsOpen((current) => (current[rowId] === open ? current : { ...current, [rowId]: open })),
        toggleOk: withPin(screen.toggleOk),
        stepPallets: withPin(screen.stepPallets),
        stepUnits: withPin(screen.stepUnits),
        setUnits: withPin(screen.setUnits),
        openPartial: (rowId) => setSheet({ rowId, itemKey: activeKey }),
        removePartial: screen.removePartialPallet,
        setIssue: withPin(screen.setIssue),
        setLabel: withPin(screen.setLabel),
        pin: pinRow,
      },
    }
    return (
      <div className="ccf-screen" ref={rootRef}>
        <CargoConferenceItemView
          item={activeItem}
          position={locateCargoItem(model.items, activeKey)}
          cards={cards}
          notice={noteAndFeedback}
          onBack={backToItems}
        />
        {renderActionBar(actions, aboveNav)}
        {sheetRowId && model.infoByRowId.has(sheetRowId) ? (
          <CargoPartialPalletSheet
            rowId={sheetRowId}
            lotLabel={describePartialLot(model.infoByRowId.get(sheetRowId))}
            options={rows
              .filter((candidate) => candidate.id !== sheetRowId && model.infoByRowId.has(candidate.id))
              .map((candidate) => ({ rowId: candidate.id, label: describePartialLot(model.infoByRowId.get(candidate.id)) }))}
            onAdd={(parts) => {
              if (screen.addPartialPallet(parts)) setSheet(null)
            }}
            onClose={() => setSheet(null)}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="ccf-screen" ref={rootRef}>
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

      {noteAndFeedback}

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`} className="ccf-body">
        {tab === 'itens' ? (
          rows.length === 0 ? (
            <div className="ccf-note">Este relatório não tem itens.</div>
          ) : (
            <CargoConferenceItemList
              model={model}
              conference={conference}
              expectedUnits={screen.expectedUnits}
              query={query}
              onQueryChange={setQuery}
              canSave={screen.canSave}
              onlyPending={onlyPending}
              onOnlyPendingChange={handleOnlyPendingChange}
              onMarkAllOk={screen.markAllOk}
              pinnedKeys={pinnedKeys}
              onOpen={openItem}
            />
          )
        ) : (
          <CargoConferenceReceiptPanel
            conference={conference}
            onChange={screen.patch}
            canEdit={screen.canSave}
            checkedBy={screen.canSave ? screen.actorName : ''}
            isAdmin={isAdmin}
            process={process}
            isClosed={isClosed}
            unload={{
              onChange: screen.setUnloadUnit,
              onStart: screen.startUnloadNow,
              onFinish: screen.finishUnloadNow,
              onRemove: screen.removeUnloadUnit,
            }}
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
