// S11-I: store do envio de COA em segundo plano (coaUploadStore), isolado de qualquer componente. Upload mockado (nunca
// toca Storage nem Firestore) e fila da leitura mockada (só se confere o que entra nela). Dados inventados (p1/p2,
// PO-1, SYN-n.pdf, admin-1). `resetCoaUploads()` isola cada teste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUploadProcessDocument = vi.fn()
const mockEnqueue = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

vi.mock('../../src/services/coaReadsRepository', () => ({
  describeCoaReadError: vi.fn(),
  readProcessCoa: vi.fn(),
}))

vi.mock('../../src/features/processes/coaAutoReadQueue', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, enqueueCoaAutoRead: (...args) => mockEnqueue(...args) }
})

import { buildCoaAutoReadKey } from '../../src/features/processes/coaAutoReadQueue'
import { resetCoaAutoReadActor, setCoaAutoReadActor } from '../../src/features/processes/coaAutoReadSession'
import {
  COA_UPLOAD_INTERRUPTED_DETAIL,
  getCoaUploadState,
  isCoaUploadBusy,
  resetCoaUploads,
  startCoaUpload,
  subscribeCoaUpload,
  watchCoaUpload,
} from '../../src/features/processes/coaUploadStore'

const ACTOR = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const KEY = buildCoaAutoReadKey('p1', '')

const files = (count) =>
  Array.from({ length: count }, (_, index) => new File(['x'], `SYN-${index + 1}.pdf`, { type: 'application/pdf' }))
const entryOf = (key = KEY) => getCoaUploadState().entries[key]
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

let uploads
function pendingUploads() {
  uploads = []
  mockUploadProcessDocument.mockImplementation(
    (processId, args) => new Promise((resolve, reject) => uploads.push({ processId, args, resolve, reject }))
  )
}
async function finish(index, id = `d${index + 1}`) {
  uploads[index].resolve({ id, mimeType: 'application/pdf', name: uploads[index].args.file.name })
  await tick()
}
async function fail(index, error = new Error('falha de teste')) {
  uploads[index].reject(error)
  await tick()
}

function start(overrides = {}) {
  return startCoaUpload({ processId: 'p1', scope: '', category: 'FCL', actor: ACTOR, files: files(3), ...overrides })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCoaUploads()
  resetCoaAutoReadActor()
  pendingUploads()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  resetCoaUploads()
  vi.restoreAllMocks()
})

describe('envio sem nenhuma tela assistindo', () => {
  it('sobe os 3 arquivos em sequência com processo, categoria, PO e usuário capturados no início', async () => {
    expect(start({ processId: 'p1', scope: 'PO-1', category: 'CONSOLIDADO' })).toBe(true)
    const key = buildCoaAutoReadKey('p1', 'PO-1')
    expect(entryOf(key)).toMatchObject({ status: 'sending', current: 1, total: 3 })
    expect(uploads).toHaveLength(1)
    await finish(0)
    expect(uploads).toHaveLength(2)
    expect(entryOf(key)).toMatchObject({ status: 'sending', current: 2, total: 3 })
    await finish(1)
    await finish(2)

    expect(uploads.map((item) => item.args.file.name)).toEqual(['SYN-1.pdf', 'SYN-2.pdf', 'SYN-3.pdf'])
    for (const item of uploads) {
      expect(item.processId).toBe('p1')
      expect(item.args).toMatchObject({ type: 'coaOriginal', category: 'CONSOLIDADO', po: 'PO-1', actor: ACTOR })
    }
    expect(entryOf(key)).toMatchObject({ status: 'done', sent: 3, total: 3, errors: [], doneSeq: 1 })
    expect(isCoaUploadBusy(key)).toBe(false)
  })

  it('fora do consolidado a PO não vai no upload (po indefinido)', async () => {
    start({ files: files(1) })
    expect(uploads[0].args.po).toBeUndefined()
    await finish(0)
  })

  it('segundo envio na mesma chave durante o envio devolve false e não faz upload extra; outra PO é aceita', async () => {
    expect(start({ scope: 'PO-1', category: 'CONSOLIDADO' })).toBe(true)
    expect(start({ scope: 'PO-1', category: 'CONSOLIDADO' })).toBe(false)
    expect(uploads).toHaveLength(1)
    expect(start({ scope: 'PO-2', category: 'CONSOLIDADO' })).toBe(true)
    expect(uploads).toHaveLength(2)
    expect(uploads.map((item) => item.args.po)).toEqual(['PO-1', 'PO-2'])
  })

  it('recusa sem arquivos, sem processo ou sem usuário', () => {
    expect(start({ files: [] })).toBe(false)
    expect(start({ processId: '' })).toBe(false)
    expect(start({ actor: { name: 'Sem uid', role: 'admin' } })).toBe(false)
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('CONSOLIDADO sem PO é recusado sem upload', () => {
    expect(start({ category: 'CONSOLIDADO', scope: '' })).toBe(false)
    expect(start({ category: 'CONSOLIDADO', scope: '   ' })).toBe(false)
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(getCoaUploadState().entries).toEqual({})
  })

  it('notifica quem assina o store a cada mudança', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCoaUpload(listener)
    start({ files: files(1) })
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    const calls = listener.mock.calls.length
    await finish(0)
    expect(listener.mock.calls.length).toBe(calls)
  })
})

describe('troca de sessão', () => {
  it('antes de o 1º upload terminar: ele termina, os restantes não sobem, a entrada some e não há toast', async () => {
    setCoaAutoReadActor({ uid: 'admin-1', role: 'admin' })
    const notify = { error: vi.fn() }
    start({ notify })
    setCoaAutoReadActor(null)
    expect(entryOf()).toBeUndefined()
    await finish(0)
    expect(uploads).toHaveLength(1)
    expect(getCoaUploadState().entries).toEqual({})
    expect(notify.error).not.toHaveBeenCalled()
  })

  it.each([
    ['troca de usuário', { uid: 'admin-2', role: 'admin' }],
    ['perda do perfil de admin', { uid: 'admin-1', role: 'logistica' }],
  ])('%s no meio do envio: o arquivo em andamento termina e o resto não sobe', async (_label, next) => {
    setCoaAutoReadActor({ uid: 'admin-1', role: 'admin' })
    const notify = { error: vi.fn() }
    start({ notify })
    await finish(0)
    expect(uploads).toHaveLength(2)
    setCoaAutoReadActor(next)
    await finish(1)
    expect(uploads).toHaveLength(2)
    expect(getCoaUploadState().entries).toEqual({})
    expect(notify.error).not.toHaveBeenCalled()
  })

  it('depois da troca, a mesma chave aceita um envio novo e o antigo não escreve nele', async () => {
    setCoaAutoReadActor({ uid: 'admin-1', role: 'admin' })
    start({ files: files(2) })
    setCoaAutoReadActor({ uid: 'admin-2', role: 'admin' })
    expect(start({ actor: { uid: 'admin-2', name: 'Admin 2', role: 'admin' }, files: files(1) })).toBe(true)
    await finish(0)
    expect(uploads).toHaveLength(2)
    expect(entryOf()).toMatchObject({ status: 'sending', total: 1, sent: 0 })
    await finish(1)
    expect(entryOf()).toMatchObject({ status: 'done', total: 1, sent: 1 })
    expect(uploads[1].args.actor.uid).toBe('admin-2')
  })
})

describe('falhas', () => {
  it('falha parcial sem tela assistindo: 1 toast de erro com a contagem; o resto do lote segue', async () => {
    const notify = { error: vi.fn() }
    start({ notify })
    await fail(0)
    await finish(1)
    await finish(2)
    expect(uploads).toHaveLength(3)
    expect(entryOf()).toMatchObject({ status: 'done', sent: 2, total: 3, doneSeq: 1 })
    expect(entryOf().errors).toHaveLength(1)
    expect(entryOf().errors[0].name).toBe('SYN-1.pdf')
    expect(notify.error).toHaveBeenCalledTimes(1)
    expect(notify.error.mock.calls[0][0]).toBe(
      'Envio de COA: 1 de 3 arquivos não foram enviados. Abra a aba Documentos do processo para ver quais.'
    )
  })

  it('com a tela assistindo, a falha fica no resultado e não há toast', async () => {
    const notify = { error: vi.fn() }
    const unwatch = watchCoaUpload(KEY)
    start({ notify })
    await fail(0)
    await finish(1)
    await finish(2)
    expect(entryOf()).toMatchObject({ status: 'done', seen: true })
    expect(entryOf().errors).toHaveLength(1)
    expect(notify.error).not.toHaveBeenCalled()
    unwatch()
  })

  it('sem nenhuma falha não há toast, e a ausência de notify não quebra', async () => {
    const notify = { error: vi.fn() }
    start({ notify, files: files(1) })
    await finish(0)
    expect(notify.error).not.toHaveBeenCalled()

    start({ processId: 'p2', notify: null, files: files(1) })
    await fail(1)
    expect(buildEntry('p2')).toMatchObject({ status: 'done', sent: 0 })
  })

  it.each(['permission-denied', 'unauthenticated', 'storage/unauthorized', 'storage/unauthenticated'])(
    'erro de permissão (%s) interrompe o laço: os restantes não sobem e entram como não enviados',
    async (code) => {
      const notify = { error: vi.fn() }
      start({ notify })
      await fail(0, Object.assign(new Error('negado'), { code }))
      expect(uploads).toHaveLength(1)
      expect(entryOf()).toMatchObject({ status: 'done', sent: 0, total: 3, doneSeq: 0 })
      expect(entryOf().errors.map((item) => item.name)).toEqual(['SYN-1.pdf', 'SYN-2.pdf', 'SYN-3.pdf'])
      expect(entryOf().errors[1].detail).toBe(COA_UPLOAD_INTERRUPTED_DETAIL)
      expect(entryOf().errors[2].detail).toBe(COA_UPLOAD_INTERRUPTED_DETAIL)
      expect(notify.error.mock.calls[0][0]).toContain('3 de 3 arquivos')
    }
  )

  it('outro código de erro segue por arquivo', async () => {
    start()
    await fail(0, Object.assign(new Error('rede'), { code: 'storage/retry-limit-exceeded' }))
    expect(uploads).toHaveLength(2)
  })
})

function buildEntry(processId) {
  return getCoaUploadState().entries[buildCoaAutoReadKey(processId, '')]
}

describe('quem está assistindo e a vida do resultado', () => {
  it('ao montar com resultado pronto marca "visto"; ao sair o último, o resultado visto é apagado', async () => {
    start({ files: files(1) })
    await finish(0)
    expect(entryOf()).toMatchObject({ status: 'done', seen: false })

    const unwatch = watchCoaUpload(KEY)
    expect(entryOf()).toMatchObject({ status: 'done', seen: true })
    unwatch()
    await Promise.resolve()
    expect(entryOf()).toBeUndefined()
  })

  it('resultado nunca visto sobrevive até alguém montar', async () => {
    start({ files: files(1) })
    await finish(0)
    await tick()
    expect(entryOf()).toMatchObject({ status: 'done', seen: false })
    const unwatch = watchCoaUpload(KEY)
    expect(entryOf().seen).toBe(true)
    unwatch()
  })

  it('só o último a sair apaga; sair e voltar na mesma volta (StrictMode) não apaga', async () => {
    start({ files: files(1) })
    await finish(0)
    const first = watchCoaUpload(KEY)
    const second = watchCoaUpload(KEY)
    first()
    await Promise.resolve()
    expect(entryOf()).toBeDefined()

    second()
    const again = watchCoaUpload(KEY)
    await Promise.resolve()
    expect(entryOf()).toBeDefined()
    again()
    await Promise.resolve()
    expect(entryOf()).toBeUndefined()
  })

  it('o resultado de um envio em andamento não é apagado ao sair e o envio termina "não visto"', async () => {
    const notify = { error: vi.fn() }
    const unwatch = watchCoaUpload(KEY)
    start({ notify, files: files(1) })
    unwatch()
    await Promise.resolve()
    expect(entryOf()).toMatchObject({ status: 'sending' })
    await fail(0)
    expect(entryOf()).toMatchObject({ status: 'done', seen: false })
    expect(notify.error).toHaveBeenCalledTimes(1)
  })
})

describe('doneSeq', () => {
  it('só sobe com pelo menos 1 arquivo enviado, e continua crescendo entre envios na mesma chave', async () => {
    const unwatch = watchCoaUpload(KEY)
    start({ files: files(1) })
    await fail(0)
    expect(entryOf().doneSeq).toBe(0)

    start({ files: files(1) })
    await finish(1)
    expect(entryOf().doneSeq).toBe(1)

    start({ files: files(2) })
    await finish(2)
    await fail(3)
    expect(entryOf()).toMatchObject({ sent: 1, doneSeq: 2 })
    unwatch()
  })
})

describe('bilhete da leitura automática', () => {
  it('com bilhete: cada arquivo que sobe entra na fila com o bilhete, o processo e a PO', async () => {
    const send = { processId: 'p1', ticket: true }
    start({ send, scope: 'PO-1', category: 'CONSOLIDADO' })
    await finish(0, 'd1')
    await finish(1, 'd2')
    await finish(2, 'd3')
    expect(mockEnqueue).toHaveBeenCalledTimes(3)
    expect(mockEnqueue.mock.calls.map((call) => call[1][0].id)).toEqual(['d1', 'd2', 'd3'])
    for (const call of mockEnqueue.mock.calls) {
      expect(call[0]).toBe('p1')
      expect(call[2]).toBe('PO-1')
      expect(call[3]).toBe(send)
    }
  })

  it('upload que falha não entra na fila', async () => {
    const send = { processId: 'p1' }
    start({ send, files: files(2) })
    await fail(0)
    await finish(1, 'd2')
    expect(mockEnqueue).toHaveBeenCalledTimes(1)
    expect(mockEnqueue.mock.calls[0][1][0].id).toBe('d2')
  })

  it('sem bilhete (nulo): nada é enfileirado', async () => {
    start({ send: null, files: files(2) })
    await finish(0)
    await finish(1)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})

describe('resetCoaUploads', () => {
  it('zera o estado e o laço antigo não escreve no estado novo', async () => {
    start()
    resetCoaUploads()
    expect(getCoaUploadState().entries).toEqual({})
    expect(isCoaUploadBusy(KEY)).toBe(false)
    await finish(0)
    expect(uploads).toHaveLength(1)
    expect(getCoaUploadState().entries).toEqual({})
    expect(start({ files: files(1) })).toBe(true)
  })
})
