import Icon from '../../components/Icon'
import { CARGO_REPORT_LIMITS, formatCargoNumber } from './cargoReportFormModel'
import { handleUpperChange } from './CargoReportItems'

// S9-F do Relatório de Carga: cartão de uma linha na conferência do celular (mock aprovado, sem a câmera): número,
// descrição, selo "Conferido" (OK? e Contagem marcados), dados da linha, botões grandes OK? e Contagem e as
// etiquetas WMS/SQ (sempre em MAIÚSCULAS). Apresentação pura: quem guarda o estado é `useCargoConferenceScreen`.
// Somente leitura (`editable` falso): botões desabilitados e etiquetas em texto.

const LABEL_FIELDS = [
  { key: 'wms', label: 'Etiqueta WMS' },
  { key: 'sq', label: 'Etiqueta SQ' },
]

function describeRow(row, number) {
  return String(row.sqDescription ?? '').trim() || String(row.supplierDescription ?? '').trim() || `Item ${number}`
}

function MetaItem({ label, children }) {
  return (
    <div className="ccf-meta__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function CargoConferenceItemCard({
  row,
  number,
  derived,
  ok,
  countOk,
  labels,
  editable,
  idPrefix,
  onToggleOk,
  onToggleCount,
  onLabelChange,
}) {
  const conferred = ok === true && countOk === true
  const quantity = typeof row.quantityKg === 'number' ? `${formatCargoNumber(row.quantityKg, { maxDecimals: 3 })} kg` : '—'
  const packages = derived?.packages === null || derived?.packages === undefined ? '—' : formatCargoNumber(derived.packages, { maxDecimals: 2 })

  return (
    <article className={`ccf-item${conferred ? ' ccf-item--done' : ''}`} aria-label={`Item ${number}`}>
      <div className="ccf-item__head">
        <span className="ccf-badge" aria-hidden="true">
          {number}
        </span>
        <h4 className="ccf-item__title">{describeRow(row, number)}</h4>
        {conferred ? (
          <span className="ccf-badge ccf-badge--ok">
            <Icon name="check" size={12} strokeWidth={2.4} />
            Conferido
          </span>
        ) : null}
      </div>

      <dl className="ccf-meta">
        <MetaItem label="Cód. DBCorp">{row.dbcorpCode || '—'}</MetaItem>
        <MetaItem label="Lote fornecedor">{row.supplierLot || '—'}</MetaItem>
        <MetaItem label="Qtd">{quantity}</MetaItem>
        <MetaItem label="Nº de emb.">{packages}</MetaItem>
      </dl>

      <div className="ccf-toggles">
        <button
          type="button"
          className="ccf-toggle"
          aria-pressed={ok === true}
          aria-label={`OK? da linha ${number}`}
          disabled={!editable}
          onClick={() => onToggleOk(row.id)}
        >
          {ok === true ? <Icon name="check" size={18} strokeWidth={2.4} /> : null}
          OK?
        </button>
        <button
          type="button"
          className="ccf-toggle"
          aria-pressed={countOk === true}
          aria-label={`Contagem da linha ${number}`}
          disabled={!editable}
          onClick={() => onToggleCount(row.id)}
        >
          {countOk === true ? <Icon name="check" size={18} strokeWidth={2.4} /> : null}
          Contagem
        </button>
      </div>

      {LABEL_FIELDS.map(({ key, label }) => {
        const value = labels?.[key] ?? ''
        const id = `${idPrefix}-${key}`
        if (!editable) {
          return (
            <div className="ccf-field" key={key}>
              <span className="ccf-label">{label}</span>
              <span className="ccf-field__value">{value.toLocaleUpperCase('pt-BR') || '—'}</span>
            </div>
          )
        }
        const change = (event) => handleUpperChange(event, (next) => onLabelChange(row.id, key, next))
        return (
          <div className="ccf-field" key={key}>
            <label className="ccf-label" htmlFor={id}>
              {label}
            </label>
            <input
              id={id}
              type="text"
              value={value}
              maxLength={CARGO_REPORT_LIMITS.text}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${label} da linha ${number}`}
              onChange={change}
              onCompositionEnd={change}
              onBlur={change}
            />
          </div>
        )
      })}
    </article>
  )
}
