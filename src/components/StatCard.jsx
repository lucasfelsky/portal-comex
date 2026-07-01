// StatCard (Sprint 14).
// Card de estatistica com label, valor, trend indicator (% up/down)
// e sparkline SVG opcional.
//
// API:
//   <StatCard
//     label="Processos ativos"
//     value="42"
//     trend={{ delta: 12, period: 'vs. semana passada' }}
//     sparkline={[10, 14, 12, 18, 22, 19, 25, 30]}
//     icon="dashboard"     // opcional
//   />
//
// Trend positive (up + cor primary-700), trend negative (down + danger).
// Sparkline e' uma SVG inline (sem dependencia externa) com
// preenchimento gradiente abaixo da linha.

import Icon from './Icon'

const TREND_COLORS = {
  up: 'var(--success-700)',
  down: 'var(--danger-700)',
  neutral: 'var(--ink-soft)',
}

const TREND_BG = {
  up: 'var(--success-50)',
  down: 'var(--danger-50)',
  neutral: 'var(--surface-alt)',
}

function formatDelta(delta) {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}%`
}

function pickTrendDirection(delta) {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'neutral'
}

function buildSparklinePath(points, width, height) {
  if (!points || points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const stepX = width / (points.length - 1)
  const coords = points.map((value, index) => {
    const x = index * stepX
    const y = height - ((value - min) / range) * height
    return [x, y]
  })
  // Linha
  const linePath = coords
    .map(([x, y], index) => (index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ')
  // Area (linePath + fechamento no bottom)
  const lastX = coords[coords.length - 1][0]
  const firstX = coords[0][0]
  const areaPath = `${linePath} L ${lastX} ${height} L ${firstX} ${height} Z`
  return { linePath, areaPath }
}

export default function StatCard({
  label,
  value,
  trend,
  sparkline,
  icon,
  className = '',
}) {
  const direction = trend ? pickTrendDirection(trend.delta) : null
  const sparklineWidth = 100
  const sparklineHeight = 28
  const sparklineData = buildSparklinePath(sparkline, sparklineWidth, sparklineHeight)
  const stroke = direction ? TREND_COLORS[direction] : TREND_COLORS.neutral

  return (
    <article className={`stat-card stat-card--rich ${className}`}>
      <div className="stat-card__head">
        {icon ? (
          <span className="stat-card__icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <span className="stat-card__label">{label}</span>
        {trend ? (
          <span
            className={`stat-card__trend stat-card__trend--${direction}`}
            aria-label={`Variacao ${formatDelta(trend.delta)} ${trend.period ?? ''}`.trim()}
          >
            <Icon
              name={direction === 'down' ? 'trend' : 'trend'}
              size={12}
              style={{ transform: direction === 'down' ? 'rotate(180deg)' : 'none' }}
            />
            <span>{formatDelta(trend.delta)}</span>
          </span>
        ) : null}
      </div>

      <strong className="stat-card__value">{value}</strong>

      {sparklineData ? (
        <svg
          className="stat-card__sparkline"
          viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`sparkline-gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={sparklineData.areaPath} fill={`url(#sparkline-gradient-${label})`} />
          <path
            d={sparklineData.linePath}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}

      {trend?.period ? <p className="stat-card__period">{trend.period}</p> : null}
    </article>
  )
}
