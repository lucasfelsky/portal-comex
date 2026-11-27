import Icon from '../../components/Icon'
import { cargoRowPallets, hasCargoRowIssue, readCargoRowIssue } from './cargoConferenceIssues'
import { isCargoRowConferred } from './cargoConferenceModel'
import { summarizeCargoConferenceItem } from './cargoConferenceItems'
import {
  describeCargoPartialCount,
  getCargoRowUnits,
  isCargoRowUnitsDivergent,
  partialPalletsOfRow,
} from './cargoConferenceUnits'
import CargoConferenceLotCard from './CargoConferenceLotCard'

// Conferência por item (Fatia A, e B): tela do item (mock v5). Faixa com voltar, nome da SQ (quebra linha), "Item i de N", o
// nome do fornecedor, a barra, "d de n lotes conferidos · Cód. X" e, Fatia B, os pallets do item ("8 pallets (7 inteiros + 1
// parcial)") e as unidades ("200 de 250 unidades"); depois a nota de papel (`notice`: nota + aviso do Salvar, montados pela
// tela) e um cartão por lote. Sem abas. Apresentação: o estado vive na tela (`useCargoConferenceScreen`).
//   position = { index, total }; `cards` = tudo que o cartão precisa (conferência, `derived` por linha, ações, fotos, o
//   esperado de unidades por linha e `infoByRowId` do outro lote dos pallets parciais).

function lotsWord(count) {
  return count === 1 ? 'lote conferido' : 'lotes conferidos'
}

const formatCount = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })

// "8 pallets (7 inteiros + 1 parcial)": os parciais só aparecem quando existem.
function describePallets(summary) {
  const word = summary.pallets === 1 ? 'pallet' : 'pallets'
  if (summary.partial === 0) return `${summary.pallets} ${word}`
  const whole = summary.whole === 1 ? 'inteiro' : 'inteiros'
  return `${summary.pallets} ${word} (${summary.whole} ${whole} + ${describeCargoPartialCount(summary.partial)})`
}

function describeUnits({ counted, expected }) {
  return expected === null ? `${formatCount(counted)} unidades` : `${formatCount(counted)} de ${formatCount(expected)} unidades`
}

export default function CargoConferenceItemView({ item, position, cards, notice, onBack }) {
  const { conference, derived, expectedUnits, infoByRowId, awaitingCount, editable, photoTools, idPrefix, detailsOpen, actions } = cards
  const summary = summarizeCargoConferenceItem(item, conference, expectedUnits)
  // Pallets parciais do lote com o "outro lote" já descrito (nome e lote); outro lote que saiu do relatório = "pallet incompleto".
  const partialsOf = (rowId) =>
    partialPalletsOfRow(conference, rowId).map((partial) => ({
      id: partial.id,
      mineUnits: partial.mine.units,
      other: partial.other && infoByRowId?.get(partial.other.rowId) ? { units: partial.other.units, ...infoByRowId.get(partial.other.rowId) } : null,
    }))

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
          <span>{describePallets(summary)}</span>
          {summary.units.counted > 0 || summary.units.expected !== null ? <span>{describeUnits(summary.units)}</span> : null}
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
          partials={partialsOf(row.id)}
          units={getCargoRowUnits(conference, row.id)}
          expectedUnits={expectedUnits?.[row.id] ?? null}
          unitsDivergent={isCargoRowUnitsDivergent(getCargoRowUnits(conference, row.id), expectedUnits?.[row.id])}
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
          onSetUnits={actions.setUnits}
          onStepUnits={actions.stepUnits}
          onOpenPartial={actions.openPartial}
          onRemovePartial={actions.removePartial}
          onIssueChange={actions.setIssue}
          onLabelChange={actions.setLabel}
          onPin={actions.pin}
        />
      ))}
    </>
  )
}
