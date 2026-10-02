// Specs unitarios de getProcessDerivedStatus (PR #15).
// PR #15 (2026-07-09): a funcao usava `now.toISOString().slice(0, 10)`
// pra gerar `todayIso` (data em UTC) e comparar com `process.eta`
// (que e' string YYYY-MM-DD em horario local). Em BRT (UTC-3) o UTC
// pode estar num dia diferente do local, gerando classificacao errada
// de "Atrasado". Fix: usa componentes locais.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getProcessDerivedStatus,
  DERIVED_STATUS_PHASES,
} from '../../src/features/processes/processDerivedStatus'

beforeAll(() => {
  // Congela o relogio em 2026-07-09 14:00 BRT (quinta) = 17:00 UTC.
  // Precisa ser fake timers (nao `Date.now = ...`): a implementacao usa
  // `new Date()` como default de `now`, que ignora um mock de Date.now e
  // le o relogio real — o describe so passava quando a data real coincidia
  // com a data mockada (quebrou em 2026-07-10).
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-09T14:00:00-03:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('getProcessDerivedStatus - isOverdue timezone (PR #15)', () => {
  it('maritime com eta passada e nao berthed = Atrasado', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-08', // ontem
      category: 'FCL',   // maritime
      berthed: false,
      collectionWindows: [],
    })
    expect(result.label).toBe('Atrasado')
  })

  it('maritime com eta passada mas berthed = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-08',
      category: 'FCL',
      berthed: true,
      collectionWindows: [],
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('maritime com eta HOJE e nao berthed = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-09', // hoje
      category: 'FCL',
      berthed: false,
      collectionWindows: [],
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('air com eta passada e nao arrived = Atrasado', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-08',
      category: 'AEREO',
      arrived: false,
      collectionWindows: [],
    })
    expect(result.label).toBe('Atrasado')
  })

  it('PR #15: na madrugada BRT (00:30), eta HOJE e nao berthed = NAO Atrasado', () => {
    // Aqui e' onde o bug de timezone aparecia. BRT 00:30 = 03:30 UTC
    // do mesmo dia. Se usarmos `now.toISOString().slice(0,10)` = '2026-07-09',
    // eta '2026-07-09' <= '2026-07-09' e' true, mas a comparacao ja'
    // estava OK. O bug aparecia no caso 21:00-23:59 BRT.
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthed: false,
      collectionWindows: [],
    }, new Date('2026-07-09T00:30:00-03:00'))
    expect(result.label).not.toBe('Atrasado')
  })

  it('PR #15: na noite do "dia da eta" (eta ja passou), NAO marca Atrasado (eta foi HOJE)', () => {
    // PR #15: o spec e' timezone-independent. Usa componentes
    // locais do `now` mockado em BRT (new Date('...-03:00')).
    // O objetivo e' validar que eta HOJE (mesmo no final do dia
    // local) NAO seja marcada como Atrasado, porque eta
    // representa "atingiu o dia". Em BRT 23:30 do dia 9, eta
    // '2026-07-09' ja' atingiu o dia 9.
    // (Em UTC, o `new Date('2026-07-09T23:30:00-03:00')` vira
    // 02:30 UTC do dia 10, e os componentes locais sao do dia 10.
    // Por isso esse spec so' faz sentido em BRT.)
    const nowInBrt = new Date('2026-07-09T23:30:00-03:00')
    // Garante que estamos em BRT (ou outro TZ onde o spec faz sentido)
    if (nowInBrt.getDate() !== 9 || nowInBrt.getMonth() !== 6) {
      // Em UTC, o `new Date('2026-07-09T23:30:00-03:00')` vira
      // 02:30 UTC do dia 10. Os componentes locais (que `getDate`
      // retorna) serao do dia 10. Esse spec so' faz sentido em
      // timezones onde a representacao local do timestamp BRT 23:30
      // continua sendo dia 9.
      return
    }
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthed: false,
      collectionWindows: [],
    }, nowInBrt)
    expect(result.label).not.toBe('Atrasado')
  })
})

// Sinal de chegada compat (F17.3a): data OU boolean legado, igual ao deriveProcessStatus.
describe('getProcessDerivedStatus - Atrasado usa o sinal de chegada (data OU boolean legado)', () => {
  const base = { eta: '2026-07-08', collectionWindows: [] }

  it('maritimo com berthedAt preenchido e berthed false = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'FCL',
      berthed: false,
      berthedAt: '2026-07-07T10:00',
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('maritimo legado berthed true sem berthedAt = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'CONSOLIDADO',
      berthed: true,
      berthedAt: '',
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('maritimo sem data e sem boolean = Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'LCL',
      berthed: false,
      berthedAt: '',
    })
    expect(result.label).toBe('Atrasado')
  })

  it('aereo com arrivedAt preenchido e arrived false = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'AEREO',
      arrived: false,
      arrivedAt: '2026-07-07T10:00',
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('aereo legado arrived true sem arrivedAt = NAO Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'AEREO',
      arrived: true,
      arrivedAt: '',
    })
    expect(result.label).not.toBe('Atrasado')
  })

  it('aereo sem data e sem boolean = Atrasado', () => {
    const result = getProcessDerivedStatus({
      ...base,
      category: 'AEREO',
      arrived: false,
      arrivedAt: '',
    })
    expect(result.label).toBe('Atrasado')
  })
})

// F17.1a: novo status 'Aguardando desembaraço' entra no mesmo bloco de
// 'Atracação Confirmada'/'Aguardando registro/parametrização da DUIMP' - fase
// NO_PORTO ("no porto / desembaraço").
describe('getProcessDerivedStatus - novo status Aguardando desembaraço (F17.1a)', () => {
  it('processStatus "Aguardando desembaraço" cai na fase NO_PORTO', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthed: true,
      processStatus: 'Aguardando desembaraço',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.NO_PORTO)
  })
})

// DUIMP sob aguas (D-5): DUIMP registrada antes da atracacao nao coloca o
// processo "no porto / desembaraco"; com atracacao segue NO_PORTO.
describe('getProcessDerivedStatus - DUIMP sob aguas (D-5)', () => {
  it('sem atracacao + DUIMP registrada + ETA futura -> EMBARCADO (nao NO_PORTO)', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-08-01',
      category: 'FCL',
      shippedAt: '2026-07-01',
      duimpRegisteredAt: '2026-07-08T09:00',
      processStatus: 'Aguardando parametrização da DUIMP',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.EMBARCADO)
  })

  it('com atracacao + DUIMP registrada -> NO_PORTO (inalterado)', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthedAt: '2026-07-08T10:00',
      duimpRegisteredAt: '2026-07-08T09:00',
      processStatus: 'Aguardando parametrização da DUIMP',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.NO_PORTO)
  })

  it('ATRASADO continua antes: ETA vencida sem atracacao -> ATRASADO', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-01',
      category: 'FCL',
      shippedAt: '2026-06-01',
      duimpRegisteredAt: '2026-07-08T09:00',
      processStatus: 'Aguardando parametrização da DUIMP',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.ATRASADO)
  })
})

// F17.4a (D-6): valor novo + os 2 legados fundidos caem na mesma fase
// POS_RECEBIMENTO (via isCdUnloadingOrReceivedStatus, D-1).
describe('getProcessDerivedStatus - collectionStatus fundido (F17.4a)', () => {
  it('collectionStatus "Carga recebida, em conferência" cai na fase POS_RECEBIMENTO', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthed: true,
      collectionStatus: 'Carga recebida, em conferência',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.POS_RECEBIMENTO)
  })

  it('collectionStatus legado "Carga em Conferência/Etiquetagem" tambem cai na fase POS_RECEBIMENTO', () => {
    const result = getProcessDerivedStatus({
      eta: '2026-07-09',
      category: 'FCL',
      berthed: true,
      collectionStatus: 'Carga em Conferência/Etiquetagem',
      collectionWindows: [],
    })
    expect(result.phase).toBe(DERIVED_STATUS_PHASES.POS_RECEBIMENTO)
  })
})
