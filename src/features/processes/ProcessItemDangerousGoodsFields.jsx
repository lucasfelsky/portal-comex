import SelectField from '../../components/SelectField'
import { IMO_CLASS_OPTIONS, isValidUnNumber } from './operationalOptions'

// F17.2d-1 (D-4, Q4): bloco de carga perigosa (IMDG) de UM item do
// processo - switch + Número ONU (com aviso `isValidUnNumber`) + Classe
// IMO. Regra de import: so' `SelectField` e `./operationalOptions` (mesmo
// padrao de `ProcessCargoFields.jsx`).
// UX-6b-2 (D-6): checkbox virou switch (`role="switch"`, ARIA in HTML - o
// estado real continua vindo do `checked` do input nativo). O componente
// devolve um FRAGMENTO (sem `detail-card` externo) - quem monta o
// `.editor-row` e' quem o usa (`ProcessForm.renderItemsStep`). Prop
// opcional `trailing` (node) renderiza ENTRE o switch e a faixa (ordem
// DOM/teclado: switch, trailing, ONU, classe).
export default function ProcessItemDangerousGoodsFields({ item, onChange, trailing = null }) {
  const unNumberInvalid = item?.dangerousGoods && item?.unNumber && !isValidUnNumber(item.unNumber)

  return (
    <>
      <label className="editor-switch">
        <input
          type="checkbox"
          role="switch"
          className="editor-switch__input"
          checked={Boolean(item?.dangerousGoods)}
          onChange={(event) => onChange('dangerousGoods', event.target.checked)}
          aria-label="Carga perigosa (IMO)"
        />
        <span className="editor-switch__track" aria-hidden="true" />
        <span aria-hidden="true">IMO</span>
      </label>
      {trailing}
      {item?.dangerousGoods ? (
        <div className="process-item-editor__imo-band">
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
    </>
  )
}
