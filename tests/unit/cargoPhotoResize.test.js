// S11 (J1): redução da foto de avaria (canvas e createImageBitmap mockados; nada de rede nem de imagem real).
//
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARGO_PHOTO_NOT_IMAGE_CODE,
  CARGO_PHOTO_TOO_LARGE_CODE,
  CARGO_PHOTO_UNREADABLE_CODE,
  CARGO_PHOTO_UNREADABLE_MESSAGE,
  isCargoPhotoFile,
  prepareCargoPhoto,
  resizeCargoPhoto,
} from '../../src/features/processes/cargoPhotoResize.js'

let canvases
let toBlobSizes

function installCanvas() {
  canvases = []
  toBlobSizes = []
  vi.stubGlobal('document', {
    createElement: vi.fn((tag) => {
      expect(tag).toBe('canvas')
      const context = {
        fillStyle: '',
        imageSmoothingQuality: 'low',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }
      const canvas = {
        width: 0,
        height: 0,
        context,
        getContext: vi.fn(() => context),
        toBlob: vi.fn((callback, type, quality) => {
          const size = toBlobSizes.length ? toBlobSizes.shift() : 1000
          canvas.lastCall = { type, quality }
          callback(size === null ? null : { size, type })
        }),
      }
      canvases.push(canvas)
      return canvas
    }),
  })
}

function installBitmap(width, height) {
  const bitmap = { width, height, close: vi.fn() }
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap)
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  return { bitmap, createImageBitmap }
}

const jpeg = { name: 'foto.jpg', type: 'image/jpeg' }

beforeEach(() => {
  installCanvas()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resizeCargoPhoto', () => {
  it('lado maior 4000 -> 1600 mantendo a proporção (paisagem)', async () => {
    const { bitmap, createImageBitmap } = installBitmap(4000, 3000)
    const result = await resizeCargoPhoto(jpeg)
    expect(result.width).toBe(1600)
    expect(result.height).toBe(1200)
    expect(result.blob.type).toBe('image/jpeg')
    expect(createImageBitmap).toHaveBeenCalledWith(jpeg, { imageOrientation: 'from-image' })
    const canvas = canvases[0]
    expect([canvas.width, canvas.height]).toEqual([1600, 1200])
    expect(canvas.context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200)
    expect(canvas.lastCall).toEqual({ type: 'image/jpeg', quality: 0.82 })
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('retrato: o lado maior é a altura', async () => {
    installBitmap(3000, 4000)
    const result = await resizeCargoPhoto(jpeg)
    expect([result.width, result.height]).toEqual([1200, 1600])
  })

  it('imagem menor que o limite não é ampliada, mas é recodificada (tira EXIF/GPS)', async () => {
    const { bitmap } = installBitmap(800, 600)
    const result = await resizeCargoPhoto(jpeg)
    expect([result.width, result.height]).toEqual([800, 600])
    expect(canvases[0].context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 800, 600)
    expect(canvases[0].toBlob).toHaveBeenCalledTimes(1)
  })

  it('PNG com transparência: fundo branco antes de desenhar', async () => {
    installBitmap(100, 100)
    await resizeCargoPhoto({ name: 'a.png', type: 'image/png' })
    const { context } = canvases[0]
    expect(context.fillStyle).toBe('white')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 100)
  })

  it('aceita maxEdge e qualidade próprios e nunca gera lado 0', async () => {
    installBitmap(1000, 1)
    const result = await resizeCargoPhoto(jpeg, { maxEdge: 400, quality: 0.5 })
    expect([result.width, result.height]).toEqual([400, 1])
    expect(canvases[0].lastCall.quality).toBe(0.5)
  })

  it('passou de 3 MB: tenta qualidade menor até caber', async () => {
    installBitmap(4000, 3000)
    toBlobSizes.push(4 * 1024 * 1024, 3 * 1024 * 1024, 2 * 1024 * 1024)
    const result = await resizeCargoPhoto(jpeg)
    expect(result.blob.size).toBe(2 * 1024 * 1024)
    expect(canvases[0].toBlob).toHaveBeenCalledTimes(3)
    expect(canvases[0].lastCall.quality).toBe(0.6)
  })

  it('não coube nem na qualidade mínima: erro cargoPhoto/too-large', async () => {
    installBitmap(4000, 3000)
    toBlobSizes.push(...Array.from({ length: 4 }, () => 9 * 1024 * 1024))
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_TOO_LARGE_CODE })
  })

  it('falha de decodificação nos 2 caminhos -> cargoPhoto/unreadable com a mensagem para a logística', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('heic')))
    vi.stubGlobal('Image', undefined)
    await expect(resizeCargoPhoto({ name: 'x.heic', type: 'image/heic' })).rejects.toMatchObject({
      code: CARGO_PHOTO_UNREADABLE_CODE,
      message: CARGO_PHOTO_UNREADABLE_MESSAGE,
    })
  })

  it('toBlob devolvendo null -> cargoPhoto/unreadable', async () => {
    installBitmap(100, 100)
    toBlobSizes.push(null)
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_UNREADABLE_CODE })
  })

  it('sem contexto 2D -> cargoPhoto/unreadable', async () => {
    installBitmap(100, 100)
    document.createElement.mockImplementationOnce(() => ({ getContext: () => null }))
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_UNREADABLE_CODE })
  })

  it('arquivo que não é imagem -> cargoPhoto/not-image, sem tentar decodificar', async () => {
    const { createImageBitmap } = installBitmap(100, 100)
    await expect(resizeCargoPhoto({ name: 'x.pdf', type: 'application/pdf' })).rejects.toMatchObject({
      code: CARGO_PHOTO_NOT_IMAGE_CODE,
    })
    await expect(resizeCargoPhoto(null)).rejects.toMatchObject({ code: CARGO_PHOTO_NOT_IMAGE_CODE })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('libera o bitmap mesmo quando a recodificação falha', async () => {
    const { bitmap } = installBitmap(100, 100)
    toBlobSizes.push(null)
    await expect(resizeCargoPhoto(jpeg)).rejects.toBeTruthy()
    expect(bitmap.close).toHaveBeenCalled()
  })
})

describe('reserva por <img> + decode()', () => {
  function installImage({ width = 2000, height = 1000, failDecode = false } = {}) {
    const instances = []
    class FakeImage {
      constructor() {
        this.naturalWidth = width
        this.naturalHeight = height
        instances.push(this)
      }

      decode() {
        return failDecode ? Promise.reject(new Error('decode')) : Promise.resolve()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto')
    return { instances, revoke }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sem createImageBitmap usa o <img>, respeita o tamanho natural e revoga a URL', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const { instances, revoke } = installImage({ width: 2000, height: 1000 })
    const result = await resizeCargoPhoto(jpeg)
    expect([result.width, result.height]).toEqual([1600, 800])
    expect(instances[0].src).toBe('blob:foto')
    expect(canvases[0].context.drawImage).toHaveBeenCalledWith(instances[0], 0, 0, 1600, 800)
    expect(revoke).toHaveBeenCalledWith('blob:foto')
  })

  it('createImageBitmap que falha cai no <img>', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('x')))
    installImage()
    const result = await resizeCargoPhoto(jpeg)
    expect(result.width).toBe(1600)
  })

  it('<img> que não decodifica: unreadable e a URL é revogada', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const { revoke } = installImage({ failDecode: true })
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_UNREADABLE_CODE })
    expect(revoke).toHaveBeenCalledWith('blob:foto')
  })
})

describe('prepareCargoPhoto', () => {
  it('devolve a foto de 1.600 px e a miniatura de 400 px, decodificando o arquivo uma vez só', async () => {
    const { bitmap, createImageBitmap } = installBitmap(4000, 3000)
    const { full, thumb } = await prepareCargoPhoto(jpeg)
    expect([full.width, full.height]).toEqual([1600, 1200])
    expect([thumb.width, thumb.height]).toEqual([400, 300])
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    expect(canvases).toHaveLength(2)
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('miniatura de foto pequena não amplia', async () => {
    installBitmap(300, 200)
    const { full, thumb } = await prepareCargoPhoto(jpeg)
    expect([full.width, thumb.width]).toEqual([300, 300])
  })

  it('erro de leitura propaga com o código', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('x')))
    vi.stubGlobal('Image', undefined)
    await expect(prepareCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_UNREADABLE_CODE })
  })
})

describe('isCargoPhotoFile', () => {
  it.each([
    [{ type: 'image/jpeg', name: 'a.jpg' }, true],
    [{ type: 'image/heic', name: 'a.heic' }, true],
    [{ type: '', name: 'IMG_0001.HEIC' }, true],
    [{ type: '', name: 'foto.jpeg' }, true],
    [{ type: 'application/pdf', name: 'a.pdf' }, false],
    [{ type: '', name: 'planilha.xlsx' }, false],
    [{ type: '', name: '' }, false],
    [null, false],
  ])('%j -> %s', (file, expected) => {
    expect(isCargoPhotoFile(file)).toBe(expected)
  })
})
