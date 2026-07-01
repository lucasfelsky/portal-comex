// Skeleton loader (Sprint 12 / polish).
// Substitui "Carregando..." por placeholders animados que dao
// feedback visual melhor (nao da layout shift, indica estrutura).
//
// API:
//   <Skeleton width="100%" height="16px" />
//   <Skeleton variant="text" />     // 1 linha de texto (1em)
//   <Skeleton variant="title" />    // 2 linhas (1.5em + 0.75em)
//   <Skeleton variant="card" />     // card com 3 linhas
//   <Skeleton variant="circle" size={40} />  // avatar circular
//   <Skeleton.Group count={3} />    // lista de 3 skeletons

const VARIANTS = {
  text: { width: '100%', height: '0.9em', radius: 'var(--radius-sm)' },
  title: { width: '100%', height: '1.5em', radius: 'var(--radius-sm)' },
  subtitle: { width: '60%', height: '0.9em', radius: 'var(--radius-sm)' },
  card: { width: '100%', height: '120px', radius: 'var(--radius)' },
  circle: { width: '40px', height: '40px', radius: '50%' },
  button: { width: '120px', height: '36px', radius: 'var(--radius-sm)' },
}

export default function Skeleton({
  width,
  height,
  radius,
  variant = 'text',
  className = '',
  style = {},
  ...rest
}) {
  const defaults = VARIANTS[variant] ?? VARIANTS.text
  const finalStyle = {
    width: width ?? defaults.width,
    height: height ?? defaults.height,
    borderRadius: radius ?? defaults.radius,
    ...style,
  }
  return (
    <span
      className={`skeleton ${className}`}
      style={finalStyle}
      aria-hidden="true"
      {...rest}
    />
  )
}

Skeleton.Group = function SkeletonGroup({ count = 3, gap = 12, children, ...rest }) {
  return (
    <div className="skeleton-group" style={{ display: 'grid', gap }} {...rest}>
      {children ??
        Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} variant={i === 0 ? 'title' : 'subtitle'} />
        ))}
    </div>
  )
}
