// PR 3: cobertura de erpReferenceRepository.js (grava a referencia do ERP e a
// le). OBRIGATORIO mockar Firebase e o audit: sem isso um teste que escapasse
// falaria com o projeto real. Mesmo padrao de processDocumentsRepository.test.js.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCollection,
  mockDoc,
  mockGetDoc,
  mockGetDocs,
  mockQuery,
  mockWhere,
  mockWriteBatch,
  mockServerTimestamp,
  mockCreateAuditEvent,
  mockAuth,
  state,
} = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  mockDoc: vi.fn(),
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockQuery: vi.fn(),
  mockWhere: vi.fn(),
  mockWriteBatch: vi.fn(),
  mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  mockCreateAuditEvent: vi.fn(),
  mockAuth: { currentUser: null },
  state: { configured: true, batches: [], commitBehaviors: [] },
}))

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return state.configured
  },
  firestore: {},
  auth: mockAuth,
}))

vi.mock('firebase/firestore/lite', () => ({
  collection: (...args) => mockCollection(...args),
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: (...args) => mockQuery(...args),
  where: (...args) => mockWhere(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
  writeBatch: (...args) => mockWriteBatch(...args),
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
}))

import { loadErpReference, saveErpReferenceSnapshot } from '../../src/services/erpReferenceRepository'
import { runErpReconciliation } from '../../src/features/erp/reconcileErp.js'
import {
  FINANCIAL_SENTINEL_STRINGS,
  SCENARIO_TODAY,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
} from '../fixtures/erp/dbcorpSynthetic.js'

const AUTO_ID = 'AUTOIDAUTOID0123456A'
const ADMIN_PROFILE = { name: 'Admin Teste', email: 'admin@sqquimica.com', notes: 'nota interna', area: 'COMEX' }

function shipment() {
  return {
    kind: 'FCL',
    portalCategory: 'FCL',
    key: 'ALFA SEA 900-26',
    incoterm: 'CFR',
    originHint: '',
    stage: 1,
    statuses: ['EMBARCOU'],
    statusNf: [],
    orders: [{ pedido: '9000', poRef: 'ALFA SEA 900-26', poBase: '', exporter: 'ALFA CHEM' }],
    items: [{ commercialName: 'RESINA OMEGA', pedido: '9000', quantityKg: 1000 }],
    transport: {
      etd: '2026-10-06',
      eta: '2026-10-14',
      vessel: { name: 'ALFA MAERSK', raw: 'ALFA MAERSK 639W', voyage: '639W' },
      blAwb: '',
      origin: '',
      destination: 'ITAJAI',
      diNumber: '',
      diDate: '',
    },
    conflicts: [],
  }
}

function resultWithMatched(count, { fileName = 'planilha.xlsx', blocked = null } = {}) {
  return {
    blocked,
    sourceInfo: { source: 'dbcorp-xlsx', label: 'DBCorp (.xlsx)', fileName, fetchedAt: '', rowCount: 30, generatedOn: '2026-10-02' },
    summary: {
      erpRows: 30, shipments: 28, activeShipments: 27, matched: count, matchedArchived: 0, matchedWithDiffs: 5,
      erpOnly: 1, portalOnly: 2, warnings: 3,
    },
    matched: Array.from({ length: count }, (_, index) => ({
      processId: `proc-${index}`,
      matchRule: 'pedido',
      referenceShipment: shipment(),
    })),
  }
}

const allSetCalls = () => state.batches.flatMap((batch) => batch.set.mock.calls)
const setCallsOf = (batch) => batch.set.mock.calls

beforeEach(() => {
  vi.clearAllMocks()
  state.configured = true
  state.batches = []
  state.commitBehaviors = []
  mockAuth.currentUser = { uid: 'admin-uid' }
  mockServerTimestamp.mockReturnValue('SERVER_TIMESTAMP')
  mockCollection.mockImplementation((_db, name) => ({ __collection: name }))
  mockDoc.mockImplementation((...args) => {
    if (args.length === 1) return { id: AUTO_ID, path: `${args[0].__collection}/${AUTO_ID}` }
    const parts = args.slice(1)
    return { id: parts[parts.length - 1], path: parts.join('/') }
  })
  mockWriteBatch.mockImplementation(() => {
    const index = state.batches.length
    const batch = {
      set: vi.fn(),
      commit: vi.fn(() => {
        const behavior = state.commitBehaviors[index]
        return behavior instanceof Error ? Promise.reject(behavior) : Promise.resolve()
      }),
    }
    state.batches.push(batch)
    return batch
  })
  mockCreateAuditEvent.mockResolvedValue({})
})

describe('saveErpReferenceSnapshot - gravacao em lote', () => {
  it('27 hints: 1 commit com meta em erpSnapshots/<id>, 1 set por hint em erpProcessHints/<processId> e o latest POR ULTIMO', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(27), ADMIN_PROFILE)
    expect(state.batches).toHaveLength(1)
    const calls = setCallsOf(state.batches[0])
    expect(calls).toHaveLength(29)
    expect(state.batches[0].commit).toHaveBeenCalledTimes(1)
    expect(calls[0][0].path).toBe(`erpSnapshots/${AUTO_ID}`)
    expect(calls.slice(1, 28).map(([ref]) => ref.path)).toEqual(
      Array.from({ length: 27 }, (_, index) => `erpProcessHints/proc-${index}`)
    )
    expect(calls[28][0].path).toBe('erpSnapshots/latest')
  })

  it('payloads com as chaves exatas, serverTimestamp, uid do auth.currentUser e nomes cortados (120/255)', async () => {
    const longName = 'N'.repeat(300)
    await saveErpReferenceSnapshot(resultWithMatched(2, { fileName: 'F'.repeat(300) }), { name: longName })
    const [meta, hintA, , latest] = setCallsOf(state.batches[0]).map(([, data]) => data)
    expect(Object.keys(meta).sort()).toEqual(['counts', 'createdAt', 'createdById', 'createdByName', 'snapshotId', 'sourceInfo'])
    expect(meta).toMatchObject({ snapshotId: AUTO_ID, createdAt: 'SERVER_TIMESTAMP', createdById: 'admin-uid' })
    expect(meta.createdByName).toHaveLength(120)
    expect(Object.keys(meta.sourceInfo).sort()).toEqual(['fetchedAt', 'fileName', 'generatedOn', 'label', 'rowCount', 'source'])
    expect(meta.sourceInfo.fileName).toHaveLength(255)
    expect(Object.keys(meta.counts)).toHaveLength(11)
    expect(meta.counts).toMatchObject({ erpRows: 30, matched: 2, hints: 2, hintsSkipped: 0 })

    expect(Object.keys(hintA).sort()).toEqual(['matchRule', 'savedAt', 'savedById', 'shipment', 'snapshotId'])
    expect(hintA).toMatchObject({ snapshotId: AUTO_ID, savedAt: 'SERVER_TIMESTAMP', savedById: 'admin-uid', matchRule: 'pedido' })

    expect(Object.keys(latest).sort()).toEqual(['fileName', 'hints', 'snapshotId', 'updatedAt', 'updatedById', 'updatedByName'])
    expect(latest).toMatchObject({ snapshotId: AUTO_ID, updatedAt: 'SERVER_TIMESTAMP', updatedById: 'admin-uid', hints: 2 })
    expect(latest.updatedByName).toHaveLength(120)
    expect(latest.fileName).toHaveLength(255)
  })

  it('cenario sintetico completo: nenhum argumento de batch.set contem sentinela financeira e os recortes tem so as chaves esperadas', async () => {
    const result = runErpReconciliation({
      loaded: {
        rows: buildScenarioLooseRows().map((row, index) => ({ rowNumber: index + 2, ...row })),
        warnings: [],
        meta: { fileName: 'teste.xlsx', rowCount: 10 },
      },
      processes: buildScenarioPortalProcesses(),
      today: SCENARIO_TODAY,
      source: { id: 'teste', label: 'Fonte de teste' },
    })
    await saveErpReferenceSnapshot(result, ADMIN_PROFILE)
    const json = JSON.stringify(allSetCalls().map(([, data]) => data))
    for (const sentinel of FINANCIAL_SENTINEL_STRINGS) expect(json).not.toContain(sentinel)
    expect(json).not.toContain('undefined')
    const hints = allSetCalls().filter(([ref]) => ref.path.startsWith('erpProcessHints/')).map(([, data]) => data)
    expect(hints).toHaveLength(result.matched.length)
    for (const hint of hints) {
      for (const item of hint.shipment.items) expect(Object.keys(item).sort()).toEqual(['commercialName', 'pedido', 'quantityKg'])
      for (const order of hint.shipment.orders) expect(Object.keys(order).sort()).toEqual(['exporter', 'pedido', 'poBase', 'poRef'])
      expect(Object.keys(hint.shipment.transport.vessel).sort()).toEqual(['name', 'raw', 'voyage'])
    }
  })

  it('nunca toca o documento do processo: nenhum doc(...) com a colecao de processos', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(5), ADMIN_PROFILE)
    for (const call of [...mockDoc.mock.calls, ...mockCollection.mock.calls]) {
      expect(call.map(String).join('/')).not.toMatch(/processes/)
    }
    const touched = allSetCalls().map(([ref]) => ref.path)
    expect(touched.every((path) => path.startsWith('erpSnapshots/') || path.startsWith('erpProcessHints/'))).toBe(true)
  })

  it('lotes: 448 hints -> 1 commit; 1000 -> 3 commits com o latest so no ultimo', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(448), ADMIN_PROFILE)
    expect(state.batches).toHaveLength(1)
    expect(setCallsOf(state.batches[0])).toHaveLength(450)

    state.batches = []
    mockGetDocs.mockResolvedValue({ docs: new Array(1000).fill(null) })
    await saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)
    expect(state.batches).toHaveLength(3)
    state.batches.forEach((batch) => expect(batch.commit).toHaveBeenCalledTimes(1))
    const latestIn = state.batches.map((batch) => setCallsOf(batch).some(([ref]) => ref.path === 'erpSnapshots/latest'))
    expect(latestIn).toEqual([false, false, true])
    const metaIn = state.batches.map((batch) => setCallsOf(batch).some(([ref]) => ref.path === `erpSnapshots/${AUTO_ID}`))
    expect(metaIn).toEqual([true, false, false])
    const lastCalls = setCallsOf(state.batches[2])
    expect(lastCalls[lastCalls.length - 1][0].path).toBe('erpSnapshots/latest')
  })

  it('2o commit rejeitado: o latest nao e gravado, audita "gravacao parcial" (1 de 3 lotes) e o save rejeita', async () => {
    state.commitBehaviors = [undefined, new Error('rede caiu')]
    await expect(saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)).rejects.toThrow('rede caiu')
    expect(state.batches).toHaveLength(2)
    const latestWritten = allSetCalls().some(([ref]) => ref.path === 'erpSnapshots/latest')
    expect(latestWritten).toBe(false)
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Referência do ERP: gravação parcial',
      actor: 'Admin Teste',
      target: `${AUTO_ID}: 1 de 3 lotes gravados`,
    })
  })

  it('1o commit rejeitado: nada gravado e nenhum audit; o erro original sobe', async () => {
    state.commitBehaviors = [new Error('permission-denied')]
    await expect(saveErpReferenceSnapshot(resultWithMatched(3), ADMIN_PROFILE)).rejects.toThrow('permission-denied')
    expect(mockCreateAuditEvent).not.toHaveBeenCalled()
  })
})

describe('saveErpReferenceSnapshot - importacoes concorrentes em varios lotes', () => {
  const latestOf = () => {
    const call = allSetCalls().find(([ref]) => ref.path === 'erpSnapshots/latest')
    return call ? call[1] : null
  }

  it('o latest leva hints = quantos hints foram gravados (os pulados nao contam)', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(27), ADMIN_PROFILE)
    expect(latestOf().hints).toBe(27)

    state.batches = []
    const withSkipped = resultWithMatched(5)
    withSkipped.matched[1].matchRule = 'regra-inexistente'
    await saveErpReferenceSnapshot(withSkipped, ADMIN_PROFILE)
    expect(latestOf().hints).toBe(4)

    state.batches = []
    mockGetDocs.mockResolvedValue({ docs: new Array(1000).fill(null) })
    await saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)
    expect(latestOf().hints).toBe(1000)
  })

  it('1 lote e atomico: nenhuma conferencia de leitura apos o save', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(448), ADMIN_PROFILE)
    expect(state.batches).toHaveLength(1)
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('varios lotes e todos os hints ainda do snapshot: confere por snapshotId e conclui com 1 audit de sucesso', async () => {
    mockWhere.mockReturnValue('WHERE')
    mockQuery.mockReturnValue('QUERY')
    mockGetDocs.mockResolvedValue({ docs: new Array(1000).fill(null) })
    await saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)
    expect(mockWhere).toHaveBeenCalledWith('snapshotId', '==', AUTO_ID)
    expect(mockQuery).toHaveBeenCalledWith({ __collection: 'erpProcessHints' }, 'WHERE')
    expect(mockGetDocs).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent.mock.calls[0][0].action).toBe('Referência do ERP importada')
  })

  it('varios lotes e outra importacao sobrescreveu hints (551 de 1000): rejeita, audita e nao reporta sucesso', async () => {
    mockGetDocs.mockResolvedValue({ docs: new Array(551).fill(null) })
    await expect(saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)).rejects.toThrow(
      /incompleta \(551 de 1000 processos\).*outra importação gravou ao mesmo tempo.*Importe a planilha de novo/
    )
    expect(state.batches).toHaveLength(3)
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Referência do ERP: gravação incompleta',
      actor: 'Admin Teste',
      target: `${AUTO_ID}: 551 de 1000 processos`,
    })
  })

  it('varios lotes e a conferencia falha ao ler: avisa no console e o save segue (a leitura confere de novo)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGetDocs.mockRejectedValue(new Error('rede caiu na conferencia'))
    const saved = await saveErpReferenceSnapshot(resultWithMatched(1000), ADMIN_PROFILE)
    expect(saved.counts.hints).toBe(1000)
    expect(warn).toHaveBeenCalled()
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent.mock.calls[0][0].action).toBe('Referência do ERP importada')
    warn.mockRestore()
  })
})

describe('saveErpReferenceSnapshot - audit, retorno e guardas', () => {
  it('audit de sucesso: 1x, chaves exatas, ator em TEXTO (nunca o profile), action e target com a contagem', async () => {
    await saveErpReferenceSnapshot(resultWithMatched(27), ADMIN_PROFILE)
    expect(mockCreateAuditEvent).toHaveBeenCalledTimes(1)
    const [event] = mockCreateAuditEvent.mock.calls[0]
    expect(Object.keys(event).sort()).toEqual(['action', 'actor', 'target'])
    expect(typeof event.actor).toBe('string')
    expect(event).toEqual({
      action: 'Referência do ERP importada',
      actor: 'Admin Teste',
      target: `${AUTO_ID}: 27 processos`,
    })
    expect(JSON.stringify(event)).not.toContain('nota interna')
    expect(JSON.stringify(event)).not.toContain('admin@sqquimica.com')
  })

  it('ator: o nome; sem nome o e-mail; sem ator "Sistema" (sempre string)', async () => {
    const actorOf = async (actor) => {
      mockCreateAuditEvent.mockClear()
      await saveErpReferenceSnapshot(resultWithMatched(1), actor)
      return mockCreateAuditEvent.mock.calls[0][0]
    }
    expect((await actorOf({ name: 'Admin Teste', email: 'a@b.com' })).actor).toBe('Admin Teste')
    expect((await actorOf({ email: 'a@sqquimica.com' })).actor).toBe('a@sqquimica.com')
    expect((await actorOf({ name: '  ', email: 'b@sqquimica.com' })).actor).toBe('b@sqquimica.com')
    expect((await actorOf(undefined)).actor).toBe('Sistema')
    expect((await actorOf(null)).actor).toBe('Sistema')
    expect((await actorOf(undefined)).target).toBe(`${AUTO_ID}: 1 processo`)
  })

  it('audit rejeitado nao derruba o save', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockCreateAuditEvent.mockRejectedValue(new Error('audit fora do ar'))
    const saved = await saveErpReferenceSnapshot(resultWithMatched(2), ADMIN_PROFILE)
    expect(saved.snapshotId).toBe(AUTO_ID)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('retorna a referencia pronta para a pagina: updatedAtMs = Date.now() e os hints por processId', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1780000000000)
    const saved = await saveErpReferenceSnapshot(resultWithMatched(2), ADMIN_PROFILE)
    expect(saved.reference.snapshot).toEqual({
      snapshotId: AUTO_ID,
      updatedAtMs: 1780000000000,
      updatedByName: 'Admin Teste',
      fileName: 'planilha.xlsx',
    })
    expect(Object.keys(saved.reference.hintsByProcessId)).toEqual(['proc-0', 'proc-1'])
    expect(saved.reference.hintsByProcessId['proc-0']).toMatchObject({ snapshotId: AUTO_ID, matchRule: 'pedido' })
    expect(saved.counts).toMatchObject({ hints: 2, hintsSkipped: 0 })
    expect(saved.skipped).toEqual([])
  })

  it('resultado bloqueado rejeita sem abrir nenhum lote', async () => {
    await expect(saveErpReferenceSnapshot(resultWithMatched(2, { blocked: 'lista_portal_vazia' }), ADMIN_PROFILE)).rejects.toThrow(/bloqueada/)
    expect(mockWriteBatch).not.toHaveBeenCalled()
  })

  it('sem Firebase configurado: save rejeita com a mensagem fixa e nao abre lote; load devolve null sem getDoc', async () => {
    state.configured = false
    await expect(saveErpReferenceSnapshot(resultWithMatched(2), ADMIN_PROFILE)).rejects.toThrow(
      'Firebase não configurado: a referência do ERP só é salva no servidor.'
    )
    expect(mockWriteBatch).not.toHaveBeenCalled()
    await expect(loadErpReference()).resolves.toBeNull()
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockGetDocs).not.toHaveBeenCalled()
  })

  it('sem usuario autenticado nao grava nada', async () => {
    mockAuth.currentUser = null
    await expect(saveErpReferenceSnapshot(resultWithMatched(2), ADMIN_PROFILE)).rejects.toThrow(/autenticado/)
    expect(mockWriteBatch).not.toHaveBeenCalled()
  })
})

describe('loadErpReference', () => {
  it('sem latest: null (e nenhuma query de hints)', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false })
    await expect(loadErpReference()).resolves.toBeNull()
    expect(mockGetDocs).not.toHaveBeenCalled()
    expect(mockDoc).toHaveBeenCalledWith({}, 'erpSnapshots', 'latest')
  })

  it('com latest: query where("snapshotId", "==", id) e updatedAt.toMillis() vira updatedAtMs', async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        snapshotId: AUTO_ID,
        updatedAt: { toMillis: () => 1780000000000 },
        updatedById: 'admin-uid',
        updatedByName: 'Admin Teste',
        fileName: 'planilha.xlsx',
        hints: 2,
      }),
    })
    mockWhere.mockReturnValue('WHERE')
    mockQuery.mockReturnValue('QUERY')
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'proc-1', data: () => ({ snapshotId: AUTO_ID, savedAt: 'x', savedById: 'u', matchRule: 'po', shipment: shipment() }) },
        { id: 'proc-2', data: () => ({ snapshotId: AUTO_ID, matchRule: 'pedido', shipment: shipment() }) },
      ],
    })
    const loaded = await loadErpReference()
    expect(mockWhere).toHaveBeenCalledWith('snapshotId', '==', AUTO_ID)
    expect(mockQuery).toHaveBeenCalledWith({ __collection: 'erpProcessHints' }, 'WHERE')
    expect(mockGetDocs).toHaveBeenCalledWith('QUERY')
    expect(loaded.snapshot).toEqual({
      snapshotId: AUTO_ID,
      updatedAtMs: 1780000000000,
      updatedByName: 'Admin Teste',
      fileName: 'planilha.xlsx',
    })
    expect(Object.keys(loaded.hintsByProcessId)).toEqual(['proc-1', 'proc-2'])
    expect(loaded.hintsByProcessId['proc-1']).toEqual({ snapshotId: AUTO_ID, matchRule: 'po', shipment: shipment() })
    expect('incomplete' in loaded.snapshot).toBe(false)
  })

  describe('referencia incompleta (importacoes concorrentes em varios lotes)', () => {
    const latestWith = (hints) => ({
      exists: () => true,
      data: () => ({
        snapshotId: AUTO_ID,
        updatedAt: { toMillis: () => 1780000000000 },
        updatedById: 'admin-uid',
        updatedByName: 'Admin Teste',
        fileName: 'planilha.xlsx',
        ...(hints === undefined ? {} : { hints }),
      }),
    })
    const hintDocs = (count) => ({
      docs: Array.from({ length: count }, (_, index) => ({
        id: `proc-${index}`,
        data: () => ({ snapshotId: AUTO_ID, matchRule: 'pedido', shipment: shipment() }),
      })),
    })

    it('docs do snapshot em menor numero que latest.hints (551 de 1000): incomplete, sem hints e aviso no console', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockGetDoc.mockResolvedValue(latestWith(1000))
      mockGetDocs.mockResolvedValue(hintDocs(551))
      const loaded = await loadErpReference()
      expect(loaded.snapshot).toEqual({
        snapshotId: AUTO_ID,
        updatedAtMs: 1780000000000,
        updatedByName: 'Admin Teste',
        fileName: 'planilha.xlsx',
        incomplete: true,
      })
      expect(loaded.hintsByProcessId).toEqual({})
      expect(warn).toHaveBeenCalledTimes(1)
      warn.mockRestore()
    })

    it('docs a mais que latest.hints tambem e incompleta (o numero precisa bater)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockGetDoc.mockResolvedValue(latestWith(2))
      mockGetDocs.mockResolvedValue(hintDocs(3))
      const loaded = await loadErpReference()
      expect(loaded.snapshot.incomplete).toBe(true)
      expect(loaded.hintsByProcessId).toEqual({})
      warn.mockRestore()
    })

    it('latest sem hints (ou nao inteiro) e tratado como incompleta', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      for (const hints of [undefined, '2', 2.5, null]) {
        mockGetDoc.mockResolvedValue(latestWith(hints))
        mockGetDocs.mockResolvedValue(hintDocs(2))
        const loaded = await loadErpReference()
        expect(loaded.snapshot.incomplete, String(hints)).toBe(true)
        expect(loaded.hintsByProcessId).toEqual({})
      }
      warn.mockRestore()
    })

    it('numero igual (inclusive 0 de 0) e referencia completa: sem incomplete e com os hints', async () => {
      mockGetDoc.mockResolvedValue(latestWith(3))
      mockGetDocs.mockResolvedValue(hintDocs(3))
      const complete = await loadErpReference()
      expect('incomplete' in complete.snapshot).toBe(false)
      expect(Object.keys(complete.hintsByProcessId)).toEqual(['proc-0', 'proc-1', 'proc-2'])

      mockGetDoc.mockResolvedValue(latestWith(0))
      mockGetDocs.mockResolvedValue(hintDocs(0))
      const empty = await loadErpReference()
      expect('incomplete' in empty.snapshot).toBe(false)
      expect(empty.hintsByProcessId).toEqual({})
    })
  })

  it('latest sem snapshotId valido: null', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ updatedAt: { toMillis: () => 1 } }) })
    await expect(loadErpReference()).resolves.toBeNull()
    expect(mockGetDocs).not.toHaveBeenCalled()
  })
})
