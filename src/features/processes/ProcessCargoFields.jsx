import SelectField from '../../components/SelectField'
import ContainersEditor from './ContainersEditor'
import { IMO_CLASS_OPTIONS, isValidUnNumber } from './operationalOptions'

// F17.2a (D-11): carga por modal (containers/pesos) + carga perigosa.
// Regra de import (D-11): so' `./containers` (via ContainersEditor),
// `./operationalOptions`, `SelectField` - categoria comparada por string
// literal (sem importar `processCategories.js`).
export default function ProcessCargoFields({ draft, onDraftChange, disabled = false }) {
  const isFclOrConsolidado = draft.category === 'FCL' || draft.category === 'CONSOLIDADO'
  const isLcl = draft.category === 'LCL'
  const isAereo = draft.category === 'AEREO'
  const unNumberInvalid = draft.dangerousGoods && draft.unNumber && !isValidUnNumber(draft.unNumber)

  return (
    <>
      {isFclOrConsolidado ? (
        <ContainersEditor
          value={draft.containers}
          onChange={(value) => onDraftChange('containers', value)}
          disabled={disabled}
        />
      ) : null}

      {isLcl ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Peso bruto (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.grossWeightKg}
              onChange={(event) => onDraftChange('grossWeightKg', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Cubagem (m³)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.volumeM3}
              onChange={(event) => onDraftChange('volumeM3', event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {isAereo ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Peso bruto (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.grossWeightKg}
              onChange={(event) => onDraftChange('grossWeightKg', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Peso taxado (kg)</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.chargeableWeightKg}
              onChange={(event) => onDraftChange('chargeableWeightKg', event.target.value)}
            />
          </label>
          <label className="field">
            <span>Volumes</span>
            <input
              className="text-input"
              type="number"
              min="0"
              step="1"
              value={draft.packagesQuantity}
              onChange={(event) => onDraftChange('packagesQuantity', event.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="detail-card">
        <span className="detail-label">Carga perigosa</span>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(draft.dangerousGoods)}
            onChange={(event) => onDraftChange('dangerousGoods', event.target.checked)}
          />
          <span>Esta carga é classificada como perigosa (IMDG)?</span>
        </label>
        {draft.dangerousGoods ? (
          <div className="detail-card detail-card--split">
            <label className="field">
              <span>Número ONU</span>
              <input
                className="text-input"
                type="text"
                value={draft.unNumber}
                onChange={(event) => onDraftChange('unNumber', event.target.value)}
                placeholder="Ex.: 1203"
              />
              {unNumberInvalid ? (
                <small className="field-hint">
                  <span className="inline-badge inline-badge--warn">
                    Número ONU deve ter 4 dígitos.
                  </span>
                </small>
              ) : null}
            </label>
            <label className="field">
              <span>Classe IMO</span>
              <SelectField
                className="text-input"
                value={draft.imoClass}
                onChange={(event) => onDraftChange('imoClass', event.target.value)}
              >
                <option value="">Selecione a classe</option>
                {IMO_CLASS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </label>
          </div>
        ) : null}
      </div>
    </>
  )
}
