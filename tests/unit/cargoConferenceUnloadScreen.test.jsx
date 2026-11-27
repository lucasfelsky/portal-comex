// Conferência por item (Fatia C): a aba Recebimento do celular com a descarga por unidade (contêineres do processo ou "Descarga
// única"): Iniciar/Finalizar agora, erro de horários, Salvar com `unloadByUnit` e calculados, conferência antiga ("Registro
// anterior"), unidade fora do processo, fechada e admin. Repositórios mockados; dados inventados.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockGetCargoReport = vi.fn()
const mockSaveConference = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportConference: (...args) => mockSaveConference(...args),
  closeCargoReportConference: vi.fn(),
  retryCloseConferenceWrite: vi.fn(),
  reopenCargoReportConference: vi.fn(),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({ generateCargoReportFile: vi.fn() }))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({
    exists: true,
    version: 3,
    itemCount: 2,
    items: [
      { code: 'BA5012', description: 'POLYETHER POLYOL', packagingType: 'TAMBOR', netWeightKg: 25 },
      { code: 'BA5033', description: 'ZINC CATALYST', packagingType: 'SACO', netWeightKg: 25 },
    ],
  }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))
vi.mock('../../src/services/cargoConferencePhotosRepository', () => ({
  uploadCargoConferencePhoto: vi.fn(),
  deleteOwnCargoConferencePhotoFiles: vi.fn(),
  downloadCargoConferencePhotoBlob: vi.fn(),
}))
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({ invalidateCargoConference: vi.fn() }))

import { ToastProvider } from '../../src/components/Toast'
import CargoConferenceScreen from '../../src/features/processes/CargoConferenceScreen'
import { toCargoDateTimeKeyLocal } from '../../src/features/processes/cargoConferenceUnload'

const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }
const ADMIN = { uid: 'adm-1', name: 'Admin Demo', email: 'adm@sqquimica.com', role: 'admin' }
const PROCESS = {
  id: 'p1',
  name: 'DEMO 001',
  processNumber: 'DEMO 001',
  category: 'FCL',
  supplierName: 'Fornecedor Alfa Ltda',
  archived: false,
  containers: [
    { id: 'CNT-1', number: 'DMOU1234560', type: '40HC' },
    { id: 'CNT-2', number: 'DMOU7654321', type: '40HC' },
    { id: 'CNT-3', number: 'DMOU2468135', type: '20DC' },
  ],
}
const AEREO = { ...PROCESS, id: 'p2', category: 'AEREO', containers: [] }

const row = (overrides = {}) => ({
  id: 'r-1',
  po: '',
  dbcorpCode: 'BA5012',
  supplierDescription: 'POLYETHER POLYOL PE-3000',
  sqDescription: 'Poliol Flex 3000',
  supplierLot: 'L-2231',
  wmsLabel: '',
  sqLabel: '',
  quantityKg: 2500,
  count: null,
  packageWeightKg: 9.8,
  frozenNetWeightKg: null,
  frozenPackages: null,
  ...overrides,
})

const ROWS = [row({ id: 'r-1' }), row({ id: 'r-2', supplierLot: 'L-2232', quantityKg: 5000 })]

const currentDoc = (overrides = {}) => ({
  schemaVersion: 1,
  formCode: 'FR.CMX.001',
  formRevision: '005',
  revision: 4,
  status: 'concluido',
  cargoType: 'FCL',
  titleSuffix: 'DEMO 001',
  rows: ROWS,
  expectedPallets: 6,
  notes: '',
  nfNumber: '',
  receiptStatus: '',
  receivedDate: '',
  completedDate: '2026-11-23',
  catalogVersion: 3,
  lastGenerated: null,
  updatedAt: new Date(2026, 10, 23, 19, 52),
  updatedByName: 'Lucas',
  ...overrides,
})

const conferenceDoc = (overrides = {}) => ({
  schemaVersion: 1,
  revision: 2,
  status: 'aberta',
  okByRowId: {},
  countOkByRowId: {},
  palletsByRowId: {},
  damageByRowId: {},
  labelsByRowId: {},
  checkedByName: '',
  receiptStatus: '',
  receivedDate: '',
  nfNumber: '',
  notes: '',
  unloadStartAt: '',
  unloadEndAt: '',
  labelingOk: false,
  closedDate: '',
  closedById: '',
  closedByName: '',
  closedDocumentId: '',
  updatedAt: new Date(2026, 10, 24, 9, 0),
  updatedByName: '',
  ...overrides,
})

async function renderScreen({ conference = conferenceDoc(), current = currentDoc(), profile = LOGISTICA, process = PROCESS } = {}) {
  mockGetCargoReport.mockResolvedValue({ current, conference })
  const user = userEvent.setup()
  rtlRender(
    <MemoryRouter initialEntries={['/conferencia?processo=p1']}>
      <CargoConferenceScreen process={process} profile={profile} canSeeName onBack={vi.fn()} />
    </MemoryRouter>,
    { wrapper: ToastProvider }
  )
  await screen.findByRole('tablist')
  await user.click(screen.getByRole('tab', { name: 'Recebimento' }))
  return { user }
}

const D = '2026-11-27T'
const PHONE_MAP = {
  'CNT-1': { startAt: `${D}08:10`, endAt: `${D}09:35` },
  'CNT-2': { startAt: `${D}09:20`, endAt: `${D}10:30` },
  'CNT-3': { startAt: `${D}10:50`, endAt: '' },
}
const phoneConference = (overrides = {}) =>
  conferenceDoc({
    unloadByUnit: PHONE_MAP,
    unloadStartAt: `${D}08:10`,
    unloadEndAt: `${D}10:30`,
    receivedDate: '2026-11-27',
    ...overrides,
  })
const nowKey = () => toCargoDateTimeKeyLocal(new Date())
const field = (kind, title) => screen.getByLabelText(`${kind} da descarga · ${title}`)
const unitRow = (title) => screen.getByText(title, { selector: '.ccf-unit__t' }).closest('.ccf-unit')
const saveButton = () => screen.getByRole('button', { name: 'Salvar' })
const C1 = 'Contêiner 1 · DMOU1234560'
const C2 = 'Contêiner 2 · DMOU7654321'
const C3 = 'Contêiner 3 · DMOU2468135'

let clock = 0
let consoleSpy
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  mockSaveConference.mockResolvedValue({ revision: 3 })
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  // O catálogo Item x Emb. é cacheado por 5 min no módulo: o relógio avança a cada teste para não herdar o cache.
  vi.useFakeTimers({ toFake: ['Date'] })
  clock += 10 * 60 * 1000
  vi.setSystemTime(new Date(2026, 10, 27, 11, 40).getTime() + clock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  consoleSpy.mockRestore()
})

describe('aba Recebimento: cartão "Descarga por unidade"', () => {
  it('FCL: uma linha por contêiner, depois do Recebimento e antes das Notas fiscais (D-C8); os campos únicos saíram', async () => {
    await renderScreen()
    const regions = [...document.querySelectorAll('.ccf-panel > section')].map((item) => item.getAttribute('aria-label'))
    expect(regions).toEqual(['Recebimento', 'Descarga por unidade', 'Notas fiscais', 'Ressalvas e avarias'])
    expect(document.querySelectorAll('.ccf-unit')).toHaveLength(3)
    expect(screen.queryByLabelText('Início da descarga')).not.toBeInTheDocument()
    expect(screen.queryByText('Tempo total')).not.toBeInTheDocument()
    expect(screen.getAllByText('Não iniciada')).toHaveLength(3)
  })

  it('AÉREO: "Descarga única" com o subtítulo próprio', async () => {
    await renderScreen({ process: AEREO })
    expect(screen.getByText('Este processo não tem contêineres. A descarga é uma só. Horários de Brasília.')).toBeInTheDocument()
    expect(unitRow('Descarga única')).toHaveTextContent('Sem contêiner no processo (LCL ou aéreo)')
  })

  it('"Iniciar agora" preenche o início com o minuto local; "Finalizar agora" o fim; o Salvar grava o mapa e os calculados', async () => {
    const { user } = await renderScreen()
    expect(saveButton()).toBeDisabled()
    await user.click(within(unitRow(C1)).getByRole('button', { name: 'Iniciar agora' }))
    expect(field('Início', C1)).toHaveValue(nowKey())
    expect(nowKey()).toMatch(/^2026-11-27T1[1-9]:\d\d$/)
    expect(unitRow(C1)).toHaveTextContent('Em andamento')
    await user.click(within(unitRow(C1)).getByRole('button', { name: 'Finalizar agora' }))
    expect(field('Fim', C1)).toHaveValue(nowKey())
    expect(unitRow(C1)).toHaveTextContent('0 min')
    expect(within(unitRow(C1)).queryByRole('button')).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()

    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    const now = nowKey()
    expect(payload.unloadByUnit).toEqual({ 'CNT-1': { startAt: now, endAt: now } })
    expect(payload).toMatchObject({ unloadStartAt: now, unloadEndAt: now, receivedDate: '2026-11-27' })
    expect(await screen.findByText(/Conferência salva às/)).toBeInTheDocument()
    // depois de salvar a tela segue igual e sem alteração pendente
    expect(field('Início', C1)).toHaveValue(now)
    expect(saveButton()).toBeDisabled()
  })

  it('digitar várias unidades recalcula o total, a sobreposição e a data; o Salvar leva o menor início e o maior fim', async () => {
    const { user } = await renderScreen()
    fireEvent.change(field('Início', C1), { target: { value: `${D}08:10` } })
    fireEvent.change(field('Fim', C1), { target: { value: `${D}09:35` } })
    fireEvent.change(field('Início', C2), { target: { value: `${D}09:20` } })
    fireEvent.change(field('Fim', C2), { target: { value: `${D}10:30` } })
    fireEvent.change(field('Início', C3), { target: { value: `${D}10:50` } })
    fireEvent.change(field('Fim', C3), { target: { value: `${D}11:30` } })
    const total = document.querySelector('.ccf-total')
    expect(total.querySelector(':scope > b')).toHaveTextContent('3 h 15 min')
    expect(total).toHaveTextContent('o tempo corrido, do primeiro início ao último fim sem repetir a sobreposição, é de 3 h.')
    expect(screen.getByText('27/11/2026 08:10')).toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}11:30`, receivedDate: '2026-11-27' })
    expect(Object.keys(payload.unloadByUnit)).toEqual(['CNT-1', 'CNT-2', 'CNT-3'])
  })

  it('o aviso do Salvar traz a pendência "N unidade(s) da descarga em andamento ou sem fim" (não bloqueia)', async () => {
    const { user } = await renderScreen({ conference: phoneConference() })
    fireEvent.change(field('Fim', C2), { target: { value: `${D}10:40` } })
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/No fechamento pelo computador:/)).toHaveTextContent(
      '1 unidade da descarga em andamento ou sem fim (fora do tempo total)'
    )
  })

  it('erro de horários (fim antes do início): mensagem, aria-invalid, "Corrigir horários" e o Salvar NÃO grava', async () => {
    const { user } = await renderScreen()
    fireEvent.change(field('Início', C1), { target: { value: `${D}10:00` } })
    fireEvent.change(field('Fim', C1), { target: { value: `${D}09:00` } })
    expect(within(unitRow(C1)).getByRole('alert')).toHaveTextContent('O fim da descarga deve ser igual ou posterior ao início.')
    expect(field('Fim', C1)).toHaveAttribute('aria-invalid', 'true')
    expect(unitRow(C1)).toHaveTextContent('Corrigir horários')
    await user.click(saveButton())
    expect(await screen.findByText('Corrija o horário da descarga antes de salvar.')).toBeInTheDocument()
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('"Finalizar agora" com o relógio antes do início grava o fim e mostra o erro (sem correção automática, D-C2)', async () => {
    const { user } = await renderScreen()
    fireEvent.change(field('Início', C1), { target: { value: `${D}23:00` } })
    await user.click(within(unitRow(C1)).getByRole('button', { name: 'Finalizar agora' }))
    expect(field('Fim', C1)).toHaveValue(nowKey())
    expect(within(unitRow(C1)).getByRole('alert')).toHaveTextContent('posterior ao início')
    await user.click(saveButton())
    expect(mockSaveConference).not.toHaveBeenCalled()
  })

  it('apagar o início da unidade que só tinha início a tira do mapa (D-C3: unidade vazia não é gravada)', async () => {
    const { user } = await renderScreen({ conference: phoneConference() })
    fireEvent.change(field('Início', C3), { target: { value: '' } })
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(Object.keys(mockSaveConference.mock.calls[0][1].unloadByUnit)).toEqual(['CNT-1', 'CNT-2'])
  })
})

describe('conferência que já tem descarga gravada (ida e volta)', () => {
  it('abre como o celular gravou; um Salvar que muda OUTRA coisa mantém o mapa e os calculados', async () => {
    const { user } = await renderScreen({ conference: phoneConference() })
    expect(unitRow(C1)).toHaveTextContent('1 h 25 min')
    expect(unitRow(C3)).toHaveTextContent('Em andamento')
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('2 h 35 min')
    expect(saveButton()).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Etiquetagem OK' }))
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.unloadByUnit).toEqual(PHONE_MAP)
    expect(payload).toMatchObject({ unloadStartAt: `${D}08:10`, unloadEndAt: `${D}10:30`, receivedDate: '2026-11-27', labelingOk: true })
  })

  it('conferência anterior (início/fim únicos): "Registro anterior (sem unidade)" só leitura; a 1ª edição o leva para o mapa', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }),
    })
    expect(unitRow('Registro anterior (sem unidade)')).toHaveTextContent('2 h 25 min')
    expect(field('Início', 'Registro anterior (sem unidade)')).toBeDisabled()
    expect(saveButton()).toBeDisabled()
    await user.click(within(unitRow(C1)).getByRole('button', { name: 'Iniciar agora' }))
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.unloadByUnit.legado).toEqual({ startAt: '2026-11-24T08:15', endAt: '2026-11-24T10:40' })
    expect(payload.unloadByUnit['CNT-1']).toEqual({ startAt: nowKey(), endAt: '' })
    expect(payload).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
  })

  it('conferência anterior salva SEM mexer na descarga: o início/fim antigos seguem como estavam e a chave nova não nasce', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }),
    })
    await user.click(screen.getByRole('button', { name: 'Etiquetagem OK' }))
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload).toMatchObject({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' })
    expect('unloadByUnit' in payload).toBe(false)
  })

  it('"Remover horários" do registro anterior zera início, fim e data e grava {}', async () => {
    const { user } = await renderScreen({
      conference: conferenceDoc({ unloadStartAt: '2026-11-24T08:15', unloadEndAt: '2026-11-24T10:40', receivedDate: '2026-11-24' }),
    })
    await user.click(within(unitRow('Registro anterior (sem unidade)')).getByRole('button', { name: 'Remover horários' }))
    expect(screen.queryByText('Registro anterior (sem unidade)', { selector: '.ccf-unit__t' })).not.toBeInTheDocument()
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    expect(mockSaveConference.mock.calls[0][1]).toMatchObject({ unloadByUnit: {}, unloadStartAt: '', unloadEndAt: '', receivedDate: '' })
  })

  it('unidade fora do processo nunca some: só leitura, entra no total e sai só com "Remover horários"', async () => {
    const orphan = { ...PHONE_MAP, 'CNT-9': { startAt: `${D}07:00`, endAt: `${D}07:30` } }
    const { user } = await renderScreen({ conference: phoneConference({ unloadByUnit: orphan, unloadStartAt: `${D}07:00` }) })
    const orphanRow = unitRow('Unidade fora do processo')
    expect(orphanRow).toHaveTextContent('30 min')
    expect(field('Início', 'Unidade fora do processo')).toBeDisabled()
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('3 h 5 min')
    await user.click(within(orphanRow).getByRole('button', { name: 'Remover horários' }))
    expect(screen.queryByText('Unidade fora do processo', { selector: '.ccf-unit__t' })).not.toBeInTheDocument()
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('2 h 35 min')
    await user.click(saveButton())
    await waitFor(() => expect(mockSaveConference).toHaveBeenCalledTimes(1))
    const payload = mockSaveConference.mock.calls[0][1]
    expect(payload.unloadByUnit).toEqual(PHONE_MAP)
    expect(payload.unloadStartAt).toBe(`${D}08:10`)
  })
})

describe('somente leitura', () => {
  it('conferência fechada: "Sem fim informado", aviso da unidade sem fim, campos desabilitados e nenhum botão de descarga', async () => {
    await renderScreen({
      conference: phoneConference({
        status: 'fechada',
        closedDate: '2026-11-27',
        closedByName: 'Operador Logística',
        closedById: 'log-1',
        closedDocumentId: 'doc-1',
      }),
    })
    expect(unitRow(C3)).toHaveTextContent('Sem fim informado')
    expect(screen.getByText('1 unidade ficou sem fim e não entra no total.')).toBeInTheDocument()
    expect(field('Início', C1)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /agora/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover horários' })).not.toBeInTheDocument()
  })

  it('admin só acompanha: campos desabilitados e sem botões', async () => {
    await renderScreen({ conference: phoneConference(), profile: ADMIN })
    expect(field('Início', C1)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /agora/ })).not.toBeInTheDocument()
    expect(document.querySelector('.ccf-total > b')).toHaveTextContent('2 h 35 min')
  })
})
