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

  // F17.3a (D-8): chegada/CE/terminal/free time entram na comparacao.
  describe('F17.3a - chegada/CE/terminal/free time (D-8)', () => {
    it('before legado sem as 8 chaves x after com "" /null + migratedApproxFields: [] -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE }
      const after = {
        ...PROCESS_BASE,
        berthedAt: '',
        arrivedAt: '',
        cargoPresenceInformedAt: '',
        ceMercante: '',
        ceHouse: '',
        terminalName: '',
        freeTimeDays: null,
        demurrageDailyRateUsd: null,
        migratedApproxFields: [],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('mudar so ceMercante -> notifica favorito', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, ceMercante: '' }
      const after = {
        ...PROCESS_BASE,
        ceMercante: 'CE-1',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.type).toBe('favorite_process_updated')
    })

    it('mudar so migratedApproxFields -> NAO notifica (marcador tecnico)', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, migratedApproxFields: [] }
      const after = {
        ...PROCESS_BASE,
        migratedApproxFields: ['berthedAt'],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it("freeTimeDays null -> 7 -> notifica", async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, freeTimeDays: null }
      const after = {
        ...PROCESS_BASE,
        freeTimeDays: 7,
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.type).toBe('favorite_process_updated')
    })
  })

  // F17.2b (D-10): `licenses[]` entra na comparacao - o aviso que hoje sai
  // com MAPA nao pode se perder.
  describe('F17.2b - anuencias (D-10)', () => {
    it('admin muda so licenses (status atualizado) -> favorito recebe "anuências atualizadas"', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = {
        ...PROCESS_BASE,
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Em análise' }],
      }
      const after = {
        ...PROCESS_BASE,
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Deferida' }],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.type).toBe('favorite_process_updated')
      expect(payload.body).toContain('anuências atualizadas')
    })

    it('before mapaStatus Liberado / after mapaStatus "" + licenses [LIC-MAPA Deferida] (equivalentes) -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, mapaStatus: 'Liberado' }
      const after = {
        ...PROCESS_BASE,
        mapaStatus: '',
        licenses: [
          {
            id: 'LIC-MAPA',
            agency: 'MAPA',
            lpcoNumber: '',
            status: 'Deferida',
            inspectionScheduledAt: '',
            deferredAt: '',
            notes: '',
          },
        ],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('before mapaStatus "" / after mapaStatus "Aguardando MAPA" sem licenses -> notifica (rollout hosting antigo)', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, mapaStatus: '' }
      const after = {
        ...PROCESS_BASE,
        mapaStatus: 'Aguardando MAPA',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
    })
  })

  // F17.2c (D-9): `purchaseOrders[]`/`items[].poNumber` entram na
  // comparacao; `collectionWindows[].containerId` NAO entra (backfill nao
  // pode disparar aviso espurio).
  describe('F17.2c - purchaseOrders/poNumber/containerId', () => {
    const CONSOLIDATED_BASE = { ...PROCESS_BASE, category: 'CONSOLIDADO', name: 'Consolidado X' }

    it('mudar so purchaseOrders -> favorito recebe "POs do consolidado atualizadas"', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...CONSOLIDATED_BASE, purchaseOrders: ['PO-A'] }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: ['PO-A', 'PO-B'],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.type).toBe('favorite_process_updated')
      expect(payload.body).toContain('POs do consolidado atualizadas')
    })

    it('before sem purchaseOrders / after purchaseOrders: [] -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...CONSOLIDATED_BASE }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('mudar so items[0].poNumber -> notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: ['PO-A', 'PO-B'],
        items: [{ commercialName: 'Item', quantity: 1, poNumber: '' }],
      }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: ['PO-A', 'PO-B'],
        items: [{ commercialName: 'Item', quantity: 1, poNumber: 'PO-A' }],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
    })

    it('mudar so collectionWindows[0].containerId (mesmo containerNumber) -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = {
        ...PROCESS_BASE,
        collectionWindows: [{ id: 'W1', containerNumber: 1, scheduledAt: '2026-01-01T10:00:00.000Z', notes: '' }],
      }
      const after = {
        ...PROCESS_BASE,
        collectionWindows: [
          {
            id: 'W1',
            containerNumber: 1,
            containerId: 'CNT-1',
            scheduledAt: '2026-01-01T10:00:00.000Z',
            notes: '',
          },
        ],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })
  })
})
