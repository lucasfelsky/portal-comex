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
          <Icon name="plus" size={12} style={{ transform: 'rotate(45deg)' }} />
        </button>
      ) : null}
    </span>
  )
}
