import { useId } from 'react'
import Icon from '../../components/Icon'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'
import CargoNfListField from './CargoNfListField'
import {
  CARGO_REPORT_LIMITS,
  RECEIPT_STATUS_OPTIONS,
  cargoDatePart,
  computeCargoUnloadMinutes,
  resolveCargoReceivedDate,
} from './cargoReportFormModel'
import { formatCargoDateBr } from './cargoReportSheet'

// S9-F do Relatório de Carga: aba "Recebimento" da conferência no celular (mock aprovado). Os mesmos campos do card
// "Responsáveis e recebimento" do computador, em cartões de uma coluna: Conferido por (fixo), Status do recebimento em
// 3 botões, início e fim da descarga, Tempo total e Data de recebimento (fixos), Etiquetagem OK, Notas fiscais
// (`CargoNfListField`, a lista em chips da S9-E) e Observações. `canEdit`: só a logística com a conferência aberta.

function FixedValue({ label, children, locked = true }) {
  return (
    <div className="ccf-field">
      <span className="ccf-label">{label}</span>
      <div className="ccf-fixed">
        {locked ? <Icon name="lock" size={14} /> : null}
        <span>{children}</span>
      </div>
    </div>
  )
}

function DateTimeField({ label, value, onChange, disabled, error, min }) {
  const id = useId()
  return (
    <div className="ccf-field">
      <label className="ccf-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...getFieldA11yProps(id, error)}
        type="datetime-local"
        step={60}
        min={min || undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <small className="field-error" id={getFieldErrorId(id)}>
          {error}
        </small>
      ) : null}
    </div>
  )
}

export default function CargoConferenceReceiptPanel({
  conference,
  onChange,
  canEdit,
  checkedBy = '',
  isAdmin = false,
  unloadErrors = { start: '', end: '' },
}) {
  const notesId = useId()
  const statusLabelId = useId()
  const hasUnloadError = Boolean(unloadErrors.start || unloadErrors.end)
  // Com erro (fim sem início, fim antes do início, mais de 24 h) o tempo total fica vazio.
  const totalMinutes = hasUnloadError ? null : computeCargoUnloadMinutes(conference.unloadStartAt, conference.unloadEndAt)
  const receivedDate = formatCargoDateBr(resolveCargoReceivedDate(conference))
  const checkedByText = checkedBy || conference.checkedByName || (isAdmin ? '(logística)' : '—')

  return (
    <div className="ccf-panel">
      <section className="ccf-card" aria-label="Recebimento">
        <h3>Recebimento</h3>
        <FixedValue label="Conferido por">
          {checkedByText}
          <span className="ccf-fixed__note">fixo</span>
        </FixedValue>

        <div className="ccf-field">
          <span className="ccf-label" id={statusLabelId}>
            Status do recebimento
          </span>
          <div className="ccf-toggles ccf-toggles--three" role="group" aria-labelledby={statusLabelId}>
            {RECEIPT_STATUS_OPTIONS.map((option) => (
              <button
                key={option.value || 'none'}
                type="button"
                className="ccf-toggle ccf-toggle--small"
                aria-pressed={conference.receiptStatus === option.value}
                disabled={!canEdit}
                onClick={() => onChange({ receiptStatus: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <DateTimeField
          label="Início da descarga"
          value={conference.unloadStartAt}
          disabled={!canEdit}
          error={unloadErrors.start}
          onChange={(value) => onChange({ unloadStartAt: value, receivedDate: cargoDatePart(value) })}
        />
        <DateTimeField
          label="Fim da descarga"
          value={conference.unloadEndAt}
          min={conference.unloadStartAt}
          disabled={!canEdit}
          error={unloadErrors.end}
          onChange={(value) => onChange({ unloadEndAt: value })}
        />

        <div className="ccf-pair">
          <FixedValue label="Tempo total" locked={false}>
            {totalMinutes === null ? '—' : `${totalMinutes} min`}
          </FixedValue>
          <FixedValue label="Data de recebimento">{receivedDate || '—'}</FixedValue>
        </div>

        <div className="ccf-field">
          <span className="ccf-label">Etiquetagem</span>
          <button
            type="button"
            className="ccf-toggle"
            aria-pressed={conference.labelingOk === true}
            disabled={!canEdit}
            onClick={() => onChange({ labelingOk: !conference.labelingOk })}
          >
            {conference.labelingOk === true ? <Icon name="check" size={18} strokeWidth={2.4} /> : null}
            Etiquetagem OK
          </button>
        </div>
      </section>

      <section className="ccf-card" aria-label="Notas fiscais">
        <h3>Notas fiscais</h3>
        <p className="ccf-sub">Digite o número e toque em Adicionar. No consolidado, pode haver várias.</p>
        <CargoNfListField
          variant="mobile"
          value={conference.nfNumber}
          disabled={!canEdit}
          onChange={(next) => onChange({ nfNumber: next })}
        />
      </section>

      <section className="ccf-card" aria-labelledby={notesId}>
        <h3 id={notesId}>Observações</h3>
        <textarea
          aria-labelledby={notesId}
          value={conference.notes}
          maxLength={CARGO_REPORT_LIMITS.notes}
          disabled={!canEdit}
          placeholder="Avarias, divergências, o que mais a Qualidade precisa saber"
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </section>
    </div>
  )
}
