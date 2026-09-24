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

const { mockUpdateDoc } = vi.hoisted(() => ({ mockUpdateDoc: vi.fn() }))

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: (...args) => mockDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: vi.fn(),
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
}))

import {
  saveProcess,
  saveProcessCollectionStatus,
  listProcesses,
  dtaStatusOptions,
  collectionStatusOptions,
} from '../../src/services/processesRepository'

beforeEach(() => {
  vi.clearAllMocks()
  mockDoc.mockReturnValue({ id: 'fake-doc-ref' })
  mockSetDoc.mockResolvedValue(undefined)
  mockUpdateDoc.mockResolvedValue(undefined)
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

// F17.1a: `processStatus`/`cargoReceivedAt` derivados no save (D-C).
describe('F17.1a - derivacao no saveProcess', () => {
  it('maritimo Verde parametrizado grava "Aguardando agendamento de coleta" mesmo com processStatus "Embarcou" no input', async () => {
    await saveProcess(
      baseMaritimeProcess({
        processStatus: 'Embarcou',
        mapaStatus: 'Liberado',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Aguardando agendamento de coleta')
  })

  it('Amarelo grava "Aguardando desembaraço"', async () => {
    await saveProcess(
      baseMaritimeProcess({
        parameterizationChannel: 'Amarelo',
        processStatus: 'Embarcou',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Aguardando desembaraço')
  })

  it('berthed:false + input "Embarcou" (legado, eta futura) preserva "Embarcou"', async () => {
    // F17.2a (D-3): legado sem `shippedAt` segue a regra automatica da ETA -
    // eta futura mantem "Embarcou" (eta vencida regrediria pra "Aguardando
    // atracação", comportamento aceito da D-3).
    await saveProcess(
      baseMaritimeProcess({
        berthed: false,
        cargoPresenceInformed: false,
        duimpStatus: '',
        parameterizationChannel: '',
        processStatus: 'Embarcou',
        eta: '2099-01-01',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Embarcou')
  })

  it('collectionStatus "Carga disponível em estoque" grava "Carga recebida" e cargoReceivedAt ISO', async () => {
    await saveProcess(
      baseMaritimeProcess({
        mapaStatus: 'Liberado',
        collectionStatus: 'Carga disponível em estoque',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Carga recebida')
    expect(typeof payload.cargoReceivedAt).toBe('string')
    expect(payload.cargoReceivedAt).not.toBe('')
  })

  it('cargoReceivedAt existente e preservado', async () => {
    await saveProcess(
      baseMaritimeProcess({
        mapaStatus: 'Liberado',
        collectionStatus: 'Carga disponível em estoque',
        cargoReceivedAt: '2026-01-01T00:00:00.000Z',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.cargoReceivedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('F17.1a - derivacao em saveProcessCollectionStatus (logistica)', () => {
  it('com currentProcess (janela agendada) avancando pra "Veículo no CD para descarga" grava processStatus "Carga recebida" + cargoReceivedAt', async () => {
    const currentProcess = {
      id: 'PROC-LOG-1',
      category: 'FCL',
      collectionScheduledAt: '2026-01-01T10:00:00.000Z',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00.000Z' }],
      cargoReceivedAt: '',
    }

    await saveProcessCollectionStatus(
      'PROC-LOG-1',
      'Veículo no CD para descarga',
      null,
      currentProcess
    )

    const payload = mockUpdateDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Carga recebida')
    expect(typeof payload.cargoReceivedAt).toBe('string')
    expect(payload.cargoReceivedAt).not.toBe('')
  })

  it('avancando pra "Carga a caminho do CD" grava processStatus "Coleta Agendada"', async () => {
    const currentProcess = {
      id: 'PROC-LOG-2',
      category: 'FCL',
      collectionScheduledAt: '2026-01-01T10:00:00.000Z',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00.000Z' }],
    }

    await saveProcessCollectionStatus('PROC-LOG-2', 'Carga a caminho do CD', null, currentProcess)

    const payload = mockUpdateDoc.mock.calls[0][1]
    expect(payload.processStatus).toBe('Coleta Agendada')
  })

  it('sem currentProcess -> payload so com collectionStatus (retrocompat)', async () => {
    await saveProcessCollectionStatus('PROC-LOG-3', 'Carga a caminho do CD')

    const payload = mockUpdateDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('Carga a caminho do CD')
    expect(payload.processStatus).toBeUndefined()
    expect(payload.cargoReceivedAt).toBeUndefined()
  })
})

describe('F17.2a - containers[]/campos de embarque e transito (D-4/D-5)', () => {
  it('FCL legado (containerQuantity: 2, sem containers) expande pra CNT-1/CNT-2 e containerQuantity 2', async () => {
    await saveProcess(baseMaritimeProcess({ category: 'FCL', containerQuantity: 2 }))

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.containers.map((c) => c.id)).toEqual(['CNT-1', 'CNT-2'])
    expect(payload.containerQuantity).toBe(2)
  })

  it('FCL com 3 containers e containerQuantity 1 -> containerQuantity vira 3 (deriva do array)', async () => {
    await saveProcess(
      baseMaritimeProcess({
        category: 'FCL',
        containerQuantity: 1,
        containers: [{ number: 'a' }, { number: 'b' }, { number: 'c' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.containers).toHaveLength(3)
    expect(payload.containerQuantity).toBe(3)
  })

  it('LCL com containers e mawb -> ambos limpos', async () => {
    await saveProcess(
      baseMaritimeProcess({
        category: 'LCL',
        containers: [{ number: 'a' }],
        mawb: 'MAWB-123',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.containers).toEqual([])
    expect(payload.mawb).toBe('')
  })

  it('dangerousGoods:false limpa unNumber/imoClass', async () => {
    await saveProcess(
      baseMaritimeProcess({
        dangerousGoods: false,
        unNumber: 'UN 1203',
        imoClass: '3',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.unNumber).toBe('')
    expect(payload.imoClass).toBe('')
  })

  it('dangerousGoods:true preserva unNumber/imoClass normalizados', async () => {
    await saveProcess(
      baseMaritimeProcess({
        dangerousGoods: true,
        unNumber: 'UN 1203',
        imoClass: '3',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.unNumber).toBe('1203')
    expect(payload.imoClass).toBe('3')
  })

  it('transshipment:false limpa transshipmentPort', async () => {
    await saveProcess(
      baseMaritimeProcess({
        transshipment: false,
        transshipmentPort: 'Singapura',
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.transshipmentPort).toBe('')
  })

  it('payload contem as 22 chaves novas e nenhuma undefined', async () => {
    await saveProcess(baseMaritimeProcess())

    const payload = mockSetDoc.mock.calls[0][1]
    const newFields = [
      'supplierName', 'originLocation', 'incoterm', 'forwarderName', 'unNumber',
      'imoClass', 'shippedAt', 'vesselName', 'voyage', 'flightNumber', 'masterBl',
      'houseBl', 'mawb', 'hawb', 'transshipmentPort', 'dangerousGoods',
      'transshipment', 'grossWeightKg', 'volumeM3', 'chargeableWeightKg',
      'packagesQuantity', 'containers',
    ]
    expect(newFields).toHaveLength(22)
    newFields.forEach((field) => {
      expect(payload).toHaveProperty(field)
      expect(payload[field]).not.toBeUndefined()
    })
  })
})

// F17.2b (D-3/D-4): `licenses[]` multi-orgao substitui MAPA (compat de
// leitura 1 release) - gate de coleta unico `isCollectionReleased`.
describe('F17.2b - licenses[] (D-3/D-4)', () => {
  it('leitura de doc legado "Vistoria agendada, aguardando realização" + data vira licenses[0] LIC-MAPA/Vistoria agendada e mapaStatus ""', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'PROC-LEGACY-2',
          data: () =>
            baseMaritimeProcess({
              mapaStatus: 'Vistoria agendada, aguardando realização',
              mapaInspectionScheduledAt: '2026-09-20T10:00',
            }),
        },
      ],
    })

    const items = await listProcesses()
    expect(items[0].licenses).toHaveLength(1)
    expect(items[0].licenses[0].id).toBe('LIC-MAPA')
    expect(items[0].licenses[0].status).toBe('Vistoria agendada')
    expect(items[0].licenses[0].inspectionScheduledAt).toBe('2026-09-20T10:00')
    expect(items[0].mapaStatus).toBe('')
  })

  it('payload do save contem licenses + mapaStatus "" + mapaInspectionScheduledAt "" e nenhuma chave undefined', async () => {
    await saveProcess(baseMaritimeProcess({ mapaStatus: 'Liberado' }))

    const payload = mockSetDoc.mock.calls[0][1]
    expect(Array.isArray(payload.licenses)).toBe(true)
    expect(payload.mapaStatus).toBe('')
    expect(payload.mapaInspectionScheduledAt).toBe('')
    expect(payload.licenses).not.toBeUndefined()
  })

  it('AEREO com licenses [Em análise] zera collectionStatus (bloqueia a coleta - D5)', async () => {
    await saveProcess(
      baseAirProcess({
        dtaStatus: 'Trânsito concluído',
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
        collectionStatus: 'Coleta Agendada',
        licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('')
  })

  it('AEREO com licenses [Deferida] preserva a coleta', async () => {
    await saveProcess(
      baseAirProcess({
        dtaStatus: 'Trânsito concluído',
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
        collectionStatus: 'Coleta Agendada',
        licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Deferida' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionStatus).toBe('Coleta Agendada')
  })

  it('11 licencas -> 10 no payload (teto MAX_LICENSES)', async () => {
    const licenses = Array.from({ length: 11 }, (_, index) => ({
      id: `LIC-${index + 1}`,
      agency: 'MAPA',
      status: 'Aguardando registro',
    }))
    await saveProcess(baseMaritimeProcess({ licenses }))

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.licenses).toHaveLength(10)
  })
})

// F17.2c (D-3): purchaseOrders[] do CONSOLIDADO + items[].poNumber +
// collectionWindows[].containerId ligado a containers[].
function baseConsolidatedProcess(overrides = {}) {
  return {
    id: 'PROC-CONS-1',
    name: 'Consolidado Delta',
    category: 'CONSOLIDADO',
    destination: 'Rotterdam',
    etd: '2026-01-01',
    eta: '2026-01-10',
    ...overrides,
  }
}

describe('F17.2c - purchaseOrders[]/items[].poNumber/collectionWindows[].containerId', () => {
  it('CONSOLIDADO grava purchaseOrders normalizado e processNumber ""', async () => {
    await saveProcess(baseConsolidatedProcess({ purchaseOrders: [' PO-A ', 'po-a', 'PO-B'] }))

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.purchaseOrders).toEqual(['PO-A', 'PO-B'])
    expect(payload.processNumber).toBe('')
  })

  it('FCL grava purchaseOrders: [] e itens SEM a chave poNumber', async () => {
    await saveProcess(
      baseMaritimeProcess({
        purchaseOrders: ['PO-A'],
        items: [{ id: 'i1', commercialName: 'Item', quantity: 1, poNumber: 'PO-A' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.purchaseOrders).toEqual([])
    expect(payload.items[0]).not.toHaveProperty('poNumber')
  })

  it('item do CONSOLIDADO com PO fora da lista grava poNumber ""', async () => {
    await saveProcess(
      baseConsolidatedProcess({
        purchaseOrders: ['PO-A', 'PO-B'],
        items: [{ id: 'i1', commercialName: 'Item', quantity: 1, poNumber: 'PO-Z' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.items[0].poNumber).toBe('')
  })

  it('item do CONSOLIDADO com PO valida preserva poNumber', async () => {
    await saveProcess(
      baseConsolidatedProcess({
        purchaseOrders: ['PO-A', 'PO-B'],
        items: [{ id: 'i1', commercialName: 'Item', quantity: 1, poNumber: 'PO-B' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.items[0].poNumber).toBe('PO-B')
  })

  it('janela FCL legada (containerNumber, sem containerId) ganha containerId do container correspondente', async () => {
    await saveProcess(
      baseMaritimeProcess({
        category: 'FCL',
        containers: [{ number: 'a' }, { number: 'b' }],
        collectionWindows: [{ id: 'W1', containerNumber: 2, scheduledAt: '2026-01-01T10:00:00' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionWindows[0].containerId).toBe('CNT-2')
  })

  it('janela LCL grava containerId ""', async () => {
    await saveProcess(
      baseMaritimeProcess({
        category: 'LCL',
        collectionWindows: [{ id: 'W1', containerNumber: 1, scheduledAt: '2026-01-01T10:00:00' }],
      })
    )

    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.collectionWindows[0].containerId).toBe('')
  })

  it('leitura de CONSOLIDADO com processNumber cru vira purchaseOrders: [valor]', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'PROC-CONS-LEGACY',
          data: () => ({
            id: 'PROC-CONS-LEGACY',
            name: 'Consolidado legado',
            category: 'CONSOLIDADO',
            processNumber: '9999',
          }),
        },
      ],
    })

    const items = await listProcesses()
    expect(items[0].purchaseOrders).toEqual(['9999'])
  })
})

// F17.3a (D-14): chegada com data, CE/terminal/free time, presenca de carga.
describe('F17.3a - chegada com data / CE / free time / presenca', () => {
  it('(a) FCL salva berthedAt -> payload/retorno com berthed: true', async () => {
    const saved = await saveProcess(
      baseMaritimeProcess({ berthed: false, berthedAt: '2026-01-10T10:00' })
    )
    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.berthed).toBe(true)
    expect(payload.berthedAt).toBe('2026-01-10T10:00')
    expect(saved.berthed).toBe(true)
  })

  it('(b) limpar berthedAt de doc sem bool legado -> berthed: false e cascata zera cargoPresenceInformedAt/duimpStatus', async () => {
    await saveProcess(
      baseMaritimeProcess({
        berthed: false,
        berthedAt: '',
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: '2026-01-11T08:00',
        duimpStatus: 'Parametrizada',
        parameterizationChannel: 'Verde',
      })
    )
    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.berthed).toBe(false)
    expect(payload.cargoPresenceInformedAt).toBe('')
    expect(payload.cargoPresenceInformed).toBe(false)
    expect(payload.duimpStatus).toBe('')
  })

  it('(c) legado berthed: true sem berthedAt -> continua true', async () => {
    const saved = await saveProcess(baseMaritimeProcess({ berthed: true, berthedAt: undefined }))
    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.berthed).toBe(true)
    expect(payload.berthedAt).toBe('')
    expect(saved.berthed).toBe(true)
  })

  it('(d) LCL grava freeTimeDays: null; AEREO grava ceMercante: ""', async () => {
    await saveProcess(
      baseMaritimeProcess({ category: 'LCL', processNumber: '', houseBl: 'HBL-1', freeTimeDays: '5' })
    )
    const lclPayload = mockSetDoc.mock.calls[0][1]
    expect(lclPayload.freeTimeDays).toBeNull()

    await saveProcess(baseAirProcess({ ceMercante: 'CE-1' }))
    const airPayload = mockSetDoc.mock.calls[1][1]
    expect(airPayload.ceMercante).toBe('')
  })

  it("(e) freeTimeDays: '0' -> 0 (valor valido, distinto de nao informado)", async () => {
    await saveProcess(baseMaritimeProcess({ freeTimeDays: '0' }))
    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.freeTimeDays).toBe(0)
  })

  it('(f) migratedApproxFields: filtra por APPROX_DATE_FIELDS e exige data preenchida', async () => {
    await saveProcess(
      baseMaritimeProcess({
        berthedAt: '2026-01-10T10:00',
        migratedApproxFields: ['berthedAt', 'x'],
      })
    )
    const withDatePayload = mockSetDoc.mock.calls[0][1]
    expect(withDatePayload.migratedApproxFields).toEqual(['berthedAt'])

    await saveProcess(
      baseMaritimeProcess({ berthed: false, berthedAt: '', migratedApproxFields: ['berthedAt'] })
    )
    const withoutDatePayload = mockSetDoc.mock.calls[1][1]
    expect(withoutDatePayload.migratedApproxFields).toEqual([])
  })

  it('(g) regressao DTA sem acento: AEREO arrivedAt + "Transito concluido" + presenca -> dtaStatus acentuado e presenca preservada', async () => {
    await saveProcess(
      baseAirProcess({
        arrived: true,
        arrivedAt: '2026-01-10T10:00',
        dtaStatus: 'Transito concluido',
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: '2026-01-11T08:00',
      })
    )
    const payload = mockSetDoc.mock.calls[0][1]
    expect(payload.dtaStatus).toBe('Trânsito concluído')
    expect(payload.cargoPresenceInformed).toBe(true)
    expect(payload.cargoPresenceInformedAt).toBe('2026-01-11T08:00')
  })
})
