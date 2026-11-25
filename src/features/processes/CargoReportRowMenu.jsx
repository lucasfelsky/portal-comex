import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ActionSheet from '../../components/ActionSheet'
import Icon from '../../components/Icon'
import { CARGO_REPORT_MAX_ROWS } from './cargoReportFormModel'
import { purchaseOrderLabel } from './cargoReportRowOps'

// S9-B do Relatório de Carga: menu ⋯ de cada linha (só COMEX, rascunho aberto).
// Desktop: botão ⋯ + menu `role="menu"` renderizado por portal em `document.body` com `position: fixed`
// (a tabela tem rolagem horizontal e cortaria um menu absoluto). Teclado: ↑/↓ (cíclicas, pulam desabilitados),
// Home/End, → abre o submenu de POs e foca o 1º item habilitado, ← fecha o submenu e volta ao gatilho dele, Esc
// fecha o submenu e depois o menu (foco volta ao ⋯), Tab fecha. Hover abre o submenu. Clique fora, rolagem e
// resize fecham. Celular: o mesmo conteúdo no ActionSheet existente (as POs viram "Mover para <referência>").
//
// `onAction(action, rowId, payload)`: 'above' | 'below' | 'dup' | 'split' | 'up' | 'down' | 'remove' |
// 'toPo' (payload `{ purchaseOrder }`).

const LIMIT_HINT = `Limite de ${CARGO_REPORT_MAX_ROWS} linhas`
const MENU_MARGIN = 8
const SUBMENU_WIDTH = 255
const SUBMENU_ROW_HEIGHT = 58
const SCROLL_GRACE_MS = 250

function buildSections({ canMoveUp, canMoveDown, limitReached, hasQuantity }) {
  const limitHint = limitReached ? LIMIT_HINT : undefined
  const sections = [
    {
      key: 'insert',
      title: 'Inserir',
      items: [
        { key: 'above', label: 'Linha acima', icon: 'arrow-up', disabled: limitReached, hint: limitHint },
        { key: 'below', label: 'Linha abaixo', icon: 'arrow-down', disabled: limitReached, hint: limitHint },
      ],
    },
    {
      key: 'lots',
      title: 'Lotes',
      items: [
        { key: 'dup', label: 'Duplicar (outro lote)', icon: 'copy', disabled: limitReached, hint: limitHint },
        {
          key: 'split',
          label: 'Dividir em lotes…',
          icon: 'split',
          disabled: limitReached || !hasQuantity,
          hint: limitReached ? LIMIT_HINT : hasQuantity ? undefined : 'Informe a Qtd da linha',
        },
      ],
    },
  ]
  const position = []
  if (canMoveUp) position.push({ key: 'up', label: 'Mover para cima', icon: 'arrow-up' })
  if (canMoveDown) position.push({ key: 'down', label: 'Mover para baixo', icon: 'arrow-down' })
  sections.push({ key: 'position', title: 'Posição', items: position })
  return sections
}

function poHint(order, isCurrent) {
  const parts = [String(order?.supplierName ?? '').trim(), `pedido ${order?.po ?? ''}`.trim()].filter(Boolean)
  const text = parts.join(' · ')
  return isCurrent ? `${text} · PO atual` : text
}

export default function CargoReportRowMenu({
  rowId,
  rowNumber,
  mobile = false,
  purchaseOrders = [],
  currentPurchaseOrderIndex = -1,
  canMoveUp = false,
  canMoveDown = false,
  limitReached = false,
  hasQuantity = true,
  onAction,
}) {
  const [open, setOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [subPlacement, setSubPlacement] = useState({ left: false, up: false })
  const menuId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const subWrapRef = useRef(null)
  const subTriggerRef = useRef(null)
  const focusSubRef = useRef(false)
  const label = `Ações da linha ${rowNumber}`
  const hasPurchaseOrders = purchaseOrders.length > 0
  const sections = buildSections({ canMoveUp, canMoveDown, limitReached, hasQuantity })

  const closeAll = useCallback((restoreFocus) => {
    setSubOpen(false)
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Itens habilitados de UM nível (menu principal ou submenu): o `menuitem` pertence ao `role="menu"` mais próximo.
  const levelItems = useCallback(
    (menuNode) =>
      menuNode
        ? [...menuNode.querySelectorAll('[role="menuitem"]')].filter(
            (item) => item.closest('[role="menu"]') === menuNode && !item.disabled
          )
        : [],
    []
  )

  // Posição do menu principal: abaixo do ⋯ (sobe se não couber), sempre dentro da janela.
  useLayoutEffect(() => {
    if (!open || mobile) return
    const menu = menuRef.current
    const trigger = triggerRef.current
    if (!menu || !trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    let top = rect.bottom + 4
    if (top + height > window.innerHeight - MENU_MARGIN) top = rect.top - height - 4
    top = Math.max(MENU_MARGIN, Math.min(top, window.innerHeight - height - MENU_MARGIN))
    const left = Math.max(MENU_MARGIN, Math.min(rect.right - width, window.innerWidth - width - MENU_MARGIN))
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
  }, [open, mobile])

  // Ao abrir, o foco vai para o primeiro item habilitado.
  useEffect(() => {
    if (open && !mobile) levelItems(menuRef.current)[0]?.focus()
  }, [open, mobile, levelItems])

  // Aberto por teclado/clique, o submenu recebe o foco no 1º item habilitado (ele só existe depois de renderizar).
  useEffect(() => {
    if (!subOpen || !focusSubRef.current) return
    focusSubRef.current = false
    levelItems(subWrapRef.current?.querySelector('[role="menu"]'))[0]?.focus()
  }, [subOpen, levelItems])

  // Clique fora, rolagem da página e resize fecham.
  useEffect(() => {
    if (!open || mobile) return undefined
    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      closeAll(false)
    }
    const openedAt = Date.now()
    function handleScroll(event) {
      // Rolagem da janela/documento tem alvo que nao e elemento; so a rolagem DENTRO do menu e ignorada. Rolagem
      // que ainda esta chegando logo apos o clique (o navegador entrega o evento depois) nao fecha o menu.
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      if (Date.now() - openedAt < SCROLL_GRACE_MS) return
      closeAll(false)
    }
    function handleResize() {
      closeAll(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, mobile, closeAll])

  function select(action, payload) {
    closeAll(true)
    onAction?.(action, rowId, payload)
  }

  // Submenu vira para a esquerda / para cima quando não cabe (mock).
  function openSubmenu({ focusFirst }) {
    const menuRect = menuRef.current?.getBoundingClientRect()
    const triggerRect = subTriggerRef.current?.getBoundingClientRect()
    setSubPlacement({
      left: Boolean(menuRect && menuRect.right + SUBMENU_WIDTH > window.innerWidth),
      up: Boolean(triggerRect && triggerRect.top + 70 + purchaseOrders.length * SUBMENU_ROW_HEIGHT > window.innerHeight),
    })
    if (subOpen && focusFirst) {
      // Ja aberto pelo hover: so falta mover o foco.
      levelItems(subWrapRef.current?.querySelector('[role="menu"]'))[0]?.focus()
      return
    }
    focusSubRef.current = focusFirst
    setSubOpen(true)
  }

  function closeSubmenu() {
    setSubOpen(false)
    subTriggerRef.current?.focus()
  }

  function handleMenuKeyDown(event) {
    const current = document.activeElement
    const level = current?.closest?.('[role="menu"]') ?? menuRef.current
    const available = levelItems(level)
    const index = available.indexOf(current)

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (subOpen) closeSubmenu()
      else closeAll(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      available[(index + 1) % available.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      available[(index - 1 + available.length) % available.length]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      available[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      available[available.length - 1]?.focus()
    } else if (event.key === 'ArrowRight') {
      if (current === subTriggerRef.current) {
        event.preventDefault()
        openSubmenu({ focusFirst: true })
      }
    } else if (event.key === 'ArrowLeft') {
      if (subOpen && level !== menuRef.current) {
        event.preventDefault()
        closeSubmenu()
      }
    } else if (event.key === 'Tab') {
      // Foco volta ao ⋯ antes do Tab agir: a navegação continua a partir da linha, não do fim da página.
      closeAll(true)
    }
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault()
      setOpen(true)
    }
  }

  const trigger = (
    <button
      type="button"
      className="crf-rowbtn"
      aria-haspopup={mobile ? 'dialog' : 'menu'}
      aria-expanded={open}
      aria-controls={open && !mobile ? menuId : undefined}
      aria-label={label}
      title="Ações da linha"
      ref={triggerRef}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={handleTriggerKeyDown}
    >
      <Icon name="more" size={18} />
    </button>
  )

  if (mobile) {
    const options = []
    sections.forEach((section) => {
      section.items.forEach((item, index) => {
        options.push({
          value: item.key,
          label: item.label,
          icon: item.icon,
          hint: item.hint,
          disabled: item.disabled,
          separatorBefore: index === 0 && options.length > 0,
        })
      })
    })
    purchaseOrders.forEach((order, index) => {
      const isCurrent = index === currentPurchaseOrderIndex
      options.push({
        value: `po:${index}`,
        label: `Mover para ${purchaseOrderLabel(order)}`,
        icon: 'move',
        hint: isCurrent ? 'PO atual' : poHint(order, false),
        disabled: isCurrent,
        separatorBefore: index === 0 && options.length > 0,
      })
    })
    options.push({ value: 'remove', label: 'Remover linha', icon: 'trash', destructive: true, separatorBefore: true })

    return (
      <>
        {trigger}
        {open ? (
          <ActionSheet
            title={`Linha ${rowNumber}`}
            value=""
            options={options}
            onSelect={(value) => {
              if (typeof value === 'string' && value.startsWith('po:')) {
                select('toPo', { purchaseOrder: purchaseOrders[Number(value.slice(3))] })
              } else {
                select(value)
              }
            }}
            onClose={() => closeAll(true)}
          />
        ) : null}
      </>
    )
  }

  const menu = open ? (
    <div
      id={menuId}
      role="menu"
      aria-label={label}
      className="crf-rowmenu"
      ref={menuRef}
      style={{ visibility: 'hidden' }}
      onKeyDown={handleMenuKeyDown}
    >
      {sections
        .filter((section) => section.items.length > 0 || (section.key === 'position' && hasPurchaseOrders))
        .map((section) => (
          <div key={section.key} role="group" aria-labelledby={`${menuId}-${section.key}`}>
            <div id={`${menuId}-${section.key}`} className="crf-rowmenu__sec">
              {section.title}
            </div>
            {section.items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className="crf-rowmenu__item"
                disabled={item.disabled}
                aria-disabled={item.disabled ? 'true' : undefined}
                onClick={() => select(item.key)}
              >
                <Icon name={item.icon} size={16} />
                <span className="crf-rowmenu__text">
                  {item.label}
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
              </button>
            ))}
            {section.key === 'position' && hasPurchaseOrders ? (
              <div
                className="crf-rowmenu__has-sub"
                role="none"
                ref={subWrapRef}
                onMouseEnter={() => {
                  if (!subOpen) openSubmenu({ focusFirst: false })
                }}
                onMouseLeave={() => {
                  // Aberto por teclado ou por clique (foco dentro): fica aberto até Esc/←.
                  if (!subWrapRef.current?.contains(document.activeElement)) setSubOpen(false)
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="crf-rowmenu__item crf-rowmenu__trigger"
                  aria-haspopup="menu"
                  aria-expanded={subOpen}
                  ref={subTriggerRef}
                  onClick={() => openSubmenu({ focusFirst: true })}
                >
                  <Icon name="move" size={16} />
                  <span className="crf-rowmenu__text">Mover para outra PO</span>
                  <span className="crf-rowmenu__chev">
                    <Icon name="chevron-right" size={14} />
                  </span>
                </button>
                {subOpen ? (
                  <div
                    role="menu"
                    aria-label="POs desta consolidada"
                    className={`crf-rowmenu__sub${subPlacement.left ? ' crf-rowmenu__sub--left' : ''}${
                      subPlacement.up ? ' crf-rowmenu__sub--up' : ''
                    }`}
                  >
                    <div className="crf-rowmenu__sec">POs desta consolidada</div>
                    {purchaseOrders.map((order, index) => {
                      const isCurrent = index === currentPurchaseOrderIndex
                      return (
                        <button
                          key={`${order.po}-${index}`}
                          type="button"
                          role="menuitem"
                          className="crf-rowmenu__item"
                          disabled={isCurrent}
                          aria-disabled={isCurrent ? 'true' : undefined}
                          onClick={() => select('toPo', { purchaseOrder: order })}
                        >
                          <span className="crf-rowmenu__text">
                            {purchaseOrderLabel(order)}
                            <small>{poHint(order, isCurrent)}</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      <div className="crf-rowmenu__line" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="crf-rowmenu__item crf-rowmenu__item--danger"
        onClick={() => select('remove')}
      >
        <Icon name="trash" size={16} />
        <span className="crf-rowmenu__text">Remover linha</span>
      </button>
    </div>
  ) : null

  return (
    <>
      {trigger}
      {menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </>
  )
}
