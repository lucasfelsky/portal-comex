import { Children, isValidElement, useMemo, useState } from 'react'
import ActionSheet from './ActionSheet'
import { useMobileLayout } from '../hooks/useMobileLayout'

// C12 (auditoria mobile F14): drop-in pro <select> nativo. Progressive
// enhancement — o <select> nativo continua renderizado e é a fonte da
// verdade + fallback (desktop usa ele direto; no mobile ele fica atrás de um
// gatilho e segue acessível por teclado/leitor de tela). No mobile (<=720px)
// um toque abre um ActionSheet (bottom sheet) em vez do dropdown nativo, que
// no celular é minúsculo e difícil em listas longas.
//
// API = mesma do <select> (value, onChange(event), children <option>).
// Selecionar no sheet chama onChange com um evento sintético { target:
// { value } } — compatível com os handlers `event.target.value` existentes.
export default function SelectField({
  value,
  onChange,
  children,
  className = 'text-input',
  sheetTitle,
  disabled,
  forceMobile,
  ...rest
}) {
  const isMobile = useMobileLayout()
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  // Se forceMobile for true, renderiza o gatilho/action-sheet mesmo que o
  // hook useMobileLayout ainda não tenha detectado a viewport (caso de
  // hidratacao/client hint). O container externo usa CSS para mostrar/esconder.
  const showMobileTrigger = forceMobile || isMobile

  // Extrai as opções dos <option> filhos pra alimentar o sheet. Desce em
  // <optgroup> (CollectionStatusEditView usa grupos), preservando o label do
  // grupo como prefixo no sheet (que não tem hierarquia visual como o nativo).
  const options = useMemo(() => {
    const collected = []
    const walk = (nodes, groupLabel) => {
      Children.toArray(nodes).forEach((child) => {
        if (!isValidElement(child)) return
        if (child.type === 'optgroup') {
          walk(child.props.children, child.props.label)
          return
        }
        if (child.type === 'option') {
          const rawLabel = typeof child.props.children === 'string'
            ? child.props.children
            : String(child.props.value ?? '')
          collected.push({
            value: child.props.value ?? '',
            label: groupLabel ? `${groupLabel} · ${rawLabel}` : rawLabel,
            disabled: Boolean(child.props.disabled),
          })
        }
      })
    }
    walk(children)
    return collected
  }, [children])

  const currentLabel = useMemo(() => {
    const match = options.find((option) => String(option.value) === String(value))
    return match ? match.label : ''
  }, [options, value])

  function handleSelect(nextValue) {
    setIsSheetOpen(false)
    // Evento sintético compatível com os onChange que leem event.target.value.
    onChange?.({ target: { value: nextValue } })
  }

  return (
    <span className="select-field">
      <select
        className={className}
        value={value}
        onChange={onChange}
        disabled={disabled}
        // No mobile o gatilho cobre o select; deixamos o select acessível
        // por teclado (fallback), mas fora do tab order visual redundante.
        tabIndex={showMobileTrigger ? -1 : undefined}
        {...rest}
      >
        {children}
      </select>

      {showMobileTrigger && !disabled ? (
        <button
          type="button"
          className="select-field__trigger"
          aria-haspopup="listbox"
          aria-label={sheetTitle ? `${sheetTitle}: ${currentLabel}` : currentLabel}
          onClick={() => setIsSheetOpen(true)}
        >
          <span className="select-field__trigger-value">{currentLabel}</span>
          <span className="select-field__trigger-caret" aria-hidden="true">▾</span>
        </button>
      ) : null}

      {isSheetOpen ? (
        <ActionSheet
          title={sheetTitle}
          options={options}
          value={value}
          onSelect={handleSelect}
          onClose={() => setIsSheetOpen(false)}
        />
      ) : null}
    </span>
  )
}
