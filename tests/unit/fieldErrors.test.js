// UX-3b (D6): utilitario puro de acessibilidade de erro de campo. Nao entra
// na contagem `tests.totalFiles` do audit-vault-counts.cjs.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getFieldA11yProps, getFieldErrorId } from '../../src/utils/fieldErrors'

describe('getFieldErrorId', () => {
  it('sufixa "-error" no id do campo', () => {
    expect(getFieldErrorId('process-field-etd')).toBe('process-field-etd-error')
  })
})

describe('getFieldA11yProps', () => {
  it('sem erro e sem hints: id presente, aria-invalid e aria-describedby undefined', () => {
    const props = getFieldA11yProps('process-field-etd', null)
    expect(props).toEqual({
      id: 'process-field-etd',
      'aria-invalid': undefined,
      'aria-describedby': undefined,
    })
  })

  it('com erro: aria-invalid "true" e aria-describedby aponta pro id do erro', () => {
    const props = getFieldA11yProps('process-field-etd', 'Data inválida: informe um ano entre 2000 e 2100.')
    expect(props['aria-invalid']).toBe('true')
    expect(props['aria-describedby']).toBe('process-field-etd-error')
  })

  it('com erro e hints: aria-describedby lista o erro seguido dos hints', () => {
    const props = getFieldA11yProps('process-field-etd', 'erro', ['hint-1', 'hint-2'])
    expect(props['aria-describedby']).toBe('process-field-etd-error hint-1 hint-2')
  })

  it('sem erro mas com hints: aria-invalid undefined, aria-describedby so os hints', () => {
    const props = getFieldA11yProps('process-field-etd', null, ['hint-1'])
    expect(props['aria-invalid']).toBeUndefined()
    expect(props['aria-describedby']).toBe('hint-1')
  })
})
