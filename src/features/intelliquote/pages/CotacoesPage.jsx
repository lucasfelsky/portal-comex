import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Index page da feature IntelliQuote dentro do Portal COMEX.
 * A integracao completa (auth compartilhada + componentes React migrados
 * a partir do app.js vanilla) sera feita nas proximas fases.
 */
export default function CotacoesPage() {
  const [backendStatus, setBackendStatus] = useState('verificando')

  useEffect(() => {
    let cancelled = false
    const apiBase = import.meta.env.VITE_INTELLIQUOTE_API_BASE ?? 'http://localhost:3000'
    fetch(`${apiBase}/api/v1/health`, { method: 'GET' })
      .then((res) => {
        if (cancelled) return
        setBackendStatus(res.ok ? 'online' : 'offline')
      })
      .catch(() => {
        if (!cancelled) setBackendStatus('offline')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <h1>Cotação eletrônica (IntelliQuote)</h1>
        <p className="page-subtitle">
          Gestão de cotações internacionais, fornecedores e propostas.
        </p>
      </header>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>Status da integração</h2>
        <ul style={{ marginTop: 12, lineHeight: 1.8 }}>
          <li>
            <strong>Aba no menu lateral:</strong> ativa (visível para perfis <code>admin</code> e{' '}
            <code>comex</code>)
          </li>
          <li>
            <strong>Backend IntelliQuote:</strong>{' '}
            <span
              className={`chip ${
                backendStatus === 'online'
                  ? 'chip-success'
                  : backendStatus === 'offline'
                    ? 'chip-warning'
                    : 'chip-neutral'
              }`}
            >
              {backendStatus === 'online'
                ? 'online'
                : backendStatus === 'offline'
                  ? 'offline (esperado em dev local)'
                  : 'verificando...'}
            </span>
          </li>
          <li>
            <strong>Próximos passos:</strong> migração dos módulos para React e deploy no Google
            Cloud Run.
          </li>
        </ul>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Módulos disponíveis</h2>
        <div className="module-grid" style={{ marginTop: 12 }}>
          <Link to="/cotacoes/fornecedores" className="module-card">
            <h3>Fornecedores</h3>
            <p>Cadastro de fornecedores e contatos (com marcação de contato principal).</p>
            <span className="chip chip-success">disponível</span>
          </Link>
          <div className="module-card module-card-disabled">
            <h3>Cotações</h3>
            <p>Criação, edição e disparo de cotações internacionais.</p>
            <span className="chip chip-neutral">em migração</span>
          </div>
          <div className="module-card module-card-disabled">
            <h3>Propostas</h3>
            <p>Comparação de propostas e cálculo de custo landed.</p>
            <span className="chip chip-neutral">em migração</span>
          </div>
          <div className="module-card module-card-disabled">
            <h3>Relatórios</h3>
            <p>Savings, lead time e taxa de premiação.</p>
            <span className="chip chip-neutral">em migração</span>
          </div>
        </div>
      </section>
    </div>
  )
}