import { useId } from 'react'
import ErpHint from '../erp/ErpHint'
import { getItemDangerousGoodsLabel } from './operationalOptions'
import { getProcessTitle } from './processLabels'

// Refino visual F4c — abas "Itens" e "Item relacionado" (Processo.dc.html), arvore
// DESKTOP. Presentacional: o ProcessDetailView passa a lista filtrada, o indice de
// documentos (FISPQ) e os avisos de quantidade do ERP. Cada linha continua um botao
// que abre a aba "Item relacionado"; o aviso do ERP fica FORA do botao (botao
// aninhado e' invalido), no wrapper `pdv-items__entry`.

export function formatItemQuantity(value) {
  const number = Number(value)
  return Number.isFinite(number) && value !== '' && value != null ? number.toLocaleString('pt-BR') : String(value ?? '')
}

export function ProcessItemsDesktop({
  items,
  totalItemsCount,
  isConsolidated,
  documentIndex,
  quantityHintByItem,
  searchTerm,
  onSearchTermChange,
  onOpenRelatedItem,
  sectionRef,
}) {
  const searchId = useId()
  return (
    <div ref={sectionRef} className="pdv-section pdv-items">
      <div className="pdv-items__head">
        <div className="pdv-items__titles">
          <h3 className="pdv-section__title pdv-items__title">Itens do processo</h3>
          <p className="pdv-items__sub">Itens comerciais vinculados diretamente a este processo.</p>
        </div>
        <span className="inline-badge pdv-items__count">{items.length === 1 ? '1 item' : `${items.length} itens`}</span>
        <label className="pdv-items__search" htmlFor={searchId}>
          <span>Buscar item</span>
          <input
            id={searchId}
            className="text-input"
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Digite o nome comercial do item"
          />
        </label>
      </div>
      <div className="pdv-items__list">
        {items.length > 0 ? (
          items.map((item) => {
            const itemHint = quantityHintByItem.get(item)
            const button = (
              <button
                key={item.id}
                type="button"
                className="pdv-item"
                onClick={() => onOpenRelatedItem(item.commercialName)}
              >
                <span className="pdv-item__name">{item.commercialName}</span>
                <span className="pdv-item__field pdv-item__field--qty">
                  Quantidade: <strong>{formatItemQuantity(item.quantity)}</strong>
                </span>
                {isConsolidated && item.poNumber ? (
                  <span className="pdv-item__field pdv-item__field--po">
                    PO: <strong>{item.poNumber}</strong>
                  </span>
                ) : null}
                <span className="pdv-item__tags">
                  {item.dangerousGoods ? (
                    <span className="inline-badge inline-badge--warn">{getItemDangerousGoodsLabel(item)}</span>
                  ) : null}
                  {documentIndex && item.dangerousGoods && item.id ? (
                    documentIndex.fispqItemIds.includes(item.id) ? (
                      <span className="inline-badge inline-badge--ok">FISPQ enviada</span>
                    ) : (
                      <span className="inline-badge inline-badge--warn">FISPQ pendente</span>
                    )
                  ) : null}
                </span>
              </button>
            )
            return itemHint ? (
              <div className="pdv-items__entry" key={item.id}>
                {button}
                <ErpHint hint={itemHint} />
              </div>
            ) : (
              button
            )
          })
        ) : (
          <div className="empty-state" role="status">
            <strong>{totalItemsCount > 0 ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}</strong>
            <p>
              {totalItemsCount > 0
                ? 'Ajuste a busca para localizar outro item deste processo.'
                : 'Os itens vinculados ao processo aparecerão aqui.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function ProcessRelatedItemDesktop({ itemName, relatedProcesses, canSeeName, onOpenProcess }) {
  return (
    <div className="pdv-section pdv-items pdv-items--related">
      <div className="pdv-items__head">
        <div className="pdv-items__titles">
          <h3 className="pdv-section__title pdv-items__title">Chegadas ativas com este item</h3>
          <p className="pdv-items__sub">Item selecionado: {itemName}</p>
        </div>
        <span className="inline-badge pdv-items__count">
          {relatedProcesses.length === 1 ? '1 chegada' : `${relatedProcesses.length} chegadas`}
        </span>
      </div>
      <div className="pdv-items__list">
        {relatedProcesses.length > 0 ? (
          relatedProcesses.map(({ process, quantity }) => (
            <button
              key={`${process.id}-${itemName}`}
              type="button"
              className="pdv-item pdv-item--related"
              onClick={() => onOpenProcess(process)}
            >
              <span className="pdv-item__name">
                <span className="pdv-item__eyebrow">Chegada:</span> {getProcessTitle(process, canSeeName)}
              </span>
              <span className="pdv-item__field pdv-item__field--qty">
                Quantidade: <strong>{formatItemQuantity(quantity)}</strong>
              </span>
            </button>
          ))
        ) : (
          <div className="empty-state" role="status">
            <strong>Nenhuma chegada ativa encontrada</strong>
            <p>Não há chegadas ativas com este item fora do CD no momento.</p>
          </div>
        )}
      </div>
    </div>
  )
}
