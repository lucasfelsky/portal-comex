import { formatDateTime } from '../../utils/dateFormat'
import { getCollectionWindows } from '../../utils/collectionWindows'
import { getEstimatedDeliveryDate } from '../../utils/deliveryForecast'
import { formatPostReceiptImageSize } from '../../utils/postReceiptImages'
import {
  CD_EN_ROUTE_STATUS,
  getDisplayedCollectionStatus,
  getQuickReadProcessStatus,
  isDtaTransitCompletedStatus,
  isMapaInspectionScheduledStatus,
  isProcessStatusFinalized,
} from './processStatus'
import { getChannelToneClass, getStatusTagClass } from './processStatusView'
import { getProcessTitle } from './processLabels'
import { isAirCategory, isMaritimeCategory, shouldShowContainerQuantity } from './processCategories'
import { getProcessStage, PROCESS_STAGES } from './processStage'
import ProcessMessagesPanel from './ProcessMessagesPanel'

// F10.4 (backlog 2026-07-12): tela de detalhe do processo (viewMode
// 'detail'), extraída do ProcessesPage. Presentacional — lê só o
// `selectedProcess` (via prop) e chama callbacks; o estado e os handlers
// continuam na página. As 5 abas (general/process/items/related-item/
// messages) são renderizadas por `detailTab`. Zero mudança
// visual/comportamental. A gallery de pós-recebimento fica no page
// (guardada por `isPostReceiptGalleryOpen`); esta view só chama
// `onOpenPostReceiptGallery(index)`.
export default function ProcessDetailView({
  selectedProcess,
  detailTab,
  isAdmin,
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
  const getDestinationLabel = (category) =>
    category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'

  const formatCargoUnit = (quantity, singularLabel, pluralLabel) =>
    `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`

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

  const canShowProcessName = (process, adminFlag) =>
    adminFlag || !['FCL', 'LCL', 'AEREO'].includes(process?.category)

  const hasPostReceiptContent = (process) =>
    Boolean(
      String(process?.postReceiptNotes ?? '').trim() ||
        (Array.isArray(process?.postReceiptImages) ? process.postReceiptImages : []).length > 0
    )

  const shouldEditMapaInspection = (status) => isMapaInspectionScheduledStatus(status)
  const isDtaTransitCompleted = (status) => isDtaTransitCompletedStatus(status)

  return (
    <article className="list-card view-push" style={{ marginTop: '16px' }}>
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
          {getProcessTitle(selectedProcess)}
        </strong>
      </div>

      {/* F16.5: timeline de 5 estágios (mobile-only via CSS) — o estado do
          processo virado em forma, o dado mais importante em relance. */}
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
        <div><h3>Detalhe do processo</h3></div>
        <div className="admin-toolbar process-detail-toolbar">
          {isAdmin && canEditSelectedCollectionStatus ? (
            <button type="button" className="ghost-button" onClick={onEditMode}>Editar processo</button>
          ) : isAdmin && !canEditSelectedCollectionStatus ? (
            <button type="button" className="ghost-button" onClick={onEditMode}>Editar</button>
          ) : null}
          {canEditPostReceiptNotes && isProcessStatusFinalized(selectedProcess.processStatus) ? (
            <button type="button" className="ghost-button" onClick={onPostReceiptEditMode}>Editar obs.</button>
          ) : null}
          {canEditSelectedCollectionStatus ? (
            <button type="button" className="ghost-button" onClick={onCollectionStatusEditMode}>Status coleta</button>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            onClick={() => onToggleFavorite(selectedProcess.id)}
          >
            {favoriteProcessIds.includes(selectedProcess.id) ? 'Desfavoritar' : 'Favoritar'}
          </button>
        </div>
      </div>

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
          {detailTab === 'related-item' && selectedItemName ? <option value="related-item">Item relacionado</option> : null}
        </select>
      </div>

      <div className="tab-row detail-tab-row">
        <button type="button" className={`tab-button${detailTab === 'general' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('general')}>Detalhes gerais</button>
        <button type="button" className={`tab-button${detailTab === 'process' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('process')}>Processo</button>
        <button type="button" className={`tab-button${detailTab === 'items' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('items')}>Itens</button>
        <button type="button" className={`tab-button${detailTab === 'messages' ? ' tab-button--active' : ''}`} onClick={() => onDetailTabChange('messages')}>Mensagens</button>
        {detailTab === 'related-item' && selectedItemName ? <button type="button" className="tab-button tab-button--active" onClick={() => onDetailTabChange('related-item')}>Item relacionado</button> : null}
      </div>

      <div className="detail-stack tab-panel-spacing">
        {detailTab === 'general' ? (
          <>
            <div className="detail-card"><span className="detail-label">Processo</span><p>{getProcessTitle(selectedProcess, isAdmin)}</p></div>
            <div className="detail-card"><span className="detail-label">Categoria</span><p>{selectedProcess.category}</p></div>
            {selectedProcess.processNumber && canShowProcessName(selectedProcess, isAdmin) ? <div className="detail-card"><span className="detail-label">PO</span><p>{selectedProcess.processNumber}</p></div> : null}
            <div className="detail-card"><span className="detail-label">{getDestinationLabel(selectedProcess.category)}</span><p>{selectedProcess.destination || '-'}</p></div>
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
            <div className="detail-card">
              <div className="card-heading process-detail-card-heading">
                <div>
                  <span className="detail-label">Status do processo</span>
                </div>
                <span className={getStatusTagClass(selectedProcess.processStatus)}>{getQuickReadProcessStatus(selectedProcess)}</span>
              </div>
            </div>
            <div className={`detail-card${shouldShowContainerQuantity(selectedProcess.category) ? ' detail-card--split' : ''}`}>
              {shouldShowContainerQuantity(selectedProcess.category) ? (
                <div>
                  <span className="detail-label">Quantidade de containers</span>
                  <p>{formatCargoUnit(selectedProcess.containerQuantity, 'container', 'containers')}</p>
                </div>
              ) : null}
              <div>
                <span className="detail-label">Quantidade de pallets</span>
                <p>{formatCargoUnit(selectedProcess.palletQuantity, 'pallet', 'pallets')}</p>
              </div>
            </div>
            {selectedProcess.processNotes ? (
              <div className="detail-card">
                <span className="detail-label">Observações do processo</span>
                <p>{selectedProcess.processNotes}</p>
              </div>
            ) : null}
            {isProcessStatusFinalized(selectedProcess.processStatus) && hasPostReceiptContent(selectedProcess) ? (
              <div className="detail-card">
                <span className="detail-label">Observações pós-recebimento da carga</span>
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
              </div>
            ) : null}
            {isMaritimeCategory(selectedProcess.category) && selectedProcess.mapaStatus ? (
              <div className="detail-card">
                <span className="detail-label">MAPA</span>
                <div className="detail-stack detail-stack--compact">
                  <p>Status: {selectedProcess.mapaStatus}</p>
                  {shouldEditMapaInspection(selectedProcess.mapaStatus) && selectedProcess.mapaInspectionScheduledAt ? (
                    <p>Vistoria agendada: {formatDateTime(selectedProcess.mapaInspectionScheduledAt)}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {isMaritimeCategory(selectedProcess.category) && selectedProcess.berthed ? (
              <div className="detail-card">
                <span className="detail-label">Andamento após chegada</span>
                <p>Presença de carga informada: {selectedProcess.cargoPresenceInformed ? 'Sim' : 'Não'}</p>
              </div>
            ) : null}
            {isAirCategory(selectedProcess.category) && selectedProcess.arrived ? (
              <div className="detail-card">
                <span className="detail-label">Pós-chegada</span>
                <div className="detail-stack detail-stack--compact">
                  {selectedProcess.dtaStatus ? <p>DTA: {selectedProcess.dtaStatus}</p> : null}
                  {selectedProcess.dtaLoadingScheduledAt ? <p>Carregamento DTA: {formatDateTime(selectedProcess.dtaLoadingScheduledAt)}</p> : null}
                  {selectedProcess.dtaArrivalAtItajai ? <p>Chegada prevista em Itajaí: {formatDateTime(selectedProcess.dtaArrivalAtItajai)}</p> : null}
                  {isDtaTransitCompleted(selectedProcess.dtaStatus) ? <p>Presença de carga informada: {selectedProcess.cargoPresenceInformed ? 'Sim' : 'Não'}</p> : null}
                </div>
              </div>
            ) : null}
            {(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && selectedProcess.duimpStatus ? (
              <div className={`detail-card ${getChannelToneClass(selectedProcess.parameterizationChannel)}`.trim()}>
                <span className="detail-label">DUIMP</span>
                <div className="detail-stack detail-stack--compact">
                  <p>Status: {selectedProcess.duimpStatus}</p>
                  {selectedProcess.parameterizationChannel ? <p>Canal da parametrização: {selectedProcess.parameterizationChannel}</p> : null}
                </div>
              </div>
            ) : null}
            {(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && (selectedProcess.collectionStatus === 'Coleta Agendada' || selectedProcess.collectionStatus === CD_EN_ROUTE_STATUS) && getCollectionWindows(selectedProcess).length > 0 ? (
              <div className="detail-card">
                <span className="detail-label">Janelas de coleta por container</span>
                <ul className="process-detail-collection-windows">
                  {getCollectionWindows(selectedProcess).map((window) => (
                    <li key={window.id} className="collection-window-card collection-window-card--detail">
                      <div>
                        <span className="detail-label">Container {window.containerNumber}</span>
                        <p>{formatDateTime(window.scheduledAt)}</p>
                        {window.notes ? <small className="field-hint">{window.notes}</small> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(isMaritimeCategory(selectedProcess.category) || isAirCategory(selectedProcess.category)) && selectedProcess.collectionStatus ? (
              <div className="detail-card">
                <span className="detail-label">Coleta</span>
                <p>{getDisplayedCollectionStatus(selectedProcess.collectionStatus)}</p>
              </div>
            ) : null}
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
            <div className="process-items-list process-items-list--scroll">
              {visibleProcessItems.length > 0 ? (
                visibleProcessItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="metric-card process-related-item-button process-related-item-button--compact"
                    onClick={() => onOpenRelatedItemTab(item.commercialName)}
                  >
                    <div className="process-item-display">
                      <span className="detail-label">Nome comercial:</span>
                      <strong>{item.commercialName}</strong>
                    </div>
                    <div className="process-item-display process-item-display--quantity">
                      <span className="detail-label">Quantidade:</span>
                      <strong>{item.quantity}</strong>
                    </div>
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
                      <strong>{getProcessTitle(process, isAdmin)}</strong>
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

        {isAdmin ? (
          <div className="action-row">
            <button type="button" className="ghost-button" onClick={onDeleteProcess} disabled={isSaving}>Excluir processo</button>
          </div>
        ) : null}
      </div>
    </article>
  )
}