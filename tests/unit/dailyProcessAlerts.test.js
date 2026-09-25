// F17.5a (A-3): cobertura do runner `runDailyProcessAlerts`
// (`functions/src/process/dailyAlerts.js`) contra um fake Firestore escrito
// neste proprio arquivo (`collection(name).doc(id).get()/create()`,
// `collection(name).where(field, op, value).get()` aplicando `!=`/`==`).
// Este arquivo esta em `tests/unit/` (nao entra na contagem fixa do
// `audit-vault-counts`).
//
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mocks, mockFirestoreApi, mockLogger } from '../setup-triggers.js'

vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-admin/messaging', () => mocks.firebaseMessaging())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { runDailyProcessAlerts, buildDailyAlertsNotificationId, DAILY_ALERTS_NOTIFICATION_TYPE } = await import(
  '../../functions/src/process/dailyAlerts.js'
)

const NOW = new Date('2026-09-24T10:00:00Z') // 07:00 BRT
const TODAY_KEY = '2026-09-24'

const ADMIN_ACTIVE = {
  id: 'admin-1',
  role: 'admin',
  status: 'Ativo',
  email: 'admin1@sqquimica.com',
  name: 'Admin Um',
}
const ADMIN_BLOQUEADO = {
  id: 'admin-2',
  role: 'admin',
  status: 'Bloqueado',
  email: 'admin2@sqquimica.com',
  name: 'Admin Bloqueado',
}
const ADMIN_GMAIL = {
  id: 'admin-3',
  role: 'admin',
  status: 'Ativo',
  email: 'admin3@gmail.com',
  name: 'Admin Externo',
}
const ADMIN_SILENCIADO = {
  id: 'admin-4',
  role: 'admin',
  status: 'Ativo',
  email: 'admin4@sqquimica.com',
  name: 'Admin Silenciado',
  notificationPreferences: { processos: { inApp: false } },
}

const FREE_TIME_PROCESS = {
  id: 'proc-ft',
  category: 'FCL',
  freeTimeDays: 7,
  cargoPresenceInformed: true,
  cargoPresenceInformedAt: '2026-09-19T08:00',
  processStatus: 'Aguardando agendamento de coleta',
}

const ARCHIVED_PROCESS = {
  id: 'proc-archived',
  category: 'FCL',
  freeTimeDays: 7,
  cargoPresenceInformed: true,
  cargoPresenceInformedAt: '2026-09-19T08:00',
  processStatus: 'Aguardando agendamento de coleta',
  archived: true,
}

// Fake Firestore local (nao usa `setupFirestoreChain` - precisamos controlar
// `create()` por chamada individual, inclusive rejeitando com codigo
// especifico).
function makeFakeFirestore({ users = [], processes = [], forecastSettings = null, createImpl } = {}) {
  const collectionCalls = []
  const createCalls = []
  const dataByCollection = {
    users,
    processes,
    forecastSettings: forecastSettings ? [{ id: 'current', data: forecastSettings }] : [],
  }

  function applyWhere(docs, whereClauses) {
    return docs.filter((docEntry) => {
      for (const { field, op, value } of whereClauses) {
        if (op === '!=' && docEntry.data[field] === value) return false
        if (op === '==' && docEntry.data[field] !== value) return false
      }
      return true
    })
  }

  function buildCollectionRef(name) {
    let whereClauses = []
    return {
      doc(id) {
        return {
          get: async () => {
            const found = (dataByCollection[name] ?? []).find((docEntry) => docEntry.id === id)
            return { exists: Boolean(found), id, data: () => found?.data }
          },
          create: async (data) => {
            createCalls.push({ collection: name, id, data })
            if (createImpl) return createImpl(id, data)
            return undefined
          },
        }
      },
      where(field, op, value) {
        whereClauses.push({ field, op, value })
        return this
      },
      get: async () => {
        const docs = applyWhere(dataByCollection[name] ?? [], whereClauses)
        whereClauses = []
        return {
          docs: docs.map((docEntry) => ({ id: docEntry.id, data: () => docEntry.data })),
          empty: docs.length === 0,
        }
      },
    }
  }

  return {
    collection(name) {
      collectionCalls.push(name)
      return buildCollectionRef(name)
    },
    collectionCalls,
    createCalls,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFirestoreApi.FieldValue.serverTimestamp.mockReturnValue('SERVER_TIMESTAMP')
})

describe('runDailyProcessAlerts', () => {
  it('1 FCL em D-2 + 1 arquivado + 4 admins (so 1 ativo corporativo com inApp ligado) -> 1 create', async () => {
    const firestore = makeFakeFirestore({
      users: [ADMIN_ACTIVE, ADMIN_BLOQUEADO, ADMIN_GMAIL, ADMIN_SILENCIADO].map((data) => ({ id: data.id, data })),
      processes: [FREE_TIME_PROCESS, ARCHIVED_PROCESS].map((data) => ({ id: data.id, data })),
    })

    const result = await runDailyProcessAlerts({ firestore, now: NOW })

    expect(result).toEqual({ todayKey: TODAY_KEY, alerts: 1, created: 1, skipped: 0 })
    expect(firestore.createCalls).toHaveLength(1)
    const [{ id, data }] = firestore.createCalls
    expect(id).toBe(buildDailyAlertsNotificationId(TODAY_KEY, 'admin-1'))
    expect(data).toMatchObject({
      recipientUserId: 'admin-1',
      type: DAILY_ALERTS_NOTIFICATION_TYPE,
      processId: '',
      isRead: false,
      title: 'Alertas operacionais do dia (1)',
    })
  })

  it('reexecucao no mesmo dia (create rejeita already-exists) -> created 0, skipped 1, sem throw', async () => {
    const firestore = makeFakeFirestore({
      users: [ADMIN_ACTIVE].map((data) => ({ id: data.id, data })),
      processes: [FREE_TIME_PROCESS].map((data) => ({ id: data.id, data })),
      createImpl: async () => {
        const error = new Error('already exists')
        error.code = 6
        throw error
      },
    })

    const result = await runDailyProcessAlerts({ firestore, now: NOW })
    expect(result).toEqual({ todayKey: TODAY_KEY, alerts: 1, created: 0, skipped: 1 })
  })

  it('sem alertas -> nao consulta users e nao cria nada', async () => {
    const firestore = makeFakeFirestore({
      users: [ADMIN_ACTIVE].map((data) => ({ id: data.id, data })),
      processes: [],
    })

    const result = await runDailyProcessAlerts({ firestore, now: NOW })
    expect(result).toEqual({ todayKey: TODAY_KEY, alerts: 0, created: 0, skipped: 0 })
    expect(firestore.collectionCalls).not.toContain('users')
    expect(firestore.createCalls).toHaveLength(0)
  })

  it('forecastSettings.operationalAlerts.clearanceOverdueDays muda o limiar', async () => {
    const clearanceProcess = {
      id: 'proc-clearance',
      category: 'FCL',
      parameterizedAt: '2026-09-20T09:00',
      parameterizationChannel: 'Amarelo',
      processStatus: 'Aguardando registro da DUIMP',
    }

    const firestore = makeFakeFirestore({
      users: [ADMIN_ACTIVE].map((data) => ({ id: data.id, data })),
      processes: [clearanceProcess].map((data) => ({ id: data.id, data })),
      forecastSettings: { operationalAlerts: { clearanceOverdueDays: 10 } },
    })

    const result = await runDailyProcessAlerts({ firestore, now: NOW })
    // 4 dias parametrizado sem desembaraco - com limiar 10 nao alerta mais.
    expect(result.alerts).toBe(0)
    expect(firestore.createCalls).toHaveLength(0)
  })

  it('create rejeitando codigo != already-exists -> lanca depois de tentar todos os admins', async () => {
    const admin5 = { id: 'admin-5', role: 'admin', status: 'Ativo', email: 'admin5@sqquimica.com', name: 'Admin Cinco' }
    const firestore = makeFakeFirestore({
      users: [ADMIN_ACTIVE, admin5].map((data) => ({ id: data.id, data })),
      processes: [FREE_TIME_PROCESS].map((data) => ({ id: data.id, data })),
      createImpl: async () => {
        const error = new Error('permission denied')
        error.code = 13
        throw error
      },
    })

    await expect(runDailyProcessAlerts({ firestore, now: NOW })).rejects.toMatchObject({ code: 13 })
    // tentou os 2 admins antes de lancar.
    expect(firestore.createCalls).toHaveLength(2)
    expect(mockLogger.error).toHaveBeenCalled()
  })
})
