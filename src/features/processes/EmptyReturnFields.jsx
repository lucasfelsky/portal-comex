import { getContainerOptionLabel } from './containers'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'

// F17.4b (B-7, D6): devolucao de vazio - editavel SO pelo admin, no passo
// "Fluxo operacional" do form (FCL/CONSOLIDADO, apos recebimento). Importa
// `./containers` e `../../utils/fieldErrors` (UX-3b, nao mockado).
export default function EmptyReturnFields({ containers, onChange, disabled, errors = {} }) {
  const containerList = Array.isArray(containers) ? containers : []

  function handleChange(containerId, value) {
    onChange(
      containerList.map((container) =>
        container.id === containerId ? { ...container, returnedAt: value } : container
      )
    )
  }

  return (
    <div className="detail-card">
      <span className="detail-label">Devolução do vazio</span>
      <div className="detail-stack detail-stack--compact">
        {containerList.map((container, index) => {
          const errorKey = `containers.${container.id}.returnedAt`
          const domId = `process-field-containers-${container.id}-returnedAt`
          return (
            <label className="field" key={container.id}>
              <span>{getContainerOptionLabel(container, index)}</span>
              <input
                className="text-input"
                type="date"
                value={container.returnedAt ?? ''}
                disabled={disabled}
                onChange={(event) => handleChange(container.id, event.target.value)}
                {...getFieldA11yProps(domId, errors[errorKey])}
              />
              {errors[errorKey] ? (
                <small className="field-error" id={getFieldErrorId(domId)} aria-hidden="true">
                  {errors[errorKey]}
                </small>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
