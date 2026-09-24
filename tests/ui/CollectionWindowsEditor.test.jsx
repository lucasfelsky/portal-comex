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
    const notes = screen.getAllByLabelText('Observações do container (opcional)')
    expect(notes[0]).toBeDisabled()
    expect(notes[1]).toBeDisabled()
  })

  it('observacao fica habilitada quando a row tem janela', () => {
    renderEditor({
      value: [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00.000Z', notes: '' }],
    })
    const notes = screen.getAllByLabelText('Observações do container (opcional)')
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
