// F17.6: testes do painel /admin/lead-time.
// Cobre:
//   (a) dataset vazio -> "Dados insuficientes"
//   (b) dataset com 3 amostras FCL/Navegantes -> mediana/P80/n na tabela
//   (c) 5 amostras com mediana acima do atual -> botao "Aplicar 6 dias" + clique chama saveForecastSettings
//   (d) sem sugestao (n<5) -> nenhum botao "Aplicar"
//   (e) saveForecastSettings NAO e' chamado sem clique (render + troca de periodo)
//   (f) erro de load -> error-banner
//   (g) troca de periodo filtra (amostra antiga some)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseAuth = vi.fn()
const mockUseForecastSettings = vi.fn()
const mockLoadLeadTimeDataset = vi.fn()
const mockSaveForecastSettings = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/hooks/useForecastSettings', () => ({
  useForecastSettings: () => mockUseForecastSettings(),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  loadLeadTimeDataset: (...args) => mockLoadLeadTimeDataset(...args),
}))
vi.mock('../../src/services/forecastSettingsRepository', () => ({
  saveForecastSettings: (...args) => mockSaveForecastSettings(...args),
}))

import AdminLeadTimePanel from '../../src/features/admin/AdminLeadTimePanel'

const PROFILE = { id: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const SETTINGS = {
  id: 'current',
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 },
  ],
  categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
}

function makeEvent(type, occurredAt, extra = {}) {
  return { type, occurredAt, value: extra.value ?? '', recordedAt: extra.recordedAt ?? occurredAt }
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <AdminLeadTimePanel />
    </MemoryRouter>
  )
}

// 3 processos FCL/Navegantes com transit (shipped->berthed) = 10, 12, 14 dias.
function buildThreeSampleDataset() {
  const processes = [
    { id: 'p1', category: 'FCL', destination: 'NAVEGANTES - SC' },
    { id: 'p2', category: 'FCL', destination: 'NAVEGANTES - SC' },
    { id: 'p3', category: 'FCL', destination: 'NAVEGANTES - SC' },
  ]
  const eventsByProcessId = {
    p1: [makeEvent('shipped', '2026-08-01T12:00:00.000Z'), makeEvent('berthed', '2026-08-11T12:00:00.000Z')],
    p2: [makeEvent('shipped', '2026-08-01T12:00:00.000Z'), makeEvent('berthed', '2026-08-13T12:00:00.000Z')],
    p3: [makeEvent('shipped', '2026-08-01T12:00:00.000Z'), makeEvent('berthed', '2026-08-15T12:00:00.000Z')],
  }
  return { processes, eventsByProcessId }
}

// 5 processos FCL/Navegantes com arrivalToReceiptBusiness = 5,6,6,7,7 dias uteis
// (berthed segunda, received N dias uteis depois - sem feriado no intervalo).
function buildFiveSampleDataset() {
  const processes = [1, 2, 3, 4, 5].map((n) => ({
    id: `p${n}`,
    category: 'FCL',
    destination: 'NAVEGANTES - SC',
  }))
  const receivedDates = [
    '2026-09-14T12:00:00.000Z', // +5 dias uteis
    '2026-09-15T12:00:00.000Z', // +6
    '2026-09-15T12:00:00.000Z', // +6
    '2026-09-16T12:00:00.000Z', // +7
    '2026-09-16T12:00:00.000Z', // +7
  ]
  const eventsByProcessId = {}
  processes.forEach((process, index) => {
    eventsByProcessId[process.id] = [
      makeEvent('berthed', '2026-09-07T12:00:00.000Z'),
      makeEvent('received', receivedDates[index]),
    ]
  })
  return { processes, eventsByProcessId }
}

// 4 amostras (abaixo do minimo pra sugerir, n=4 >= MIN_SAMPLE_SIZE=3 pra exibir).
function buildFourSampleDataset() {
  const processes = [1, 2, 3, 4].map((n) => ({
    id: `p${n}`,
    category: 'FCL',
    destination: 'NAVEGANTES - SC',
  }))
  const receivedDates = [
    '2026-09-14T12:00:00.000Z',
    '2026-09-15T12:00:00.000Z',
    '2026-09-15T12:00:00.000Z',
    '2026-09-16T12:00:00.000Z',
  ]
  const eventsByProcessId = {}
  processes.forEach((process, index) => {
    eventsByProcessId[process.id] = [
      makeEvent('berthed', '2026-09-07T12:00:00.000Z'),
      makeEvent('received', receivedDates[index]),
    ]
  })
  return { processes, eventsByProcessId }
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseForecastSettings.mockReset()
  mockLoadLeadTimeDataset.mockReset()
  mockSaveForecastSettings.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: false })
  mockSaveForecastSettings.mockResolvedValue(SETTINGS)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('AdminLeadTimePanel', () => {
  it('(a) dataset vazio -> "Dados insuficientes"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue({ processes: [], eventsByProcessId: {} })
    renderPanel()
    expect(await screen.findByText('Dados insuficientes')).toBeInTheDocument()
  })

  it('(b) dataset com 3 amostras FCL/Navegantes -> mediana/P80/n na tabela', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildThreeSampleDataset())
    renderPanel()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'FCL' })).toBeInTheDocument())
    // Aparece 2x (linha "Navegantes" + linha "Todos os portos", mesmo porto único).
    expect(screen.getAllByText(/Mediana 12 d · P80 14 d/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('n = 3').length).toBeGreaterThan(0)
  })

  it('(c) 5 amostras com mediana acima do atual -> "Aplicar 6 dias" + clique chama saveForecastSettings', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildFiveSampleDataset())
    renderPanel()
    const applyButton = await screen.findByRole('button', { name: 'Aplicar 6 dias' })

    const user = userEvent.setup()
    await user.click(applyButton)

    await waitFor(() => expect(mockSaveForecastSettings).toHaveBeenCalledTimes(1))
    const [draft] = mockSaveForecastSettings.mock.calls[0]
    expect(draft.categoryBusinessDays.FCL).toBe(6)
    expect(draft.categoryBusinessDays.LCL).toBe(7)
    expect(draft.categoryBusinessDays.AEREO).toBe(10)
    expect(draft.categoryBusinessDays.CONSOLIDADO).toBe(5)
  })

  it('(d) sem sugestao (n<5) -> nenhum botao "Aplicar"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildFourSampleDataset())
    renderPanel()
    await waitFor(() => expect(screen.getAllByText(/sem sugestão/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: /Aplicar \d+ dias/ })).not.toBeInTheDocument()
  })

  it('(e) saveForecastSettings NAO e chamado sem clique (render + troca de periodo)', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildFiveSampleDataset())
    renderPanel()
    await screen.findByRole('button', { name: 'Aplicar 6 dias' })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox'), '365')

    expect(mockSaveForecastSettings).not.toHaveBeenCalled()
  })

  it('(f) erro de load -> error-banner', async () => {
    mockLoadLeadTimeDataset.mockRejectedValue(new Error('boom'))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar/)).toBeInTheDocument()
  })

  it('(g) troca de periodo filtra (amostra antiga some)', async () => {
    // Datas relativas ao relogio real (sem fake timers) - >180 dias atras
    // garante exclusao no periodo default independente da data de hoje.
    function isoDaysAgo(days) {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() - days)
      date.setUTCHours(12, 0, 0, 0)
      return date.toISOString()
    }

    const processes = [
      { id: 'old1', category: 'FCL', destination: 'NAVEGANTES - SC' },
      { id: 'old2', category: 'FCL', destination: 'NAVEGANTES - SC' },
      { id: 'old3', category: 'FCL', destination: 'NAVEGANTES - SC' },
    ]
    const eventsByProcessId = {
      old1: [makeEvent('shipped', isoDaysAgo(330)), makeEvent('berthed', isoDaysAgo(320))],
      old2: [makeEvent('shipped', isoDaysAgo(330)), makeEvent('berthed', isoDaysAgo(318))],
      old3: [makeEvent('shipped', isoDaysAgo(330)), makeEvent('berthed', isoDaysAgo(316))],
    }
    mockLoadLeadTimeDataset.mockResolvedValue({ processes, eventsByProcessId })

    renderPanel()
    await screen.findByText('Dados insuficientes')

    const user = userEvent.setup()
    await user.selectOptions(screen.getByRole('combobox'), 'all')

    await waitFor(() => expect(screen.getByRole('heading', { name: 'FCL' })).toBeInTheDocument())
    expect(screen.getAllByText('n = 3').length).toBeGreaterThan(0)
  })
})
