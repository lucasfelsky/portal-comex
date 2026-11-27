// S11-E/S11-F: fila única da leitura automática do COA (coaAutoReadQueue). A callable `readProcessCoa` é mockada (nunca
// chama a Tess); as mensagens de erro (describeCoaReadError) são as reais. Dados inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadProcessCoa = vi.fn()

vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readProcessCoa: (...args) => mockReadProcessCoa(...args) }
})

import {
  beginCoaAutoReadSend,
  buildCoaAutoReadKey,
  enqueueCoaAutoRead,
  getCoaAutoReadState,
  registerCoaAutoReadMount,
  resetCoaAutoRead,
} from '../../src/features/processes/coaAutoReadQueue'
import { setCoaAutoReadActor } from '../../src/features/processes/coaAutoReadSession'

const doc = (id, overrides = {}) => ({ id, type: 'coaOriginal', name: `${id}.pdf`, mimeType: 'application/pdf', ...overrides })
const done = (id) => ({ status: 'done', cached: false, read: { documentId: id, status: 'done', documentType: 'coa', certificates: [] } })
const failedRead = (id, code) => ({ status: 'failed', cached: false, read: { documentId: id, status: 'failed', error: { code } } })
const rejectWith = (code) => Object.assign(new Error(code), { code })

// Resposta que só resolve quando o teste mandar (prova a ordem: uma chamada por vez).
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const KEY = buildCoaAutoReadKey('p1', '')
const CLOSED_NOTE = 'O relatório já foi fechado; a leitura de COA é só no rascunho.'
const calledIds = () => mockReadProcessCoa.mock.calls.map((call) => call[1])

let unmount

beforeEach(() => {
  resetCoaAutoRead()
  mockReadProcessCoa.mockReset()
  unmount = registerCoaAutoReadMount('p1')
})

afterEach(() => {
  unmount?.()
  resetCoaAutoRead()
})

describe('coaAutoReadQueue - ordem e fila única', () => {
  it('3 arquivos: a 2ª leitura só sai depois da 1ª resolver, e a 3ª depois da 2ª (nunca em paralelo)', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    mockReadProcessCoa
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)

    expect(enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])).toBe(3)
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })

    first.resolve(done('a'))
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 1, total: 3 })

    second.resolve(done('b'))
    await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])

    third.resolve(done('c'))
    await flush()
    expect(getCoaAutoReadState().progress[KEY]).toBeUndefined()
  })

  it('chamada sem force (usa o cache da callable)', async () => {
    mockReadProcessCoa.mockResolvedValue(done('a'))
    enqueueCoaAutoRead('p1', [doc('a')])
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledWith('p1', 'a', { force: false })
  })

  it('escopos diferentes (card e PO) entram na MESMA fila, sem paralelismo', async () => {
    const first = deferred()
    const second = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    enqueueCoaAutoRead('p1', [doc('a')], 'PO-1')
    enqueueCoaAutoRead('p1', [doc('b')], 'PO-2')
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress[buildCoaAutoReadKey('p1', 'PO-1')]).toEqual({ done: 0, total: 1 })
    expect(getCoaAutoReadState().progress[buildCoaAutoReadKey('p1', 'PO-2')]).toEqual({ done: 0, total: 1 })
    // Só o escopo do arquivo em leitura é o ativo; o outro espera a vez.
    expect(getCoaAutoReadState().activeKey).toBe(buildCoaAutoReadKey('p1', 'PO-1'))
    first.resolve(done('a'))
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
    expect(getCoaAutoReadState().activeKey).toBe(buildCoaAutoReadKey('p1', 'PO-2'))
    expect(getCoaAutoReadState().progress[buildCoaAutoReadKey('p1', 'PO-1')]).toBeUndefined()
    second.resolve(done('b'))
    await flush()
    expect(getCoaAutoReadState().progress).toEqual({})
    expect(getCoaAutoReadState().activeKey).toBe('')
  })

  it('novo envio com a fila andando entra no fim e soma ao total do escopo', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a')])
    await flush()
    enqueueCoaAutoRead('p1', [doc('b')])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 2 })
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
  })
})

describe('coaAutoReadQueue - quem entra', () => {
  it('sem componente habilitado montado para o processo (não-admin), nada é enfileirado nem chamado', async () => {
    unmount()
    unmount = undefined
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('só PDF com id: outros tipos e documentos sem id não são lidos e deixam a linha "não iniciada" (S11-J)', async () => {
    mockReadProcessCoa.mockResolvedValue(done('a'))
    expect(enqueueCoaAutoRead('p1', [doc('w', { mimeType: 'application/msword' }), doc('', {}), undefined, null])).toBe(0)
    expect(enqueueCoaAutoRead('p1', undefined)).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
    expect(getCoaAutoReadState().notices).toEqual({
      [KEY]: 'Leitura automática não iniciada: não foi possível identificar o arquivo enviado. Use Ler COAs no formulário.',
    })
    expect(enqueueCoaAutoRead('p1', [doc('w', { mimeType: 'application/msword' })])).toBe(0)
    expect(getCoaAutoReadState().notices[KEY]).toBe(
      'Leitura automática não iniciada: só PDF é lido automaticamente. Use Ler COAs no formulário.'
    )
  })

  it('documento ausente (undefined/null) e lista vazia continuam mudos', async () => {
    expect(enqueueCoaAutoRead('p1', [undefined, null])).toBe(0)
    expect(enqueueCoaAutoRead('p1', [])).toBe(0)
    expect(enqueueCoaAutoRead('p1', undefined)).toBe(0)
    expect(getCoaAutoReadState().notices).toEqual({})
  })

  it('uma tentativa por documento: reenfileirar o mesmo id não chama de novo e falha não repete', async () => {
    mockReadProcessCoa.mockRejectedValue(rejectWith('tess-timeout'))
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(1)
    await flush()
    await flush()
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(0)
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })
})

describe('coaAutoReadQueue - erros', () => {
  it('report-closed descarta o resto do processo sem chamar a callable de novo e deixa só a nota (S11-J)', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('report-closed'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices).toEqual({ [KEY]: CLOSED_NOTE })
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('not-pdf e too-large são silenciosos e a fila segue', async () => {
    mockReadProcessCoa
      .mockRejectedValueOnce(rejectWith('not-pdf'))
      .mockRejectedValueOnce(rejectWith('too-large'))
      .mockResolvedValueOnce(done('c'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
    expect(getCoaAutoReadState().notices).toEqual({})
  })

  it('erro só do arquivo (tess-timeout, falha gravada com not-found) segue a fila sem aviso', async () => {
    mockReadProcessCoa
      .mockRejectedValueOnce(rejectWith('tess-timeout'))
      .mockResolvedValueOnce(failedRead('b', 'tess-bad-response'))
      .mockResolvedValueOnce(done('c'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    for (let index = 0; index < 4; index += 1) await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
    expect(getCoaAutoReadState().notices).toEqual({})
  })

  it.each([
    ['busy', 'Outra leitura de COA está em andamento. Tente de novo em 1 minuto'],
    ['unknown', 'Não foi possível ler o COA agora. Tente de novo'],
    ['tess-auth', 'A Tess recusou as credenciais do Portal. Confira a chave e o workspace no servidor'],
    ['tess-rate-limit', 'O serviço de leitura pediu uma pausa. Tente de novo em 1 minuto'],
    ['tess-storage-full', 'O espaço de arquivos da Tess está cheio (30 arquivos). Apague arquivos antigos no painel da Tess e tente de novo'],
  ])('erro de fila (%s) esvazia o resto e deixa o aviso', async (code, message) => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith(code))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices[KEY]).toBe(`Leitura automática interrompida: ${message}. Use Ler COAs no formulário.`)
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('falha gravada com código de serviço (read.status failed) também interrompe', async () => {
    mockReadProcessCoa.mockResolvedValueOnce(failedRead('a', 'tess-auth'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices[KEY]).toContain('Leitura automática interrompida: A Tess recusou')
  })

  it('o aviso vale para todos os escopos que ficaram sem leitura e some num novo envio', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('busy')).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a')], 'PO-1')
    enqueueCoaAutoRead('p1', [doc('b')], 'PO-2')
    await flush()
    await flush()
    expect(getCoaAutoReadState().notices[buildCoaAutoReadKey('p1', 'PO-1')]).toBeTruthy()
    expect(getCoaAutoReadState().notices[buildCoaAutoReadKey('p1', 'PO-2')]).toBeTruthy()
    enqueueCoaAutoRead('p1', [doc('c')], 'PO-2')
    expect(getCoaAutoReadState().notices[buildCoaAutoReadKey('p1', 'PO-2')]).toBeUndefined()
    expect(getCoaAutoReadState().notices[buildCoaAutoReadKey('p1', 'PO-1')]).toBeTruthy()
    await flush()
  })
})

describe('coaAutoReadQueue - ciclo de vida e selo', () => {
  it('desmontar a tela NÃO descarta a fila: a 2ª e a 3ª leitura continuam depois do unmount', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    mockReadProcessCoa
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    unmount()
    unmount = undefined
    // A fila segue sem componente: o progresso continua no store.
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })

    first.resolve(done('a'))
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 1, total: 3 })

    second.resolve(done('b'))
    await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 2, total: 3 })

    third.resolve(done('c'))
    await flush()
    expect(getCoaAutoReadState().progress).toEqual({})
    expect(getCoaAutoReadState().activeKey).toBe('')
    expect(getCoaAutoReadState().readVersions.p1).toBe(3)
  })

  it('componentes montando e desmontando (um, dois, nenhum) nunca mexem na fila em andamento', async () => {
    const second = registerCoaAutoReadMount('p1')
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    second()
    unmount()
    unmount = undefined
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
  })

  it('trocar de processo não para a fila: o que ficou do anterior continua a ser lido', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    unmount()
    unmount = registerCoaAutoReadMount('p2')
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('processos diferentes entram na MESMA fila: nunca duas leituras em paralelo, mesmo sem componente montado', async () => {
    const other = registerCoaAutoReadMount('p2')
    let running = 0
    let peak = 0
    mockReadProcessCoa.mockImplementation(async (_processId, documentId) => {
      running += 1
      peak = Math.max(peak, running)
      await flush()
      running -= 1
      return done(documentId)
    })
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    enqueueCoaAutoRead('p2', [doc('c'), doc('d')])
    unmount()
    unmount = undefined
    other()
    for (let index = 0; index < 8; index += 1) await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c', 'd'])
    expect(peak).toBe(1)
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('uma tentativa por documento: desmontar, remontar e reenfileirar o mesmo id não lê de novo', async () => {
    mockReadProcessCoa.mockResolvedValue(done('a'))
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(1)
    await flush()
    unmount()
    unmount = registerCoaAutoReadMount('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(0)
    expect(enqueueCoaAutoRead('p1', [doc('a')], 'PO-1')).toBe(0)
    await flush()
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })

  it('sem componente montado no momento do envio, não enfileira (mesmo com a fila andando)', async () => {
    mockReadProcessCoa.mockReturnValue(deferred().promise)
    enqueueCoaAutoRead('p1', [doc('a')])
    await flush()
    unmount()
    unmount = undefined
    expect(enqueueCoaAutoRead('p1', [doc('b')])).toBe(0)
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 1 })
  })

  it('o contador é do lote do escopo: o arquivo antigo que termina depois do unmount e de um novo envio soma na mesma entrada', async () => {
    const first = deferred()
    const second = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    // Sai da aba, volta e anexa mais um arquivo enquanto o primeiro ainda lê.
    unmount()
    unmount = registerCoaAutoReadMount('p1')
    enqueueCoaAutoRead('p1', [doc('c')])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })
    first.resolve(done('a'))
    await flush()
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 1, total: 3 })
    second.resolve(done('b'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('cada arquivo que termina (lido, falha só do arquivo ou silencioso) avança a versão de leitura do processo', async () => {
    mockReadProcessCoa
      .mockResolvedValueOnce(done('a'))
      .mockRejectedValueOnce(rejectWith('tess-timeout'))
      .mockRejectedValueOnce(rejectWith('not-pdf'))
    const versions = []
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    for (let index = 0; index < 4; index += 1) {
      versions.push(getCoaAutoReadState().readVersions.p1 ?? 0)
      await flush()
    }
    expect(getCoaAutoReadState().readVersions.p1).toBe(3)
    expect(versions[versions.length - 1]).toBeGreaterThanOrEqual(2)
  })

  it('leitura já em andamento em outra sessão (status reading) não é erro e a fila segue', async () => {
    mockReadProcessCoa
      .mockResolvedValueOnce({ status: 'reading', cached: false, read: null })
      .mockResolvedValueOnce(done('b'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
    expect(getCoaAutoReadState().notices).toEqual({})
  })

  it('reset isola os testes: uma fila antiga não continua depois do reset', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    resetCoaAutoRead()
    first.resolve(done('a'))
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().readVersions).toEqual({})
  })
})

describe('coaAutoReadQueue - erros entre processos, sem componente montado', () => {
  it('report-closed descarta só o resto do PROCESSO: o outro processo segue na fila', async () => {
    const other = registerCoaAutoReadMount('p2')
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('report-closed')).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    enqueueCoaAutoRead('p2', [doc('c'), doc('d')])
    unmount()
    unmount = undefined
    other()
    for (let index = 0; index < 6; index += 1) await flush()
    expect(calledIds()).toEqual(['a', 'c', 'd'])
    expect(getCoaAutoReadState().notices).toEqual({ [KEY]: CLOSED_NOTE })
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('erro de serviço esvazia TODA a fila (todos os processos) e o aviso fica no store para quando a tela voltar', async () => {
    const other = registerCoaAutoReadMount('p2')
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('tess-auth')).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a')])
    enqueueCoaAutoRead('p2', [doc('b')])
    unmount()
    unmount = undefined
    other()
    for (let index = 0; index < 4; index += 1) await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress).toEqual({})
    const message = 'Leitura automática interrompida: A Tess recusou as credenciais do Portal. Confira a chave e o workspace no servidor. Use Ler COAs no formulário.'
    expect(getCoaAutoReadState().notices[KEY]).toBe(message)
    expect(getCoaAutoReadState().notices[buildCoaAutoReadKey('p2', '')]).toBe(message)
    // Voltar à tela (montar de novo) não apaga o aviso nem repete a leitura.
    unmount = registerCoaAutoReadMount('p1')
    await flush()
    expect(getCoaAutoReadState().notices[KEY]).toBe(message)
    expect(mockReadProcessCoa).toHaveBeenCalledTimes(1)
  })
})

describe('coaAutoReadQueue - logout e troca de usuário', () => {
  const ADMIN_A = { uid: 'admin-a', role: 'admin' }

  it('logout esvazia a fila e o progresso: o arquivo em andamento termina e nada mais é lido', async () => {
    setCoaAutoReadActor(ADMIN_A)
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })

    setCoaAutoReadActor(null)
    expect(getCoaAutoReadState().progress).toEqual({})
    expect(getCoaAutoReadState().activeKey).toBe('')
    first.resolve(done('a'))
    for (let index = 0; index < 3; index += 1) await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('logout apaga o aviso de interrupção que ficou no store', async () => {
    setCoaAutoReadActor(ADMIN_A)
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('busy'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    await flush()
    expect(getCoaAutoReadState().notices[KEY]).toBeTruthy()
    setCoaAutoReadActor(null)
    expect(getCoaAutoReadState().notices).toEqual({})
  })

  it('trocar de usuário ou de perfil também esvazia a fila; reaplicar o mesmo usuário não mexe nela', async () => {
    setCoaAutoReadActor(ADMIN_A)
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    setCoaAutoReadActor({ ...ADMIN_A })
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 2 })

    setCoaAutoReadActor({ uid: 'admin-b', role: 'admin' })
    expect(getCoaAutoReadState().progress).toEqual({})
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])

    // Mesmo uid com outro perfil (perdeu o admin): idem.
    const second = deferred()
    mockReadProcessCoa.mockReset().mockReturnValueOnce(second.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('c'), doc('d')])
    await flush()
    setCoaAutoReadActor({ uid: 'admin-b', role: 'logistica' })
    expect(getCoaAutoReadState().progress).toEqual({})
    second.resolve(done('c'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['c'])
  })

  it('depois do logout um novo admin enfileira normalmente, e o resultado do arquivo antigo não interrompe a fila nova', async () => {
    setCoaAutoReadActor(ADMIN_A)
    const old = deferred()
    mockReadProcessCoa.mockReturnValueOnce(old.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a')])
    await flush()
    setCoaAutoReadActor(null)
    setCoaAutoReadActor({ uid: 'admin-b', role: 'admin' })
    expect(enqueueCoaAutoRead('p1', [doc('n1'), doc('n2')], 'PO-9')).toBe(2)
    await flush()
    // Ainda uma leitura por vez: a do usuário novo espera a antiga terminar.
    expect(calledIds()).toEqual(['a'])

    // A antiga falha com erro de SERVIÇO: não esvazia a fila do usuário novo nem deixa aviso.
    old.reject(rejectWith('tess-auth'))
    for (let index = 0; index < 4; index += 1) await flush()
    expect(calledIds()).toEqual(['a', 'n1', 'n2'])
    expect(getCoaAutoReadState().notices).toEqual({})
    expect(getCoaAutoReadState().progress).toEqual({})
  })
})
describe('coaAutoReadQueue - bilhete do envio (S11-H, L157)', () => {
  const SELLER = { uid: 'admin-s', role: 'admin' }

  it('sem componente montado no início do envio não há bilhete e nada entra (nem sem bilhete)', async () => {
    unmount()
    unmount = undefined
    expect(beginCoaAutoReadSend('p1')).toBeNull()
    expect(beginCoaAutoReadSend('')).toBeNull()
    expect(enqueueCoaAutoRead('p1', [doc('a')])).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('com bilhete, o arquivo que sobe DEPOIS de o componente desmontar ainda entra e é lido', async () => {
    mockReadProcessCoa.mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    expect(send).not.toBeNull()
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(1)
    unmount()
    unmount = undefined
    expect(enqueueCoaAutoRead('p1', [doc('b')], '', send)).toBe(1)
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
  })

  it('cada arquivo entra na hora: o contador do lote cresce a cada enfileiramento e X nunca passa de Y', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    enqueueCoaAutoRead('p1', [doc('a')], '', send)
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 1 })
    enqueueCoaAutoRead('p1', [doc('b')], '', send)
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 2 })
    enqueueCoaAutoRead('p1', [doc('c')], '', send)
    expect(getCoaAutoReadState().progress[KEY]).toEqual({ done: 0, total: 3 })
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b', 'c'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('logout/troca de usuário depois do bilhete (mesmo antes do 1º enfileiramento) o invalida', async () => {
    setCoaAutoReadActor(SELLER)
    const send = beginCoaAutoReadSend('p1')
    setCoaAutoReadActor(null)
    setCoaAutoReadActor({ uid: 'admin-t', role: 'admin' })
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(0)
    // Quem entrou depois enfileira normalmente com um bilhete novo.
    mockReadProcessCoa.mockResolvedValue(done('x'))
    expect(enqueueCoaAutoRead('p1', [doc('n')], '', beginCoaAutoReadSend('p1'))).toBe(1)
    await flush()
    await flush()
    expect(calledIds()).toEqual(['n'])
  })

  it('bilhete de outro processo ou de antes do reset não vale', async () => {
    mockReadProcessCoa.mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p2', [doc('a')], '', send)).toBe(0)
    resetCoaAutoRead()
    unmount = registerCoaAutoReadMount('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('uma tentativa por documento também com bilhete: o mesmo id duas vezes (ou em outro envio) lê uma vez', async () => {
    mockReadProcessCoa.mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(1)
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(0)
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', beginCoaAutoReadSend('p1'))).toBe(0)
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
  })

  it('com bilhete, não-PDF segue mudo', async () => {
    const send = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p1', [doc('w', { mimeType: 'application/msword' }), doc('')], '', send)).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
  })

  it('erro de serviço na leitura: o resto do lote que ainda sobe NÃO entra; um envio novo depois entra e limpa o aviso', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('busy')).mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', send)).toBe(1)
    await flush()
    await flush()
    expect(getCoaAutoReadState().notices[KEY]).toBeTruthy()
    expect(enqueueCoaAutoRead('p1', [doc('b')], '', send)).toBe(0)
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices[KEY]).toBeTruthy()

    expect(enqueueCoaAutoRead('p1', [doc('c')], '', beginCoaAutoReadSend('p1'))).toBe(1)
    expect(getCoaAutoReadState().notices[KEY]).toBeUndefined()
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'c'])
  })

  it('report-closed: o resto do lote do MESMO processo não entra; outro processo e um envio novo seguem normais', async () => {
    const other = registerCoaAutoReadMount('p2')
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('report-closed')).mockResolvedValue(done('x'))
    const send = beginCoaAutoReadSend('p1')
    const sendOther = beginCoaAutoReadSend('p2')
    enqueueCoaAutoRead('p1', [doc('a')], '', send)
    await flush()
    await flush()
    expect(enqueueCoaAutoRead('p1', [doc('b')], '', send)).toBe(0)
    expect(enqueueCoaAutoRead('p2', [doc('x1')], '', sendOther)).toBe(1)
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'x1'])
    other()
  })
})

describe('coaAutoReadQueue - lote que continua depois de relatório fechado ou erro de serviço (S11-J)', () => {
  const OTHER_KEY = buildCoaAutoReadKey('p1', 'PO-9')

  it('report-closed: o arquivo seguinte do mesmo bilhete, em outro escopo, não é lido e a nota aparece nele', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('report-closed'))
    const ticket = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', ticket)).toBe(1)
    await flush()
    await flush()
    expect(enqueueCoaAutoRead('p1', [doc('b')], 'PO-9', ticket)).toBe(0)
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices[OTHER_KEY]).toBe(CLOSED_NOTE)
  })

  it('erro de serviço: o arquivo seguinte do mesmo bilhete não é lido e diz por quê, sem pisar em aviso existente', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('tess-auth'))
    const ticket = beginCoaAutoReadSend('p1')
    expect(enqueueCoaAutoRead('p1', [doc('a')], '', ticket)).toBe(1)
    await flush()
    await flush()
    const interrupted = getCoaAutoReadState().notices[KEY]
    expect(interrupted).toMatch(/^Leitura automática interrompida: /)
    expect(enqueueCoaAutoRead('p1', [doc('b')], '', ticket)).toBe(0)
    expect(enqueueCoaAutoRead('p1', [doc('c')], 'PO-9', ticket)).toBe(0)
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices[KEY]).toBe(interrupted)
    expect(getCoaAutoReadState().notices[OTHER_KEY]).toBe(
      'Leitura automática não iniciada: a leitura anterior foi interrompida. Use Ler COAs no formulário.'
    )
  })

  it('um bilhete novo apaga as linhas "não iniciada" do lote anterior do processo (e só dele)', async () => {
    const other = registerCoaAutoReadMount('p2')
    enqueueCoaAutoRead('p1', [doc('w', { mimeType: 'application/msword' })])
    enqueueCoaAutoRead('p2', [doc('x', { mimeType: 'application/msword' })])
    expect(Object.keys(getCoaAutoReadState().notices).sort()).toEqual([KEY, buildCoaAutoReadKey('p2', '')].sort())
    beginCoaAutoReadSend('p1')
    expect(Object.keys(getCoaAutoReadState().notices)).toEqual([buildCoaAutoReadKey('p2', '')])
    other()
  })
})
