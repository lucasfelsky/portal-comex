import { getContainerOptionLabel } from './containers'

// F17.4b (B-7, D6): devolucao de vazio - editavel SO pelo admin, no passo
// "Fluxo operacional" do form (FCL/CONSOLIDADO, apos recebimento). Importa
// SO `./containers`.
export default function EmptyReturnFields({ containers, onChange, disabled }) {
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
        {containerList.map((container, index) => (
          <label className="field" key={container.id}>
            <span>{getContainerOptionLabel(container, index)}</span>
            <input
              className="text-input"
              type="date"
              value={container.returnedAt ?? ''}
              disabled={disabled}
              onChange={(event) => handleChange(container.id, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
