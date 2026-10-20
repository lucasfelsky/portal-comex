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
//   <Skeleton.ProcessCard />        // formato real do card de processo
//                                   // (linha 40% / titulo 75% / linha 55% /
//                                   // barra 6px / pilula), Componentes.dc.html

const VARIANTS = {
  text: { width: '100%', height: '0.9em', radius: 'var(--radius-sm)' },
  title: { width: '100%', height: '1.5em', radius: 'var(--radius-sm)' },
  subtitle: { width: '60%', height: '0.9em', radius: 'var(--radius-sm)' },
  card: { width: '100%', height: '120px', radius: 'var(--radius)' },
  circle: { width: '40px', height: '40px', radius: '50%' },
  button: { width: '120px', height: '36px', radius: 'var(--radius-sm)' },
  // Pecas do card de processo (Componentes.dc.html / Movimento.dc.html).
  line: { width: '100%', height: '12px', radius: '6px' },
  heading: { width: '100%', height: '18px', radius: '6px' },
  bar: { width: '100%', height: '6px', radius: '6px' },
  pill: { width: '48%', height: '26px', radius: '999px' },
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

Skeleton.ProcessCard = function SkeletonProcessCard({ className = '', ...rest }) {
  return (
    <div className={`skeleton-process-card ${className}`.trim()} aria-hidden="true" {...rest}>
      <Skeleton variant="line" width="40%" />
      <Skeleton variant="heading" width="75%" />
      <Skeleton variant="line" width="55%" />
      <Skeleton variant="bar" className="skeleton-process-card__bar" />
      <Skeleton variant="pill" className="skeleton-process-card__pill" />
    </div>
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
