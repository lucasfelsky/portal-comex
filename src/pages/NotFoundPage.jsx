import { Link, useLocation } from 'react-router-dom'

function getErrorTitle(pathname) {
  if (pathname === '/' || pathname === '') return 'Pagina inicial indisponivel'
  return 'Pagina nao encontrada'
}

function getErrorSubtitle(pathname) {
  if (pathname === '/' || pathname === '') {
    return 'A raiz da aplicacao nao esta acessivel. Verifique se voce esta logado.'
  }
  return `O endereco "${pathname}" nao corresponde a nenhuma pagina do Portal COMEX.`
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
            <dt>Codigo</dt>
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
            Ver ultimas noticias
          </Link>
        </div>

        <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Se voce chegou aqui por um link, avise o administrador. Se foi digitando,
          confira o endereco.
        </p>
      </div>
    </section>
  )
}
