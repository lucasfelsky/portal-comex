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
    <section className="auth-gate">
      <div className="auth-card" data-testid="not-found-card">
        <span className="eyebrow">Portal COMEX</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>

        <div className="meta-grid" aria-label="Detalhes do erro">
          <div>
            <dt>Código</dt>
            <dd>404</dd>
          </div>
          <div>
            <dt>Caminho</dt>
            <dd className="truncate">{location.pathname || '/'}</dd>
          </div>
        </div>

        <div className="auth-card__actions">
          <Link to="/" className="primary-button" data-testid="not-found-home">
            Voltar para o painel
          </Link>
          <Link to="/news" className="ghost-button" data-testid="not-found-news">
            Ver últimas notícias
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Se você chegou aqui por um link, avise o administrador. Se foi digitando,
          confira o endereço.
        </p>
      </div>
    </section>
  )
}
