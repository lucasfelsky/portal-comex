// S9-F do Relatório de Carga: lista e contador da aba Conferência (regras puras): quem entra, estado do cartão, texto
// de "quando", busca sem acento, ordem e contagem. O relógio é injetado (`now` local); nada de `toISOString` nas datas.
import { describe, expect, it } from 'vitest'
import {
  CARGO_CONFERENCE_STATES,
  countCargoConferenceFilters,
  countCargoConferencesToDo,
  describeCargoConferenceCategory,
  describeCargoConferenceSupplier,
  describeCargoConferenceWhen,
  filterCargoConferenceEntries,
  isCargoConferenceCandidate,
  summarizeCargoConferenceEntry,
} from '../../src/features/processes/cargoConferenceList'
import { DERIVED_STATUS_PHASES } from '../../src/features/processes/processDerivedStatus'

// 25/11/2026 23:30 no fuso do aparelho (perto da meia-noite: o "hoje" não pode pular de dia).
const NOW = new Date(2026, 10, 25, 23, 30)
const iso = (...args) => new Date(...args).toISOString()

const base = (overrides) => ({ id: 'p', name: 'ACME SEA 021-26', category: 'FCL', archived: false, ...overrides })
const scheduled = (overrides, at = iso(2026, 10, 27, 10, 0)) =>
  base({ collectionWindows: [{ id: 'w1', scheduledAt: at }], ...overrides })

const SCHEDULED = scheduled({ id: 'agendada' })
const EN_ROUTE = base({ id: 'rota', collectionStatus: 'Carga a caminho do CD' })
const RECEIVED = base({ id: 'recebida', collectionStatus: 'Veículo no CD para descarga' })
const IN_STOCK = base({ id: 'estoque', collectionStatus: 'Carga disponível em estoque' })

describe('quem entra na lista', () => {
  it('Coleta agendada, Carga a caminho do CD, Recebida no CD e Concluído (não arquivado) entram', () => {
    // S9-G: além da fase, precisa de previsão de chegada na semana vigente (aqui: coleta feita, recebida em 24/11 e 23/11).
    const enRoute = { ...EN_ROUTE, collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 25, 8, 0) }] }
    const received = { ...RECEIVED, cargoReceivedAt: iso(2026, 10, 24, 15, 0) }
    const inStock = { ...IN_STOCK, cargoReceivedAt: iso(2026, 10, 23, 15, 0) }
    for (const process of [SCHEDULED, enRoute, received, inStock]) {
      expect(isCargoConferenceCandidate(process, NOW), process.id).toBe(true)
    }
    // Sem nenhuma data de chegada (sem janela, sem ETA, sem recebimento) fica fora.
    for (const process of [EN_ROUTE, RECEIVED, IN_STOCK]) {
      expect(isCargoConferenceCandidate(process, NOW), process.id).toBe(false)
    }
  })

  it('Atrasado, Embarcado, arquivado e auto-arquivado ficam fora', () => {
    const late = base({ id: 'atrasado', eta: '2026-11-01', collectionWindows: [] })
    const shipped = base({ id: 'embarcado', processStatus: 'Embarcou' })
    expect(isCargoConferenceCandidate(late, NOW)).toBe(false)
    expect(isCargoConferenceCandidate(shipped, NOW)).toBe(false)
    expect(isCargoConferenceCandidate({ ...EN_ROUTE, archived: true }, NOW)).toBe(false)
    // Recebido há 8 dias: `listProcesses` o devolve com `archived: true, autoArchived: true`.
    expect(isCargoConferenceCandidate({ ...RECEIVED, archived: true, autoArchived: true }, NOW)).toBe(false)
    expect(isCargoConferenceCandidate(null, NOW)).toBe(false)
  })

  it('`collectionScheduledAt` legado, sem `collectionWindows`, vira Coleta agendada', () => {
    const legacy = base({ id: 'legado', collectionScheduledAt: iso(2026, 10, 28, 8, 0) })
    expect(isCargoConferenceCandidate(legacy, NOW)).toBe(true)
    const entry = summarizeCargoConferenceEntry(legacy, undefined, { now: NOW })
    expect(entry.phase.phase).toBe(DERIVED_STATUS_PHASES.COLETA_AGENDADA)
  })

  it('coleta só no passado já é "a caminho" (entra); janela sem data não é coleta agendada', () => {
    const past = scheduled({ id: 'passada' }, iso(2026, 10, 20, 10, 0))
    expect(summarizeCargoConferenceEntry(past, undefined, { now: NOW }).phase.phase).toBe(DERIVED_STATUS_PHASES.EM_ROTA)
    const undated = base({ id: 'sem-data', collectionWindows: [{ id: 'w', scheduledAt: '' }] })
    expect(isCargoConferenceCandidate(undated, NOW)).toBe(false)
  })
})

describe('estado do cartão', () => {
  const rows = [
    { id: 'r-1', dbcorpCode: 'A1', quantityKg: 10 },
    { id: 'r-2', dbcorpCode: 'A2', quantityKg: 20 },
    { id: 'r-3', dbcorpCode: 'A3', quantityKg: 30 },
  ]
  const current = (overrides) => ({ status: 'concluido', revision: 2, rows, ...overrides })
  const summarize = (report, options) => summarizeCargoConferenceEntry(SCHEDULED, report, { now: NOW, ...options })

  it('carregando (relatório ainda não chegou) e erro de leitura', () => {
    expect(summarize(undefined).state).toBe(CARGO_CONFERENCE_STATES.loading)
    expect(summarize(undefined, { error: true }).state).toBe(CARGO_CONFERENCE_STATES.error)
  })

  it('sem relatório do COMEX (doc `current` inexistente) = sem, bloqueado', () => {
    const entry = summarize({ current: null, conference: null })
    expect(entry).toMatchObject({ state: 'sem', done: 0, total: 0, processId: 'agendada' })
  })

  it('nova: nada conferido, sem status do recebimento e sem NF', () => {
    const entry = summarize({ current: current(), conference: null })
    expect(entry).toMatchObject({ state: 'nova', done: 0, total: 3, comexStatus: 'concluido' })
  })

  it('andamento: algo conferido, ou status do recebimento, ou NF', () => {
    const marked = summarize({
      current: current(),
      conference: { okByRowId: { 'r-1': true }, countOkByRowId: { 'r-1': true } },
    })
    expect(marked).toMatchObject({ state: 'andamento', done: 1 })
    // Só o OK? marcado ainda não é "conferido" (0 conferidos, sem status, sem NF): segue "nova" (conta no contador).
    expect(summarize({ current: current(), conference: { okByRowId: { 'r-1': true } } }).state).toBe('nova')
    expect(summarize({ current: current(), conference: { receiptStatus: 'sem_ressalva' } }).state).toBe('andamento')
    expect(summarize({ current: current(), conference: { receiptStatus: '', nfNumber: '48213' } }).state).toBe('andamento')
  })

  it('progresso só conta linhas com OK? e Contagem', () => {
    const entry = summarize({
      current: current(),
      conference: {
        okByRowId: { 'r-1': true, 'r-2': true, 'r-3': false },
        countOkByRowId: { 'r-1': true, 'r-3': true },
      },
    })
    expect(entry).toMatchObject({ done: 1, total: 3, state: 'andamento' })
  })

  it('fechada: conferência com status fechada; COMEX em rascunho aparece no selo do COMEX', () => {
    const closed = summarize({ current: current(), conference: { status: 'fechada', receiptStatus: 'sem_ressalva' } })
    expect(closed.state).toBe('fechada')
    expect(summarize({ current: current({ status: 'rascunho' }), conference: null }).comexStatus).toBe('rascunho')
  })

  it('conferência anterior à S7 (sem receiptStatus) lê o rodapé do `current` legado', () => {
    const entry = summarize({
      current: current({ nfNumber: '123', receiptStatus: 'sem_ressalva' }),
      conference: { okByRowId: {} },
    })
    expect(entry.state).toBe('andamento')
  })

  it('a fase vem de getProcessDerivedStatus (rótulo e tom)', () => {
    const entry = summarizeCargoConferenceEntry(EN_ROUTE, undefined, { now: NOW })
    expect(entry.phase).toMatchObject({ phase: 'em_rota', label: 'Carga a caminho do CD', tone: 'info' })
  })
})

describe('contadores', () => {
  const entry = (state) => ({ state, week: 'atual' })

  it('contador = nova + andamento (sem bloqueados, fechadas, erro e carregando)', () => {
    const entries = ['nova', 'andamento', 'andamento', 'sem', 'fechada', 'erro', 'carregando'].map(entry)
    expect(countCargoConferencesToDo(entries)).toBe(3)
    expect(countCargoConferencesToDo([])).toBe(0)
  })

  it('chips: "Para conferir" = tudo que não é fechada (inclui bloqueados); "Fechadas" = fechada', () => {
    const entries = ['nova', 'sem', 'fechada', 'fechada', 'erro'].map(entry)
    expect(countCargoConferenceFilters(entries)).toEqual({ pendentes: 3, fechadas: 2 })
  })
})

describe('texto de "quando" (relógio local, 23:30 de 25/11)', () => {
  const when = (process, phase) => describeCargoConferenceWhen(process, phase, NOW)

  it('coleta hoje, amanhã e em outro dia, sem pular de dia perto da meia-noite', () => {
    expect(when(scheduled({}, iso(2026, 10, 25, 23, 50)), 'coleta_agendada')).toBe('Coleta hoje 23:50')
    expect(when(scheduled({}, iso(2026, 10, 26, 9, 30)), 'coleta_agendada')).toBe('Coleta amanhã 09:30')
    expect(when(scheduled({}, iso(2026, 10, 28, 10, 0)), 'coleta_agendada')).toBe('Coleta 28/11 10:00')
  })

  it('usa a próxima janela datada futura (a de antes já passou)', () => {
    const process = base({
      collectionWindows: [
        { id: 'a', scheduledAt: iso(2026, 10, 24, 8, 0) },
        { id: 'b', scheduledAt: iso(2026, 10, 30, 14, 15) },
      ],
    })
    expect(when(process, 'coleta_agendada')).toBe('Coleta 30/11 14:15')
  })

  it('em rota: "Coleta feita DD/MM" (última janela passada) ou "A caminho do CD"', () => {
    expect(when(scheduled({}, iso(2026, 10, 24, 8, 0)), 'em_rota')).toBe('Coleta feita 24/11')
    expect(when(EN_ROUTE, 'em_rota')).toBe('A caminho do CD')
  })

  it('recebida: hoje, ontem, data ou "Recebida no CD"', () => {
    const received = (at) => base({ cargoReceivedAt: at })
    expect(when(received(iso(2026, 10, 25, 0, 5)), 'pos_recebimento')).toBe('Recebida hoje')
    expect(when(received(iso(2026, 10, 24, 22, 0)), 'pos_recebimento')).toBe('Recebida ontem')
    expect(when(received(iso(2026, 10, 21, 9, 0)), 'concluido')).toBe('Recebida 21/11')
    // Recebida de fato (sem data gravada): o fixture RECEIVED está em descarga, então usa-se "Carga recebida".
    expect(when(base({ collectionStatus: 'Carga recebida' }), 'pos_recebimento')).toBe('Recebida no CD')
  })

  it('recebida de fato (conferência/etiquetagem, recebida) continua "Recebida hoje/ontem/dd/mm"', () => {
    for (const collectionStatus of ['Carga recebida', 'Carga recebida, em conferência', 'Carga em conferência/etiquetagem']) {
      const received = (at) => base({ collectionStatus, cargoReceivedAt: at })
      expect(when(received(iso(2026, 10, 25, 0, 5)), 'pos_recebimento'), collectionStatus).toBe('Recebida hoje')
      expect(when(received(iso(2026, 10, 24, 22, 0)), 'pos_recebimento'), collectionStatus).toBe('Recebida ontem')
      expect(when(received(iso(2026, 10, 21, 9, 0)), 'pos_recebimento'), collectionStatus).toBe('Recebida 21/11')
    }
  })

  it('em descarga (L174): "Descarga em andamento", sem data, com `cargoReceivedAt` hoje, ontem ou outro dia', () => {
    const unloading = (at) => base({ collectionStatus: 'Veículo no CD para descarga', cargoReceivedAt: at })
    expect(when(unloading(iso(2026, 10, 25, 0, 5)), 'pos_recebimento')).toBe('Descarga em andamento')
    expect(when(unloading(iso(2026, 10, 24, 22, 0)), 'pos_recebimento')).toBe('Descarga em andamento')
    expect(when(unloading(iso(2026, 10, 21, 9, 0)), 'pos_recebimento')).toBe('Descarga em andamento')
  })

  it('em descarga com o alias "Carga sendo descarregada no CD" (e sem acento/caixa) também diz "Descarga em andamento"', () => {
    const at = iso(2026, 10, 24, 22, 0)
    expect(when(base({ collectionStatus: 'Carga sendo descarregada no CD', cargoReceivedAt: at }), 'pos_recebimento')).toBe(
      'Descarga em andamento',
    )
    expect(when(base({ collectionStatus: 'VEICULO NO CD PARA DESCARGA', cargoReceivedAt: at }), 'pos_recebimento')).toBe(
      'Descarga em andamento',
    )
  })

  it('em descarga sem `cargoReceivedAt` também diz "Descarga em andamento" (não "Recebida no CD")', () => {
    expect(when(RECEIVED, 'pos_recebimento')).toBe('Descarga em andamento')
    expect(when(base({ collectionStatus: 'Carga sendo descarregada no CD' }), 'pos_recebimento')).toBe('Descarga em andamento')
  })

  it('o texto de descarga só vale na fase pós-recebimento (Concluído com status de descarga não muda)', () => {
    const at = iso(2026, 10, 24, 22, 0)
    expect(when(base({ collectionStatus: 'Veículo no CD para descarga', cargoReceivedAt: at }), 'concluido')).toBe('Recebida ontem')
  })

  it('outras fases: vazio', () => {
    expect(when(base({}), 'atrasado')).toBe('')
  })
})

describe('categoria e fornecedor', () => {
  it('AÉREO com acento; fornecedor do processo ou "Fornecedor não informado"; consolidado em número de POs', () => {
    expect(describeCargoConferenceCategory('AEREO')).toBe('AÉREO')
    expect(describeCargoConferenceCategory('FCL')).toBe('FCL')
    expect(describeCargoConferenceSupplier(base({ supplierName: ' GOOYER CHEMICALS ' }))).toBe('GOOYER CHEMICALS')
    expect(describeCargoConferenceSupplier(base({}))).toBe('Fornecedor não informado')
    const consolidated = base({
      category: 'CONSOLIDADO',
      purchaseOrders: [
        { po: '1', reference: 'A', supplierName: 'X' },
        { po: '2', reference: 'B', supplierName: 'Y' },
        { po: '3', reference: 'C', supplierName: 'Z' },
      ],
    })
    expect(describeCargoConferenceSupplier(consolidated)).toBe('3 POs')
    expect(describeCargoConferenceSupplier({ ...consolidated, purchaseOrders: [{ po: '1' }] })).toBe('1 PO')
  })
})

describe('filtro, busca e ordem', () => {
  const entryOf = (process, state = 'andamento') => ({
    ...summarizeCargoConferenceEntry(process, undefined, { now: NOW }),
    state,
  })
  const air = base({
    id: 'air',
    name: 'ACME AIR 044-26',
    category: 'AEREO',
    supplierName: 'ACME AEROSPACE INC',
    collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 26, 9, 30) }],
  })
  const gooyer = scheduled(
    { id: 'gooyer', name: 'GOOYER SEA 001-26', supplierName: 'GOOYER CHEMICALS LTD' },
    iso(2026, 10, 25, 23, 50)
  )
  const consolidated = base({
    id: 'cons',
    name: 'CON DG 009-26',
    category: 'CONSOLIDADO',
    collectionStatus: 'Carga a caminho do CD',
    collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 24, 9, 0) }],
    purchaseOrders: [
      { po: '4500901', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
      { po: '4500902', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
    ],
  })
  const nova = base({ id: 'nova', name: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS', collectionStatus: 'Veículo no CD para descarga', cargoReceivedAt: iso(2026, 10, 24, 15, 0) })
  const kronos = scheduled({ id: 'kronos', name: 'KRONOS SEA 012-26', supplierName: 'KRONOS MATERIALS' }, iso(2026, 10, 27, 10, 0))
  const stock = base({ id: 'estoque', name: 'ZETA SEA 099-26', collectionStatus: 'Carga disponível em estoque', cargoReceivedAt: iso(2026, 10, 23, 15, 0) })

  const all = [
    entryOf(stock, 'fechada'),
    entryOf(kronos, 'sem'),
    entryOf(nova),
    entryOf(air),
    entryOf(consolidated),
    entryOf(gooyer),
  ]
  const ids = (entries) => entries.map((entry) => entry.processId)

  it('"Para conferir" tem tudo que não é fechada; "Fechadas" só as fechadas', () => {
    expect(ids(filterCargoConferenceEntries(all, { filter: 'fechadas', now: NOW }))).toEqual(['estoque'])
    expect(ids(filterCargoConferenceEntries(all, { filter: 'pendentes', now: NOW }))).toHaveLength(5)
  })

  it('ordem: Coleta agendada (data crescente), a caminho, recebida, concluído; bloqueado no fim', () => {
    expect(ids(filterCargoConferenceEntries(all, { filter: 'pendentes', canSeeName: true, now: NOW }))).toEqual([
      'gooyer',
      'air',
      'cons',
      'nova',
      'kronos',
    ])
  })

  it('empate de fase e data: pelo título', () => {
    const a = entryOf(scheduled({ id: 'b', name: 'BETA 1' }, iso(2026, 10, 27, 10, 0)))
    const b = entryOf(scheduled({ id: 'a', name: 'ALFA 1' }, iso(2026, 10, 27, 10, 0)))
    expect(ids(filterCargoConferenceEntries([a, b], { canSeeName: true, now: NOW }))).toEqual(['a', 'b'])
  })

  it('busca sem acento e sem caixa: tipo ("aereo"), nome, fornecedor e fornecedor de PO do consolidado', () => {
    const search = (query) => ids(filterCargoConferenceEntries(all, { query, canSeeName: true, now: NOW }))
    expect(search('aereo')).toEqual(['air'])
    expect(search('AÉREO')).toEqual(['air'])
    expect(search('gooyer')).toEqual(['gooyer'])
    expect(search('  GOOYER chem ')).toEqual(['gooyer'])
    expect(search('acme resins')).toEqual(['cons'])
    expect(search('nova polymers')).toEqual(['cons', 'nova'])
    expect(search('xyz')).toEqual([])
  })

  it('a busca pelo título respeita a máscara de quem não vê o nome (FCL vira "PO: …")', () => {
    const masked = entryOf(scheduled({ id: 'm', name: 'SEGREDO SEA 001-26', processNumber: '4500123' }))
    expect(ids(filterCargoConferenceEntries([masked], { query: 'segredo', canSeeName: true, now: NOW }))).toEqual(['m'])
    expect(ids(filterCargoConferenceEntries([masked], { query: '4500123', canSeeName: false, now: NOW }))).toEqual(['m'])
  })
})
