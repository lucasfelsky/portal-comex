import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime, formatRelativeTime } from '../../src/utils/dateFormat'

// Este arquivo NAO depende do fuso da maquina. Nao se pina `process.env.TZ`:
// no worker do vitest (pool threads) a troca em runtime nao chega ao
// `Intl.DateTimeFormat`, alem de mexer em estado global. Os casos de
// `formatDateTime` usam componentes locais (7-9) ou calculam o esperado com
// getters locais da propria data (10).

// Helper (a)+(b)+(c): normaliza whitespace (NBSP/narrow-NBSP -> espaco comum)
// e trava estrutura + valores via regex ancorada com grupos.
function assertPtBr(formatted, { dia, mes, ano, hora, min }) {
  const normalized = formatted.replace(/[\u00A0\u202F]/g, ' ')
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})[\s,]*(?:às)?[\s,]*(\d{2}):(\d{2})$/)
  expect(match).not.toBeNull()
  const [, d, m, y, h, mi] = match
  expect(d).toBe(dia)
  expect(m).toBe(mes)
  expect(y).toBe(ano)
  expect(h).toBe(hora)
  expect(mi).toBe(min)
}

describe('formatDateTime', () => {
  // Caso 1 (migrado)
  it('retorna "-" pra valor vazio', () => {
    expect(formatDateTime('')).toBe('-')
  })

  // Caso 2 (migrado)
  it('retorna "-" pra null', () => {
    expect(formatDateTime(null)).toBe('-')
  })

  // Caso 3 (novo)
  it('retorna "-" pra undefined', () => {
    expect(formatDateTime(undefined)).toBe('-')
  })

  // Caso 4 (novo)
  it('retorna "-" quando chamado sem argumento', () => {
    expect(formatDateTime()).toBe('-')
  })

  // Caso 5 (migrado)
  it('devolve o valor cru quando nao parseavel', () => {
    expect(formatDateTime('nao-e-data')).toBe('nao-e-data')
  })

  // Caso 6 (novo) — R5: devolve o OBJETO Invalid Date, nao string
  it('devolve o proprio objeto Date quando e um Invalid Date', () => {
    const d = new Date('xpto')
    expect(formatDateTime(d)).toBe(d)
  })

  // Caso 7 (novo) — TZ-independente via componentes locais
  it('formata data por componentes locais em pt-BR dd/mm/aaaa hh:mm', () => {
    const d = new Date(2026, 5, 30, 13, 5)
    assertPtBr(formatDateTime(d), { dia: '30', mes: '06', ano: '2026', hora: '13', min: '05' })
  })

  // Caso 8 (novo) — zero-padding
  it('aplica zero-padding em dia, mes, hora e minuto', () => {
    const d = new Date(2026, 0, 5, 9, 7)
    assertPtBr(formatDateTime(d), { dia: '05', mes: '01', ano: '2026', hora: '09', min: '07' })
  })

  // Caso 9 (novo) — hora 24h, sem AM/PM
  it('usa hora em formato 24h, sem indicador AM/PM', () => {
    const d = new Date(2026, 5, 30, 23, 45)
    const formatted = formatDateTime(d)
    assertPtBr(formatted, { dia: '30', mes: '06', ano: '2026', hora: '23', min: '45' })
    expect(formatted).not.toMatch(/AM|PM/i)
  })

  // Caso 10 (migrado, assercao reforcada) — ISO Z -> hora LOCAL. O esperado sai
  // dos getters locais da mesma data, entao vale em qualquer fuso da maquina.
  it('formata ISO em pt-BR dd/mm/aaaa hh:mm, convertendo Z para a hora local', () => {
    const d = new Date('2026-06-30T13:05:00Z')
    assertPtBr(formatDateTime('2026-06-30T13:05:00Z'), {
      dia: String(d.getDate()).padStart(2, '0'),
      mes: String(d.getMonth() + 1).padStart(2, '0'),
      ano: String(d.getFullYear()),
      hora: String(d.getHours()).padStart(2, '0'),
      min: String(d.getMinutes()).padStart(2, '0'),
    })
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-14T12:00:00Z').getTime()

  // Casos 11 e 14 (migrados, agrupados — assercoes preservadas do arquivo original)
  it('vazio ou invalido -> string vazia', () => {
    expect(formatRelativeTime('', now)).toBe('')
    expect(formatRelativeTime('xpto', now)).toBe('')
  })

  // Caso 12 (novo), ao lado do par migrado
  it('null -> string vazia', () => {
    expect(formatRelativeTime(null, now)).toBe('')
  })

  // Caso 13 (novo), ao lado do par migrado
  it('undefined -> string vazia', () => {
    expect(formatRelativeTime(undefined, now)).toBe('')
  })

  // Caso 15 (migrado) — entrada ISO original (formato real do chamador: fetchedAt)
  it('menos de 1 min -> "agora"', () => {
    expect(formatRelativeTime('2026-07-14T11:59:30Z', now)).toBe('agora')
  })

  // Caso 15b (extra numerico) — fronteira 59s
  it('fronteira de 59s -> "agora"', () => {
    expect(formatRelativeTime(now - 59_000, now)).toBe('agora')
  })

  // Caso 16 (novo) — fronteira 60s
  it('fronteira de 60s -> "há 1 min"', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('há 1 min')
  })

  // Caso 17 (migrado) — meio da faixa de minutos, entrada ISO original
  it('minutos no meio da faixa -> "há 15 min"', () => {
    expect(formatRelativeTime('2026-07-14T11:45:00Z', now)).toBe('há 15 min')
  })

  // Caso 18 (novo) — fronteira 59min
  it('fronteira de 59min -> "há 59 min"', () => {
    expect(formatRelativeTime(now - 59 * 60_000, now)).toBe('há 59 min')
  })

  // Caso 19 (novo) — fronteira 60min (min -> hora)
  it('fronteira de 60min (virada min -> hora) -> "há 1h"', () => {
    expect(formatRelativeTime(now - 60 * 60_000, now)).toBe('há 1h')
  })

  // Caso 20 (migrado) — meio da faixa de horas, entrada ISO original
  it('horas no meio da faixa -> "há 2h"', () => {
    expect(formatRelativeTime('2026-07-14T10:00:00Z', now)).toBe('há 2h')
  })

  // Caso 21 (novo) — fronteira 23h
  it('fronteira de 23h -> "há 23h"', () => {
    expect(formatRelativeTime(now - 23 * 60 * 60_000, now)).toBe('há 23h')
  })

  // Caso 22 (novo) — fronteira 24h (hora -> dia)
  it('fronteira de 24h (virada hora -> dia) -> "há 1 d"', () => {
    expect(formatRelativeTime(now - 24 * 60 * 60_000, now)).toBe('há 1 d')
  })

  // Caso 23 (migrado) — meio da faixa de dias, entrada ISO original
  it('dias no meio da faixa -> "há 3 d"', () => {
    expect(formatRelativeTime('2026-07-11T12:00:00Z', now)).toBe('há 3 d')
  })

  // Caso 24 (novo) — dias altos
  it('dias altos -> "há 45 d"', () => {
    expect(formatRelativeTime(now - 45 * 24 * 60 * 60_000, now)).toBe('há 45 d')
  })

  // Caso 25 (migrado) — futuro proximo, entrada ISO original
  it('futuro proximo (relogio dessincronizado) cai em "agora"', () => {
    expect(formatRelativeTime('2026-07-14T12:05:00Z', now)).toBe('agora')
  })

  // Caso 26 (novo) — futuro distante
  it('futuro distante tambem cai em "agora"', () => {
    expect(formatRelativeTime(now + 10 * 24 * 60 * 60_000, now)).toBe('agora')
  })

  // Extra sugerido (nao obrigatorio) — topo da faixa de horas
  it('topo da faixa de horas (23h59min) -> "há 23h"', () => {
    expect(formatRelativeTime(now - (23 * 60 + 59) * 60_000, now)).toBe('há 23h')
  })

  // Caso 27 (novo) — default now = Date.now(), via fake timers, sub-bloco isolado
  describe('com now default (Date.now()) via fake timers', () => {
    const NOW = new Date(2026, 6, 14, 12, 0, 0).getTime()

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('usa Date.now() quando "now" nao e informado -> "há 2h"', () => {
      expect(formatRelativeTime(NOW - 2 * 60 * 60_000)).toBe('há 2h')
    })
  })
})
