import { Fragment, useRef } from 'react'
import Icon from '../../components/Icon'
import CargoConferenceSearchBar from './CargoConferenceSearchBar'
import { foldCargoSearchText, matchCargoConferenceItem, summarizeCargoConferenceItem } from './cargoConferenceItems'
import useCargoStickyStuck from './useCargoStickyStuck'

// Conferência por item (Fatia A): aba Itens da tela do celular. Só os itens (nome da SQ, "N lotes · d conferidos", barra
// fina e selos), com a busca no topo (sticky opaco, R-STICKY), "Marcar todos OK" e "Só pendentes" (a busca e o filtro
// valem juntos). Tocar no item abre a tela do item. Apresentação: o estado da busca e do filtro vive na tela.
//   model = buildCargoConferenceItems(...); `pinnedKeys` = itens tocados nesta sessão (o filtro não os esconde).
// Fatia B: os pallets do item incluem os parciais e o item com unidades contadas diferentes do esperado ganha o selo
// "Unidades divergentes" (`expectedUnits` = { [rowId]: Nº de emb. inteiro | null }).

function pluralWord(count, singular, pluralForm) {
  return count === 1 ? singular : pluralForm
}

function ItemRow({ item, summary, by, onOpen }) {
  return (
    <button
      type="button"
      className={`ccf-irow${summary.full ? ' ccf-irow--done' : ''}`}
      aria-label={`Abrir ${item.name}`}
      onClick={() => onOpen(item)}
    >
      <span className="ccf-irow__main">
        <span className="ccf-irow__title">{item.name}</span>
        {by ? <span className="ccf-irow__hint">{by}</span> : null}
        <span className="ccf-sub">
          {summary.total} {pluralWord(summary.total, 'lote', 'lotes')} · <b>{summary.done}</b>{' '}
          {pluralWord(summary.done, 'conferido', 'conferidos')}
        </span>
        <span className="ccf-bar ccf-bar--sm" aria-hidden="true">
          <i style={{ width: `${summary.percent}%` }} />
        </span>
        <span className="ccf-irow__badges">
          {summary.full ? (
            <span className="ccf-badge ccf-badge--ok">
              <Icon name="check" size={12} strokeWidth={2} />
              Conferido
            </span>
          ) : null}
          <span className="ccf-badge">
            {summary.pallets} {pluralWord(summary.pallets, 'pallet', 'pallets')}
          </span>
          {summary.unitsDivergent ? <span className="ccf-badge ccf-badge--warn">Unidades divergentes</span> : null}
          {summary.hasIssue ? <span className="ccf-badge ccf-badge--danger">Avaria registrada</span> : null}
        </span>
      </span>
      <span className="ccf-irow__go">
        <Icon name="chevron-right" size={22} strokeWidth={2} />
      </span>
    </button>
  )
}

export default function CargoConferenceItemList({
  model,
  conference,
  expectedUnits,
  query,
  onQueryChange,
  canSave,
  onlyPending,
  onOnlyPendingChange,
  onMarkAllOk,
  pinnedKeys,
  onOpen,
}) {
  const wrapRef = useRef(null)
  const stuck = useCargoStickyStuck(wrapRef)
  const hasQuery = foldCargoSearchText(query) !== ''
  const pending = canSave && onlyPending
  const rows = model.items.map((item) => ({
    item,
    summary: summarizeCargoConferenceItem(item, conference, expectedUnits),
    match: matchCargoConferenceItem(item, query),
  }))
  const isVisible = ({ item, summary, match }) =>
    match.ok && !(pending && summary.full && !pinnedKeys.has(item.key))
  const visibleCount = rows.filter(isVisible).length
  const allDone = rows.length > 0 && rows.every((entry) => entry.summary.full)
  
  let content
  if (visibleCount === 0) {
    content = hasQuery ? (
      <>
        <div className="ccf-note ccf-note--warn" role="status">
          {`Nenhum item encontrado para “${query.trim()}”.`}
          {pending ? ' O filtro Só pendentes está ligado.' : ''}
        </div>
        <button type="button" className="secondary-button" onClick={() => onQueryChange('')}>
          <Icon name="close" size={16} strokeWidth={2} />
          Limpar busca
        </button>
      </>
    ) : (
      <div className="ccf-note ccf-note--ok" role="status">
        Todos os itens estão conferidos.
      </div>
    )
  } else {
    content = (
      <>
        {!hasQuery && allDone ? (
          <div className="ccf-note ccf-note--ok" role="status">
            Todos os itens estão conferidos.
          </div>
        ) : null}
        {model.groups.map((group) => {
          const visible = rows.filter((entry) => entry.item.groupId === group.id && isVisible(entry))
          const rowButtons = visible.map((entry) => (
            <ItemRow key={entry.item.key} item={entry.item} summary={entry.summary} by={entry.match.by} onOpen={onOpen} />
          ))
          if (!model.grouped) return <Fragment key={group.id}>{rowButtons}</Fragment>
          // Com a busca, o grupo sem nenhum item achado some; só com o filtro Só pendentes o cabeçalho fica.
          if (hasQuery && visible.length === 0) return null
          const done = group.items.filter((item) => summarizeCargoConferenceItem(item, conference).full).length
          return (
            <section className="ccf-groupblock" key={group.id} aria-label={group.label}>
              <div className="ccf-group">
                {group.label}
                <small>
                  {group.supplier ? `${group.supplier} · ` : ''}
                  {done} de {group.items.length} conferidos
                </small>
              </div>
              {rowButtons}
            </section>
          )
        })}
      </>
    )
  }

  return (
    <>
      <CargoConferenceSearchBar ref={wrapRef} value={query} stuck={stuck} onChange={onQueryChange} />
      {canSave ? (
        <div className="ccf-tools">
          <button type="button" className="secondary-button ccf-markall" onClick={onMarkAllOk}>
            <Icon name="check" size={16} strokeWidth={2.2} />
            Marcar todos OK
          </button>
          <label className="ccf-check">
            <input type="checkbox" checked={onlyPending} onChange={(event) => onOnlyPendingChange(event.target.checked)} />
            Só pendentes
          </label>
        </div>
      ) : null}
      {hasQuery || pending ? (
        <p className="ccf-sub" role="status" aria-live="polite">
          <b>{visibleCount}</b> de {rows.length} {pluralWord(rows.length, 'item', 'itens')}
        </p>
      ) : null}
      {content}
    </>
  )
}
