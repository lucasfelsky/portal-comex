// Command palette (Sprint 14, busca real Sprint 18.0).
// Busca global acionada por Ctrl+K (Cmd+K no Mac). Filtra em tempo
// real sobre items fornecidos via prop `commands` e, opcionalmente,
// dispara um `searcher` assincrono quando o usuario digita.
//
// API:
//   <CommandPalette
//     open={boolean}
//     onClose={() => void}
//     commands={[{ id, label, group?, to?, action?, keywords? }]}
//     searcher={async (query) => [{ id, label, group?, to?, action? }]}
//     placeholder="..."
//   />
//
// Comportamento:
//   - Ctrl+K (ou Cmd+K) abre a palette de qualquer lugar
//   - Esc fecha
//   - Click no backdrop fecha
//   - ↑/↓ navegacao entre resultados
//   - Enter executa o resultado selecionado (to= ou action=)
//   - Filtragem case-insensitive em label + keywords (commands estaticos)
//   - Se `searcher` for passado, chama com debounce 200ms e junta resultados
//
// Estrutura: <Modal> wrapper com <input> + lista de resultados.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import Icon from './Icon'

const SEARCH_DEBOUNCE_MS = 200

export default function CommandPalette({
  open,
  onClose,
  commands = [],
  searcher,
  placeholder = 'Buscar paginas, acoes...',
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [asyncResults, setAsyncResults] = useState([])
  const [asyncLoading, setAsyncLoading] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  // Reseta estado quando a palette abre
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setAsyncResults([])
      setAsyncLoading(false)
    }
  }, [open])

  // Foco no input quando abre
  useEffect(() => {
    if (open && inputRef.current) {
      // Pequeno delay para o Modal terminar a animacao
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounce do searcher externo
  useEffect(() => {
    if (!searcher) {
      setAsyncResults([])
      return undefined
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    const trimmed = query.trim()
    if (!trimmed) {
      setAsyncResults([])
      setAsyncLoading(false)
      return undefined
    }
    setAsyncLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await searcher(trimmed)
        setAsyncResults(Array.isArray(results) ? results : [])
      } catch (error) {
        console.error('CommandPalette searcher falhou.', error)
        setAsyncResults([])
      } finally {
        setAsyncLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [query, searcher])

  // Filtragem dos comandos estaticos
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((cmd) => {
      const haystack = [
        cmd.label ?? '',
        cmd.group ?? '',
        ...(cmd.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [commands, query])

  // Junta comandos estaticos + resultados async, com flag de origem
  const filtered = useMemo(() => {
    if (!searcher) return filteredCommands
    const taggedAsync = asyncResults.map((item) => ({ ...item, _async: true }))
    return [...filteredCommands, ...taggedAsync]
  }, [filteredCommands, asyncResults, searcher])

  // Mantem activeIndex dentro dos limites quando query muda
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered, activeIndex])

  function runCommand(cmd) {
    if (!cmd) return
    if (cmd.to) {
      navigate(cmd.to)
    } else if (cmd.action) {
      cmd.action()
    }
    onClose?.()
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runCommand(filtered[activeIndex])
    }
  }

  // Agrupa por `group` para organizar resultados
  const grouped = useMemo(() => {
    const out = []
    let current = null
    filtered.forEach((cmd) => {
      const g = (cmd._async ? 'Resultados' : cmd.group) ?? ''
      if (!current || current.group !== g) {
        current = { group: g, items: [] }
        out.push(current)
      }
      current.items.push(cmd)
    })
    return out
  }, [filtered])

  return (
    <Modal open={open} onClose={onClose} ariaLabel="Paleta de comandos">
      <div className="command-palette">
        <div className="command-palette__search">
          <span className="command-palette__search-icon" aria-hidden="true">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette__input"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Buscar comandos"
            aria-controls="command-palette-results"
            aria-activedescendant={
              filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined
            }
          />
          <kbd className="command-palette__kbd">Esc</kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-results"
          className="command-palette__list"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="command-palette__empty">
              {asyncLoading
                ? 'Buscando...'
                : `Nenhum resultado para \u201c${query}\u201d`}
            </li>
          ) : (
            grouped.map((group) => (
              <li key={group.group || 'default'} className="command-palette__group">
                {group.group ? (
                  <div className="command-palette__group-label">{group.group}</div>
                ) : null}
                <ul className="command-palette__group-list">
                  {group.items.map((cmd) => {
                    const globalIndex = filtered.indexOf(cmd)
                    const isActive = globalIndex === activeIndex
                    return (
                      <li
                        key={cmd.id}
                        id={`command-${cmd.id}`}
                        role="option"
                        aria-selected={isActive}
                        className={`command-palette__item${isActive ? ' command-palette__item--active' : ''}`}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                        onClick={() => runCommand(cmd)}
                      >
                        {cmd.icon ? (
                          <span className="command-palette__item-icon" aria-hidden="true">
                            <Icon name={cmd.icon} size={16} />
                          </span>
                        ) : null}
                        <span className="command-palette__item-label">{cmd.label}</span>
                        {cmd.description ? (
                          <span className="command-palette__item-description">{cmd.description}</span>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className="command-palette__footer">
          <span>
            <kbd className="command-palette__kbd">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="command-palette__kbd">Enter</kbd> abrir
          </span>
          <span>
            <kbd className="command-palette__kbd">Esc</kbd> fechar
          </span>
        </div>
      </div>
    </Modal>
  )
}

// Hook pra registrar Ctrl+K / Cmd+K
export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onKeyDown(event) {
      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
      const meta = isMac ? event.metaKey : event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return { open, setOpen }
}
