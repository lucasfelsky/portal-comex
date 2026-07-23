import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import PageToolbar from '../components/PageToolbar'
import Icon from '../components/Icon'

const sections = [
  { to: '/admin/usuarios', label: 'Usuários', description: 'Cadastros, perfis e pendências' },
  { to: '/admin/comunicados', label: 'Comunicados', description: 'Avisos internos da operação' },
  { to: '/admin/barra', label: 'Barra do porto', description: 'Status operacional do canal' },
  { to: '/admin/previsoes', label: 'Previsões', description: 'Regras de entrega e cutoff' },
  { to: '/admin/suporte', label: 'Suporte', description: 'Chamados abertos pelos usuários' },
]

export default function AdminLayout() {
  const location = useLocation()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const activeSection = sections.find((s) => location.pathname === s.to) || sections[0]

  return (
    <section className="surface admin-section">
      {/* Mobile: dropdown estilizado — acima do título */}
      <div className="admin-tabs--mobile">
        <button
          type="button"
          className="admin-tabs__dropdown-trigger"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
        >
          <span>{activeSection.label}</span>
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

      <PageToolbar
        title="Centro administrativo"
        description="Gerencie cadastros, avisos, status da barra e regras de previsão de entrega."
      />

      {/* Desktop: tabs normais */}
      <nav className="tab-row admin-tabs admin-tabs--desktop" aria-label="Seções administrativas">
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) =>
              `tab-button${isActive ? ' tab-button--active' : ''}`
            }
          >
            {section.label}
          </NavLink>
        ))}
      </nav>

      <div className="admin-panel-stack">
        <Outlet />
      </div>
    </section>
  )
}
