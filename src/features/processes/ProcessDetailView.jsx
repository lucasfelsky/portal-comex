import { useEffect, useRef, useState } from 'react'
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
import { isAirCategory, isMaritimeCategory, shouldShowContainerQuantity } from './processCategories'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import { getPendingFields } from './pendingFields'
import ProcessMessagesPanel from './ProcessMessagesPanel'
import ProcessHistoryPanel from './ProcessHistoryPanel'
import ConfirmDialog from '../../components/ConfirmDialog'
import {
  DetailBlock,
  DetailList,
  DetailRow,
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
  const moreContainerRef = useRef(null)
  const moreTriggerRef = useRef(null)
  const firstMenuItemRef = useRef(null)
  // D-E: pendencias so pro admin.
  const pendingFields = isAdmin ? getPendingFields(selectedProcess) : []

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
  const showCustomsBlock = hasCustomsDetails(selectedProcess)

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

  return (
    <article className="list-card view-push process-detail-view" style={{ marginTop: '16px' }}>
      {/* F15.3: mini-header sticky no mobile (voltar + título do processo
          sempre visíveis durante o scroll do detalhe). Escondido no desktop
          via CSS — lá o "Voltar para lista" do card-heading basta. */}
      <div className="process-detail-mobilebar">
        <button
          type="button"
          className="process-detail-mobilebar__back"
          onClick={onSetViewModeList}
        >
          ‹ Voltar
        </button>
        <strong className="process-detail-mobilebar__title">
          {getProcessTitle(selectedProcess, canSeeName)}
        </strong>
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
          <button
            type="button"
            className="ghost-button"
            onClick={() => onToggleFavorite(selectedProcess.id)}
          >
            {favoriteProcessIds.includes(selectedProcess.id) ? 'Desfavoritar' : 'Favoritar'}
          </button>
          {isAdmin ? (
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
          ) : null}
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
          value={detailTab === 'related-item' && selectedItemName ? 'related-item' : detailTab}
          onChange={(event) => onDetailTabChange(event.target.value)}
          aria-label="Seção do processo"
        >
          <option value="general">Detalhes gerais</option>
          <option value="process">Processo</option>
          <option value="items">Itens</option>
          <option value="messages">Mensagens</option>
          <option value="history">Histórico</option>
          {detailTab === 'related-item' && selectedItemName ? <option value="related-item">Item relacionado</option> : null}
        </select>
      </div>

      <div className="tab-row detail-tab-row">
        <button type="button" className={`tab-button${detailTab === 'general' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('general')}>Detalhes gerais</button>
        <button type="button" className={`tab-button${detailTab === 'process' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('process')}>Processo</button>
        <button type="button" className={`tab-button${detailTab === 'items' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('items')}>Itens</button>
        <button type="button" className={`tab-button${detailTab === 'messages' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('messages')}>Mensagens</button>
        <button type="button" className={`tab-button${detailTab === 'history' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('history')}>Histórico</button>
        {detailTab === 'related-item' && selectedItemName ? <button type="button" className="tab-button tab-button--active" onClick={() => onDetailTabChange('related-item')}>Item relacionado</button> : null}
      </div>

      <div className="detail-stack tab-panel-spacing">
        {detailTab === 'general' ? (
          <>
            {isAdmin && pendingFields.length > 0 ? (
              <div className="detail-card">
                <span className="detail-label">Dados pendentes</span>
                <ul>
                  {pendingFields.map((field) => (
                    <li key={field.id}>{field.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedProcess.category === 'CONSOLIDADO' && getProcessPurchaseOrders(selectedProcess).length > 0 ? (
              <div className="detail-card">
                <span className="detail-label">POs consolidadas</span>
                <ul className="detail-stack detail-stack--compact">
                  {getProcessPurchaseOrders(selectedProcess).map((order) => (
                    <li key={order.po}>
                      {formatPurchaseOrderLine(order, canSeePurchaseOrderDetails(canSeeName))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="detail-card"><span className="detail-label">{getDestinationLabel(selectedProcess.category)}</span><p>{selectedProcess.destination || '-'}</p></div>
            <ProcessIdentificationDetails process={selectedProcess} canSeeName={canSeeName} />
            <div className="detail-card">
              <span className="detail-label">ETD / ETA</span>
              <div className="detail-card--split" style={{ marginTop: '8px' }}>
                <div>
                  <span className="detail-label detail-label--muted">ETD</span>
                  <p>{formatDate(selectedProcess.etd)}</p>
                </div>
                <div className={getEtaDisplayClassName(selectedProcess)}>
                  <span className="detail-label">{hasUpdatedEta(selectedProcess) ? 'ETA atualizada' : 'ETA'}</span>
                  <p>{formatDate(selectedProcess.eta)}</p>
                </div>
              </div>
            </div>
            {selectedProcess.etaOriginal && selectedProcess.etaOriginal !== selectedProcess.eta ? <div className="detail-card"><span className="detail-label">ETA original</span><p>{formatDate(selectedProcess.etaOriginal)}</p></div> : null}
            <div className="detail-card">
              <span className="detail-label">Previsão de entrega no armazém</span>
              <p>{getEstimatedDeliveryLabel(selectedProcess)}</p>
              <small className="field-hint">{selectedProcess.warehouseDeliveryDateOverride ? 'Data definida manualmente por um admin.' : 'Data calculada automaticamente pelo sistema.'}</small>
            </div>
            <div className="detail-card">
              <div className="card-heading process-detail-card-heading">
                <div>
                  <span className="detail-label">Itens vinculados</span>
                  <p>{selectedProcess.items?.length ?? 0} itens cadastrados para este processo.</p>
                </div>
                <button type="button" className="ghost-button" onClick={() => onDetailTabChange('items')}>Ver itens do processo</button>
              </div>
            </div>
          </>
        ) : null}

        {detailTab === 'process' ? (
          <>
            <ProcessCargoDetails
              process={selectedProcess}
              showContainerQuantity={shouldShowContainerQuantity(selectedProcess.category)}
            />
            <ProcessTransitDetails process={selectedProcess} />
            <ProcessArrivalDetails process={selectedProcess} step={3} />
            <ProcessFreeTimeDetails process={selectedProcess} step={showArrivalBlock ? null : 3} />
            <ProcessCustomsDetails process={selectedProcess} step={4} />
            <ProcessLicensesDetails process={selectedProcess} step={showCustomsBlock ? null : 4} />
            {showCollectionBlock ? (
              <DetailBlock
                step={5}
                title="Coleta"
                wide
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
            ) : null}
            {selectedProcess.processNotes ? (
              <DetailBlock title="Observações do processo">
                <p>{selectedProcess.processNotes}</p>
              </DetailBlock>
            ) : null}
            {isProcessStatusFinalized(selectedProcess.processStatus) && hasPostReceiptContent(selectedProcess) ? (
              <DetailBlock title="Observações pós-recebimento da carga">
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

        {detailTab === 'items' ? (
          <div ref={itemsSectionRef} className="detail-card">
            <div className="card-heading process-detail-card-heading">
              <div>
                <span className="detail-label">Itens do processo</span>
                <p>Itens comerciais vinculados diretamente a este processo.</p>
              </div>
              <span className="inline-badge">{visibleProcessItems.length} itens</span>
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
                visibleProcessItems.map((item) => (
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
                  </button>
                ))
              ) : (
                <div className="empty-state" role="status">
                  <strong>{selectedProcess.items?.length > 0 ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}</strong>
                  <p>{selectedProcess.items?.length > 0 ? 'Ajuste a busca para localizar outro item deste processo.' : 'Os itens vinculados ao processo aparecerão aqui.'}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {detailTab === 'related-item' && selectedItemName ? (
          <div className="detail-card">
            <div className="card-heading process-detail-card-heading">
              <div>
                <span className="detail-label">Chegadas ativas com este item</span>
                <p>Item selecionado: {selectedItemName}</p>
              </div>
              <span className="inline-badge">{relatedActiveProcesses.length} chegadas</span>
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

        {detailTab === 'messages' ? (
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

        {detailTab === 'history' ? (
          <ProcessHistoryPanel processId={selectedProcess.id} />
        ) : null}
      </div>
    </article>
  )
}
