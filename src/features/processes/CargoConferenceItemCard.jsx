import Icon from '../../components/Icon'
import { describeCargoRow } from './cargoConferenceModel'
import CargoConferenceIssueFields from './CargoConferenceIssueFields'
import CargoPalletCounter from './CargoPalletCounter'
import { CARGO_REPORT_LIMITS, formatCargoNumber } from './cargoReportFormModel'
import { handleUpperChange } from './CargoReportItems'

// S9-F do Relatório de Carga: cartão de uma linha na conferência do celular (mock aprovado): número, descrição,
// selo "Conferido" (OK? marcado e pelo menos 1 pallet), dados da linha, botão grande OK?, o contador de pallets do
// item (S10-I), as etiquetas WMS/SQ (sempre em MAIÚSCULAS), as fotos (S10-J1b) e a observação de avaria. Selos "A contar"
// (neutro: total do COMEX informado e item ainda sem contagem), "Sem contagem" e "Avaria registrada". Tocar ou focar o
// cartão avisa `onPin` (o filtro "Só pendentes" não o esconde sob o dedo). Apresentação pura: quem guarda o estado é
// `useCargoConferenceScreen`. Somente leitura (`editable` falso): botões desabilitados, contador só com o número e
// etiquetas em texto.

const LABEL_FIELDS = [
  { key: 'wms', label: 'Etiqueta WMS' },
  { key: 'sq', label: 'Etiqueta SQ' },
]

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
  conferred,
  pallets,
  issue,
  hasIssue,
  labels,
  awaitingCount = false,
  editable,
  photoTools = null,
  idPrefix,
  onToggleOk,
  onStepPallets,
  onIssueChange,
  onLabelChange,
  onPin,
}) {
  // "Sem contagem": nunca contado ou zerado (0 pallet); o registro antigo (Contagem OK) conta como contado.
  const uncounted = !(pallets.count >= 1) && !pallets.legacyOk
  // "A contar" (neutro): nunca contado, sem registro antigo, e o COMEX informou o total da carga. Depois de contar,
  // zerar de novo volta ao "Sem contagem"; o "Conferido" e os selos de pallets da faixa seguem como antes.
  const toCount = awaitingCount && pallets.count === null && !pallets.legacyOk
  const quantity = typeof row.quantityKg === 'number' ? `${formatCargoNumber(row.quantityKg, { maxDecimals: 3 })} kg` : '—'
  const packages = derived?.packages === null || derived?.packages === undefined ? '—' : formatCargoNumber(derived.packages, { maxDecimals: 2 })

  return (
    <article
      className={`ccf-item${conferred ? ' ccf-item--done' : ''}`}
      aria-label={`Item ${number}`}
      onFocus={onPin ? () => onPin(row.id) : undefined}
      onClickCapture={onPin ? () => onPin(row.id) : undefined}
    >
      <div className="ccf-item__head">
        <span className="ccf-badge" aria-hidden="true">
          {number}
        </span>
        <h4 className="ccf-item__title">{describeCargoRow(row, number)}</h4>
        {conferred ? (
          <span className="ccf-badge ccf-badge--ok">
            <Icon name="check" size={12} strokeWidth={2.4} />
            Conferido
          </span>
        ) : null}
      </div>

      {hasIssue || uncounted ? (
        <div className="ccf-item__flags">
          {uncounted ? <span className="ccf-badge">{toCount ? 'A contar' : 'Sem contagem'}</span> : null}
          {hasIssue ? <span className="ccf-badge ccf-badge--danger">Avaria registrada</span> : null}
        </div>
      ) : null}

      <dl className="ccf-meta">
        <MetaItem label="Cód. DBCorp">{row.dbcorpCode || '—'}</MetaItem>
        <MetaItem label="Lote fornecedor">{row.supplierLot || '—'}</MetaItem>
        <MetaItem label="Qtd">{quantity}</MetaItem>
        <MetaItem label="Nº de emb.">{packages}</MetaItem>
      </dl>

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

      <CargoPalletCounter
        count={pallets.count}
        legacyOk={pallets.legacyOk}
        editable={editable}
        variant="large"
        itemLabel={`item ${number}`}
        onStep={(delta) => onStepPallets(row.id, delta)}
      />

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

      <CargoConferenceIssueFields
        issue={issue}
        editable={editable}
        itemLabel={`item ${number}`}
        photoProps={photoTools ? { tools: photoTools, rowId: row.id, number, title: describeCargoRow(row, number) } : null}
        onChange={(patch) => onIssueChange(row.id, patch)}
      />
    </article>
  )
}
