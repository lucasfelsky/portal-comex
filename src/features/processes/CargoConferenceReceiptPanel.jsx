import { useId } from 'react'
import Icon from '../../components/Icon'
import { getFieldA11yProps, getFieldErrorId } from '../../utils/fieldErrors'
import CargoNfListField from './CargoNfListField'
import {
  RECEIPT_STATUS_OPTIONS,
  cargoDatePart,
  computeCargoUnloadMinutes,
  resolveCargoReceivedDate,
} from './cargoReportFormModel'
import { formatCargoDateBr } from './cargoReportSheet'

// S9-F do Relatório de Carga: aba "Recebimento" da conferência no celular (mock aprovado). Os mesmos campos do card
// "Responsáveis e recebimento" do computador, em cartões de uma coluna: Conferido por (fixo), Status do recebimento em
// 3 botões, início e fim da descarga, Tempo total e Data de recebimento (fixos), Etiquetagem OK, Notas fiscais
// (`CargoNfListField`, a lista em chips da S9-E) e, desde a S10-I, "Ressalvas e avarias" no lugar do campo geral
// "Observações" (as observações ficam em cada item; `conference.notes` antigo aparece só para leitura). Avaria com status
// diferente de "Com ressalva": nota "Status sugerido" e botão "Usar Com ressalva" (o celular nunca troca sozinho).
// `canEdit`: só a logística com a conferência aberta.

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
  issueItems = [],
  statusSuggestion = null,
}) {
  const statusLabelId = useId()
  const legacyNotes = String(conference.notes ?? '').trim()
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
          {statusSuggestion ? (
            <div className="ccf-note ccf-note--warn" role="status">
              {statusSuggestion.text}
              {canEdit ? (
                <button type="button" className="secondary-button ccf-suggest" onClick={statusSuggestion.onApply}>
                  Usar Com ressalva
                </button>
              ) : null}
            </div>
          ) : null}
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

      <section className="ccf-card" aria-label="Ressalvas e avarias">
        <h3>Ressalvas e avarias</h3>
        {issueItems.length > 0 ? (
          <>
            {issueItems.map((item) => (
              <div className="ccf-note ccf-note--warn" key={item.id}>
                <b>{item.title}</b>
                <br />
                {item.note || '(sem observação)'}
                {item.photoCount > 0 ? (
                  <>
                    <br />
                    <span className="ccf-sub">{item.photoCount === 1 ? '1 foto' : `${item.photoCount} fotos`}</span>
                  </>
                ) : null}
              </div>
            ))}
            <p className="ccf-sub">As observações ficam no lote.</p>
          </>
        ) : (
          <p className="ccf-sub">
            Nenhuma avaria registrada. Para registrar, volte à aba Itens, abra o item e use Etiquetas, fotos e avaria no lote.
          </p>
        )}
        {legacyNotes ? (
          <div className="ccf-field">
            <span className="ccf-label">Observações (registro antigo)</span>
            <p className="ccf-legacy">{legacyNotes}</p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
