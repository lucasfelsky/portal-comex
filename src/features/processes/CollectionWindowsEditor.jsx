import {
  addCollectionWindow,
  createCollectionWindow,
  normalizeCollectionWindows,
  removeCollectionWindow,
  updateCollectionWindow,
} from '../../utils/collectionWindows'

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

export default function CollectionWindowsEditor({
  value,
  onChange,
  maxContainers = 1,
  disabled = false,
}) {
  const windows = normalizeCollectionWindows(value)
  const maxAllowed = Math.max(1, Number(maxContainers) || 1)
  const canAddMore = windows.length < maxAllowed

  function handleAdd() {
    const nextIndex = windows.length + 1
    onChange(addCollectionWindow(windows, { containerNumber: nextIndex, scheduledAt: '' }))
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

  return (
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">Janelas de coleta por container</span>
          <p>
            Agende um horário independente para cada container. Limite: {maxAllowed}{' '}
            {maxAllowed === 1 ? 'container' : 'containers'} neste processo.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleAdd}
          disabled={disabled || !canAddMore}
        >
          Adicionar container
        </button>
      </div>

      {windows.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhuma janela agendada</strong>
          <p>Adicione um container para informar o horário previsto de coleta no CD.</p>
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
          {windows.map((window) => (
            <li key={window.id} className="collection-windows-editor__item">
              <div className="collection-windows-editor__row">
                <label className="field">
                  <span>Container</span>
                  <input
                    className="text-input"
                    type="number"
                    min="1"
                    value={window.containerNumber}
                    onChange={(event) =>
                      handleChange(window.id, {
                        containerNumber: Math.max(1, Number(event.target.value) || 1),
                      })
                    }
                    disabled={disabled}
                  />
                </label>
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
          ))}
        </ul>
      )}
    </div>
  )
}