// @vitest-environment jsdom
// S3 do Relatorio de Carga: cobertura de cargoReportRepository.js (current + conference).
// OBRIGATORIO mockar Firebase e o audit: sem isso um teste que escapasse falaria com o projeto real.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDoc, mockGetDoc, mockSetDoc, mockServerTimestamp, mockCreateAuditEvent, mockAuth, state } = vi.hoisted(
  () => ({
    mockDoc: vi.fn((...args) => ({ path: args.slice(1).join('/') })),
    mockGetDoc: vi.fn(),
    mockSetDoc: vi.fn(),
    mockServerTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    mockCreateAuditEvent: vi.fn(),
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

import {
  getCargoReport,
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
