import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'

const sections = [
  { to: '/admin/usuarios', label: 'Usuários', description: 'Cadastros, perfis e pendências' },
  { to: '/admin/comunicados', label: 'Comunicados', description: 'Avisos internos da operação' },
  { to: '/admin/barra', label: 'Barra do porto', description: 'Status operacional do canal' },
  { to: '/admin/previsoes', label: 'Previsões', description: 'Regras de entrega e cutoff' },
  { to: '/admin/lead-time', label: 'Lead time', description: 'Tempo real por modal e porto' },
  { to: '/admin/suporte', label: 'Suporte', description: 'Chamados abertos pelos usuários' },
]

// Folga (px) deixada entre a aba ativa e a borda do nav ao rolar ate ela.
const TAB_REVEAL_MARGIN = 8
// Tolerancia (px) de subpixel para considerar a aba "inteira visivel".
const TAB_VISIBLE_TOLERANCE = 1

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
}

// Entre 1041 e 1279px as 6 abas podem passar da largura do nav (overflow-x: auto): rola o
// PROPRIO nav (scrollLeft, nunca scrollIntoView, que poderia rolar a pagina na vertical)
// ate a aba ativa. No-op quando a aba ja esta inteira visivel ou sem geometria real (jsdom).
// Tambem e chamada pelo ResizeObserver (ver AdminLayout) quando o tamanho do nav ou das abas
// muda depois da montagem, sempre sem animacao.
function revealActiveTab(nav, { animate }) {
  const active = nav.querySelector('.tab-button--active')
  if (!active) return
  const navRect = nav.getBoundingClientRect()
  const tabRect = active.getBoundingClientRect()
  const edges = [navRect.left, navRect.right, tabRect.left, tabRect.right]
  if (!edges.every(Number.isFinite)) return
  if (!(navRect.width > 0) || !(tabRect.width > 0)) return

  let delta = 0
  if (tabRect.left < navRect.left - TAB_VISIBLE_TOLERANCE) {
    delta = tabRect.left - navRect.left - TAB_REVEAL_MARGIN
  } else if (tabRect.right > navRect.right + TAB_VISIBLE_TOLERANCE) {
    delta = tabRect.right - navRect.right + TAB_REVEAL_MARGIN
  }
  if (delta === 0) return

  const target = Math.max(0, (Number(nav.scrollLeft) || 0) + delta)
  if (animate && typeof nav.scrollTo === 'function') {
    nav.scrollTo({ left: target, behavior: 'smooth' })
  } else {
    nav.scrollLeft = target
  }
}

export default function AdminLayout() {
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const navRef = useRef(null)
  const hasRevealedRef = useRef(false)

  const activeSection = sections.find((s) => location.pathname === s.to) || sections[0]

  // Mount: instantaneo (sem "salto" animado ao abrir a tela). Trocas de aba: suave, exceto
  // com prefers-reduced-motion (instantaneo).
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const animate = hasRevealedRef.current && !prefersReducedMotion()
    hasRevealedRef.current = true
    revealActiveTab(nav, { animate })
  }, [activeSection.to])

  // Resize da janela, zoom e carga da webfont mudam a largura do nav/abas depois da montagem
  // e podem cortar a aba ativa. Observa o nav e cada aba e revela de novo, sem animar. So reage
  // a mudanca de tamanho real: a 1a notificacao de cada elemento (o observe() sempre dispara
  // uma vez) so registra o tamanho base, ja que a montagem e tratada pelo useLayoutEffect
  // acima. Rolagem manual nao dispara ResizeObserver, entao nao ha briga com o usuario. O
  // rAF agrupa varias notificacoes do mesmo frame em uma unica revelacao. No-op sem
  // ResizeObserver (navegadores antigos, jsdom).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver !== 'function') return undefined
    const nav = navRef.current
    if (!nav) return undefined

    const sizes = new Map()
    let rafId = 0
    const hasRaf = typeof window.requestAnimationFrame === 'function'

    const run = () => {
      rafId = 0
      revealActiveTab(nav, { animate: false })
    }

    const observer = new window.ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const box = entry.contentRect
        if (!box) continue
        const previous = sizes.get(entry.target)
        sizes.set(entry.target, { width: box.width, height: box.height })
        if (previous && (previous.width !== box.width || previous.height !== box.height)) {
          changed = true
        }
      }
      if (!changed || rafId) return
      if (hasRaf) {
        rafId = window.requestAnimationFrame(run)
      } else {
        run()
      }
    })

    observer.observe(nav)
    nav.querySelectorAll('.admin-tab').forEach((tab) => observer.observe(tab))

    return () => {
      observer.disconnect()
      if (rafId && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId)
      }
      rafId = 0
    }
  }, [])

  return (
    <section className="surface admin-section">
      {/* Desktop: tabs normais. Refino F2 (AdminTabs.dc.html): cada aba tem
          rotulo + ponto de ativo + descricao; ponto e descricao so aparecem no
          desktop (>=1041px) — no tablet continua a pilula so com o rotulo. */}
      <nav ref={navRef} className="tab-row admin-tabs admin-tabs--desktop" aria-label="Seções administrativas">
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              `tab-button admin-tab${isActive ? ' tab-button--active' : ''}`
            }
          >
            <span className="admin-tab__label">
              <span className="admin-tab__dot" aria-hidden="true" />
              {section.label}
            </span>
            <span className="admin-tab__desc">{section.description}</span>
          </NavLink>
        ))}
      </nav>

      {/* Mobile: título da sub-aba + dropdown abaixo */}
      <div className="admin-tabs--mobile">
        <h2 className="admin-tabs__section-title">{activeSection.label}</h2>
        <button
          type="button"
          className="admin-tabs__dropdown-trigger"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <span>Trocar seção</span>
          <Icon name="chevron" size={14} className={`admin-tabs__chevron${dropdownOpen ? ' admin-tabs__chevron--open' : ''}`} aria-hidden="true" />
        </button>

        {dropdownOpen ? (
          <>
            <button
              type="button"
              className="admin-tabs__backdrop"
              aria-label="Fechar menu de seções"
              onClick={() => setDropdownOpen(false)}
            />
            <ul className="admin-tabs__dropdown" role="listbox">
              {sections.map((section) => (
                <li key={section.to} role="option" aria-selected={section.to === activeSection.to}>
                  <NavLink
                    to={section.to}
                    className={`admin-tabs__dropdown-item${section.to === activeSection.to ? ' admin-tabs__dropdown-item--active' : ''}`}
                    onClick={() => setDropdownOpen(false)}
                  >
                    <span className="admin-tabs__dropdown-label">{section.label}</span>
                    <span className="admin-tabs__dropdown-desc">{section.description}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="admin-panel-stack">
        <Outlet />
      </div>
    </section>
  )
}
