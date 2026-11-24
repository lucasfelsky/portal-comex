import { useEffect, useRef, useState } from 'react'
import { CARGO_REPORT_LIMITS, CARGO_REPORT_MAX_ROWS, formatCargoNumber } from './cargoReportFormModel'

// S3 do Relatório de Carga: itens do FR.CMX.001. Desktop = tabela de 14 colunas (modelo R5);
// demais variantes = 1 cartão por linha (sem rolagem horizontal). Componente de apresentação:
// quem calcula (`derived`), valida (`errorsByCell`) e grava é o `CargoReportForm`.
// Modos: `edit` (COMEX digita), `confer` (logística marca OK? e contagem e digita as etiquetas WMS/SQ),
// `view` (somente leitura).
const MAX_FREE_ROWS = 3

// Coluna LOTE SQ (calculada): o `<col>` acompanha o maior lote da tela; com `table-layout: fixed` uma
// largura fixa cortaria o valor. `1ch` é a largura do "0" da fonte normal; o fator dá folga para negrito
// e letras largas (G, O, W, M).
const LOT_SQ_MIN_CHARS = 13
const LOT_SQ_MAX_CHARS = 40
const LOT_SQ_CH_PER_CHAR = 1.3
const LOT_SQ_PADDING_PX = 20

// Rótulos de acessibilidade das colunas editáveis ("<coluna> da linha N").
const FIELD_LABELS = {
  po: 'PO / processo',
  dbcorpCode: 'Cód. DBCorp',
  supplierDescription: 'Descrição fornecedor',
  sqDescription: 'Descrição SQ',
  supplierLot: 'Lote fornecedor',
  quantityKg: 'Qtd (kg)',
  packageWeightKg: 'Peso da emb.',
}

// Etiquetas são da logística (doc `conference`), não das linhas do COMEX.
const LABEL_FIELDS = [
  { key: 'wms', column: 'wmsLabel', label: 'Etiqueta WMS' },
  { key: 'sq', column: 'sqLabel', label: 'Etiqueta SQ' },
]

const NUMERIC_FIELDS = new Set(['quantityKg', 'packageWeightKg'])

// S7: etiqueta WMS/SQ sempre em MAIÚSCULAS (o estado é a verdade; sem `text-transform` em CSS). Escreve o valor
// convertido no próprio campo ANTES de o React ver o novo estado e restaura a seleção: com o DOM já igual ao
// estado, o React não mexe no valor e o cursor não pula para o fim ao editar no meio do texto. Durante a
// composição (IME, acento morto) repassa o valor cru; `onCompositionEnd` e `onBlur` reaplicam a conversão.
function handleUpperChange(event, commit) {
  const input = event.target
  const value = input.value
  if (event.nativeEvent?.isComposing) {
    commit(value)
    return
  }
  const upper = value.toLocaleUpperCase('pt-BR')
  if (upper !== value) {
    const start = input.selectionStart
    const end = input.selectionEnd
    input.value = upper
    if (typeof start === 'number' && typeof end === 'number') {
      input.setSelectionRange(Math.min(start, upper.length), Math.min(end, upper.length))
    }
  }
  commit(upper)
}

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
  { key: 'countOk', label: 'CONTAGEM', width: 86 },
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
    return formatCargoNumber(value, { maxDecimals: 3 })
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

// Largura do `<col>` LOTE SQ em `ch`, pelo maior lote SQ da tela (mínimo 13 caracteres, máximo 40).
function lotSqColumnWidth(derived) {
  const longest = derived.reduce((max, item) => Math.max(max, String(item?.lotSq ?? '').length), 0)
  const chars = Math.min(LOT_SQ_MAX_CHARS, Math.max(LOT_SQ_MIN_CHARS, longest))
  return `calc(${(chars * LOT_SQ_CH_PER_CHAR).toFixed(1)}ch + ${LOT_SQ_PADDING_PX}px)`
}

// Mesma caixinha para OK? e Contagem; `label` já vem pronto ("OK? da linha N" / "Contagem da linha N").
function OkMark({ label, checked, interactive, onToggle }) {
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

function DesktopTable({
  rows,
  derived,
  okByRowId,
  countOkByRowId,
  labelsByRowId,
  mode,
  onChangeRow,
  onChangeLabel,
  onToggleOk,
  onToggleCountOk,
  onAddRow,
  canAddRow,
  errorsByCell,
  onRequestFocus,
}) {
  const isEdit = mode === 'edit'
  const isConfer = mode === 'confer'
  const lotSqWidth = lotSqColumnWidth(derived)
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

  function renderLabelCell(row, index, column) {
    const field = LABEL_FIELDS.find((item) => item.column === column.key)
    const value = labelsByRowId?.[row.id]?.[field.key] ?? ''
    return (
      <td key={column.key}>
        {isConfer ? (
          <input
            className="c"
            type="text"
            value={value}
            maxLength={CARGO_REPORT_LIMITS.text}
            aria-label={`${field.label} da linha ${index + 1}`}
            onChange={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, field.key, next))}
            onCompositionEnd={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, field.key, next))}
            onBlur={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, field.key, next))}
          />
        ) : (
          <span className="crf-text">{value.toLocaleUpperCase('pt-BR') || '—'}</span>
        )}
      </td>
    )
  }

  function renderCell(row, index, column) {
    const info = derived[index] ?? { lotSq: '', netWeightKg: null, packages: null, alerts: {} }
    const { alerts } = info
    const errorMessage = errorsByCell?.[`${row.id}:${column.key}`]

    if (column.key === 'ok') {
      return (
        <td key={column.key} className={`okcol${isConfer ? ' okcol-edit' : ''}`}>
          <OkMark
            label={`OK? da linha ${index + 1}`}
            checked={okByRowId?.[row.id] === true}
            interactive={isConfer}
            onToggle={() => onToggleOk(row.id)}
          />
        </td>
      )
    }

    if (column.key === 'countOk') {
      return (
        <td key={column.key} className={`okcol${isConfer ? ' okcol-edit' : ''}`}>
          <OkMark
            label={`Contagem da linha ${index + 1}`}
            checked={countOkByRowId?.[row.id] === true}
            interactive={isConfer}
            onToggle={() => onToggleCountOk(row.id)}
          />
        </td>
      )
    }

    if (column.key === 'wmsLabel' || column.key === 'sqLabel') return renderLabelCell(row, index, column)

    if (column.key === 'lotSq') {
      // Até 40 caracteres a coluna cresce e o valor fica em 1 linha; acima disso quebra, mas nunca corta.
      const classes = ['calc', 'lotsq']
      if (!info.lotSq) classes.push('empty')
      if (info.lotSq.length > LOT_SQ_MAX_CHARS) classes.push('is-long')
      return (
        <td key={column.key} className={classes.join(' ')}>
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
            <col key={column.key} style={{ width: column.key === 'lotSq' ? lotSqWidth : `${column.width}px` }} />
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

function MobileCard({
  row,
  index,
  info,
  ok,
  countOk,
  labels,
  mode,
  onChangeRow,
  onChangeLabel,
  onToggleOk,
  onToggleCountOk,
  errorsByCell,
}) {
  const isEdit = mode === 'edit'
  const isConfer = mode === 'confer'
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

  function renderLabelField({ key, label }) {
    const value = labels?.[key] ?? ''
    if (!isConfer) return <span className="crf-text">{value.toLocaleUpperCase('pt-BR') || '—'}</span>
    return (
      <input
        type="text"
        value={value}
        maxLength={CARGO_REPORT_LIMITS.text}
        aria-label={`${label} da linha ${rowNumber}`}
        onChange={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, key, next))}
        onCompositionEnd={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, key, next))}
        onBlur={(event) => handleUpperChange(event, (next) => onChangeLabel(row.id, key, next))}
      />
    )
  }

  // Mesmo selo "OK" / "Sem OK" para OK? e Contagem; botão só na conferência da logística.
  function renderOkBadge(checked, label, onToggle) {
    const badgeClass = checked ? 'inline-badge inline-badge--ok' : 'inline-badge documents-badge--neutral'
    if (!isConfer) return <span className={badgeClass}>{checked ? 'OK' : 'Sem OK'}</span>
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={`${badgeClass} crf-rc__ok`}
        onClick={onToggle}
      >
        {checked ? 'OK' : 'Sem OK'}
      </button>
    )
  }

  return (
    <div className={`crf-rc${hasAnyAlert(alerts) ? ' warn' : ''}`} data-row-index={index}>
      <div className="crf-rc__top">
        <div>
          <b>{title}</b>
          {reference ? <small>{reference}</small> : null}
        </div>
        {renderOkBadge(ok, `OK? da linha ${rowNumber}`, () => onToggleOk(row.id))}
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
        {LABEL_FIELDS.map((field) => (
          <div key={field.key} className="crf-pair">
            <span className="crf-pair__label">{field.label}</span>
            {renderLabelField(field)}
          </div>
        ))}
        <div className="crf-pair">
          <span className="crf-pair__label">Qtd (kg)</span>
          {renderField('quantityKg')}
        </div>
        <div className="crf-pair">
          <span className="crf-pair__label">Contagem</span>
          {renderOkBadge(countOk, `Contagem da linha ${rowNumber}`, () => onToggleCountOk(row.id))}
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
  countOkByRowId,
  labelsByRowId,
  mode = 'view',
  variant,
  onChangeRow,
  onChangeLabel,
  onToggleOk,
  onToggleCountOk,
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
          countOkByRowId={countOkByRowId}
          labelsByRowId={labelsByRowId}
          mode={mode}
          onChangeRow={onChangeRow}
          onChangeLabel={onChangeLabel}
          onToggleOk={onToggleOk}
          onToggleCountOk={onToggleCountOk}
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
          countOk={countOkByRowId?.[row.id] === true}
          labels={labelsByRowId?.[row.id]}
          mode={mode}
          onChangeRow={onChangeRow}
          onChangeLabel={onChangeLabel}
          onToggleOk={onToggleOk}
          onToggleCountOk={onToggleCountOk}
          errorsByCell={errorsByCell}
        />
      ))}
    </div>
  )
}
