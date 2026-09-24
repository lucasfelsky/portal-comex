import SelectField from '../../components/SelectField'
import {
  addCollectionWindow,
  createCollectionWindow,
  normalizeCollectionWindows,
  removeCollectionWindow,
  updateCollectionWindow,
} from '../../utils/collectionWindows'
import { getContainerOptionLabel, isOrphanCollectionWindow } from './containers'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toDatetimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// F17.2c (D-7): FCL/CONSOLIDADO com containers[] cadastrados -> select de
// contêiner por janela (uma janela por contêiner). LCL/AEREO (ou
// FCL/CONSOLIDADO sem containers ainda) -> janela única sem campo de
// contêiner.
export default function CollectionWindowsEditor({
  value,
  onChange,
  category,
  containers = [],
  disabled = false,
}) {
  const windows = normalizeCollectionWindows(value)
  const linkToContainers = (category === 'FCL' || category === 'CONSOLIDADO') && containers.length > 0
  const maxAllowed = linkToContainers ? containers.length : 1
  const canAddMore = windows.length < maxAllowed

  function handleAdd() {
    if (linkToContainers) {
      const usedContainerIds = new Set(windows.map((window) => window.containerId).filter(Boolean))
      const nextContainerIndex = containers.findIndex((container) => !usedContainerIds.has(container.id))
      const container = nextContainerIndex >= 0 ? containers[nextContainerIndex] : containers[0]
      const containerIndex = nextContainerIndex >= 0 ? nextContainerIndex : 0
      onChange(
        addCollectionWindow(windows, {
          containerId: container?.id ?? '',
          containerNumber: containerIndex + 1,
          scheduledAt: '',
        })
      )
      return
    }

    onChange(addCollectionWindow(windows, { containerNumber: 1, scheduledAt: '' }))
  }

  function handleChange(windowId, patch) {
    onChange(updateCollectionWindow(windows, windowId, patch))
  }

  function handleRemove(windowId) {
    onChange(removeCollectionWindow(windows, windowId))
  }

  function handleQuickFill() {
    if (windows.length === 0) {
      onChange([createCollectionWindow({ containerNumber: 1, scheduledAt: '' })])
    }
  }

  function handleContainerChange(windowId, containerId) {
    const containerIndex = containers.findIndex((container) => container.id === containerId)
    handleChange(windowId, {
      containerId,
      containerNumber: containerIndex >= 0 ? containerIndex + 1 : 0,
    })
  }

  const title = linkToContainers ? 'Janelas de coleta por container' : 'Janela de coleta'
  const isSingleWindowExtra = !linkToContainers && windows.length > 1

  return (
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">{title}</span>
          <p>
            {linkToContainers
              ? `Agende um horário independente para cada container. Limite: ${maxAllowed} ${
                  maxAllowed === 1 ? 'container' : 'containers'
                } neste processo.`
              : 'Agende o horário previsto de coleta no CD.'}
          </p>
          {!linkToContainers && (category === 'FCL' || category === 'CONSOLIDADO') ? (
            <small className="field-hint">
              Cadastre os contêineres no passo Status e carga para vincular cada janela a um
              contêiner.
            </small>
          ) : null}
          {isSingleWindowExtra ? (
            <small className="field-hint">
              LCL e aéreo usam uma única janela de coleta — remova as janelas extras.
            </small>
          ) : null}
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleAdd}
          disabled={disabled || !canAddMore}
        >
          {linkToContainers ? 'Adicionar container' : 'Adicionar janela'}
        </button>
      </div>

      {windows.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Nenhuma janela agendada</strong>
          <p>Adicione uma janela para informar o horário previsto de coleta no CD.</p>
          <button
            type="button"
            className="ghost-button"
            onClick={handleQuickFill}
            disabled={disabled}
          >
            Adicionar primeira janela
          </button>
        </div>
      ) : (
        <ul className="collection-windows-editor__list">
          {windows.map((window) => {
            const isOrphan = linkToContainers && isOrphanCollectionWindow(window, containers)

            return (
              <li key={window.id} className="collection-windows-editor__item">
                <div className="collection-windows-editor__row">
                  {linkToContainers ? (
                    <label className="field">
                      <span>Contêiner</span>
                      <SelectField
                        className="text-input"
                        value={isOrphan ? '' : window.containerId}
                        onChange={(event) => handleContainerChange(window.id, event.target.value)}
                        disabled={disabled}
                      >
                        <option value="">Selecione o contêiner</option>
                        {containers.map((container, index) => (
                          <option key={container.id} value={container.id}>
                            {getContainerOptionLabel(container, index)}
                          </option>
                        ))}
                      </SelectField>
                      {isOrphan ? (
                        <small className="field-hint">
                          Contêiner removido do processo — selecione outro contêiner para esta
                          janela.
                        </small>
                      ) : null}
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Horário previsto</span>
                    <input
                      className="text-input"
                      type="datetime-local"
                      value={toDatetimeLocal(window.scheduledAt)}
                      onChange={(event) =>
                        handleChange(window.id, { scheduledAt: event.target.value })
                      }
                      disabled={disabled}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button collection-windows-editor__remove"
                    onClick={() => handleRemove(window.id)}
                    disabled={disabled}
                  >
                    Remover
                  </button>
                </div>
                <label className="field">
                  <span>Observações do container (opcional)</span>
                  <input
                    className="text-input"
                    type="text"
                    value={window.notes ?? ''}
                    onChange={(event) => handleChange(window.id, { notes: event.target.value })}
                    placeholder="Ex.: lacre, transportadora, restrição de acesso..."
                    disabled={disabled}
                  />
                </label>
                {window.scheduledAt ? (
                  <div className="collection-window-card collection-window-card--inline">
                    <div>
                      <span className="detail-label">Janela atual</span>
                      <p>{formatDateTime(window.scheduledAt)}</p>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
