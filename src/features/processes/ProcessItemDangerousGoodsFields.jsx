import SelectField from '../../components/SelectField'
import { IMO_CLASS_OPTIONS, isValidUnNumber } from './operationalOptions'

// F17.2d-1 (D-4, Q4): bloco de carga perigosa (IMDG) de UM item do
// processo - checkbox + Número ONU (com aviso `isValidUnNumber`) + Classe
// IMO. Regra de import: so' `SelectField` e `./operationalOptions` (mesmo
// padrao de `ProcessCargoFields.jsx`).
export default function ProcessItemDangerousGoodsFields({ item, onChange }) {
  const unNumberInvalid = item?.dangerousGoods && item?.unNumber && !isValidUnNumber(item.unNumber)

  return (
    <div className="detail-card">
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(item?.dangerousGoods)}
          onChange={(event) => onChange('dangerousGoods', event.target.checked)}
        />
        <span>Carga perigosa (IMO)</span>
      </label>
      {item?.dangerousGoods ? (
        <div className="detail-card detail-card--split">
          <label className="field">
            <span>Número ONU</span>
            <input
              className="text-input"
              type="text"
              value={item.unNumber ?? ''}
              onChange={(event) => onChange('unNumber', event.target.value)}
              placeholder="Ex.: 1203"
              aria-describedby={unNumberInvalid ? `process-field-item-${item.id}-unNumber-hint` : undefined}
            />
            {unNumberInvalid ? (
              <small className="field-hint" id={`process-field-item-${item.id}-unNumber-hint`}>
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
              value={item.imoClass ?? ''}
              onChange={(event) => onChange('imoClass', event.target.value)}
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
  )
}
