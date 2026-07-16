// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActionSheet from '../../src/components/ActionSheet'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gama', disabled: true },
]

afterEach(cleanup)

describe('ActionSheet', () => {
  it('renderiza título e todas as opções', () => {
    render(<ActionSheet title="Status" options={options} value="a" onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument()
    expect(screen.getByText('Gama')).toBeInTheDocument()
  })

  it('marca a opção ativa e desabilita a opção disabled', () => {
    render(<ActionSheet options={options} value="b" onSelect={() => {}} onClose={() => {}} />)
    const beta = screen.getByRole('button', { name: /Beta/ })
    expect(beta.className).toMatch(/action-sheet__option--active/)
    expect(screen.getByText('Gama').closest('button')).toBeDisabled()
  })

  it('selecionar uma opção chama onSelect com o value', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<ActionSheet options={options} value="a" onSelect={onSelect} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Beta/ }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('backdrop, Cancelar e Esc chamam onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <ActionSheet options={options} value="a" onSelect={() => {}} onClose={onClose} />
    )
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await user.click(container.querySelector('.action-sheet-backdrop'))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
