import { NavLink, Outlet } from 'react-router-dom'
import PageToolbar from '../components/PageToolbar'

const sections = [
  { to: '/admin/usuarios', label: 'Usuários', description: 'Cadastros, perfis e pendências' },
  { to: '/admin/comunicados', label: 'Comunicados', description: 'Avisos internos da operação' },
  { to: '/admin/barra', label: 'Barra do porto', description: 'Status operacional do canal' },
  { to: '/admin/previsoes', label: 'Previsões', description: 'Regras de entrega e cutoff' },
]

export default function AdminLayout() {
  return (
    <section className="surface admin-section">
      <PageToolbar
        title="Centro administrativo"
        description="Gerencie cadastros, avisos, status da barra e regras de previsão de entrega."
      />

      <nav className="tab-row admin-tabs" aria-label="Seções administrativas">
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
