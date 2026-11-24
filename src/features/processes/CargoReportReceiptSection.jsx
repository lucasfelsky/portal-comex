import { useId } from 'react'
import Icon from '../../components/Icon'
import { CARGO_REPORT_LIMITS, RECEIPT_STATUS_OPTIONS } from './cargoReportFormModel'

// S7 do Relatório de Carga: card "Responsáveis e recebimento". Quem preenche é a logística (doc `conference`):
// Status do recebimento, Data de recebimento, Nº da NF e Observações. "Conferido por" é automático e travado
// (nome de quem salva ou fecha a conferência); para a logística com a conferência aberta mostra o próprio
// nome (prévia), para os demais o nome gravado.
// `canEdit`: só a logística com a conferência aberta. Fica fora do CargoReportForm para ele não passar de 900 linhas.

// Rótulo e dica ficam fora um do outro: o nome acessível do campo é só o rótulo.
// Padrão replicado do CargoReportForm (não é util compartilhado).
function TextField({ label, value, onChange, disabled, maxLength, hint, type = 'text', placeholder }) {
  const id = useId()
  return (
    <div className="crf-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={onChange ? undefined : true}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {hint ? (
        <span id={`${id}-hint`} className="auto">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export default function CargoReportReceiptSection({ conference, onChange, canEdit, checkedByPreview = '', radioName }) {
  const checkedBy = checkedByPreview || conference.checkedByName || ''

  return (
    <section className="crf-card" aria-label="Responsáveis e recebimento">
      <h3>Responsáveis e recebimento</h3>
      <p className="sub">
        Preenchido pela logística. &quot;Conferido por&quot; é automático. A data de conclusão é preenchida ao fechar.
      </p>
      <div className="crf-foot">
        <TextField
          label="Conferido por"
          value={checkedBy}
          disabled
          placeholder="Definido pela logística"
          hint={
            <>
              <Icon name="lock" size={12} /> Fixo: quem faz a conferência
            </>
          }
        />
        <div className="crf-field">
          <label htmlFor={`${radioName}-receipt`}>Status do recebimento</label>
          <select
            id={`${radioName}-receipt`}
            value={conference.receiptStatus}
            disabled={!canEdit}
            onChange={(event) => onChange({ receiptStatus: event.target.value })}
          >
            {RECEIPT_STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Data de recebimento"
          type="date"
          value={conference.receivedDate}
          disabled={!canEdit}
          onChange={(value) => onChange({ receivedDate: value })}
        />
        <TextField
          label="Nº da NF"
          value={conference.nfNumber}
          maxLength={CARGO_REPORT_LIMITS.nf}
          disabled={!canEdit}
          onChange={(value) => onChange({ nfNumber: value })}
        />
      </div>
      <div className="crf-field crf-field--notes">
        <label htmlFor={`${radioName}-notes`}>Observações</label>
        <textarea
          id={`${radioName}-notes`}
          value={conference.notes}
          maxLength={CARGO_REPORT_LIMITS.notes}
          disabled={!canEdit}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>
    </section>
  )
}
