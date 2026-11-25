// S9-F do Relatório de Carga: página /conferencia (ConferencePage): guarda de papel (só logística e admin), só no
// celular (aviso no computador, largura travada na entrada), lista e detalhe por `?processo=`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()
const mockGetCargoReport = vi.fn()
const mockClose = vi.fn()
const mockSave = vi.fn()
const mockReopen = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/services/processesRepository', () => ({
  listProcesses: (...args) => mockListProcesses(...args),
}))
vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportConference: (...args) => mockSave(...args),
  closeCargoReportConference: (...args) => mockClose(...args),
  retryCloseConferenceWrite: vi.fn(),
  reopenCargoReportConference: (...args) => mockReopen(...args),
}))
vi.mock('../../src/features/processes/cargoReportExcel', () => ({
  generateCargoReportFile: vi.fn().mockResolvedValue(new File(['x'], 'FR.CMX.001.xlsx')),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, itemCount: 0, items: [] }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))

import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'
import { resetCargoConferenceCache } from '../../src/features/processes/useCargoConferenceList'
import ConferencePage from '../../src/pages/ConferencePage'

const originalMatchMedia = window.matchMedia
const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sq.com', role: 'logistica' }

const GOOYER = {
  id: 'p1',
  name: 'GOOYER SEA 001-26',
  category: 'FCL',
  supplierName: 'GOOYER CHEMICALS LTD',
  archived: false,
  collectionWindows: [{ id: 'w', scheduledAt: new Date(2099, 0, 5, 10, 0).toISOString() }],
}
const EMBARCADO = { id: 'p2', name: 'FORA SEA 002-26', category: 'FCL', archived: false, processStatus: 'Embarcou' }
const REPORT = {
  current: {
    status: 'concluido',
    revision: 4,
    cargoType: 'FCL',
    titleSuffix: 'GOOYER SEA 001-26',
    rows: [
      { id: 'r-1', dbcorpCode: 'AD5240', sqDescription: 'POLIOL PE-3000', supplierLot: 'L1', quantityKg: 100 },
      { id: 'r-2', dbcorpCode: 'AD5241', sqDescription: 'CATALISADOR ZN-12', supplierLot: 'L2', quantityKg: 200 },
    ],
  },
  conference: {
    revision: 2,
    status: 'aberta',
    okByRowId: {},
    countOkByRowId: {},
    labelsByRowId: {},
    receiptStatus: '',
    nfNumber: '',
    notes: '',
    unloadStartAt: '',
    unloadEndAt: '',
    labelingOk: false,
  },
}

// matchMedia controlável: `max-width: N` casa quando a largura simulada é <= N; `resize` avisa quem ouve.
function stubViewport(initialWidth) {
  let width = initialWidth
  const subscribers = new Set()
  const matchesFor = (query) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return Boolean(max) && Number(max[1]) >= width
  }
  window.matchMedia = (query) => ({
    get matches() {
      return matchesFor(query)
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (type, handler) => {
      if (type === 'change') subscribers.add({ query, handler })
    },
    removeEventListener: (type, handler) => {
      for (const item of [...subscribers]) if (item.handler === handler) subscribers.delete(item)
    },
    dispatchEvent: () => false,
  })
  return {
    resize(next) {
      width = next
      act(() => {
        subscribers.forEach(({ query, handler }) => handler({ matches: matchesFor(query), media: query }))
      })
    },
  }
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderPage({ role = 'logistica', path = '/conferencia', profile } = {}) {
  mockUseAuth.mockReturnValue({ profile: profile ?? { ...LOGISTICA, role }, logout: vi.fn() })
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <UnsavedChangesProvider>
          <Routes>
            <Route path="/" element={<div>Início do Portal</div>} />
            <Route path="/processos" element={<div>Tela de Chegadas</div>} />
            <Route path="/conferencia" element={<ConferencePage />} />
          </Routes>
          <LocationProbe />
        </UnsavedChangesProvider>
      </MemoryRouter>
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCargoConferenceCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockListProcesses.mockResolvedValue([GOOYER, EMBARCADO])
  mockGetCargoReport.mockResolvedValue(REPORT)
  mockClose.mockResolvedValue({ revision: 3, documentId: 'doc-9' })
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  console.error.mockRestore?.()
})

describe('papéis', () => {
  it.each(['logistica', 'admin'])('%s no celular: vê a lista com o processo candidato', async (role) => {
    stubViewport(390)
    renderPage({ role })
    expect(await screen.findByText('GOOYER SEA 001-26')).toBeInTheDocument()
    expect(screen.getByText(role === 'admin' ? 'Admin · só acompanha' : 'Logística')).toBeInTheDocument()
    // Só o candidato é lido; o processo fora das fases da lista não gera leitura de relatório.
    await waitFor(() => expect(mockGetCargoReport).toHaveBeenCalledTimes(1))
    expect(mockGetCargoReport).toHaveBeenCalledWith('p1')
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('FORA SEA 002-26')).not.toBeInTheDocument()
  })

  it.each(['user', 'tecnico', 'faturamento', 'compras', 'viewer'])(
    '%s: cai no início e nunca lê processos nem relatórios',
    async (role) => {
      stubViewport(390)
      renderPage({ role })
      expect(await screen.findByText('Início do Portal')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/')
      expect(mockListProcesses).not.toHaveBeenCalled()
      expect(mockGetCargoReport).not.toHaveBeenCalled()
    }
  )

  it('papel desconhecido (sem claim) também cai no início', async () => {
    stubViewport(390)
    renderPage({ profile: { uid: 'x', name: 'Sem papel' } })
    expect(await screen.findByText('Início do Portal')).toBeInTheDocument()
    expect(mockGetCargoReport).not.toHaveBeenCalled()
  })
})

describe('computador', () => {
  it('abrir a rota a 1440 px mostra o aviso e "Ir para Chegadas"; nada é lido', async () => {
    stubViewport(1440)
    const user = userEvent.setup()
    renderPage()
    expect(
      screen.getByText(
        'A aba Conferência é só para o celular. No computador, confira em Chegadas › processo › Documentos › Relatório de Carga.'
      )
    ).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Ir para Chegadas' })
    expect(button).toHaveClass('secondary-button')
    expect(mockListProcesses).not.toHaveBeenCalled()
    expect(mockGetCargoReport).not.toHaveBeenCalled()
    await user.click(button)
    expect(await screen.findByText('Tela de Chegadas')).toBeInTheDocument()
  })

  it('o aviso do computador só aparece depois da checagem de papel (usuário comum cai no início)', async () => {
    stubViewport(1440)
    renderPage({ role: 'user' })
    expect(await screen.findByText('Início do Portal')).toBeInTheDocument()
    expect(screen.queryByText(/só para o celular/)).not.toBeInTheDocument()
  })
})

describe('detalhe por ?processo= e largura travada', () => {
  it('abre a conferência do processo, o voltar da tela volta à lista', async () => {
    stubViewport(390)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /GOOYER SEA 001-26/ }))
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/conferencia?processo=p1')
    expect(screen.getByRole('heading', { level: 2, name: 'GOOYER SEA 001-26' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Voltar para a lista' }))
    expect(await screen.findByRole('button', { name: /GOOYER SEA 001-26/ })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/conferencia$/)
  })

  it('entrada direta por ?processo=<id>: carrega a lista, acha o processo e abre', async () => {
    stubViewport(390)
    renderPage({ path: '/conferencia?processo=p1' })
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'GOOYER SEA 001-26' })).toBeInTheDocument()
  })

  it('?processo= inexistente (ou fora da lista): aviso e "Voltar à lista"', async () => {
    stubViewport(390)
    const user = userEvent.setup()
    renderPage({ path: '/conferencia?processo=p2' })
    expect(await screen.findByText('Este processo não está na lista de conferência.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/conferencia$/)
  })

  it('girar o celular para paisagem (> 720 px) no meio da conferência NÃO desmonta a tela nem perde o que foi marcado', async () => {
    const viewport = stubViewport(390)
    const user = userEvent.setup()
    renderPage({ path: '/conferencia?processo=p1' })
    await screen.findByRole('tablist')
    await user.click(screen.getByRole('button', { name: 'OK? da linha 1' }))
    expect(screen.getByRole('button', { name: 'OK? da linha 1' })).toHaveAttribute('aria-pressed', 'true')

    viewport.resize(900)

    expect(screen.queryByText(/só para o celular/)).not.toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK? da linha 1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a lista também segue montada depois de girar', async () => {
    const viewport = stubViewport(390)
    renderPage()
    expect(await screen.findByText('GOOYER SEA 001-26')).toBeInTheDocument()
    viewport.resize(900)
    expect(screen.getByText('GOOYER SEA 001-26')).toBeInTheDocument()
  })

})

// Depois de salvar ou reabrir, a lista (cartão, chips e filtro) relê só o processo afetado.
describe('lista atualizada depois de salvar e reabrir', () => {
  const NOVA = {
    id: 'p3',
    name: 'NOVA SEA 034-26',
    category: 'LCL',
    supplierName: 'NOVA POLYMERS',
    archived: false,
    collectionStatus: 'Veículo no CD para descarga',
  }
  const ORION = {
    id: 'p4',
    name: 'ORION SEA 007-26',
    category: 'FCL',
    supplierName: 'ORION CHEM CO',
    archived: false,
    collectionStatus: 'Carga disponível em estoque',
  }
  let store

  const reportOf = (title, conference) => ({
    current: { ...REPORT.current, titleSuffix: title },
    conference: { ...REPORT.conference, ...conference },
  })

  beforeEach(() => {
    store = {
      p1: structuredClone(REPORT),
      p3: reportOf('NOVA SEA 034-26', {}),
      p4: reportOf('ORION SEA 007-26', {
        status: 'fechada',
        closedDate: '2026-11-21',
        closedByName: 'Op',
        closedDocumentId: 'doc-1',
        okByRowId: { 'r-1': true, 'r-2': true },
        countOkByRowId: { 'r-1': true, 'r-2': true },
      }),
    }
    mockListProcesses.mockResolvedValue([GOOYER, NOVA, ORION])
    mockGetCargoReport.mockImplementation(async (id) => structuredClone(store[id]))
    mockSave.mockImplementation(async (id, payload) => {
      store[id].conference = { ...payload }
      return { revision: payload.revision }
    })
    mockClose.mockImplementation(async (id, { payload }) => {
      store[id].conference = { ...payload, closedDocumentId: 'doc-9' }
      return { revision: payload.revision, documentId: 'doc-9' }
    })
    mockReopen.mockImplementation(async (id) => {
      store[id].conference = { ...store[id].conference, status: 'aberta', revision: 9, closedDocumentId: '' }
      return { revision: 9 }
    })
  })

  const chip = (name) => screen.getByRole('button', { name })
  const entryTitles = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('ccf-entry'))
      .map((button) => button.querySelector('.ccf-entry__title').textContent)

  it('salvar: o cartão volta com o novo "X de Y itens conferidos"', async () => {
    stubViewport(390)
    const user = userEvent.setup()
    renderPage()
    const card = await screen.findByRole('button', { name: /GOOYER SEA 001-26/ })
    expect(card).toHaveTextContent('0 de 2 itens conferidos')
    await user.click(card)
    await screen.findByRole('tablist')
    await user.click(screen.getByRole('button', { name: 'Marcar todos OK' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await screen.findByText(/^Conferência salva às/)
    await user.click(screen.getByRole('button', { name: 'Voltar para a lista' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /GOOYER SEA 001-26/ })).toHaveTextContent('2 de 2 itens conferidos')
    )
  })

  it('reabrir (admin): o processo volta para "Para conferir"', async () => {
    stubViewport(390)
    const user = userEvent.setup()
    renderPage({ role: 'admin' })
    await screen.findByRole('button', { name: /NOVA SEA 034-26/ })
    await user.click(chip(/Fechadas/))
    await user.click(await screen.findByRole('button', { name: /ORION SEA 007-26/ }))
    await screen.findByRole('tablist')
    await user.click(screen.getByRole('button', { name: 'Reabrir conferência' }))
    await screen.findByText('Conferência reaberta. A logística pode corrigir e fechar de novo.')
    await user.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    await screen.findByRole('searchbox')
    await waitFor(() => expect(chip(/Fechadas/)).toHaveTextContent('Fechadas0'))
    expect(chip(/Para conferir/)).toHaveTextContent('Para conferir3')
    await user.click(chip(/Para conferir/))
    expect(entryTitles()).toContain('ORION SEA 007-26')
  })

  it('?processo= com a lista em erro: mostra o erro de carga e "Tentar novamente" recarrega', async () => {
    stubViewport(390)
    const user = userEvent.setup()
    mockListProcesses.mockReset()
    mockListProcesses.mockRejectedValueOnce(new Error('rede'))
    mockListProcesses.mockResolvedValue([GOOYER])
    renderPage({ path: '/conferencia?processo=p1' })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar os processos.')
    expect(screen.queryByText('Este processo não está na lista de conferência.')).not.toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })
})
