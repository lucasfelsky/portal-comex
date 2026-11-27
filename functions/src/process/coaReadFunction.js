// S11-B: callable `readProcessCoa` - le UM COA (PDF) do Storage, manda a Tess (upload, execucao do agente,
// consulta, EXCLUSAO do arquivo), valida o JSON e grava o resultado em `processes/{processId}/coaReads/{documentId}`.
//
// Seguranca (nao negociavel):
// - so' admin ativo @sqquimica.com por claims, sem fallback (`canReadProcessCoa`);
// - so' PDF (mimeType do metadado, contentType do objeto e assinatura `%PDF-`), com nome generico `coa.pdf` e sem
//   informacao do processo; upload com `process=true` (a Tess exige arquivo processado para a execucao);
// - o arquivo e' apagado na Tess em `finally`, em TODO caminho (sucesso, erro, timeout); o id fica registrado
//   (`tessFilePending`) ate o DELETE dar certo, e a proxima leitura do processo limpa o que sobrou;
// - o texto do PDF e' dado: o JSON da Tess passa por validacao estrita (`coaRead.js`);
// - logs SEM conteudo: so' ids, uid, status, contagem, creditos, duracao, codigo de erro e, em falha, o estagio
//   ('upload'|'process'|'execute'|'poll'|'delete') e o status HTTP (numero). O estagio NAO vai para o doc `coaReads`
//   (o doc so' guarda `error.code`); fica so' no log, que e' o canal de diagnostico.
// - modelo: o cliente envia `COA_TESS_MODEL` (coaRead.js; ~8 a 19 creditos por leitura, medido em 3 COAs
//   em 2026-11-26; o padrao do agente gastava 56 a 112). Resposta com outro modelo = `warn` so' com a flag
//   `modelMismatch` e `stage: 'execute'`; a leitura continua. 422 do execute segue `tess-error` (sem retry sem modelo).
//
// Uma leitura por vez no Portal todo (`maxInstances: 1`, `concurrency: 1`): a Tess limita 1 req/s por
// organizacao e 30 arquivos por workspace. Pedido no mesmo documento durante a leitura devolve `reading` (lease).

import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger as firebaseLogger } from 'firebase-functions/logger'
import { resolveProcessDocumentStoragePath } from './documentDownload.js'
import {
  COA_DAY_MS,
  COA_LIMITS,
  buildCoaFailureDoc,
  buildCoaLogFields,
  buildCoaReadDoc,
  buildCoaReadingDoc,
  canReadProcessCoa,
  decideCoaReadAction,
  getEffectiveAttempts,
  isPdfSignature,
  normalizeCoaExtraction,
  parseAgentOutputText,
  parseCoaRequest,
  readTessConfig,
  sumTessCredits,
  toIso,
  toMillis,
  toPublicCoaRead,
} from './coaRead.js'
import {
  TESS_CONTRACT_VERSION,
  TESS_STAGES,
  TessError,
  classifyTessAgentStatus,
  createPacer,
  createTessClient,
  isTessFileCompleted,
} from './tessClient.js'

const TESS_API_KEY = defineSecret('TESS_API_KEY')
const TESS_AGENT_ID = defineSecret('TESS_AGENT_ID')
const TESS_WORKSPACE_ID = defineSecret('TESS_WORKSPACE_ID')

// Orcamento total com a Tess (a function tem 300 s; sobra folga para o DELETE e as gravacoes).
export const COA_TESS_BUDGET_MS = 240000
const POLL_WAITS_SECONDS = [5, 10, 15, 20]
const RATE_LIMIT_MARGIN_MS = 5000

function deny(code, detail) {
  return new HttpsError(code, detail, { code: detail })
}

function sleepReal(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 429: espera `retry_after` UMA vez, so' se couber no orcamento.
async function withRateLimitRetry(run, { now, sleep, deadline }) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof TessError && error.code === 'tess-rate-limit') {
      const waitMs = (error.retryAfterSeconds ?? 60) * 1000
      if (now() + waitMs + RATE_LIMIT_MARGIN_MS <= deadline) {
        await sleep(waitMs)
        return run()
      }
    }
    throw error
  }
}

// DELETE com 1 nova tentativa. Nunca lanca: devolve se o arquivo saiu da Tess e, se nao saiu, o ultimo erro.
async function deleteTessFile(client, fileId) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.deleteFile(fileId)
      return { ok: true, error: null }
    } catch (error) {
      lastError = error
      // segue para a nova tentativa; o pacer garante o intervalo minimo
    }
  }
  return { ok: false, error: lastError }
}

// Diagnostico sem conteudo: so' estagio (lista fechada) e status HTTP numerico; nunca mensagem/corpo.
function describeFailure(error, fallbackStage) {
  const tess = error instanceof TessError
  return {
    code: tess ? error.code : 'internal',
    stage: (tess && TESS_STAGES.includes(error.stage) ? error.stage : null) || fallbackStage || null,
    httpStatus: tess && Number.isInteger(error.httpStatus) ? error.httpStatus : null,
  }
}

// `credits` de um MESMO objeto da Tess (o arquivo; a resposta do agente) e' o custo acumulado dele, nao um
// incremento: guarda o MAIOR valor visto, para a execucao + consulta nao somarem duas vezes.
function bumpCredits(credits, key, value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > credits[key]) credits[key] = value
}

// D-10: apaga na Tess os arquivos pendentes do processo (ate 5), o deste documento primeiro. O pendente de outro
// documento so' entra com a leitura dele ja encerrada (lease vencido).
async function cleanupPendingTessFiles({ db, client, processId, documentId, nowMs }) {
  const snapshot = await db
    .collection(`processes/${processId}/coaReads`)
    .where('tessFilePending', '==', true)
    .limit(COA_LIMITS.preventiveCleanupMax + 1)
    .get()

  const candidates = []
  for (const entry of snapshot.docs ?? []) {
    const data = entry.data() ?? {}
    const own = entry.id === documentId
    if (!own && data.status === 'reading' && toMillis(data.leaseUntil) > nowMs) continue
    candidates.push({ entry, data, own })
  }
  candidates.sort((left, right) => Number(right.own) - Number(left.own))

  let ownCleaned = false
  for (const candidate of candidates.slice(0, COA_LIMITS.preventiveCleanupMax)) {
    const fileId = candidate.data.tessFileId
    const valid = Number.isSafeInteger(fileId) && fileId > 0
    const gone = valid ? (await deleteTessFile(client, fileId)).ok : true
    if (!gone) continue
    if (candidate.own) ownCleaned = true
    try {
      await candidate.entry.ref.update({ tessFilePending: false })
    } catch {
      // a proxima limpeza repete (o DELETE de arquivo ja apagado e' tratado como sucesso)
    }
  }
  return { ownCleaned }
}

async function uploadWithPolicy({ client, bytes, deadline, clock, cleanup }) {
  let cleaned = false
  let retriedUnavailable = false
  for (;;) {
    try {
      return await withRateLimitRetry(() => client.uploadFile({ bytes, deadline }), clock)
    } catch (error) {
      if (!(error instanceof TessError)) throw error
      if (error.code === 'tess-unavailable' && !retriedUnavailable) {
        retriedUnavailable = true
        continue
      }
      if (error.code === 'tess-storage-full' && !cleaned) {
        cleaned = true
        await cleanup()
        continue
      }
      throw error
    }
  }
}

async function executeAndCollect({ client, fileId, deadline, clock, credits, onResponseId, onStage, onModelMismatch }) {
  const executed = await withRateLimitRetry(() => client.executeAgent({ fileId, deadline }), clock)
  bumpCredits(credits, 'response', executed.credits)
  // Aviso de diagnostico: a Tess respondeu com outro modelo. O resultado segue sendo usado.
  if (executed.modelMismatch === true) onModelMismatch()
  let responseId = executed.responseId
  if (responseId !== null) await onResponseId(responseId)

  let outputText = executed.outputText
  let state = classifyTessAgentStatus(executed.status, outputText)
  let pollIndex = 0
  while (state === 'pending') {
    if (responseId === null) throw new TessError('tess-bad-response', { stage: 'execute' })
    const waitMs = POLL_WAITS_SECONDS[Math.min(pollIndex, POLL_WAITS_SECONDS.length - 1)] * 1000
    if (clock.now() + waitMs >= deadline) throw new TessError('tess-timeout', { stage: 'poll' })
    await clock.sleep(waitMs)
    pollIndex += 1
    onStage('poll')
    try {
      const polled = await withRateLimitRetry(() => client.getAgentResponse({ responseId, deadline }), clock)
      bumpCredits(credits, 'response', polled.credits)
      outputText = polled.outputText
      state = classifyTessAgentStatus(polled.status, polled.outputText)
    } catch (error) {
      // Consulta e' idempotente: falha transitoria so' gasta o orcamento.
      const transient = error instanceof TessError && (error.code === 'tess-unavailable' || error.code === 'tess-timeout')
      if (!transient) throw error
    }
  }
  if (state === 'failed') throw new TessError('tess-error', { stage: responseId === null ? 'execute' : 'poll' })
  return outputText
}

export async function runCoaRead(request, deps) {
  const { logger } = deps
  try {
    return await readCoa(request, deps)
  } catch (error) {
    if (error instanceof HttpsError) throw error
    logger.error('Falha inesperada na leitura de COA.', {
      processId: request?.data?.processId,
      documentId: request?.data?.documentId,
      errorCode: error?.code ? String(error.code) : 'internal',
    })
    throw deny('internal', 'internal')
  }
}

async function readCoa(request, deps) {
  const { db, bucket, createClient, now, sleep, logger, getSecrets } = deps
  const startedMs = now()

  if (!request?.auth) throw deny('unauthenticated', 'unauthenticated')
  if (!canReadProcessCoa(request.auth.token)) throw deny('permission-denied', 'permission-denied')
  const parsed = parseCoaRequest(request.data)
  if (parsed.error) throw deny('invalid-argument', 'invalid-argument')
  const { processId, documentId, force } = parsed
  const uid = String(request.auth.uid ?? '')

  const documentRef = db.doc(`processes/${processId}/documents/${documentId}`)
  const documentSnapshot = await documentRef.get()
  const documentData = documentSnapshot.exists ? (documentSnapshot.data() ?? {}) : null
  if (!documentData || documentData.type !== 'coaOriginal') throw deny('not-found', 'not-found')
  const storagePath = resolveProcessDocumentStoragePath(processId, documentData)
  if (!storagePath) throw deny('failed-precondition', 'invalid-storage-path')
  if (documentData.mimeType !== 'application/pdf') throw deny('failed-precondition', 'not-pdf')

  const reportSnapshot = await db.doc(`processes/${processId}/cargoReport/current`).get()
  if (reportSnapshot.exists && reportSnapshot.data()?.status === 'concluido') {
    throw deny('failed-precondition', 'report-closed')
  }

  const config = readTessConfig(getSecrets())
  if (config.error) throw deny('failed-precondition', 'not-configured')

  const file = bucket.file(storagePath)
  let objectMetadata
  try {
    const result = await file.getMetadata()
    objectMetadata = (Array.isArray(result) ? result[0] : result) ?? {}
  } catch (error) {
    if (error?.code === 404) throw deny('not-found', 'not-found')
    throw error
  }
  const fileSize = Number(objectMetadata.size)
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw deny('failed-precondition', 'invalid-file')
  if (fileSize > COA_LIMITS.maxBytes) throw deny('failed-precondition', 'too-large')
  if (String(objectMetadata.contentType ?? '').split(';')[0].trim().toLowerCase() !== 'application/pdf') {
    throw deny('failed-precondition', 'not-pdf')
  }
  const generation = String(objectMetadata.generation ?? '')

  // Limite diario (D-7): contagem fora da transacao (uma instancia, um pedido por vez). O proprio documento nao
  // conta contra si mesmo quando ja entrou na janela de 24 h.
  const coaReadsPath = `processes/${processId}/coaReads`
  const coaRef = db.doc(`${coaReadsPath}/${documentId}`)
  const sinceIso = toIso(startedMs - COA_DAY_MS)
  const countSnapshot = await db.collection(coaReadsPath).where('lastTessCallAt', '>=', sinceIso).count().get()
  const callsInWindow = Number(countSnapshot.data()?.count) || 0

  const decision = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(coaRef)
    const existing = snapshot.exists ? (snapshot.data() ?? {}) : null
    const ownCounted = existing && String(existing.lastTessCallAt ?? '') >= sinceIso ? 1 : 0
    const choice = decideCoaReadAction({
      existing,
      generation,
      now: startedMs,
      force,
      callsLast24h: Math.max(0, callsInWindow - ownCounted),
    })
    if (choice.error || choice.action !== 'read') return { ...choice, existing }
    const reading = buildCoaReadingDoc({
      generation,
      fileSize,
      attempts: getEffectiveAttempts(existing) + 1,
      nowMs: startedMs,
      requestedById: uid,
      requestedByName: request.auth.token?.name,
      tessContractVersion: TESS_CONTRACT_VERSION,
      previous: existing,
    })
    transaction.set(coaRef, reading)
    return { action: 'read', reading }
  })

  if (decision.error) throw deny('resource-exhausted', decision.error)

  if (decision.action === 'cached') {
    const cached = decision.existing
    logger.info('Leitura de COA.', buildCoaLogFields({
      processId,
      documentId,
      uid,
      status: cached.status,
      cached: true,
      certificateCount: Array.isArray(cached.certificates) ? cached.certificates.length : 0,
    }))
    return { status: cached.status, cached: true, read: toPublicCoaRead(cached) }
  }

  if (decision.action === 'reading') {
    logger.info('Leitura de COA.', buildCoaLogFields({ processId, documentId, uid, status: 'reading', cached: false }))
    return { status: 'reading', cached: false, read: null }
  }

  const reading = decision.reading
  const clock = { now, sleep, deadline: startedMs + COA_TESS_BUDGET_MS }
  const credits = { file: 0, response: 0 }
  let phase = null
  let failure = null
  let client = null
  let fileId = null
  let responseId = null
  let ownPending = reading.tessFilePending === true
  let deleteOk = true
  let failureCode = null
  let outputText = ''

  try {
    client = createClient(config)
    const cleanup = async () => {
      const { ownCleaned } = await cleanupPendingTessFiles({ db, client, processId, documentId, nowMs: now() })
      if (ownCleaned) ownPending = false
    }
    await cleanup()

    const downloaded = await file.download()
    const bytes = Array.isArray(downloaded) ? downloaded[0] : downloaded
    if (!bytes || bytes.length > COA_LIMITS.maxBytes) throw new TessError('tess-too-large')
    if (!isPdfSignature(bytes)) {
      failureCode = 'not-pdf'
    } else {
      phase = 'upload'
      const uploaded = await uploadWithPolicy({ client, bytes, deadline: clock.deadline, clock, cleanup })
      fileId = uploaded.fileId
      bumpCredits(credits, 'file', uploaded.credits)
      await coaRef.update({ tessFileId: fileId, tessFilePending: true })

      // A Tess so' deixa o agente usar arquivo PROCESSADO. O upload com process=true ja devolve `completed`;
      // qualquer outro status espera (consulta do arquivo) ANTES do execute.
      if (!isTessFileCompleted(uploaded.status)) {
        phase = 'process'
        const processed = await withRateLimitRetry(
          () => client.waitFileProcessed({ fileId, status: uploaded.status, deadline: clock.deadline }),
          clock
        )
        bumpCredits(credits, 'file', processed?.credits)
      }

      phase = 'execute'
      outputText = await executeAndCollect({
        client,
        fileId,
        deadline: clock.deadline,
        clock,
        credits,
        onStage: (stage) => {
          phase = stage
        },
        onModelMismatch: () => {
          logger.warn('Modelo da Tess diferente do pedido.', buildCoaLogFields({
            processId,
            documentId,
            uid,
            status: 'model-mismatch',
            stage: 'execute',
            modelMismatch: true,
          }))
        },
        onResponseId: async (id) => {
          responseId = id
          try {
            await coaRef.update({ tessResponseId: id })
          } catch {
            // informativo: a leitura segue
          }
        },
      })
    }
  } catch (error) {
    failure = describeFailure(error, phase)
    failureCode = failure.code
  } finally {
    // O arquivo sai da Tess em TODO caminho; falha deixa `tessFilePending: true` (a proxima leitura limpa).
    if (fileId !== null && client) {
      const deleted = await deleteTessFile(client, fileId)
      deleteOk = deleted.ok
      if (!deleted.ok) {
        const reason = describeFailure(deleted.error, 'delete')
        logger.warn('Falha ao apagar arquivo na Tess.', buildCoaLogFields({
          processId,
          documentId,
          uid,
          status: 'delete-failed',
          errorCode: reason.code,
          stage: 'delete',
          httpStatus: reason.httpStatus,
        }))
      }
    }
  }

  let extraction = null
  if (!failureCode) {
    const output = parseAgentOutputText(outputText)
    if (!output.ok) {
      failureCode = 'invalid-response'
    } else {
      extraction = normalizeCoaExtraction(output.value)
    }
  }

  const finishedMs = now()
  const finish = {
    finishedAtMs: finishedMs,
    durationMs: finishedMs - startedMs,
    tessCredits: sumTessCredits([credits.file, credits.response]),
    tessFileId: fileId !== null ? fileId : (ownPending ? reading.tessFileId : null),
    tessFilePending: fileId !== null ? !deleteOk : ownPending,
    tessResponseId: responseId,
  }
  const finalDoc = failureCode
    ? buildCoaFailureDoc(reading, failureCode, finish)
    : buildCoaReadDoc(reading, extraction, finish)

  // Documento apagado durante a leitura: nao grava (o trigger de exclusao ja removeu `coaReads/{id}`).
  const stillThere = await documentRef.get()
  if (!stillThere.exists) {
    logger.info('Leitura de COA.', buildCoaLogFields({
      processId,
      documentId,
      uid,
      status: 'discarded',
      credits: finish.tessCredits,
      durationMs: finish.durationMs,
      errorCode: 'not-found',
    }))
    throw deny('not-found', 'not-found')
  }
  await coaRef.set(finalDoc)

  logger.info('Leitura de COA.', buildCoaLogFields({
    processId,
    documentId,
    uid,
    status: finalDoc.status,
    cached: false,
    certificateCount: finalDoc.certificates.length,
    credits: finalDoc.tessCredits,
    durationMs: finalDoc.durationMs,
    errorCode: finalDoc.error?.code,
    stage: failure?.stage,
    httpStatus: failure?.httpStatus,
  }))
  return { status: finalDoc.status, cached: false, read: toPublicCoaRead(finalDoc) }
}

let sharedPacer = null

function defaultDeps() {
  if (!sharedPacer) sharedPacer = createPacer({ now: Date.now, sleep: sleepReal })
  return {
    db: getFirestore(),
    bucket: getStorage().bucket(),
    createClient: (config) => createTessClient({ ...config, now: Date.now, sleep: sleepReal, pacer: sharedPacer }),
    now: Date.now,
    sleep: sleepReal,
    logger: firebaseLogger,
    getSecrets: () => ({
      apiKey: TESS_API_KEY.value(),
      agentId: TESS_AGENT_ID.value(),
      workspaceId: TESS_WORKSPACE_ID.value(),
    }),
  }
}

export const readProcessCoa = onCall(
  {
    region: 'us-central1',
    secrets: [TESS_API_KEY, TESS_AGENT_ID, TESS_WORKSPACE_ID],
    timeoutSeconds: 300,
    memory: '512MiB',
    maxInstances: 1,
    concurrency: 1,
  },
  (request) => runCoaRead(request, defaultDeps())
)
