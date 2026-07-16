// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectField from '../../src/components/SelectField'

function setMatchMedia(isMobile) {
  window.matchMedia = (query) => ({
    matches: isMobile && /max-width:\s*720px/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// Options como filhas DIRETAS (espelha o uso real no ProcessForm, onde os
// <option> vêm de um array .map achatado — não de um componente wrapper).
const OPTS = [
  <option key="" value="">Selecione</option>,
  <option key="FCL" value="FCL">FCL</option>,
  <option key="LCL" value="LCL">LCL</option>,
  <option key="AEREO" value="AEREO">Aéreo</option>,
]

afterEach(cleanup)

describe('SelectField', () => {
  it('desktop: renderiza <select> nativo e NÃO renderiza o gatilho mobile', () => {
    setMatchMedia(false)
    const onChange = vi.fn()
    const { container } = render(
      <SelectField value="FCL" onChange={onChange}>{OPTS}</SelectField>
    )
    expect(container.querySelector('select')).toBeInTheDocument()
    expect(container.querySelector('.select-field__trigger')).toBeNull()
  })

  it('desktop: mudar o select nativo dispara onChange', async () => {
    setMatchMedia(false)
    const onChange = vi.fn()
    const { container } = render(
      <SelectField value="FCL" onChange={onChange}>{OPTS}</SelectField>
    )
    const user = userEvent.setup()
    await user.selectOptions(container.querySelector('select'), 'LCL')
    expect(onChange).toHaveBeenCalled()
  })

  it('mobile: mostra o gatilho com o label atual e mantém o <select> nativo (fallback)', () => {
    setMatchMedia(true)
    const { container } = render(
      <SelectField value="AEREO" onChange={() => {}} sheetTitle="Categoria">{OPTS}</SelectField>
    )
    // select nativo continua presente (fonte da verdade / fallback)
    expect(container.querySelector('select')).toBeInTheDocument()
    const trigger = container.querySelector('.select-field__trigger')
    expect(trigger).toBeInTheDocument()
    expect(trigger).toHaveTextContent('Aéreo')
  })

  it('mobile: extrai opções dentro de <optgroup> (CollectionStatusEditView)', async () => {
    setMatchMedia(true)
    const onChange = vi.fn()
    render(
      <SelectField value="" onChange={onChange} sheetTitle="Coleta">
        <option value="">Selecione</option>
        <optgroup label="Em rota">
          <option value="rota">CD em rota</option>
        </optgroup>
        <optgroup label="Pós-recebimento">
          <option value="recebida">Carga recebida</option>
        </optgroup>
      </SelectField>
    )
    const user = userEvent.setup()
    await user.click(document.querySelector('.select-field__trigger'))
    const sheet = document.querySelector('.action-sheet')
    // opção aninhada no optgroup aparece (com o label do grupo como prefixo)
    await user.click(within(sheet).getByRole('button', { name: /Carga recebida/ }))
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'recebida' } })
  })

  it('mobile: tocar no gatilho abre o ActionSheet; selecionar dispara onChange com {target:{value}}', async () => {
    setMatchMedia(true)
    const onChange = vi.fn()
    render(
      <SelectField value="FCL" onChange={onChange} sheetTitle="Categoria">{OPTS}</SelectField>
    )
    const user = userEvent.setup()
    await user.click(document.querySelector('.select-field__trigger'))
    // sheet abriu
    const sheet = document.querySelector('.action-sheet')
    expect(sheet).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: /LCL/ }))
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'LCL' } })
    // fecha após selecionar
    expect(document.querySelector('.action-sheet')).toBeNull()
  })
})
