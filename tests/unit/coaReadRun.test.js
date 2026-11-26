// S11-B: orquestracao da callable `readProcessCoa` (functions/src/process/coaReadFunction.js -> runCoaRead) com
// Firestore, Storage, relogio, sleep, logger e cliente da Tess FALSOS: nenhuma rede, nenhuma chave real.
// Cobre permissao, validacoes, cache por generation/promptVersion, limites (tentativas e diario), lease,
// retry/erros da Tess, DELETE do arquivo em todo caminho (finally), pendencias, creditos e logs sem conteudo.
//
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { COA_TESS_BUDGET_MS, runCoaRead } from '../../functions/src/process/coaReadFunction.js'
import { COA_LIMITS, COA_PROMPT_VERSION } from '../../functions/src/process/coaRead.js'
import { TessError } from '../../functions/src/process/tessClient.js'
import {
  TESS_POLL_FINAL,
  TESS_SAMPLES,
  TWO_JSON_OBJECTS_TEXT,
  agentJson,
  certificate,
  sampleOutputText,
} from '../fixtures/coa/tessSamples.js'

const SECRETS = { apiKey: 'KEY-SECRET-ZZZ', agentId: '3141592', workspaceId: '8675309' }
const PDF_BYTES = Buffer.from('%PDF-1.7\nconteudo sintetico')
const START = Date.parse('2026-11-26T12:00:00.000Z')
const DOC_PATH = 'processes/p1/documents/d1'
const READ_PATH = 'processes/p1/coaReads/d1'
const GOOD_OUTPUT = sampleOutputText(TESS_SAMPLES.digitalSingle)

function createFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]))
  const log = []
  const clone = (value) => (value === undefined ? undefined : structuredClone(value))
  const isChild = (path, key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')

  function ref(path) {
    return {
      path,
      id: path.split('/').pop(),
      async get() {
        log.push({ op: 'get', path })
        return snap(path)
      },
      async set(data) {
        store.set(path, clone(data))
        log.push({ op: 'set', path, data: clone(data) })
      },
      async update(patch) {
        if (!store.has(path)) throw Object.assign(new Error('NOT_FOUND'), { code: 5 })
        store.set(path, { ...store.get(path), ...clone(patch) })
        log.push({ op: 'update', path, data: clone(patch) })
      },
      async delete() {
        store.delete(path)
        log.push({ op: 'delete', path })
      },
    }
  }

  function snap(path) {
    const exists = store.has(path)
    return { exists, id: path.split('/').pop(), ref: ref(path), data: () => (exists ? clone(store.get(path)) : undefined) }
  }

  function collection(path) {
    const filters = []
    let max = Infinity
    const matching = () =>
      [...store.keys()]
        .filter((key) => isChild(path, key))
        .filter((key) => {
          const data = store.get(key)
          return filters.every(({ field, op, value }) => {
            if (op === '==') return data[field] === value
            if (op === '>=') return typeof data[field] === 'string' && data[field] >= value
            throw new Error(`op nao suportado no fake: ${op}`)
          })
        })
    const query = {
      where(field, op, value) {
        filters.push({ field, op, value })
        return query
      },
      limit(n) {
        max = n
        return query
      },
      async get() {
        const docs = matching().slice(0, max).map((key) => snap(key))
        return { docs, empty: docs.length === 0 }
      },
      count() {
        return { get: async () => ({ data: () => ({ count: matching().length }) }) }
      },
    }
    return query
  }

  return {
    store,
    log,
    doc: (path) => ref(path),
    collection,
    async runTransaction(fn) {
      return fn({ get: (target) => target.get(), set: (target, data) => target.set(data) })
    },
  }
}

function baseStore(extra = {}) {
  return {
    [DOC_PATH]: {
      type: 'coaOriginal',
      mimeType: 'application/pdf',
      name: 'ARQUIVO-SECRETO.pdf',
      description: 'Nome Secreto do COA',
      storagePath: 'processes/p1/documents/coaOriginal/1-admin-1-ARQUIVO-SECRETO.pdf',
    },
    ...extra,
  }
}

function makeEnv({ store = baseStore(), metadata = {}, bytes = PDF_BYTES, secrets = SECRETS, tess = {} } = {}) {
  const db = createFakeDb(store)
  const clock = { t: START }
  const events = []
  const sleeps = []
  const bucketState = { metadataCalls: 0, downloadCalls: 0, meta: { size: String(bytes.length), contentType: 'application/pdf', generation: '1700', ...metadata } }
  const bucket = {
    file: () => ({
      async getMetadata() {
        bucketState.metadataCalls += 1
        if (bucketState.meta.__error) throw bucketState.meta.__error
        return [bucketState.meta]
      },
      async download() {
        bucketState.downloadCalls += 1
        events.push('download')
        return [bytes]
      },
    }),
  }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  const tessCalls = { upload: 0, execute: 0, poll: 0, delete: [] }
  const defaults = {
    uploadFile: async () => ({ fileId: 501, credits: 0.1 }),
    executeAgent: async () => ({ responseId: 601, status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0.25 }),
    getAgentResponse: async () => ({ status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0.05 }),
    deleteFile: async () => ({ deleted: true }),
  }
  const impl = { ...defaults, ...tess }
  const createClient = vi.fn((config) => {
    events.push('createClient')
    createClient.lastConfig = config
    return {
      async uploadFile(args) {
        tessCalls.upload += 1
        events.push('upload')
        tessCalls.lastUploadBytes = args.bytes
        return impl.uploadFile(args, tessCalls.upload)
      },
      async executeAgent(args) {
        tessCalls.execute += 1
        events.push('execute')
        return impl.executeAgent(args, tessCalls.execute)
      },
      async getAgentResponse(args) {
        tessCalls.poll += 1
        events.push('poll')
        return impl.getAgentResponse(args, tessCalls.poll)
      },
      async deleteFile(fileId) {
        tessCalls.delete.push(fileId)
        events.push(`delete:${fileId}`)
        return impl.deleteFile(fileId, tessCalls.delete.length)
      },
    }
  })
  const deps = {
    db,
    bucket,
    createClient,
    now: () => clock.t,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock.t += ms
    },
    logger,
    getSecrets: () => secrets,
  }
  return { db, clock, events, sleeps, bucketState, logger, tessCalls, createClient, deps }
}

const adminRequest = (data = { processId: 'p1', documentId: 'd1' }, tokenOverrides = {}) => ({
  auth: {
    uid: 'admin-1',
    token: { role: 'admin', status: 'Ativo', email: 'admin@sqquimica.com', name: 'Admin Teste', ...tokenOverrides },
  },
  data,
})

async function expectHttpsError(promise, code, detail) {
  let caught = null
  try {
    await promise
  } catch (error) {
    caught = error
  }
  expect(caught, 'deveria lancar HttpsError').toBeInstanceOf(HttpsError)
  expect(caught.code).toBe(code)
  if (detail) expect(caught.details).toEqual({ code: detail })
  return caught
}

const readDoc = (env, path = READ_PATH) => env.db.store.get(path)

describe('permissao e pedido', () => {
  it('sem autenticacao -> unauthenticated, sem tocar em nada', async () => {
    const env = makeEnv()
    await expectHttpsError(runCoaRead({ data: { processId: 'p1', documentId: 'd1' } }, env.deps), 'unauthenticated')
    expect(env.db.log).toHaveLength(0)
    expect(env.createClient).not.toHaveBeenCalled()
  })

  it.each([
    ['logistica', { role: 'logistica' }],
    ['tecnico', { role: 'tecnico' }],
    ['faturamento', { role: 'faturamento' }],
    ['user', { role: 'user' }],
    ['compras', { role: 'compras' }],
    ['sem role', { role: undefined }],
    ['admin Bloqueado', { status: 'Bloqueado' }],
    ['admin Pendente', { status: 'Pendente' }],
    ['admin sem status (sem fallback no banco)', { status: undefined }],
    ['admin com e-mail externo', { email: 'admin@gmail.com' }],
    ['admin sem e-mail', { email: undefined }],
  ])('%s -> permission-denied, sem leitura de banco, Storage ou Tess', async (_label, overrides) => {
    const env = makeEnv()
    await expectHttpsError(runCoaRead(adminRequest(undefined, overrides), env.deps), 'permission-denied')
    expect(env.db.log).toHaveLength(0)
    expect(env.bucketState.metadataCalls).toBe(0)
    expect(env.createClient).not.toHaveBeenCalled()
  })

  it.each([
    [{ processId: 'p1' }],
    [{ processId: 'p1', documentId: '../d1' }],
    [{ processId: 'p/1', documentId: 'd1' }],
    [{ processId: 'p1', documentId: 'd1', force: 'sim' }],
    [null],
    ['texto'],
  ])('pedido invalido %j -> invalid-argument', async (data) => {
    const env = makeEnv()
    await expectHttpsError(runCoaRead(adminRequest(data), env.deps), 'invalid-argument', 'invalid-argument')
    expect(env.db.log).toHaveLength(0)
  })
})

describe('validacoes antes da Tess', () => {
  it('documento inexistente, de outro processo ou de outro tipo -> not-found', async () => {
    let env = makeEnv({ store: {} })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'not-found', 'not-found')

    env = makeEnv({ store: { 'processes/p2/documents/d1': baseStore()[DOC_PATH] } })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'not-found')

    env = makeEnv({ store: baseStore({ [DOC_PATH]: { ...baseStore()[DOC_PATH], type: 'cargoReport' } }) })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'not-found')
    expect(env.createClient).not.toHaveBeenCalled()
  })

  it('storagePath fora do processo ou sem caminho -> failed-precondition', async () => {
    for (const storagePath of ['processes/p2/documents/coaOriginal/x.pdf', '', 'processes/p1/documents/../../x.pdf', undefined]) {
      const env = makeEnv({ store: baseStore({ [DOC_PATH]: { ...baseStore()[DOC_PATH], storagePath } }) })
      await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'invalid-storage-path')
      expect(env.bucketState.metadataCalls).toBe(0)
    }
  })

  it('mimeType do metadado diferente de PDF -> failed-precondition not-pdf', async () => {
    for (const mimeType of ['image/png', 'application/vnd.ms-excel', undefined]) {
      const env = makeEnv({ store: baseStore({ [DOC_PATH]: { ...baseStore()[DOC_PATH], mimeType } }) })
      await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'not-pdf')
      expect(env.createClient).not.toHaveBeenCalled()
    }
  })

  it('relatorio concluido -> report-closed; rascunho ou sem relatorio seguem', async () => {
    let env = makeEnv({ store: baseStore({ 'processes/p1/cargoReport/current': { status: 'concluido' } }) })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'report-closed')
    expect(env.createClient).not.toHaveBeenCalled()

    env = makeEnv({ store: baseStore({ 'processes/p1/cargoReport/current': { status: 'rascunho' } }) })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')

    env = makeEnv()
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
  })

  it('segredo " " (emulador) ou invalido -> not-configured, sem chamar a Tess', async () => {
    for (const secrets of [
      { apiKey: ' ', agentId: ' ', workspaceId: ' ' },
      { ...SECRETS, apiKey: ' ' },
      { ...SECRETS, agentId: 'abc' },
      { ...SECRETS, workspaceId: '' },
      { apiKey: undefined, agentId: undefined, workspaceId: undefined },
    ]) {
      const env = makeEnv({ secrets })
      await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'not-configured')
      expect(env.createClient).not.toHaveBeenCalled()
      expect(env.bucketState.metadataCalls).toBe(0)
    }
  })

  it('PDF acima de 20 MB -> too-large; exatamente 20 MB passa', async () => {
    let env = makeEnv({ metadata: { size: String(COA_LIMITS.maxBytes + 1) } })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'too-large')
    expect(env.bucketState.downloadCalls).toBe(0)
    expect(env.createClient).not.toHaveBeenCalled()

    env = makeEnv({ metadata: { size: String(COA_LIMITS.maxBytes) } })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
  })

  it('contentType do objeto diferente de PDF -> not-pdf; com charset passa; tamanho invalido -> invalid-file', async () => {
    let env = makeEnv({ metadata: { contentType: 'image/jpeg' } })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'not-pdf')
    expect(env.createClient).not.toHaveBeenCalled()

    env = makeEnv({ metadata: { contentType: 'application/pdf; charset=binary' } })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')

    env = makeEnv({ metadata: { size: 'abc' } })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'failed-precondition', 'invalid-file')
  })

  it('objeto ausente no Storage (404) -> not-found', async () => {
    const env = makeEnv({ metadata: { __error: Object.assign(new Error('x'), { code: 404 }) } })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'not-found')
  })

  it('assinatura sem %PDF- -> leitura falha com not-pdf, SEM upload e SEM delete', async () => {
    const env = makeEnv({ bytes: Buffer.from('PK\u0003\u0004 isto e um zip') })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('failed')
    expect(result.read.error).toEqual({ code: 'not-pdf' })
    expect(env.tessCalls.upload).toBe(0)
    expect(env.tessCalls.delete).toEqual([])
    expect(readDoc(env).status).toBe('failed')
  })

  it('erro inesperado (Firestore) vira HttpsError internal e o log leva so o codigo', async () => {
    const env = makeEnv()
    env.deps.db = {
      ...env.db,
      doc: () => ({ get: async () => { throw Object.assign(new Error('SEGREDO-NA-MENSAGEM PRODUTO X'), { code: 14 }) } }),
    }
    const error = await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'internal', 'internal')
    expect(error.message).toBe('internal')
    expect(env.logger.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(env.logger.error.mock.calls)).not.toContain('SEGREDO')
    expect(JSON.stringify(env.logger.error.mock.calls)).not.toContain('PRODUTO X')
  })
})

describe('leitura com sucesso', () => {
  it('fluxo completo: lease, upload, id pendente gravado ANTES do execute, execute, delete, done', async () => {
    const env = makeEnv()
    const result = await runCoaRead(adminRequest(), env.deps)

    expect(env.createClient.lastConfig).toEqual({ apiKey: 'KEY-SECRET-ZZZ', agentId: 3141592, workspaceId: '8675309' })
    expect(env.events.filter((event) => event !== 'createClient')).toEqual(['download', 'upload', 'execute', 'delete:501'])
    expect(env.tessCalls.lastUploadBytes).toBe(PDF_BYTES)

    const writes = env.db.log.filter((entry) => entry.path === READ_PATH && entry.op !== 'get')
    expect(writes.map((entry) => entry.op)).toEqual(['set', 'update', 'update', 'set'])
    expect(writes[0].data).toMatchObject({ status: 'reading', attempts: 1, generation: '1700', requestedById: 'admin-1' })
    expect(writes[0].data.leaseUntil).toBe('2026-11-26T12:05:20.000Z')
    expect(writes[1].data).toEqual({ tessFileId: 501, tessFilePending: true })
    expect(writes[2].data).toEqual({ tessResponseId: 601 })
    expect(writes[3].data).toMatchObject({
      status: 'done',
      documentType: 'coa',
      tessFileId: 501,
      tessFilePending: false,
      tessResponseId: 601,
      leaseUntil: null,
    })

    expect(result.status).toBe('done')
    expect(result.cached).toBe(false)
    expect(result.read.certificates).toHaveLength(1)
    expect(result.read.certificates[0].batchNumber).toBe('ACX2610-001')
    for (const key of ['leaseUntil', 'requestedById', 'tessFileId', 'tessResponseId']) expect(result.read).not.toHaveProperty(key)
    expect(readDoc(env).tessCredits).toBeCloseTo(0.35, 9)
  })

  it('o ID so e gravado como pendente enquanto o arquivo existe na Tess (pendente antes do execute, limpo no fim)', async () => {
    const env = makeEnv({
      tess: {
        executeAgent: async () => {
          expect(readDoc(env)).toMatchObject({ tessFileId: 501, tessFilePending: true, status: 'reading' })
          return { responseId: 601, status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0 }
        },
      },
    })
    await runCoaRead(adminRequest(), env.deps)
    expect(readDoc(env)).toMatchObject({ tessFilePending: false })
  })

  it('tessCredits = upload + execute + consultas', async () => {
    const env = makeEnv({
      tess: {
        uploadFile: async () => ({ fileId: 7, credits: 0.1 }),
        executeAgent: async () => ({ responseId: 8, status: 'starting', outputText: '', credits: 0.0003 }),
        getAgentResponse: async (_args, call) =>
          call < 2
            ? { status: 'running', outputText: '', credits: 0.2 }
            : { status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0.4 },
      },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(readDoc(env).tessCredits).toBeCloseTo(0.1 + 0.0003 + 0.2 + 0.4, 9)
    expect(result.read.tessCredits).toBeCloseTo(0.7003, 9)
  })

  it('not_coa vira done com lista vazia (documentType preservado)', async () => {
    const env = makeEnv({ tess: { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: sampleOutputText(TESS_SAMPLES.notCoa), credits: 0 }) } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(result.read).toMatchObject({ documentType: 'not_coa', certificates: [] })
  })

  it('o nome do usuario e o ator ficam no documento; o nome do arquivo NUNCA vai para a Tess nem para o doc de leitura', async () => {
    const env = makeEnv()
    await runCoaRead(adminRequest(), env.deps)
    expect(readDoc(env).requestedByName).toBe('Admin Teste')
    expect(JSON.stringify(readDoc(env))).not.toContain('ARQUIVO-SECRETO')
    expect(JSON.stringify(readDoc(env))).not.toContain('Nome Secreto')
  })
})

describe('espera pelo resultado (consultas)', () => {
  it('em andamento: consulta com espera crescente 5, 10, 15, 20 s ate succeeded; guarda o id da resposta', async () => {
    const env = makeEnv({
      tess: {
        executeAgent: async () => ({ responseId: 777, status: 'starting', outputText: '', credits: 0 }),
        getAgentResponse: async (_args, call) =>
          call < 5
            ? { status: 'running', outputText: '', credits: 0 }
            : { status: 'succeeded', outputText: sampleOutputText(TESS_POLL_FINAL), credits: 0 },
      },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(env.sleeps).toEqual([5000, 10000, 15000, 20000, 20000])
    expect(env.tessCalls.poll).toBe(5)
    expect(readDoc(env).tessResponseId).toBe(777)
    expect(result.read.certificates[0].batchNumber).toBe('POLL-1')
  })

  it('nunca termina: tess-timeout dentro do orcamento de 240 s, com delete', async () => {
    const env = makeEnv({
      tess: {
        executeAgent: async () => ({ responseId: 1, status: 'starting', outputText: '', credits: 0 }),
        getAgentResponse: async () => ({ status: 'running', outputText: '', credits: 0 }),
      },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('failed')
    expect(result.read.error).toEqual({ code: 'tess-timeout' })
    expect(env.clock.t - START).toBeLessThan(COA_TESS_BUDGET_MS)
    expect(env.clock.t - START).toBeGreaterThan(COA_TESS_BUDGET_MS - 25000)
    expect(env.tessCalls.delete).toEqual([501])
  })

  it('consulta com falha transitoria (unavailable/timeout) segue tentando', async () => {
    const env = makeEnv({
      tess: {
        executeAgent: async () => ({ responseId: 1, status: 'starting', outputText: '', credits: 0 }),
        getAgentResponse: async (_args, call) => {
          if (call === 1) throw new TessError('tess-unavailable', { httpStatus: 503 })
          if (call === 2) throw new TessError('tess-timeout')
          return { status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0 }
        },
      },
    })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
    expect(env.tessCalls.poll).toBe(3)
  })

  it('consulta com erro definitivo (auth) ou status de falha -> failed e delete', async () => {
    let env = makeEnv({
      tess: {
        executeAgent: async () => ({ responseId: 1, status: 'starting', outputText: '', credits: 0 }),
        getAgentResponse: async () => {
          throw new TessError('tess-auth', { httpStatus: 403 })
        },
      },
    })
    let result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-auth' })
    expect(env.tessCalls.delete).toEqual([501])

    env = makeEnv({
      tess: {
        executeAgent: async () => ({ responseId: 1, status: 'starting', outputText: '', credits: 0 }),
        getAgentResponse: async () => ({ status: 'failed', outputText: '', credits: 0 }),
      },
    })
    result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-error' })
    expect(env.tessCalls.delete).toEqual([501])
  })

  it('em andamento sem id de resposta -> tess-bad-response (sem consultar) e delete', async () => {
    const env = makeEnv({
      tess: { executeAgent: async () => ({ responseId: null, status: 'starting', outputText: '', credits: 0 }) },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-bad-response' })
    expect(env.tessCalls.poll).toBe(0)
    expect(env.tessCalls.delete).toEqual([501])
  })
})

describe('DELETE do arquivo na Tess em todo caminho (finally)', () => {
  const cases = [
    ['sucesso', {}, 'done', null],
    ['invalid-response (output nao e JSON)', { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: 'nao e json', credits: 0 }) }, 'failed', 'invalid-response'],
    ['schema_version 2', { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: sampleOutputText(TESS_SAMPLES.schemaV2), credits: 0 }) }, 'failed', 'invalid-response'],
    ['2 objetos JSON', { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: TWO_JSON_OBJECTS_TEXT, credits: 0 }) }, 'failed', 'invalid-response'],
    ['output vazio com status succeeded', { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: '', credits: 0 }) }, 'failed', 'invalid-response'],
    ['output gigante', { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: 'x'.repeat(COA_LIMITS.maxOutputChars + 1), credits: 0 }) }, 'failed', 'invalid-response'],
    ['tess-timeout do execute', { executeAgent: async () => { throw new TessError('tess-timeout') } }, 'failed', 'tess-timeout'],
    ['erro de rede do execute', { executeAgent: async () => { throw new TessError('tess-unavailable') } }, 'failed', 'tess-unavailable'],
    ['erro generico do execute', { executeAgent: async () => { throw new TessError('tess-error', { httpStatus: 400 }) } }, 'failed', 'tess-error'],
    ['excecao inesperada no execute', { executeAgent: async () => { throw new Error('boom PRODUTO SECRETO') } }, 'failed', 'internal'],
    ['status de falha na execucao', { executeAgent: async () => ({ responseId: 1, status: 'failed', outputText: '', credits: 0 }) }, 'failed', 'tess-error'],
  ]

  it.each(cases)('%s: delete chamado 1 vez com o id do upload e pendencia limpa', async (_label, tess, status, code) => {
    const env = makeEnv({ tess })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe(status)
    if (code) expect(result.read.error).toEqual({ code })
    expect(env.tessCalls.delete).toEqual([501])
    const last = readDoc(env)
    expect(last.status).toBe(status)
    expect(last.tessFilePending).toBe(false)
    expect(last.leaseUntil).toBeNull()
  })

  it('o delete vem DEPOIS do execute e ANTES da gravacao final', async () => {
    const env = makeEnv()
    await runCoaRead(adminRequest(), env.deps)
    const order = env.events.filter((event) => ['upload', 'execute', 'delete:501'].includes(event))
    expect(order).toEqual(['upload', 'execute', 'delete:501'])
  })

  it('falha ao gravar o id pendente (update lanca) ainda apaga o arquivo da Tess', async () => {
    const env = makeEnv()
    const original = env.deps.db.doc
    env.deps.db = {
      ...env.db,
      doc: (path) => {
        const target = original(path)
        if (path !== READ_PATH) return target
        return {
          ...target,
          update: async (patch) => {
            if ('tessFileId' in patch) throw new Error('falha de gravacao')
            return target.update(patch)
          },
        }
      },
    }
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('failed')
    expect(result.read.error).toEqual({ code: 'internal' })
    expect(env.tessCalls.delete).toEqual([501])
    expect(env.tessCalls.execute).toBe(0)
  })

  it('upload que falha nao tem arquivo: nenhum delete', async () => {
    const env = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-auth', { httpStatus: 401 }) } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-auth' })
    expect(env.tessCalls.delete).toEqual([])
    expect(env.tessCalls.execute).toBe(0)
  })

  it('delete falhando (2 tentativas) deixa tessFilePending true com o id; a leitura em si fica done', async () => {
    const env = makeEnv({ tess: { deleteFile: async () => { throw new TessError('tess-unavailable') } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(env.tessCalls.delete).toEqual([501, 501])
    expect(readDoc(env)).toMatchObject({ tessFilePending: true, tessFileId: 501 })
  })

  it('delete que falha na 1a e funciona na 2a tentativa limpa a pendencia', async () => {
    const env = makeEnv({
      tess: {
        deleteFile: async (_id, call) => {
          if (call === 1) throw new TessError('tess-unavailable')
          return { deleted: true }
        },
      },
    })
    await runCoaRead(adminRequest(), env.deps)
    expect(env.tessCalls.delete).toEqual([501, 501])
    expect(readDoc(env).tessFilePending).toBe(false)
  })
})

describe('limpeza preventiva dos pendentes (D-10)', () => {
  const pending = (id, extra = {}) => ({
    status: 'failed',
    tessFileId: id,
    tessFilePending: true,
    lastTessCallAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })
  const doc = (n) => ({ type: 'coaOriginal', mimeType: 'application/pdf', storagePath: `processes/p1/documents/coaOriginal/${n}.pdf` })

  it('a proxima leitura do processo apaga os pendentes ANTES do upload', async () => {
    const env = makeEnv({
      store: baseStore({
        'processes/p1/documents/d2': doc('2'),
        'processes/p1/coaReads/d2': pending(900),
      }),
    })
    await runCoaRead(adminRequest(), env.deps)
    const order = env.events.filter((event) => event.startsWith('delete:') || event === 'upload')
    expect(order).toEqual(['delete:900', 'upload', 'delete:501'])
    expect(env.db.store.get('processes/p1/coaReads/d2').tessFilePending).toBe(false)
  })

  it('apaga no maximo 5 por leitura', async () => {
    const reads = {}
    for (let n = 2; n <= 9; n += 1) reads[`processes/p1/coaReads/d${n}`] = pending(900 + n)
    const env = makeEnv({ store: baseStore(reads) })
    await runCoaRead(adminRequest(), env.deps)
    const beforeUpload = env.events.slice(0, env.events.indexOf('upload')).filter((event) => event.startsWith('delete:'))
    expect(beforeUpload).toHaveLength(COA_LIMITS.preventiveCleanupMax)
  })

  it('pendente de leitura ainda em andamento (lease ativo) de OUTRO documento nao e apagado', async () => {
    const env = makeEnv({
      store: baseStore({
        'processes/p1/coaReads/d2': pending(901, {
          status: 'reading',
          leaseUntil: new Date(START + 60000).toISOString(),
        }),
        'processes/p1/coaReads/d3': pending(902, { status: 'reading', leaseUntil: new Date(START - 1).toISOString() }),
      }),
    })
    await runCoaRead(adminRequest(), env.deps)
    expect(env.tessCalls.delete).toContain(902)
    expect(env.tessCalls.delete).not.toContain(901)
    expect(env.db.store.get('processes/p1/coaReads/d2').tessFilePending).toBe(true)
  })

  it('pendente do PROPRIO documento (releitura) e apagado primeiro e o id novo substitui o antigo', async () => {
    const env = makeEnv({
      store: baseStore({
        [READ_PATH]: {
          status: 'failed',
          promptVersion: COA_PROMPT_VERSION,
          generation: '1700',
          attempts: 1,
          tessFileId: 880,
          tessFilePending: true,
          lastTessCallAt: new Date(START - 3600000).toISOString(),
        },
      }),
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(env.events.filter((event) => event.startsWith('delete:') || event === 'upload')).toEqual(['delete:880', 'upload', 'delete:501'])
    expect(readDoc(env)).toMatchObject({ tessFileId: 501, tessFilePending: false, attempts: 2 })
  })

  it('pendente proprio que nao conseguiu apagar continua registrado se nao houve upload', async () => {
    const env = makeEnv({
      bytes: Buffer.from('nao e pdf'),
      store: baseStore({
        [READ_PATH]: {
          status: 'failed',
          promptVersion: COA_PROMPT_VERSION,
          generation: '1700',
          attempts: 1,
          tessFileId: 880,
          tessFilePending: true,
          lastTessCallAt: new Date(START - 3600000).toISOString(),
        },
      }),
      tess: { deleteFile: async () => { throw new TessError('tess-unavailable') } },
    })
    await runCoaRead(adminRequest(), env.deps)
    expect(readDoc(env)).toMatchObject({ status: 'failed', tessFileId: 880, tessFilePending: true })
  })

  it('pendente de outro processo nao e tocado', async () => {
    const env = makeEnv({ store: baseStore({ 'processes/p9/coaReads/dx': pending(950) }) })
    await runCoaRead(adminRequest(), env.deps)
    expect(env.tessCalls.delete).toEqual([501])
  })

  it('id invalido no pendente nao vai a Tess; so limpa a marca', async () => {
    const env = makeEnv({ store: baseStore({ 'processes/p1/coaReads/d2': pending('../x') }) })
    await runCoaRead(adminRequest(), env.deps)
    expect(env.tessCalls.delete).toEqual([501])
    expect(env.db.store.get('processes/p1/coaReads/d2').tessFilePending).toBe(false)
  })
})

describe('workspace cheio, retentativas e 429', () => {
  it('workspace cheio: limpeza e 1 nova tentativa; se passar, done', async () => {
    const env = makeEnv({
      store: baseStore({ 'processes/p1/coaReads/d2': { status: 'failed', tessFileId: 900, tessFilePending: true, lastTessCallAt: '2026-01-01T00:00:00.000Z' } }),
      tess: {
        uploadFile: async (_args, call) => {
          if (call === 1) throw new TessError('tess-storage-full', { httpStatus: 422 })
          return { fileId: 501, credits: 0 }
        },
      },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(env.tessCalls.upload).toBe(2)
    expect(env.tessCalls.delete).toEqual([900, 501])
  })

  it('workspace cheio que persiste -> tess-storage-full depois de exatamente 1 nova tentativa', async () => {
    const env = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-storage-full', { httpStatus: 422 }) } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('failed')
    expect(result.read.error).toEqual({ code: 'tess-storage-full' })
    expect(env.tessCalls.upload).toBe(2)
    expect(env.tessCalls.delete).toEqual([])
    expect(env.tessCalls.execute).toBe(0)
  })

  it('upload: 1 nova tentativa em erro de rede/5xx; 2 falhas -> tess-unavailable', async () => {
    let env = makeEnv({
      tess: {
        uploadFile: async (_args, call) => {
          if (call === 1) throw new TessError('tess-unavailable', { httpStatus: 503 })
          return { fileId: 501, credits: 0 }
        },
      },
    })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
    expect(env.tessCalls.upload).toBe(2)

    env = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-unavailable', { httpStatus: 503 }) } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-unavailable' })
    expect(env.tessCalls.upload).toBe(2)
  })

  it('upload com timeout NAO repete (poderia ter criado o arquivo)', async () => {
    const env = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-timeout') } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-timeout' })
    expect(env.tessCalls.upload).toBe(1)
  })

  it('429 no upload: espera retry_after (60 s) UMA vez e segue', async () => {
    const env = makeEnv({
      tess: {
        uploadFile: async (_args, call) => {
          if (call === 1) throw new TessError('tess-rate-limit', { httpStatus: 429, retryAfterSeconds: 60 })
          return { fileId: 501, credits: 0 }
        },
      },
    })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
    expect(env.sleeps).toEqual([60000])
    expect(env.tessCalls.upload).toBe(2)
  })

  it('429 duas vezes -> tess-rate-limit (so 1 espera)', async () => {
    const env = makeEnv({
      tess: { uploadFile: async () => { throw new TessError('tess-rate-limit', { httpStatus: 429, retryAfterSeconds: 60 }) } },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-rate-limit' })
    expect(env.sleeps).toEqual([60000])
    expect(env.tessCalls.upload).toBe(2)
  })

  it('429 com espera que nao cabe no orcamento -> tess-rate-limit sem dormir', async () => {
    const env = makeEnv({
      tess: { uploadFile: async () => { throw new TessError('tess-rate-limit', { httpStatus: 429, retryAfterSeconds: 300 }) } },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-rate-limit' })
    expect(env.sleeps).toEqual([])
    expect(env.tessCalls.upload).toBe(1)
  })

  it('execute: repete SO em 429; nunca depois de timeout ou erro de rede', async () => {
    let env = makeEnv({
      tess: {
        executeAgent: async (_args, call) => {
          if (call === 1) throw new TessError('tess-rate-limit', { httpStatus: 429, retryAfterSeconds: 60 })
          return { responseId: 2, status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0 }
        },
      },
    })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
    expect(env.tessCalls.execute).toBe(2)
    expect(env.tessCalls.delete).toEqual([501])

    for (const code of ['tess-timeout', 'tess-unavailable']) {
      env = makeEnv({ tess: { executeAgent: async () => { throw new TessError(code) } } })
      const result = await runCoaRead(adminRequest(), env.deps)
      expect(result.read.error).toEqual({ code })
      expect(env.tessCalls.execute).toBe(1)
      expect(env.tessCalls.delete).toEqual([501])
    }
  })

  it('403 por credencial/workspace -> failed tess-auth', async () => {
    const env = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-auth', { httpStatus: 403 }) } } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.error).toEqual({ code: 'tess-auth' })
  })
})

describe('cache, tentativas e limite diario', () => {
  const iso = (offsetMs) => new Date(START + offsetMs).toISOString()
  const doneRead = (extra = {}) => ({
    schemaVersion: 1,
    promptVersion: COA_PROMPT_VERSION,
    status: 'done',
    generation: '1700',
    documentType: 'coa',
    certificates: [],
    attempts: 1,
    lastTessCallAt: iso(-3600000),
    leaseUntil: null,
    tessFileId: 501,
    tessFilePending: false,
    ...extra,
  })

  it('segunda leitura sai do cache: nao baixa o arquivo e nao chama a Tess (so getMetadata)', async () => {
    const env = makeEnv()
    await runCoaRead(adminRequest(), env.deps)
    const calls = { ...env.tessCalls, delete: [...env.tessCalls.delete] }
    const downloads = env.bucketState.downloadCalls
    const clientsBefore = env.createClient.mock.calls.length

    const second = await runCoaRead(adminRequest(), env.deps)
    expect(second.status).toBe('done')
    expect(second.cached).toBe(true)
    expect(second.read.certificates).toHaveLength(1)
    expect(env.tessCalls.upload).toBe(calls.upload)
    expect(env.tessCalls.execute).toBe(calls.execute)
    expect(env.tessCalls.delete).toEqual(calls.delete)
    expect(env.bucketState.downloadCalls).toBe(downloads)
    expect(env.createClient.mock.calls.length).toBe(clientsBefore)
    expect(env.bucketState.metadataCalls).toBe(2)
    for (const key of ['leaseUntil', 'requestedById', 'tessFileId', 'tessResponseId']) expect(second.read).not.toHaveProperty(key)
  })

  it('generation nova no Storage -> le de novo', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: doneRead({ generation: '1699' }) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.cached).toBe(false)
    expect(env.tessCalls.upload).toBe(1)
    expect(readDoc(env).generation).toBe('1700')
  })

  it('promptVersion nova -> le de novo e as tentativas recomecam em 1', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: doneRead({ promptVersion: 'coa-tess-antigo', attempts: 3 }) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.cached).toBe(false)
    expect(readDoc(env)).toMatchObject({ attempts: 1, promptVersion: COA_PROMPT_VERSION })
  })

  it('failed nao e cache: o proximo clique tenta de novo e conta a tentativa', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: doneRead({ status: 'failed', error: { code: 'tess-timeout' }, attempts: 1 }) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(readDoc(env).attempts).toBe(2)
  })

  it('force respeita attempts <= 3: 1a leitura + 2 "Ler de novo"; a 4a e recusada', async () => {
    const env = makeEnv()
    await runCoaRead(adminRequest(), env.deps)
    await runCoaRead(adminRequest({ processId: 'p1', documentId: 'd1', force: true }), env.deps)
    await runCoaRead(adminRequest({ processId: 'p1', documentId: 'd1', force: true }), env.deps)
    expect(readDoc(env).attempts).toBe(3)
    expect(env.tessCalls.upload).toBe(3)

    await expectHttpsError(
      runCoaRead(adminRequest({ processId: 'p1', documentId: 'd1', force: true }), env.deps),
      'resource-exhausted',
      'attempts'
    )
    expect(env.tessCalls.upload).toBe(3)
    // sem force o cache continua respondendo
    const cached = await runCoaRead(adminRequest(), env.deps)
    expect(cached.cached).toBe(true)
  })

  it('as 3 tentativas valem tambem para failed (sem force) e a recusa nao grava nada novo', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: doneRead({ status: 'failed', attempts: 3, error: { code: 'tess-error' } }) }) })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'resource-exhausted', 'attempts')
    expect(env.tessCalls.upload).toBe(0)
    expect(env.db.log.filter((entry) => entry.op === 'set')).toHaveLength(0)
  })

  const recent = (n) => ({ lastTessCallAt: iso(-(n + 1) * 1000), status: 'done' })
  const readsStore = (count, extra = {}) => {
    const reads = {}
    for (let n = 0; n < count; n += 1) reads[`processes/p1/coaReads/x${n}`] = recent(n)
    return baseStore({ ...reads, ...extra })
  }

  it('limite diario: a 61a leitura do processo em 24 h -> daily-limit; a 60a passa', async () => {
    let env = makeEnv({ store: readsStore(59) })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')

    env = makeEnv({ store: readsStore(60) })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'resource-exhausted', 'daily-limit')
    expect(env.tessCalls.upload).toBe(0)
    expect(env.createClient).not.toHaveBeenCalled()
  })

  it('leituras com mais de 24 h ou de outro processo nao contam', async () => {
    const reads = {}
    for (let n = 0; n < 70; n += 1) reads[`processes/p1/coaReads/old${n}`] = { lastTessCallAt: iso(-25 * 3600000), status: 'done' }
    for (let n = 0; n < 70; n += 1) reads[`processes/p9/coaReads/o${n}`] = recent(n)
    const env = makeEnv({ store: baseStore(reads) })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
  })

  it('o proprio documento ja contado na janela nao conta contra si (releitura com 60 no total)', async () => {
    const env = makeEnv({ store: readsStore(59, { [READ_PATH]: doneRead({ promptVersion: 'coa-tess-antigo', lastTessCallAt: iso(-1000) }) }) })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
  })

  it('cache vale mesmo com o limite diario estourado (nao gasta Tess)', async () => {
    const env = makeEnv({ store: readsStore(80, { [READ_PATH]: doneRead({ lastTessCallAt: iso(-2000) }) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.cached).toBe(true)
    expect(env.createClient).not.toHaveBeenCalled()
  })
})

describe('lease (idempotencia)', () => {
  const readingDoc = (leaseOffsetMs) => ({
    schemaVersion: 1,
    promptVersion: COA_PROMPT_VERSION,
    status: 'reading',
    generation: '1700',
    attempts: 1,
    lastTessCallAt: new Date(START - 10000).toISOString(),
    leaseUntil: new Date(START + leaseOffsetMs).toISOString(),
    tessFileId: null,
    tessFilePending: false,
  })

  it('lease ativo no mesmo documento -> status reading, sem Tess, sem download e sem gravar', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: readingDoc(60000) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result).toEqual({ status: 'reading', cached: false, read: null })
    expect(env.createClient).not.toHaveBeenCalled()
    expect(env.bucketState.downloadCalls).toBe(0)
    expect(env.db.log.filter((entry) => entry.op === 'set' || entry.op === 'update')).toHaveLength(0)
  })

  it('lease ativo vale tambem com force', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: readingDoc(60000) }) })
    const result = await runCoaRead(adminRequest({ processId: 'p1', documentId: 'd1', force: true }), env.deps)
    expect(result.status).toBe('reading')
    expect(env.tessCalls.upload).toBe(0)
  })

  it('lease vencido -> le (a tentativa abandonada conta)', async () => {
    const env = makeEnv({ store: baseStore({ [READ_PATH]: readingDoc(-1) }) })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    expect(readDoc(env).attempts).toBe(2)
  })
})

describe('documento apagado durante a leitura', () => {
  it('nao grava done nem recria coaReads; o arquivo da Tess ainda e apagado', async () => {
    const env = makeEnv({
      tess: {
        executeAgent: async () => {
          env.db.store.delete(DOC_PATH)
          env.db.store.delete(READ_PATH)
          return { responseId: 1, status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0 }
        },
      },
    })
    await expectHttpsError(runCoaRead(adminRequest(), env.deps), 'not-found', 'not-found')
    expect(env.db.store.has(READ_PATH)).toBe(false)
    expect(env.tessCalls.delete).toEqual([501])
    const finalWrites = env.db.log.filter((entry) => entry.path === READ_PATH && entry.op === 'set')
    expect(finalWrites).toHaveLength(1)
    expect(finalWrites[0].data.status).toBe('reading')
  })
})

describe('logs sem conteudo', () => {
  const FORBIDDEN = [
    'ACME PLASTICIZER',
    'ACX2610',
    'SYNTH SEA',
    'SYNTHETIC CHEM',
    'ARQUIVO-SECRETO',
    'Nome Secreto',
    'KEY-SECRET-ZZZ',
    '8675309',
    '3141592',
    'PRODUTO SECRETO',
    'conteudo sintetico',
    'Admin Teste',
    'admin@sqquimica.com',
  ]

  function logged(env) {
    return JSON.stringify([
      env.logger.info.mock.calls,
      env.logger.warn.mock.calls,
      env.logger.error.mock.calls,
      env.logger.debug.mock.calls,
    ])
  }

  it('sucesso, cache, falha da Tess, excecao inesperada e lease: o logger nunca recebe conteudo', async () => {
    const env = makeEnv()
    await runCoaRead(adminRequest(), env.deps)
    await runCoaRead(adminRequest(), env.deps)

    const failing = makeEnv({
      tess: { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: 'ACME PLASTICIZER PRODUTO SECRETO ACX2610 nao e json', credits: 0 }) },
    })
    await runCoaRead(adminRequest(), failing.deps)

    const exploding = makeEnv({ tess: { executeAgent: async () => { throw new Error('boom PRODUTO SECRETO ACX2610 KEY-SECRET-ZZZ') } } })
    await runCoaRead(adminRequest(), exploding.deps)

    const tessFail = makeEnv({ tess: { uploadFile: async () => { throw new TessError('tess-auth', { httpStatus: 403 }) } } })
    await runCoaRead(adminRequest(), tessFail.deps)

    for (const current of [env, failing, exploding, tessFail]) {
      const text = logged(current)
      for (const forbidden of FORBIDDEN) expect(text, `log vazou ${forbidden}`).not.toContain(forbidden)
    }
    // ... mas os campos permitidos estao la
    const first = env.logger.info.mock.calls[0]
    expect(first[0]).toBe('Leitura de COA.')
    expect(first[1]).toEqual({
      processId: 'p1',
      documentId: 'd1',
      uid: 'admin-1',
      status: 'done',
      cached: false,
      certificates: 1,
      credits: expect.any(Number),
      durationMs: expect.any(Number),
    })
    expect(env.logger.info.mock.calls[1][1]).toMatchObject({ status: 'done', cached: true, certificates: 1 })
    expect(logged(tessFail)).toContain('tess-auth')
  })

  it('log de lease ativo tambem e so ids e status', async () => {
    const env = makeEnv({
      store: baseStore({
        [READ_PATH]: {
          promptVersion: COA_PROMPT_VERSION,
          status: 'reading',
          generation: '1700',
          attempts: 1,
          leaseUntil: new Date(START + 60000).toISOString(),
        },
      }),
    })
    await runCoaRead(adminRequest(), env.deps)
    expect(env.logger.info).toHaveBeenCalledTimes(1)
    expect(env.logger.info.mock.calls[0][1]).toEqual({ processId: 'p1', documentId: 'd1', uid: 'admin-1', status: 'reading', cached: false })
  })

  it('a Tess recebe so o PDF (sem nome do arquivo nem dado do processo): upload leva os bytes, execute so o id', async () => {
    const env = makeEnv({
      tess: {
        uploadFile: async (args) => {
          expect(Object.keys(args).sort()).toEqual(['bytes', 'deadline'])
          expect(args.bytes).toBe(PDF_BYTES)
          return { fileId: 501, credits: 0 }
        },
        executeAgent: async (args) => {
          expect(Object.keys(args).sort()).toEqual(['deadline', 'fileId'])
          return { responseId: 1, status: 'succeeded', outputText: GOOD_OUTPUT, credits: 0 }
        },
      },
    })
    expect((await runCoaRead(adminRequest(), env.deps)).status).toBe('done')
  })
})

describe('documento com varios certificados e dados do agente hostis', () => {
  it('JSON com chave desconhecida, tipo errado e texto de instrucao: grava so o normalizado', async () => {
    const env = makeEnv({
      tess: { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: sampleOutputText(TESS_SAMPLES.unknownKeysAndWrongTypes), credits: 0 }) },
    })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.status).toBe('done')
    const stored = JSON.stringify(readDoc(env))
    expect(stored).not.toContain('instructions')
    expect(stored).not.toContain('extra_top_level')
    expect(readDoc(env).certificates).toHaveLength(1)
  })

  it('mais de 60 certificados: guarda 60 e o aviso', async () => {
    const many = agentJson(Array.from({ length: 65 }, (_, index) => certificate({ batch_number: `L-${index}` })))
    const env = makeEnv({ tess: { executeAgent: async () => ({ responseId: 1, status: 'succeeded', outputText: JSON.stringify(many), credits: 0 }) } })
    const result = await runCoaRead(adminRequest(), env.deps)
    expect(result.read.certificates).toHaveLength(60)
    expect(result.read.validationWarnings).toHaveLength(1)
  })
})
