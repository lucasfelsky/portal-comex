// S11 (J1): regras puras das fotos de avaria da Conferência (caminhos, limites 5/30, fotos não salvas).
//
// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  CARGO_PHOTO_MESSAGES,
  CARGO_PHOTO_CONFERENCE_LIMIT,
  CARGO_PHOTO_JPEG_QUALITY,
  CARGO_PHOTO_MAX_BYTES,
  CARGO_PHOTO_MAX_EDGE,
  CARGO_PHOTO_ROW_LIMIT,
  CARGO_PHOTO_THUMB_EDGE,
  addCargoPhoto,
  admitCargoPhotoFiles,
  buildCargoPhotoPaths,
  cargoPhotoRoom,
  countCargoPhotos,
  countCargoRowsWithPhotoWithoutNote,
  createCargoPhotoId,
  describeCargoPhotoError,
  describeCargoPhotoLimit,
  listUnsavedCargoPhotos,
  removeCargoPhoto,
} from '../../src/features/processes/cargoConferencePhotos.js'
import {
  CARGO_PHOTOS_PER_CONFERENCE,
  CARGO_PHOTOS_PER_ROW,
  CARGO_PHOTO_ID_PATTERN,
} from '../../src/features/processes/cargoConferenceIssues.js'

function photo(id) {
  return {
    id,
    path: `processes/p1/cargo-conference/r-1/1-u-${id}.jpg`,
    thumbPath: `processes/p1/cargo-conference/r-1/1-u-${id}-t.jpg`,
    width: 1600,
    height: 1200,
    size: 1,
    uploadedAt: 1,
    byId: 'u',
  }
}

function conferenceWith(counts) {
  let next = 0
  return {
    damageByRowId: Object.fromEntries(
      Object.entries(counts).map(([rowId, n]) => [
        rowId,
        { flagged: true, note: '', photos: Array.from({ length: n }, () => photo(`f${next++}`)) },
      ])
    ),
  }
}

describe('constantes', () => {
  it('limites e padrão do id vêm do modelo da conferência (mesma fonte)', () => {
    expect(CARGO_PHOTO_ROW_LIMIT).toBe(CARGO_PHOTOS_PER_ROW)
    expect(CARGO_PHOTO_CONFERENCE_LIMIT).toBe(CARGO_PHOTOS_PER_CONFERENCE)
    expect(createCargoPhotoId()).toMatch(CARGO_PHOTO_ID_PATTERN)
  })

  it('1.600 px, miniatura 400 px, qualidade 0,82, menos de 3 MB, 5 por item e 30 por conferência', () => {
    expect(CARGO_PHOTO_MAX_EDGE).toBe(1600)
    expect(CARGO_PHOTO_THUMB_EDGE).toBe(400)
    expect(CARGO_PHOTO_JPEG_QUALITY).toBe(0.82)
    expect(CARGO_PHOTO_MAX_BYTES).toBe(3 * 1024 * 1024)
    expect(CARGO_PHOTO_ROW_LIMIT).toBe(5)
    expect(CARGO_PHOTO_CONFERENCE_LIMIT).toBe(30)
  })
})

describe('createCargoPhotoId', () => {
  it('gera ids no formato aceito pelo doc (A-Z a-z 0-9 _ -, até 40) e diferentes entre si', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCargoPhotoId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
  })

  it('sem crypto.randomUUID ainda gera um id válido', () => {
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(createCargoPhotoId()).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true })
    }
  })
})

describe('buildCargoPhotoPaths', () => {
  it('foto e miniatura na pasta da linha, com o uid no nome (exigido pelas storage.rules)', () => {
    const { path, thumbPath } = buildCargoPhotoPaths({
      processId: 'p1', rowId: 'r-abc', uid: 'log-1', photoId: 'photo1', now: 1700000000000,
    })
    expect(path).toBe('processes/p1/cargo-conference/r-abc/1700000000000-log-1-photo1.jpg')
    expect(thumbPath).toBe('processes/p1/cargo-conference/r-abc/1700000000000-log-1-photo1-t.jpg')
    const fileName = path.split('/').pop()
    expect(fileName).toMatch(/^[0-9]+-log-1-[\w.-]+$/)
  })

  it('sanea os segmentos para [\\w-] (barra, ponto e espaço não escapam da pasta)', () => {
    const { path } = buildCargoPhotoPaths({
      processId: 'p-1', rowId: '../x/y z', uid: 'u.1', photoId: 'abc', now: 5,
    })
    expect(path).toBe('processes/p-1/cargo-conference/-x-y-z/5-u-1-abc.jpg')
    expect(path.split('/')).toHaveLength(5)
    expect(path).not.toContain('..')
  })

  it('aceita Date em now', () => {
    const { path } = buildCargoPhotoPaths({ processId: 'p', rowId: 'r', uid: 'u', photoId: 'a', now: new Date(7) })
    expect(path).toBe('processes/p/cargo-conference/r/7-u-a.jpg')
  })

  it.each([
    [{ processId: '', rowId: 'r', uid: 'u', photoId: 'a' }],
    [{ processId: 'p 1', rowId: 'r', uid: 'u', photoId: 'a' }],
    [{ processId: 'p.1', rowId: 'r', uid: 'u', photoId: 'a' }],
    [{ processId: '../p', rowId: 'r', uid: 'u', photoId: 'a' }],
    [{ processId: 'p'.repeat(129), rowId: 'r', uid: 'u', photoId: 'a' }],
    [{ processId: 'p', rowId: '  ', uid: 'u', photoId: 'a' }],
    [{ processId: 'p', rowId: 'r', uid: '', photoId: 'a' }],
    [{ processId: 'p', rowId: 'r', uid: 'u', photoId: 'a/b' }],
    [{ processId: 'p', rowId: 'r', uid: 'u', photoId: 'x'.repeat(41) }],
    [{ processId: 'p', rowId: 'r', uid: 'u', photoId: 'a', now: -1 }],
    [{ processId: 'p', rowId: 'r', uid: 'u', photoId: 'a', now: 'x' }],
    [undefined],
  ])('entrada inválida %j lança erro', (input) => {
    expect(() => buildCargoPhotoPaths(input)).toThrow()
  })
})

describe('contagem e limites (5 por item, 30 na conferência)', () => {
  it('countCargoPhotos soma todas as linhas e tolera doc sem o mapa', () => {
    expect(countCargoPhotos(conferenceWith({ a: 2, b: 3 }))).toBe(5)
    expect(countCargoPhotos({})).toBe(0)
    expect(countCargoPhotos(null)).toBe(0)
    expect(countCargoPhotos({ damageByRowId: { a: { photos: 'x' } } })).toBe(0)
  })

  it('a 5ª foto entra e a 6ª não (por item)', () => {
    expect(cargoPhotoRoom(conferenceWith({ a: 4 }), 'a').row).toBe(1)
    expect(cargoPhotoRoom(conferenceWith({ a: 5 }), 'a').row).toBe(0)
    expect(cargoPhotoRoom(conferenceWith({ a: 4 }), 'outra').row).toBe(5)
  })

  it('a 31ª foto não entra (total), contando as em envio de qualquer linha', () => {
    const conference = conferenceWith({ a: 5, b: 5, c: 5, d: 5, e: 5 })
    expect(cargoPhotoRoom(conference, 'f').total).toBe(5)
    expect(cargoPhotoRoom(conference, 'f', { f: 4 })).toEqual({ row: 1, total: 1 })
    expect(cargoPhotoRoom(conference, 'f', { f: 3, g: 2 }).total).toBe(0)
    expect(cargoPhotoRoom(conference, 'f', { f: 5, g: 5 }).total).toBe(0)
  })

  it('envio em andamento ocupa vaga do item; valores estranhos de pendência são ignorados', () => {
    const conference = conferenceWith({ a: 3 })
    expect(cargoPhotoRoom(conference, 'a', { a: 2 }).row).toBe(0)
    expect(cargoPhotoRoom(conference, 'a', { a: -4, b: 'x', c: NaN }).row).toBe(2)
    expect(cargoPhotoRoom(conference, 'a', null).row).toBe(2)
  })

  it('describeCargoPhotoLimit explica o botão desabilitado', () => {
    expect(describeCargoPhotoLimit({ row: 2, total: 9 })).toBe('')
    expect(describeCargoPhotoLimit({ row: 0, total: 9 })).toBe('Limite de 5 fotos por item atingido.')
    expect(describeCargoPhotoLimit({ row: 3, total: 0 })).toBe('Limite de 30 fotos por conferência atingido.')
    expect(describeCargoPhotoLimit({ row: 0, total: 0 })).toBe('Limite de 30 fotos por conferência atingido.')
  })
})

describe('admitCargoPhotoFiles', () => {
  const files = (n) => Array.from({ length: n }, (_, i) => ({ name: `f${i}.jpg` }))

  it('escolher 3 com 1 vaga: entra 1 (a primeira) e o aviso diz as 2 que ficaram de fora', () => {
    const result = admitCargoPhotoFiles(files(3), { row: 1, total: 20 })
    expect(result.accepted.map((file) => file.name)).toEqual(['f0.jpg'])
    expect(result.rejected).toBe(2)
    expect(result.message).toBe('2 fotos não entraram: limite de 5 por item.')
  })

  it('1 foto fora, no singular', () => {
    expect(admitCargoPhotoFiles(files(2), { row: 1, total: 1 }).message).toBe('1 foto não entrou: limite de 5 por item.')
  })

  it('limite da conferência quando é ele que aperta', () => {
    expect(admitCargoPhotoFiles(files(3), { row: 4, total: 1 }).message).toBe(
      '2 fotos não entraram: limite de 30 por conferência.'
    )
  })

  it('cabendo tudo: sem aviso; sem vaga: nenhuma entra', () => {
    expect(admitCargoPhotoFiles(files(2), { row: 5, total: 30 })).toEqual({
      accepted: files(2), rejected: 0, message: '',
    })
    const none = admitCargoPhotoFiles(files(2), { row: 0, total: 5 })
    expect(none.accepted).toEqual([])
    expect(none.rejected).toBe(2)
  })

  it('aceita lista vazia, null e FileList-like', () => {
    expect(admitCargoPhotoFiles([], { row: 1, total: 1 }).accepted).toEqual([])
    expect(admitCargoPhotoFiles(null, { row: 1, total: 1 }).accepted).toEqual([])
    expect(admitCargoPhotoFiles({ 0: files(1)[0], length: 1 }, { row: 1, total: 1 }).accepted).toHaveLength(1)
  })
})

describe('listUnsavedCargoPhotos', () => {
  it('devolve as fotos do estado que não estão no que foi gravado', () => {
    const saved = { damageByRowId: { a: { flagged: true, note: '', photos: [photo('x1')] } } }
    const current = {
      damageByRowId: {
        a: { flagged: true, note: '', photos: [photo('x1'), photo('x2')] },
        b: { flagged: false, note: '', photos: [photo('x3')] },
      },
    }
    expect(listUnsavedCargoPhotos(current, saved).map((item) => item.id)).toEqual(['x2', 'x3'])
  })

  it('foto removida do estado não aparece; sem gravação anterior, todas são não salvas', () => {
    const saved = conferenceWith({ a: 2 })
    expect(listUnsavedCargoPhotos({ damageByRowId: {} }, saved)).toEqual([])
    expect(listUnsavedCargoPhotos(conferenceWith({ a: 2 }), null)).toHaveLength(2)
    expect(listUnsavedCargoPhotos(null, null)).toEqual([])
  })
})

describe('addCargoPhoto / removeCargoPhoto (S10-J1b)', () => {
  const empty = { damageByRowId: {}, palletsByRowId: {}, countOkByRowId: {} }

  it('a foto entra no item, que passa a "avaria registrada" (flagged), sem mexer na observação', () => {
    const base = { ...empty, damageByRowId: { a: { flagged: false, note: 'Caixa amassada', photos: [] } } }
    const next = addCargoPhoto(base, 'a', photo('f1'))
    expect(next.damageByRowId.a).toEqual({ flagged: true, note: 'Caixa amassada', photos: [photo('f1')] })
    expect(base.damageByRowId.a.photos).toEqual([])
  })

  it('item sem entrada ganha a entrada; as outras linhas ficam como estão', () => {
    const base = { ...empty, damageByRowId: { b: { flagged: true, note: 'x', photos: [photo('f9')] } } }
    const next = addCargoPhoto(base, 'a', photo('f1'))
    expect(Object.keys(next.damageByRowId).sort()).toEqual(['a', 'b'])
    expect(next.damageByRowId.b).toBe(base.damageByRowId.b)
  })

  it('a 5ª foto do item entra e a 6ª não (devolve o mesmo objeto)', () => {
    let current = empty
    for (let index = 1; index <= CARGO_PHOTOS_PER_ROW; index += 1) current = addCargoPhoto(current, 'a', photo(`f${index}`))
    expect(current.damageByRowId.a.photos).toHaveLength(5)
    expect(addCargoPhoto(current, 'a', photo('f6'))).toBe(current)
  })

  it('a 31ª foto da conferência não entra, mesmo em outro item com vaga', () => {
    const full = conferenceWith({ a: 5, b: 5, c: 5, d: 5, e: 5, f: 5 })
    expect(countCargoPhotos(full)).toBe(CARGO_PHOTOS_PER_CONFERENCE)
    expect(addCargoPhoto(full, 'g', photo('novo'))).toBe(full)
  })

  it('id repetido e foto vazia não entram', () => {
    const base = addCargoPhoto(empty, 'a', photo('f1'))
    expect(addCargoPhoto(base, 'a', photo('f1'))).toBe(base)
    expect(addCargoPhoto(base, 'a', null)).toBe(base)
  })

  it('remover tira só a foto pedida; o item com observação continua; foto inexistente não muda nada', () => {
    const base = {
      ...empty,
      damageByRowId: { a: { flagged: true, note: 'Molhada', photos: [photo('f1'), photo('f2')] } },
    }
    const next = removeCargoPhoto(base, 'a', 'f1')
    expect(next.damageByRowId.a.photos.map((item) => item.id)).toEqual(['f2'])
    expect(next.damageByRowId.a.note).toBe('Molhada')
    expect(removeCargoPhoto(base, 'a', 'nao-existe')).toBe(base)
    expect(removeCargoPhoto(base, 'zz', 'f1')).toBe(base)
  })

  it('remover a última foto de item sem avaria marcada e sem nota apaga a entrada', () => {
    const base = { ...empty, damageByRowId: { a: { flagged: false, note: '', photos: [photo('f1')] } } }
    expect(removeCargoPhoto(base, 'a', 'f1').damageByRowId).toEqual({})
  })
})

describe('countCargoRowsWithPhotoWithoutNote', () => {
  it('conta só itens com foto e sem observação escrita', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const conference = {
      damageByRowId: {
        a: { flagged: true, note: '', photos: [photo('1')] },
        b: { flagged: true, note: '   ', photos: [photo('2')] },
        c: { flagged: true, note: 'Molhada', photos: [photo('3')] },
        d: { flagged: true, note: '', photos: [] },
      },
    }
    expect(countCargoRowsWithPhotoWithoutNote(rows, conference)).toBe(2)
    expect(countCargoRowsWithPhotoWithoutNote([], conference)).toBe(0)
    expect(countCargoRowsWithPhotoWithoutNote(null, {})).toBe(0)
  })
})

describe('describeCargoPhotoError', () => {
  it('cancelamento de propósito não é erro', () => {
    expect(describeCargoPhotoError({ code: 'storage/canceled' })).toBeNull()
  })

  it('erro da leitura da foto traz o próprio texto e não adianta tentar de novo', () => {
    const error = Object.assign(new Error('Não foi possível ler esta foto.'), { code: 'cargoPhoto/unreadable' })
    expect(describeCargoPhotoError(error)).toEqual({ text: 'Não foi possível ler esta foto.', retryable: false })
  })

  it.each([
    [{ code: 'unavailable' }],
    [{ code: 'storage/retry-limit-exceeded' }],
    [{ code: 'storage/unknown' }],
    [new TypeError('Failed to fetch')],
    [new TypeError('Load failed')],
  ])('falha de rede (%j) vira a mensagem de sem conexão com nova tentativa', (error) => {
    expect(describeCargoPhotoError(error)).toEqual({ text: CARGO_PHOTO_MESSAGES.offline, retryable: true })
  })

  it('sem permissão, sessão expirada e erro desconhecido têm texto próprio e permitem tentar de novo', () => {
    expect(describeCargoPhotoError({ code: 'storage/unauthorized' })).toEqual({
      text: CARGO_PHOTO_MESSAGES.permission,
      retryable: true,
    })
    expect(describeCargoPhotoError({ code: 'storage/unauthenticated' })).toEqual({
      text: CARGO_PHOTO_MESSAGES.session,
      retryable: true,
    })
    expect(describeCargoPhotoError(new Error('boom'))).toEqual({ text: CARGO_PHOTO_MESSAGES.generic, retryable: true })
    expect(CARGO_PHOTO_MESSAGES.offline).toBe(
      'Sem conexão. A foto não foi enviada: confira o sinal e toque em Tentar de novo.'
    )
  })
})
