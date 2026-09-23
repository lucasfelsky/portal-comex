// F17.1b: painel da aba "Histórico" (D-8).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ProcessHistoryPanel from '../../src/features/processes/ProcessHistoryPanel'

const mockListProcessEvents = vi.fn()
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: (...args) => mockListProcessEvents(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProcessHistoryPanel', () => {
  it('renderiza data/marco/quem para cada evento, na ordem vinda do repositorio', async () => {
    mockListProcessEvents.mockResolvedValue([
      { id: 'e1', type: 'berthed', value: true, previousValue: false, actorName: 'Admin Um', occurredAt: '2026-09-20T10:00:00.000Z' },
      { id: 'e2', type: 'received', value: '2026-09-21T09:00:00.000Z', previousValue: 'Coleta Agendada', actorName: 'Logi da Silva', occurredAt: '2026-09-21T09:00:00.000Z' },
    ])
    render(<ProcessHistoryPanel processId="p1" />)

    await waitFor(() => expect(screen.getByText('Atracação confirmada')).toBeInTheDocument())
    const items = screen.getAllByRole('article')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Atracação confirmada')
    expect(items[0]).toHaveTextContent('Admin Um')
    expect(items[1]).toHaveTextContent('Carga recebida')
    expect(items[1]).toHaveTextContent('Logi da Silva')
  })

  it('tipo desconhecido usa o fallback "Marco: <type>"', async () => {
    mockListProcessEvents.mockResolvedValue([
      { id: 'e1', type: 'unknownType', value: '', previousValue: '', actorName: 'Admin', occurredAt: '2026-09-20T10:00:00.000Z' },
    ])
    render(<ProcessHistoryPanel processId="p1" />)
    await waitFor(() => expect(screen.getByText('Marco: unknownType')).toBeInTheDocument())
  })

  it("tipo 'shipped' (F17.2a D-9) usa o label Embarque realizado", async () => {
    mockListProcessEvents.mockResolvedValue([
      { id: 'e1', type: 'shipped', value: '2026-09-20', previousValue: '', actorName: 'Admin', occurredAt: '2026-09-20T03:00:00.000Z' },
    ])
    render(<ProcessHistoryPanel processId="p1" />)
    await waitFor(() => expect(screen.getByText('Embarque realizado')).toBeInTheDocument())
  })

  it('vazio mostra a mensagem de sem retroativos', async () => {
    mockListProcessEvents.mockResolvedValue([])
    render(<ProcessHistoryPanel processId="p1" />)
    await waitFor(() => expect(screen.getByText('Nenhum marco registrado')).toBeInTheDocument())
    expect(
      screen.getByText('O histórico registra marcos a partir da ativação desta funcionalidade.')
    ).toBeInTheDocument()
  })

  it('erro mostra alerta com o code', async () => {
    mockListProcessEvents.mockRejectedValue({ code: 'permission-denied', message: 'nope' })
    render(<ProcessHistoryPanel processId="p1" />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('permission-denied')
  })

  it('botao "Atualizar" chama listProcessEvents de novo', async () => {
    mockListProcessEvents.mockResolvedValue([])
    render(<ProcessHistoryPanel processId="p1" />)
    await waitFor(() => expect(mockListProcessEvents).toHaveBeenCalledTimes(1))
    screen.getByRole('button', { name: 'Atualizar' }).click()
    await waitFor(() => expect(mockListProcessEvents).toHaveBeenCalledTimes(2))
  })

  it('desmontar antes da promise resolver nao gera warning de setState (guard isMounted)', async () => {
    let resolvePromise
    mockListProcessEvents.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve
      })
    )
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<ProcessHistoryPanel processId="p1" />)
    unmount()
    resolvePromise([])
    await Promise.resolve()
    expect(
      consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('not wrapped in act'))
    ).toBe(false)
    consoleErrorSpy.mockRestore()
  })
})
