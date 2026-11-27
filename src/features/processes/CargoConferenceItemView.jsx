import Icon from '../../components/Icon'
import { cargoRowPallets, hasCargoRowIssue, readCargoRowIssue } from './cargoConferenceIssues'
import { isCargoRowConferred } from './cargoConferenceModel'
import { summarizeCargoConferenceItem } from './cargoConferenceItems'
import CargoConferenceLotCard from './CargoConferenceLotCard'

// Conferência por item (Fatia A): tela do item (mock v5). Faixa com voltar, nome da SQ (quebra linha), "Item i de N", o
// nome do fornecedor, a barra, "d de n lotes conferidos · Cód. X" e os pallets do item; depois a nota de papel
// (`notice`: nota + aviso do Salvar, montados pela tela) e um cartão por lote. Sem abas. Apresentação: o estado vive na
// tela (`useCargoConferenceScreen`).
//   position = { index, total }; `cards` = tudo que o cartão precisa (conferência, `derived` por linha, ações, fotos).

function lotsWord(count) {
  return count === 1 ? 'lote conferido' : 'lotes conferidos'
}

export default function CargoConferenceItemView({ item, position, cards, notice, onBack }) {
  const { conference, derived, awaitingCount, editable, photoTools, idPrefix, detailsOpen, actions } = cards
  const summary = summarizeCargoConferenceItem(item, conference)
  const palletsWord = summary.pallets === 1 ? 'pallet' : 'pallets'

  return (
    <>
      <div className="ccf-strip">
        <div className="ccf-strip__row">
          <button type="button" className="ccf-iconbtn" aria-label="Voltar aos itens" onClick={onBack}>
            <Icon name="chevron-left" size={20} strokeWidth={2} />
          </button>
          <h2 className="ccf-strip__title ccf-strip__title--wrap">{item.name}</h2>
          <span className="ccf-badge">{`Item ${position.index} de ${position.total}`}</span>
        </div>
        {item.supplierName ? (
          <p className="ccf-supname">
            Nome no fornecedor: <b>{item.supplierName}</b>
          </p>
        ) : null}
        <span className="ccf-bar" aria-hidden="true">
          <i style={{ width: `${summary.percent}%` }} />
        </span>
        <p className="ccf-sub">
          <b>{summary.done}</b> de {summary.total} {lotsWord(summary.total)}
          {item.code ? ` · Cód. ${item.code}` : ''}
        </p>
        <p className="ccf-pallets">
          <span>{`${summary.pallets} ${palletsWord}`}</span>
        </p>
      </div>

      {notice}

      {item.lots.map(({ row, rowIndex, title, differentName }) => (
        <CargoConferenceLotCard
          key={row.id}
          row={row}
          number={rowIndex + 1}
          title={title}
          derived={derived[rowIndex]}
          differentName={differentName}
          ok={conference.okByRowId?.[row.id]}
          conferred={isCargoRowConferred(conference, row.id)}
          pallets={cargoRowPallets(conference, row.id)}
          issue={readCargoRowIssue(conference, row.id)}
          hasIssue={hasCargoRowIssue(conference, row.id)}
          labels={conference.labelsByRowId?.[row.id]}
          awaitingCount={awaitingCount}
          editable={editable}
          photoTools={photoTools}
          idPrefix={`${idPrefix}-r${rowIndex}`}
          open={detailsOpen[row.id]}
          onToggleDetails={actions.toggleDetails}
          onToggleOk={actions.toggleOk}
          onStepPallets={actions.stepPallets}
          onIssueChange={actions.setIssue}
          onLabelChange={actions.setLabel}
          onPin={actions.pin}
        />
      ))}
    </>
  )
}
