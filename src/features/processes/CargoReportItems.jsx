import { useEffect, useRef, useState } from 'react'
import { CARGO_REPORT_LIMITS, CARGO_REPORT_MAX_ROWS, formatCargoNumber } from './cargoReportFormModel'

// S3 do Relatório de Carga: itens do FR.CMX.001. Desktop = tabela de 14 colunas (modelo R5);
// demais variantes = 1 cartão por linha (sem rolagem horizontal). Componente de apresentação:
// quem calcula (`derived`), valida (`errorsByCell`) e grava é o `CargoReportForm`.
// Modos: `edit` (COMEX digita), `confer` (logística só marca o OK?), `view` (somente leitura).
const MAX_FREE_ROWS = 3

// Rótulos de acessibilidade das colunas editáveis ("<coluna> da linha N").
const FIELD_LABELS = {
  po: 'PO / processo',
  dbcorpCode: 'Cód. DBCorp',
  supplierDescription: 'Descrição fornecedor',
  sqDescription: 'Descrição SQ',
  supplierLot: 'Lote fornecedor',
  wmsLabel: 'Etiqueta WMS',
  sqLabel: 'Etiqueta SQ',
  quantityKg: 'Qtd (kg)',
  count: 'Contagem',
  packageWeightKg: 'Peso da emb.',
}

const NUMERIC_FIELDS = new Set(['quantityKg', 'count', 'packageWeightKg'])

const DESKTOP_COLUMNS = [
  { key: 'po', label: 'PO / PROCESSO', width: 96 },
  { key: 'dbcorpCode', label: 'CÓD. DBCORP', width: 92 },
  { key: 'supplierDescription', label: 'DESCRIÇÃO FORNECEDOR', width: 200 },
  { key: 'sqDescription', label: 'DESCRIÇÃO SQ', width: 190 },
  { key: 'ok', label: 'OK?', width: 52 },
  { key: 'supplierLot', label: 'LOTE FORNECEDOR', width: 112 },
  { key: 'lotSq', label: 'LOTE SQ', width: 118, calc: true },
  { key: 'wmsLabel', label: 'ETIQUETA WMS', width: 106 },
  { key: 'sqLabel', label: 'ETIQUETA SQ', width: 106 },
  { key: 'quantityKg', label: 'QTD (KG)', width: 86 },
  { key: 'count', label: 'CONTAGEM', width: 86 },
  { key: 'netWeightKg', label: 'PESO LÍQ. POR EMB.', width: 112, calc: true },
  { key: 'packageWeightKg', label: 'PESO DA EMB.', width: 92 },
  { key: 'packages', label: 'Nº DE EMB.', width: 82, calc: true },
]

function maxLengthFor(field) {
  if (field === 'supplierDescription' || field === 'sqDescription') return CARGO_REPORT_LIMITS.description
  return CARGO_REPORT_LIMITS.text
}

// Número vira texto pt-BR; o que o usuário está digitando (string) fica como está.
function fieldValue(row, field) {
  const value = row[field]
  if (typeof value === 'number') {
    return formatCargoNumber(value, { maxDecimals: field === 'count' ? 0 : 3 })
  }
  return value ?? ''
}

function formatNetWeight(value) {
  return formatCargoNumber(value, { minDecimals: 1, maxDecimals: 3 })
}

function formatPackages(value) {
  return formatCargoNumber(value, { maxDecimals: 2 })
}

function buildAlertText(alerts) {
  const missing = []
  if (alerts?.missingLot) missing.push('lote')
  if (alerts?.missingPackageWeight) missing.push('peso da embalagem')
  return missing.length > 0 ? `Falta ${missing.join(' e ')}` : ''
}

function hasAnyAlert(alerts) {
  return Boolean(alerts && (alerts.missingLot || alerts.missingPackageWeight || alerts.noPackaging))
}

function OkMark({ rowNumber, checked, interactive, onToggle }) {
  const label = `OK? da linha ${rowNumber}`

  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? 0 : -1}
      className={`chk${checked ? ' on' : ''}${interactive ? ' edit' : ''}`}
      onClick={interactive ? onToggle : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault()
                onToggle()
              }
            }
          : undefined
      }
    >
      {checked ? '✓' : ''}
    </span>
  )
}

function DesktopTable({ rows, derived, okByRowId, mode, onChangeRow, onToggleOk, onAddRow, canAddRow, errorsByCell, onRequestFocus }) {
  const isEdit = mode === 'edit'
  const freeRows = canAddRow ? Math.min(MAX_FREE_ROWS, CARGO_REPORT_MAX_ROWS - rows.length) : 0

  function renderInput(row, index, field) {
    const errorMessage = errorsByCell?.[`${row.id}:${field}`]
    if (!isEdit) {
      const text = fieldValue(row, field)
      return <span className="crf-text">{text || '—'}</span>
    }
    return (
      <input
        className="c"
        type="text"
        value={fieldValue(row, field)}
        maxLength={maxLengthFor(field)}
        inputMode={NUMERIC_FIELDS.has(field) ? 'decimal' : undefined}
        aria-label={`${FIELD_LABELS[field]} da linha ${index + 1}`}
        aria-invalid={errorMessage ? true : undefined}
        onChange={(event) => onChangeRow(row.id, field, event.target.value)}
      />
    )
  }

  function renderCell(row, index, column) {
    const info = derived[index] ?? { lotSq: '', netWeightKg: null, packages: null, alerts: {} }
    const { alerts } = info
    const errorMessage = errorsByCell?.[`${row.id}:${column.key}`]

    if (column.key === 'ok') {
      return (
        <td key={column.key} className={`okcol${mode === 'confer' ? ' okcol-edit' : ''}`}>
          <OkMark
            rowNumber={index + 1}
            checked={okByRowId?.[row.id] === true}
            interactive={mode === 'confer'}
            onToggle={() => onToggleOk(row.id)}
          />
        </td>
      )
    }

    if (column.key === 'lotSq') {
      return (
        <td key={column.key} className={`calc${info.lotSq ? '' : ' empty'}`}>
          {info.lotSq || '—'}
        </td>
      )
    }

    if (column.key === 'netWeightKg') {
      return (
        <td key={column.key} className={`calc${info.netWeightKg === null ? ' empty' : ''}`}>
          {info.netWeightKg === null ? '—' : formatNetWeight(info.netWeightKg)}
          {alerts.noPackaging ? <span className="hint r">Sem embalagem cadastrada</span> : null}
        </td>
      )
    }

    if (column.key === 'packages') {
      return (
        <td key={column.key} className={`calc${info.packages === null ? ' empty' : ''}`}>
          {info.packages === null ? '—' : formatPackages(info.packages)}
        </td>
      )
    }

    const classes = []
    if (NUMERIC_FIELDS.has(column.key)) classes.push('num')
    if (column.key === 'supplierLot' && alerts.missingLot) classes.push('warn')
    if (column.key === 'packageWeightKg' && alerts.missingPackageWeight) classes.push('warn')
    if (errorMessage) classes.push('err')

    return (
      <td key={column.key} className={classes.join(' ')}>
        {renderInput(row, index, column.key)}
        {column.key === 'supplierLot' && alerts.missingLot ? <span className="hint">Falta o lote</span> : null}
        {column.key === 'packageWeightKg' && alerts.missingPackageWeight ? (
          <span className="hint">Falta o peso da emb.</span>
        ) : null}
        {errorMessage ? <span className="hint r">{errorMessage}</span> : null}
      </td>
    )
  }

  return (
    <div className="crf-tw">
      <table className="crf">
        <colgroup>
          {DESKTOP_COLUMNS.map((column) => (
            <col key={column.key} style={{ width: `${column.width}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {DESKTOP_COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.calc ? 'calc' : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} data-row-index={index}>
              {DESKTOP_COLUMNS.map((column) => renderCell(row, index, column))}
            </tr>
          ))}
          {Array.from({ length: freeRows }, (_, offset) => (
            <tr key={`free-${offset}`} className="free">
              <td colSpan={DESKTOP_COLUMNS.length}>
                <button
                  type="button"
                  className="crf-free"
                  onClick={() => {
                    onRequestFocus()
                    onAddRow()
                  }}
                >
                  {`Linha ${rows.length + offset + 1} livre · clique para preencher`}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MobileCard({ row, index, info, ok, mode, onChangeRow, onToggleOk, errorsByCell }) {
  const isEdit = mode === 'edit'
  const rowNumber = index + 1
  const alerts = info.alerts ?? {}
  const alertText = buildAlertText(alerts)
  // Aberto só em linha nova (sem identificação); decidido uma vez para não fechar enquanto digita.
  const [identificationOpen] = useState(() => !row.po && !row.dbcorpCode && !row.sqDescription && !row.supplierDescription)
  const title = row.sqDescription || row.supplierDescription || `Item ${rowNumber}`
  const reference = [row.po ? `PO ${row.po}` : '', row.dbcorpCode].filter(Boolean).join(' · ')

  function renderField(field, { className = '', placeholder } = {}) {
    const errorMessage = errorsByCell?.[`${row.id}:${field}`]
    if (!isEdit) return <span className="crf-text">{fieldValue(row, field) || '—'}</span>
    return (
      <>
        <input
          className={`${className}${errorMessage ? ' err' : ''}`.trim()}
          type="text"
          value={fieldValue(row, field)}
          maxLength={maxLengthFor(field)}
          placeholder={placeholder}
          inputMode={NUMERIC_FIELDS.has(field) ? 'decimal' : undefined}
          aria-label={`${FIELD_LABELS[field]} da linha ${rowNumber}`}
          aria-invalid={errorMessage ? true : undefined}
          onChange={(event) => onChangeRow(row.id, field, event.target.value)}
        />
        {errorMessage ? <span className="hint r">{errorMessage}</span> : null}
      </>
    )
  }

  const okBadgeClass = ok ? 'inline-badge inline-badge--ok' : 'inline-badge documents-badge--neutral'

  return (
    <div className={`crf-rc${hasAnyAlert(alerts) ? ' warn' : ''}`} data-row-index={index}>
      <div className="crf-rc__top">
        <div>
          <b>{title}</b>
          {reference ? <small>{reference}</small> : null}
        </div>
        {mode === 'confer' ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={ok}
            aria-label={`OK? da linha ${rowNumber}`}
            className={`${okBadgeClass} crf-rc__ok`}
            onClick={() => onToggleOk(row.id)}
          >
            {ok ? 'OK' : 'Sem OK'}
          </button>
        ) : (
          <span className={okBadgeClass}>{ok ? 'OK' : 'Sem OK'}</span>
        )}
      </div>

      <details className="crf-rc__id" open={identificationOpen}>
        <summary>Identificação do item</summary>
        <div className="crf-rc__id-grid">
          {['po', 'dbcorpCode', 'supplierDescription', 'sqDescription'].map((field) => (
            <div key={field} className="crf-pair">
              <span className="crf-pair__label">{FIELD_LABELS[field]}</span>
              {renderField(field)}
            </div>
          ))}
        </div>
      </details>

      <div className="crf-pairs">
        <div className={`crf-pair${alerts.missingLot ? ' warn' : ''}`}>
          <span className="crf-pair__label">Lote fornecedor</span>
          {renderField('supplierLot', { className: alerts.missingLot ? 'w' : '', placeholder: 'Digite o lote' })}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Lote SQ</span>
          <span className="crf-calc">{info.lotSq || '—'}</span>
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Etiqueta WMS</span>
          {renderField('wmsLabel')}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Etiqueta SQ</span>
          {renderField('sqLabel')}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Qtd (kg)</span>
          {renderField('quantityKg')}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Contagem</span>
          {renderField('count')}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Peso líq. por emb.</span>
          <span className="crf-calc">
            {info.netWeightKg === null ? '—' : `${formatNetWeight(info.netWeightKg)} kg`}
          </span>
        </div>
        <div className={`crf-pair${alerts.missingPackageWeight ? ' warn' : ''}`}>
          <span className="crf-pair__label">Peso da emb.</span>
          {renderField('packageWeightKg', { className: alerts.missingPackageWeight ? 'w' : '', placeholder: 'kg' })}
        </div>
        <div className="crf-pair crf-pair--full">
          <span className="crf-pair__label">Nº de embalagens</span>
          <span className="crf-calc">{info.packages === null ? '—' : formatPackages(info.packages)}</span>
        </div>
      </div>

      {alertText ? <span className="inline-badge inline-badge--warn">{alertText}</span> : null}
      {alerts.noPackaging ? <span className="inline-badge inline-badge--warn">Sem embalagem cadastrada</span> : null}
    </div>
  )
}

export default function CargoReportItems({
  rows,
  derived,
  okByRowId,
  mode = 'view',
  variant,
  onChangeRow,
  onToggleOk,
  onAddRow,
  canAddRow = false,
  errorsByCell,
}) {
  const containerRef = useRef(null)
  const pendingFocusRef = useRef(false)
  const rowCount = rows.length
  const isEdit = mode === 'edit'
  const addAllowed = isEdit && canAddRow

  // Depois de adicionar uma linha, o foco vai para o 1º campo dela.
  useEffect(() => {
    if (!pendingFocusRef.current || rowCount === 0) return
    pendingFocusRef.current = false
    const target = containerRef.current?.querySelector(
      `[data-row-index="${rowCount - 1}"] input:not([disabled])`
    )
    target?.focus()
  }, [rowCount])

  const requestFocus = () => {
    pendingFocusRef.current = true
  }

  if (variant === 'desktop') {
    return (
      <div ref={containerRef}>
        <DesktopTable
          rows={rows}
          derived={derived}
          okByRowId={okByRowId}
          mode={mode}
          onChangeRow={onChangeRow}
          onToggleOk={onToggleOk}
          onAddRow={onAddRow}
          canAddRow={addAllowed}
          errorsByCell={errorsByCell}
          onRequestFocus={requestFocus}
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="crf-mobile">
      <div className="crf-mobile__head">
        <h4>{`Itens (${rowCount} de ${CARGO_REPORT_MAX_ROWS})`}</h4>
        {addAllowed ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              requestFocus()
              onAddRow()
            }}
          >
            Adicionar item
          </button>
        ) : null}
      </div>
      {rows.map((row, index) => (
        <MobileCard
          key={row.id}
          row={row}
          index={index}
          info={derived[index] ?? { lotSq: '', netWeightKg: null, packages: null, alerts: {} }}
          ok={okByRowId?.[row.id] === true}
          mode={mode}
          onChangeRow={onChangeRow}
          onToggleOk={onToggleOk}
          errorsByCell={errorsByCell}
        />
      ))}
    </div>
  )
}
