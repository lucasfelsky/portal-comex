// Testes do trigger createProcessUpdateNotifications.
// Cobre:
//   - Actor logistica altera postReceiptNotes: notifica admins + favorited (post_receipt_notes_updated)
//   - Actor admin altera processo: notifica favorited (favorite_process_updated) se ha changes significativas
//   - Actor user/pendente: nada
//   - Process removido: ignorado (after vazio)
//   - Sem updatedById/actor: ignorado
//   - Actor inativo: ignorado
//   - Sem postReceiptNotes nem images: logistica NAO notifica
//   - Mudancas cosmeticas (sem hasMeaningfulProcessChanges): admin NAO notifica

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockBatch,
  mockFirestoreApi,
  mocks,
  setupFirestoreChain,
  getHandler,
} from '../setup-triggers.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { createProcessUpdateNotifications } = await import('../../functions/index.js')

const PROCESS_ID = 'proc-1'

const LOGISTICA_USER = {
  id: 'logi-1',
  name: 'Logi da Silva',
  email: 'logi@sqquimica.com',
  role: 'logistica',
  status: 'Ativo',
}

const ADMIN_USER = {
  id: 'admin-1',
  name: 'Admin Root',
  email: 'admin@sqquimica.com',
  role: 'admin',
  status: 'Ativo',
}

const FAVORITER_USER = {
  id: 'fan-1',
  name: 'Carlos Favorito',
  email: 'carlos@sqquimica.com',
  role: 'logistica',
  status: 'Ativo',
  favoriteProcessIds: [PROCESS_ID],
}

const PENDING_USER = {
  id: 'pending-1',
  name: 'Joao Pendente',
  email: 'joao@sqquimica.com',
  role: 'user',
  status: 'Pendente',
}

const PROCESS_BASE = {
  id: PROCESS_ID,
  name: 'PO 12345',
  processNumber: 'PO 12345',
  category: 'FCL',
  processStatus: 'Em Andamento',
}

let handler

beforeEach(() => {
  vi.clearAllMocks()
  handler = getHandler(createProcessUpdateNotifications)
  mockFirestoreApi.batch.mockReturnValue(mockBatch)
  mockBatch.commit.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

function makeEvent(before, after, params = { processId: PROCESS_ID }) {
  return {
    params,
    data: { before: { data: () => before }, after: { data: () => after } },
  }
}

describe('createProcessUpdateNotifications', () => {
  it('logistica altera postReceiptNotes -> admins + favorited recebem (post_receipt_notes_updated)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, postReceiptNotes: '' }
    const after = {
      ...PROCESS_BASE,
      postReceiptNotes: 'Carga descarregada com sucesso',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    // 1 admin + 1 favorited
    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types.every((t) => t === 'post_receipt_notes_updated')).toBe(true)
  })

  it('logistica altera apenas postReceiptImages (notes vazio) -> ainda notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, postReceiptImages: [] }
    const after = {
      ...PROCESS_BASE,
      postReceiptImages: [{ id: 'img-1', url: 'https://...', name: 'foto', mimeType: 'image/jpeg' }],
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(2)
  })

  it('logistica sem postReceiptNotes e sem images -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      // sem postReceiptNotes e sem images
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('admin altera processo com changes significativas -> favorited recebe (favorite_process_updated)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, processStatus: 'Aguardando embarque' }
    const after = {
      ...PROCESS_BASE,
      processStatus: 'Embarcou',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.type).toBe('favorite_process_updated')
    expect(payload.recipientUserId).toBe('fan-1')
  })

  it('admin altera processo sem changes significativas -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    // before e after identicos
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('user comum nao e logistica nem admin -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'pending-1', data: PENDING_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      processStatus: 'Embarcou',
      updatedById: 'pending-1',
      updatedByName: 'Joao Pendente',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('actor inativo (status Bloqueado) -> NAO notifica', async () => {
    const blockedLogi = { ...LOGISTICA_USER, status: 'Bloqueado' }
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: blockedLogi },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, postReceiptNotes: '' }
    const after = {
      ...PROCESS_BASE,
      postReceiptNotes: 'bla',
      updatedById: 'logi-1',
      updatedByName: 'Logi',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('before ou after vazios -> ignora', async () => {
    setupFirestoreChain({
      users: [{ id: 'logi-1', data: LOGISTICA_USER }],
    })
    await handler({
      params: { processId: PROCESS_ID },
      data: { before: { data: () => undefined }, after: { data: () => ({}) } },
    })
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('sem updatedById no after -> ignora', async () => {
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_USER }],
    })
    const before = { ...PROCESS_BASE }
    const after = { ...PROCESS_BASE, processStatus: 'Embarcou' } // sem updatedById
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('favorited igual ao actor -> nao recebe', async () => {
    const logiIsFan = { ...LOGISTICA_USER, favoriteProcessIds: [PROCESS_ID] }
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: logiIsFan },
        { id: 'admin-1', data: ADMIN_USER },
      ],
    })
    const before = { ...PROCESS_BASE, postReceiptNotes: '' }
    const after = {
      ...PROCESS_BASE,
      postReceiptNotes: 'bla',
      updatedById: 'logi-1',
      updatedByName: 'Logi',
    }
    await handler(makeEvent(before, after))
    // Apenas 1 admin recebe. logi (actor == favorited) e' filtrado.
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const recipients = mockBatch.set.mock.calls.map(([, p]) => p.recipientUserId)
    expect(recipients).toEqual(['admin-1'])
  })
})
