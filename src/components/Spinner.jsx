// Spinner: indicador de loading inline (Sprint 30).
// SVG circular rotacionado, 3 tamanhos, herda cor do texto.
//
// API:
//   <Spinner size={16} />
//   <Spinner size={20} label="Salvando..." />

const SIZE_MAP = {
  12: 12,
  14: 14,
  16: 16,
  20: 20,
  24: 24,
}

export default function Spinner({ size = 16, label, className = '' }) {
  const dim = SIZE_MAP[size] ?? size
  return (
    <span
      className={`spinner ${className}`}
      role="status"
      aria-label={label ?? 'Carregando'}
      style={{ width: dim, height: dim, display: 'inline-block', verticalAlign: 'middle' }}
    >
      <svg
        viewBox="0 0 24 24"
        width={dim}
        height={dim}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="spinner__svg"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" />
      </svg>
    </span>
  )
}
