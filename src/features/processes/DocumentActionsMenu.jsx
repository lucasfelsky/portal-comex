import { useCallback, useEffect, useId, useRef, useState } from 'react'
import ActionSheet from '../../components/ActionSheet'
import Icon from '../../components/Icon'

// S7: botão "Ações" do cartão de documento. Desktop: menu no padrão do `process-detail-more` (cabeçalho do
// processo): role="menu", itens `menuitem`, separador, item destrutivo em vermelho; Esc fecha e devolve o foco
// ao botão; setas/Home/End navegam; clique fora e Tab fecham. Celular: o mesmo conteúdo no ActionSheet existente.
//
// `items`: [{ key, label, ariaLabel?, icon?, hint?, danger?, separatorBefore?, disabled?, onSelect }].
// Selecionar um item fecha o menu e devolve o foco ao botão ANTES de executar a ação: diálogos que abrem em
// seguida (renomear, excluir, visualizar) guardam esse botão como retorno de foco.
export default function DocumentActionsMenu({ title, items, mobile = false, triggerRef = null }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef(null)
  const ownTriggerRef = useRef(null)
  const menuRef = useRef(null)

  const setTrigger = useCallback(
    (node) => {
      ownTriggerRef.current = node
      if (typeof triggerRef === 'function') triggerRef(node)
    },
    [triggerRef]
  )

  const enabledItems = useCallback(
    () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])],
    []
  )

  // Ao abrir (desktop), o foco vai para o primeiro item.
  useEffect(() => {
    if (!open || mobile) return
    enabledItems()[0]?.focus()
  }, [open, mobile, enabledItems])

  // Clique fora fecha (desktop).
  useEffect(() => {
    if (!open || mobile) return undefined
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, mobile])

  if (!Array.isArray(items) || items.length === 0) return null

  function closeAndFocusTrigger() {
    setOpen(false)
    ownTriggerRef.current?.focus()
  }

  function handleSelect(item) {
    if (item.disabled) return
    closeAndFocusTrigger()
    item.onSelect?.()
  }

  function handleMenuKeyDown(event) {
    const available = enabledItems()
    const index = available.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeAndFocusTrigger()
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
    } else if (event.key === 'Tab') {
      setOpen(false)
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
      className="documents-icon-button ghost-button ghost-button--outline docs-more__trigger"
      aria-haspopup={mobile ? 'dialog' : 'menu'}
      aria-expanded={open}
      aria-controls={open && !mobile ? menuId : undefined}
      aria-label={`Ações de ${title}`}
      title="Ações"
      ref={setTrigger}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={handleTriggerKeyDown}
    >
      <span className="documents-row__action-label">Ações</span>
      <Icon name="chevron-down" size={14} />
    </button>
  )

  if (mobile) {
    return (
      <div className="process-detail-more docs-more" ref={containerRef}>
        {trigger}
        {open ? (
          <ActionSheet
            title={title}
            value=""
            options={items.map((item) => ({
              value: item.key,
              label: item.label,
              ariaLabel: item.ariaLabel,
              icon: item.icon,
              hint: item.hint,
              destructive: item.danger,
              separatorBefore: item.separatorBefore,
              disabled: item.disabled,
            }))}
            onSelect={(key) => handleSelect(items.find((item) => item.key === key) ?? {})}
            onClose={closeAndFocusTrigger}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="process-detail-more docs-more" ref={containerRef}>
      {trigger}
      {open ? (
        <div id={menuId} role="menu" aria-label={`Ações de ${title}`} className="process-detail-more__menu" ref={menuRef} onKeyDown={handleMenuKeyDown}>
          {items.map((item) => (
            <div key={item.key} className="docs-more__entry" role="none">
              {item.separatorBefore ? <div className="process-detail-more__sep" role="separator" /> : null}
              <button
                type="button"
                role="menuitem"
                className={`process-detail-more__item${item.danger ? ' process-detail-more__item--danger' : ''}`}
                aria-label={item.ariaLabel}
                disabled={item.disabled}
                onClick={() => handleSelect(item)}
              >
                {item.icon ? <Icon name={item.icon} size={16} /> : null}
                <span className="pdm-t">
                  <span>{item.label}</span>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
