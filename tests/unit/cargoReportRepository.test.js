// @vitest-environment jsdom
// S3 do Relatorio de Carga: cobertura de cargoReportRepository.js (current + conference).
// OBRIGATORIO mockar Firebase e o audit: sem isso um teste que escapasse falaria com o projeto real.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockDoc,
  mockGetDoc,
  mockSetDoc,
  mockServerTimestamp,
  mockCreateAuditEvent,
  mockUploadProcessDocument,
  mockAuth,
  state,
} = vi.hoisted(
  () => ({
    mockDoc: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
    mockGetDoc: vi.fn(),
    mockSetDoc: vi.fn(),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockCreateAuditEvent: vi.fn(),
    mockUploadProcessDocument: vi.fn(),
    mockAuth: { currentUser: { uid: 'uid-1' } },
    state: { configured: true },
  })
)

vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return state.configured
  },
  get firestore() {
    return state.configured ? {} : null
  },
  auth: mockAuth,
}))

vi.mock('firebase/firestore/lite', () => ({
  doc: (...args) => mockDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: (...args) => mockServerTimestamp(...args),
}))

vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: (...args) => mockCreateAuditEvent(...args),
}))

vi.mock('../../src/services/processDocumentsRepository', () => ({
  uploadProcessDocument: (...args) => mockUploadProcessDocument(...args),
}))

import {
  concludeCargoReport,
  getCargoReport,
  reopenCargoReport,
  retryConcludeWrite,
  saveCargoReportConference,
  saveCargoReportDraft,
} from '../../src/services/cargoReportRepository'

const ADMIN = { name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }
const LOGISTICS = { name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }

const draftPayload = (revision = 1) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision,
  status: 'rascunho',
  cargoType: 'FCL',
  titleSuffix: 'ACME SEA 021-26',
  rows: [{ id: 'r-1' }, { id: 'r-2' }],
  notes: '',
  labeledBy: '',
  labelMadeBy: '',
  receiptStatus: '',
  receivedDate: '',
  completedDate: '',
  nfNumber: '',
  catalogVersion: 3,
  lastGenerated: null,
})

const conferencePayload = (revision = 1) => ({
  schemaVersion: 1,
  revision,
  okByRowId: { 'r-1': true, 'r-2': false },
  countOkByRowId: { 'r-1': true, 'r-2': false },
  labelsByRowId: { 'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' } },
  checkedByName: 'Operador Logística',
})

function snapshot(data) {
  return { exists: () => data !== undefined, data: () => data }
}

function permissionDenied() {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.configured = true
  mockAuth.currentUser = { uid: 'uid-1' }
  mockSetDoc.mockResolvedValue(undefined)
  mockCreateAuditEvent.mockResolvedValue(undefined)
  window.localStorage.clear()
})

describe('getCargoReport', () => {
  it('le os dois docs em processes/<id>/cargoReport e converte updatedAt para Date', async () => {
    const when = new Date(2026, 10, 22, 19, 52)
    mockGetDoc.mockImplementation(async (ref) =>
      ref.path.endsWith('/current')
        ? snapshot({ revision: 4, updatedAt: { toDate: () => when } })
        : snapshot(undefined)
    )

    const result = await getCargoReport('P1')

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'processes', 'P1', 'cargoReport', 'current')
    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'processes', 'P1', 'cargoReport', 'conference')
    expect(result.current.revision).toBe(4)
    expect(result.current.updatedAt).toEqual(when)
    expect(result.conference).toBeNull()
  })
})

describe('saveCargoReportDraft', () => {
  it('grava com setDoc sem merge, com serverTimestamp, uid e nome do actor', async () => {
    const result = await saveCargoReportDraft('P1', draftPayload(1), ADMIN)

    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    const [ref, data, options] = mockSetDoc.mock.calls[0]
    expect(ref.path).toBe('processes/P1/cargoReport/current')
    expect(options).toBeUndefined()
    expect(data).toMatchObject({
      revision: 1,
      updatedAt: 'SERVER_TIMESTAMP',
      updatedById: 'uid-1',
      updatedByName: 'Lucas Admin',
    })
    expect(result).toEqual({ revision: 1 })
  })

  it('usa o e-mail quando o actor nao tem nome', async () => {
    await saveCargoReportDraft('P1', draftPayload(1), { email: 'a@sqquimica.com', role: 'admin' })
    expect(mockSetDoc.mock.calls[0][1].updatedByName).toBe('a@sqquimica.com')
  })

  it('sem uid autenticado lanca erro e nao grava', async () => {
    mockAuth.currentUser = null
    await expect(saveCargoReportDraft('P1', draftPayload(1), ADMIN)).rejects.toThrow(/não autenticado/)
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('permission-denied com revisao do servidor diferente vira cargoReport/revision-conflict', async () => {
    mockSetDoc.mockRejectedValue(permissionDenied())
    mockGetDoc.mockResolvedValue(snapshot({ revision: 7 }))

    await expect(saveCargoReportDraft('P1', draftPayload(5), ADMIN)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
    })
    expect(mockCreateAuditEvent).not.toHaveBeenCalled()
  })

  it('permission-denied com a revisao igual relanca o erro original', async () => {
    const original = permissionDenied()
    mockSetDoc.mockRejectedValue(original)
    mockGetDoc.mockResolvedValue(snapshot({ revision: 4 }))

    await expect(saveCargoReportDraft('P1', draftPayload(5), ADMIN)).rejects.toBe(original)
  })

  it('doc inexistente e revisao 1 relanca o erro original (nao e conflito)', async () => {
    const original = permissionDenied()
    mockSetDoc.mockRejectedValue(original)
    mockGetDoc.mockResolvedValue(snapshot(undefined))

    await expect(saveCargoReportDraft('P1', draftPayload(1), ADMIN)).rejects.toBe(original)
  })

  it('outros erros seguem como vieram, sem reler o doc', async () => {
    const original = Object.assign(new Error('offline'), { code: 'unavailable' })
    mockSetDoc.mockRejectedValue(original)

    await expect(saveCargoReportDraft('P1', draftPayload(2), ADMIN)).rejects.toBe(original)
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('registra a auditoria e a falha da auditoria nao vira erro', async () => {
    mockCreateAuditEvent.mockRejectedValue(new Error('audits negado'))

    await expect(saveCargoReportDraft('P1', draftPayload(3), ADMIN)).resolves.toEqual({ revision: 3 })
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Relatório de carga salvo (rascunho)',
      actor: 'Lucas Admin',
      target: 'ACME SEA 021-26 · revisão 3 · 2 linhas',
    })
  })
})

describe('saveCargoReportConference', () => {
  it('grava no doc conference com os metadados do actor', async () => {
    const result = await saveCargoReportConference('P1', conferencePayload(2), LOGISTICS)

    const [ref, data, options] = mockSetDoc.mock.calls[0]
    expect(ref.path).toBe('processes/P1/cargoReport/conference')
    expect(options).toBeUndefined()
    expect(data).toMatchObject({
      revision: 2,
      okByRowId: { 'r-1': true, 'r-2': false },
      updatedAt: 'SERVER_TIMESTAMP',
      updatedById: 'uid-1',
      updatedByName: 'Operador Logística',
    })
    expect(result).toEqual({ revision: 2 })
  })

  it('S6: grava contagem e etiquetas intactas (as 2 chaves novas que as rules exigem) sem merge', async () => {
    await saveCargoReportConference('P1', conferencePayload(2), LOGISTICS)

    const [, data, options] = mockSetDoc.mock.calls[0]
    expect(options).toBeUndefined()
    expect(data.countOkByRowId).toEqual({ 'r-1': true, 'r-2': false })
    expect(data.labelsByRowId).toEqual({ 'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' } })
    expect(Object.keys(data).sort()).toEqual(
      [
        'checkedByName',
        'countOkByRowId',
        'labelsByRowId',
        'okByRowId',
        'revision',
        'schemaVersion',
        'updatedAt',
        'updatedById',
        'updatedByName',
      ].sort()
    )
  })

  it('NAO audita a conferencia da logistica (audits e admin-only)', async () => {
    await saveCargoReportConference('P1', conferencePayload(1), LOGISTICS, { titleSuffix: 'ACME', totalRows: 2 })
    expect(mockCreateAuditEvent).not.toHaveBeenCalled()
  })

  it('audita quando o actor e admin', async () => {
    await saveCargoReportConference('P1', conferencePayload(1), ADMIN, { titleSuffix: 'ACME SEA 021-26', totalRows: 2 })
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Conferência do relatório de carga salva',
      actor: 'Lucas Admin',
      target: 'ACME SEA 021-26 · 1 de 2 linhas OK',
    })
  })

  it('classifica conflito de revisao tambem na conferencia', async () => {
    mockSetDoc.mockRejectedValue(permissionDenied())
    mockGetDoc.mockResolvedValue(snapshot({ revision: 9 }))

    await expect(saveCargoReportConference('P1', conferencePayload(2), LOGISTICS)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
    })
  })
})

describe('fallback localStorage (sem Firebase)', () => {
  beforeEach(() => {
    state.configured = false
  })

  it('grava e le os dois docs em sq-comex-cargo-report:<id>', async () => {
    await saveCargoReportDraft('P1', draftPayload(1), ADMIN)
    await saveCargoReportConference('P1', conferencePayload(1), LOGISTICS)

    expect(window.localStorage.getItem('sq-comex-cargo-report:P1')).toBeTruthy()
    expect(mockSetDoc).not.toHaveBeenCalled()

    const result = await getCargoReport('P1')
    expect(result.current.revision).toBe(1)
    expect(result.current.updatedAt).toBeInstanceOf(Date)
    expect(result.conference.okByRowId).toEqual({ 'r-1': true, 'r-2': false })
  })

  it('exige a revisao seguinte (trava otimista tambem no local)', async () => {
    await saveCargoReportDraft('P1', draftPayload(1), ADMIN)
    await expect(saveCargoReportDraft('P1', draftPayload(1), ADMIN)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
    })
    await expect(saveCargoReportDraft('P1', draftPayload(2), ADMIN)).resolves.toEqual({ revision: 2 })
  })

  it('sem nada salvo, getCargoReport devolve null nos dois', async () => {
    expect(await getCargoReport('P9')).toEqual({ current: null, conference: null })
  })
})

describe('S4: concludeCargoReport', () => {
  const concludedPayload = (revision = 5) => ({ ...draftPayload(revision), status: 'concluido', completedDate: '2026-11-23' })
  const file = { name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx', size: 100 }
  const actor = { uid: 'uid-1', name: 'Lucas Admin', email: 'lucas@sqquimica.com', role: 'admin' }

  beforeEach(() => {
    mockGetDoc.mockResolvedValue(snapshot({ revision: 4 }))
    mockUploadProcessDocument.mockResolvedValue({ id: 'doc-9' })
  })

  it('confere a revisão, anexa e grava o concluído, nessa ordem', async () => {
    const order = []
    mockGetDoc.mockImplementation(async () => {
      order.push('getDoc')
      return snapshot({ revision: 4 })
    })
    mockUploadProcessDocument.mockImplementation(async () => {
      order.push('upload')
      return { id: 'doc-9' }
    })
    mockSetDoc.mockImplementation(async () => {
      order.push('setDoc')
    })

    const result = await concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })

    expect(order).toEqual(['getDoc', 'upload', 'setDoc'])
    expect(result).toEqual({ revision: 5, documentId: 'doc-9' })
    expect(mockUploadProcessDocument).toHaveBeenCalledWith('P1', {
      type: 'cargoReport',
      file,
      category: 'FCL',
      actor: { uid: 'uid-1', name: 'Lucas Admin', role: 'admin' },
    })
  })

  it('grava lastGenerated com o documento, a revisão, serverTimestamp e o uid', async () => {
    await concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })

    const [ref, data, options] = mockSetDoc.mock.calls[0]
    expect(ref.path).toBe('processes/P1/cargoReport/current')
    expect(options).toBeUndefined()
    expect(data).toMatchObject({
      status: 'concluido',
      revision: 5,
      completedDate: '2026-11-23',
      lastGenerated: { documentId: 'doc-9', revision: 5, at: 'SERVER_TIMESTAMP', byId: 'uid-1' },
      updatedById: 'uid-1',
    })
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Relatório de carga concluído e anexado',
      actor: 'Lucas Admin',
      target: 'ACME SEA 021-26 · revisão 5 · 2 linhas',
    })
  })

  it('revisão do servidor diferente: conflito, sem anexar nem gravar', async () => {
    mockGetDoc.mockResolvedValue(snapshot({ revision: 7 }))

    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })
    ).rejects.toMatchObject({ code: 'cargoReport/revision-conflict' })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('doc ainda inexistente conta como revisão 0', async () => {
    mockGetDoc.mockResolvedValue(snapshot(undefined))
    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(1), file, category: 'FCL', actor })
    ).resolves.toEqual({ revision: 1, documentId: 'doc-9' })
  })

  it('falha no setDoc depois do anexo vira cargoReport/attached-not-saved com o documentId', async () => {
    const original = Object.assign(new Error('offline'), { code: 'unavailable' })
    mockSetDoc.mockRejectedValue(original)

    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })
    ).rejects.toMatchObject({ code: 'cargoReport/attached-not-saved', documentId: 'doc-9', cause: original })
    expect(mockUploadProcessDocument).toHaveBeenCalledTimes(1)
    expect(mockCreateAuditEvent).not.toHaveBeenCalled()
  })

  it('falha no upload relança o erro original e não grava', async () => {
    const original = new Error('storage/unauthorized')
    mockUploadProcessDocument.mockRejectedValue(original)

    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })
    ).rejects.toBe(original)
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('falha de auditoria não vira erro', async () => {
    mockCreateAuditEvent.mockRejectedValue(new Error('audits negado'))
    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })
    ).resolves.toEqual({ revision: 5, documentId: 'doc-9' })
  })

  it('sem Firebase lança o mesmo erro do upload e não toca em nada', async () => {
    state.configured = false
    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(1), file, category: 'FCL', actor })
    ).rejects.toThrow('Documentos disponíveis apenas com o Firebase configurado.')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('sem uid autenticado lança erro antes de anexar', async () => {
    mockAuth.currentUser = null
    await expect(
      concludeCargoReport('P1', { payload: concludedPayload(5), file, category: 'FCL', actor })
    ).rejects.toThrow(/não autenticado/)
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })
})

describe('S4: retryConcludeWrite', () => {
  it('grava só o formulário apontando para o documento já anexado, sem novo upload', async () => {
    const payload = { ...draftPayload(5), status: 'concluido', completedDate: '2026-11-23' }
    const result = await retryConcludeWrite('P1', { payload, documentId: 'doc-9', actor: ADMIN })

    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({
      status: 'concluido',
      lastGenerated: { documentId: 'doc-9', revision: 5, at: 'SERVER_TIMESTAMP', byId: 'uid-1' },
    })
    expect(result).toEqual({ revision: 5, documentId: 'doc-9' })
  })

  it('conflito de revisão é relançado como veio', async () => {
    mockSetDoc.mockRejectedValue(permissionDenied())
    mockGetDoc.mockResolvedValue(snapshot({ revision: 9 }))
    await expect(
      retryConcludeWrite('P1', { payload: draftPayload(5), documentId: 'doc-9', actor: ADMIN })
    ).rejects.toMatchObject({ code: 'cargoReport/revision-conflict' })
  })
})

describe('S4: reopenCargoReport', () => {
  it('grava o rascunho e audita', async () => {
    const payload = { ...draftPayload(6), status: 'rascunho' }
    const result = await reopenCargoReport('P1', payload, ADMIN)

    const [ref, data] = mockSetDoc.mock.calls[0]
    expect(ref.path).toBe('processes/P1/cargoReport/current')
    expect(data).toMatchObject({ status: 'rascunho', revision: 6, updatedByName: 'Lucas Admin' })
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Relatório de carga reaberto para correção',
      actor: 'Lucas Admin',
      target: 'ACME SEA 021-26 · revisão 6',
    })
    expect(result).toEqual({ revision: 6 })
  })

  it('falha de auditoria não vira erro e conflito é classificado', async () => {
    mockCreateAuditEvent.mockRejectedValue(new Error('audits negado'))
    await expect(reopenCargoReport('P1', draftPayload(6), ADMIN)).resolves.toEqual({ revision: 6 })

    mockSetDoc.mockRejectedValue(permissionDenied())
    mockGetDoc.mockResolvedValue(snapshot({ revision: 9 }))
    await expect(reopenCargoReport('P1', draftPayload(6), ADMIN)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
    })
  })
})
