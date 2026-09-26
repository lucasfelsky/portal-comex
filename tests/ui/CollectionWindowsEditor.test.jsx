// F17.2d-2 (D-11, Q7): CollectionWindowsEditor - 1 linha de janela por
// contêiner em FCL/CONSOLIDADO com containers[] cadastrados; LCL/AEREO (ou
// FCL/CONSOLIDADO sem containers) mantem o comportamento de janela unica.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionWindowsEditor from '../../src/features/processes/CollectionWindowsEditor'

const CONTAINERS = [
  { id: 'CNT-1', number: 'CSQU3054383' },
  { id: 'CNT-2', number: 'MSCU1234566' },
]

function renderEditor(props = {}) {
  const onChange = vi.fn()
  render(
    <CollectionWindowsEditor
      value={[]}
      category="FCL"
      containers={CONTAINERS}
      onChange={onChange}
      {...props}
    />
  )
  return { onChange }
}

describe('CollectionWindowsEditor — 1 row por contêiner (F17.2d-2)', () => {
  it('preencher horario de row vazia CRIA a janela do contêiner correspondente', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()

    const inputs = screen.getAllByLabelText('Horário previsto')
    await user.type(inputs[1], '2026-07-08T10:00')

    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls.at(-1)[0]
    expect(lastCall).toHaveLength(1)
    expect(lastCall[0]).toMatchObject({ containerId: 'CNT-2', containerNumber: 2 })
  })

  it('limpar o horario REMOVE a janela (onChange sem janela vazia)', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor({
      value: [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
    })

    const inputs = screen.getAllByLabelText('Horário previsto')
    await user.clear(inputs[0])

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('observacao fica desabilitada enquanto a row nao tem janela', () => {
    renderEditor()
    const notes = screen.getAllByLabelText('Observações do contêiner (opcional)')
    expect(notes[0]).toBeDisabled()
    expect(notes[1]).toBeDisabled()
  })

  it('observacao fica habilitada quando a row tem janela', () => {
    renderEditor({
      value: [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
    })
    const notes = screen.getAllByLabelText('Observações do contêiner (opcional)')
    expect(notes[0]).not.toBeDisabled()
    expect(notes[1]).toBeDisabled()
  })

  it('ordem das rows = ordem de containers[], mesmo com janelas em ordem de data inversa', () => {
    renderEditor({
      value: [
        { id: 'W2', containerId: 'CNT-2', containerNumber: 2, scheduledAt: '2026-07-08T08:00:00.000Z', notes: '' },
        { id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' },
      ],
    })
    const labels = screen.getAllByText(/CSQU3054383|MSCU1234566/)
    expect(labels[0]).toHaveTextContent('CSQU3054383')
    expect(labels[1]).toHaveTextContent('MSCU1234566')
  })

  it('nao mostra botoes de adicionar/remover contêiner nem select de contêiner', () => {
    renderEditor()
    expect(screen.queryByRole('button', { name: 'Adicionar container' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar primeira janela' })).not.toBeInTheDocument()
    expect(screen.queryByText('Contêiner')).not.toBeInTheDocument()
  })

  it('disabled desabilita todos os inputs', () => {
    renderEditor({ disabled: true })
    screen.getAllByLabelText('Horário previsto').forEach((input) => expect(input).toBeDisabled())
  })

  it('LCL continua com janela unica ("Adicionar janela")', () => {
    renderEditor({ category: 'LCL', containers: [] })
    expect(screen.getByRole('button', { name: 'Adicionar janela' })).toBeInTheDocument()
  })
})

// UX-6b-2 (D-7/D-8): chip "Salvo: …" via prop `savedValue`, sem o card
// "Janela atual".
describe('CollectionWindowsEditor — chip "Salvo: …" (UX-6b-2)', () => {
  const SAVED_10H = [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }]

  it('(a) savedValue com horario diferente do atual mostra "Salvo:"; igual ou sem savedValue nao mostra', () => {
    const { rerender } = render(
      <CollectionWindowsEditor
        value={[{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T11:00:00.000Z', notes: '' }]}
        savedValue={SAVED_10H}
        category="FCL"
        containers={CONTAINERS}
        onChange={() => {}}
      />
    )
    expect(screen.getByText(/^Salvo:/)).toBeInTheDocument()

    rerender(
      <CollectionWindowsEditor
        value={SAVED_10H}
        savedValue={SAVED_10H}
        category="FCL"
        containers={CONTAINERS}
        onChange={() => {}}
      />
    )
    expect(screen.queryByText(/^Salvo:/)).not.toBeInTheDocument()

    rerender(
      <CollectionWindowsEditor
        value={SAVED_10H}
        category="FCL"
        containers={CONTAINERS}
        onChange={() => {}}
      />
    )
    expect(screen.queryByText(/^Salvo:/)).not.toBeInTheDocument()
  })

  it('(b) value limpo com savedValue preenchido mostra "Salvo:"', () => {
    render(
      <CollectionWindowsEditor
        value={[]}
        savedValue={SAVED_10H}
        category="FCL"
        containers={CONTAINERS}
        onChange={() => {}}
      />
    )
    expect(screen.getByText(/^Salvo:/)).toBeInTheDocument()
  })

  it('(c) hint "Limpar o horário remove a janela." aparece uma unica vez com 2 conteineres', () => {
    renderEditor()
    expect(screen.getAllByText('Limpar o horário remove a janela.')).toHaveLength(1)
  })

  it('(d) LCL mostra o rotulo "Observações da coleta (opcional)"', () => {
    renderEditor({
      category: 'LCL',
      containers: [],
      value: [{ id: 'W1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
    })
    expect(screen.getByLabelText('Observações da coleta (opcional)')).toBeInTheDocument()
  })

  it('(e) "Janela atual" nunca aparece, nos 2 modos', () => {
    renderEditor()
    expect(screen.queryByText('Janela atual')).not.toBeInTheDocument()
    renderEditor({ category: 'LCL', containers: [] })
    expect(screen.queryByText('Janela atual')).not.toBeInTheDocument()
  })

  it('(f) janela orfa mostra o horario formatado e o botão "Remover"', () => {
    renderEditor({
      value: [{ id: 'W1', containerId: 'CNT-REMOVIDO', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
    })
    expect(screen.getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
  })
})
