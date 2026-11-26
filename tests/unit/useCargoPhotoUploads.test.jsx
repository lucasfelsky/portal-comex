// S10-J1b: fila de envio das fotos de avaria (um envio por vez, progresso, AbortSignal, falha de rede, retry sem reduzir
// de novo, limites 5/30). Redução e Storage mockados; nada de rede.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const mockPrepare = vi.fn()
const mockUpload = vi.fn()
const mockDeleteOwn = vi.fn()

vi.mock('../../src/features/processes/cargoPhotoResize', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareCargoPhoto: (...args) => mockPrepare(...args),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  uploadCargoConferencePhoto: (...args) => mockUpload(...args),
  deleteOwnCargoConferencePhotoFiles: (...args) => mockDeleteOwn(...args),
  downloadCargoConferencePhotoBlob: vi.fn(),
}))

import { CARGO_PHOTO_MESSAGES } from '../../src/features/processes/cargoConferencePhotos'
import useCargoPhotoUploads from '../../src/features/processes/useCargoPhotoUploads'
import { clearCargoPhotoCache } from '../../src/features/processes/useCargoPhotoUrls'

const EMPTY = { damageByRowId: {} }
const file = (name = 'a.jpg', type = 'image/jpeg') => ({ name, type })

const savedPhoto = (id, rowId = 'r-1') => ({
  id,
  path: `processes/p1/cargo-conference/${rowId}/1-u1-${id}.jpg`,
  thumbPath: `processes/p1/cargo-conference/${rowId}/1-u1-${id}-t.jpg`,
  width: 1600,
  height: 1200,
  size: 100,
  uploadedAt: 1,
  byId: 'u1',
})

const prepared = () => ({
  full: { blob: new Blob(['f']), width: 1600, height: 1200 },
  thumb: { blob: new Blob(['t']), width: 400, height: 300 },
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(props = {}) {
  const onUploaded = vi.fn()
  const hook = renderHook(
    (current) => useCargoPhotoUploads({ processId: 'p1', uid: 'u1', onUploaded, conference: EMPTY, ...current }),
    { initialProps: props }
  )
  return { ...hook, onUploaded }
}

beforeEach(() => {
  clearCargoPhotoCache()
  mockPrepare.mockReset()
  mockUpload.mockReset()
  mockDeleteOwn.mockReset()
  mockPrepare.mockImplementation(async () => prepared())
  mockDeleteOwn.mockResolvedValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCargoPhotoUploads: envio', () => {
  it('reduz, envia com progresso e entrega a foto a onUploaded; a fila volta a ficar vazia', async () => {
    const gate = deferred()
    let report
    mockUpload.mockImplementation((_process, _row, _prepared, options) => {
      report = options.onProgress
      return gate.promise
    })
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('uploading'))
    expect(result.current.isUploading).toBe(true)
    expect(mockUpload).toHaveBeenCalledWith(
      'p1',
      'r-1',
      expect.objectContaining({ full: expect.anything(), thumb: expect.anything() }),
      expect.objectContaining({ uid: 'u1', signal: expect.any(AbortSignal) })
    )

    act(() => report(40))
    await waitFor(() => expect(result.current.uploads[0].progress).toBe(40))

    await act(async () => gate.resolve(savedPhoto('p-ok')))
    await waitFor(() => expect(result.current.uploads).toEqual([]))
    expect(onUploaded).toHaveBeenCalledWith('r-1', savedPhoto('p-ok'))
    expect(result.current.isUploading).toBe(false)
  })

  it('a foto NÃO é gravada sozinha: o hook só entrega o Photo a quem chamou (o Salvar é de outro)', async () => {
    mockUpload.mockResolvedValue(savedPhoto('p1x'))
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(onUploaded.mock.calls[0]).toEqual(['r-1', savedPhoto('p1x')])
  })

  it('um envio por vez: o segundo só começa quando o primeiro termina', async () => {
    const gates = [deferred(), deferred()]
    mockUpload.mockImplementationOnce(() => gates[0].promise).mockImplementationOnce(() => gates[1].promise)
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file('a.jpg'), file('b.jpg')]))
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
    expect(result.current.uploads.map((item) => item.status)).toEqual(['uploading', 'queued'])

    await act(async () => gates[0].resolve(savedPhoto('p-1')))
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2))
    await act(async () => gates[1].resolve(savedPhoto('p-2')))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2))
    expect(onUploaded.mock.calls.map((call) => call[1].id)).toEqual(['p-1', 'p-2'])
  })

  it('durante a redução o status é resizing', async () => {
    const gate = deferred()
    mockPrepare.mockImplementationOnce(() => gate.promise)
    mockUpload.mockResolvedValue(savedPhoto('p-ok'))
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('resizing'))
    await act(async () => gate.resolve(prepared()))
    await waitFor(() => expect(onUploaded).toHaveBeenCalled())
  })

  it('enabled falso (somente leitura): não envia nada', () => {
    const { result } = setup({ enabled: false })
    act(() => result.current.addFiles('r-1', [file()]))
    expect(mockPrepare).not.toHaveBeenCalled()
    expect(result.current.uploads).toEqual([])
  })
})

describe('useCargoPhotoUploads: falha, retry e cancelamento', () => {
  it('falha de rede: mensagem de sem conexão e retry reenvia SEM reduzir de novo', async () => {
    mockUpload.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mockUpload.mockResolvedValueOnce(savedPhoto('p-ok'))
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('error'))
    expect(result.current.uploads[0]).toMatchObject({ error: CARGO_PHOTO_MESSAGES.offline, retryable: true })
    expect(result.current.isUploading).toBe(false)
    expect(onUploaded).not.toHaveBeenCalled()

    act(() => result.current.retry(result.current.uploads[0].key))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('r-1', savedPhoto('p-ok')))
    expect(mockPrepare).toHaveBeenCalledTimes(1)
    expect(mockUpload).toHaveBeenCalledTimes(2)
    expect(mockUpload.mock.calls[1][2]).toBe(mockUpload.mock.calls[0][2])
    expect(result.current.uploads).toEqual([])
  })

  it('foto que não dá para ler: erro sem retry; o retry não faz nada e "cancel" libera a vaga', async () => {
    mockPrepare.mockRejectedValueOnce(
      Object.assign(new Error('Não foi possível ler esta foto. Tire de novo ou escolha uma foto JPG ou PNG.'), {
        code: 'cargoPhoto/unreadable',
      })
    )
    const { result } = setup()
    act(() => result.current.addFiles('r-1', [file('x.heic', 'image/heic')]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('error'))
    const [failed] = result.current.uploads
    expect(failed.retryable).toBe(false)
    expect(failed.error).toMatch(/^Não foi possível ler esta foto/)
    act(() => result.current.retry(failed.key))
    expect(mockPrepare).toHaveBeenCalledTimes(1)
    expect(mockUpload).not.toHaveBeenCalled()
    act(() => result.current.cancel(failed.key))
    expect(result.current.uploads).toEqual([])
  })

  it('cancelar um envio em andamento aborta o AbortSignal e não vira erro', async () => {
    let signal
    mockUpload.mockImplementation(
      (_process, _row, _prepared, options) =>
        new Promise((_resolve, reject) => {
          signal = options.signal
          signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelado'), { code: 'storage/canceled' })))
        })
    )
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('uploading'))
    act(() => result.current.cancel(result.current.uploads[0].key))
    expect(signal.aborted).toBe(true)
    expect(result.current.uploads).toEqual([])
    await act(async () => {})
    expect(result.current.uploads).toEqual([])
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('cancelou e o arquivo ainda assim terminou de subir: apaga o que subiu e não entrega a foto', async () => {
    const gate = deferred()
    mockUpload.mockImplementation(() => gate.promise)
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('uploading'))
    act(() => result.current.cancel(result.current.uploads[0].key))
    await act(async () => gate.resolve(savedPhoto('p-late')))
    await waitFor(() => expect(mockDeleteOwn).toHaveBeenCalledWith('p1', [savedPhoto('p-late')], { uid: 'u1' }))
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('cancelar um da fila antes da vez evita o envio dele', async () => {
    const gate = deferred()
    mockUpload.mockImplementationOnce(() => gate.promise)
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file('a.jpg'), file('b.jpg')]))
    await waitFor(() => expect(result.current.uploads[0]?.status).toBe('uploading'))
    act(() => result.current.cancel(result.current.uploads[1].key))
    await act(async () => gate.resolve(savedPhoto('p-1')))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(mockUpload).toHaveBeenCalledTimes(1)
  })

  it('sair da tela (desmontar) aborta o envio em andamento', async () => {
    let signal
    mockUpload.mockImplementation((_process, _row, _prepared, options) => {
      signal = options.signal
      return new Promise(() => {})
    })
    const { result, unmount } = setup()
    act(() => result.current.addFiles('r-1', [file()]))
    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('cancelAll limpa a fila e o aviso', async () => {
    mockUpload.mockImplementation(() => new Promise(() => {}))
    const { result } = setup({ conference: conferenceWithRow('r-1', 4) })
    act(() => result.current.addFiles('r-1', [file('a.jpg'), file('b.jpg')]))
    await waitFor(() => expect(result.current.uploads).toHaveLength(1))
    expect(result.current.notice).not.toBeNull()
    act(() => result.current.cancelAll())
    expect(result.current.uploads).toEqual([])
    expect(result.current.notice).toBeNull()
  })
})

function conferenceWithRow(rowId, count) {
  return {
    damageByRowId: {
      [rowId]: { flagged: true, note: '', photos: Array.from({ length: count }, (_, index) => savedPhoto(`s${index}`, rowId)) },
    },
  }
}

describe('useCargoPhotoUploads: limites e arquivos', () => {
  it('3 fotos com 1 vaga no item: entra 1 e o resto vira aviso', async () => {
    mockUpload.mockImplementation(() => new Promise(() => {}))
    const { result } = setup({ conference: conferenceWithRow('r-1', 4) })
    act(() => result.current.addFiles('r-1', [file('a.jpg'), file('b.jpg'), file('c.jpg')]))
    expect(result.current.uploads).toHaveLength(1)
    expect(result.current.notice).toEqual({ rowId: 'r-1', text: '2 fotos não entraram: limite de 5 por item.' })
    expect(result.current.room('r-1')).toEqual({ row: 0, total: 25 })
  })

  it('6ª foto do item (5 salvas): nenhuma entra', () => {
    const { result } = setup({ conference: conferenceWithRow('r-1', 5) })
    act(() => result.current.addFiles('r-1', [file()]))
    expect(result.current.uploads).toEqual([])
    expect(mockPrepare).not.toHaveBeenCalled()
    expect(result.current.notice?.text).toBe('1 foto não entrou: limite de 5 por item.')
  })

  it('31ª foto da conferência: as em envio contam no total', () => {
    const photos = (rowId, from) =>
      Array.from({ length: 5 }, (_, index) => savedPhoto(`${rowId}${from + index}`, rowId))
    const conference = {
      damageByRowId: Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e'].map((rowId, index) => [rowId, { flagged: true, note: '', photos: photos(rowId, index * 5) }])
      ),
    }
    mockUpload.mockImplementation(() => new Promise(() => {}))
    const { result } = setup({ conference })
    // 25 salvas: cabem mais 5 na conferência; a 6ª e a 7ª não entram.
    act(() => result.current.addFiles('f', Array.from({ length: 5 }, (_, index) => file(`n${index}.jpg`))))
    expect(result.current.uploads).toHaveLength(5)
    act(() => result.current.addFiles('g', [file('x.jpg')]))
    expect(result.current.uploads).toHaveLength(5)
    expect(result.current.notice).toEqual({ rowId: 'g', text: '1 foto não entrou: limite de 30 por conferência.' })
    expect(result.current.room('g')).toEqual({ row: 5, total: 0 })
  })

  it('arquivo que não é foto é ignorado com aviso; as fotos do mesmo lote seguem', async () => {
    mockUpload.mockResolvedValue(savedPhoto('p-ok'))
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file('nota.pdf', 'application/pdf'), file('a.jpg')]))
    expect(result.current.notice).toEqual({ rowId: 'r-1', text: '1 arquivo ignorado: escolha apenas fotos.' })
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
    expect(mockPrepare).toHaveBeenCalledTimes(1)
  })

  it('foto octet-stream com extensão .jpg entra (valida pela decodificação)', async () => {
    mockUpload.mockResolvedValue(savedPhoto('p-ok'))
    const { result, onUploaded } = setup()
    act(() => result.current.addFiles('r-1', [file('IMG_1.jpg', 'application/octet-stream')]))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
  })

  it('lista vazia e FileList-like não quebram', () => {
    const { result } = setup()
    act(() => result.current.addFiles('r-1', []))
    act(() => result.current.addFiles('r-1', null))
    expect(result.current.uploads).toEqual([])
    expect(result.current.notice).toBeNull()
  })
})
