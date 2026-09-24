import SelectField from '../../components/SelectField'
import {
  CUSTOMS_INSPECTION_CHANNELS,
  CUSTOMS_REQUIREMENT_CHANNELS,
  hasDuimpRegistrationSignal,
  hasParameterizationSignal,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
} from './arrivalCustoms'

// F17.3a (D-10 item 2): DUIMP + canal + "Desembaraço concluído em" - JSX
// movido de `ProcessForm.jsx` (renderFlowStep, duplicado maritimo/aereo)
// SEM mudanca de comportamento. Reescrito no F17.3b (D-11): DUIMP completa
// (numero + datas de registro/parametrizacao), conferencia aduaneira
// (Amarelo/Vermelho), exigencia/procedimento especial (Cinza) e
// pre-preenchimento do desembaraco no Verde (D-4). O select manual "DUIMP"
// sai - o status passa a ser derivado das datas (`arrivalCustoms.js`).
export default function ProcessCustomsFields({ draft, onDraftChange, channelOptions }) {
  const hasRegistrationSignal = hasDuimpRegistrationSignal(draft)
  const hasParameterization = hasParameterizationSignal(draft)
  const channel = draft.parameterizationChannel
  const isInspectionChannel = CUSTOMS_INSPECTION_CHANNELS.includes(channel)
  const isRequirementChannel = CUSTOMS_REQUIREMENT_CHANNELS.includes(channel)
  const isCinza = channel === 'Cinza'

  return (
    <div className="detail-card">
      <span className="detail-label">Liberação (DUIMP)</span>

      <label className="field">
        <span>Nº da DUIMP</span>
        <input
          className="text-input"
          type="text"
          value={draft.duimpNumber}
          onChange={(event) => onDraftChange('duimpNumber', event.target.value)}
        />
      </label>

      <label className="field">
        <span>Registro da DUIMP (data e hora)</span>
        <input
          className="text-input"
          type="datetime-local"
          value={draft.duimpRegisteredAt}
          onChange={(event) => onDraftChange('duimpRegisteredAt', event.target.value)}
        />
        {isLegacyDuimpRegisteredWithoutDate(draft) ? (
          <small className="field-hint">
            DUIMP registrada sem data (registro antigo) — informe a data e hora.
          </small>
        ) : null}
      </label>

      {hasRegistrationSignal ? (
        <label className="field">
          <span>Parametrização (data e hora)</span>
          <input
            className="text-input"
            type="datetime-local"
            value={draft.parameterizedAt}
            onChange={(event) => onDraftChange('parameterizedAt', event.target.value)}
          />
          {isLegacyParameterizedWithoutDate(draft) ? (
            <small className="field-hint">
              DUIMP parametrizada sem data (registro antigo) — informe a data e hora.
            </small>
          ) : null}
        </label>
      ) : null}

      {hasParameterization ? (
        <label className="field">
          <span>Canal da parametrização</span>
          <SelectField
            className="text-input"
            value={draft.parameterizationChannel}
            onChange={(event) => onDraftChange('parameterizationChannel', event.target.value)}
          >
            <option value="">Selecione o canal</option>
            {channelOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </SelectField>
        </label>
      ) : null}

      {isInspectionChannel ? (
        <label className="field">
          <span>Conferência agendada para</span>
          <input
            className="text-input"
            type="datetime-local"
            value={draft.customsInspectionScheduledAt}
            onChange={(event) => onDraftChange('customsInspectionScheduledAt', event.target.value)}
          />
        </label>
      ) : null}

      {isRequirementChannel ? (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(draft.customsRequirement)}
            onChange={(event) => onDraftChange('customsRequirement', event.target.checked)}
          />
          <span>Exigência?</span>
        </label>
      ) : null}

      {isRequirementChannel && draft.customsRequirement && !isCinza ? (
        <label className="field">
          <span>Descrição da exigência</span>
          <textarea
            className="text-input text-area"
            value={draft.customsRequirementNotes}
            onChange={(event) => onDraftChange('customsRequirementNotes', event.target.value)}
          />
        </label>
      ) : null}

      {isCinza ? (
        <label className="field">
          <span>Procedimento especial (canal Cinza)</span>
          <textarea
            className="text-input text-area"
            value={draft.customsRequirementNotes}
            onChange={(event) => onDraftChange('customsRequirementNotes', event.target.value)}
          />
          <small className="field-hint">Descreva o procedimento especial e, se houver, a exigência.</small>
        </label>
      ) : null}

      {hasParameterization && channel ? (
        <label className="field">
          <span>Desembaraço concluído em</span>
          <input
            className="text-input"
            type="datetime-local"
            value={draft.clearanceCompletedAt}
            onChange={(event) => onDraftChange('clearanceCompletedAt', event.target.value)}
          />
          <small className="field-hint">
            {channel === 'Verde'
              ? 'Pré-preenchido com a data da parametrização — ajuste se o desembaraço foi em outra data.'
              : 'Obrigatório para liberar a coleta neste canal.'}
          </small>
        </label>
      ) : null}
    </div>
  )
}
