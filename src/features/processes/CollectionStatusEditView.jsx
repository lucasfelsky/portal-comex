import SelectField from '../../components/SelectField'
import CollectionWindowsEditor from './CollectionWindowsEditor'
import ReceiptDivergenceFields from './ReceiptDivergenceFields'
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
// F17.4b (B-4): + editor de divergencia no recebimento (logistica E admin),
// visivel so' quando o status escolhido e' pos-recebimento.
export default function CollectionStatusEditView({
  process,
  collectionStatus,
  canSeeName,
  isSaving,
  receiptDivergenceFields,
  onStatusChange,
  onDivergenceChange,
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
          <p>{getProcessTitle(process, canSeeName)}</p>
        </div>
        <CollectionWindowsEditor
          value={process.collectionWindows}
          category={process.category}
          containers={process.containers}
          onChange={() => {}}
          disabled
        />
        <label className="field">
          <span>Status</span>
          <SelectField
            className="text-input"
            value={collectionStatus}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="">Selecione o status</option>
            <optgroup label="Em rota">
              {[CD_EN_ROUTE_STATUS, 'Veículo no CD para descarga'].map((item) => (
                <option key={item} value={item}>
                  {getDisplayedCollectionStatus(item)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Recebimento">
              {postCollectionStatusOptions.map((item) => (
                <option key={item} value={item}>
                  {getDisplayedCollectionStatus(item)}
                </option>
              ))}
            </optgroup>
          </SelectField>
        </label>
        {postCollectionStatusOptions.includes(collectionStatus) ? (
          <ReceiptDivergenceFields
            value={receiptDivergenceFields}
            imagesCount={
              Array.isArray(process.postReceiptImages) ? process.postReceiptImages.length : 0
            }
            onChange={onDivergenceChange}
            disabled={isSaving}
          />
        ) : null}
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
