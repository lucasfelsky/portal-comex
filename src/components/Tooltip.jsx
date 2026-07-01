// Tooltip: wrapper que mostra dica em hover/focus (Sprint 19.0).
// Renderiza um <span> em volta do children com data-tooltip. O CSS
// usa ::after pra renderizar o texto e ::before pra setinha.
//
// API:
//   <Tooltip label="Abrir menu" side="bottom">
//     <button>...</button>
//   </Tooltip>
//
// side: top (default) | bottom | left | right

export default function Tooltip({ label, side = 'top', children, className = '' }) {
  if (!label) return children

  const sideClass = `tooltip--${side}`
  const classes = ['tooltip', sideClass, className].filter(Boolean).join(' ')

  return (
    <span className={classes} data-tooltip={label} tabIndex={0}>
      {children}
    </span>
  )
}
