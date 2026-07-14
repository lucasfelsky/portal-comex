import CollectionWindowsEditor from './CollectionWindowsEditor'
import {
  CD_EN_ROUTE_STATUS,
  getDisplayedCollectionStatus,
  getQuickReadProcessStatus,
  isLogisticaEditableCollectionStatus,
  postCollectionStatusOptions,
} from './processStatus'
import { getStatusTagClass } from './processStatusView'
import { getProcessTitle } from './processLabels'

// F10.3 (backlog 2026-07-12): tela de edição do status de coleta (viewMode
// 'collection-status-edit'), extraída do ProcessesPage. Presentacional — lê
// só o campo `collectionStatus` do draft (via prop) e chama callbacks; o
// estado e os handlers continuam na página. Zero mudança visual/comportamental.
export default function CollectionStatusEditView({
  process,
  collectionStatus,
  isAdmin,
  isSaving,
  onStatusChange,
  onSave,
  onClose,
}) {
  return (
    <article className="list-card" style={{ marginTop: '16px' }}>
      <div className="card-heading">
        <div>
          <h3>Status de coleta</h3>
        </div>
        <div className="admin-toolbar">
          <span className={getStatusTagClass(process.processStatus)}>
            {getQuickReadProcessStatus(process)}
          </span>
          <button type="button" className="ghost-button" onClick={onClose}>
            Voltar ao detalhe
          </button>
        </div>
      </div>

      <div className="detail-stack">
        <div className="detail-card">
          <span className="detail-label">Processo</span>
          <p>{getProcessTitle(process, isAdmin)}</p>
        </div>
        <CollectionWindowsEditor
          value={process.collectionWindows}
          maxContainers={Math.max(process.containerQuantity || 1, 1)}
          onChange={() => {}}
          disabled
        />
        <label className="field">
          <span>Status</span>
          <select
            className="text-input"
            value={collectionStatus}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="">Selecione o status</option>
            <optgroup label="Em rota">
              <option value={CD_EN_ROUTE_STATUS}>{getDisplayedCollectionStatus(CD_EN_ROUTE_STATUS)}</option>
            </optgroup>
            <optgroup label="Pós-recebimento">
              {[...postCollectionStatusOptions, 'Veículo no CD para descarga', 'Carga recebida'].map((item) => (
                <option key={item} value={item}>
                  {getDisplayedCollectionStatus(item)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={isSaving || !isLogisticaEditableCollectionStatus(collectionStatus)}
        >
          {isSaving ? 'Salvando...' : 'Salvar status'}
        </button>
      </div>
    </article>
  )
}
