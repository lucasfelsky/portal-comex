import { describe, expect, it } from 'vitest'
import { formatDateTime, formatRelativeTime } from '../../src/utils/dateFormat'

describe('formatDateTime', () => {
  it('formata ISO em pt-BR dd/mm/aaaa hh:mm', () => {
    // 2026-06-30T13:05:00Z — a saida depende do TZ do runner, entao so
    // checamos o shape (dd/mm/aaaa, hh:mm).
    expect(formatDateTime('2026-06-30T13:05:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/)
  })

  it('retorna "-" pra valor vazio', () => {
    expect(formatDateTime('')).toBe('-')
    expect(formatDateTime(null)).toBe('-')
  })

  it('devolve o valor cru quando nao parseavel', () => {
    expect(formatDateTime('nao-e-data')).toBe('nao-e-data')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-14T12:00:00Z').getTime()

  it('menos de 1 min -> "agora"', () => {
    expect(formatRelativeTime('2026-07-14T11:59:30Z', now)).toBe('agora')
  })

  it('minutos', () => {
    expect(formatRelativeTime('2026-07-14T11:45:00Z', now)).toBe('há 15 min')
  })

  it('horas', () => {
    expect(formatRelativeTime('2026-07-14T10:00:00Z', now)).toBe('há 2h')
  })

  it('dias', () => {
    expect(formatRelativeTime('2026-07-11T12:00:00Z', now)).toBe('há 3 d')
  })

  it('futuro (relogio dessincronizado) cai em "agora"', () => {
    expect(formatRelativeTime('2026-07-14T12:05:00Z', now)).toBe('agora')
  })

  it('vazio ou invalido -> string vazia', () => {
    expect(formatRelativeTime('', now)).toBe('')
    expect(formatRelativeTime('xpto', now)).toBe('')
  })
})
