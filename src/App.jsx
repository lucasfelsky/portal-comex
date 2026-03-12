import React from 'react'

function Section({ title, description }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>SQ Comex Updates</h1>
        <p>Esqueleto inicial para implementarmos as funcionalidades por etapas.</p>
      </header>

      <main className="grid">
        <Section
          title="Autenticação"
          description="TODO: fluxo de login, permissões e recuperação de conta."
        />
        <Section
          title="Processos"
          description="TODO: listagem, filtros e detalhe de processos."
        />
        <Section
          title="Administração"
          description="TODO: gestão de usuários, papéis e auditoria."
        />
      </main>
    </div>
  )
}
