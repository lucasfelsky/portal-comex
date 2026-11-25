import { useId } from 'react'
import Icon from '../../components/Icon'
import { formatDateTime } from '../../utils/dateFormat'
import { getFieldErrorId } from '../../utils/fieldErrors'
import { formatErpReferenceStamp } from '../erp/erpReference'
import { CargoInfoIcon } from './CargoReportRefreshPanel'
import { SourceMark } from './CargoReportSourceMarks'
import {
  CARGO_REPORT_LIMITS,
  CARGO_STAGE,
  CARGO_TYPE_OPTIONS,
  formatCargoReportTitle,
} from './cargoReportFormModel'

// Cabeçalho do Relatório de Carga (DUIMP, tipo de carga, título, total de pallets da carga e badges de estado),
// extraído do formulário na S9-C. S10-I: "Total de pallets da carga" (só o COMEX em rascunho edita) e, com o COMEX
// fechado, o selo "Pallets: 23 de 25" (· divergente) com a soma da conferência x o total. Em edição (COMEX, estágio 1) mostra também de onde vêm os itens (processo e FUP) e o fornecedor usado nas
// embalagens (somente leitura; só passa a valer na fatia das embalagens por fornecedor).

function pad(value) {
  return String(value).padStart(2, '0')
}

// dd/MM HH:mm no fuso local (getters locais, sem UTC); `null` -> ''.
function formatStamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function firstName(name) {
  return String(name ?? '').trim().split(/\s+/)[0] ?? ''
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(' ')
}

const closedLabel = (area, word, stamp) => (stamp ? `${area}: ${word} em ${stamp}` : `${area}: ${word}`)

// Rótulo e dica ficam fora um do outro: o nome acessível do campo é só o rótulo.
function TextField({ label, value, onChange, disabled, maxLength, hint, inputMode, placeholder, error }) {
  const id = useId()
  const describedBy = [error ? getFieldErrorId(id) : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ')
  return (
    <div className="crf-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
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

// Dica sob "Fonte dos itens": quando o FUP foi importado e quantas linhas ele tem para este pedido.
function buildSourceHint({ fupInfo, isConsolidated, readError }) {
  if (readError) return 'Não foi possível ler o FUP'
  if (!fupInfo.hasFup) return 'Sem FUP para este processo'
  const stamp = formatErpReferenceStamp(fupInfo.updatedAtMs, { withTime: true })
  const count = `${fupInfo.itemCount} ${fupInfo.itemCount === 1 ? 'linha' : 'linhas'} deste pedido`
  const imported = stamp ? `FUP importado em ${stamp} (${count})` : `FUP importado (${count})`
  return isConsolidated ? `O Portal liga cada item à PO pelo pedido DBCorp. ${imported}` : imported
}

export default function CargoReportHeaderCard({
  form,
  process,
  stage,
  savedConference,
  isNew,
  isDesktop,
  canEditFields,
  onPatch,
  source,
  palletsSummary = null,
  expectedError = '',
}) {
  const radioName = useId()
  const cargoTypeHint = form.cargoType ? '' : 'Escolha um tipo'
  const comexStamp = joinParts(formatStamp(form.updatedAt), form.updatedByName ? `por ${firstName(form.updatedByName)}` : '')
  const logisticsStamp = joinParts(
    formatStamp(savedConference.updatedAt),
    savedConference.closedByName ? `por ${savedConference.closedByName}` : ''
  )
  // Selo da soma x total (só quando o COMEX já fechou a parte dele e informou o total).
  const showPallets = stage !== CARGO_STAGE.draft && palletsSummary && palletsSummary.state !== 'semTotal'
  const palletsDiverges = palletsSummary?.state === 'divergente'
  const subtitle = isNew
    ? 'FR.CMX.001 · revisão 005 · Ainda não salvo'
    : `FR.CMX.001 · revisão 005 · salvo em ${formatDateTime(form.updatedAt)}${
        form.updatedByName ? ` por ${form.updatedByName}` : ''
      } · revisão ${form.revision}`

  return (
    <section className="crf-card" aria-label="Cabeçalho do relatório">
      <div className="crf-head">
        <div>
          <h3>{formatCargoReportTitle(form.titleSuffix)}</h3>
          <p className="sub">{subtitle}</p>
        </div>
        <div className="crf-badges">
          {stage === CARGO_STAGE.draft ? (
            <>
              <span className="inline-badge inline-badge--warn">COMEX: Rascunho</span>
              <span className="inline-badge documents-badge--neutral">Logística: Aguardando COMEX</span>
            </>
          ) : (
            <>
              <span className="inline-badge inline-badge--ok">{closedLabel('COMEX', 'Fechado', comexStamp)}</span>
              {stage === CARGO_STAGE.comexClosed ? (
                <span className="inline-badge inline-badge--warn">Logística: Em conferência</span>
              ) : (
                <span className="inline-badge inline-badge--ok">
                  {closedLabel('Logística', 'Fechada', logisticsStamp)}
                </span>
              )}
            </>
          )}
          {showPallets ? (
            <span className={`inline-badge${palletsDiverges ? ' inline-badge--warn' : ' inline-badge--ok'}`}>
              {`Pallets: ${palletsSummary.counted} de ${palletsSummary.expected}${palletsDiverges ? ' · divergente' : ''}`}
            </span>
          ) : null}
          <span className="inline-badge">FR.CMX.001 R5</span>
        </div>
      </div>

      <div className="crf-grid top">
        <div className="crf-field">
          <label htmlFor={`${radioName}-duimp`}>Nº da DUIMP</label>
          <input
            id={`${radioName}-duimp`}
            type="text"
            value={process.duimpNumber ?? ''}
            placeholder="Sem DUIMP no processo"
            aria-describedby={`${radioName}-duimp-hint`}
            disabled
            readOnly
          />
          <span id={`${radioName}-duimp-hint`} className="auto">
            <Icon name="lock" size={12} /> Fixo: vem do processo
          </span>
        </div>

        <div className="crf-field" role="group" aria-label="Tipo de carga">
          <span id={`${radioName}-label`}>Tipo de carga</span>
          <div className="crf-radios" role="radiogroup" aria-labelledby={`${radioName}-label`}>
            {CARGO_TYPE_OPTIONS.map((option) => {
              const selected = form.cargoType === option.value
              return (
                <label key={option.value} className={`crf-radio${selected ? ' on' : ''}${canEditFields ? '' : ' is-disabled'}`}>
                  <input
                    type="radio"
                    name={`${radioName}-cargo-type`}
                    value={option.value}
                    aria-label={option.label}
                    checked={selected}
                    disabled={!canEditFields}
                    onChange={() => onPatch({ cargoType: option.value })}
                  />
                  <i aria-hidden="true" />
                  <span aria-hidden="true">{isDesktop ? option.label : (option.shortLabel ?? option.label)}</span>
                </label>
              )
            })}
          </div>
          <span className="auto muted">{cargoTypeHint}</span>
        </div>

        <TextField
          label="Título no relatório"
          value={form.titleSuffix}
          maxLength={CARGO_REPORT_LIMITS.text}
          disabled={!canEditFields}
          hint="PO / referência do processo"
          onChange={(value) => onPatch({ titleSuffix: value })}
        />

        <TextField
          label="Total de pallets da carga"
          value={form.expectedPallets === null || form.expectedPallets === undefined ? '' : String(form.expectedPallets)}
          maxLength={6}
          inputMode="numeric"
          disabled={!canEditFields}
          placeholder={canEditFields ? '' : 'Não informado'}
          error={expectedError}
          hint={canEditFields ? 'Do romaneio ou packing list. A logística conta por item e o Portal compara a soma.' : ''}
          onChange={(value) => onPatch({ expectedPallets: value })}
        />
      </div>

      {source ? (
        <div className="crf-grid crf-grid--source">
          <div className="crf-field" role="group" aria-labelledby={`${radioName}-source`}>
            <span id={`${radioName}-source`}>Fonte dos itens</span>
            <div className="crf-field__value">
              <SourceMark origin="P" />
              {source.isConsolidated ? 'POs do processo' : 'Processo'}
              {source.fupInfo.hasFup ? (
                <>
                  {' · '}
                  <SourceMark origin="F" />
                  FUP
                </>
              ) : null}
            </div>
            <span className="auto">
              <CargoInfoIcon size={12} /> {buildSourceHint(source)}
            </span>
          </div>

          {!source.isConsolidated ? (
            <div className="crf-field">
              <label htmlFor={`${radioName}-supplier`}>Fornecedor (para as embalagens)</label>
              <input
                id={`${radioName}-supplier`}
                type="text"
                value={source.supplier.name}
                placeholder="Sem fornecedor no processo"
                aria-describedby={`${radioName}-supplier-hint`}
                disabled
                readOnly
              />
              <span id={`${radioName}-supplier-hint`} className="auto">
                <Icon name="lock" size={12} />{' '}
                {source.supplier.via === 'fup' ? 'Fixo: vem do EXPORTADOR do FUP' : 'Fixo: vem do processo'}
                {source.supplier.multiple ? '. Mais de um exportador no FUP' : ''}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
