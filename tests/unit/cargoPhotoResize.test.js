// S11 (J1): redução da foto de avaria (canvas e createImageBitmap mockados; nada de rede nem de imagem real).
//
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CARGO_PHOTO_HUGE_MESSAGE,
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

  it('PNG com transparência: fundo branco pintado por baixo do desenho', async () => {
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

describe('aparelho real: o que a redução recusa ou preserva (S10-J1b)', () => {
  // Contexto que "desenha" de verdade só quando `drawn` é verdadeiro; senão o canvas segue transparente (aparelho sem
  // memória), como o Safari faz sem avisar.
  function installCanvasWithPixels({ alpha }) {
    const calls = []
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const context = {
          fillStyle: '',
          globalCompositeOperation: 'source-over',
          imageSmoothingQuality: 'low',
          drawImage: vi.fn(() => calls.push('draw')),
          fillRect: vi.fn(() => calls.push(`fill:${context.globalCompositeOperation}`)),
          getImageData: vi.fn(() => ({ data: [0, 0, 0, alpha] })),
        }
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => context,
          toBlob: (callback, type) => callback({ size: 1000, type }),
        }
        return canvas
      }),
    })
    return calls
  }

  it('canvas que ficou transparente (nada desenhado) é recusado como foto ilegível, sem enviar JPEG em branco', async () => {
    installCanvasWithPixels({ alpha: 0 })
    installBitmap(4000, 3000)
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({
      code: CARGO_PHOTO_UNREADABLE_CODE,
      message: CARGO_PHOTO_UNREADABLE_MESSAGE,
    })
  })

  it('canvas desenhado (alfa 255) passa; o fundo branco é pintado POR BAIXO depois do desenho', async () => {
    const calls = installCanvasWithPixels({ alpha: 255 })
    installBitmap(4000, 3000)
    const result = await resizeCargoPhoto(jpeg)
    expect(result.blob.type).toBe('image/jpeg')
    expect(calls).toEqual(['draw', 'fill:destination-over'])
  })

  it('a amostra é uma grade 5 x 5 de pontos dentro do canvas', async () => {
    installCanvasWithPixels({ alpha: 0 })
    installBitmap(11, 7)
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({ code: CARGO_PHOTO_UNREADABLE_CODE })
    const context = document.createElement.mock.results[0].value.getContext()
    expect(context.getImageData).toHaveBeenCalledTimes(25)
    for (const [x, y] of context.getImageData.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(10)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(6)
    }
  })

  it('PNG com transparência só nas bordas e centro opaco: não é confundido com canvas vazio', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const context = {
          fillStyle: '',
          drawImage: vi.fn(),
          fillRect: vi.fn(),
          // Transparente em tudo, menos no ponto central da grade (2, 2).
          getImageData: vi.fn((x, y) => ({ data: [0, 0, 0, x === 5 && y === 5 ? 255 : 0] })),
        }
        return { width: 0, height: 0, getContext: () => context, toBlob: (cb, type) => cb({ size: 1000, type }) }
      }),
    })
    installBitmap(11, 11)
    await expect(resizeCargoPhoto({ name: 'logo.png', type: 'image/png' })).resolves.toMatchObject({ width: 11 })
  })

  it('imagem de origem acima de 150 megapixels não é decodificada: erro cargoPhoto/too-large e bitmap liberado', async () => {
    const { bitmap } = installBitmap(16000, 12000)
    await expect(resizeCargoPhoto(jpeg)).rejects.toMatchObject({
      code: CARGO_PHOTO_TOO_LARGE_CODE,
      message: CARGO_PHOTO_HUGE_MESSAGE,
    })
    expect(bitmap.close).toHaveBeenCalled()
    expect(canvases).toHaveLength(0)
  })

  it('foto de 48 MP (iPhone Pro) está dentro do teto e vira 1.600 px', async () => {
    installBitmap(8064, 6048)
    const result = await resizeCargoPhoto(jpeg)
    expect([result.width, result.height]).toEqual([1600, 1200])
  })

  it('orientação: pede o EXIF ao navegador e, sem a opção (Safari antigo), usa o <img>, que já vem girado', async () => {
    const { createImageBitmap } = installBitmap(4000, 3000)
    await resizeCargoPhoto(jpeg)
    expect(createImageBitmap).toHaveBeenCalledWith(jpeg, { imageOrientation: 'from-image' })

    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new TypeError('Invalid imageOrientation')))
    class FakeImage {
      constructor() {
        this.naturalWidth = 3000
        this.naturalHeight = 4000
      }

      decode() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const result = await resizeCargoPhoto(jpeg)
    expect([result.width, result.height]).toEqual([1200, 1600])
    vi.restoreAllMocks()
  })
})

describe('isCargoPhotoFile: octet-stream com extensão de imagem (S10-J1b)', () => {
  it.each([
    [{ type: 'application/octet-stream', name: 'IMG_1.jpg' }, true],
    [{ type: 'application/octet-stream', name: 'foto.HEIC' }, true],
    [{ type: 'binary/octet-stream', name: 'a.png' }, true],
    [{ type: 'application/octet-stream', name: 'dados.bin' }, false],
    [{ type: 'application/octet-stream', name: 'planilha.xlsx' }, false],
    [{ type: 'text/plain', name: 'foto.jpg' }, false],
    [{ type: 'application/pdf', name: 'foto.jpg' }, false],
  ])('%j -> %s', (file, expected) => {
    expect(isCargoPhotoFile(file)).toBe(expected)
  })

  it('octet-stream com .jpg segue para a decodificação (o conteúdo é validado ali)', async () => {
    installBitmap(100, 100)
    await expect(resizeCargoPhoto({ name: 'IMG_1.jpg', type: 'application/octet-stream' })).resolves.toMatchObject({
      width: 100,
    })
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('x')))
    vi.stubGlobal('Image', undefined)
    await expect(resizeCargoPhoto({ name: 'falso.jpg', type: 'application/octet-stream' })).rejects.toMatchObject({
      code: CARGO_PHOTO_UNREADABLE_CODE,
    })
  })

  it('octet-stream sem extensão de imagem é recusado como não-imagem, sem decodificar', async () => {
    const { createImageBitmap } = installBitmap(100, 100)
    await expect(resizeCargoPhoto({ name: 'dados.bin', type: 'application/octet-stream' })).rejects.toMatchObject({
      code: CARGO_PHOTO_NOT_IMAGE_CODE,
    })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
})
