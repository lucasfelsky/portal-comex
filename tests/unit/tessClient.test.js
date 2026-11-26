// S11-B: cliente HTTP da Tess (functions/src/process/tessClient.js) com `fetch`, relogio, sleep e timers
// falsos: nenhuma chamada de rede. Cobre cabecalhos, upload/execute/consulta/delete, pacer de 1,1 s, mapeamento
// de erros e a recusa de ids que nao sao inteiros antes do fetch.
//
// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  TESS_API_BASE,
  TESS_CONTRACT_VERSION,
  TESS_USER_MESSAGE,
  TessError,
  classifyTessAgentStatus,
  createPacer,
  createTessClient,
} from '../../functions/src/process/tessClient.js'

const KEY = 'chave-sintetica-123'
const WORKSPACE = '4242'
const AGENT = 9001

function createHarness({ minIntervalMs = 1100 } = {}) {
  const clock = { t: 1_000_000 }
  const calls = []
  const queue = []
  const timerList = []
  const now = () => clock.t
  const sleep = async (ms) => {
    clock.t += ms
  }
  const timers = {
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, cleared: false }
      timerList.push(timer)
      return timer
    },
    clearTimeout: (timer) => {
      if (timer) timer.cleared = true
    },
  }
  const fetchImpl = (url, init) => {
    calls.push({ url, init, at: clock.t })
    const next = queue.shift()
    if (!next) throw new Error('fetch inesperado (fila vazia)')
    return typeof next === 'function' ? next(url, init) : Promise.resolve(next)
  }
  const client = createTessClient({
    apiKey: KEY,
    agentId: AGENT,
    workspaceId: WORKSPACE,
    fetchImpl,
    sleep,
    now,
    minIntervalMs,
    timers,
  })
  return { client, calls, queue, clock, timerList, now, sleep, timers, fetchImpl }
}

function json(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

const PDF = Buffer.from('%PDF-1.7\nconteudo sintetico')
const farDeadline = (h) => h.now() + 10 * 60 * 1000

async function catchError(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

describe('constantes do contrato', () => {
  it('base e versao documentadas', () => {
    expect(TESS_API_BASE).toBe('https://api.tess.im')
    expect(TESS_CONTRACT_VERSION).toBe('docs.tess.im 2026-11-25')
    expect(TESS_USER_MESSAGE).toBe('Extraia os dados do COA anexado.')
  })

  it('o codigo do cliente nunca usa o parametro process do upload', () => {
    const source = readFileSync(new URL('../../functions/src/process/tessClient.js', import.meta.url), 'utf8')
    expect(source).not.toContain('process=')
    expect(source).not.toMatch(/append\(\s*['"]process['"]/)
    expect(source).not.toMatch(/\bprocess\s*:/)
  })
})

describe('requisicoes comuns', () => {
  it('toda requisicao leva Bearer, x-workspace-id e redirect error, na base https://api.tess.im', async () => {
    const h = createHarness()
    h.queue.push(
      json({ id: 11, credits: 0 }, { status: 201 }),
      json({ responses: [{ id: 22, status: 'succeeded', output: '{}', credits: 0.1 }] }),
      json({ id: 22, status: 'succeeded', output: '{}', credits: 0.1 }),
      json({ id: 11, object: 'file', deleted: true })
    )
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    await h.client.executeAgent({ fileId: 11, deadline: farDeadline(h) })
    await h.client.getAgentResponse({ responseId: 22, deadline: farDeadline(h) })
    await h.client.deleteFile(11)

    expect(h.calls).toHaveLength(4)
    for (const call of h.calls) {
      expect(call.url.startsWith('https://api.tess.im/')).toBe(true)
      expect(call.init.headers.Authorization).toBe(`Bearer ${KEY}`)
      expect(call.init.headers['x-workspace-id']).toBe(WORKSPACE)
      expect(call.init.redirect).toBe('error')
      expect(call.init.signal).toBeInstanceOf(AbortSignal)
      expect(call.url).not.toContain('process')
    }
    expect(h.calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', 'https://api.tess.im/files'],
      ['POST', `https://api.tess.im/agents/${AGENT}/execute`],
      ['GET', 'https://api.tess.im/agent-responses/22'],
      ['DELETE', 'https://api.tess.im/files/11'],
    ])
  })

  it('cada chamada ganha um AbortController proprio e o timer e limpo ao fim', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 1 }), json({ id: 2 }))
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    expect(h.calls[0].init.signal).not.toBe(h.calls[1].init.signal)
    expect(h.timerList).toHaveLength(2)
    expect(h.timerList.every((timer) => timer.cleared)).toBe(true)
  })

  it('a chave nao aparece no erro nem na mensagem', async () => {
    const h = createHarness()
    h.queue.push(json({ error: `bad key ${KEY}` }, { status: 401 }))
    const error = await catchError(h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) }))
    expect(error).toBeInstanceOf(TessError)
    expect(error.code).toBe('tess-auth')
    expect(JSON.stringify({ message: error.message, code: error.code, stack: error.stack })).not.toContain(KEY)
  })

  it('configuracao invalida: agente nao inteiro, chave vazia, workspace nao numerico', () => {
    const base = { apiKey: KEY, agentId: AGENT, workspaceId: WORKSPACE, fetchImpl: () => {} }
    expect(() => createTessClient({ ...base, agentId: '9001' })).toThrow(TessError)
    expect(() => createTessClient({ ...base, agentId: 1.5 })).toThrow(TessError)
    expect(() => createTessClient({ ...base, agentId: 0 })).toThrow(TessError)
    expect(() => createTessClient({ ...base, apiKey: '' })).toThrow(TessError)
    expect(() => createTessClient({ ...base, workspaceId: '12/../3' })).toThrow(TessError)
  })
})

describe('uploadFile', () => {
  it('multipart com o campo file chamado coa.pdf (application/pdf) e SEM process', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 73325, object: 'file', credits: 0.02, status: 'waiting' }, { status: 201 }))
    const result = await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    expect(result).toEqual({ fileId: 73325, credits: 0.02 })

    const { body, headers } = h.calls[0].init
    expect(body).toBeInstanceOf(FormData)
    expect([...body.keys()]).toEqual(['file'])
    expect(body.has('process')).toBe(false)
    const file = body.get('file')
    expect(file.name).toBe('coa.pdf')
    expect(file.type).toBe('application/pdf')
    expect(file.size).toBe(PDF.length)
    // sem Content-Type manual: o fetch gera o boundary do multipart
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain('content-type')
  })

  it('o identificador e id inteiro: file_id, id textual, zero, negativo ou fracionario -> tess-bad-response', async () => {
    for (const body of [{ file_id: 5 }, { id: '5' }, { id: 0 }, { id: -3 }, { id: 1.5 }, {}, []]) {
      const h = createHarness()
      h.queue.push(json(body, { status: 201 }))
      const error = await catchError(h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) }))
      expect(error?.code).toBe('tess-bad-response')
    }
  })

  it('corpo vazio ou sem bytes e recusado antes do fetch', async () => {
    const h = createHarness()
    const error = await catchError(h.client.uploadFile({ bytes: Buffer.alloc(0), deadline: farDeadline(h) }))
    expect(error?.code).toBe('tess-bad-response')
    expect(h.calls).toHaveLength(0)
  })

  it('creditos ausentes viram 0', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 3 }))
    expect((await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })).credits).toBe(0)
  })
})

describe('executeAgent', () => {
  it('corpo exato: mensagem user fixa, file_ids inteiros e waitExecution camelCase; nada mais', async () => {
    const h = createHarness()
    h.queue.push(json({ template_id: 't', responses: [{ id: 4773337, status: 'succeeded', output: 'texto', credits: 0.000337 }] }))
    const result = await h.client.executeAgent({ fileId: 73325, deadline: farDeadline(h) })
    expect(result).toEqual({ responseId: 4773337, status: 'succeeded', outputText: 'texto', credits: 0.000337 })

    const call = h.calls[0]
    expect(call.init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(call.init.body)).toEqual({
      messages: [{ role: 'user', content: 'Extraia os dados do COA anexado.' }],
      file_ids: [73325],
      waitExecution: true,
    })
    expect(Object.keys(JSON.parse(call.init.body)).sort()).toEqual(['file_ids', 'messages', 'waitExecution'])
  })

  it('em andamento: status starting com output vazio devolve texto vazio e o id da resposta', async () => {
    const h = createHarness()
    h.queue.push(json({ responses: [{ id: 7, status: 'starting', output: '', credits: 0 }] }))
    const result = await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    expect(result).toMatchObject({ responseId: 7, status: 'starting', outputText: '' })
  })

  it('sem id de resposta e ainda em andamento -> tess-bad-response; com texto pronto segue sem id', async () => {
    const h = createHarness()
    h.queue.push(json({ responses: [{ status: 'starting', output: '' }] }))
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-bad-response')
    h.queue.push(json({ responses: [{ status: 'succeeded', output: '{"a":1}' }] }))
    const ready = await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    expect(ready).toMatchObject({ responseId: null, outputText: '{"a":1}' })
  })

  it('resposta sem responses ou com output nao textual -> sem texto', async () => {
    const h = createHarness()
    h.queue.push(json({ responses: [] }))
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-bad-response')
    h.queue.push(json({ responses: [{ id: 9, status: 'starting', output: { x: 1 } }] }))
    const result = await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    expect(result.outputText).toBe('')
  })

  it('timeout do fetch -> tess-timeout e NENHUMA nova tentativa dentro do cliente', async () => {
    const h = createHarness()
    h.queue.push((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const pending = h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    await Promise.resolve()
    await new Promise((resolve) => setImmediate(resolve))
    expect(h.timerList).toHaveLength(1)
    expect(h.timerList[0].ms).toBe(110000)
    h.timerList[0].fn()
    expect((await catchError(pending))?.code).toBe('tess-timeout')
    expect(h.calls).toHaveLength(1)
  })

  it('erro de rede -> tess-unavailable, sem nova tentativa', async () => {
    const h = createHarness()
    h.queue.push(() => Promise.reject(new TypeError('fetch failed')))
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-unavailable')
    expect(h.calls).toHaveLength(1)
  })
})

describe('getAgentResponse', () => {
  it('aceita o objeto direto ou a lista responses', async () => {
    const h = createHarness()
    h.queue.push(
      json({ id: 5, status: 'succeeded', output: 'a', credits: 0.2 }),
      json({ responses: [{ id: 5, status: 'running', output: '', credits: 0 }] })
    )
    expect(await h.client.getAgentResponse({ responseId: 5, deadline: farDeadline(h) })).toEqual({
      status: 'succeeded',
      outputText: 'a',
      credits: 0.2,
    })
    expect(await h.client.getAgentResponse({ responseId: 5, deadline: farDeadline(h) })).toEqual({
      status: 'running',
      outputText: '',
      credits: 0,
    })
  })

  it('timeout de 20 s por consulta', async () => {
    const h = createHarness()
    h.queue.push(json({ status: 'succeeded', output: 'x' }))
    await h.client.getAgentResponse({ responseId: 5, deadline: farDeadline(h) })
    expect(h.timerList[0].ms).toBe(20000)
  })

  it('o timer respeita o prazo restante: nunca passa do deadline', async () => {
    const h = createHarness()
    h.queue.push(json({ status: 'succeeded', output: 'x' }))
    await h.client.getAgentResponse({ responseId: 5, deadline: h.now() + 3000 })
    expect(h.timerList[0].ms).toBe(3000)
  })

  it('prazo estourado -> tess-timeout sem chamar o fetch', async () => {
    const h = createHarness()
    expect((await catchError(h.client.getAgentResponse({ responseId: 5, deadline: h.now() - 1 })))?.code).toBe('tess-timeout')
    expect((await catchError(h.client.executeAgent({ fileId: 5, deadline: h.now() })))?.code).toBe('tess-timeout')
    expect(h.calls).toHaveLength(0)
  })
})

describe('deleteFile', () => {
  it('DELETE /files/{id} devolve deleted', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 3, object: 'file', deleted: true }))
    expect(await h.client.deleteFile(3)).toEqual({ deleted: true })
    expect(h.calls[0].init.method).toBe('DELETE')
    expect(h.calls[0].url).toBe('https://api.tess.im/files/3')
  })

  it('arquivo que ja nao existe (404) conta como apagado', async () => {
    const h = createHarness()
    h.queue.push(json({ error: 'not found' }, { status: 404 }))
    expect(await h.client.deleteFile(3)).toEqual({ deleted: true })
  })

  it('falha (500, rede, 429) lanca TessError para quem chama decidir (a function trata no finally)', async () => {
    const h = createHarness()
    h.queue.push(json({ error: 'x' }, { status: 500 }))
    expect((await catchError(h.client.deleteFile(3)))?.code).toBe('tess-unavailable')
    h.queue.push(() => Promise.reject(new TypeError('fetch failed')))
    expect((await catchError(h.client.deleteFile(3)))?.code).toBe('tess-unavailable')
    h.queue.push(json({ error: 'slow down', retry_after: 60 }, { status: 429 }))
    expect((await catchError(h.client.deleteFile(3)))?.code).toBe('tess-rate-limit')
  })
})

describe('ids so entram na URL como inteiros positivos validados', () => {
  it('fileId, responseId e agentId invalidos sao recusados ANTES do fetch', async () => {
    const h = createHarness()
    const bad = ['1/../2', '12', 1.5, 0, -1, NaN, Infinity, null, undefined, {}, '1?x=2', 2 ** 60]
    for (const value of bad) {
      expect((await catchError(h.client.executeAgent({ fileId: value, deadline: farDeadline(h) })))?.code).toBe('tess-bad-response')
      expect((await catchError(h.client.getAgentResponse({ responseId: value, deadline: farDeadline(h) })))?.code).toBe('tess-bad-response')
      expect((await catchError(h.client.deleteFile(value)))?.code).toBe('tess-bad-response')
    }
    expect(h.calls).toHaveLength(0)
  })
})

describe('pacer', () => {
  it('2 requisicoes seguidas saem com >= 1.100 ms de intervalo (relogio falso)', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 1 }), json({ id: 1, deleted: true }), json({ id: 1, deleted: true }))
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    await h.client.deleteFile(1)
    await h.client.deleteFile(1)
    expect(h.calls).toHaveLength(3)
    expect(h.calls[1].at - h.calls[0].at).toBeGreaterThanOrEqual(1100)
    expect(h.calls[2].at - h.calls[1].at).toBeGreaterThanOrEqual(1100)
  })

  it('so espera o que falta: requisicao depois de 5 s sai sem espera extra', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 1 }), json({ id: 1, deleted: true }))
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    h.clock.t += 5000
    const before = h.clock.t
    await h.client.deleteFile(1)
    expect(h.calls[1].at).toBe(before)
  })

  it('intervalo medido a partir do TERMINO da anterior (resposta lenta nao encurta a pausa)', async () => {
    const h = createHarness()
    h.queue.push(
      async () => {
        h.clock.t += 3000
        return json({ id: 1 })
      },
      json({ id: 1, deleted: true })
    )
    await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    const finishedAt = h.clock.t
    await h.client.deleteFile(1)
    expect(h.calls[1].at - finishedAt).toBeGreaterThanOrEqual(1100)
  })

  it('pacer compartilhado entre clientes vale para o conjunto', async () => {
    const clock = { t: 0 }
    const now = () => clock.t
    const sleep = async (ms) => {
      clock.t += ms
    }
    const pacer = createPacer({ now, sleep, minIntervalMs: 1100 })
    const calls = []
    const fetchImpl = () => {
      calls.push(clock.t)
      return Promise.resolve(json({ id: 1, deleted: true }))
    }
    const make = () => createTessClient({ apiKey: KEY, agentId: AGENT, workspaceId: WORKSPACE, fetchImpl, sleep, now, pacer })
    await make().deleteFile(1)
    await make().deleteFile(1)
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1100)
  })

  it('o padrao (sem minIntervalMs) e 1.100 ms no cliente e no pacer', async () => {
    const clock = { t: 0 }
    const now = () => clock.t
    const sleep = async (ms) => {
      clock.t += ms
    }
    const calls = []
    const fetchImpl = () => {
      calls.push(clock.t)
      return Promise.resolve(json({ id: 1, deleted: true }))
    }
    const client = createTessClient({ apiKey: KEY, agentId: AGENT, workspaceId: WORKSPACE, fetchImpl, sleep, now })
    await client.deleteFile(1)
    await client.deleteFile(1)
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1100)

    const pacer = createPacer({ now, sleep })
    await pacer.wait()
    const first = clock.t
    await pacer.wait()
    expect(clock.t - first).toBeGreaterThanOrEqual(1100)
  })

  it('pedidos concorrentes entram em fila: nunca 2 dentro da janela', async () => {
    const h = createHarness()
    h.queue.push(json({ id: 1, deleted: true }), json({ id: 2, deleted: true }), json({ id: 3, deleted: true }))
    await Promise.all([h.client.deleteFile(1), h.client.deleteFile(2), h.client.deleteFile(3)])
    expect(h.calls[1].at - h.calls[0].at).toBeGreaterThanOrEqual(1100)
    expect(h.calls[2].at - h.calls[1].at).toBeGreaterThanOrEqual(1100)
  })
})

describe('mapeamento de erros', () => {
  const upload = (h) => h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })

  it('429 -> tess-rate-limit com retryAfterSeconds (corpo, cabecalho, padrao 60 e teto 300)', async () => {
    const h = createHarness()
    h.queue.push(json({ error: 'rate', retry_after: 60 }, { status: 429 }))
    let error = await catchError(upload(h))
    expect(error).toMatchObject({ code: 'tess-rate-limit', httpStatus: 429, retryAfterSeconds: 60 })
    h.queue.push(json({ error: 'rate', retry_after: 7 }, { status: 429 }))
    expect((await catchError(upload(h))).retryAfterSeconds).toBe(7)
    h.queue.push(json({ error: 'rate' }, { status: 429, headers: { 'retry-after': '12' } }))
    expect((await catchError(upload(h))).retryAfterSeconds).toBe(12)
    h.queue.push(json({ error: 'rate' }, { status: 429 }))
    expect((await catchError(upload(h))).retryAfterSeconds).toBe(60)
    h.queue.push(json({ error: 'rate', retry_after: 99999 }, { status: 429 }))
    error = await catchError(upload(h))
    expect(error.retryAfterSeconds).toBe(300)
  })

  it('401, 403 e 422 de credencial/workspace -> tess-auth', async () => {
    const h = createHarness()
    h.queue.push(
      json({ error: 'unauthorized' }, { status: 401 }),
      json({ error: 'forbidden' }, { status: 403 }),
      json({ message: 'The x-workspace-id header is required' }, { status: 422 }),
      json({ message: 'Invalid API token' }, { status: 422 })
    )
    for (let index = 0; index < 4; index += 1) expect((await catchError(upload(h)))?.code).toBe('tess-auth')
  })

  it('422 de credencial tambem em execute/consulta; outros 4xx -> tess-error', async () => {
    const h = createHarness()
    h.queue.push(json({ message: 'workspace not found' }, { status: 422 }))
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-auth')
    h.queue.push(json({ error: 'bad request' }, { status: 400 }))
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-error')
    h.queue.push(json({ message: 'agent invalid' }, { status: 422 }))
    expect((await catchError(h.client.getAgentResponse({ responseId: 1, deadline: farDeadline(h) })))?.code).toBe('tess-error')
  })

  it('422 no upload que nao e credencial -> tess-storage-full', async () => {
    const h = createHarness()
    h.queue.push(json({ message: 'Unable to store file' }, { status: 422 }), json({}, { status: 422 }))
    expect((await catchError(upload(h)))?.code).toBe('tess-storage-full')
    expect((await catchError(upload(h)))?.code).toBe('tess-storage-full')
  })

  it('413 no upload: sem mensagem -> storage-full; mensagem de tamanho -> too-large; mensagem de limite de arquivos -> storage-full', async () => {
    const h = createHarness()
    h.queue.push(
      json({}, { status: 413 }),
      json({ error: 'File too large' }, { status: 413 }),
      json({ error: 'Payload too large: file size exceeds 32MB' }, { status: 413 }),
      json({ error: 'Storage limit reached: maximum number of files (30) exceeded; file too large' }, { status: 413 })
    )
    expect((await catchError(upload(h)))?.code).toBe('tess-storage-full')
    expect((await catchError(upload(h)))?.code).toBe('tess-too-large')
    expect((await catchError(upload(h)))?.code).toBe('tess-too-large')
    expect((await catchError(upload(h)))?.code).toBe('tess-storage-full')
  })

  it('413 com arquivo acima de 32 MB -> tess-too-large mesmo sem mensagem', async () => {
    const h = createHarness()
    h.queue.push(json({}, { status: 413 }))
    const big = Buffer.alloc(32 * 1024 * 1024 + 1)
    const error = await catchError(h.client.uploadFile({ bytes: big, deadline: farDeadline(h) }))
    expect(error?.code).toBe('tess-too-large')
  })

  it('500, 502, 503, 504 e erro de rede -> tess-unavailable', async () => {
    const h = createHarness()
    h.queue.push(
      json({}, { status: 500 }),
      json({}, { status: 502 }),
      json({}, { status: 503 }),
      json({}, { status: 504 }),
      () => Promise.reject(new TypeError('fetch failed'))
    )
    for (let index = 0; index < 5; index += 1) expect((await catchError(upload(h)))?.code).toBe('tess-unavailable')
  })

  it('timeout do upload e de 30 s e vira tess-timeout', async () => {
    const h = createHarness()
    h.queue.push((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const pending = upload(h)
    await new Promise((resolve) => setImmediate(resolve))
    expect(h.timerList[0].ms).toBe(30000)
    h.timerList[0].fn()
    expect((await catchError(pending))?.code).toBe('tess-timeout')
  })

  it('2xx com corpo que nao e JSON -> tess-bad-response', async () => {
    const h = createHarness()
    h.queue.push(new Response('<html>oops</html>', { status: 200 }), new Response('', { status: 201 }))
    expect((await catchError(upload(h)))?.code).toBe('tess-bad-response')
    expect((await catchError(upload(h)))?.code).toBe('tess-bad-response')
  })

  it('resposta acima de 1 MB (cabecalho ou corpo) -> tess-bad-response', async () => {
    const h = createHarness()
    // corpo VALIDO (id inteiro): sem o limite de 1 MB o upload daria certo
    const big = JSON.stringify({ id: 5, pad: 'y'.repeat(1024 * 1024 + 10) })
    h.queue.push(
      new Response(JSON.stringify({ id: 5 }), { status: 200, headers: { 'content-length': String(2 * 1024 * 1024) } }),
      new Response(big, { status: 200 })
    )
    expect((await catchError(upload(h)))?.code).toBe('tess-bad-response')
    expect((await catchError(upload(h)))?.code).toBe('tess-bad-response')
  })

  it('resposta de exatamente 1 MB ainda e lida', async () => {
    const h = createHarness()
    const base = JSON.stringify({ id: 4, pad: '' }).length
    const body = JSON.stringify({ id: 4, pad: 'z'.repeat(1024 * 1024 - base) })
    expect(body.length).toBe(1024 * 1024)
    h.queue.push(new Response(body, { status: 200 }))
    expect((await upload(h)).fileId).toBe(4)
  })

  it('mensagem do erro e so o codigo (nunca o texto da resposta)', async () => {
    const h = createHarness()
    h.queue.push(json({ error: 'conteudo sensivel do COA: PRODUTO X LOTE Y' }, { status: 400 }))
    const error = await catchError(upload(h))
    expect(error.message).toBe('tess-error')
    expect(error.stack).not.toContain('PRODUTO X')
  })
})

describe('classifyTessAgentStatus', () => {
  it('succeeded e concluido; fail/error e falha; outro status depende de ter texto', () => {
    expect(classifyTessAgentStatus('succeeded', '')).toBe('done')
    expect(classifyTessAgentStatus('SUCCEEDED', 'x')).toBe('done')
    expect(classifyTessAgentStatus('failed', 'x')).toBe('failed')
    expect(classifyTessAgentStatus('error', '')).toBe('failed')
    expect(classifyTessAgentStatus('execution_failed', '')).toBe('failed')
    expect(classifyTessAgentStatus('starting', '')).toBe('pending')
    expect(classifyTessAgentStatus('running', '   ')).toBe('pending')
    expect(classifyTessAgentStatus('', '')).toBe('pending')
    expect(classifyTessAgentStatus('running', '{"a":1}')).toBe('done')
    expect(classifyTessAgentStatus(undefined, undefined)).toBe('pending')
  })
})
