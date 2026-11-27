import Icon from '../../components/Icon'
import { describeCargoRow } from './cargoConferenceModel'
import CargoConferenceIssueFields from './CargoConferenceIssueFields'
import CargoPalletCounter from './CargoPalletCounter'
import { CARGO_REPORT_LIMITS, formatCargoNumber } from './cargoReportFormModel'
import { handleUpperChange } from './CargoReportItems'

// Conferência por item (Fatia A): cartão de UM lote na tela do item (mock v5). Título "Lote <lote>" ou "Sem lote
// informado", selo "Conferido" (OK? marcado e pelo menos 1 pallet), selos "Sem contagem"/"A contar", "Nome diferente do
// fornecedor" e "Avaria registrada", dados do lote (Qtd, Nº de emb. e o tipo da embalagem, Peso líq. por emb. e Peso da
// emb. com a dica "tara (embalagem vazia)", D-1), botão OK?, contador de pallets INTEIROS e, recolhido, "Etiquetas, fotos e
// avaria" (abre sozinho quando há avaria). Tocar ou focar o cartão avisa `onPin` (o filtro "Só pendentes" não esconde o
// item sob o dedo). Apresentação pura: quem guarda o estado é `useCargoConferenceScreen`. Somente leitura (`editable`
// falso): botões desabilitados, contador só com o número e etiquetas em texto.

export const CARGO_TARE_HINT = 'tara (embalagem vazia)'

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

function kg(value) {
  const text = formatCargoNumber(value, { maxDecimals: 3 })
  return text ? `${text} kg` : '—'
}

// "Peso da emb." é a TARA (D-1): com peso, o valor e a dica pequena; sem peso, "Falta informar" em âmbar e sem a dica.
function PackageWeight({ row, derived }) {
  if (typeof row.packageWeightKg === 'number' && Number.isFinite(row.packageWeightKg)) {
    return (
      <>
        {kg(row.packageWeightKg)}
        <small>{CARGO_TARE_HINT}</small>
      </>
    )
  }
  if (derived?.alerts?.missingPackageWeight) return <span className="ccf-meta__miss">Falta informar</span>
  return '—'
}

export default function CargoConferenceLotCard({
  row,
  number,
  title,
  derived,
  differentName = false,
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
  open,
  onToggleDetails,
  onToggleOk,
  onStepPallets,
  onIssueChange,
  onLabelChange,
  onPin,
}) {
  // "Sem contagem": nunca contado ou zerado (0 pallet); o registro antigo (Contagem OK) conta como contado.
  const uncounted = !(pallets.count >= 1) && !pallets.legacyOk
  // "A contar" (neutro): nunca contado, sem registro antigo, e o COMEX informou o total da carga (#306).
  const toCount = awaitingCount && pallets.count === null && !pallets.legacyOk
  const quantity = typeof row.quantityKg === 'number' ? kg(row.quantityKg) : '—'
  const packages =
    derived?.packages === null || derived?.packages === undefined ? '—' : formatCargoNumber(derived.packages, { maxDecimals: 2 })
  const packagingType = derived?.packaging?.packagingType ?? ''
  const supplierName = String(row.supplierDescription ?? '').trim()
  const detailsOpen = open ?? hasIssue

  return (
    <article
      className={`ccf-lot${conferred ? ' ccf-lot--done' : ''}`}
      aria-label={title}
      onFocus={onPin ? () => onPin(row.id) : undefined}
      onClickCapture={onPin ? () => onPin(row.id) : undefined}
    >
      <div className="ccf-lot__head">
        <h4 className="ccf-lot__title">{title}</h4>
        {conferred ? (
          <span className="ccf-badge ccf-badge--ok">
            <Icon name="check" size={12} strokeWidth={2} />
            Conferido
          </span>
        ) : null}
      </div>

      {uncounted || differentName || hasIssue ? (
        <div className="ccf-item__flags">
          {uncounted ? <span className="ccf-badge">{toCount ? 'A contar' : 'Sem contagem'}</span> : null}
          {differentName ? <span className="ccf-badge ccf-badge--info">Nome diferente do fornecedor</span> : null}
          {hasIssue ? <span className="ccf-badge ccf-badge--danger">Avaria registrada</span> : null}
        </div>
      ) : null}

      {differentName ? (
        <p className="ccf-supname">
          Nome no fornecedor: <b>{supplierName}</b>
        </p>
      ) : null}

      <dl className="ccf-meta">
        <MetaItem label="Qtd">{quantity}</MetaItem>
        <MetaItem label="Nº de emb.">
          {packages}
          {packagingType ? <small>{packagingType}</small> : null}
        </MetaItem>
        <MetaItem label="Peso líq. por emb.">{kg(derived?.netWeightKg)}</MetaItem>
        <MetaItem label="Peso da emb.">
          <PackageWeight row={row} derived={derived} />
        </MetaItem>
      </dl>

      <button
        type="button"
        className="ccf-toggle"
        aria-pressed={ok === true}
        aria-label={`OK? do ${title}`}
        disabled={!editable}
        onClick={() => onToggleOk(row.id)}
      >
        {ok === true ? <Icon name="check" size={18} strokeWidth={2} /> : null}
        OK?
      </button>

      <CargoPalletCounter
        count={pallets.count}
        legacyOk={pallets.legacyOk}
        editable={editable}
        variant="large"
        label="Pallets contados (inteiros)"
        itemLabel={`item ${number}`}
        onStep={(delta) => onStepPallets(row.id, delta)}
      />

      <details
        className="ccf-more"
        open={detailsOpen}
        onToggle={onToggleDetails ? (event) => onToggleDetails(row.id, event.currentTarget.open) : undefined}
      >
        <summary>
          Etiquetas, fotos e avaria
          {hasIssue ? <span className="ccf-badge ccf-badge--danger">Avaria</span> : null}
          <span className="ccf-more__chev">
            <Icon name="chevron-right" size={18} strokeWidth={2} />
          </span>
        </summary>
        <div className="ccf-more__body">
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
        </div>
      </details>
    </article>
  )
}
