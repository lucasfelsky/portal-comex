// Tests de src/lib/intelliquote.js: regra de visibilidade do botão
// "Fazer uma cotação" (só role user da área Comercial; admin fica de fora
// porque já tem o card IntelliQuote) e URLs.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  INTELLIQUOTE_REQUESTS_URL,
  INTELLIQUOTE_WEB_URL,
  canRequestQuote,
  isCommercialArea,
} from '../../src/lib/intelliquote.js'

describe('canRequestQuote', () => {
  it.each(['Geral', 'Comercial'])('admin com área %s não pode (já tem o card IntelliQuote)', (area) => {
    expect(canRequestQuote({ role: 'admin', area })).toBe(false)
  })

  it.each(['Comercial', ' comercial ', 'COMERCIAL', 'Comercial Sul', 'Comercial  Sul'])(
    'role user com área %j pode',
    (area) => {
      expect(canRequestQuote({ role: 'user', area })).toBe(true)
    }
  )

  it.each(['Geral', '', undefined, null, 'Importação', 'Comércio exterior', 'Comerciais'])(
    'role user com área %j não pode',
    (area) => {
      expect(canRequestQuote({ role: 'user', area })).toBe(false)
    }
  )

  it.each(['logistica', 'compras', 'viewer'])('%s nunca pode, nem com área Comercial', (role) => {
    expect(canRequestQuote({ role, area: 'Comercial' })).toBe(false)
    expect(canRequestQuote({ role, area: 'Importação' })).toBe(false)
  })

  it('profile null/undefined não pode', () => {
    expect(canRequestQuote(null)).toBe(false)
    expect(canRequestQuote(undefined)).toBe(false)
  })
})

describe('isCommercialArea', () => {
  it('aceita Comercial sem acento/caixa e rejeita "Comércio exterior"', () => {
    expect(isCommercialArea('Comercial')).toBe(true)
    expect(isCommercialArea('Comércio exterior')).toBe(false)
  })
})

describe('URLs do IntelliQuote', () => {
  it('URL de solicitações aponta para /solicitacoes da base padrão', () => {
    expect(INTELLIQUOTE_WEB_URL).toBe('https://intelliquote.portal-comex.com')
    expect(INTELLIQUOTE_REQUESTS_URL).toBe('https://intelliquote.portal-comex.com/solicitacoes')
  })
})
