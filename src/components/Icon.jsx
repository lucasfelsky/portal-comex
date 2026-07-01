// Icones SVG inline (Sprint 11 / polish). Inspirado em Heroicons outline.
// Stroke 1.75, viewBox 24x24, currentColor para herdar cor do contexto.
//
// Por que SVG inline e nao <img>?
// - Cor herda de currentColor (combina com estados active/hover)
// - Sem requests extras de rede
// - Sem dependencia externa (sem lucide-react, sem @heroicons)
// - Tree-shake friendly: so' os icones usados sao incluidos no bundle
//
// API:
//   <Icon name="dashboard" />
//   <Icon name="dashboard" size={20} />

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  news: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
      <path d="M3 8.5h18" />
      <path d="M7 12h6" />
      <path d="M7 15.5h4" />
    </>
  ),
  arrivals: (
    <>
      <path d="M3 17h13V7H3v10Z" />
      <path d="M16 11h4l1 3v3h-5" />
      <circle cx="6.5" cy="18.5" r="1.5" />
      <circle cx="18.5" cy="18.5" r="1.5" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3.5 4.5 6.5v5.5c0 4 3.2 7.4 7.5 8.5 4.3-1.1 7.5-4.5 7.5-8.5v-5.5L12 3.5Z" />
      <path d="M9 12.2 11 14.2 15.2 9.8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 5 1.5 6 1.5 6H4.5S6 13 6 8Z" />
      <path d="M10 17.5a2 2 0 0 0 4 0" />
    </>
  ),
  check: (
    <path d="M5 12.5 10 17.5 19 7.5" />
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19 5l-9 9" />
      <path d="M19 14v5.5H4.5V5H10" />
    </>
  ),
  logout: (
    <>
      <path d="M9 5H5.5A1.5 1.5 0 0 0 4 6.5v11A1.5 1.5 0 0 0 5.5 19H9" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H10" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  dollar: (
    <>
      <path d="M12 3v18" />
      <path d="M16 7.5C16 6 14.5 5 12 5s-4 1-4 2.5S9.5 10 12 10s4 1 4 2.5S14.5 15 12 15s-4-1-4-2.5" />
    </>
  ),
  trend: (
    <>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M20 7h-4" />
      <path d="M20 7v4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4v3" />
      <path d="M12 17v3" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="m6.3 6.3 2.1 2.1" />
      <path d="m15.6 15.6 2.1 2.1" />
      <path d="m6.3 17.7 2.1-2.1" />
      <path d="m15.6 8.4 2.1-2.1" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13.5 5.5 5.5A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.5 1L21 13.5" />
      <path d="M3 13.5V19a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 19v-5.5h-5l-1 2h-4l-1-2H3Z" />
    </>
  ),
}

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.75, ...rest }) {
  const path = ICONS[name]
  if (!path) return null
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {path}
    </svg>
  )
}
