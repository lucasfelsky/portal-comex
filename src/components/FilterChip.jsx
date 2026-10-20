// FilterChip (Sprint 14).
// Pill removivel representando um filtro ativo. Click no X remove.
//
// API:
//   <FilterChip label="Categoria: FCL" onRemove={() => ...} />
//   <FilterChip label="ETA: 01/01 a 15/01" onRemove={...} variant="info" />

import Icon from './Icon'

const VARIANT_CLASS = {
  default: 'filter-chip--default',
  primary: 'filter-chip--primary',
  info: 'filter-chip--info',
  success: 'filter-chip--success',
  warning: 'filter-chip--warning',
  danger: 'filter-chip--danger',
}

export default function FilterChip({
  label,
  onRemove,
  variant = 'default',
  size = 'md',
  className = '',
}) {
  const variantClass = VARIANT_CLASS[variant] ?? VARIANT_CLASS.default
  return (
    <span
      className={`filter-chip ${variantClass} filter-chip--${size} ${className}`}
    >
      <span className="filter-chip__label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="filter-chip__remove"
          onClick={onRemove}
          aria-label={`Remover filtro ${label}`}
        >
          <Icon name="close" size={12} strokeWidth={2.4} />
        </button>
      ) : null}
    </span>
  )
}

// FilterPill (Componentes.dc.html, "Campos e filtros"): pilula de filtro com
// contador. Ativa = fundo --navy + contador em branco translucido; inativa =
// borda + contador --ink-soft (--danger-700 quando e pendencia, `alert`);
// "+ Filtro" (`add`) tem borda tracejada. E o seletor de filtro; o chip
// removivel de um filtro JA aplicado continua sendo o <FilterChip>.
//
// API:
//   <FilterPill label="Todos" count={48} active onClick={...} />
//   <FilterPill label="Docs pendentes" count={3} alert />
//   <FilterPill label="+ Filtro" add />
export function FilterPill({
  label,
  count,
  active = false,
  alert = false,
  add = false,
  className = '',
  ...rest
}) {
  const classes = [
    'filter-pill',
    active ? 'filter-pill--active' : '',
    add ? 'filter-pill--add' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={classes}
      aria-pressed={add ? undefined : active}
      {...rest}
    >
      <span className="filter-pill__label">{label}</span>
      {count !== undefined && count !== null ? (
        <span className={`filter-pill__count${alert ? ' filter-pill__count--alert' : ''}`}>{count}</span>
      ) : null}
    </button>
  )
}
