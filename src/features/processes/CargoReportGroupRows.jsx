import Icon from '../../components/Icon'
import { CARGO_ORPHAN_GROUP_LABEL, formatCargoKgText, pluralCargoLines } from './cargoReportGroups'
import { purchaseOrderLabel } from './cargoReportRowOps'

// S9-B do Relatório de Carga: cabeçalho e subtotal dos grupos por PO no CONSOLIDADO (tabela do desktop e
// cartões do celular). Só apresentação; `group` vem de `groupCargoRowsByPurchaseOrder`.

function groupLabel(group) {
  return group.purchaseOrder ? purchaseOrderLabel(group.purchaseOrder) : CARGO_ORPHAN_GROUP_LABEL
}

function groupMeta(group) {
  const parts = []
  if (group.purchaseOrder) {
    parts.push(`Pedido DBCorp ${group.purchaseOrder.po}`)
    if (group.purchaseOrder.supplierName) parts.push(group.purchaseOrder.supplierName)
  }
  parts.push(pluralCargoLines(group.rows.length))
  return parts.join(' · ')
}

function GroupHead({ group, canAdd, onAdd }) {
  const label = groupLabel(group)
  return (
    <div className="crf-group__bar">
      <div>
        <div className="crf-group__ref">{label}</div>
        <div className="crf-group__meta">{groupMeta(group)}</div>
      </div>
      {group.purchaseOrder && canAdd ? (
        <button
          type="button"
          className="crf-group__add"
          aria-label={`Linha nesta PO ${label}`}
          onClick={() => onAdd(group.purchaseOrder)}
        >
          <Icon name="plus" size={16} />
          Linha nesta PO
        </button>
      ) : null}
    </div>
  )
}

function summaryContent(group) {
  if (group.rows.length === 0) return <>PO sem itens neste relatório. Use “Linha nesta PO”.</>
  return (
    <>
      Subtotal da PO: <b>{formatCargoKgText(group.totalKg)}</b>
    </>
  )
}

export function GroupHeaderRow({ group, colSpan, canAdd, onAdd }) {
  return (
    <tr className="crf-group">
      <td colSpan={colSpan}>
        <GroupHead group={group} canAdd={canAdd} onAdd={onAdd} />
      </td>
    </tr>
  )
}

export function GroupSummaryRow({ group, colSpan }) {
  return (
    <tr className="crf-gsum">
      <td colSpan={colSpan}>{summaryContent(group)}</td>
    </tr>
  )
}

export function GroupHeaderCard({ group, canAdd, onAdd }) {
  return (
    <div className="crf-group crf-group--card">
      <GroupHead group={group} canAdd={canAdd} onAdd={onAdd} />
    </div>
  )
}

export function GroupSummaryNote({ group }) {
  return <div className="crf-gsum crf-gsum--card">{summaryContent(group)}</div>
}
