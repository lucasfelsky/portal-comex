// Breadcrumb (Sprint 13).
// Navegacao hierarquica que mostra onde o usuario esta dentro da
// estrutura do app (ex: "Admin > Usuarios").
//
// API:
//   <Breadcrumb items={[{ label, to }, { label }]} />
//   - items: array de { label, to? }. O ultimo item e' considerado
//     a pagina atual (sem link, ou aria-current="page").
//
// Por que nao gerar automatico pelo pathname?
//   - Rotas dinamicas como /admin/usuarios/:id precisam de label custom
//   - Titulo pode nao ser o pathname (/admin/usuarios vs "Usuarios")
//   - Manter controle explicito no call-site (mais flexivel)
//
// Estrutura semantica: <nav aria-label="Breadcrumb"><ol><li>...</li></ol></nav>

import { Link } from 'react-router-dom'
import Icon from './Icon'

export default function Breadcrumb({ items = [] }) {
  if (items.length === 0) return null

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="breadcrumb__item">
              {isLast || !item.to ? (
                <span
                  className="breadcrumb__current"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="breadcrumb__link">
                  {item.label}
                </Link>
              )}
              {!isLast ? (
                <span className="breadcrumb__separator" aria-hidden="true">
                  <Icon name="chevron" size={12} />
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
