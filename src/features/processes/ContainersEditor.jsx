import SelectField from '../../components/SelectField'
import {
  CONTAINER_TYPE_OPTIONS,
  MAX_CONTAINERS,
  createEmptyContainer,
  getContainerNumberWarning,
} from './containers'

// F17.2a (D-11): editor de containers[] - lista editavel (tipo, numero +
// aviso ISO 6346, lacre, remover) + botao "Adicionar contêiner" (desabilita
// no teto de 40). So' importa de `./containers` e `SelectField` (D-11 -
// tests/ui/ProcessesPage.test.jsx mocka modulos com lista fechada).
function generateContainerId() {
  return `CNT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ContainersEditor({ value, onChange, disabled = false }) {
  const containers = Array.isArray(value) ? value : []
  const canAddMore = containers.length < MAX_CONTAINERS

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
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">
            {containers.length} contêiner{containers.length === 1 ? '' : 'es'}
          </span>
          <p>Cadastre tipo, número (ISO 6346) e lacre de cada contêiner.</p>
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
                    />
                    {warning ? (
                      <small className="field-hint">
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
                    disabled={disabled}
                  >
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
