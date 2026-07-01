// PageToolbar: cabeçalho de pagina com titulo + acoes a direita (Sprint 17.1).
// Substitui o padrao de section-heading + botoes soltos por um wrapper
// unificado. Suporta eyebrow, titulo, descricao e children como acoes.
//
// @vitest-environment jsdom

export default function PageToolbar({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = '',
}) {
  const wrapperClass = `page-toolbar${className ? ` ${className}` : ''}`

  if (children) {
    return <div className={wrapperClass}>{children}</div>
  }

  return (
    <div className={wrapperClass}>
      <div className="page-toolbar__heading">
        {eyebrow ? <span className="page-toolbar__eyebrow">{eyebrow}</span> : null}
        {title ? <h2 className="page-toolbar__title">{title}</h2> : null}
        {description ? <p className="page-toolbar__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-toolbar__actions">{actions}</div> : null}
    </div>
  )
}
