import { useEffect, useId, useState } from 'react'
import Icon from '../../components/Icon'
import {
  cargoUnloadUnitInfo,
  formatCargoDuration,
  listCargoUnloadUnits,
  readCargoUnloadView,
  summarizeCargoUnload,
  toCargoDateTimeKeyLocal,
} from './cargoConferenceUnload'
import { resolveCargoReceivedDate } from './cargoReportFormModel'
import { formatCargoDateBr, formatCargoDateTimeBr } from './cargoReportSheet'

// Conferência por item (Fatia C): cartão "Descarga por unidade" da aba Recebimento do celular (mock v5). Uma linha para cada
// contêiner do processo (sem contêiner: "Descarga única"), cada uma com o seu Início e o seu Fim (`datetime-local`), o selo de
// estado e "Iniciar agora" / "Finalizar agora". Abaixo, a caixa "Tempo total de descarga" = SOMA das durações das unidades
// FINALIZADAS (em andamento e sem fim ficam de fora, com aviso), o aviso do tempo corrido quando há sobreposição, "Primeiro
// início" e "Data de recebimento" (o dia dele, fixa). O rodapé do FR.CMX.001 NÃO usa a soma: ver `cargoConferenceUnload.js`.
// Unidade fora do processo e "Registro anterior (sem unidade)": horários só leitura e "Remover horários" (D-4/D-5).
// Somente leitura (`editable` falso: conferência fechada ou admin): campos desabilitados e sem botões. O relógio de 1 minuto
// só roda enquanto há unidade em andamento. Props: `conference` (estado da tela), `onChange(unitId, { startAt?, endAt? })`,
// `onStart(unitId)`, `onFinish(unitId)`, `onRemove(unitId)`.

const SUB_UNITS = 'Uma linha para cada contêiner do processo. Cada unidade tem o seu início e o seu fim. Horários de Brasília.'
const SUB_SINGLE = 'Este processo não tem contêineres. A descarga é uma só. Horários de Brasília.'
const CLOCK_MS = 60000

const nowKeyLocal = () => toCargoDateTimeKeyLocal(new Date())

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm
}

function UnitBadge({ info }) {
  if (info.state === 'ok') return <span className="ccf-badge ccf-badge--ok">{formatCargoDuration(info.minutes)}</span>
  if (info.state === 'andamento') {
    return (
      <span className="ccf-badge ccf-badge--info">
        <Icon name="clock" size={12} />
        {`Em andamento · ${formatCargoDuration(info.minutes)} até agora`}
      </span>
    )
  }
  if (info.state === 'semFim') return <span className="ccf-badge ccf-badge--warn">Sem fim informado</span>
  if (info.state === 'erro') return <span className="ccf-badge ccf-badge--danger">Corrigir horários</span>
  return <span className="ccf-badge">Não iniciada</span>
}

function DateTimeField({ label, ariaLabel, value, min, disabled, invalid, describedBy, onChange }) {
  const id = useId()
  return (
    <div className="ccf-field">
      <label className="ccf-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={invalid ? describedBy : undefined}
        type="datetime-local"
        step={60}
        min={min || undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function UnitRow({ unit, entry, info, editable, onChange, onStart, onFinish, onRemove }) {
  const errorId = `${useId()}-error`
  const locked = unit.kind === 'orphan' || unit.kind === 'legado'
  const startAt = entry?.startAt ?? ''
  const endAt = entry?.endAt ?? ''
  const fieldsDisabled = !editable || locked
  const isError = info.state === 'erro'
  return (
    <div className={`ccf-unit${info.state === 'andamento' ? ' ccf-unit--run' : ''}`}>
      <div className="ccf-unit__head">
        <span className="ccf-unit__t">
          {unit.title}
          <small>{unit.subtitle}</small>
        </span>
        <UnitBadge info={info} />
      </div>
      <DateTimeField
        label="Início"
        ariaLabel={`Início da descarga · ${unit.title}`}
        value={startAt}
        disabled={fieldsDisabled}
        invalid={isError && info.field === 'start'}
        describedBy={errorId}
        onChange={(value) => onChange(unit.id, { startAt: value })}
      />
      <DateTimeField
        label="Fim"
        ariaLabel={`Fim da descarga · ${unit.title}`}
        value={endAt}
        min={startAt}
        disabled={fieldsDisabled}
        invalid={isError && info.field === 'end'}
        describedBy={errorId}
        onChange={(value) => onChange(unit.id, { endAt: value })}
      />
      {isError ? (
        <span className="ccf-unit__err" id={errorId} role="alert">
          {info.message}
        </span>
      ) : null}
      {editable && !locked && !startAt ? (
        <div className="ccf-unit__act">
          <button type="button" className="secondary-button ccf-unit__btn" onClick={() => onStart(unit.id)}>
            <Icon name="play" size={16} />
            Iniciar agora
          </button>
        </div>
      ) : null}
      {editable && !locked && startAt && !endAt ? (
        <div className="ccf-unit__act">
          <button type="button" className="secondary-button ccf-unit__btn" onClick={() => onFinish(unit.id)}>
            <Icon name="stop" size={16} />
            Finalizar agora
          </button>
        </div>
      ) : null}
      {editable && locked ? (
        <div className="ccf-unit__act">
          <button type="button" className="secondary-button ccf-unit__btn" onClick={() => onRemove(unit.id)}>
            Remover horários
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FixedValue({ label, locked, children }) {
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

export default function CargoUnloadCard({ process, conference, editable, closed = false, onChange, onStart, onFinish, onRemove }) {
  const view = readCargoUnloadView(conference)
  const units = listCargoUnloadUnits(process, view)
  const [nowKey, setNowKey] = useState(nowKeyLocal)
  const options = { nowKey, closed }
  const summary = summarizeCargoUnload(units, view, options)
  const running = summary.running > 0

  // Relógio de 1 minuto só enquanto há unidade em andamento; o 1º ajuste vem logo depois do início da unidade.
  useEffect(() => {
    if (!running) return undefined
    const update = () => setNowKey(nowKeyLocal())
    const first = setTimeout(update, 0)
    const timer = setInterval(update, CLOCK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [running])

  const finished = summary.finished
  const receivedDate = formatCargoDateBr(resolveCargoReceivedDate(conference))
  const firstStart = formatCargoDateTimeBr(summary.firstStart)

  return (
    <section className="ccf-card" aria-label="Descarga por unidade">
      <h3>Descarga por unidade</h3>
      <p className="ccf-sub">{units.some((unit) => unit.kind === 'container') ? SUB_UNITS : SUB_SINGLE}</p>

      {units.map((unit) => {
        const entry = view[unit.id]
        return (
          <UnitRow
            key={unit.id}
            unit={unit}
            entry={entry}
            info={cargoUnloadUnitInfo(unit, entry, options)}
            editable={editable}
            onChange={onChange}
            onStart={onStart}
            onFinish={onFinish}
            onRemove={onRemove}
          />
        )
      })}

      <div className="ccf-total">
        <span className="ccf-label">Tempo total de descarga</span>
        <b>{finished > 0 ? formatCargoDuration(summary.sumMinutes) : '—'}</b>
        <span className="ccf-sub">
          {`Soma das durações de ${finished} ${plural(finished, 'unidade finalizada.', 'unidades finalizadas.')}`}
        </span>
        {summary.running > 0 ? (
          <span className="ccf-note ccf-note--warn">
            {`${summary.running} ${plural(summary.running, 'unidade em andamento não entra no total.', 'unidades em andamento não entram no total.')} O total é recalculado quando você informar o fim.`}
          </span>
        ) : null}
        {summary.withoutEnd > 0 ? (
          <span className="ccf-note ccf-note--warn">
            {`${summary.withoutEnd} ${plural(summary.withoutEnd, 'unidade ficou sem fim e não entra no total.', 'unidades ficaram sem fim e não entram no total.')}`}
          </span>
        ) : null}
        {summary.overlap ? (
          <span className="ccf-note">
            Há unidades que se sobrepõem. O total soma cada unidade (mão de obra); o tempo corrido, do primeiro início ao último
            fim sem repetir a sobreposição, é de <b>{formatCargoDuration(summary.wallMinutes)}</b>.
          </span>
        ) : null}
      </div>

      <div className="ccf-pair">
        <FixedValue label="Primeiro início">{firstStart || '—'}</FixedValue>
        <FixedValue label="Data de recebimento" locked>
          {receivedDate || '—'}
        </FixedValue>
      </div>
    </section>
  )
}
