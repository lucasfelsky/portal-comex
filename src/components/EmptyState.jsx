// EmptyState (Sprint 12 / polish).
// Ilustracao SVG inline + titulo + mensagem + acao opcional.
//
// API:
//   <EmptyState
//     illustration="inbox" | "news" | "search" | "filter"
//     title="Nenhum resultado encontrado"
//     message="Tente ajustar os filtros."
//     action={<button>Nova busca</button>}
//   />

import Icon from './Icon'

const ILLUSTRATIONS = {
  inbox: (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="40" width="160" height="80" rx="12" fill="var(--surface-alt)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="60" y="60" width="80" height="14" rx="3" fill="var(--primary-50)" />
      <rect x="78" y="80" width="44" height="6" rx="3" fill="var(--border)" />
      <circle cx="155" cy="50" r="14" fill="var(--primary)" />
      <path d="M149 50l4 4 8-8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="30" y="35" width="140" height="80" rx="10" fill="var(--surface-alt)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="42" y="48" width="116" height="6" rx="2" fill="var(--border)" />
      <rect x="42" y="62" width="80" height="4" rx="2" fill="var(--border)" />
      <rect x="42" y="72" width="100" height="4" rx="2" fill="var(--border)" />
      <rect x="42" y="82" width="60" height="4" rx="2" fill="var(--border)" />
      <rect x="42" y="92" width="90" height="4" rx="2" fill="var(--border)" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="92" cy="64" r="32" fill="none" stroke="var(--primary)" strokeWidth="6" />
      <path d="m118 90 22 22" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="92" cy="64" r="32" fill="var(--primary-50)" opacity="0.5" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M40 30 H160 L120 75 V110 L80 100 V75 Z" fill="var(--surface-alt)" stroke="var(--border)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M40 30 H160" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
}

export default function EmptyState({
  illustration = 'inbox',
  title,
  message,
  action,
  icon,
  className = '',
}) {
  const content = ILLUSTRATIONS[illustration] ?? ILLUSTRATIONS.inbox
  return (
    <div className={`empty-state empty-state--rich ${className}`} role="status">
      {icon ? <div className="empty-state__icon"><Icon name={icon} size={28} /></div> : null}
      <div className="empty-state__illustration">{content}</div>
      {title ? <strong className="empty-state__title">{title}</strong> : null}
      {message ? <p className="empty-state__message">{message}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  )
}
