import Icon from '../../components/Icon'
import {
  addCollectionWindow,
  createCollectionWindow,
  normalizeCollectionWindows,
  removeCollectionWindow,
  updateCollectionWindow,
} from '../../utils/collectionWindows'
import { CONTAINER_TYPE_OPTIONS, getCollectionWindowLabel, getContainerWindowRows } from './containers'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'

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

function getContainerTypeLabel(type) {
  return CONTAINER_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? ''
}

// UX-6b-2 (D-7): chip "Salvo: …" - so' aparece quando o horario salvo
// (snapshot do momento em que a edicao abriu, via prop `savedValue`) diverge
// do horario atual, inclusive quando o atual foi limpo.
function SavedChip({ savedScheduledAt, currentScheduledAt }) {
  if (!savedScheduledAt) return null
  if (toDatetimeLocal(savedScheduledAt) === toDatetimeLocal(currentScheduledAt)) return null
  return <span className="editor-chip--saved">{`Salvo: ${formatDateTime(savedScheduledAt)}`}</span>
}

// F17.2d-2 (D-11, Q7): FCL/CONSOLIDADO com containers[] cadastrados -> 1
// linha de janela POR CONTÊINER (na ordem de `containers[]`), sem botoes
// adicionar/remover e sem select de contêiner (a linha JA' e' o contêiner).
// Janela sem horario nunca e' gravada (limpar o horario remove a janela).
// LCL/AEREO (ou FCL/CONSOLIDADO sem containers ainda) mantem o comportamento
// atual (janela unica, "Adicionar janela"/"Adicionar primeira janela").
// UX-6b-2 (D-7/D-8): prop opcional `savedValue` (mesmo formato de `value`) -
// sem ela, nunca ha' chip "Salvo: …". O card de leitura duplicado saiu.
export default function CollectionWindowsEditor({
  value,
  savedValue,
  onChange,
  category,
  containers = [],
  disabled = false,
  errors = {},
}) {
  const windows = normalizeCollectionWindows(value)
  const savedWindows = savedValue !== undefined ? normalizeCollectionWindows(savedValue) : undefined
  const linkToContainers = (category === 'FCL' || category === 'CONSOLIDADO') && containers.length > 0
  const isAirOrLcl = category === 'LCL' || category === 'AEREO'

  if (linkToContainers) {
    const { rows, extraWindows } = getContainerWindowRows(windows, containers)
    const savedRows =
      savedWindows !== undefined ? getContainerWindowRows(savedWindows, containers).rows : undefined

    function emitRows(nextRows) {
      const rowWindows = nextRows.map((row) => row.window).filter(Boolean)
      onChange([...rowWindows, ...extraWindows])
    }

    function handleScheduledAtChange(row, rawValue) {
      const nextRows = rows.map((current) => current)
      if (!row.window) {
        if (!rawValue) return
        nextRows[row.index] = {
          ...row,
          window: createCollectionWindow({
            containerId: row.container.id,
            containerNumber: row.index + 1,
            scheduledAt: rawValue,
          }),
        }
        emitRows(nextRows)
        return
      }

      if (!rawValue) {
        nextRows[row.index] = { ...row, window: null }
        emitRows(nextRows)
        return
      }

      nextRows[row.index] = {
        ...row,
        window: updateCollectionWindow([row.window], row.window.id, { scheduledAt: rawValue })[0],
      }
      emitRows(nextRows)
    }

    function handleNotesChange(row, rawValue) {
      if (!row.window) return
      const nextRows = rows.map((current) => current)
      nextRows[row.index] = {
        ...row,
        window: updateCollectionWindow([row.window], row.window.id, { notes: rawValue })[0],
      }
      emitRows(nextRows)
    }

    function handleRemoveExtra(windowId) {
      onChange([
        ...rows.map((row) => row.window).filter(Boolean),
        ...removeCollectionWindow(extraWindows, windowId),
      ])
    }

    return (
      <div className="collection-windows-editor">
        <div className="collection-windows-editor__header">
          <div>
            <span className="detail-label">Janelas de coleta por contêiner</span>
            <p>Informe o horário previsto de coleta de cada contêiner.</p>
          </div>
        </div>

        <small className="field-hint">Limpar o horário remove a janela.</small>

        <ul className="collection-windows-editor__list">
          {rows.map((row, index) => {
            const typeLabel = getContainerTypeLabel(row.container.type)
            const savedRow = savedRows?.[index]
            return (
              <li key={row.container.id} className="editor-row editor-row--window">
                <div className="editor-row__title">
                  <span>{row.label}</span>
                  {typeLabel ? <span className="inline-badge">{typeLabel}</span> : null}
                  <SavedChip
                    savedScheduledAt={savedRow?.window?.scheduledAt}
                    currentScheduledAt={row.window?.scheduledAt}
                  />
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span className="editor-row__label">Horário previsto</span>
                    <input
                      className="text-input"
                      type="datetime-local"
                      value={toDatetimeLocal(row.window?.scheduledAt)}
                      onChange={(event) => handleScheduledAtChange(row, event.target.value)}
                      disabled={disabled}
                      {...(row.window?.id
                        ? getFieldA11yProps(
                            `process-field-collectionWindows-${row.window.id}-scheduledAt`,
                            errors[`collectionWindows.${row.window.id}.scheduledAt`]
                          )
                        : {})}
                    />
                    {row.window?.id && errors[`collectionWindows.${row.window.id}.scheduledAt`] ? (
                      <small
                        className="field-error"
                        id={getFieldErrorId(`process-field-collectionWindows-${row.window.id}-scheduledAt`)}
                        aria-hidden="true"
                      >
                        {errors[`collectionWindows.${row.window.id}.scheduledAt`]}
                      </small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span className="editor-row__label">Observações do contêiner (opcional)</span>
                    <input
                      className="text-input"
                      type="text"
                      value={row.window?.notes ?? ''}
                      onChange={(event) => handleNotesChange(row, event.target.value)}
                      placeholder="Ex.: lacre, transportadora, restrição de acesso..."
                      disabled={disabled || !row.window}
                    />
                  </label>
                </div>
              </li>
            )
          })}

          {extraWindows.map((window) => (
            <li key={window.id} className="editor-row editor-row--window">
              <div className="editor-row__title">
                <span>{getCollectionWindowLabel(window, { category, containers })}</span>
              </div>
              <p className="editor-row__meta">{formatDateTime(window.scheduledAt)}</p>
              <button
                type="button"
                className="action-icon-button editor-row__remove"
                onClick={() => handleRemoveExtra(window.id)}
                disabled={disabled}
                aria-label="Remover"
                title="Remover janela"
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const maxAllowed = 1
  const canAddMore = windows.length < maxAllowed

  function handleAdd() {
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

  const isSingleWindowExtra = windows.length > 1
  const notesLabel = isAirOrLcl ? 'Observações da coleta (opcional)' : 'Observações do contêiner (opcional)'

  return (
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">Janela de coleta</span>
          <p>Agende o horário previsto de coleta no CD.</p>
          {category === 'FCL' || category === 'CONSOLIDADO' ? (
            <small className="field-hint">
              Cadastre os contêineres no passo Carga para vincular cada janela a um
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
          Adicionar janela
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
            const savedWindow = savedWindows?.find((item) => item.id === window.id)
            return (
              <li key={window.id} className="editor-row editor-row--window">
                <div className="editor-row__title">
                  <SavedChip
                    savedScheduledAt={savedWindow?.scheduledAt}
                    currentScheduledAt={window.scheduledAt}
                  />
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span className="editor-row__label">Horário previsto</span>
                    <input
                      className="text-input"
                      type="datetime-local"
                      value={toDatetimeLocal(window.scheduledAt)}
                      onChange={(event) =>
                        handleChange(window.id, { scheduledAt: event.target.value })
                      }
                      disabled={disabled}
                      {...getFieldA11yProps(
                        `process-field-collectionWindows-${window.id}-scheduledAt`,
                        errors[`collectionWindows.${window.id}.scheduledAt`]
                      )}
                    />
                    {errors[`collectionWindows.${window.id}.scheduledAt`] ? (
                      <small
                        className="field-error"
                        id={getFieldErrorId(`process-field-collectionWindows-${window.id}-scheduledAt`)}
                        aria-hidden="true"
                      >
                        {errors[`collectionWindows.${window.id}.scheduledAt`]}
                      </small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span className="editor-row__label">{notesLabel}</span>
                    <input
                      className="text-input"
                      type="text"
                      value={window.notes ?? ''}
                      onChange={(event) => handleChange(window.id, { notes: event.target.value })}
                      placeholder="Ex.: lacre, transportadora, restrição de acesso..."
                      disabled={disabled}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="action-icon-button editor-row__remove"
                  onClick={() => handleRemove(window.id)}
                  disabled={disabled}
                  aria-label="Remover"
                  title="Remover janela"
                >
                  <Icon name="trash" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
