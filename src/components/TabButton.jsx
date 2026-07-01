// TabButton: wrapper fino de <button> com a estetica .tab-button (Sprint 16.2).
// Centraliza aria-pressed e o par active/disabled que aparece em todos
// os lugares que usam .tab-button (filters do notifications, tabs do admin,
// detail tabs em ProcessesPage).
//
// @vitest-environment jsdom

export default function TabButton({
  active = false,
  disabled = false,
  onClick,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  const classes = [
    'tab-button',
    active ? 'tab-button--active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  )
}
