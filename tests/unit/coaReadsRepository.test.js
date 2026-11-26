// S11-B: servico cliente da leitura de COA (src/services/coaReadsRepository.js): callable com timeout de 300 s,
// lista de leituras, leitura tolerante do documento, paridade com a normalizacao da function e mensagens pt-BR.
//
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCallable, mockCollection, mockGetDocs, mockHttpsCallable } = vi.hoisted(() => ({
  mockGetCallable: vi.fn(),
  mockHttpsCallable: vi.fn(() => 'callable-fake'),
  mockCollection: vi.fn((...args) => ({ __collection: args.slice(1).join('/') })),
  mockGetDocs: vi.fn(),
}))

let firebaseConfigured = true

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseConfigured
  },
  firestore: { __fake: true },
  getCallable: (...args) => mockGetCallable(...args),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ __functions: true }),
  httpsCallable: (...args) => mockHttpsCallable(...args),
}))

vi.mock('firebase/firestore/lite', async (importOriginal) => ({
  ...(await importOriginal()),
  collection: (...args) => mockCollection(...args),
  getDocs: (...args) => mockGetDocs(...args),
}))

const {
  COA_READ_CALLABLE_TIMEOUT_MS,
  describeCoaReadError,
  getCoaReadErrorCode,
  listCoaReads,
  readCoaReadDoc,
  readProcessCoa,
} = await import('../../src/services/coaReadsRepository.js')
const { normalizeCoaExtraction, parseAgentOutputText } = await import('../../functions/src/process/coaRead.js')
const { EXPECTED_CERTIFICATE_COUNTS, TESS_SAMPLES, sampleOutputText } = await import('../fixtures/coa/tessSamples.js')

const storedDoc = (overrides = {}) => ({
  schemaVersion: 1,
  promptVersion: 'coa-tess-2026-11-25',
  tessContractVersion: 'docs.tess.im 2026-11-25',
  status: 'done',
  generation: '1700',
  fileSize: 2048,
  documentType: 'coa',
  certificates: [],
  warnings: ['aviso'],
  validationWarnings: [],
  error: null,
  attempts: 2,
  lastTessCallAt: '2026-11-26T12:00:00.000Z',
  tessCredits: 0.35,
  requestedByName: 'Admin',
  startedAt: '2026-11-26T12:00:00.000Z',
  finishedAt: '2026-11-26T12:00:09.000Z',
  durationMs: 9000,
  ...overrides,
})

beforeEach(() => {
  firebaseConfigured = true
  mockGetCallable.mockReset()
  mockCollection.mockClear()
  mockGetDocs.mockReset()
})

describe('readProcessCoa', () => {
  it('chama a callable readProcessCoa com timeout de 300 s e envia ids e force', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'done', cached: true, read: storedDoc() } })
    mockGetCallable.mockResolvedValue(callable)

    const result = await readProcessCoa('p1', 'd1', { force: true })

    expect(COA_READ_CALLABLE_TIMEOUT_MS).toBe(300000)
    expect(mockGetCallable).toHaveBeenCalledWith('readProcessCoa', { timeout: 300000 })
    expect(callable).toHaveBeenCalledWith({ processId: 'p1', documentId: 'd1', force: true })
    expect(result.status).toBe('done')
    expect(result.cached).toBe(true)
    expect(result.read).toMatchObject({ documentId: 'd1', status: 'done', tessCredits: 0.35, attempts: 2 })
  })

  it('force padrao e false e so true literal liga', async () => {
    const callable = vi.fn().mockResolvedValue({ data: { status: 'done', read: storedDoc() } })
    mockGetCallable.mockResolvedValue(callable)
    await readProcessCoa('p1', 'd1')
    await readProcessCoa('p1', 'd1', { force: 'sim' })
    expect(callable.mock.calls.map((call) => call[0].force)).toEqual([false, false])
  })

  it('leitura em andamento: status reading e read nulo', async () => {
    mockGetCallable.mockResolvedValue(vi.fn().mockResolvedValue({ data: { status: 'reading', cached: false, read: null } }))
    expect(await readProcessCoa('p1', 'd1')).toEqual({ status: 'reading', cached: false, read: null })
  })

  it('Firebase nao configurado -> erro not-configured com mensagem pt-BR', async () => {
    mockGetCallable.mockResolvedValue(null)
    await expect(readProcessCoa('p1', 'd1')).rejects.toMatchObject({
      code: 'not-configured',
      message: 'A leitura automática de COA ainda não está configurada no servidor.',
    })
  })

  it('resposta fora do contrato -> invalid-response', async () => {
    for (const data of [undefined, {}, { status: 'qualquer' }, null]) {
      mockGetCallable.mockResolvedValue(vi.fn().mockResolvedValue({ data }))
      await expect(readProcessCoa('p1', 'd1')).rejects.toMatchObject({ code: 'invalid-response' })
    }
  })

  it('erros da function viram codigo estavel + mensagem pt-BR', async () => {
    const cases = [
      [{ code: 'functions/failed-precondition', details: { code: 'report-closed' } }, 'report-closed'],
      [{ code: 'functions/resource-exhausted', details: { code: 'daily-limit' } }, 'daily-limit'],
      [{ code: 'functions/resource-exhausted', details: { code: 'attempts' } }, 'attempts'],
      [{ code: 'functions/resource-exhausted' }, 'busy'],
      [{ code: 'functions/unavailable' }, 'busy'],
      [{ code: 'functions/deadline-exceeded' }, 'deadline-exceeded'],
      [{ code: 'functions/permission-denied' }, 'permission-denied'],
      [{ code: 'functions/internal' }, 'unknown'],
      [new Error('rede'), 'unknown'],
    ]
    for (const [sdkError, code] of cases) {
      mockGetCallable.mockResolvedValue(vi.fn().mockRejectedValue(sdkError))
      const error = await readProcessCoa('p1', 'd1').catch((caught) => caught)
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe(code)
      expect(error.message).toBe(describeCoaReadError(code))
      expect(getCoaReadErrorCode(sdkError)).toBe(code)
    }
  })
})

describe('listCoaReads', () => {
  it('le processes/{id}/coaReads e indexa por documentId (ignora documento ilegivel)', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'a', data: () => storedDoc() },
        { id: 'b', data: () => storedDoc({ status: 'failed', error: { code: 'tess-timeout' }, documentType: null }) },
        { id: 'lixo', data: () => ({ status: 'qualquer' }) },
      ],
    })
    const reads = await listCoaReads('p1')
    expect(mockCollection).toHaveBeenCalledWith({ __fake: true }, 'processes', 'p1', 'coaReads')
    expect(Object.keys(reads)).toEqual(['a', 'b'])
    expect(reads.a.documentId).toBe('a')
    expect(reads.b).toMatchObject({ status: 'failed', error: { code: 'tess-timeout' } })
  })

  it('sem Firebase ou sem processId -> objeto vazio, sem consulta', async () => {
    firebaseConfigured = false
    expect(await listCoaReads('p1')).toEqual({})
    firebaseConfigured = true
    expect(await listCoaReads('')).toEqual({})
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('falha do Firestore propaga (o chamador decide: sem selo)', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    await expect(listCoaReads('p1')).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('readCoaReadDoc (leitura tolerante)', () => {
  it('documento valido: tipos e padroes', () => {
    expect(readCoaReadDoc(storedDoc(), 'd1')).toEqual({
      documentId: 'd1',
      status: 'done',
      promptVersion: 'coa-tess-2026-11-25',
      generation: '1700',
      fileSize: 2048,
      documentType: 'coa',
      certificates: [],
      warnings: ['aviso'],
      validationWarnings: [],
      error: null,
      attempts: 2,
      tessCredits: 0.35,
      lastTessCallAt: '2026-11-26T12:00:00.000Z',
      requestedByName: 'Admin',
      startedAt: '2026-11-26T12:00:00.000Z',
      finishedAt: '2026-11-26T12:00:09.000Z',
      durationMs: 9000,
    })
  })

  it('nao objeto, array ou status desconhecido -> null', () => {
    for (const raw of [null, undefined, 'x', 1, [], {}, { status: 'qualquer' }, { status: 'DONE' }]) {
      expect(readCoaReadDoc(raw, 'd1')).toBeNull()
    }
  })

  it('tipos errados viram padroes e nunca lancam', () => {
    const read = readCoaReadDoc(
      {
        status: 'failed',
        promptVersion: 5,
        generation: null,
        fileSize: 'grande',
        documentType: 'xyz',
        certificates: 'nope',
        warnings: [1, { a: 1 }, 'ok'],
        validationWarnings: 'x',
        error: { code: 42 },
        attempts: -1,
        tessCredits: -3,
        lastTessCallAt: 'nao e data',
        requestedByName: {},
        startedAt: null,
        finishedAt: NaN,
        durationMs: 'rapido',
      },
      'd9'
    )
    expect(read).toEqual({
      documentId: 'd9',
      status: 'failed',
      promptVersion: '',
      generation: '',
      fileSize: 0,
      documentType: null,
      certificates: [],
      warnings: ['ok'],
      validationWarnings: [],
      error: null,
      attempts: 0,
      tessCredits: 0,
      lastTessCallAt: null,
      requestedByName: '',
      startedAt: null,
      finishedAt: null,
      durationMs: 0,
    })
  })

  it('tempos: aceita ISO, Timestamp do Firestore (toDate) e milissegundos', () => {
    const date = new Date('2026-11-26T12:00:00.000Z')
    const read = readCoaReadDoc(
      storedDoc({ lastTessCallAt: { toDate: () => date }, startedAt: date.getTime(), finishedAt: '2026-11-26T12:00:09.000Z' }),
      'd1'
    )
    expect(read.lastTessCallAt).toBe('2026-11-26T12:00:00.000Z')
    expect(read.startedAt).toBe('2026-11-26T12:00:00.000Z')
    expect(read.finishedAt).toBe('2026-11-26T12:00:09.000Z')
  })

  it('descarta certificado sem lote/produto e limita a 60', () => {
    const cert = (n) => ({ productName: 'P', batchNumber: `L${n}`, confidence: 'high' })
    const read = readCoaReadDoc(
      storedDoc({ certificates: [cert(1), { productName: 'P' }, { batchNumber: 'X' }, null, 'x', ...Array.from({ length: 70 }, (_, i) => cert(i + 10))] }),
      'd1'
    )
    expect(read.certificates).toHaveLength(60)
    expect(read.certificates[0].batchNumber).toBe('L1')
    expect(read.certificates[0]).toMatchObject({ productAliases: [], quantity: null, packaging: null, expiryKind: null, confidence: 'high' })
  })

  it('certificado: enums e numeros invalidos viram nulo/padrao', () => {
    const [cert] = readCoaReadDoc(
      storedDoc({
        certificates: [
          {
            page: 1.5,
            productName: 'P',
            batchNumber: 'B',
            quantity: { raw: 'x', value: Infinity, unit: 5, kg: -1 },
            packaging: { raw: '', packageCount: 2.5, packageNetKg: 0, packageType: '' },
            manufactureDate: '2026-13-01',
            expiryDate: '2028-01-31',
            expiryKind: 'invalido',
            confidence: 'altissima',
            warnings: 'x',
          },
        ],
      }),
      'd1'
    ).certificates
    expect(cert).toMatchObject({
      page: null,
      quantity: { raw: 'x', value: null, unit: '', kg: null },
      packaging: null,
      manufactureDate: null,
      expiryDate: '2028-01-31',
      expiryKind: null,
      confidence: 'low',
      warnings: [],
    })
  })
})

describe('paridade function x cliente', () => {
  const parsedSamples = Object.keys(EXPECTED_CERTIFICATE_COUNTS)

  it.each(parsedSamples)('%s: normalizeCoaExtraction -> readCoaReadDoc devolve exatamente o mesmo', (name) => {
    const parsed = parseAgentOutputText(sampleOutputText(TESS_SAMPLES[name]))
    expect(parsed.ok).toBe(true)
    const extraction = normalizeCoaExtraction(parsed.value)
    const read = readCoaReadDoc(
      storedDoc({
        documentType: extraction.documentType,
        certificates: extraction.certificates,
        warnings: extraction.warnings,
        validationWarnings: extraction.validationWarnings,
      }),
      'd1'
    )
    expect(read.certificates).toEqual(extraction.certificates)
    expect(read.warnings).toEqual(extraction.warnings)
    expect(read.validationWarnings).toEqual(extraction.validationWarnings)
    expect(read.documentType).toBe(extraction.documentType)
    expect(read.certificates).toHaveLength(EXPECTED_CERTIFICATE_COUNTS[name])
  })

  it('a leitura do cliente e idempotente (ler duas vezes nao muda)', () => {
    const parsed = parseAgentOutputText(sampleOutputText(TESS_SAMPLES.shortAlias))
    const extraction = normalizeCoaExtraction(parsed.value)
    const once = readCoaReadDoc(storedDoc({ certificates: extraction.certificates }), 'd1')
    const twice = readCoaReadDoc({ ...storedDoc(), certificates: once.certificates }, 'd1')
    expect(twice.certificates).toEqual(once.certificates)
  })
})

describe('describeCoaReadError (pt-BR com acentuacao)', () => {
  const expected = {
    'not-configured': 'A leitura automática de COA ainda não está configurada no servidor.',
    'report-closed': 'O relatório já foi fechado; a leitura de COA é só no rascunho.',
    'not-pdf': 'Só PDF é lido automaticamente.',
    'too-large': 'Arquivo maior que 20 MB.',
    'tess-too-large': 'Arquivo maior que 20 MB.',
    attempts: 'Limite de leituras deste arquivo atingido.',
    'daily-limit': 'Limite diário de leituras deste processo atingido. Tente amanhã.',
    'tess-timeout': 'A leitura demorou demais. Tente de novo.',
    'tess-rate-limit': 'O serviço de leitura pediu uma pausa. Tente de novo em 1 minuto.',
    'tess-storage-full':
      'O espaço de arquivos da Tess está cheio (30 arquivos). Apague arquivos antigos no painel da Tess e tente de novo.',
    'tess-auth': 'A Tess recusou as credenciais do Portal. Confira a chave e o workspace no servidor.',
    'tess-unavailable': 'O serviço de leitura está indisponível agora. Tente de novo em alguns minutos.',
    'tess-error': 'O serviço de leitura está indisponível agora. Tente de novo em alguns minutos.',
    'invalid-response': 'A leitura voltou num formato inválido. Tente de novo.',
    'tess-bad-response': 'A leitura voltou num formato inválido. Tente de novo.',
    busy: 'Outra leitura de COA está em andamento. Tente de novo em 1 minuto.',
    'deadline-exceeded': 'Ainda lendo. Clique em Ler COAs de novo em 1 minuto.',
  }

  it.each(Object.entries(expected))('%s', (code, message) => {
    expect(describeCoaReadError(code)).toBe(message)
  })

  it('todas as mensagens tem acentuacao correta e nenhuma grafia sem acento da lista proibida', () => {
    const codes = [
      ...Object.keys(expected),
      'permission-denied',
      'unauthenticated',
      'not-found',
      'invalid-file',
      'unknown',
      'qualquer-coisa',
      undefined,
      null,
    ]
    for (const code of codes) {
      const message = describeCoaReadError(code)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toMatch(/\bnao\b|\bNao\b|Voce|voce|\bate\b|Sera\b|indisponivel|configurado\b.*servidor\./)
      expect(message).not.toMatch(/�|Ã/)
    }
    expect(describeCoaReadError('desconhecido')).toBe('Não foi possível ler o COA agora. Tente de novo.')
  })
})

describe('getCallable (src/lib/firebase.js) repassa options ao SDK', () => {
  it('com options: httpsCallable(functions, nome, options); sem options: so (functions, nome) como antes', async () => {
    const { getCallable } = await vi.importActual('../../src/lib/firebase')
    mockHttpsCallable.mockClear()

    await getCallable('readProcessCoa', { timeout: 300000 })
    await getCallable('getDailyPtaxRates')

    expect(mockHttpsCallable).toHaveBeenCalledTimes(2)
    expect(mockHttpsCallable.mock.calls[0]).toEqual([{ __functions: true }, 'readProcessCoa', { timeout: 300000 }])
    expect(mockHttpsCallable.mock.calls[1]).toEqual([{ __functions: true }, 'getDailyPtaxRates'])
  })
})
