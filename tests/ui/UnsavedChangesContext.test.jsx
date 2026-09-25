// UX-3a (D1-D8): UnsavedChangesProvider / useUnsavedChanges / useUnsavedChangesGuard.
// Cobre:
//   (a) sem provider: requestLeave executa direto
//   (b) limpo: clicar <Link> navega sem dialogo
//   (c) sujo: clicar <Link> abre o alertdialog "Descartar alterações?"
//   (d) "Continuar editando" fecha o dialogo e mantem a rota
//   (e) "Descartar alterações" navega para o destino
//   (f) Link para o mesmo pathname nao abre dialogo
//   (g) ctrl+clique nao e interceptado
//   (h) beforeunload so' preventDefault quando sujo
//   (i) componente guardado desmontado -> Link navega sem dialogo
//
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import React from 'react'
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
  useUnsavedChangesGuard,
} from '../../src/contexts/UnsavedChangesContext.jsx'

function LocationLabel() {
  const location = useLocation()
  return <span data-testid="current-path">{location.pathname}</span>
}

function DirtyGuard({ isDirty }) {
  useUnsavedChangesGuard(isDirty)
  return null
}

function RequestLeaveButton({ onDone }) {
  const { requestLeave } = useUnsavedChanges()
  return (
    <button type="button" onClick={() => requestLeave(onDone)}>
      Executar acao
    </button>
  )
}

function HomePage({ isDirty = false, mountGuard = true }) {
  return (
    <div>
      <LocationLabel />
      {mountGuard ? <DirtyGuard isDirty={isDirty} /> : null}
      <Link to="/news">Ir para noticias</Link>
      <Link to="/processos">Mesmo pathname (fica no processos)</Link>
    </div>
  )
}

function NewsPage() {
  return (
    <div>
      <LocationLabel />
      <span>Pagina de noticias</span>
    </div>
  )
}

function renderApp({ isDirty = false, mountGuard = true, initialEntries = ['/processos'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <UnsavedChangesProvider>
        <Routes>
          <Route
            path="/processos"
            element={<HomePage isDirty={isDirty} mountGuard={mountGuard} />}
          />
          <Route path="/news" element={<NewsPage />} />
        </Routes>
      </UnsavedChangesProvider>
    </MemoryRouter>
  )
}

describe('UnsavedChangesContext', () => {
  it('(a) sem provider: requestLeave executa a acao direto', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    render(<RequestLeaveButton onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'Executar acao' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('(b) limpo: clicar no Link navega sem dialogo', async () => {
    const user = userEvent.setup()
    renderApp({ isDirty: false })

    await user.click(screen.getByRole('link', { name: 'Ir para noticias' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Pagina de noticias')).toBeInTheDocument()
    })
  })

  it('(c) sujo: clicar no Link abre o alertdialog e nao muda a rota', async () => {
    const user = userEvent.setup()
    renderApp({ isDirty: true })

    await user.click(screen.getByRole('link', { name: 'Ir para noticias' }))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument()
    expect(screen.getByTestId('current-path')).toHaveTextContent('/processos')
  })

  it('(d) "Continuar editando" fecha o dialogo e mantem a rota', async () => {
    const user = userEvent.setup()
    renderApp({ isDirty: true })

    await user.click(screen.getByRole('link', { name: 'Ir para noticias' }))
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/processos')
  })

  it('(e) "Descartar alterações" navega para o destino interceptado', async () => {
    const user = userEvent.setup()
    renderApp({ isDirty: true })

    await user.click(screen.getByRole('link', { name: 'Ir para noticias' }))
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }))

    await waitFor(() => {
      expect(screen.getByText('Pagina de noticias')).toBeInTheDocument()
    })
  })

  it('(f) Link para o mesmo pathname nao abre dialogo', async () => {
    const user = userEvent.setup()
    renderApp({ isDirty: true })

    await user.click(screen.getByRole('link', { name: 'Mesmo pathname (fica no processos)' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('(g) ctrl+clique nao e interceptado', () => {
    renderApp({ isDirty: true })

    fireEvent.click(screen.getByRole('link', { name: 'Ir para noticias' }), { ctrlKey: true })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('(h) beforeunload: defaultPrevented so quando sujo', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/processos']}>
        <UnsavedChangesProvider>
          <Routes>
            <Route path="/processos" element={<HomePage isDirty={false} />} />
          </Routes>
        </UnsavedChangesProvider>
      </MemoryRouter>
    )

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    rerender(
      <MemoryRouter initialEntries={['/processos']}>
        <UnsavedChangesProvider>
          <Routes>
            <Route path="/processos" element={<HomePage isDirty={true} />} />
          </Routes>
        </UnsavedChangesProvider>
      </MemoryRouter>
    )

    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
  })

  it('(i) componente guardado desmontado: Link navega sem dialogo', async () => {
    const user = userEvent.setup()

    function Wrapper() {
      const [showGuard, setShowGuard] = React.useState(true)
      return (
        <div>
          {showGuard ? <DirtyGuard isDirty={true} /> : null}
          <button type="button" onClick={() => setShowGuard(false)}>
            Desmontar guarda
          </button>
          <LocationLabel />
          <Link to="/news">Ir para noticias</Link>
        </div>
      )
    }

    render(
      <MemoryRouter initialEntries={['/processos']}>
        <UnsavedChangesProvider>
          <Routes>
            <Route path="/processos" element={<Wrapper />} />
            <Route path="/news" element={<NewsPage />} />
          </Routes>
        </UnsavedChangesProvider>
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Desmontar guarda' }))
    await user.click(screen.getByRole('link', { name: 'Ir para noticias' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Pagina de noticias')).toBeInTheDocument()
    })
  })
})
