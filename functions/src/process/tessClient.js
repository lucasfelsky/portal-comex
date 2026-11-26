// S11-B: cliente HTTP da API da Tess (https://api.tess.im). O contrato vem da documentacao publica
// (`docs/coa/tess-api.md`, versao `TESS_CONTRACT_VERSION`); as inferencias [INF] sao conferidas na fatia D.
//
// - `fetch`, relogio e `sleep` sao injetaveis (teste sem rede e sem espera real).
// - Todas as requisicoes: `Authorization: Bearer`, `x-workspace-id`, `redirect: 'error'`, AbortController por
//   chamada, resposta lida ate 1 MB e PACER (>= minIntervalMs entre requisicoes: a Tess limita 1 req/s por
//   organizacao; com `maxInstances: 1` o pacer da instancia vale para o Portal todo).
// - So' PDF, nome generico `coa.pdf`, COM `process=true` no upload: OBSERVADO em 2026-11-26 que a execucao do
//   agente recusa (422 "File ... is not processed yet") arquivo nao processado. O upload processado devolve
//   `completed` (~1 credito); se vier outro status, `waitFileProcessed` consulta `GET /files/{id}` ate `completed`.
// - Ids (`agentId`, `fileId`, `responseId`) so' entram na URL como inteiros positivos validados.
// - Erros: `TessError` com `code` fixo; a mensagem do erro e' o proprio codigo (nunca conteudo da resposta).
//   Diagnostico: `stage` ('upload'|'process'|'execute'|'poll'|'delete') e `httpStatus` (numero) acompanham o erro;
//   nada de corpo/mensagem da Tess.
// - Modelo: todo `execute` leva `model` (padrao `COA_TESS_MODEL`, ~8 a 19 creditos por leitura contra 56 a 112 do
//   modelo padrao do agente; OBSERVADO 2026-11-26). Se a resposta ecoar outro modelo em `answers.model`, o
//   resultado e' usado normalmente e `executeAgent` devolve `modelMismatch: true` (a function so' loga a flag).

import { COA_TESS_MODEL } from './coaRead.js'

export const TESS_API_BASE = 'https://api.tess.im'
export const TESS_CONTRACT_VERSION = 'docs.tess.im 2026-11-25'
export const TESS_USER_MESSAGE = 'Extraia os dados do COA anexado.'
export const TESS_MIN_INTERVAL_MS = 1100
export const TESS_MAX_RESPONSE_BYTES = 1024 * 1024
export const TESS_MAX_FILE_BYTES = 32 * 1024 * 1024

// Orcamento (teto total de 240 s em `coaReadFunction.js`): o upload com `process=true` e' sincrono (observado
// ~35 s com o processamento), a espera extra pelo processamento e' limitada e a execucao leva ~25 s (observado).
const UPLOAD_TIMEOUT_MS = 90000
const FILE_POLL_TIMEOUT_MS = 20000
export const TESS_FILE_PROCESS_MAX_WAIT_MS = 60000
export const TESS_FILE_POLL_WAITS_SECONDS = [3, 5, 10, 15]
const EXECUTE_TIMEOUT_MS = 110000
const POLL_TIMEOUT_MS = 20000
const DELETE_TIMEOUT_MS = 15000
const DEFAULT_RETRY_AFTER_SECONDS = 60
const MAX_RETRY_AFTER_SECONDS = 300

export const TESS_STAGES = ['upload', 'process', 'execute', 'poll', 'delete']

export class TessError extends Error {
  constructor(code, { httpStatus = null, retryAfterSeconds, stage = null } = {}) {
    super(code)
    this.name = 'TessError'
    this.code = code
    this.httpStatus = httpStatus
    this.stage = stage
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toPositiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function assertId(value) {
  const id = toPositiveInteger(value)
  if (id === null) throw new TessError('tess-bad-response')
  return String(id)
}

// Fila de requisicoes: cada uma espera `minIntervalMs` desde o envio/termino da anterior.
export function createPacer({ now = Date.now, sleep = defaultSleep, minIntervalMs = TESS_MIN_INTERVAL_MS } = {}) {
  let last = Number.NEGATIVE_INFINITY
  let chain = Promise.resolve()
  return {
    wait() {
      const turn = chain.then(async () => {
        const waitMs = last + minIntervalMs - now()
        if (waitMs > 0) await sleep(waitMs)
        last = now()
      })
      chain = turn.catch(() => {})
      return turn
    },
    mark() {
      last = now()
    },
  }
}

function readErrorMessage(body) {
  if (!body || typeof body !== 'object') return ''
  const raw = typeof body.error === 'string' ? body.error : (typeof body.message === 'string' ? body.message : '')
  return raw.toLowerCase()
}

function readRetryAfter(response, body) {
  const fromBody = Number(body?.retry_after)
  const fromHeader = Number(response.headers?.get?.('retry-after'))
  const seconds = [fromBody, fromHeader].find((value) => Number.isFinite(value) && value > 0)
  if (seconds === undefined) return DEFAULT_RETRY_AFTER_SECONDS
  return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS)
}

const AUTH_MESSAGE = /workspace|credential|token|api[ _-]?key|unauthori|authentic|forbidden/
const SIZE_MESSAGE = /too large|file size|size limit|payload|32\s*mb/
const FULL_MESSAGE = /number of files|files? limit|limit of files|storage|quota|30 files|full/

function mapHttpError(response, body, { context, fileBytes }) {
  const status = response.status
  const message = readErrorMessage(body)
  if (status === 401 || status === 403) return new TessError('tess-auth', { httpStatus: status })
  if (status === 429) {
    return new TessError('tess-rate-limit', { httpStatus: status, retryAfterSeconds: readRetryAfter(response, body) })
  }
  if (context === 'upload' && (status === 413 || status === 422)) {
    if (status === 422 && AUTH_MESSAGE.test(message)) return new TessError('tess-auth', { httpStatus: status })
    if (status === 413) {
      const tooBig = fileBytes > TESS_MAX_FILE_BYTES || (SIZE_MESSAGE.test(message) && !FULL_MESSAGE.test(message))
      return new TessError(tooBig ? 'tess-too-large' : 'tess-storage-full', { httpStatus: status })
    }
    return new TessError('tess-storage-full', { httpStatus: status })
  }
  if (status === 422 && AUTH_MESSAGE.test(message)) return new TessError('tess-auth', { httpStatus: status })
  if (status >= 500) return new TessError('tess-unavailable', { httpStatus: status })
  return new TessError('tess-error', { httpStatus: status })
}

async function readLimitedText(response, limit) {
  const declared = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel?.().catch(() => {})
    throw new TessError('tess-bad-response', { httpStatus: response.status })
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text()
    if (text.length > limit) throw new TessError('tess-bad-response', { httpStatus: response.status })
    return text
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      throw new TessError('tess-bad-response', { httpStatus: response.status })
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function pickResponse(body) {
  if (body && Array.isArray(body.responses)) return body.responses[0] ?? null
  return body && typeof body === 'object' ? body : null
}

// Classificacao do estado de uma resposta do agente [INF: so' `succeeded` esta nos exemplos da documentacao].
export function classifyTessAgentStatus(status, outputText) {
  const normalized = String(status ?? '').toLowerCase()
  if (/fail|error/.test(normalized)) return 'failed'
  if (normalized === 'succeeded') return 'done'
  return typeof outputText === 'string' && outputText.trim() !== '' ? 'done' : 'pending'
}

// Estado do ARQUIVO na Tess (`status` do upload e de `GET /files/{id}`). OBSERVADO: `waiting` (upload sem process) e
// `completed` (upload com process=true). Falha = status contendo "fail" ou "error" [INF]; o resto e' "em andamento".
export function classifyTessFileStatus(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (/fail|error/.test(normalized)) return 'failed'
  if (normalized === 'completed') return 'completed'
  return 'pending'
}

export function isTessFileCompleted(status) {
  return classifyTessFileStatus(status) === 'completed'
}

function isTransientTessError(error) {
  return error instanceof TessError && (error.code === 'tess-unavailable' || error.code === 'tess-timeout')
}

export function createTessClient({
  apiKey,
  agentId,
  workspaceId,
  model = COA_TESS_MODEL,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  now = Date.now,
  minIntervalMs = TESS_MIN_INTERVAL_MS,
  pacer,
  timers = { setTimeout, clearTimeout },
} = {}) {
  const agent = assertId(agentId)
  const workspace = String(workspaceId ?? '')
  const key = String(apiKey ?? '')
  if (!key || !/^[0-9]{1,12}$/.test(workspace)) throw new TessError('tess-auth')
  const requestedModel = typeof model === 'string' && model.trim() !== '' ? model.trim() : COA_TESS_MODEL
  const gate = pacer ?? createPacer({ now, sleep, minIntervalMs })

  async function request({ method, path, body, json, deadline, timeoutMs, context, fileBytes = 0 }) {
    await gate.wait()
    const remaining = deadline - now()
    if (remaining <= 0) throw new TessError('tess-timeout')

    const controller = new AbortController()
    const timer = timers.setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining))
    try {
      const headers = { Authorization: `Bearer ${key}`, 'x-workspace-id': workspace, Accept: 'application/json' }
      let payload
      if (json !== undefined) {
        headers['Content-Type'] = 'application/json'
        payload = JSON.stringify(json)
      } else if (body !== undefined) {
        payload = body
      }

      let response
      let text
      try {
        response = await fetchImpl(`${TESS_API_BASE}${path}`, {
          method,
          headers,
          body: payload,
          redirect: 'error',
          signal: controller.signal,
        })
        text = await readLimitedText(response, TESS_MAX_RESPONSE_BYTES)
      } catch (error) {
        if (error instanceof TessError) throw error
        if (controller.signal.aborted) throw new TessError('tess-timeout')
        throw new TessError('tess-unavailable')
      }

      const parsed = parseJson(text)
      if (response.status < 200 || response.status >= 300) {
        throw mapHttpError(response, parsed, { context, fileBytes })
      }
      return { status: response.status, body: parsed }
    } finally {
      timers.clearTimeout(timer)
      gate.mark()
    }
  }

  const methods = {
    async uploadFile({ bytes, deadline }) {
      const size = Number(bytes?.length)
      if (!Number.isFinite(size) || size <= 0) throw new TessError('tess-bad-response')
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'coa.pdf')
      // A execucao do agente exige arquivo PROCESSADO (OBSERVADO 2026-11-26): `process=true` (~1 credito).
      form.append('process', 'true')
      const { body } = await request({
        method: 'POST',
        path: '/files',
        body: form,
        deadline,
        timeoutMs: UPLOAD_TIMEOUT_MS,
        context: 'upload',
        fileBytes: size,
      })
      const fileId = toPositiveInteger(body?.id)
      if (fileId === null) throw new TessError('tess-bad-response')
      return {
        fileId,
        credits: typeof body.credits === 'number' ? body.credits : 0,
        status: typeof body.status === 'string' ? body.status : '',
      }
    },

    // Chamado quando o upload NAO devolveu `completed`: consulta `GET /files/{id}` (pacer + espera crescente) ate
    // `completed`, dentro do menor entre o prazo total e TESS_FILE_PROCESS_MAX_WAIT_MS. Falha definitiva do arquivo
    // -> tess-error; erro transitorio da consulta so' gasta a espera. `credits` e' o valor MAIS ALTO visto (o
    // `credits` do arquivo e' o custo do proprio arquivo, nao um incremento).
    async waitFileProcessed({ fileId, status, deadline }) {
      const id = assertId(fileId)
      let state = classifyTessFileStatus(status)
      const limit = Math.min(deadline, now() + TESS_FILE_PROCESS_MAX_WAIT_MS)
      let credits = 0
      let pollIndex = 0
      while (state === 'pending') {
        const waits = TESS_FILE_POLL_WAITS_SECONDS
        const waitMs = waits[Math.min(pollIndex, waits.length - 1)] * 1000
        if (now() + waitMs >= limit) throw new TessError('tess-timeout')
        await sleep(waitMs)
        pollIndex += 1
        try {
          const { body } = await request({
            method: 'GET',
            path: `/files/${id}`,
            deadline,
            timeoutMs: FILE_POLL_TIMEOUT_MS,
            context: 'process',
          })
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TessError('tess-bad-response')
          if (typeof body.credits === 'number' && body.credits > credits) credits = body.credits
          state = classifyTessFileStatus(body.status)
        } catch (error) {
          if (!isTransientTessError(error)) throw error
        }
      }
      if (state === 'failed') throw new TessError('tess-error')
      return { credits }
    },

    async executeAgent({ fileId, deadline }) {
      const id = assertId(fileId)
      const { body } = await request({
        method: 'POST',
        path: `/agents/${agent}/execute`,
        json: {
          messages: [{ role: 'user', content: TESS_USER_MESSAGE }],
          file_ids: [Number(id)],
          waitExecution: true,
          model: requestedModel,
        },
        deadline,
        timeoutMs: EXECUTE_TIMEOUT_MS,
        context: 'execute',
      })
      const response = pickResponse(body)
      if (!response) throw new TessError('tess-bad-response')
      const outputText = typeof response.output === 'string' ? response.output : ''
      const responseId = toPositiveInteger(response.id)
      const status = typeof response.status === 'string' ? response.status : ''
      if (responseId === null && classifyTessAgentStatus(status, outputText) === 'pending') {
        throw new TessError('tess-bad-response')
      }
      // Diagnostico: a Tess ecoa o modelo aceito em `answers.model`. Diferente do pedido = so' a flag (o valor nunca sai).
      const answeredModel = response.answers && typeof response.answers === 'object' ? response.answers.model : undefined
      return {
        responseId,
        status,
        outputText,
        credits: typeof response.credits === 'number' ? response.credits : 0,
        modelMismatch: typeof answeredModel === 'string' && answeredModel !== requestedModel,
      }
    },

    async getAgentResponse({ responseId, deadline }) {
      const id = assertId(responseId)
      const { body } = await request({
        method: 'GET',
        path: `/agent-responses/${id}`,
        deadline,
        timeoutMs: POLL_TIMEOUT_MS,
        context: 'poll',
      })
      const response = pickResponse(body)
      if (!response) throw new TessError('tess-bad-response')
      return {
        status: typeof response.status === 'string' ? response.status : '',
        outputText: typeof response.output === 'string' ? response.output : '',
        credits: typeof response.credits === 'number' ? response.credits : 0,
      }
    },

    async deleteFile(fileId) {
      const id = assertId(fileId)
      try {
        const { body } = await request({
          method: 'DELETE',
          path: `/files/${id}`,
          deadline: now() + DELETE_TIMEOUT_MS,
          timeoutMs: DELETE_TIMEOUT_MS,
          context: 'delete',
        })
        return { deleted: body?.deleted !== false }
      } catch (error) {
        // 404 = o arquivo ja nao existe na Tess [INF]: o objetivo da limpeza esta cumprido.
        if (error instanceof TessError && error.httpStatus === 404) return { deleted: true }
        throw error
      }
    },
  }

  // Todo TessError sai com o ESTAGIO em que ocorreu (diagnostico sem conteudo).
  const stageByMethod = {
    uploadFile: 'upload',
    waitFileProcessed: 'process',
    executeAgent: 'execute',
    getAgentResponse: 'poll',
    deleteFile: 'delete',
  }
  const client = {}
  for (const [name, run] of Object.entries(methods)) {
    client[name] = async (...args) => {
      try {
        return await run(...args)
      } catch (error) {
        if (error instanceof TessError && !error.stage) error.stage = stageByMethod[name]
        throw error
      }
    }
  }
  return client
}
