import { useRef, useState } from 'react'
import SelectField from '../../components/SelectField'
import Icon from '../../components/Icon'
import {
  LICENSE_AGENCY_OPTIONS,
  LICENSE_STATUS_OPTIONS,
  MAX_LICENSES,
  createEmptyLicense,
} from './licenses'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'

// F17.2b (D-5): editor de anuencias `licenses[]` - lista editavel (orgao,
// No LPCO, status, vistoria/deferimento condicionais, observacoes,
// "Remover") + botao "Adicionar anuência" (desabilita no teto de 10). So'
// importa de `./licenses`, `SelectField` e `Icon` (mesma regra de import de
// `ContainersEditor.jsx` - `tests/ui/ProcessesPage.test.jsx` mocka modulos
// com lista fechada de exports).
// UX-6b-2 (D-1/D-3/D-4/D-5): linha unica por anuencia (grid, cabecalho de
// colunas no desktop), celula "Data" unica (rotulo varia por status) e
// observacoes atras de um link-botao "+ Observação".
function generateLicenseId() {
  return `LIC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function LicensesEditor({ value, onChange, disabled = false, errors = {} }) {
  const licenses = Array.isArray(value) ? value : []
  const canAddMore = licenses.length < MAX_LICENSES
  const groupDomId = 'process-field-licenses'
  const groupError = errors.licenses
  const [openNotes, setOpenNotes] = useState({})
  const notesInputRefs = useRef({})

  function handleAdd() {
    onChange([...licenses, createEmptyLicense(generateLicenseId())])
  }

  function handleChange(id, patch) {
    onChange(licenses.map((license) => (license.id === id ? { ...license, ...patch } : license)))
  }

  function handleRemove(id) {
    onChange(licenses.filter((license) => license.id !== id))
  }

  function handleOpenNotes(id) {
    setOpenNotes((current) => ({ ...current, [id]: true }))
    requestAnimationFrame(() => {
      notesInputRefs.current[id]?.focus()
    })
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
            {licenses.length} anuência{licenses.length === 1 ? '' : 's'}
          </span>
          <p>Cadastre o órgão, número da LPCO e status de cada anuência exigida.</p>
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
        <>
          <div className="editor-grid__head editor-grid__head--licenses" aria-hidden="true">
            <span>Órgão</span>
            <span>Nº LPCO</span>
            <span>Status</span>
            <span>Data</span>
            <span />
          </div>
          <ul className="collection-windows-editor__list editor-grid editor-grid--licenses">
            {licenses.map((license) => {
              const showInspection =
                license.status === 'Vistoria agendada' || license.status === 'Vistoria realizada'
              const showDeferredAt = license.status === 'Deferida'
              const isRejected = license.status === 'Indeferida'
              const notesOpen = Boolean(openNotes[license.id]) || Boolean(license.notes)

              return (
                <li key={license.id} className="editor-row">
                  <span className="editor-row__title">{license.agency || 'Anuência'}</span>
                  <label className="field">
                    <span className="editor-row__label">Órgão</span>
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
                    <span className="editor-row__label">Nº LPCO</span>
                    <input
                      className="text-input"
                      type="text"
                      value={license.lpcoNumber}
                      onChange={(event) => handleChange(license.id, { lpcoNumber: event.target.value })}
                      disabled={disabled}
                    />
                  </label>
                  <label className="field">
                    <span className="editor-row__label">Status</span>
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

                  {showInspection ? (
                    <label className="field">
                      <span className="editor-row__label editor-row__label--caption">Vistoria agendada para</span>
                      <input
                        className="text-input"
                        type="datetime-local"
                        value={license.inspectionScheduledAt}
                        onChange={(event) =>
                          handleChange(license.id, { inspectionScheduledAt: event.target.value })
                        }
                        disabled={disabled}
                        {...getFieldA11yProps(
                          `process-field-licenses-${license.id}-inspectionScheduledAt`,
                          errors[`licenses.${license.id}.inspectionScheduledAt`]
                        )}
                      />
                      {errors[`licenses.${license.id}.inspectionScheduledAt`] ? (
                        <small
                          className="field-error"
                          id={getFieldErrorId(`process-field-licenses-${license.id}-inspectionScheduledAt`)}
                          aria-hidden="true"
                        >
                          {errors[`licenses.${license.id}.inspectionScheduledAt`]}
                        </small>
                      ) : null}
                    </label>
                  ) : showDeferredAt ? (
                    <label className="field">
                      <span className="editor-row__label editor-row__label--caption">Deferida em</span>
                      <input
                        className="text-input"
                        type="date"
                        value={license.deferredAt}
                        onChange={(event) => handleChange(license.id, { deferredAt: event.target.value })}
                        disabled={disabled}
                        {...getFieldA11yProps(
                          `process-field-licenses-${license.id}-deferredAt`,
                          errors[`licenses.${license.id}.deferredAt`]
                        )}
                      />
                      {errors[`licenses.${license.id}.deferredAt`] ? (
                        <small
                          className="field-error"
                          id={getFieldErrorId(`process-field-licenses-${license.id}-deferredAt`)}
                          aria-hidden="true"
                        >
                          {errors[`licenses.${license.id}.deferredAt`]}
                        </small>
                      ) : null}
                    </label>
                  ) : (
                    <span className="editor-row__full" />
                  )}

                  <button
                    type="button"
                    className="action-icon-button editor-row__remove"
                    onClick={() => handleRemove(license.id)}
                    disabled={disabled}
                    aria-label="Remover"
                    title="Remover anuência"
                  >
                    <Icon name="trash" />
                  </button>

                  <div className="editor-row__full">
                    {!notesOpen ? (
                      <button
                        type="button"
                        className="editor-link-button"
                        aria-expanded="false"
                        aria-controls={`process-field-licenses-${license.id}-notes`}
                        onClick={() => handleOpenNotes(license.id)}
                        disabled={disabled}
                      >
                        + Observação
                      </button>
                    ) : (
                      <label className="field">
                        <span className="editor-row__label">Observações</span>
                        <input
                          id={`process-field-licenses-${license.id}-notes`}
                          ref={(node) => {
                            notesInputRefs.current[license.id] = node
                          }}
                          className="text-input"
                          type="text"
                          value={license.notes}
                          onChange={(event) => {
                            setOpenNotes((current) => ({ ...current, [license.id]: true }))
                            handleChange(license.id, { notes: event.target.value })
                          }}
                          disabled={disabled}
                        />
                      </label>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
