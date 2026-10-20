import { Link, useLocation } from 'react-router-dom'

function getErrorTitle(pathname) {
  if (pathname === '/' || pathname === '') return 'Página inicial indisponível'
  return 'Página não encontrada'
}

function getErrorSubtitle(pathname) {
  if (pathname === '/' || pathname === '') {
    return 'A raiz da aplicação não está acessível. Verifique se você está logado.'
  }
  return `O endereço "${pathname}" não corresponde a nenhuma página do Portal COMEX.`
}

export default function NotFoundPage() {
  const location = useLocation()
  const title = getErrorTitle(location.pathname)
  const subtitle = getErrorSubtitle(location.pathname)

  return (
    <section className="auth-screen auth-screen--not-found">
      <div className="auth-card auth-card--form" data-testid="not-found-card">
        <span className="brand__eyebrow">Portal COMEX</span>
        <div className="auth-state__title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="auth-reset-panel auth-error-details" role="group" aria-label="Detalhes do erro">
          <p className="auth-error-code">
            <span className="auth-error-code__label">Código: </span>
            <code>404</code>
          </p>
          <p className="auth-error-path">Caminho: <code>{location.pathname || '/'}</code></p>
        </div>

        <div className="button-row auth-state__actions">
          <Link to="/" className="primary-button" data-testid="not-found-home">
            Voltar para o painel
          </Link>
          <Link to="/news" className="ghost-button ghost-button--secondary" data-testid="not-found-news">
            Ver últimas notícias
          </Link>
        </div>

        <p className="field-hint" style={{ margin: 0 }}>
          Se você chegou aqui por um link, avise o administrador. Se foi digitando,
          confira o endereço.
        </p>
      </div>
    </section>
  )
}
