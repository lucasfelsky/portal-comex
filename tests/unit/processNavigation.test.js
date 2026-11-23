import { describe, expect, it } from 'vitest'
import {
  buildProcessLinkState,
  getReturnLabel,
  getReturnToFromLocation,
  isSafeReturnTo,
  PROCESS_DETAIL_TABS,
  readProcessLinkFromSearch,
  readReturnTo,
} from '../../src/utils/processNavigation'

describe('processNavigation (origem do deep link do detalhe)', () => {
  it('getReturnToFromLocation: origem fora de /processos vira returnTo (com query); /processos e vazio, nao', () => {
    expect(getReturnToFromLocation({ pathname: '/', search: '' })).toBe('/')
    expect(getReturnToFromLocation({ pathname: '/notifications', search: '?a=1' })).toBe('/notifications?a=1')
    expect(getReturnToFromLocation({ pathname: '/processos', search: '' })).toBe('')
    expect(getReturnToFromLocation(null)).toBe('')
  })

  it('buildProcessLinkState: so inclui returnTo valido e nunca /processos', () => {
    expect(buildProcessLinkState('p1', 'general', '/')).toEqual({
      selectedProcessId: 'p1',
      detailTab: 'general',
      returnTo: '/',
    })
    expect(buildProcessLinkState('p1', 'messages')).toEqual({ selectedProcessId: 'p1', detailTab: 'messages' })
    expect(buildProcessLinkState('p1', 'messages', '/processos')).not.toHaveProperty('returnTo')
    expect(buildProcessLinkState('p1', 'messages', '//evil.com')).not.toHaveProperty('returnTo')
    expect(buildProcessLinkState('p1', 'messages', 'https://evil.com')).not.toHaveProperty('returnTo')
  })

  it('isSafeReturnTo rejeita barra invertida; %5C (percent-encoded) e aceito como caminho interno', () => {
    for (const value of ['/\\evil.com', '/\\\\evil.com', '\\evil.com', '/ok?x=a\\b', '//evil.com', 'https://evil.com', undefined]) {
      expect(isSafeReturnTo(value)).toBe(false)
    }
    for (const value of ['/', '/news', '/processos?processo=ID&aba=documents', '/destino-original#sec', '/%5Cevil.com']) {
      expect(isSafeReturnTo(value)).toBe(true)
    }

    expect(readReturnTo({ returnTo: '/\\evil.com' })).toBe('')
    expect(readReturnTo({ returnTo: '/%5Cevil.com' })).toBe('/%5Cevil.com')

    expect(buildProcessLinkState('p1', 'messages', '/\\evil.com')).not.toHaveProperty('returnTo')
    expect(buildProcessLinkState('p1', 'messages', '\\evil.com')).not.toHaveProperty('returnTo')
    expect(buildProcessLinkState('p1', 'messages', '/%5Cevil.com')).toHaveProperty('returnTo', '/%5Cevil.com')

    expect(getReturnToFromLocation({ pathname: '/\\evil.com', search: '' })).toBe('')
    expect(getReturnToFromLocation({ pathname: '/news', search: '?q=a\\b' })).toBe('')
    expect(getReturnToFromLocation({ pathname: '/%5Cevil.com', search: '' })).toBe('/%5Cevil.com')
  })

  it('readReturnTo e getReturnLabel', () => {
    expect(readReturnTo({ returnTo: '/news' })).toBe('/news')
    expect(readReturnTo({ returnTo: '//x' })).toBe('')
    expect(readReturnTo(null)).toBe('')
    expect(getReturnLabel('/')).toBe('Dashboard')
    expect(getReturnLabel('/notifications?x=1')).toBe('Notificações')
    expect(getReturnLabel('/admin/suporte')).toBe('')
  })
})

describe('readProcessLinkFromSearch (deep link por URL)', () => {
  it('PROCESS_DETAIL_TABS lista as 6 abas reais do detalhe, na ordem', () => {
    expect(PROCESS_DETAIL_TABS).toEqual(['general', 'process', 'items', 'messages', 'history', 'documents'])
  })

  it('le processo e aba, com ou sem "?"', () => {
    expect(readProcessLinkFromSearch('?processo=p-1&aba=documents')).toEqual({
      selectedProcessId: 'p-1',
      detailTab: 'documents',
    })
    expect(readProcessLinkFromSearch('processo=p-1&aba=history')).toEqual({
      selectedProcessId: 'p-1',
      detailTab: 'history',
    })
  })

  it('aba invalida ou ausente cai em general', () => {
    expect(readProcessLinkFromSearch('?processo=p-1&aba=xyz')).toEqual({
      selectedProcessId: 'p-1',
      detailTab: 'general',
    })
    expect(readProcessLinkFromSearch('?processo=p-1')).toEqual({
      selectedProcessId: 'p-1',
      detailTab: 'general',
    })
  })

  it('processo vazio, grande demais ou entrada nao-string -> null', () => {
    expect(readProcessLinkFromSearch('?processo=&aba=documents')).toBeNull()
    expect(readProcessLinkFromSearch('?processo=%20%20')).toBeNull()
    expect(readProcessLinkFromSearch('?aba=documents')).toBeNull()
    expect(readProcessLinkFromSearch(`?processo=${'a'.repeat(201)}`)).toBeNull()
    expect(readProcessLinkFromSearch(`?processo=${'a'.repeat(200)}`)).not.toBeNull()
    expect(readProcessLinkFromSearch(undefined)).toBeNull()
    expect(readProcessLinkFromSearch(42)).toBeNull()
  })

  it('decodifica o id (%2F)', () => {
    expect(readProcessLinkFromSearch('?processo=a%2Fb&aba=documents')).toEqual({
      selectedProcessId: 'a/b',
      detailTab: 'documents',
    })
  })
})
