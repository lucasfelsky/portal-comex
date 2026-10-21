import { describe, expect, it } from 'vitest'
import {
  buildProcessLinkState,
  getReturnLabel,
  getReturnToFromLocation,
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

  it('readReturnTo e getReturnLabel', () => {
    expect(readReturnTo({ returnTo: '/news' })).toBe('/news')
    expect(readReturnTo({ returnTo: '//x' })).toBe('')
    expect(readReturnTo(null)).toBe('')
    expect(getReturnLabel('/')).toBe('Dashboard')
    expect(getReturnLabel('/notifications?x=1')).toBe('Notificações')
    expect(getReturnLabel('/admin/suporte')).toBe('')
  })
})
