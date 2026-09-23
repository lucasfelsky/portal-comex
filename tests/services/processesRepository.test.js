// F17.0 (bugfixes de processos): cobre bugs 1, 3, 5, 6 no caminho Firebase
// de `saveProcess`/`listProcesses` (Firestore mockado). Mesmo padrao de
// mock de `tests/services/usersRepository.test.js`.
//
// Environment: node (default do vitest.config.mjs para tests/services/**).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSetDoc, mockDoc, mockGetDocs, mockCreateAuditEvent } = vi.hoisted(() => {
  return {
    mockSetDoc: vi.fn(),
    mockDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockCreateAuditEvent: vi.fn(),
  }
})

vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: true,
  firestore: {},
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
}))

import { saveProcess, listProcesses, dtaStatusOptions, collectionStatusOptions } from '../../src/services/processesRepository'

beforeEach(() => {
  vi.clearAllMocks()
  mockDoc.mockReturnValue({ id: 'fake-doc-ref' })
  mockSetDoc.mockResolvedValue(undefined)
  mockGetDocs.mockResolvedValue({ docs: [] })
  mockCreateAuditEvent.mockResolvedValue(undefined)
})

function baseAirProcess(overrides = {}) {
  return {
    id: 'PROC-AIR-1',
    name: 'Processo Aereo',
    category: 'AEREO',
    processNumber: 'AER-001',
    destination: 'GRU',
    etd: '2026-01-01',
    eta: '2026-01-05',
    arrived: true,
    ...overrides,
  }
}

function baseMaritimeProcess(overrides = {}) {
  return {
    id: 'PROC-MAR-1',
    name: 'Processo Maritimo',
    category: 'FCL',
    processNumber: 'FCL-001',
    destination: 'Itajai',
    etd: '2026-01-01',
    eta: '2026-01-05',
    berthed: true,
    cargoPresenceInformed: true,
    duimpStatus: 'Parametrizada',
    parameterizationChannel: 'Verde',
    ...overrides,
  }
}

describe('bug 1 - DTA sem acento', () => {
  it('canonicaliza dtaStatus sem acento para o valor acentuado de dtaStatusOptions', async () => {
    await saveProcess(
      baseAirProcess({ dtaStatus: 'Concedida, aguardando programacao de carregamento' })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.dtaStatus).toBe('Concedida, aguardando programação de carregamento')
    expect(dtaStatusOptions.includes(payload.dtaStatus)).toBe(true)
  })

  it('canonicaliza a variante "Registrada, aguardando concessao"', async () => {
    await saveProcess(
      baseAirProcess({ dtaStatus: 'Registrada, aguardando concessao pela RFB' })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.dtaStatus).toBe('Registrada, aguardando concessão pela RFB')
    expect(dtaStatusOptions.includes(payload.dtaStatus)).toBe(true)
  })

  it('valor ja acentuado permanece igual', async () => {
    await saveProcess(
      baseAirProcess({ dtaStatus: 'Concedida, aguardando programação de carregamento' })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.dtaStatus).toBe('Concedida, aguardando programação de carregamento')
  })
})

describe('bug 3 - MAPA vazio nao trava Coleta em maritimo', () => {
  it('mapaStatus vazio preserva collectionStatus', async () => {
    await saveProcess(
      baseMaritimeProcess({
        mapaStatus: '',
        collectionStatus: 'Coleta Agendada',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('Coleta Agendada')
  })

  it('mapaStatus preenchido e nao-liberado continua zerando collectionStatus', async () => {
    await saveProcess(
      baseMaritimeProcess({
        mapaStatus: 'Aguardando MAPA',
        collectionStatus: 'Coleta Agendada',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('')
  })
})

describe('bug 5 - vocabulario da coleta', () => {
  it('collectionStatusOptions usa o vocabulario canonico', () => {
    expect(collectionStatusOptions).toContain('Aguardando agendamento de coleta')
    expect(collectionStatusOptions).not.toContain('Aguardando agendamento')
  })

  it('save com valor legado grava o canonico', async () => {
    await saveProcess(
      baseMaritimeProcess({
        mapaStatus: 'Liberado',
        collectionStatus: 'Aguardando agendamento',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('Aguardando agendamento de coleta')
  })

  it('listProcesses canonicaliza doc legado na leitura', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'PROC-LEGACY',
          data: () =>
            baseMaritimeProcess({
              mapaStatus: 'Liberado',
              collectionStatus: 'Aguardando agendamento',
            }),
        },
      ],
    })

    const items = await listProcesses()
    expect(items[0].collectionStatus).toBe('Aguardando agendamento de coleta')
  })
})

describe('bug 6 - promocao para estoque preservada', () => {
  it('canal nao-verde com processo ja recebido e em estoque preserva collectionStatus', async () => {
    await saveProcess(
      baseMaritimeProcess({
        parameterizationChannel: 'Amarelo',
        processStatus: 'Carga recebida',
        collectionStatus: 'Carga disponível em estoque',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('Carga disponível em estoque')
    expect(payload.collectionWindows).toEqual([])
  })

  it('canal nao-verde com processo ainda nao recebido continua travando a coleta', async () => {
    await saveProcess(
      baseMaritimeProcess({
        parameterizationChannel: 'Amarelo',
        processStatus: 'Coleta Agendada',
        collectionStatus: 'Coleta Agendada',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('')
  })
})
