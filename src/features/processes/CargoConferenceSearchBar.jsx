import { forwardRef, useEffect, useRef } from 'react'
import Icon from '../../components/Icon'

// Conferência por item: barra "Buscar item" do topo da lista (mock v5). Fica dentro do contêiner sticky opaco
// `.ccf-searchwrap` (quem monta é a lista). Com o campo em foco (teclado aberto) liga a classe `ccf-kbd` no `body`: a
// barra de ações e a navegação de baixo saem de cena (CSS no bloco `ccf-`); `blur` e o desmonte desligam. Enter fecha o
// teclado. O botão limpar (44x44) não tira o foco do campo (`onMouseDown` com `preventDefault`).

export const CARGO_KEYBOARD_BODY_CLASS = 'ccf-kbd'

const CargoConferenceSearchBar = forwardRef(function CargoConferenceSearchBar({ value, stuck = false, onChange }, wrapRef) {
  const inputRef = useRef(null)

  useEffect(
    () => () => {
      document.body.classList.remove(CARGO_KEYBOARD_BODY_CLASS)
    },
    []
  )

  function handleKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.currentTarget.blur()
  }

  function handleClear() {
    const hadFocus = document.activeElement === inputRef.current
    onChange('')
    if (hadFocus) inputRef.current?.focus()
  }

  return (
    <div className={`ccf-searchwrap${stuck ? ' ccf-searchwrap--stuck' : ''}`} ref={wrapRef}>
      <div className="ccf-sbar">
        <span className="ccf-sbar__ic">
          <Icon name="search" size={18} strokeWidth={2} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder="Buscar item"
          aria-label="Buscar item pelo nome"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => document.body.classList.add(CARGO_KEYBOARD_BODY_CLASS)}
          onBlur={() => document.body.classList.remove(CARGO_KEYBOARD_BODY_CLASS)}
        />
        <button
          type="button"
          className="ccf-sbar__x"
          aria-label="Limpar busca"
          hidden={!value}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        >
          <Icon name="close" size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
})

export default CargoConferenceSearchBar
