// S11-E: fila única da leitura automática do COA (coaAutoReadQueue). A callable `readProcessCoa` é mockada (nunca chama
// a Tess); as mensagens de erro (describeCoaReadError) são as reais. Dados inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadProcessCoa = vi.fn()

vi.mock('../../src/services/coaReadsRepository', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readProcessCoa: (...args) => mockReadProcessCoa(...args) }
})

import {
  buildCoaAutoReadKey,
  enqueueCoaAutoRead,
  getCoaAutoReadState,
  registerCoaAutoReadMount,
  resetCoaAutoRead,
} from '../../src/features/processes/coaAutoReadQueue'

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

  it('só PDF com id: outros tipos e documentos sem id entram mudos', async () => {
    mockReadProcessCoa.mockResolvedValue(done('a'))
    expect(enqueueCoaAutoRead('p1', [doc('w', { mimeType: 'application/msword' }), doc('', {}), undefined, null])).toBe(0)
    expect(enqueueCoaAutoRead('p1', undefined)).toBe(0)
    await flush()
    expect(mockReadProcessCoa).not.toHaveBeenCalled()
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
  it('report-closed é silencioso e descarta o resto do processo sem chamar a callable de novo', async () => {
    mockReadProcessCoa.mockRejectedValueOnce(rejectWith('report-closed'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().notices).toEqual({})
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
  it('desmontar a tela para a fila DEPOIS do arquivo em andamento', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b'), doc('c')])
    await flush()
    unmount()
    unmount = undefined
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a'])
    expect(getCoaAutoReadState().progress).toEqual({})
  })

  it('dois componentes montados: sair de um não para a fila; sair do último para', async () => {
    const second = registerCoaAutoReadMount('p1')
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise).mockResolvedValue(done('x'))
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    second()
    first.resolve(done('a'))
    await flush()
    await flush()
    expect(calledIds()).toEqual(['a', 'b'])
  })

  it('trocar de processo (outro processo sem tela) não lê o que ficou do anterior', async () => {
    const first = deferred()
    mockReadProcessCoa.mockReturnValueOnce(first.promise)
    enqueueCoaAutoRead('p1', [doc('a'), doc('b')])
    await flush()
    unmount()
    unmount = registerCoaAutoReadMount('p2')
    first.resolve(done('a'))
    await flush()
    expect(calledIds()).toEqual(['a'])
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
