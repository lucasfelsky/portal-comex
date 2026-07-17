import Spinner from '../../components/Spinner'
import SelectField from '../../components/SelectField'
import CollectionWindowsEditor from './CollectionWindowsEditor'
import {
  getDisplayedCollectionStatus,
  getDisplayedProcessStatus,
  isDtaLoadingScheduledStatus,
  isDtaTransitCompletedStatus,
  isMapaInspectionScheduledStatus,
  mapaAllowsCollectionStatus,
  postCollectionStatusOptions,
  normalizeComparableText,
} from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { isMaritimeCategory, isAirCategory } from './processCategories'

// F10.5 (backlog 2026-07-12): tela de criação/edição do processo
// (viewMode 'create' || 'edit'), extraída do ProcessesPage. Presentacional
// — lê o `draft` (via prop) e chama callbacks (`onDraftChange` para cada
// campo, `onSave`, `onSetViewModeList`, `onSetEditTab`). Todo o estado
// (`draft`, `editTab`, `isSaving`, `isImportingItems`, o ref do input de
// arquivo, `canShowMaritimeFlow`/`canShowAirFlow`) e os handlers continuam
// na página. Compartilha o `draft` com o `PostReceiptEditView` (ambos
// recebem o mesmo objeto via prop). As opções dos selects vêm por props
// — o page é quem conhece os services. Zero mudança visual/comportamental.
export default function ProcessForm({
  viewMode,
  draft,
  editTab,
  isSaving,
  isImportingItems,
  canShowMaritimeFlow,
  canShowAirFlow,
  itemsFileInputRef,
  channelOptions,
  collectionStatusOptions,
  dtaStatusOptions,
  duimpStatusOptions,
  mapaStatusOptions,
  processCategoryOptions,
  processStatusOptions,
  onDraftChange,
  onSetViewModeList,
  onSetEditTab,
  onSave,
  onImportItemsFile,
  onAddItem,
  onItemChange,
  onRemoveItem,
  onClickCapture,
}) {
  const getDestinationLabel = (category) =>
    category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  const getEstimatedDeliveryLabel = (process) => {
    if (!process?.warehouseDeliveryDateOverride) {
      const eta = process?.eta
      if (!eta) return '-'
      return formatDate(eta)
    }
    return formatDate(process.warehouseDeliveryDateOverride)
  }

  const getAutomaticEstimatedDeliveryLabel = (process) => {
    const eta = process?.eta
    if (!eta) return '-'
    return formatDate(eta)
  }

  const shouldEditMapaInspection = (status) => isMapaInspectionScheduledStatus(status)
  const isDtaLoadingScheduled = (status) => isDtaLoadingScheduledStatus(status)
  const isDtaTransitCompleted = (status) => isDtaTransitCompletedStatus(status)
  const mapaAllowsCollection = (status) => mapaAllowsCollectionStatus(status)

  const keepsCollectionSchedule = (status) => {
    const normalizedStatus = normalizeComparableText(status)
    return (
      normalizedStatus === 'coleta agendada' ||
      normalizedStatus === 'veiculo no cd para descarga' ||
      postCollectionStatusOptions.some(
        (item) => normalizeComparableText(item) === normalizedStatus
      ) ||
      normalizedStatus === 'carga a caminho do cd' ||
      normalizedStatus === 'carga recebida'
    )
  }

  const shouldEditCollectionSchedule = (status) =>
    status === 'Coleta Agendada' || normalizeComparableText(status) === 'carga a caminho do cd'

  const isCdEnRouteStatusForFilter = (value) =>
    normalizeComparableText(value) === 'carga a caminho do cd'

  const canUsePostCollectionStatuses = (process) =>
    Boolean(
      Array.isArray(process?.collectionWindows)
        ? process.collectionWindows.length
        : 0 && keepsCollectionSchedule(process?.collectionStatus)
    )

  const getCollectionStatusOptions = (process) => {
    if (canUsePostCollectionStatuses(process)) return collectionStatusOptions
    return collectionStatusOptions.filter(
      (item) =>
        !postCollectionStatusOptions.includes(item) &&
        normalizeComparableText(item) !== 'carga a caminho do cd'
    )
  }

  return (
    <article className="list-card" style={{ marginTop: '16px' }}>
      <div className="card-heading">
        <div>
          <h3>{viewMode === 'create' ? 'Criar processo' : 'Editar processo'}</h3>
        </div>
        <div className="admin-toolbar">
          <span className="inline-badge">{draft.category || 'Sem categoria'}</span>
          <button type="button" className="ghost-button" onClick={onSetViewModeList}>
            Voltar para lista
          </button>
        </div>
      </div>

      <div className="detail-tab-select">
        <label className="field">
          <span>Seção</span>
          <SelectField
            className="text-input"
            value={editTab}
            onChange={(event) => onSetEditTab(event.target.value)}
          >
            <option value="general">Geral</option>
            <option value="items">Itens</option>
          </SelectField>
        </label>
      </div>

      <div className="tab-row detail-tab-row">
        <button
          type="button"
          className={`tab-button${editTab === 'general' ? ' tab-button--active' : ''}`}
          onClick={() => onSetEditTab('general')}
        >
          Geral
        </button>
        <button
          type="button"
          className={`tab-button${editTab === 'items' ? ' tab-button--active' : ''}`}
          onClick={() => onSetEditTab('items')}
        >
          Itens
        </button>
      </div>

      <div className="detail-stack tab-panel-spacing" onClickCapture={onClickCapture}>
        {editTab === 'general' ? (
          <>
            <label className="field">
              <span>Nome do processo</span>
              <input
                className="text-input"
                type="text"
                value={draft.name}
                onChange={(event) => onDraftChange('name', event.target.value)}
                placeholder="Ex.: Importação Atlas"
              />
            </label>

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Categoria</span>
                <SelectField
                  className="text-input"
                  value={draft.category}
                  onChange={(event) => onDraftChange('category', event.target.value)}
                >
                  {processCategoryOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </SelectField>
              </label>
              <label className="field">
                <span>Destino</span>
                <input
                  className="text-input"
                  type="text"
                  value={draft.destination}
                  onChange={(event) => onDraftChange('destination', event.target.value)}
                  placeholder="Porto ou aeroporto de destino"
                />
              </label>
            </div>

            {draft.category !== 'CONSOLIDADO' ? (
              <label className="field">
                <span>Código do processo</span>
                <input
                  className="text-input"
                  type="text"
                  value={draft.processNumber}
                  onChange={(event) => onDraftChange('processNumber', event.target.value)}
                  placeholder="Número do processo"
                />
              </label>
            ) : null}

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>ETD</span>
                <input
                  className="text-input"
                  type="date"
                  value={draft.etd}
                  onChange={(event) => onDraftChange('etd', event.target.value)}
                />
              </label>
              <label className="field">
                <span>ETA</span>
                <input
                  className="text-input"
                  type="date"
                  value={draft.eta}
                  onChange={(event) => onDraftChange('eta', event.target.value)}
                />
              </label>
            </div>

            <div className="detail-card detail-card--split">
              <div>
                <span className="detail-label">Previsão automática no armazém</span>
                <p>{getAutomaticEstimatedDeliveryLabel(draft)}</p>
              </div>
              <div>
                <span className="detail-label">Previsão aplicada</span>
                <p>{getEstimatedDeliveryLabel(draft)}</p>
              </div>
            </div>

            <label className="field">
              <span>Previsão manual de entrega no armazém</span>
              <input
                className="text-input"
                type="date"
                value={draft.warehouseDeliveryDateOverride}
                onChange={(event) =>
                  onDraftChange('warehouseDeliveryDateOverride', event.target.value)
                }
              />
              <small className="field-hint">
                Campo opcional. Se vazio, o sistema usa a previsão automática.
              </small>
            </label>
            {draft.warehouseDeliveryDateOverride ? (
              <div className="action-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onDraftChange('warehouseDeliveryDateOverride', '')}
                >
                  Remover previsão manual
                </button>
              </div>
            ) : null}

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Status do processo</span>
                <SelectField
                  className="text-input"
                  value={draft.processStatus}
                  onChange={(event) => onDraftChange('processStatus', event.target.value)}
                >
                  {processStatusOptions.map((item) => (
                    <option key={item} value={item}>
                      {getDisplayedProcessStatus(item, draft.category)}
                    </option>
                  ))}
                </SelectField>
              </label>
              <div className="detail-card detail-card--soft">
                <span className="detail-label">Leitura rápida</span>
                <span className={getStatusTagClass(draft.processStatus)}>
                  {getDisplayedProcessStatus(draft.processStatus, draft.category)}
                </span>
              </div>
            </div>

            <div className="detail-card detail-card--split">
              <label className="field">
                <span>Quantidade de containers</span>
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={draft.containerQuantity}
                  onChange={(event) => onDraftChange('containerQuantity', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Quantidade de pallets</span>
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  value={draft.palletQuantity}
                  onChange={(event) => onDraftChange('palletQuantity', event.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>Observações do processo</span>
              <textarea
                className="text-input text-area"
                value={draft.processNotes}
                onChange={(event) => onDraftChange('processNotes', event.target.value)}
                placeholder="Informações operacionais relevantes do processo."
              />
            </label>

            {viewMode === 'edit' && draft.etaOriginal ? (
              <div className="detail-card">
                <span className="detail-label">ETA original</span>
                <p>{formatDate(draft.etaOriginal)}</p>
              </div>
            ) : null}

            {viewMode === 'edit' && isMaritimeCategory(draft.category) ? (
              <div className="detail-card">
                <span className="detail-label">MAPA</span>
                <label className="field">
                  <span>Status</span>
                  <SelectField
                    className="text-input"
                    value={draft.mapaStatus}
                    onChange={(event) => onDraftChange('mapaStatus', event.target.value)}
                  >
                    <option value="">Selecione o status</option>
                    {mapaStatusOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </SelectField>
                </label>
                {shouldEditMapaInspection(draft.mapaStatus) ? (
                  <label className="field">
                    <span>Vistoria agendada para</span>
                    <input
                      className="text-input"
                      type="datetime-local"
                      value={draft.mapaInspectionScheduledAt}
                      onChange={(event) => onDraftChange('mapaInspectionScheduledAt', event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {canShowMaritimeFlow ? (
              <div className="detail-card">
                <span className="detail-label">Pós-atracação</span>
                <div className="checkbox-grid">
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={draft.berthed}
                      onChange={(event) => onDraftChange('berthed', event.target.checked)}
                    />
                    <span>Atracou?</span>
                  </label>
                  {draft.berthed ? (
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={draft.cargoPresenceInformed}
                        onChange={(event) => onDraftChange('cargoPresenceInformed', event.target.checked)}
                      />
                      <span>Presença de carga informada?</span>
                    </label>
                  ) : null}
                </div>
                {draft.cargoPresenceInformed ? (
                  <label className="field">
                    <span>DUIMP</span>
                    <SelectField
                      className="text-input"
                      value={draft.duimpStatus}
                      onChange={(event) => onDraftChange('duimpStatus', event.target.value)}
                    >
                      <option value="">Selecione o status</option>
                      {duimpStatusOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {draft.duimpStatus === 'Parametrizada' ? (
                  <label className="field">
                    <span>Canal da parametrização</span>
                    <SelectField
                      className="text-input"
                      value={draft.parameterizationChannel}
                      onChange={(event) => onDraftChange('parameterizationChannel', event.target.value)}
                    >
                      <option value="">Selecione o canal</option>
                      {channelOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {draft.parameterizationChannel === 'Verde' && mapaAllowsCollection(draft.mapaStatus) ? (
                  <label className="field">
                    <span>Coleta</span>
                    <SelectField
                      className="text-input"
                      value={draft.collectionStatus}
                      onChange={(event) => onDraftChange('collectionStatus', event.target.value)}
                    >
                      <option value="">Selecione o status</option>
                      {getCollectionStatusOptions(draft).map((item) => (
                        <option key={item} value={item}>{getDisplayedCollectionStatus(item)}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {shouldEditCollectionSchedule(draft.collectionStatus) || isCdEnRouteStatusForFilter(draft.collectionStatus) ? (
                  <CollectionWindowsEditor
                    value={draft.collectionWindows}
                    maxContainers={Math.max(draft.containerQuantity || 1, 1)}
                    onChange={(nextWindows) => onDraftChange('collectionWindows', nextWindows)}
                    disabled={isSaving}
                  />
                ) : null}
                {draft.collectionStatus && keepsCollectionSchedule(draft.collectionStatus) && !shouldEditCollectionSchedule(draft.collectionStatus) ? (
                  <div className="detail-card">
                    <span className="detail-label">Coleta</span>
                    <p>{getDisplayedCollectionStatus(draft.collectionStatus)}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {canShowAirFlow ? (
              <div className="detail-card">
                <span className="detail-label">Pós-chegada</span>
                <div className="checkbox-grid">
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={draft.arrived}
                      onChange={(event) => onDraftChange('arrived', event.target.checked)}
                    />
                    <span>Chegou?</span>
                  </label>
                </div>
                {draft.arrived ? (
                  <label className="field">
                    <span>DTA</span>
                    <SelectField
                      className="text-input"
                      value={draft.dtaStatus}
                      onChange={(event) => onDraftChange('dtaStatus', event.target.value)}
                    >
                      <option value="">Selecione o status</option>
                      {dtaStatusOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {isDtaLoadingScheduled(draft.dtaStatus) ? (
                  <div className="detail-card detail-card--split">
                    <label className="field">
                      <span>Previsão do carregamento da DTA</span>
                      <input
                        className="text-input"
                        type="datetime-local"
                        value={draft.dtaLoadingScheduledAt}
                        onChange={(event) => onDraftChange('dtaLoadingScheduledAt', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Previsão de chegada em Itajaí</span>
                      <input
                        className="text-input"
                        type="datetime-local"
                        value={draft.dtaArrivalAtItajai}
                        onChange={(event) => onDraftChange('dtaArrivalAtItajai', event.target.value)}
                      />
                    </label>
                  </div>
                ) : null}
                {isDtaTransitCompleted(draft.dtaStatus) ? (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={draft.cargoPresenceInformed}
                      onChange={(event) => onDraftChange('cargoPresenceInformed', event.target.checked)}
                    />
                    <span>Presença de carga informada?</span>
                  </label>
                ) : null}
                {draft.cargoPresenceInformed ? (
                  <label className="field">
                    <span>DUIMP</span>
                    <SelectField
                      className="text-input"
                      value={draft.duimpStatus}
                      onChange={(event) => onDraftChange('duimpStatus', event.target.value)}
                    >
                      <option value="">Selecione o status</option>
                      {duimpStatusOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {draft.duimpStatus === 'Parametrizada' ? (
                  <label className="field">
                    <span>Canal da parametrização</span>
                    <SelectField
                      className="text-input"
                      value={draft.parameterizationChannel}
                      onChange={(event) => onDraftChange('parameterizationChannel', event.target.value)}
                    >
                      <option value="">Selecione o canal</option>
                      {channelOptions.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {draft.parameterizationChannel === 'Verde' ? (
                  <label className="field">
                    <span>Coleta</span>
                    <SelectField
                      className="text-input"
                      value={draft.collectionStatus}
                      onChange={(event) => onDraftChange('collectionStatus', event.target.value)}
                    >
                      <option value="">Selecione o status</option>
                      {getCollectionStatusOptions(draft).map((item) => (
                        <option key={item} value={item}>{getDisplayedCollectionStatus(item)}</option>
                      ))}
                    </SelectField>
                  </label>
                ) : null}
                {shouldEditCollectionSchedule(draft.collectionStatus) || isCdEnRouteStatusForFilter(draft.collectionStatus) ? (
                  <CollectionWindowsEditor
                    value={draft.collectionWindows}
                    maxContainers={Math.max(draft.containerQuantity || 1, 1)}
                    onChange={(nextWindows) => onDraftChange('collectionWindows', nextWindows)}
                    disabled={isSaving}
                  />
                ) : null}
                {draft.collectionStatus && keepsCollectionSchedule(draft.collectionStatus) && !shouldEditCollectionSchedule(draft.collectionStatus) ? (
                  <div className="detail-card">
                    <span className="detail-label">Coleta</span>
                    <p>{getDisplayedCollectionStatus(draft.collectionStatus)}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {editTab === 'items' ? (
          <div className="detail-card">
            <div className="card-heading process-detail-card-heading">
              <div>
                <span className="detail-label">Itens do processo</span>
                <p>Nome comercial e quantidade vinculados ao processo. A importação aceita planilhas Excel com colunas de nome e quantidade.</p>
              </div>
              <div className="admin-toolbar">
                <input
                  ref={itemsFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={onImportItemsFile}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => itemsFileInputRef.current?.click()}
                  disabled={isImportingItems}
                >
                  {isImportingItems ? 'Importando planilha...' : 'Importar planilha'}
                </button>
                <button type="button" className="ghost-button" onClick={onAddItem}>Adicionar item</button>
              </div>
            </div>

            <div className="process-items-editor">
              {(draft.items ?? []).map((item) => (
                <div key={item.id} className="detail-card detail-card--split">
                  <label className="field">
                    <span>Nome comercial</span>
                    <input
                      className="text-input"
                      type="text"
                      value={item.commercialName}
                      onChange={(event) => onItemChange(item.id, 'commercialName', event.target.value)}
                      placeholder="Ex.: Resina Atlas"
                    />
                  </label>
                  <div className="process-item-editor__actions">
                    <label className="field">
                      <span>Quantidade</span>
                      <input
                        className="text-input"
                        type="number"
                        min="0"
                        value={item.quantity}
                        onChange={(event) => onItemChange(item.id, 'quantity', event.target.value)}
                      />
                    </label>
                    <button type="button" className="ghost-button" onClick={() => onRemoveItem(item.id)}>
                      Remover item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="action-row">
        <button type="button" className="primary-button" onClick={onSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Spinner size={14} label="Salvando" /> Salvando...
            </>
          ) : viewMode === 'create' ? (
            'Criar processo'
          ) : (
            'Salvar alterações'
          )}
        </button>
      </div>
    </article>
  )
}