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
import { normalizeContainers } from '../../src/features/processes/containers.js'

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

  // F17.2d-1 (D-6, Q4): carga perigosa POR ITEM - defaults na comparacao
  // evitam notificacao espuria no 1o save de legado; classificar/alterar um
  // item notifica.
  it('legado sem chaves IMO no item x 1o save esparso (sem classificar) -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      items: [{ commercialName: 'Resina', quantity: 10 }],
    }
    const after = {
      ...PROCESS_BASE,
      items: [{ commercialName: 'Resina', quantity: 10 }],
      transshipmentEtd: '',
      volumeM3: 0,
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('item passa a dangerousGoods/imoClass -> notifica com "itens vinculados atualizados"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      items: [{ commercialName: 'Resina', quantity: 10 }],
    }
    const after = {
      ...PROCESS_BASE,
      items: [{ commercialName: 'Resina', quantity: 10, dangerousGoods: true, imoClass: '3' }],
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('itens vinculados atualizados')
  })

  it('so a flag dangerousGoods de processo muda (derivacao) -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, dangerousGoods: false }
    const after = {
      ...PROCESS_BASE,
      dangerousGoods: true,
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

  // F17.3b (D-8): DUIMP completa (numero + datas), conferencia, exigencia.
  describe('F17.3b - DUIMP completa (D-8)', () => {
    it('before legado sem as 6 chaves x after com "" /false -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE }
      const after = {
        ...PROCESS_BASE,
        duimpNumber: '',
        duimpRegisteredAt: '',
        parameterizedAt: '',
        customsInspectionScheduledAt: '',
        customsRequirement: false,
        customsRequirementNotes: '',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('legado duimpStatus "Parametrizada" x mesmo valor + 6 chaves vazias -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, duimpStatus: 'Parametrizada' }
      const after = {
        ...PROCESS_BASE,
        duimpStatus: 'Parametrizada',
        duimpNumber: '',
        duimpRegisteredAt: '',
        parameterizedAt: '',
        customsInspectionScheduledAt: '',
        customsRequirement: false,
        customsRequirementNotes: '',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('mudar so duimpNumber -> notifica favorito', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, duimpNumber: '' }
      const after = {
        ...PROCESS_BASE,
        duimpNumber: 'DU-2026-001',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.type).toBe('favorite_process_updated')
    })

    it('customsRequirement false -> true -> notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...PROCESS_BASE, customsRequirement: false }
      const after = {
        ...PROCESS_BASE,
        customsRequirement: true,
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
    it('admin muda so licenses (status atualizado para Deferida) -> favorito recebe "anuência MAPA deferida"', async () => {
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
      expect(payload.body).toContain('anuência MAPA deferida')
      expect(payload.body).not.toContain('anuências atualizadas')
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

    // F17.2d-2 (D-5, Q6/Q1): objetos {po, reference, supplierName}.
    it('before strings x after objetos com os mesmos po -> NAO notifica (1o save)', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...CONSOLIDATED_BASE, purchaseOrders: ['PO-A', 'PO-B'] }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [
          { po: 'PO-A', reference: '', supplierName: 'ACME' },
          { po: 'PO-B', reference: '', supplierName: 'ACME' },
        ],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('so reference/supplierName mudam (mesmo po) -> NAO notifica', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: '' }],
      }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [{ po: 'PO-A', reference: 'REF-1', supplierName: 'ACME' }],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })

    it('PO nova em objetos -> "POs do consolidado atualizadas"', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: '' }],
      }
      const after = {
        ...CONSOLIDATED_BASE,
        purchaseOrders: [
          { po: 'PO-A', reference: '', supplierName: '' },
          { po: 'PO-B', reference: '', supplierName: '' },
        ],
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      const [, payload] = mockBatch.set.mock.calls[0]
      expect(payload.body).toContain('POs do consolidado atualizadas')
    })

    it('supplierName de processo ACME -> "" (Q1) NAO notifica (nao entra na comparacao)', async () => {
      setupFirestoreChain({
        users: [
          { id: 'admin-1', data: ADMIN_USER },
          { id: 'fan-1', data: FAVORITER_USER },
        ],
      })
      const before = { ...CONSOLIDATED_BASE, supplierName: 'ACME' }
      const after = {
        ...CONSOLIDATED_BASE,
        supplierName: '',
        updatedById: 'admin-1',
        updatedByName: 'Admin Root',
      }
      await handler(makeEvent(before, after))
      expect(mockBatch.set).not.toHaveBeenCalled()
    })
  })
})

// F17.4a (D-8): notificacao `collection_status_updated` quando a LOGISTICA
// muda `collectionStatus` (admins + favoritos).
describe('F17.4a - collection_status_updated (D-8)', () => {
  it('(a) logistica "Coleta Agendada" -> "Carga a caminho do CD": admin + favorito recebem, body cita o status novo', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Coleta Agendada' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga a caminho do CD',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    expect(payloads.every((p) => p.type === 'collection_status_updated')).toBe(true)
    expect(payloads.map((p) => p.recipientUserId).sort()).toEqual(['admin-1', 'fan-1'])
    expect(payloads.every((p) => p.body.includes('Carga a caminho do CD'))).toBe(true)
  })

  it('(b) logistica "Carga recebida" -> "Carga recebida, em conferência" (mesmo canonico): NADA', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga recebida' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('(c) logistica altera so postReceiptNotes: so post_receipt_notes_updated, sem collection_status_updated', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga recebida, em conferência', postReceiptNotes: '' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      postReceiptNotes: 'Carga descarregada com sucesso',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types.every((t) => t === 'post_receipt_notes_updated')).toBe(true)
    expect(types).not.toContain('collection_status_updated')
  })

  it('(d) admin muda collectionStatus: nenhum collection_status_updated (so favorite_process_updated)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Coleta Agendada' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga a caminho do CD',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).not.toContain('collection_status_updated')
  })

  it('(e) admin, before "Carga em Conferência/Etiquetagem" x after "Carga recebida, em conferência" e resto igual: NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga em Conferência/Etiquetagem' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('(f) favorito == ator: nao recebe', async () => {
    const LOGISTICA_FAVORITER = {
      id: 'logi-1',
      name: 'Logi da Silva',
      email: 'logi@sqquimica.com',
      role: 'logistica',
      status: 'Ativo',
      favoriteProcessIds: [PROCESS_ID],
    }
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_FAVORITER },
        { id: 'admin-1', data: ADMIN_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Coleta Agendada' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga a caminho do CD',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    const recipients = mockBatch.set.mock.calls.map(([, payload]) => payload.recipientUserId)
    expect(recipients).not.toContain('logi-1')
  })

  it('(g) body com "Veículo no CD para descarga" exibe "Carga sendo descarregada"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga a caminho do CD' }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Veículo no CD para descarga',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    expect(payloads.every((p) => p.body.includes('Carga sendo descarregada'))).toBe(true)
  })
})

// F17.4b (B-6): notificacao `receipt_divergence_reported` (admin + favoritos,
// COM e-mail) na transicao false->true da divergencia no recebimento.
describe('F17.4b - receipt_divergence_reported (B-6)', () => {
  it('(a) logistica marca divergencia -> admin + favorito recebem, body contem o tipo', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga recebida, em conferência', receiptDivergence: false }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      receiptDivergence: true,
      receiptDivergenceType: 'Avaria',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    expect(payloads.every((p) => p.type === 'receipt_divergence_reported')).toBe(true)
    expect(payloads.map((p) => p.recipientUserId).sort()).toEqual(['admin-1', 'fan-1'])
    expect(payloads.every((p) => p.body.includes('Avaria'))).toBe(true)
  })

  it('(b) admin marca divergencia -> outro admin + favorito recebem receipt_divergence_reported (nao favorite_process_updated)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'admin-2', data: { id: 'admin-2', name: 'Admin Dois', email: 'admin2@sqquimica.com', role: 'admin', status: 'Ativo' } },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Carga recebida, em conferência', receiptDivergence: false }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      receiptDivergence: true,
      receiptDivergenceType: 'Falta',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types.every((t) => t === 'receipt_divergence_reported')).toBe(true)
    expect(types).not.toContain('favorite_process_updated')
  })

  it('(c) logistica muda status E marca divergencia no mesmo write: so receipt_divergence_reported por destinatario', async () => {
    setupFirestoreChain({
      users: [
        { id: 'logi-1', data: LOGISTICA_USER },
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, collectionStatus: 'Coleta Agendada', receiptDivergence: false }
    const after = {
      ...PROCESS_BASE,
      collectionStatus: 'Carga recebida, em conferência',
      receiptDivergence: true,
      receiptDivergenceType: 'Sobra',
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    expect(mockBatch.set).toHaveBeenCalledTimes(2)
    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    for (const recipientUserId of ['admin-1', 'fan-1']) {
      const forRecipient = payloads.filter((p) => p.recipientUserId === recipientUserId)
      expect(forRecipient).toHaveLength(1)
      expect(forRecipient[0].type).toBe('receipt_divergence_reported')
    }
  })

  it('(d) legado sem as chaves x after com false/""/"" e resto igual, ator admin: NENHUMA notificacao', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE }
    const after = {
      ...PROCESS_BASE,
      receiptDivergence: false,
      receiptDivergenceType: '',
      receiptDivergenceNotes: '',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('(e) flag ja true, admin muda so as notas: favorite_process_updated com "divergência no recebimento atualizada"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      receiptDivergence: true,
      receiptDivergenceType: 'Avaria',
      receiptDivergenceNotes: 'nota antiga',
    }
    const after = {
      ...PROCESS_BASE,
      receiptDivergence: true,
      receiptDivergenceType: 'Avaria',
      receiptDivergenceNotes: 'nota nova',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))

    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    expect(payloads).toHaveLength(1)
    expect(payloads[0].type).toBe('favorite_process_updated')
    expect(payloads[0].body).toContain('divergência no recebimento atualizada')
  })

  it('(f) ator = favorito: nao recebe a propria notificacao', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, receiptDivergence: false }
    const after = {
      ...PROCESS_BASE,
      receiptDivergence: true,
      receiptDivergenceType: 'Avaria',
      updatedById: 'fan-1',
      updatedByName: 'Carlos Favorito',
    }
    await handler(makeEvent(before, after))

    const recipients = mockBatch.set.mock.calls.map(([, payload]) => payload.recipientUserId)
    expect(recipients).not.toContain('fan-1')
  })

  it('(g) mudar so containers[].returnedAt (admin): nenhuma notificacao', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, containers: [{ id: 'CNT-1', returnedAt: '' }] }
    const after = {
      ...PROCESS_BASE,
      containers: [{ id: 'CNT-1', returnedAt: '2026-09-10' }],
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })
})

// F17.5a (A-7): notificacao `license_rejected` (admins, COM e-mail) na
// TRANSICAO de uma anuencia para `Indeferida` (L33).
describe('F17.5a - license_rejected (A-7)', () => {
  const ADMIN_1 = { id: 'admin-1', name: 'Admin Um', email: 'admin1@sqquimica.com', role: 'admin', status: 'Ativo' }
  const ADMIN_2 = { id: 'admin-2', name: 'Admin Dois', email: 'admin2@sqquimica.com', role: 'admin', status: 'Ativo' }

  it('(a) admin-2 muda LIC-1 ANVISA "Em análise" -> "Indeferida": admin-1 recebe, ator nao', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_1 },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }],
    }
    const after = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }],
      updatedById: 'admin-2',
      updatedByName: 'Admin Dois',
    }
    await handler(makeEvent(before, after))

    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    const licenseRejected = payloads.filter((p) => p.type === 'license_rejected')
    expect(licenseRejected).toHaveLength(1)
    expect(licenseRejected[0].recipientUserId).toBe('admin-1')
    expect(licenseRejected[0].body).toContain('ANVISA')
    expect(licenseRejected[0].body).toContain('indeferida')
    expect(payloads.some((p) => p.recipientUserId === 'admin-2')).toBe(false)
  })

  it('(b) favorito nao-admin no mesmo write recebe favorite_process_updated (nao license_rejected)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_1 },
        { id: 'admin-2', data: ADMIN_2 },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }],
    }
    const after = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }],
      updatedById: 'admin-2',
      updatedByName: 'Admin Dois',
    }
    await handler(makeEvent(before, after))

    const payloads = mockBatch.set.mock.calls.map(([, payload]) => payload)
    const favoriteNotification = payloads.find((p) => p.recipientUserId === 'fan-1')
    expect(favoriteNotification).toBeTruthy()
    expect(favoriteNotification.type).toBe('favorite_process_updated')
    expect(favoriteNotification.body).toContain('anuência ANVISA indeferida')
  })

  it('(c) re-salvar com "Indeferida" -> "Indeferida" + outra mudanca: nenhum license_rejected', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_1 },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }],
    }
    const after = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }],
      eta: '2026-10-01',
      updatedById: 'admin-2',
      updatedByName: 'Admin Dois',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).not.toContain('license_rejected')
  })

  it('(d) legado MAPA (mapaStatus, sem licenses) -> licenses "Deferida": nenhum license_rejected', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_1 },
        { id: 'admin-2', data: ADMIN_2 },
      ],
    })
    const before = { ...PROCESS_BASE, mapaStatus: 'Aguardando MAPA' }
    const after = {
      ...PROCESS_BASE,
      mapaStatus: 'Liberado',
      updatedById: 'admin-2',
      updatedByName: 'Admin Dois',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).not.toContain('license_rejected')
  })

  it('(e) ator logistica com licenses diferente: nenhum license_rejected (so admin edita licenses)', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_1 },
        { id: 'logi-1', data: LOGISTICA_USER },
      ],
    })
    const before = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }],
    }
    const after = {
      ...PROCESS_BASE,
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Indeferida' }],
      updatedById: 'logi-1',
      updatedByName: 'Logi da Silva',
    }
    await handler(makeEvent(before, after))

    const types = mockBatch.set.mock.calls.map(([, payload]) => payload.type)
    expect(types).not.toContain('license_rejected')
  })
})

// F17.5b: resumo nomeando marcos + L34 (BL/AWB/navio/viagem/voo/containers/
// shippedAt passam a notificar, so' texto - sem valores no corpo).
describe('F17.5b - resumo nomeando marcos + L34', () => {
  it('(a) status Aguardando embarque->Embarcou + shippedAt preenchido -> "embarque confirmado" sem "status alterado"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, processStatus: 'Aguardando embarque', shippedAt: '' }
    const after = {
      ...PROCESS_BASE,
      processStatus: 'Embarcou',
      shippedAt: '2026-09-10',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('embarque confirmado')
    expect(payload.body).not.toContain('status alterado')
  })

  it('(b) so masterBl muda -> "BL atualizado" sem o valor do BL no corpo', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, masterBl: '' }
    const after = {
      ...PROCESS_BASE,
      masterBl: 'MBL-12345',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('BL atualizado')
    expect(payload.body).not.toContain('MBL-12345')
  })

  it('(c) AEREO so mawb muda -> "AWB atualizado"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, category: 'AEREO', mawb: '' }
    const after = {
      ...PROCESS_BASE,
      category: 'AEREO',
      mawb: 'MAWB-1',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('AWB atualizado')
  })

  it('(d) so vesselName muda -> "navio/viagem atualizados"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, vesselName: '' }
    const after = {
      ...PROCESS_BASE,
      vesselName: 'MSC Rio',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('navio/viagem atualizados')
  })

  it('(e) AEREO so flightNumber muda -> "voo atualizado"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, category: 'AEREO', flightNumber: '' }
    const after = {
      ...PROCESS_BASE,
      category: 'AEREO',
      flightNumber: 'LA-800',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('voo atualizado')
  })

  it('(f) so containers[0].number muda -> "contêineres atualizados" sem o numero no corpo', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, containers: [{ id: 'CNT-1', number: '' }] }
    const after = {
      ...PROCESS_BASE,
      containers: [{ id: 'CNT-1', number: 'MSCU1234567' }],
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('contêineres atualizados')
    expect(payload.body).not.toContain('MSCU1234567')
  })

  it('(g) shippedAt preenchido editado -> "data de embarque atualizada"', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, shippedAt: '2026-09-10' }
    const after = {
      ...PROCESS_BASE,
      shippedAt: '2026-09-12',
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).toHaveBeenCalledTimes(1)
    const [, payload] = mockBatch.set.mock.calls[0]
    expect(payload.body).toContain('data de embarque atualizada')
  })

  it('(h) paridade legado: sem chaves L34 x 1o save com as chaves vazias/containers expandidos -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, containerQuantity: 2 }
    const after = {
      ...PROCESS_BASE,
      containerQuantity: 2,
      shippedAt: '',
      masterBl: '',
      houseBl: '',
      mawb: '',
      hawb: '',
      vesselName: '',
      voyage: '',
      flightNumber: '',
      containers: normalizeContainers(undefined, { category: 'FCL', containerQuantity: 2 }),
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })

  it('(i) containers com numero equivalente (case/formatacao) -> NAO notifica', async () => {
    setupFirestoreChain({
      users: [
        { id: 'admin-1', data: ADMIN_USER },
        { id: 'fan-1', data: FAVORITER_USER },
      ],
    })
    const before = { ...PROCESS_BASE, containers: [{ id: 'CNT-1', number: 'mscu 123456-7' }] }
    const after = {
      ...PROCESS_BASE,
      containers: [{ id: 'CNT-1', number: 'MSCU1234567' }],
      updatedById: 'admin-1',
      updatedByName: 'Admin Root',
    }
    await handler(makeEvent(before, after))
    expect(mockBatch.set).not.toHaveBeenCalled()
  })
})
