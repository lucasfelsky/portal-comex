// Testes do job agendado sendDailyProcessAlerts (F17.5a, A-4).
// Cobre:
//   - Metadados do schedule trigger (cron, timezone, retryConfig, regiao,
//     required API do Cloud Scheduler)
//   - Happy path: processes com 1 alerta -> cria a notificacao do resumo
//   - Sem processos: nenhum create

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockFirestoreApi, mocks, setupFirestoreChain } from '../setup-triggers.js'
import { addDaysToKey, getSaoPauloDateKey } from '../../functions/src/process/operationalAlerts.js'

vi.mock('firebase-admin/app', () => mocks.firebaseApp)
vi.mock('firebase-admin/auth', () => mocks.firebaseAuth)
vi.mock('firebase-admin/firestore', () => mocks.firebaseFirestore())
vi.mock('firebase-functions/v2/firestore', () => mocks.firebaseFirestoreTriggers())
vi.mock('firebase-functions/v2/https', () => mocks.firebaseHttps())
vi.mock('firebase-functions/params', () => mocks.firebaseParams())
vi.mock('firebase-functions/logger', () => mocks.firebaseLogger())
vi.mock('nodemailer', () => mocks.nodemailer())

const { sendDailyProcessAlerts } = await import('../../functions/index.js')

const ADMIN_ACTIVE = {
  id: 'admin-1',
  role: 'admin',
  status: 'Ativo',
  email: 'admin1@sqquimica.com',
  name: 'Admin Um',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendDailyProcessAlerts - metadados do schedule trigger', () => {
  it('cron/timezone/retryConfig', () => {
    expect(sendDailyProcessAlerts.__endpoint.scheduleTrigger).toMatchObject({
      schedule: '0 7 * * *',
      timeZone: 'America/Sao_Paulo',
      retryConfig: { retryCount: 2 },
    })
  })

  it('regiao us-central1', () => {
    expect(sendDailyProcessAlerts.__endpoint.region).toEqual(['us-central1'])
  })

  it('requer a Cloud Scheduler API', () => {
    const apis = sendDailyProcessAlerts.__requiredAPIs.map((entry) => entry.api)
    expect(apis).toContain('cloudscheduler.googleapis.com')
  })
})

describe('sendDailyProcessAlerts - run()', () => {
  it('processo em D-2 -> cria a notificacao do resumo diario', async () => {
    // D-2 relativo ao "hoje" (fuso America/Sao_Paulo) - o job usa `new
    // Date()` internamente; a chave do dia tem que ser calculada no MESMO
    // fuso (nunca via `toISOString()`, que e' UTC).
    const todayKey = getSaoPauloDateKey(new Date())
    const presenceKey = addDaysToKey(todayKey, -5)

    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_ACTIVE }],
      processes: [
        {
          id: 'proc-ft',
          data: {
            category: 'FCL',
            freeTimeDays: 7,
            cargoPresenceInformed: true,
            cargoPresenceInformedAt: `${presenceKey}T08:00`,
            processStatus: 'Aguardando agendamento de coleta',
          },
        },
      ],
      notifications: [],
    })

    await sendDailyProcessAlerts.run({})

    expect(mockFirestoreApi.collection).toHaveBeenCalledWith('notifications')
  })

  it('sem processos -> nenhum create', async () => {
    setupFirestoreChain({
      users: [{ id: 'admin-1', data: ADMIN_ACTIVE }],
      processes: [],
    })

    await sendDailyProcessAlerts.run({})
    expect(mockFirestoreApi.batch).not.toHaveBeenCalled()
  })
})
