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
  closeCargoReportConference,
  concludeCargoReport,
  getCargoConferenceDamage,
  getCargoReport,
  reopenCargoReport,
  reopenCargoReportConference,
  retryCloseConferenceWrite,
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
  receiptStatus: '',
  receivedDate: '',
  completedDate: '',
  nfNumber: '',
  catalogVersion: 3,
  lastGenerated: null,
})

// S7: 15 chaves vindas do modelo (o repositório acrescenta updatedAt/updatedById/updatedByName: 18 nas rules).
const conferencePayload = (revision = 1) => ({
  schemaVersion: 1,
  revision,
  status: 'aberta',
  okByRowId: { 'r-1': true, 'r-2': false },
  countOkByRowId: { 'r-1': true, 'r-2': false },
  labelsByRowId: { 'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' } },
  checkedByName: 'Operador Logística',
  receiptStatus: 'com_ressalva',
  receivedDate: '2026-11-22',
  nfNumber: '000.123.456',
  notes: 'Palete 3 avariado',
  closedDate: '',
  closedById: '',
  closedByName: '',
  closedDocumentId: '',
})

const closedConferencePayload = (revision = 3) => ({
  ...conferencePayload(revision),
  status: 'fechada',
  closedDate: '2026-11-24',
  closedById: 'uid-1',
  closedByName: 'Operador Logística',
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

describe('S10-J2b: getCargoConferenceDamage', () => {
  it('lê processes/<id>/cargoReport/damage e converte updatedAt para Date', async () => {
    const when = new Date(2026, 10, 24, 9, 30)
    mockGetDoc.mockResolvedValue(snapshot({ itemCount: 1, items: [{ rowId: 'r-1' }], updatedAt: { toDate: () => when } }))

    const result = await getCargoConferenceDamage('P1')

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'processes', 'P1', 'cargoReport', 'damage')
    expect(mockGetDoc).toHaveBeenCalledTimes(1)
    expect(result.itemCount).toBe(1)
    expect(result.updatedAt).toEqual(when)
  })

  it('espelho inexistente (processo antigo ou sem avaria) devolve null', async () => {
    mockGetDoc.mockResolvedValue(snapshot(undefined))
    await expect(getCargoConferenceDamage('P1')).resolves.toBeNull()
  })

  it('sem Firebase devolve null sem ler nada', async () => {
    state.configured = false
    await expect(getCargoConferenceDamage('P1')).resolves.toBeNull()
    expect(mockGetDoc).not.toHaveBeenCalled()
  })

  it('erro de leitura (permissão) sobe como veio, para o cartão decidir', async () => {
    mockGetDoc.mockRejectedValue(permissionDenied())
    await expect(getCargoConferenceDamage('P1')).rejects.toMatchObject({ code: 'permission-denied' })
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

  it('S6/S7: grava as 18 chaves das rules (contagem, etiquetas, recebimento e fechamento) intactas, sem merge', async () => {
    await saveCargoReportConference('P1', conferencePayload(2), LOGISTICS)

    const [, data, options] = mockSetDoc.mock.calls[0]
    expect(options).toBeUndefined()
    expect(data.countOkByRowId).toEqual({ 'r-1': true, 'r-2': false })
    expect(data.labelsByRowId).toEqual({ 'r-1': { wms: 'WMS-77120', sq: 'SQ-001245' } })
    expect(Object.keys(data).sort()).toEqual(
      [
        'checkedByName',
        'closedById',
        'closedByName',
        'closedDate',
        'closedDocumentId',
        'countOkByRowId',
        'labelsByRowId',
        'nfNumber',
        'notes',
        'okByRowId',
        'receiptStatus',
        'receivedDate',
        'revision',
        'schemaVersion',
        'status',
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

// ---------------------------------------------------------------------------
// S7: fechar e reabrir a conferência da logística
// ---------------------------------------------------------------------------
describe('S7: closeCargoReportConference', () => {
  const file = { name: 'FR.CMX.001 - RELATORIO DE CARGA - ACME SEA 021-26.xlsx', size: 100 }
  const actor = { uid: 'uid-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }
  const serverDocs = (current = { status: 'concluido', revision: 6 }, conference = { revision: 2 }) =>
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref.path.endsWith('/cargoReport/current')) return snapshot(current)
      if (ref.path.endsWith('/cargoReport/conference')) return snapshot(conference)
      return snapshot(undefined)
    })
  // S10-J2b: o fechar grava a conferência ABERTA (r+1) antes de anexar e a FECHADA (r+2) depois.
  const closeArgs = (overrides = {}) => ({
    openPayload: conferencePayload(3),
    payload: closedConferencePayload(4),
    file,
    category: 'FCL',
    actor,
    currentRevision: 6,
    ...overrides,
  })

  beforeEach(() => {
    serverDocs()
    mockUploadProcessDocument.mockResolvedValue({ id: 'doc-77' })
  })

  it('S10-J2b: relê current e conferência, GRAVA a aberta (r+1), anexa como logística e grava a fechada (r+2), nessa ordem', async () => {
    const order = []
    mockGetDoc.mockImplementation(async (ref) => {
      order.push(`getDoc:${ref.path.split('/').pop()}`)
      return snapshot(ref.path.endsWith('/current') ? { status: 'concluido', revision: 6 } : { revision: 2 })
    })
    mockUploadProcessDocument.mockImplementation(async () => {
      order.push('upload')
      return { id: 'doc-77' }
    })
    mockSetDoc.mockImplementation(async (ref, data) => {
      order.push(`setDoc:${ref.path.split('/').pop()}:${data.status}:r${data.revision}`)
    })

    const result = await closeCargoReportConference('P1', closeArgs())

    expect(order.slice(0, 2).sort()).toEqual(['getDoc:conference', 'getDoc:current'])
    expect(order.slice(2)).toEqual(['setDoc:conference:aberta:r3', 'upload', 'setDoc:conference:fechada:r4'])
    expect(result).toEqual({ revision: 4, documentId: 'doc-77' })
    expect(mockUploadProcessDocument).toHaveBeenCalledWith('P1', {
      type: 'cargoReport',
      file,
      category: 'FCL',
      actor: { uid: 'uid-1', name: 'Operador Logística', role: 'logistica' },
    })
  })

  it('a gravação aberta vem antes do upload por invocationCallOrder (o aviso do servidor lê o conteúdo final)', async () => {
    await closeCargoReportConference('P1', closeArgs())
    const [openOrder, closedOrder] = mockSetDoc.mock.invocationCallOrder
    const [uploadOrder] = mockUploadProcessDocument.mock.invocationCallOrder
    expect(openOrder).toBeLessThan(uploadOrder)
    expect(uploadOrder).toBeLessThan(closedOrder)
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ status: 'aberta', revision: 3, closedDocumentId: '' })
  })

  it('closedDocumentId = id do upload; a fechada grava no doc conference, sem merge, com os carimbos do actor', async () => {
    await closeCargoReportConference('P1', closeArgs())
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
    const [ref, data] = mockSetDoc.mock.calls[1]
    expect(ref.path).toBe('processes/P1/cargoReport/conference')
    expect(mockSetDoc.mock.calls[1]).toHaveLength(2)
    expect(data).toMatchObject({
      status: 'fechada',
      revision: 4,
      closedDocumentId: 'doc-77',
      closedById: 'uid-1',
      closedByName: 'Operador Logística',
      updatedAt: 'SERVER_TIMESTAMP',
      updatedById: 'uid-1',
      updatedByName: 'Operador Logística',
    })
    // 15 chaves do modelo + 3 carimbos = 18 (allowlist das rules)
    expect(Object.keys(data)).toHaveLength(18)
    // a aberta também é doc inteiro, sem merge e com os mesmos carimbos
    expect(mockSetDoc.mock.calls[0]).toHaveLength(2)
    expect(mockSetDoc.mock.calls[0][0].path).toBe('processes/P1/cargoReport/conference')
    expect(Object.keys(mockSetDoc.mock.calls[0][1])).toHaveLength(18)
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ updatedById: 'uid-1', updatedByName: 'Operador Logística' })
  })

  it('current em rascunho ou com outra revisão: conflito scope current, sem gravar nem anexar', async () => {
    const args = closeArgs()
    serverDocs({ status: 'rascunho', revision: 6 })
    await expect(closeCargoReportConference('P1', args)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
      scope: 'current',
    })
    serverDocs({ status: 'concluido', revision: 7 })
    await expect(closeCargoReportConference('P1', args)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
      scope: 'current',
    })
    serverDocs(null)
    await expect(closeCargoReportConference('P1', args)).rejects.toMatchObject({ scope: 'current' })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('revisão da conferência diferente (a aberta r+1 conta contra o servidor): conflito scope conference, sem gravar nem anexar', async () => {
    serverDocs({ status: 'concluido', revision: 6 }, { revision: 5 })
    await expect(closeCargoReportConference('P1', closeArgs())).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
      scope: 'conference',
    })
    // a conferência já em r+1 no servidor (tela velha, depois de uma gravação aberta) também conflita
    serverDocs({ status: 'concluido', revision: 6 }, { revision: 3 })
    await expect(closeCargoReportConference('P1', closeArgs())).rejects.toMatchObject({ scope: 'conference' })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('conferência ainda inexistente conta como revisão 0 (aberta revisão 1, fechada revisão 2)', async () => {
    serverDocs({ status: 'concluido', revision: 6 }, null)
    await expect(
      closeCargoReportConference(
        'P1',
        closeArgs({ openPayload: conferencePayload(1), payload: closedConferencePayload(2) })
      )
    ).resolves.toMatchObject({ documentId: 'doc-77', revision: 2 })
  })

  it('S10-J2b: falha ao gravar a aberta com releitura em outra revisão vira conflito e não anexa nada', async () => {
    mockSetDoc.mockRejectedValueOnce(permissionDenied())
    // 1ª leitura da conferência (passo a) vê r2; a releitura da classificação (depois do setDoc negado) vê outra revisão
    let conferenceReads = 0
    mockGetDoc.mockImplementation(async (ref) => {
      if (ref.path.endsWith('/current')) return snapshot({ status: 'concluido', revision: 6 })
      conferenceReads += 1
      return snapshot({ revision: conferenceReads === 1 ? 2 : 9 })
    })
    await expect(closeCargoReportConference('P1', closeArgs())).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
    })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
  })

  it('S10-J2b: falha na gravação aberta sem conflito segue como veio e nada fica marcado como salvo', async () => {
    const failure = new Error('rede caiu')
    mockSetDoc.mockRejectedValueOnce(failure)
    const error = await closeCargoReportConference('P1', closeArgs()).catch((caught) => caught)
    expect(error).toBe(failure)
    expect(error.savedRevision).toBeUndefined()
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
  })

  it('falha na gravação fechada depois do anexo vira cargoReport/attached-not-saved com documentId e savedRevision', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('rede caiu'))
    const error = await closeCargoReportConference('P1', closeArgs()).catch((caught) => caught)
    expect(error).toMatchObject({ code: 'cargoReport/attached-not-saved', documentId: 'doc-77', savedRevision: 3 })
    expect(Object.keys(error)).not.toContain('savedRevision')
    expect(mockSetDoc).toHaveBeenCalledTimes(2)
  })

  it('S10-J2b: falha no upload relança o erro original com savedRevision (não enumerável) e só a aberta foi gravada', async () => {
    const failure = new Error('storage/unauthorized')
    mockUploadProcessDocument.mockRejectedValue(failure)
    const error = await closeCargoReportConference('P1', closeArgs()).catch((caught) => caught)
    expect(error).toBe(failure)
    expect(error.savedRevision).toBe(3)
    expect(Object.keys(error)).not.toContain('savedRevision')
    expect(mockSetDoc).toHaveBeenCalledTimes(1)
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ status: 'aberta', revision: 3 })
  })

  it('sem Firebase e sem uid lançam erro antes de ler ou anexar', async () => {
    state.configured = false
    await expect(closeCargoReportConference('P1', closeArgs())).rejects.toThrow(
      'Documentos disponíveis apenas com o Firebase configurado.'
    )
    state.configured = true
    mockAuth.currentUser = null
    await expect(closeCargoReportConference('P1', closeArgs())).rejects.toThrow('Usuário não autenticado')
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockGetDoc).not.toHaveBeenCalled()
    expect(mockSetDoc).not.toHaveBeenCalled()
  })
})

describe('S7: retryCloseConferenceWrite', () => {
  it('grava só a conferência apontando para o documento já anexado, sem novo upload', async () => {
    const result = await retryCloseConferenceWrite('P1', {
      payload: closedConferencePayload(4),
      documentId: 'doc-77',
      actor: LOGISTICS,
    })
    expect(mockUploadProcessDocument).not.toHaveBeenCalled()
    expect(mockSetDoc.mock.calls[0][0].path).toBe('processes/P1/cargoReport/conference')
    expect(mockSetDoc.mock.calls[0][1]).toMatchObject({ status: 'fechada', closedDocumentId: 'doc-77' })
    expect(result).toEqual({ revision: 4, documentId: 'doc-77' })
  })

  it('conflito de revisão é classificado', async () => {
    mockSetDoc.mockRejectedValue(permissionDenied())
    mockGetDoc.mockResolvedValue(snapshot({ revision: 9 }))
    await expect(
      retryCloseConferenceWrite('P1', { payload: closedConferencePayload(4), documentId: 'doc-77', actor: LOGISTICS })
    ).rejects.toMatchObject({ code: 'cargoReport/revision-conflict' })
  })
})

describe('S10-I: pallets por item e observação por item no repositório', () => {
  const withMaps = {
    palletsByRowId: { 'r-1': 3, 'r-2': 0 },
    damageByRowId: { 'r-1': { flagged: true, note: 'Tambor amassado', photos: [] } },
  }

  it('salvar a conferência grava os 2 mapas novos intactos (sem merge) junto com as chaves de sempre', async () => {
    await saveCargoReportConference('P1', { ...conferencePayload(2), ...withMaps }, LOGISTICS)
    const [, data, options] = mockSetDoc.mock.calls[0]
    expect(options).toBeUndefined()
    expect(data.palletsByRowId).toEqual(withMaps.palletsByRowId)
    expect(data.damageByRowId).toEqual(withMaps.damageByRowId)
    expect(data.countOkByRowId).toEqual({ 'r-1': true, 'r-2': false })
  })

  it('salvar o rascunho do COMEX grava `expectedPallets` (inclusive null)', async () => {
    await saveCargoReportDraft('P1', { ...draftPayload(2), expectedPallets: 25 }, ADMIN)
    expect(mockSetDoc.mock.calls[0][1].expectedPallets).toBe(25)
    await saveCargoReportDraft('P1', { ...draftPayload(3), expectedPallets: null }, ADMIN)
    expect(mockSetDoc.mock.calls[1][1]).toHaveProperty('expectedPallets', null)
  })

  it('reabrir copia os mapas do servidor (a cópia exata); o doc fechado antes dos mapas não ganha as chaves', async () => {
    const server = {
      ...closedConferencePayload(3),
      ...withMaps,
      closedDocumentId: 'doc-77',
      updatedAt: { toDate: () => new Date('2026-11-24T16:05:00Z') },
      updatedById: 'uid-log',
      updatedByName: 'Operador Logística',
    }
    mockGetDoc.mockResolvedValue(snapshot(server))
    await reopenCargoReportConference('P1', ADMIN)
    const [, copied] = mockSetDoc.mock.calls[0]
    expect(copied.palletsByRowId).toEqual(withMaps.palletsByRowId)
    expect(copied.damageByRowId).toEqual(withMaps.damageByRowId)
    expect(Object.keys(copied)).toHaveLength(23)

    mockSetDoc.mockClear()
    const { palletsByRowId: _p, damageByRowId: _d, ...legacy } = server
    mockGetDoc.mockResolvedValue(snapshot(legacy))
    await reopenCargoReportConference('P1', ADMIN)
    const [, plain] = mockSetDoc.mock.calls[0]
    expect(plain).not.toHaveProperty('palletsByRowId')
    expect(plain).not.toHaveProperty('damageByRowId')
    expect(Object.keys(plain)).toHaveLength(21)
  })
})

describe('S7: reopenCargoReportConference', () => {
  const serverClosed = {
    ...closedConferencePayload(3),
    closedDocumentId: 'doc-77',
    updatedAt: { toDate: () => new Date('2026-11-24T16:05:00Z') },
    updatedById: 'uid-log',
    updatedByName: 'Operador Logística',
  }

  it('relê o doc do servidor e grava a cópia EXATA: só revisão, status e fechamento mudam', async () => {
    mockGetDoc.mockResolvedValue(snapshot(serverClosed))
    const result = await reopenCargoReportConference('P1', ADMIN)

    const [ref, data] = mockSetDoc.mock.calls[0]
    expect(ref.path).toBe('processes/P1/cargoReport/conference')
    expect(result).toEqual({ revision: 4 })
    expect(data).toMatchObject({
      revision: 4,
      status: 'aberta',
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
      updatedAt: 'SERVER_TIMESTAMP',
      updatedByName: 'Lucas Admin',
    })
    // O conteúdo da logística fica intacto.
    for (const key of ['okByRowId', 'countOkByRowId', 'labelsByRowId', 'checkedByName', 'receiptStatus', 'receivedDate', 'nfNumber', 'notes']) {
      expect(data[key]).toEqual(serverClosed[key])
    }
    // S8: o doc fechado antes da S8 (sem as chaves da descarga) ganha o padrão, o receivedDate gravado fica e as
    // 18 chaves antigas + 3 novas = 21.
    expect(data).toMatchObject({ unloadStartAt: '', unloadEndAt: '', labelingOk: false, receivedDate: '2026-11-22' })
    expect(Object.keys(data)).toHaveLength(21)
  })

  it('S8: doc com descarga e etiquetagem mantém os 3 valores (o valor do servidor vence o padrão)', async () => {
    mockGetDoc.mockResolvedValue(
      snapshot({
        ...serverClosed,
        unloadStartAt: '2026-11-22T08:15',
        unloadEndAt: '2026-11-22T10:40',
        labelingOk: true,
      })
    )
    await reopenCargoReportConference('P1', ADMIN)
    const [, data] = mockSetDoc.mock.calls[0]
    expect(data).toMatchObject({
      status: 'aberta',
      unloadStartAt: '2026-11-22T08:15',
      unloadEndAt: '2026-11-22T10:40',
      labelingOk: true,
      receivedDate: '2026-11-22',
    })
    expect(Object.keys(data)).toHaveLength(21)
  })

  it('audita a reabertura; falha de auditoria não vira erro', async () => {
    mockGetDoc.mockResolvedValue(snapshot(serverClosed))
    mockCreateAuditEvent.mockRejectedValue(new Error('audits negado'))
    await expect(reopenCargoReportConference('P1', ADMIN)).resolves.toEqual({ revision: 4 })
    expect(mockCreateAuditEvent).toHaveBeenCalledWith({
      action: 'Conferência do relatório de carga reaberta',
      actor: 'Lucas Admin',
      target: 'Conferência reaberta · revisão 4',
    })
  })

  it('conferência que não está fechada no servidor: conflito, sem gravar', async () => {
    mockGetDoc.mockResolvedValue(snapshot({ ...serverClosed, status: 'aberta' }))
    await expect(reopenCargoReportConference('P1', ADMIN)).rejects.toMatchObject({
      code: 'cargoReport/revision-conflict',
      scope: 'conference',
    })
    mockGetDoc.mockResolvedValue(snapshot(undefined))
    await expect(reopenCargoReportConference('P1', ADMIN)).rejects.toMatchObject({ scope: 'conference' })
    expect(mockSetDoc).not.toHaveBeenCalled()
  })

  it('conflito de revisão na gravação é classificado', async () => {
    mockGetDoc.mockResolvedValueOnce(snapshot(serverClosed)).mockResolvedValue(snapshot({ revision: 9 }))
    mockSetDoc.mockRejectedValue(permissionDenied())
    await expect(reopenCargoReportConference('P1', ADMIN)).rejects.toMatchObject({ code: 'cargoReport/revision-conflict' })
  })

  it('funciona sem Firebase (localStorage): reabre o doc local mantendo o conteúdo', async () => {
    state.configured = false
    window.localStorage.setItem(
      'sq-comex-cargo-report:P1',
      JSON.stringify({ current: null, conference: { ...serverClosed, updatedAt: '2026-11-24T16:05:00.000Z' } })
    )
    await expect(reopenCargoReportConference('P1', ADMIN)).resolves.toEqual({ revision: 4 })
    const stored = JSON.parse(window.localStorage.getItem('sq-comex-cargo-report:P1'))
    expect(stored.conference).toMatchObject({ status: 'aberta', revision: 4, closedDocumentId: '', notes: 'Palete 3 avariado' })
  })
})
