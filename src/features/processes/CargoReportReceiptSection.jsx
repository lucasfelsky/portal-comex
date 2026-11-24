import { useId } from 'react'
import Icon from '../../components/Icon'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'
import { CargoOkBadge } from './CargoReportItems'
import {
  CARGO_REPORT_LIMITS,
  RECEIPT_STATUS_OPTIONS,
  cargoDatePart,
  computeCargoUnloadMinutes,
  resolveCargoReceivedDate,
} from './cargoReportFormModel'
import { formatCargoDateBr } from './cargoReportSheet'

// S7 do Relatório de Carga: card "Responsáveis e recebimento". Quem preenche é a logística (doc `conference`):
// Status do recebimento, Nº da NF, Observações e (S8) início/fim da descarga e Etiquetagem OK. "Conferido por" é
// automático e travado (nome de quem salva ou fecha a conferência); para a logística com a conferência aberta
// mostra o próprio nome (prévia), para os demais o nome gravado. S8: "Data de recebimento" é fixa (o dia do
// início da descarga) e "Tempo total da descarga" é calculado; os dois são somente leitura.
// `canEdit`: só a logística com a conferência aberta. Fica fora do CargoReportForm para ele não passar de 900 linhas.

// Rótulo e dica ficam fora um do outro: o nome acessível do campo é só o rótulo.
// Padrão replicado do CargoReportForm (não é util compartilhado).
// `error`: mensagem inline (`small.field-error`) ligada ao campo por aria-invalid e aria-describedby.
function TextField({ label, value, onChange, disabled, maxLength, hint, type = 'text', placeholder, error, min, step }) {
  const id = useId()
  return (
    <div className="crf-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...getFieldA11yProps(id, error, hint ? [`${id}-hint`] : [])}
        type={type}
        value={value}
        maxLength={maxLength}
        min={min}
        step={step}
        disabled={disabled}
        readOnly={onChange ? undefined : true}
        placeholder={placeholder}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {error ? (
        <small className="field-error" id={getFieldErrorId(id)}>
          {error}
        </small>
      ) : null}
      {hint ? (
        <span id={`${id}-hint`} className="auto">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export default function CargoReportReceiptSection({
  conference,
  onChange,
  canEdit,
  checkedByPreview = '',
  radioName,
  unloadErrors = { start: '', end: '' },
}) {
  const checkedBy = checkedByPreview || conference.checkedByName || ''
  const hasUnloadError = Boolean(unloadErrors.start || unloadErrors.end)
  // Com erro (fim sem início, fim antes do início, mais de 24 h) o tempo total fica vazio.
  const totalMinutes = hasUnloadError ? null : computeCargoUnloadMinutes(conference.unloadStartAt, conference.unloadEndAt)

  return (
    <section className="crf-card" aria-label="Responsáveis e recebimento">
      <h3>Responsáveis e recebimento</h3>
      <p className="sub">
        Preenchido pela logística. &quot;Conferido por&quot;, &quot;Data de recebimento&quot; e o tempo total da descarga são
        automáticos. A data de conclusão é preenchida ao fechar.
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
          label="Nº da NF"
          value={conference.nfNumber}
          maxLength={CARGO_REPORT_LIMITS.nf}
          disabled={!canEdit}
          onChange={(value) => onChange({ nfNumber: value })}
        />
        <TextField
          label="Data de recebimento"
          value={formatCargoDateBr(resolveCargoReceivedDate(conference))}
          disabled
          placeholder="—"
          hint={
            <>
              <Icon name="lock" size={12} /> Fixo: dia da descarga
            </>
          }
        />
      </div>
      <div className="crf-foot" role="group" aria-label="Descarga e etiquetagem">
        <TextField
          label="Início da descarga"
          type="datetime-local"
          step={60}
          value={conference.unloadStartAt}
          disabled={!canEdit}
          error={unloadErrors.start}
          hint="Data e hora (horário de Brasília)."
          onChange={(value) => onChange({ unloadStartAt: value, receivedDate: cargoDatePart(value) })}
        />
        <TextField
          label="Fim da descarga"
          type="datetime-local"
          step={60}
          min={conference.unloadStartAt || undefined}
          value={conference.unloadEndAt}
          disabled={!canEdit}
          error={unloadErrors.end}
          onChange={(value) => onChange({ unloadEndAt: value })}
        />
        <TextField
          label="Tempo total da descarga"
          value={totalMinutes === null ? '' : `${totalMinutes} min`}
          disabled
          placeholder="—"
          hint={
            <>
              <Icon name="lock" size={12} /> Calculado: fim menos início.
            </>
          }
        />
        <div className="crf-field">
          <span>Etiquetagem</span>
          <CargoOkBadge
            checked={conference.labelingOk === true}
            label="Etiquetagem"
            interactive={canEdit}
            onToggle={() => onChange({ labelingOk: !conference.labelingOk })}
          />
          <span className="auto">Marque quando as etiquetas estiverem coladas.</span>
        </div>
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
