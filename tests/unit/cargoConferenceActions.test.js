// S9-F do Relatório de Carga: ações da conferência (gravar, fechar, gravar de novo, reabrir) e mapeamento dos erros,
// compartilhados entre o computador e o celular. Repositório e gerador de Excel mockados.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockClose = vi.fn()
const mockRetryClose = vi.fn()
const mockReopen = vi.fn()
const mockGenerate = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  closeCargoReportConference: (...args) => mockClose(...args),
  retryCloseConferenceWrite: (...args) => mockRetryClose(...args),
  reopenCargoReportConference: (...args) => mockReopen(...args),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({
  generateCargoReportFile: (...args) => mockGenerate(...args),
}))

import {
  CARGO_CONFERENCE_MESSAGES as MESSAGES,
  buildCargoConferenceCloseFile,
  closeCargoConference,
  describeCargoCloseError,
  describeCargoReopenError,
  describeCargoRetryError,
  describeCargoSaveError,
  isCargoNetworkError,
  reopenCargoConference,
  retryCargoConferenceClose,
} from '../../src/features/processes/cargoConferenceActions'
import { EMPTY_CARGO_CONFERENCE } from '../../src/features/processes/cargoConferenceModel'
import {
  CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
  CARGO_REPORT_CONFLICT_CODE,
  buildClosedConferencePayload,
  createEmptyCargoReportRow,
} from '../../src/features/processes/cargoReportFormModel'

const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }
const PROCESS = { id: 'p1', name: 'ACME SEA 021-26', category: 'FCL' }
const ROWS = [
  { ...createEmptyCargoReportRow('r-1'), dbcorpCode: 'AD5240', supplierLot: 'L1', quantityKg: 100 },
  { ...createEmptyCargoReportRow('r-2'), dbcorpCode: 'RE5116', supplierLot: 'L2', quantityKg: 200 },
]
const FORM = { revision: 4, status: 'concluido', titleSuffix: 'ACME SEA 021-26', cargoType: 'FCL', rows: ROWS, notes: '' }
const CONFERENCE = {
  ...EMPTY_CARGO_CONFERENCE,
  revision: 7,
  okByRowId: { 'r-1': true },
  countOkByRowId: { 'r-1': true },
  labelsByRowId: { 'r-1': { wms: 'w1', sq: 'sq1' } },
  receiptStatus: 'sem_ressalva',
  nfNumber: '48213; 48214',
}

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

let consoleSpy

beforeEach(() => {
  vi.clearAllMocks()
  // `buildActionErrorMessage` registra o erro no console; aqui só interessa o texto devolvido.
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  setOnline(true)
  mockGenerate.mockResolvedValue(new File(['xlsx'], 'FR.CMX.001.xlsx'))
  mockClose.mockResolvedValue({ revision: 8, documentId: 'doc-9' })
})

afterEach(() => {
  consoleSpy.mockRestore()
  setOnline(true)
})

describe('describeCargoSaveError', () => {
  it('conflito de revisão: texto do rascunho ou da conferência', () => {
    const error = Object.assign(new Error('x'), { code: CARGO_REPORT_CONFLICT_CODE })
    expect(describeCargoSaveError(error, 'draft')).toEqual({ kind: 'conflict', text: MESSAGES.conflictDraft })
    expect(describeCargoSaveError(error, 'conference')).toEqual({ kind: 'conflict', text: MESSAGES.conflictConference })
  })

  it('permission-denied', () => {
    expect(describeCargoSaveError({ code: 'permission-denied' }, 'conference')).toEqual({
      kind: 'error',
      text: MESSAGES.permissionDenied,
    })
  })

  it('sem conexão: `unavailable` e `deadline-exceeded` viram o aviso "Sem conexão…"', () => {
    for (const code of ['unavailable', 'deadline-exceeded']) {
      expect(describeCargoSaveError({ code }, 'conference')).toEqual({ kind: 'error', text: MESSAGES.offline })
    }
    expect(MESSAGES.offline).toBe(
      'Sem conexão. A conferência não foi salva: confira o sinal e toque em Salvar de novo.'
    )
    expect(describeCargoSaveError({ code: 'unavailable' }, 'draft').text).toBe(MESSAGES.offlineDraft)
  })

  it('aparelho offline (navigator.onLine = false) vale para qualquer erro', () => {
    setOnline(false)
    expect(describeCargoSaveError(new Error('qualquer coisa'), 'conference').text).toBe(MESSAGES.offline)
    expect(isCargoNetworkError(null)).toBe(true)
  })

  it('falha de rede do navegador (TypeError de fetch) é sem conexão; TypeError de programação não é', () => {
    expect(isCargoNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isCargoNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isCargoNetworkError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false)
    expect(isCargoNetworkError(new Error('Failed to fetch'))).toBe(false)
  })

  it('erro comum: mensagem com o prefixo de sempre (sem código técnico)', () => {
    const result = describeCargoSaveError(new Error('boom'), 'conference')
    expect(result.kind).toBe('error')
    expect(result.text.startsWith('Não foi possível salvar o relatório de carga.')).toBe(true)
  })
})

describe('closeCargoConference', () => {
  const args = (overrides = {}) => ({
    processId: 'p1',
    process: PROCESS,
    profile: LOGISTICA,
    form: FORM,
    conference: CONFERENCE,
    savedRevision: 7,
    catalog: null,
    packaging: null,
    today: '2026-11-25',
    ...overrides,
  })

  it('monta o payload fechado, gera o Excel e chama o repositório com os mesmos argumentos da barra', async () => {
    const result = await closeCargoConference(args())

    const expected = buildClosedConferencePayload({ ...CONFERENCE, revision: 7 }, ROWS, {
      actorName: 'Operador Logística',
      actorUid: 'log-1',
      today: '2026-11-25',
    })
    expect(result).toEqual({ payload: expected, documentId: 'doc-9' })
    expect(expected).toMatchObject({ status: 'fechada', revision: 8, nfNumber: '48213; 48214', closedDate: '2026-11-25' })
    expect(mockClose).toHaveBeenCalledTimes(1)
    const [processId, options] = mockClose.mock.calls[0]
    expect(processId).toBe('p1')
    expect(options).toMatchObject({
      payload: expected,
      category: 'FCL',
      actor: LOGISTICA,
      currentRevision: 4,
    })
    expect(options.file).toBeInstanceOf(File)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('o Excel é gerado antes de anexar (ordem das chamadas)', async () => {
    const order = []
    mockGenerate.mockImplementation(async () => {
      order.push('excel')
      return new File(['x'], 'a.xlsx')
    })
    mockClose.mockImplementation(async () => {
      order.push('fechar')
      return { revision: 8, documentId: 'd' }
    })
    await closeCargoConference(args())
    expect(order).toEqual(['excel', 'fechar'])
  })

  it('em erro, o payload montado segue em `error.closePayload` (não enumerável) para o "Gravar de novo"', async () => {
    const failure = Object.assign(new Error('x'), { code: CARGO_REPORT_ATTACHED_NOT_SAVED_CODE, documentId: 'doc-5' })
    mockClose.mockRejectedValue(failure)
    await expect(closeCargoConference(args())).rejects.toBe(failure)
    expect(failure.closePayload).toMatchObject({ status: 'fechada', revision: 8 })
    expect(Object.keys(failure)).not.toContain('closePayload')
  })

  it('erro ao gerar o Excel: o erro segue como veio e nada é anexado', async () => {
    mockGenerate.mockRejectedValue(new Error('excel'))
    const failure = await closeCargoConference(args()).catch((error) => error)
    expect(failure.message).toBe('excel')
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('buildCargoConferenceCloseFile devolve o arquivo do gerador', async () => {
    const file = await buildCargoConferenceCloseFile({
      form: FORM,
      process: PROCESS,
      catalog: null,
      packaging: null,
      payload: { ...CONFERENCE, status: 'fechada' },
    })
    expect(file).toBeInstanceOf(File)
  })
})

describe('describeCargoCloseError', () => {
  const payload = { status: 'fechada', revision: 8 }

  it('anexou mas não gravou: "Gravar de novo" chama o repositório sem anexar de novo', async () => {
    const onRetry = vi.fn()
    const error = Object.assign(new Error('x'), { code: CARGO_REPORT_ATTACHED_NOT_SAVED_CODE, documentId: 'doc-5' })
    const described = describeCargoCloseError(error, payload, { onRetry })
    expect(described).toMatchObject({ kind: 'retry', text: MESSAGES.conferenceAttachedNotSaved })
    expect(described.action.label).toBe('Gravar de novo')
    described.action.run()
    expect(onRetry).toHaveBeenCalledWith(payload, 'doc-5')

    mockRetryClose.mockResolvedValue({ revision: 8, documentId: 'doc-5' })
    await retryCargoConferenceClose({ processId: 'p1', payload, documentId: 'doc-5', profile: LOGISTICA })
    expect(mockRetryClose).toHaveBeenCalledWith('p1', { payload, documentId: 'doc-5', actor: LOGISTICA })
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('anexou e houve conflito: aviso de conflito (sem ação)', () => {
    const error = Object.assign(new Error('x'), {
      code: CARGO_REPORT_ATTACHED_NOT_SAVED_CODE,
      cause: { code: CARGO_REPORT_CONFLICT_CODE },
    })
    expect(describeCargoCloseError(error, payload)).toEqual({
      kind: 'conflict',
      text: MESSAGES.conferenceAttachedConflict,
    })
  })

  it('conflito no `current` (COMEX mexeu) x conflito na conferência', () => {
    const current = Object.assign(new Error('x'), { code: CARGO_REPORT_CONFLICT_CODE, scope: 'current' })
    const conference = Object.assign(new Error('x'), { code: CARGO_REPORT_CONFLICT_CODE, scope: 'conference' })
    expect(describeCargoCloseError(current, payload)).toEqual({ kind: 'conflict', text: MESSAGES.currentChanged })
    expect(describeCargoCloseError(conference, payload)).toEqual({
      kind: 'conflict',
      text: MESSAGES.conflictConference,
    })
  })

  it('permissão, sem conexão e erro comum', () => {
    expect(describeCargoCloseError({ code: 'permission-denied' }, payload).text).toBe(MESSAGES.permissionDenied)
    expect(describeCargoCloseError({ code: 'unavailable' }, payload)).toEqual({
      kind: 'error',
      text: MESSAGES.offlineClose,
    })
    const generic = describeCargoCloseError(new Error('boom'), payload)
    expect(generic.text.startsWith('Não foi possível salvar e fechar a conferência.')).toBe(true)
  })

  it('"Gravar de novo" que falha: conflito avisa; o resto continua oferecendo gravar de novo', () => {
    const onRetry = vi.fn()
    const conflict = Object.assign(new Error('x'), { code: CARGO_REPORT_CONFLICT_CODE })
    expect(describeCargoRetryError(conflict, payload, 'doc-5', { onRetry })).toEqual({
      kind: 'conflict',
      text: MESSAGES.conferenceAttachedConflict,
    })
    const again = describeCargoRetryError(new Error('boom'), payload, 'doc-5', { onRetry })
    expect(again.kind).toBe('retry')
    expect(again.text.startsWith(MESSAGES.conferenceAttachedNotSaved)).toBe(true)
    again.action.run()
    expect(onRetry).toHaveBeenCalledWith(payload, 'doc-5')
  })
})

describe('reabrir', () => {
  it('devolve a conferência aberta (revisão nova), com o conteúdo intacto e o fechamento zerado', async () => {
    mockReopen.mockResolvedValue({ revision: 9 })
    const closed = {
      ...CONFERENCE,
      status: 'fechada',
      closedDate: '2026-11-24',
      closedById: 'log-1',
      closedByName: 'Operador Logística',
      closedDocumentId: 'doc-9',
    }
    const admin = { uid: 'admin-1', name: 'Lucas Admin', role: 'admin' }
    const reopened = await reopenCargoConference({
      processId: 'p1',
      profile: admin,
      savedConference: closed,
      actorName: 'Lucas Admin',
    })
    expect(mockReopen).toHaveBeenCalledWith('p1', admin)
    expect(reopened).toMatchObject({
      revision: 9,
      status: 'aberta',
      closedDate: '',
      closedById: '',
      closedByName: '',
      closedDocumentId: '',
      updatedByName: 'Lucas Admin',
      nfNumber: '48213; 48214',
      okByRowId: { 'r-1': true },
    })
    expect(reopened.updatedAt).toBeInstanceOf(Date)
  })

  it('erros ao reabrir: conflito, permissão, sem conexão e erro comum', () => {
    const conflict = Object.assign(new Error('x'), { code: CARGO_REPORT_CONFLICT_CODE })
    expect(describeCargoReopenError(conflict).text).toBe(MESSAGES.conflictConference)
    expect(describeCargoReopenError({ code: 'permission-denied' }).text).toBe(MESSAGES.permissionDenied)
    expect(describeCargoReopenError({ code: 'unavailable' }).text).toBe(MESSAGES.offlineReopen)
    expect(describeCargoReopenError(new Error('boom')).text.startsWith('Não foi possível reabrir.')).toBe(true)
  })
})
