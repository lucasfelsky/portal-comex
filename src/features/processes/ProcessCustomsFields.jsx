import SelectField from '../../components/SelectField'

// F17.3a (D-10 item 2): DUIMP + canal + "Desembaraço concluído em" - JSX
// movido de `ProcessForm.jsx` (renderFlowStep, duplicado maritimo/aereo)
// SEM mudanca de comportamento. Reescrito no F17.3b (Anexo B).
export default function ProcessCustomsFields({ draft, onDraftChange, duimpStatusOptions, channelOptions }) {
  return (
    <>
      <label className="field">
        <span>DUIMP</span>
        <SelectField
          className="text-input"
          value={draft.duimpStatus}
          onChange={(event) => onDraftChange('duimpStatus', event.target.value)}
        >
          <option value="">Selecione o status</option>
          {duimpStatusOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </SelectField>
      </label>
      {draft.duimpStatus === 'Parametrizada' ? (
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
      {draft.duimpStatus === 'Parametrizada' && draft.parameterizationChannel ? (
        <label className="field">
          <span>Desembaraço concluído em</span>
          <input
            className="text-input"
            type="datetime-local"
            value={draft.clearanceCompletedAt}
            onChange={(event) => onDraftChange('clearanceCompletedAt', event.target.value)}
          />
          <small className="field-hint">
            {draft.parameterizationChannel === 'Verde'
              ? 'Opcional no canal Verde (libera a coleta sozinho).'
              : 'Obrigatório para liberar a coleta neste canal.'}
          </small>
        </label>
      ) : null}
    </>
  )
}
