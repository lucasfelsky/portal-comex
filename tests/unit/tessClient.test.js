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
  classifyTessFileStatus,
  createTessClient,
  isTessFileCompleted,
} from '../../functions/src/process/tessClient.js'
import { COA_TESS_MODEL } from '../../functions/src/process/coaRead.js'
import {
  REAL_FORMAT_OUTPUT_TEXT,
  TESS_REAL_FORMAT_EXECUTE_CREDITS,
  TESS_REAL_FORMAT_MODEL,
  TESS_REAL_FORMAT_SAMPLE,
  TESS_REAL_FORMAT_UPLOAD,
} from '../fixtures/coa/tessSamples.js'

const KEY = 'chave-sintetica-123'
const WORKSPACE = '4242'
const AGENT = 9001

function createHarness({ minIntervalMs = 1100, model } = {}) {
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
    ...(model === undefined ? {} : { model }),
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

  it('modelo da leitura: claude-sonnet-5-5-low, definido num unico lugar (coaRead.js)', () => {
    expect(COA_TESS_MODEL).toBe('claude-sonnet-5-5-low')
    const client = readFileSync(new URL('../../functions/src/process/tessClient.js', import.meta.url), 'utf8')
    expect(client).not.toMatch(/claude-sonnet/)
  })

  it('o codigo do cliente envia process=true no upload (a Tess exige arquivo processado; OBSERVADO 2026-11-26)', () => {
    const source = readFileSync(new URL('../../functions/src/process/tessClient.js', import.meta.url), 'utf8')
    expect(source).toMatch(/append\(\s*'process'\s*,\s*'true'\s*\)/)
    expect(source).not.toMatch(/append\(\s*'process'\s*,\s*'false'\s*\)/)
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
  it('multipart com o campo file chamado coa.pdf (application/pdf) e process=true', async () => {
    const h = createHarness()
    h.queue.push(json(TESS_REAL_FORMAT_UPLOAD, { status: 201 }))
    const result = await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    expect(result).toEqual({ fileId: 8800001, credits: 1, status: 'completed' })

    const { body, headers } = h.calls[0].init
    expect(body).toBeInstanceOf(FormData)
    expect([...body.keys()]).toEqual(['file', 'process'])
    expect(body.get('process')).toBe('true')
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
  it('corpo exato: mensagem user fixa, file_ids inteiros, waitExecution camelCase e model; nada mais', async () => {
    const h = createHarness()
    h.queue.push(json({ template_id: 't', responses: [{ id: 4773337, status: 'succeeded', output: 'texto', credits: 0.000337 }] }))
    const result = await h.client.executeAgent({ fileId: 73325, deadline: farDeadline(h) })
    expect(result).toEqual({ responseId: 4773337, status: 'succeeded', outputText: 'texto', credits: 0.000337, modelMismatch: false })

    const call = h.calls[0]
    expect(call.init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(call.init.body)).toEqual({
      messages: [{ role: 'user', content: 'Extraia os dados do COA anexado.' }],
      file_ids: [73325],
      waitExecution: true,
      model: 'claude-sonnet-5-5-low',
    })
    expect(Object.keys(JSON.parse(call.init.body)).sort()).toEqual(['file_ids', 'messages', 'model', 'waitExecution'])
    expect(typeof JSON.parse(call.init.body).model).toBe('string')
  })

  it('createTessClient com outro modelo envia o outro modelo; sem modelo (ou vazio) usa o padrao low', async () => {
    const medium = createHarness({ model: 'claude-sonnet-5-5-medium' })
    medium.queue.push(json({ responses: [{ id: 1, status: 'succeeded', output: 'x', credits: 1, answers: { model: 'claude-sonnet-5-5-medium' } }] }))
    const result = await medium.client.executeAgent({ fileId: 1, deadline: farDeadline(medium) })
    expect(JSON.parse(medium.calls[0].init.body).model).toBe('claude-sonnet-5-5-medium')
    expect(result.modelMismatch).toBe(false)

    for (const model of [undefined, '', '   ', null, 42]) {
      const h = createHarness({ model })
      h.queue.push(json({ responses: [{ id: 1, status: 'succeeded', output: 'x', credits: 1 }] }))
      await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
      expect(JSON.parse(h.calls[0].init.body).model).toBe('claude-sonnet-5-5-low')
    }
  })

  it('o modelo vai em toda execucao do mesmo cliente (nao so na primeira)', async () => {
    const h = createHarness()
    h.queue.push(
      json({ responses: [{ id: 1, status: 'succeeded', output: 'x', credits: 1 }] }),
      json({ responses: [{ id: 2, status: 'succeeded', output: 'y', credits: 1 }] })
    )
    await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    await h.client.executeAgent({ fileId: 2, deadline: farDeadline(h) })
    expect(h.calls.map((call) => JSON.parse(call.init.body).model)).toEqual(['claude-sonnet-5-5-low', 'claude-sonnet-5-5-low'])
  })

  it('answers.model igual ao pedido: sem divergencia; ausente ou nao textual: tambem sem divergencia', async () => {
    const answers = [{ model: 'claude-sonnet-5-5-low' }, undefined, null, {}, { model: 5 }, 'texto', []]
    for (const value of answers) {
      const h = createHarness()
      const response = { id: 1, status: 'succeeded', output: 'x', credits: 1 }
      if (value !== undefined) response.answers = value
      h.queue.push(json({ responses: [response] }))
      const result = await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
      expect(result.modelMismatch, JSON.stringify(value)).toBe(false)
    }
  })

  it('answers.model DIFERENTE do pedido: resultado usado normalmente, com modelMismatch true e sem expor o valor', async () => {
    const h = createHarness()
    h.queue.push(json({ responses: [{ id: 9, status: 'succeeded', output: 'texto-ok', credits: 3, answers: { model: 'MODELO-ESTRANHO-ZZZ' } }] }))
    const result = await h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })
    expect(result).toEqual({ responseId: 9, status: 'succeeded', outputText: 'texto-ok', credits: 3, modelMismatch: true })
    expect(JSON.stringify(result)).not.toContain('MODELO-ESTRANHO')

    // pediu medium, a Tess respondeu low: tambem e divergencia
    const other = createHarness({ model: 'claude-sonnet-5-5-medium' })
    other.queue.push(json({ responses: [{ id: 1, status: 'succeeded', output: 'x', credits: 1, answers: { model: 'claude-sonnet-5-5-low' } }] }))
    expect((await other.client.executeAgent({ fileId: 1, deadline: farDeadline(other) })).modelMismatch).toBe(true)
  })

  it('execute 422 por causa do modelo continua tess-error, estagio execute, httpStatus 422, e NAO ha nova tentativa sem modelo', async () => {
    const h = createHarness()
    h.queue.push(() => json({ message: 'The selected model is invalid', errors: { model: ['MODELO-RECUSADO-ZZZ'] } }, { status: 422 }))
    const error = await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) }))
    expect(error).toMatchObject({ code: 'tess-error', httpStatus: 422, stage: 'execute' })
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain('MODELO-RECUSADO')
    expect(h.calls).toHaveLength(1)
    expect(JSON.parse(h.calls[0].init.body).model).toBe('claude-sonnet-5-5-low')
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

  it('timeout do upload e de 90 s (upload processado e sincrono: ~35 s observado) e vira tess-timeout', async () => {
    const h = createHarness()
    h.queue.push((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const pending = upload(h)
    await new Promise((resolve) => setImmediate(resolve))
    expect(h.timerList[0].ms).toBe(90000)
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

describe('classifyTessFileStatus', () => {
  it('completed conclui; fail/error e falha; waiting, processing e vazio seguem em andamento', () => {
    expect(classifyTessFileStatus('completed')).toBe('completed')
    expect(classifyTessFileStatus('COMPLETED')).toBe('completed')
    expect(isTessFileCompleted('completed')).toBe(true)
    expect(classifyTessFileStatus('failed')).toBe('failed')
    expect(classifyTessFileStatus('error')).toBe('failed')
    expect(classifyTessFileStatus('processing_failed')).toBe('failed')
    for (const status of ['waiting', 'processing', 'queued', '', undefined, null, 7]) {
      expect(classifyTessFileStatus(status)).toBe('pending')
      expect(isTessFileCompleted(status)).toBe(false)
    }
  })
})

describe('waitFileProcessed (upload que nao voltou completed)', () => {
  const pending = (status = 'processing', extra = {}) => () => json({ id: 31, object: 'file', status, ...extra })
  const wait = (h, status = 'waiting', deadline = farDeadline(h)) =>
    h.client.waitFileProcessed({ fileId: 31, status, deadline })

  it('upload ja completed: nao consulta nada', async () => {
    const h = createHarness()
    expect(await wait(h, 'completed')).toEqual({ credits: 0 })
    expect(h.calls).toHaveLength(0)
  })

  it('waiting: consulta GET /files/{id} com espera crescente (3, 5, 10 s) ate completed e devolve os creditos', async () => {
    const h = createHarness()
    h.queue.push(pending('waiting'), pending('processing', { credits: 0.5 }), pending('completed', { credits: 1 }))
    const start = h.clock.t
    expect(await wait(h)).toEqual({ credits: 1 })
    expect(h.calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', 'https://api.tess.im/files/31'],
      ['GET', 'https://api.tess.im/files/31'],
      ['GET', 'https://api.tess.im/files/31'],
    ])
    expect(h.calls[0].at - start).toBe(3000)
    expect(h.calls[1].at - h.calls[0].at).toBe(5000)
    expect(h.calls[2].at - h.calls[1].at).toBe(10000)
    for (const call of h.calls) {
      expect(call.init.headers.Authorization).toBe(`Bearer ${KEY}`)
      expect(call.init.headers['x-workspace-id']).toBe(WORKSPACE)
      expect(call.init.body).toBeUndefined()
    }
    expect(h.timerList.every((timer) => timer.ms === 20000 && timer.cleared)).toBe(true)
  })

  it('status vazio no upload tambem consulta (so completed libera o execute)', async () => {
    const h = createHarness()
    h.queue.push(pending('completed'))
    await wait(h, '')
    expect(h.calls).toHaveLength(1)
  })

  it('status de falha no upload ou na consulta -> tess-error no estagio process', async () => {
    let h = createHarness()
    let error = await catchError(wait(h, 'failed'))
    expect(error).toMatchObject({ code: 'tess-error', stage: 'process' })
    expect(h.calls).toHaveLength(0)

    h = createHarness()
    h.queue.push(pending('processing'), pending('failed'))
    error = await catchError(wait(h))
    expect(error).toMatchObject({ code: 'tess-error', stage: 'process' })
    expect(h.calls).toHaveLength(2)
  })

  it('nunca fica completed: tess-timeout em ate 60 s, estagio process', async () => {
    const h = createHarness()
    for (let index = 0; index < 40; index += 1) h.queue.push(pending('processing'))
    const start = h.clock.t
    const error = await catchError(wait(h))
    expect(error).toMatchObject({ code: 'tess-timeout', stage: 'process' })
    expect(h.clock.t - start).toBeLessThanOrEqual(60000)
    expect(h.clock.t - start).toBeGreaterThan(60000 - 16000)
  })

  it('o prazo total tambem vale: deadline curto encerra a espera antes dos 60 s', async () => {
    const h = createHarness()
    for (let index = 0; index < 40; index += 1) h.queue.push(pending('processing'))
    const start = h.clock.t
    const error = await catchError(wait(h, 'waiting', h.now() + 12000))
    expect(error?.code).toBe('tess-timeout')
    expect(h.clock.t - start).toBeLessThan(12000)
  })

  it('falha transitoria (503, rede) da consulta segue esperando; erro definitivo (403) interrompe', async () => {
    let h = createHarness()
    h.queue.push(() => json({}, { status: 503 }), () => Promise.reject(new TypeError('fetch failed')), pending('completed'))
    expect(await wait(h)).toEqual({ credits: 0 })
    expect(h.calls).toHaveLength(3)

    h = createHarness()
    h.queue.push(() => json({ error: 'forbidden' }, { status: 403 }))
    const error = await catchError(wait(h))
    expect(error).toMatchObject({ code: 'tess-auth', httpStatus: 403, stage: 'process' })
  })

  it('corpo que nao e objeto -> tess-bad-response; fileId invalido e recusado antes do fetch', async () => {
    const h = createHarness()
    h.queue.push(() => json([1, 2]))
    expect((await catchError(wait(h)))?.code).toBe('tess-bad-response')
    const bad = await catchError(h.client.waitFileProcessed({ fileId: '31', status: 'waiting', deadline: farDeadline(h) }))
    expect(bad?.code).toBe('tess-bad-response')
    expect(h.calls).toHaveLength(1)
  })
})

describe('estagio e status HTTP nos erros (diagnostico sem conteudo)', () => {
  it('cada metodo marca o proprio estagio e o status HTTP numerico', async () => {
    const h = createHarness()
    h.queue.push(
      () => json({ error: 'x' }, { status: 500 }),
      () => json({ error: 'x' }, { status: 400 }),
      () => json({ error: 'x' }, { status: 400 }),
      () => json({ error: 'x' }, { status: 500 })
    )
    const errors = [
      await catchError(h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })),
      await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) })),
      await catchError(h.client.getAgentResponse({ responseId: 1, deadline: farDeadline(h) })),
      await catchError(h.client.deleteFile(1)),
    ]
    expect(errors.map((error) => [error.stage, error.httpStatus, error.code])).toEqual([
      ['upload', 500, 'tess-unavailable'],
      ['execute', 400, 'tess-error'],
      ['poll', 400, 'tess-error'],
      ['delete', 500, 'tess-unavailable'],
    ])
  })

  it('erro local (resposta ruim, prazo, id invalido) tambem leva o estagio', async () => {
    const h = createHarness()
    h.queue.push(() => json({ file_id: 5 }, { status: 201 }))
    expect((await catchError(h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })))?.stage).toBe('upload')
    expect((await catchError(h.client.executeAgent({ fileId: 1, deadline: h.now() - 1 })))?.stage).toBe('execute')
    expect((await catchError(h.client.deleteFile('x')))?.stage).toBe('delete')
  })

  it('execute 422 "arquivo ainda nao processado" -> tess-error (sem retry, sem novo codigo), httpStatus 422, estagio execute', async () => {
    const h = createHarness()
    h.queue.push(() => json({
      message: 'File 8800009 is not processed yet',
      errors: { file_ids: ['File 8800009 is not processed yet'] },
    }, { status: 422 }))
    const error = await catchError(h.client.executeAgent({ fileId: 8800009, deadline: farDeadline(h) }))
    expect(error).toMatchObject({ code: 'tess-error', httpStatus: 422, stage: 'execute' })
    expect(error.message).toBe('tess-error')
    expect(JSON.stringify({ ...error, message: error.message, stack: error.stack })).not.toContain('8800009')
    expect(h.calls).toHaveLength(1)
  })

  it('o erro nunca carrega corpo ou mensagem da Tess', async () => {
    const h = createHarness()
    h.queue.push(() => json({ error: 'PRODUTO X LOTE Y', message: 'PRODUTO X LOTE Y' }, { status: 400 }))
    const error = await catchError(h.client.executeAgent({ fileId: 1, deadline: farDeadline(h) }))
    const serialized = JSON.stringify({ ...error, message: error.message, stack: error.stack })
    expect(serialized).not.toContain('PRODUTO X')
    expect(Object.keys(error).sort()).toEqual(['code', 'httpStatus', 'name', 'stage'])
  })
})

describe('formato REAL observado (2026-11-26) com dados inventados', () => {
  it('executeAgent le o envelope completo: id, status, texto do output e credits da execucao', async () => {
    const h = createHarness()
    h.queue.push(json(TESS_REAL_FORMAT_SAMPLE))
    const result = await h.client.executeAgent({ fileId: 8800001, deadline: farDeadline(h) })
    expect(result).toEqual({
      responseId: 5550001,
      status: 'succeeded',
      outputText: REAL_FORMAT_OUTPUT_TEXT,
      credits: TESS_REAL_FORMAT_EXECUTE_CREDITS,
      modelMismatch: false,
    })
    expect(TESS_REAL_FORMAT_SAMPLE.responses[0].answers).toEqual({ model: TESS_REAL_FORMAT_MODEL })
    expect(JSON.parse(h.calls[0].init.body).model).toBe(TESS_REAL_FORMAT_MODEL)
    expect(classifyTessAgentStatus(result.status, result.outputText)).toBe('done')
    // o texto tem numeros com zeros a direita (JSON valido) que o JSON.stringify nunca geraria
    expect(result.outputText).toContain('"value": 3750.00')
    expect(result.outputText).toContain('"value": 1875.50')
  })

  it('fluxo observado: upload processado (completed, 1 credito) -> execute (~9,25 com o modelo low) -> delete', async () => {
    const h = createHarness()
    h.queue.push(
      json(TESS_REAL_FORMAT_UPLOAD, { status: 201 }),
      json(TESS_REAL_FORMAT_SAMPLE),
      json({ id: String(TESS_REAL_FORMAT_UPLOAD.id), object: 'file', deleted: true })
    )
    const uploaded = await h.client.uploadFile({ bytes: PDF, deadline: farDeadline(h) })
    expect(isTessFileCompleted(uploaded.status)).toBe(true)
    const executed = await h.client.executeAgent({ fileId: uploaded.fileId, deadline: farDeadline(h) })
    expect(await h.client.deleteFile(uploaded.fileId)).toEqual({ deleted: true })
    expect(uploaded.credits + executed.credits).toBeCloseTo(10.25, 6)
    expect(h.calls.map((call) => call.init.method)).toEqual(['POST', 'POST', 'DELETE'])
  })
})
