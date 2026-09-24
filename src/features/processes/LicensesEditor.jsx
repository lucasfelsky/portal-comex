import SelectField from '../../components/SelectField'
import {
  LICENSE_AGENCY_OPTIONS,
  LICENSE_STATUS_OPTIONS,
  MAX_LICENSES,
  createEmptyLicense,
} from './licenses'

// F17.2b (D-5): editor de anuencias `licenses[]` - lista editavel (orgao,
// No LPCO, status, vistoria/deferimento condicionais, observacoes,
// "Remover") + botao "Adicionar anuência" (desabilita no teto de 10). So'
// importa de `./licenses` e `SelectField` (mesma regra de import de
// `ContainersEditor.jsx` - `tests/ui/ProcessesPage.test.jsx` mocka modulos
// com lista fechada de exports).
function generateLicenseId() {
  return `LIC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function LicensesEditor({ value, onChange, disabled = false }) {
  const licenses = Array.isArray(value) ? value : []
  const canAddMore = licenses.length < MAX_LICENSES

  function handleAdd() {
    onChange([...licenses, createEmptyLicense(generateLicenseId())])
  }

  function handleChange(id, patch) {
    onChange(licenses.map((license) => (license.id === id ? { ...license, ...patch } : license)))
  }

  function handleRemove(id) {
    onChange(licenses.filter((license) => license.id !== id))
  }

  return (
    <div className="collection-windows-editor">
      <div className="collection-windows-editor__header">
        <div>
          <span className="detail-label">
            {licenses.length} anuência{licenses.length === 1 ? '' : 's'}
          </span>
          <p>Cadastre o órgão, número da LPCO e status de cada anuência exigida.</p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleAdd}
          disabled={disabled || !canAddMore}
        >
          Adicionar anuência
        </button>
      </div>

      <small className="field-hint">
        A coleta só é liberada com todas as anuências deferidas. Anuência não deferida remove o
        agendamento de coleta ao salvar.
      </small>

      {licenses.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>Nenhuma anuência cadastrada</strong>
          <p>Adicione uma anuência se este processo exigir liberação de órgão anuente.</p>
        </div>
      ) : (
        <ul className="collection-windows-editor__list">
          {licenses.map((license) => {
            const showInspection =
              license.status === 'Vistoria agendada' || license.status === 'Vistoria realizada'
            const showDeferredAt = license.status === 'Deferida'
            const isRejected = license.status === 'Indeferida'

            return (
              <li key={license.id} className="collection-windows-editor__item">
                <div className="collection-windows-editor__row">
                  <label className="field">
                    <span>Órgão</span>
                    <SelectField
                      className="text-input"
                      value={license.agency}
                      onChange={(event) => handleChange(license.id, { agency: event.target.value })}
                      disabled={disabled}
                    >
                      {LICENSE_AGENCY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </SelectField>
                  </label>
                  <label className="field">
                    <span>Nº LPCO</span>
                    <input
                      className="text-input"
                      type="text"
                      value={license.lpcoNumber}
                      onChange={(event) => handleChange(license.id, { lpcoNumber: event.target.value })}
                      disabled={disabled}
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <SelectField
                      className="text-input"
                      value={license.status}
                      onChange={(event) => handleChange(license.id, { status: event.target.value })}
                      disabled={disabled}
                    >
                      {LICENSE_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </SelectField>
                    {isRejected ? (
                      <small className="field-hint">
                        <span className="inline-badge inline-badge--danger">Indeferida</span>
                      </small>
                    ) : null}
                  </label>
                  <button
                    type="button"
                    className="ghost-button collection-windows-editor__remove"
                    onClick={() => handleRemove(license.id)}
                    disabled={disabled}
                  >
                    Remover
                  </button>
                </div>

                {showInspection ? (
                  <div className="collection-windows-editor__row">
                    <label className="field">
                      <span>Vistoria agendada para</span>
                      <input
                        className="text-input"
                        type="datetime-local"
                        value={license.inspectionScheduledAt}
                        onChange={(event) =>
                          handleChange(license.id, { inspectionScheduledAt: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </label>
                  </div>
                ) : null}

                {showDeferredAt ? (
                  <div className="collection-windows-editor__row">
                    <label className="field">
                      <span>Deferida em</span>
                      <input
                        className="text-input"
                        type="date"
                        value={license.deferredAt}
                        onChange={(event) => handleChange(license.id, { deferredAt: event.target.value })}
                        disabled={disabled}
                      />
                    </label>
                  </div>
                ) : null}

                <div className="collection-windows-editor__row">
                  <label className="field">
                    <span>Observações</span>
                    <input
                      className="text-input"
                      type="text"
                      value={license.notes}
                      onChange={(event) => handleChange(license.id, { notes: event.target.value })}
                      disabled={disabled}
                    />
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
