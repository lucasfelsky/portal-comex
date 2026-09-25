import SelectField from '../../components/SelectField'
import {
  CONTAINER_TYPE_OPTIONS,
  MAX_CONTAINERS,
  createEmptyContainer,
  getContainerNumberWarning,
  isContainerRemovalLocked,
} from './containers'
import { getFieldErrorId } from '../../utils/fieldErrors'

// F17.2a (D-11): editor de containers[] - lista editavel (tipo, numero +
// aviso ISO 6346, lacre, remover) + botao "Adicionar contêiner" (desabilita
// no teto de 40). So' importa de `./containers` e `SelectField` (D-11 -
// tests/ui/ProcessesPage.test.jsx mocka modulos com lista fechada).
// F17.2d-2 (D-13, Q8): "Remover" trava quando o contêiner tem coleta
// AGENDADA (`isContainerRemovalLocked`) - numero/lacre/tipo continuam
// editaveis.
function generateContainerId() {
  return `CNT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ContainersEditor({
  value,
  onChange,
  disabled = false,
  collectionWindows = [],
  errors = {},
}) {
  const containers = Array.isArray(value) ? value : []
  const canAddMore = containers.length < MAX_CONTAINERS
  const groupDomId = 'process-field-containers'
  const groupError = errors.containers

  function handleAdd() {
    onChange([...containers, createEmptyContainer(generateContainerId())])
  }

  function handleChange(id, patch) {
    onChange(containers.map((container) => (container.id === id ? { ...container, ...patch } : container)))
  }

  function handleRemove(id) {
    onChange(containers.filter((container) => container.id !== id))
  }

  return (
    <div
      className="collection-windows-editor"
      id={groupError ? groupDomId : undefined}
      role={groupError ? 'group' : undefined}
      tabIndex={groupError ? -1 : undefined}
      aria-describedby={groupError ? getFieldErrorId(groupDomId) : undefined}
    >
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">
            {containers.length} contêiner{containers.length === 1 ? '' : 'es'}
          </span>
          <p>Cadastre tipo, número (ISO 6346) e lacre de cada contêiner.</p>
          {groupError ? (
            <small className="field-error" id={getFieldErrorId(groupDomId)}>
              {groupError}
            </small>
          ) : null}
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleAdd}
          disabled={disabled || !canAddMore}
        >
          Adicionar contêiner
        </button>
      </div>

      {containers.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Nenhum contêiner cadastrado</strong>
          <p>Adicione ao menos um contêiner para este processo.</p>
        </div>
      ) : (
        <ul className="collection-windows-editor__list">
          {containers.map((container) => {
            const warning = getContainerNumberWarning(container.number)
            const removalLocked = isContainerRemovalLocked(container.id, collectionWindows)
            const numberHintId = `process-field-containers-${container.id}-number-hint`
            return (
              <li key={container.id} className="collection-windows-editor__item">
                <div className="collection-windows-editor__row">
                  <label className="field">
                    <span>Tipo</span>
                    <SelectField
                      className="text-input"
                      value={container.type}
                      onChange={(event) => handleChange(container.id, { type: event.target.value })}
                      disabled={disabled}
                    >
                      <option value="">Selecione o tipo</option>
                      {CONTAINER_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </SelectField>
                  </label>
                  <label className="field">
                    <span>Número</span>
                    <input
                      className="text-input"
                      type="text"
                      value={container.number}
                      onChange={(event) => handleChange(container.id, { number: event.target.value })}
                      placeholder="Ex.: CSQU3054383"
                      disabled={disabled}
                      aria-describedby={warning ? numberHintId : undefined}
                    />
                    {warning ? (
                      <small className="field-hint" id={numberHintId}>
                        <span className="inline-badge inline-badge--warn">{warning}</span>
                      </small>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Lacre</span>
                    <input
                      className="text-input"
                      type="text"
                      value={container.seal}
                      onChange={(event) => handleChange(container.id, { seal: event.target.value })}
                      disabled={disabled}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button collection-windows-editor__remove"
                    onClick={() => handleRemove(container.id)}
                    disabled={disabled || removalLocked}
                  >
                    Remover
                  </button>
                </div>
                {removalLocked ? (
                  <small className="field-hint">
                    Contêiner com coleta agendada — só pode ser editado.
                  </small>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
