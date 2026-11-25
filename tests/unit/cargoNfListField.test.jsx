// S9-E do Relatório de Carga: campo "Nº da NF" como lista (chips, botão +, Enter, colar, blur, remover, aria-live).
import fs from 'node:fs'
import path from 'node:path'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CargoNfListField from '../../src/features/processes/CargoNfListField'

const css = fs.readFileSync(path.resolve(__dirname, '../../src/styles.css'), 'utf8').replace(/\r\n/g, '\n')

function Harness({ initial = '', onValue, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <div>
      <CargoNfListField
        value={value}
        onChange={(next) => {
          setValue(next)
          onValue?.(next)
        }}
        {...props}
      />
      <button type="button">Fora</button>
      <output data-testid="value">{value}</output>
    </div>
  )
}

const field = () => screen.getByLabelText('Nº da NF')
const chips = () => within(screen.getByRole('list', { name: 'NFs adicionadas' })).getAllByRole('listitem')
const stored = () => screen.getByTestId('value').textContent

describe('CargoNfListField', () => {
  it('Enter adiciona a NF como chip, limpa o campo e não envia formulário', async () => {
    const user = userEvent.setup()
    const submit = vi.fn((event) => event.preventDefault())
    render(
      <form onSubmit={submit}>
        <Harness />
      </form>
    )
    await user.type(field(), '48213{Enter}')

    expect(chips().map((chip) => chip.textContent)).toEqual(['48213'])
    expect(field()).toHaveValue('')
    expect(field()).toHaveFocus()
    expect(stored()).toBe('48213')
    expect(submit).not.toHaveBeenCalled()
  })

  it('o botão + ("Adicionar NF") inclui a NF (secondary-button) e devolve o foco ao campo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const add = screen.getByRole('button', { name: 'Adicionar NF' })
    expect(add).toHaveClass('secondary-button', 'crf-nfs__add')
    expect(add).not.toHaveClass('ghost-button')

    await user.type(field(), '1')
    await user.click(add)
    await user.type(field(), '2')
    await user.click(add)

    expect(stored()).toBe('1; 2')
    expect(field()).toHaveFocus()
  })

  it('o botão de adicionar é só o ícone +: sem texto visível, com nome acessível e título "Adicionar NF"', () => {
    render(<Harness />)
    const add = screen.getByRole('button', { name: 'Adicionar NF' })

    expect(add).toHaveAttribute('type', 'button')
    expect(add).toHaveAttribute('aria-label', 'Adicionar NF')
    expect(add).toHaveAttribute('title', 'Adicionar NF')
    expect(add.textContent).toBe('')
    expect(add.querySelectorAll('svg')).toHaveLength(1)
    expect(add.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument()
  })

  it('colar com ";" e "," cria vários chips de uma vez', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    await user.paste('123; 456, 789')

    expect(chips().map((chip) => chip.textContent)).toEqual(['123', '456', '789'])
    expect(stored()).toBe('123; 456; 789')
    expect(field()).toHaveValue('')
    expect(screen.getByText('3 NFs adicionadas: 123, 456, 789.')).toBeInTheDocument()
  })

  it('colar sem separador só preenche o campo (não adiciona sozinho)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    await user.paste('000.123.456')

    expect(field()).toHaveValue('000.123.456')
    expect(screen.queryByRole('list', { name: 'NFs adicionadas' })).not.toBeInTheDocument()
  })

  it('o que está digitado já vale no valor (sem sair do campo) e sair do campo não cria chip nem muda o layout', async () => {
    const user = userEvent.setup()
    render(<Harness initial="1" />)
    await user.type(field(), '2')
    expect(stored()).toBe('1; 2')
    expect(screen.getByText(/Fica salvo como:/)).toHaveTextContent('Fica salvo como: 1; 2 · 4 de 1.000 caracteres')
    // Só o "1" é chip; o "2" ainda está no campo.
    expect(chips().map((chip) => chip.textContent)).toEqual(['1'])

    await user.click(screen.getByRole('button', { name: 'Fora' }))

    expect(stored()).toBe('1; 2')
    expect(field()).toHaveValue('2')
    expect(chips().map((chip) => chip.textContent)).toEqual(['1'])
  })

  it('apagar o texto digitado tira a NF do valor; confirmar com Enter vira chip', async () => {
    const user = userEvent.setup()
    render(<Harness initial="1" />)
    await user.type(field(), '23')
    expect(stored()).toBe('1; 23')
    await user.clear(field())
    expect(stored()).toBe('1')

    await user.type(field(), '45{Enter}')
    expect(stored()).toBe('1; 45')
    expect(chips().map((chip) => chip.textContent)).toEqual(['1', '45'])
  })

  it('digitar várias com separador já vale no valor; duplicada e longa demais não entram', async () => {
    const user = userEvent.setup()
    render(<Harness initial="1" />)
    await user.type(field(), '2, 1, 3')
    expect(stored()).toBe('1; 2; 3')
    await user.clear(field())
    await user.type(field(), '9'.repeat(41))
    expect(stored()).toBe('1')
    expect(screen.getByText('Cada NF tem até 40 caracteres.')).toBeInTheDocument()
  })

  it('remover um chip com NF digitada mantém a digitada no valor', async () => {
    const user = userEvent.setup()
    render(<Harness initial="1; 2" />)
    await user.type(field(), '3')
    expect(stored()).toBe('1; 2; 3')

    await user.click(screen.getByRole('button', { name: 'Remover NF 1' }))

    expect(stored()).toBe('2; 3')
    expect(chips().map((chip) => chip.textContent)).toEqual(['2'])
    expect(field()).toHaveValue('3')
  })

  it('valor trocado pelo pai (descartar) zera o que contava como digitado', async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState('1')
      return (
        <div>
          <CargoNfListField value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue('7; 8')}>
            Trocar
          </button>
        </div>
      )
    }
    render(<Parent />)
    await user.type(field(), '2')
    await user.click(screen.getByRole('button', { name: 'Trocar' }))
    expect(chips().map((chip) => chip.textContent)).toEqual(['7', '8'])
  })

  it('somente leitura mostra a NF que estava só digitada (sem Enter): o chip aparece quando disabled liga', async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState('')
      const [locked, setLocked] = useState(false)
      return (
        <div>
          <CargoNfListField value={value} onChange={setValue} disabled={locked} />
          <button type="button" onClick={() => setLocked((current) => !current)}>
            Travar
          </button>
        </div>
      )
    }
    render(<Parent />)
    await user.type(field(), '777')
    await user.click(screen.getByRole('button', { name: 'Travar' }))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(chips().map((chip) => chip.textContent)).toEqual(['777'])
    expect(screen.queryByRole('button', { name: /Remover NF/ })).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('o pai volta o valor ao salvo (Descartar) depois de digitar sem Enter: o campo e o erro limpam', async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState('1')
      return (
        <div>
          <CargoNfListField value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue('1')}>
            Descartar
          </button>
        </div>
      )
    }
    render(<Parent />)
    await user.type(field(), '888')
    expect(screen.getByText(/Fica salvo como:/)).toHaveTextContent('Fica salvo como: 1; 888')

    await user.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(field()).toHaveValue('')
    expect(screen.getByText(/Fica salvo como:/)).toHaveTextContent('Fica salvo como: 1 · 1 de 1.000 caracteres')
    expect(chips().map((chip) => chip.textContent)).toEqual(['1'])
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('o pai troca o valor por outro (recarregar) com texto recusado no campo: limpa o texto e o erro', async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState('48213')
      return (
        <div>
          <CargoNfListField value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue('')}>
            Recarregar
          </button>
        </div>
      )
    }
    render(<Parent />)
    await user.type(field(), '48213{Enter}')
    expect(screen.getByText('Esta NF já está na lista.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Recarregar' }))

    expect(field()).toHaveValue('')
    expect(screen.queryByText('Esta NF já está na lista.')).not.toBeInTheDocument()
    expect(screen.getByText(/Fica salvo como:/)).toHaveTextContent('Fica salvo como: —')
  })

  it('caracteres invisíveis colados (U+200B, U+200D, U+FEFF) não criam NF diferente', async () => {
    const user = userEvent.setup()
    render(<Harness initial="123" />)
    await user.click(field())
    await user.paste('123\u200b; 4\u200d5\ufeff; 6\u00a07')

    expect(stored()).toBe('123; 45; 6 7')
    expect(screen.getByText('Esta NF já está na lista.')).toBeInTheDocument()
  })

  it('o teclado é de texto (NF pode ter ponto, hífen e letras)', () => {
    render(<Harness />)
    expect(field()).toHaveAttribute('inputmode', 'text')
  })

  it('duplicada mostra o erro, não entra e mantém o texto no campo; digitar limpa o erro', async () => {
    const user = userEvent.setup()
    render(<Harness initial="48213" />)
    await user.type(field(), ' 48213 {Enter}')

    const message = screen.getByText('Esta NF já está na lista.')
    expect(message).toHaveClass('field-error')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field().getAttribute('aria-describedby')).toContain(message.id)
    expect(field()).toHaveValue('48213')
    expect(stored()).toBe('48213')

    await user.type(field(), '9')
    expect(screen.queryByText('Esta NF já está na lista.')).not.toBeInTheDocument()
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('NF com mais de 40 caracteres não entra e mostra o erro; as válidas do mesmo colar entram', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    await user.paste(`${'9'.repeat(41)}; 55`)

    expect(screen.getByText('Cada NF tem até 40 caracteres.')).toBeInTheDocument()
    expect(stored()).toBe('55')
    expect(field()).toHaveValue('9'.repeat(41))
  })

  it('limite de 1.000 caracteres: a NF que estoura não entra e o erro avisa', async () => {
    const user = userEvent.setup()
    const full = Array.from({ length: 23 }, (_, index) => String(index).padStart(2, '0').padEnd(40, '7')).join('; ')
    render(<Harness initial={full} />)
    expect(screen.getByText(`${full.length.toLocaleString('pt-BR')} de 1.000 caracteres`, { exact: false })).toBeInTheDocument()

    await user.type(field(), `${'8'.repeat(40)}{Enter}`)

    expect(screen.getByText('A lista de NFs chegou ao limite de 1.000 caracteres.')).toBeInTheDocument()
    expect(stored()).toBe(full)
    expect(field()).toHaveValue('8'.repeat(40))
  })

  it('remover: o foco vai para o chip seguinte, senão o anterior, senão o campo', async () => {
    const user = userEvent.setup()
    render(<Harness initial="1; 2; 3" />)

    await user.click(screen.getByRole('button', { name: 'Remover NF 2' }))
    expect(stored()).toBe('1; 3')
    expect(screen.getByRole('button', { name: 'Remover NF 3' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Remover NF 3' }))
    expect(stored()).toBe('1')
    expect(screen.getByRole('button', { name: 'Remover NF 1' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Remover NF 1' }))
    expect(stored()).toBe('')
    expect(field()).toHaveFocus()
    expect(screen.queryByRole('list', { name: 'NFs adicionadas' })).not.toBeInTheDocument()
  })

  it('aria-live anuncia adicionada e removida', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toBeInTheDocument()

    await user.type(field(), '48213{Enter}')
    expect(live).toHaveTextContent('NF 48213 adicionada.')

    await user.click(screen.getByRole('button', { name: 'Remover NF 48213' }))
    expect(live).toHaveTextContent('NF 48213 removida.')
  })

  it('rodapé "Fica salvo como" com contador "12 de 1.000 caracteres"; sem NF mostra o traço', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText(/Fica salvo como:/)).toHaveTextContent('Fica salvo como: —')

    await user.type(field(), '48213; 48214{Enter}')
    const footer = screen.getByText(/Fica salvo como:/)
    expect(footer).toHaveTextContent('Fica salvo como: 48213; 48214 · 12 de 1.000 caracteres')
    expect(within(footer).getByText('48213; 48214').tagName).toBe('STRONG')
  })

  it('valor antigo (NF-9, "123, 124") vira UM chip', () => {
    const { unmount } = render(<Harness initial="NF-9" />)
    expect(chips().map((chip) => chip.textContent)).toEqual(['NF-9'])
    unmount()
    render(<Harness initial="123, 124" />)
    expect(chips().map((chip) => chip.textContent)).toEqual(['123, 124'])
  })

  it('disabled: só os chips, sem "×", sem campo e sem botão', () => {
    render(<Harness initial="1; 2" disabled />)

    expect(chips().map((chip) => chip.textContent)).toEqual(['1', '2'])
    expect(screen.queryByRole('button', { name: /Remover NF/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar NF' })).not.toBeInTheDocument()
    expect(screen.getByText('Nº da NF')).toBeInTheDocument()
  })

  it('disabled e vazio mostra o traço', () => {
    render(<Harness disabled />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'NFs adicionadas' })).not.toBeInTheDocument()
  })

  it('o primeiro rótulo do bloco é "Nº da NF" (ordem do card) e a variante mobile troca a classe', () => {
    const { container } = render(<Harness variant="mobile" />)
    const root = container.querySelector('.crf-field')
    expect(root).toHaveClass('crf-nfs', 'crf-nfs--mobile')
    expect(root.querySelector('label, span').textContent).toBe('Nº da NF')
    fireEvent.change(field(), { target: { value: '1' } })
    expect(field()).toHaveValue('1')
  })

  it('alvos de 44 px no celular vêm das classes de escopo do JS, sem @media', () => {
    expect(css).toMatch(/\.crf-wrap--mobile \.crf-nfs__add,[\s\S]*?min-height: 44px;/)
    expect(css).toMatch(/\.crf-nfs--mobile \.crf-nf-chip__x::after \{[^}]*inset: -8px;/)
    const start = css.indexOf('/* S9-E do Relatório de Carga')
    expect(start).toBeGreaterThan(0)
    const block = css.slice(start)
    expect(block).not.toMatch(/@media/)
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(block).not.toMatch(/position:\s*fixed/)
  })

  it('o botão + é quadrado (40 px; 44 px no celular) e a linha nunca estoura a coluna da grade', () => {
    expect(css).toMatch(/\.crf-nfs \{\s*min-width: 0;\s*\}/)
    expect(css).toMatch(/\.crf-nfs__row \{\s*min-width: 0;\s*\}/)
    expect(css).toMatch(/\.crf-nfs__row input \{\s*flex: 1 1 0;\s*width: 0;\s*min-width: 0;\s*\}/)
    expect(css).toMatch(/\.crf-nfs \.crf-nfs__add \{[^}]*width: 40px;[^}]*min-width: 40px;[^}]*padding: 0;/)
    expect(css).toMatch(/\.crf-wrap--mobile \.crf-nfs__add,\s*\.crf-nfs--mobile \.crf-nfs__add \{\s*width: 44px;\s*min-width: 44px;/)
  })

  it('a lista de chips tem teto de altura com rolagem (100 NFs não viram um card gigante)', () => {
    expect(css).toMatch(/\.crf-nfs__list \{[^}]*max-height: 9\.5rem;[^}]*overflow-y: auto;/)
  })
})
