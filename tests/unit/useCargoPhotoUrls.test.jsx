// S10-J1b: imagens das fotos de avaria (cache de módulo, concorrência 3, cancelamento, revogação das URLs locais e
// blobs locais). O download (function) é mockado; nada de rede.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

const mockDownload = vi.fn()

vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  downloadCargoConferencePhotoBlob: (...args) => mockDownload(...args),
}))

import useCargoPhotoUrls, {
  clearCargoPhotoCache,
  registerCargoPhotoBlobs,
} from '../../src/features/processes/useCargoPhotoUrls'

const photo = (id) => ({ id })

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let urlCounter
let revoked
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(() => {
  clearCargoPhotoCache()
  mockDownload.mockReset()
  urlCounter = 0
  revoked = []
  // jsdom não tem createObjectURL: atribui direto e devolve o original no afterEach.
  URL.createObjectURL = vi.fn(() => `blob:local-${(urlCounter += 1)}`)
  URL.revokeObjectURL = vi.fn((url) => revoked.push(url))
})

afterEach(() => {
  cleanup()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.restoreAllMocks()
})

describe('useCargoPhotoUrls', () => {
  it('baixa a miniatura pela function, vira URL local e passa de loading para ready', async () => {
    const gate = deferred()
    mockDownload.mockReturnValueOnce(gate.promise)
    const { result } = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    expect(result.current.statusOf('a1')).toBe('loading')
    expect(result.current.urlOf('a1')).toBe('')
    expect(mockDownload).toHaveBeenCalledWith('p1', 'a1', 'thumb')

    await act(async () => gate.resolve(new Blob(['x'])))
    await waitFor(() => expect(result.current.statusOf('a1')).toBe('ready'))
    expect(result.current.urlOf('a1')).toMatch(/^blob:local-/)
  })

  it('size full pede a foto cheia, com cache separado da miniatura', async () => {
    mockDownload.mockResolvedValue(new Blob(['x']))
    const thumb = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    const full = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')], { size: 'full' }))
    await waitFor(() => expect(full.result.current.statusOf('a1')).toBe('ready'))
    await waitFor(() => expect(thumb.result.current.statusOf('a1')).toBe('ready'))
    expect(mockDownload.mock.calls.map((call) => call[2]).sort()).toEqual(['full', 'thumb'])
  })

  it('cache por sessão: outra tela com a mesma foto não baixa de novo', async () => {
    mockDownload.mockResolvedValue(new Blob(['x']))
    const first = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    await waitFor(() => expect(first.result.current.statusOf('a1')).toBe('ready'))
    first.unmount()
    const second = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    await waitFor(() => expect(second.result.current.statusOf('a1')).toBe('ready'))
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  it('no máximo 3 downloads ao mesmo tempo; terminando um, o próximo da fila começa', async () => {
    const gates = Array.from({ length: 5 }, () => deferred())
    mockDownload.mockImplementation((_process, id) => gates[Number(id.slice(1))].promise)
    const photos = Array.from({ length: 5 }, (_, index) => photo(`f${index}`))
    const { result } = renderHook(() => useCargoPhotoUrls('p1', photos))
    expect(mockDownload).toHaveBeenCalledTimes(3)

    await act(async () => gates[0].resolve(new Blob(['0'])))
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(4))
    await act(async () => gates[1].resolve(new Blob(['1'])))
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(5))
    await act(async () => {
      for (const gate of gates.slice(2)) gate.resolve(new Blob(['n']))
    })
    await waitFor(() => expect(result.current.statusOf('f4')).toBe('ready'))
  })

  it('cancelamento: quem sai antes da vez na fila não gasta uma invocação', async () => {
    const gates = Array.from({ length: 4 }, () => deferred())
    mockDownload.mockImplementation((_process, id) => gates[Number(id.slice(1))].promise)
    const busy = renderHook(() => useCargoPhotoUrls('p1', [photo('f0'), photo('f1'), photo('f2')]))
    const waiting = renderHook(() => useCargoPhotoUrls('p1', [photo('f3')]))
    expect(mockDownload).toHaveBeenCalledTimes(3)
    waiting.unmount()
    await act(async () => gates[0].resolve(new Blob(['0'])))
    await waitFor(() => expect(busy.result.current.statusOf('f0')).toBe('ready'))
    expect(mockDownload.mock.calls.map((call) => call[1])).not.toContain('f3')
  })

  it('ao desmontar revoga as URLs locais da tela, e o blob continua no cache', async () => {
    mockDownload.mockResolvedValue(new Blob(['x']))
    const { result, unmount } = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    await waitFor(() => expect(result.current.statusOf('a1')).toBe('ready'))
    const url = result.current.urlOf('a1')
    unmount()
    expect(revoked).toContain(url)
    const again = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    await waitFor(() => expect(again.result.current.statusOf('a1')).toBe('ready'))
    expect(mockDownload).toHaveBeenCalledTimes(1)
  })

  it('foto que sai da lista tem a URL revogada na hora', async () => {
    mockDownload.mockResolvedValue(new Blob(['x']))
    const { result, rerender } = renderHook(({ photos }) => useCargoPhotoUrls('p1', photos), {
      initialProps: { photos: [photo('a1'), photo('a2')] },
    })
    await waitFor(() => expect(result.current.statusOf('a2')).toBe('ready'))
    const gone = result.current.urlOf('a2')
    rerender({ photos: [photo('a1')] })
    await waitFor(() => expect(revoked).toContain(gone))
  })

  it('falha do download: status error; "retry" tenta de novo e fica ready', async () => {
    mockDownload.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'permission-denied' }))
    mockDownload.mockResolvedValueOnce(new Blob(['x']))
    const { result } = renderHook(() => useCargoPhotoUrls('p1', [photo('a1')]))
    await waitFor(() => expect(result.current.statusOf('a1')).toBe('error'))
    expect(result.current.urlOf('a1')).toBe('')
    act(() => result.current.retry('a1'))
    await waitFor(() => expect(result.current.statusOf('a1')).toBe('ready'))
    expect(mockDownload).toHaveBeenCalledTimes(2)
  })

  it('foto recém-enviada usa o blob local (miniatura e foto cheia), sem chamar a function', async () => {
    registerCargoPhotoBlobs('novo', { thumb: new Blob(['t']), full: new Blob(['f']) })
    const thumb = renderHook(() => useCargoPhotoUrls('p1', [photo('novo')]))
    const full = renderHook(() => useCargoPhotoUrls('p1', [photo('novo')], { size: 'full' }))
    await waitFor(() => expect(thumb.result.current.statusOf('novo')).toBe('ready'))
    await waitFor(() => expect(full.result.current.statusOf('novo')).toBe('ready'))
    expect(mockDownload).not.toHaveBeenCalled()
  })

  it('lista vazia ou ids inválidos não baixam nada', () => {
    renderHook(() => useCargoPhotoUrls('p1', []))
    renderHook(() => useCargoPhotoUrls('p1', [null, {}, { id: '' }]))
    renderHook(() => useCargoPhotoUrls('p1', undefined))
    expect(mockDownload).not.toHaveBeenCalled()
  })
})
