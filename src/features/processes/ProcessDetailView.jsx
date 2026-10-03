import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import { getCollectionWindows } from '../../utils/collectionWindows'
import { getEstimatedDeliveryDate } from '../../utils/deliveryForecast'
import { formatPostReceiptImageSize } from '../../utils/postReceiptImages'
import {
  CD_EN_ROUTE_STATUS,
  getDisplayedCollectionStatus,
  getDisplayedProcessStatus,
  isCollectionScheduledOrBeyondStatus,
  isProcessStatusFinalized,
} from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { getProcessSubtitle, getProcessTitle } from './processLabels'
import { getCollectionWindowLabel } from './containers'
import {
  canSeePurchaseOrderDetails,
  formatPurchaseOrderLine,
  getProcessPurchaseOrders,
} from './purchaseOrders'
import { getItemDangerousGoodsLabel } from './operationalOptions'
import Spinner from '../../components/Spinner'
import Icon from '../../components/Icon'
import { useMobileLayout } from '../../hooks/useMobileLayout'
import { isAirCategory, isMaritimeCategory, shouldShowContainerQuantity } from './processCategories'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import { getPendingFields } from './pendingFields'
import ProcessMessagesPanel from './ProcessMessagesPanel'
import ProcessHistoryPanel from './ProcessHistoryPanel'
import ProcessDocumentsPanel from './ProcessDocumentsPanel'
import { canViewProcessRecords, getDocumentPendingFields, normalizeDocumentIndex } from './processDocuments'
import ConfirmDialog from '../../components/ConfirmDialog'
import ErpHint from '../erp/ErpHint'
import { EMPTY_ERP_HINTS, buildErpFieldHints, erpItemGroupKey, erpOrderKey } from '../erp/erpReference'
import {
  DetailBlock,
  DetailBlockPlaceholder,
  DetailList,
  DetailRow,
  getErpEmptyRowHint,
  getErpRowHint,
  hasArrivalDetails,
  hasCustomsDetails,
  ProcessCargoDetails,
  ProcessTransitDetails,
  ProcessIdentificationDetails,
  ProcessLicensesDetails,
  ProcessArrivalDetails,
  ProcessFreeTimeDetails,
  ProcessCustomsDetails,
  ProcessReceiptDivergenceDetails,
} from './ProcessOperationalDetails'

// F10.4 (backlog 2026-07-12): tela de detalhe do processo (viewMode
// 'detail'), extraída do ProcessesPage. Presentacional — lê só o
// `selectedProcess` (via prop) e chama callbacks; o estado e os handlers
// continuam na página. As 5 abas (general/process/items/related-item/
// messages) são renderizadas por `detailTab`. A gallery de pós-recebimento
// fica no page (guardada por `isPostReceiptGalleryOpen`); esta view só
// chama `onOpenPostReceiptGallery(index)`.
//
// UX-6b-3: cabeçalho com nome/status/subtítulo (mascara intacta), menu
// "Mais ações" (admin, com "Excluir processo") e a aba "Processo" em
// blocos numerados 1-5 espelhando o wizard (Carga > Embarque > Chegada +
// Free time > Aduana + Anuências > Coleta).
export default function ProcessDetailView({
  selectedProcess,
  detailTab,
  isAdmin,
  canSeeName,
  isSaving,
  favoriteProcessIds,
  canEditPostReceiptNotes,
  canEditSelectedCollectionStatus,
  itemSearchTerm,
  selectedItemName,
  processMessages,
  isLoadingMessages,
  messageDraft,
  deletingMessageId,
  isSendingMessage,
  messageLimitReached,
  remainingMessages,
  hasUnlimitedMessages,
  visibleProcessItems,
  relatedActiveProcesses,
  selectedProcessPostReceiptImages,
  profile,
  erpReference = null,
  itemsSectionRef,
  onDetailTabChange,
  onSetItemSearchTerm,
  onMessageDraftChange,
  onOpenRelatedItemTab,
  onOpenProcessDetail,
  onToggleFavorite,
  onSetViewModeList,
  onEditMode,
  onPostReceiptEditMode,
  onCollectionStatusEditMode,
  onOpenPostReceiptGallery,
  onDeleteProcess,
  onSendMessage,
  onDeleteMessage,
}) {
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  // Mobile (<=720px): Favoritar e "..." sobem pra barra do topo (nav bar do
  // iOS); no desktop ficam na toolbar abaixo do titulo, como sempre.
  const isMobileLayout = useMobileLayout()
  const moreContainerRef = useRef(null)
  const moreTriggerRef = useRef(null)
  const firstMenuItemRef = useRef(null)
  // D-E: pendencias so pro admin.
  const pendingFields = isAdmin ? getPendingFields(selectedProcess) : []
  // F18a (D6): "Histórico"/"Documentos" so pra admin/logistica. Deep link
  // (`location.state.detailTab`, `ProcessesPage.jsx:813`) pode cair aqui
  // com um role sem acesso - o guard redireciona pra "Detalhes gerais".
  const canViewRecords = canViewProcessRecords(profile?.role)
  const effectiveTab =
    !canViewRecords && (detailTab === 'history' || detailTab === 'documents') ? 'general' : detailTab

  // F18b-2 (E3): contador de documentos pendentes na aba - `documentIndex`
  // (aba/select, atualizado no reload assincrono do trigger) EXCETO quando o
  // painel ja reportou a contagem fresca do MESMO processo via
  // `onPendingCountChange` nesta sessao (apos um upload, evita divergencia
  // entre a aba e o resumo do painel).
  const [pendingCountOverride, setPendingCountOverride] = useState(null)
  const documentsPendingCount = canViewRecords
    ? pendingCountOverride && pendingCountOverride.processId === selectedProcess.id
      ? pendingCountOverride.count
      : getDocumentPendingFields(selectedProcess).length
    : 0

  // useCallback (identidade estavel por processId): a funcao vira dependencia
  // do `useEffect` de `ProcessDocumentsPanel` - se recriada a cada render do
  // pai, o efeito reroda a cada chamada e entra em loop infinito.
  const handleDocumentsPendingCountChange = useCallback(
    (count) => {
      setPendingCountOverride({ processId: selectedProcess.id, count })
    },
    [selectedProcess.id]
  )

  // F18b-2 (E9): indicadores read-only de FISPQ/lavacao (aba Itens/bloco
  // Carga), lidos do `documentIndex` do processo - so canViewRecords.
  const documentIndex = canViewRecords ? normalizeDocumentIndex(selectedProcess.documentIndex) : null

  // D4: menu "Mais ações" — foco no 1o menuitem ao abrir; Esc/clique fora
  // fecham (e devolvem o foco ao trigger no Esc).
  useEffect(() => {
    if (!isMoreOpen) return undefined

    const frame = requestAnimationFrame(() => {
      firstMenuItemRef.current?.focus()
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsMoreOpen(false)
        moreTriggerRef.current?.focus()
      }
    }

    function handleOutsideClick(event) {
      if (moreContainerRef.current && !moreContainerRef.current.contains(event.target)) {
        setIsMoreOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('touchstart', handleOutsideClick)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('touchstart', handleOutsideClick)
    }
  }, [isMoreOpen])

  function handleOpenDeleteConfirm() {
    setIsMoreOpen(false)
    // Foca o trigger ANTES de abrir o dialogo pro <Modal> restaurar o foco
    // num elemento que ainda existe no DOM ao fechar.
    moreTriggerRef.current?.focus()
    setIsConfirmDeleteOpen(true)
  }

  const getDestinationLabel = (category) =>
    category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  // Previsão de entrega no armazém = data manual (override) OU cálculo
  // automático (ETA + dias úteis por categoria / coleta agendada / rolling
  // customs). O `getEstimatedDeliveryDate` encapsula essa regra — não
  // repetir só o ETA aqui (regressão do F10.4).
  const getEstimatedDeliveryLabel = (process) => formatDate(getEstimatedDeliveryDate(process))

  const hasUpdatedEta = (process) =>
    Boolean(process?.eta && process?.etaOriginal && process.etaOriginal !== process.eta)

  const getEtaDisplayClassName = (process, baseClassName = '') =>
    [baseClassName, hasUpdatedEta(process) ? 'eta-detail-highlight' : ''].filter(Boolean).join(' ')

  const hasPostReceiptContent = (process) =>
    Boolean(
      String(process?.postReceiptNotes ?? '').trim() ||
        (Array.isArray(process?.postReceiptImages) ? process.postReceiptImages : []).length > 0
    )

  // UX-6b-3 (D6): numeracao dos blocos 3/4 — Chegada/Aduana levam o numero
  // quando renderizam; senao ele passa pro bloco seguinte (Free time/
  // Anuências).
  const showArrivalBlock = hasArrivalDetails(selectedProcess)
  // PR 3: avisos "ERP" (so' admin, a partir da referencia gravada). O mesmo
  // `erpHints` alimenta a Aduana e o predicado da numeracao, para as Anuências
  // nao ficarem com o mesmo numero quando a Aduana passa a existir por causa de
  // uma linha vazia com aviso.
  const erpHints = useMemo(
    () => (isAdmin && erpReference ? buildErpFieldHints(selectedProcess, erpReference) : EMPTY_ERP_HINTS),
    [isAdmin, erpReference, selectedProcess]
  )
  const showCustomsBlock = hasCustomsDetails(selectedProcess, erpHints)

  // UX-6b-3 (D7.5): bloco 5 "Coleta" — badge de status + janelas +
  // transportadora, cada parte com a SUA condicao de hoje.
  const showsCollectionCategory = isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)
  const showCollectionStatusBadge = showsCollectionCategory && Boolean(selectedProcess.collectionStatus)
  const collectionWindows = getCollectionWindows(selectedProcess)
  const showCollectionWindows =
    showsCollectionCategory &&
    (selectedProcess.collectionStatus === 'Coleta Agendada' || selectedProcess.collectionStatus === CD_EN_ROUTE_STATUS) &&
    collectionWindows.length > 0
  const showCarrier = isCollectionScheduledOrBeyondStatus(selectedProcess.collectionStatus)
  const showCollectionBlock = showCollectionStatusBadge || showCollectionWindows || showCarrier
  const isFavorite = favoriteProcessIds.includes(selectedProcess.id)
  const linkedItemsCount = selectedProcess.items?.length ?? 0

  // PR 3 (so' admin): avisos que dependem da view. POs consolidadas (aviso no
  // rotulo ou card novo `—` quando o Portal esta sem POs) e ETD (o divergente
  // de quem so' tem `shippedAt` vai na linha Data de embarque, no bloco 2).
  const isConsolidatedProcess = selectedProcess.category === 'CONSOLIDADO'
  const consolidatedOrders = isConsolidatedProcess ? getProcessPurchaseOrders(selectedProcess) : []
  const poSetHint = erpHints.fields.poSet?.kind === 'divergente' ? erpHints.fields.poSet : null
  const emptyPoSetHint =
    isConsolidatedProcess && consolidatedOrders.length === 0
      ? getErpEmptyRowHint(erpHints.fields.poSet, selectedProcess)
      : null
  const etdHint =
    erpHints.fields.etd?.kind === 'divergente' && !selectedProcess.etd
      ? null
      : getErpRowHint(erpHints.fields.etd, selectedProcess)

  // Aviso de quantidade: 1 por grupo (nome, e PO no consolidado), no 1o item
  // VISIVEL do grupo. A chave vem do nucleo (`erpItemGroupKey`), sem recalcular.
  const quantityHintByItem = new Map()
  const claimedItemGroups = new Set()
  for (const item of visibleProcessItems ?? []) {
    const groupKey = erpItemGroupKey(item, isConsolidatedProcess)
    const groupHint = erpHints.quantity[groupKey]
    if (groupHint && !claimedItemGroups.has(groupKey)) {
      claimedItemGroups.add(groupKey)
      quantityHintByItem.set(item, groupHint)
    }
  }

  const favoriteButton = (
    <button
      type="button"
      className="ghost-button process-detail-fav"
      aria-label={isFavorite ? 'Desfavoritar' : 'Favoritar'}
      onClick={() => onToggleFavorite(selectedProcess.id)}
    >
      <Icon name={isFavorite ? 'star-filled' : 'star'} size={20} className="process-detail-fav__icon" />
      <span className="process-detail-fav__label">{isFavorite ? 'Desfavoritar' : 'Favoritar'}</span>
    </button>
  )

  const moreActions = isAdmin ? (
    <div className="process-detail-more" ref={moreContainerRef}>
      <button
        type="button"
        className="ghost-button process-detail-more__trigger"
        aria-label="Mais ações"
        title="Mais ações"
        aria-haspopup="menu"
        aria-expanded={isMoreOpen}
        aria-controls="process-detail-more-menu"
        ref={moreTriggerRef}
        onClick={() => setIsMoreOpen((open) => !open)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {isMoreOpen ? (
        <div id="process-detail-more-menu" role="menu" className="process-detail-more__menu">
          <button
            type="button"
            role="menuitem"
            ref={firstMenuItemRef}
            className="process-detail-more__item process-detail-more__item--danger"
            disabled={isSaving}
            onClick={handleOpenDeleteConfirm}
          >
            {isSaving ? <Spinner size={14} /> : null} Excluir processo
          </button>
        </div>
      ) : null}
    </div>
  ) : null

  return (
    <article className="list-card view-push process-detail-view" style={{ marginTop: '16px' }}>
      {/* F15.3: mini-header sticky no mobile (voltar + título do processo
          sempre visíveis durante o scroll do detalhe). Escondido no desktop
          via CSS — lá o "Voltar para lista" do card-heading basta. */}
      <div className="process-detail-mobilebar">
        <button
          type="button"
          className="process-detail-mobilebar__back"
          aria-label="Voltar para Chegadas"
          onClick={onSetViewModeList}
        >
          <Icon name="chevron-left" size={22} aria-hidden="true" /> Chegadas
        </button>
        <strong className="process-detail-mobilebar__title">
          {getProcessTitle(selectedProcess, canSeeName)}
        </strong>
        {isMobileLayout ? (
          <div className="process-detail-mobilebar__actions">
            {favoriteButton}
            {moreActions}
          </div>
        ) : null}
      </div>

      {/* F16.5/UX-6b-3 (D5/E3/F2): timeline de 5 estágios — concluidos
          preenchidos, atual em anel com halo verde, futuros vazios; visivel
          em todas as larguras (mobile + tablet <=1040px + desktop). */}
      {(() => {
        const { currentStage, isComplete } = getProcessStage(selectedProcess)
        return (
          <div className="process-timeline" aria-hidden="true">
            <div className="process-timeline__track">
              {PROCESS_STAGES.map((stage, index) => {
                const done = isComplete || index < currentStage
                const now = !isComplete && index === currentStage
                return (
                  <div className="process-timeline__cell" key={stage}>
                    {index > 0 ? (
                      <span
                        className={`process-timeline__bar${isComplete || index <= currentStage ? ' process-timeline__bar--done' : ''}`}
                      />
                    ) : null}
                    <span
                      className={`process-timeline__node${done ? ' process-timeline__node--done' : ''}${now ? ' process-timeline__node--now' : ''}`}
                    />
                  </div>
                )
              })}
            </div>
            <div className="process-timeline__labels">
              {PROCESS_STAGES.map((stage, index) => (
                <span
                  key={stage}
                  className={!isComplete && index === currentStage ? 'process-timeline__label--now' : ''}
                >
                  {stage}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="card-heading process-detail-card-heading">
        <button
          type="button"
          className="ghost-button process-detail-card-heading__back"
          onClick={onSetViewModeList}
        >
          ‹ Voltar
        </button>
        <div className="process-detail-heading">
          <h2 className="process-detail-heading__name">{getProcessTitle(selectedProcess, canSeeName)}</h2>
          <span className={getStatusTagClass(selectedProcess.processStatus)}>
            {getDisplayedProcessStatus(selectedProcess.processStatus, selectedProcess.category)}
          </span>
          <p className="process-detail-heading__meta">
            {[selectedProcess.category, getProcessSubtitle(selectedProcess, canSeeName), selectedProcess.destination]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="admin-toolbar process-detail-toolbar">
          {isAdmin ? (
            <button type="button" className="primary-button" onClick={onEditMode}>Editar processo</button>
          ) : null}
          {canEditPostReceiptNotes && isProcessStatusFinalized(selectedProcess.processStatus) ? (
            <button type="button" className="ghost-button" onClick={onPostReceiptEditMode}>Editar observações</button>
          ) : null}
          {canEditSelectedCollectionStatus ? (
            <button type="button" className="ghost-button" onClick={onCollectionStatusEditMode}>Status de coleta</button>
          ) : null}
          {isMobileLayout ? null : favoriteButton}
          {isMobileLayout ? null : moreActions}
        </div>
      </div>

      {isAdmin ? (
        <ConfirmDialog
          open={isConfirmDeleteOpen}
          title="Excluir processo?"
          message="Esta ação é irreversível e excluirá o processo e todas as suas mensagens."
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          tone="danger"
          busy={isSaving}
          onConfirm={() => {
            setIsConfirmDeleteOpen(false)
            onDeleteProcess()
          }}
          onCancel={() => setIsConfirmDeleteOpen(false)}
        />
      ) : null}

      <div className="detail-tab-select">
        <select
          className="detail-tab-select__native"
          value={effectiveTab === 'related-item' && selectedItemName ? 'related-item' : effectiveTab}
          onChange={(event) => onDetailTabChange(event.target.value)}
          aria-label="Seção do processo"
        >
          <option value="general">Detalhes gerais</option>
          <option value="process">Processo</option>
          <option value="items">Itens</option>
          <option value="messages">Mensagens</option>
          {canViewRecords ? <option value="history">Histórico</option> : null}
          {canViewRecords ? (
            <option value="documents">
              {documentsPendingCount > 0
                ? `Documentos (${documentsPendingCount} ${documentsPendingCount === 1 ? 'pendente' : 'pendentes'})`
                : 'Documentos'}
            </option>
          ) : null}
          {effectiveTab === 'related-item' && selectedItemName ? <option value="related-item">Item relacionado</option> : null}
        </select>
      </div>

      <div className="tab-row detail-tab-row">
        <button type="button" className={`tab-button${effectiveTab === 'general' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('general')}>Detalhes gerais</button>
        <button type="button" className={`tab-button${effectiveTab === 'process' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('process')}>Processo</button>
        <button type="button" className={`tab-button${effectiveTab === 'items' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('items')}>Itens</button>
        <button type="button" className={`tab-button${effectiveTab === 'messages' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('messages')}>Mensagens</button>
        {canViewRecords ? (
          <button type="button" className={`tab-button${effectiveTab === 'history' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('history')}>Histórico</button>
        ) : null}
        {canViewRecords ? (
          <button type="button" className={`tab-button${effectiveTab === 'documents' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('documents')}>
            Documentos
            {documentsPendingCount > 0 ? (
              <span className="documents-tab-count">
                {`${documentsPendingCount} ${documentsPendingCount === 1 ? 'pendente' : 'pendentes'}`}
              </span>
            ) : null}
          </button>
        ) : null}
        {effectiveTab === 'related-item' && selectedItemName ? <button type="button" className="tab-button tab-button--active" onClick={() => onDetailTabChange('related-item')}>Item relacionado</button> : null}
      </div>

      <div className="detail-stack tab-panel-spacing">
        {effectiveTab === 'general' ? (
          <>
            {isAdmin && pendingFields.length > 0 ? (
              <div className="detail-card process-general-card process-general-card--pending">
                <span className="detail-label">Dados pendentes</span>
                <ul className="process-general-card__list">
                  {pendingFields.map((field) => (
                    <li key={field.id}>{field.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isConsolidatedProcess && consolidatedOrders.length > 0 ? (
              <div className="detail-card process-general-card process-general-card--consolidated-pos">
                <span className="detail-label">
                  POs consolidadas
                  <ErpHint hint={poSetHint} />
                </span>
                <ul className="detail-stack detail-stack--compact">
                  {consolidatedOrders.map((order) => (
                    <li key={order.po}>
                      {formatPurchaseOrderLine(order, canSeePurchaseOrderDetails(canSeeName))}
                      <ErpHint hint={erpHints.po[erpOrderKey(order.po)]} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : emptyPoSetHint ? (
              <div className="detail-card process-general-card process-general-card--consolidated-pos">
                <span className="detail-label">
                  POs consolidadas
                  <ErpHint hint={emptyPoSetHint} />
                </span>
                <p>—</p>
              </div>
            ) : null}
            <div className="detail-card process-general-card process-general-card--destination">
              <span className="detail-label">{getDestinationLabel(selectedProcess.category)}</span>
              <p>
                {selectedProcess.destination || '-'}
                <ErpHint hint={getErpRowHint(erpHints.fields.destination, selectedProcess)} />
              </p>
            </div>
            <ProcessIdentificationDetails process={selectedProcess} canSeeName={canSeeName} erpHints={erpHints} />
            <div className="detail-card process-general-card process-general-card--etd-eta">
              <span className="detail-label">ETD / ETA</span>
              <div className="detail-card--split" style={{ marginTop: '8px' }}>
                <div>
                  <span className="detail-label detail-label--muted">ETD</span>
                  <p>
                    {formatDate(selectedProcess.etd)}
                    <ErpHint hint={etdHint} />
                  </p>
                </div>
                <div className={getEtaDisplayClassName(selectedProcess)}>
                  <span className="detail-label">{hasUpdatedEta(selectedProcess) ? 'ETA atualizada' : 'ETA'}</span>
                  <p>
                    {formatDate(selectedProcess.eta)}
                    <ErpHint hint={getErpRowHint(erpHints.fields.eta, selectedProcess)} />
                  </p>
                </div>
              </div>
            </div>
            {selectedProcess.etaOriginal && selectedProcess.etaOriginal !== selectedProcess.eta ? <div className="detail-card process-general-card process-general-card--eta-original"><span className="detail-label">ETA original</span><p>{formatDate(selectedProcess.etaOriginal)}</p></div> : null}
            <div className="detail-card process-general-card process-general-card--forecast">
              <span className="detail-label">Previsão de entrega no armazém</span>
              <p>{getEstimatedDeliveryLabel(selectedProcess)}</p>
              <small className="field-hint">{selectedProcess.warehouseDeliveryDateOverride ? 'Data definida manualmente por um admin.' : 'Data calculada automaticamente pelo sistema.'}</small>
            </div>
            <div className="detail-card process-general-card process-general-card--linked-items">
              <div className="card-heading process-detail-card-heading">
                <div>
                  <span className="detail-label">Itens vinculados</span>
                  <p>
                    <span className="process-linked-items__count">
                      {linkedItemsCount === 1 ? '1 item' : `${linkedItemsCount} itens`}
                    </span>
                    <span className="process-linked-items__suffix">
                      {linkedItemsCount === 1 ? ' cadastrado' : ' cadastrados'} para este processo.
                    </span>
                  </p>
                </div>
                <button type="button" className="ghost-button" onClick={() => onDetailTabChange('items')}>Ver itens do processo</button>
              </div>
            </div>
          </>
        ) : null}

        {effectiveTab === 'process' ? (
          <>
            <ProcessCargoDetails
              process={selectedProcess}
              showContainerQuantity={shouldShowContainerQuantity(selectedProcess.category)}
              containerWashIds={documentIndex ? documentIndex.containerWashIds : undefined}
            />
            <ProcessTransitDetails process={selectedProcess} showEmptyPlaceholder erpHints={erpHints} />
            <ProcessArrivalDetails process={selectedProcess} step={3} showEmptyPlaceholder />
            <ProcessFreeTimeDetails process={selectedProcess} step={showArrivalBlock ? null : 3} showEmptyPlaceholder />
            <ProcessCustomsDetails process={selectedProcess} step={4} showEmptyPlaceholder erpHints={erpHints} />
            <ProcessLicensesDetails
              process={selectedProcess}
              step={showCustomsBlock ? null : 4}
              showEmptyPlaceholder
            />
            {showCollectionBlock ? (
              <DetailBlock
                step={5}
                title="Coleta"
                wide
                className="process-block--collection"
                badges={
                  showCollectionStatusBadge ? (
                    <span className="inline-badge">{getDisplayedCollectionStatus(selectedProcess.collectionStatus)}</span>
                  ) : null
                }
              >
                {showCollectionWindows ? (
                  <div className="detail-stack detail-stack--compact">
                    {collectionWindows.map((window) => (
                      <div key={window.id} className="detail-block__row">
                        <p>
                          <strong>
                            {getCollectionWindowLabel(window, {
                              category: selectedProcess.category,
                              containers: selectedProcess.containers,
                            })}
                          </strong>
                          {' · '}
                          {formatDateTime(window.scheduledAt)}
                        </p>
                        {window.notes ? <small className="field-hint">{window.notes}</small> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {showCarrier ? (
                  <DetailList>
                    <DetailRow label="Transportadora">{selectedProcess.carrierName || '-'}</DetailRow>
                  </DetailList>
                ) : null}
              </DetailBlock>
            ) : showsCollectionCategory ? (
              <DetailBlockPlaceholder
                title="Coleta"
                wide
                className="process-block--collection"
                message="Coleta ainda não agendada."
              />
            ) : null}
            {selectedProcess.processNotes ? (
              <DetailBlock title="Observações do processo" wide className="process-block--process-notes">
                <p>{selectedProcess.processNotes}</p>
              </DetailBlock>
            ) : null}
            {isProcessStatusFinalized(selectedProcess.processStatus) && hasPostReceiptContent(selectedProcess) ? (
              <DetailBlock title="Observações pós-recebimento da carga" wide className="process-block--post-receipt">
                {selectedProcess.postReceiptNotes ? <p>{selectedProcess.postReceiptNotes}</p> : null}
                {selectedProcessPostReceiptImages.length > 0 ? (
                  <div className="post-receipt-image-grid post-receipt-image-grid--detail">
                    {selectedProcessPostReceiptImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        className="post-receipt-image-card post-receipt-image-card--detail"
                        onClick={() => onOpenPostReceiptGallery(index)}
                      >
                        <img src={image.url} alt={image.name || 'Imagem do recebimento no CD'} />
                        <div className="post-receipt-image-card__meta">
                          <strong>{image.name || 'Imagem do recebimento no CD'}</strong>
                          <span>{formatPostReceiptImageSize(image.size)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </DetailBlock>
            ) : null}
            <ProcessReceiptDivergenceDetails process={selectedProcess} />
          </>
        ) : null}

        {effectiveTab === 'items' ? (
          <div ref={itemsSectionRef} className="detail-card">
            <div className="card-heading process-detail-card-heading process-detail-card-heading--end">
              <div>
                <span className="detail-label">Itens do processo</span>
                <p>Itens comerciais vinculados diretamente a este processo.</p>
              </div>
              <span className="inline-badge">
                {visibleProcessItems.length === 1 ? '1 item' : `${visibleProcessItems.length} itens`}
              </span>
            </div>
            <label className="field">
              <span>Buscar item</span>
              <input
                className="text-input"
                type="search"
                value={itemSearchTerm}
                onChange={(event) => onSetItemSearchTerm(event.target.value)}
                placeholder="Digite o nome comercial do item"
              />
            </label>
            <div className="process-items-list">
              {visibleProcessItems.length > 0 ? (
                visibleProcessItems.map((item) => {
                  const itemHint = quantityHintByItem.get(item)
                  const itemButton = (
                  <button
                    key={item.id}
                    type="button"
                    className="metric-card process-related-item-button process-related-item-button--compact"
                    onClick={() => onOpenRelatedItemTab(item.commercialName)}
                  >
                    <div className="process-item-display">
                      <strong className="process-item-display__name">{item.commercialName}</strong>
                    </div>
                    <div className="process-item-display process-item-display--quantity">
                      <span className="detail-label">Quantidade:</span>
                      <strong>{item.quantity}</strong>
                    </div>
                    {selectedProcess.category === 'CONSOLIDADO' && item.poNumber ? (
                      <div className="process-item-display">
                        <span className="detail-label">PO:</span>
                        <strong>{item.poNumber}</strong>
                      </div>
                    ) : null}
                    {item.dangerousGoods ? (
                      <span className="inline-badge inline-badge--warn">
                        {getItemDangerousGoodsLabel(item)}
                      </span>
                    ) : null}
                    {documentIndex && item.dangerousGoods && item.id ? (
                      documentIndex.fispqItemIds.includes(item.id) ? (
                        <span className="inline-badge inline-badge--ok">FISPQ enviada</span>
                      ) : (
                        <span className="inline-badge inline-badge--warn">FISPQ pendente</span>
                      )
                    ) : null}
                  </button>
                  )
                  // O aviso fica FORA do <button> (botao aninhado e' invalido): so' com
                  // aviso o item ganha o wrapper; sem aviso o DOM e' o de sempre.
                  return itemHint ? (
                    <div className="process-items-list__entry" key={item.id}>
                      {itemButton}
                      <ErpHint hint={itemHint} />
                    </div>
                  ) : (
                    itemButton
                  )
                })
              ) : (
                <div className="empty-state" role="status">
                  <strong>{selectedProcess.items?.length > 0 ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}</strong>
                  <p>{selectedProcess.items?.length > 0 ? 'Ajuste a busca para localizar outro item deste processo.' : 'Os itens vinculados ao processo aparecerão aqui.'}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {effectiveTab === 'related-item' && selectedItemName ? (
          <div className="detail-card">
            <div className="card-heading process-detail-card-heading">
              <div>
                <span className="detail-label">Chegadas ativas com este item</span>
                <p>Item selecionado: {selectedItemName}</p>
              </div>
              <span className="inline-badge">
                {relatedActiveProcesses.length === 1 ? '1 chegada' : `${relatedActiveProcesses.length} chegadas`}
              </span>
            </div>
            <div className="process-items-list process-items-list--scroll">
              {relatedActiveProcesses.length > 0 ? (
                relatedActiveProcesses.map(({ process, quantity }) => (
                  <button
                    key={`${process.id}-${selectedItemName}`}
                    type="button"
                    className="metric-card process-related-item-button process-related-item-button--compact"
                    onClick={() => onOpenProcessDetail(process)}
                  >
                    <div className="process-item-display">
                      <span className="detail-label">Chegada:</span>
                      <strong>{getProcessTitle(process, canSeeName)}</strong>
                    </div>
                    <div className="process-item-display process-item-display--quantity">
                      <span className="detail-label">Quantidade:</span>
                      <strong>{quantity}</strong>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state" role="status">
                  <strong>Nenhuma chegada ativa encontrada</strong>
                  <p>Não há chegadas ativas com este item fora do CD no momento.</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {effectiveTab === 'messages' ? (
          <ProcessMessagesPanel
            messages={processMessages}
            isLoading={isLoadingMessages}
            messageDraft={messageDraft}
            onMessageDraftChange={onMessageDraftChange}
            onSubmit={onSendMessage}
            isSending={isSendingMessage}
            currentUserName={profile?.name ?? profile?.email ?? 'usuário'}
            messageLimitReached={messageLimitReached}
            remainingMessages={remainingMessages}
            canSendMessages={!messageLimitReached || hasUnlimitedMessages}
            showRemainingMessages={isAdmin}
            canDeleteMessages={isAdmin}
            deletingMessageId={deletingMessageId}
            onDeleteMessage={onDeleteMessage}
          />
        ) : null}

        {effectiveTab === 'history' ? (
          <ProcessHistoryPanel processId={selectedProcess.id} />
        ) : null}

        {effectiveTab === 'documents' ? (
          <ProcessDocumentsPanel
            process={selectedProcess}
            profile={profile}
            onPendingCountChange={handleDocumentsPendingCountChange}
          />
        ) : null}
      </div>
    </article>
  )
}
