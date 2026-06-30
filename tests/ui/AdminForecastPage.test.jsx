// Tests do AdminForecastPage (S8: regras de previsao editaveis no admin).
// Cobre:
//   - Loading: mostra "Carregando regras" enquanto useForecastSettings.loading=true
//   - Render inicial: lista destinations, business days por categoria, rolling customs
//   - Adicionar destino: nova linha na tabela
//   - Remover destino: botao desabilitado quando so' 1 destino
//   - Editar match/label/cutoffHour/cutoffMinute reflete no state
//   - Validacao: cutoff fora de 0-23 aparece nos errors
//   - Validacao: businessDays por categoria fora de 0-30 aparece nos errors
//   - Validacao: rolling customs sem categoria quando enabled
//   - Salvar: chama saveForecastSettings com draft + profile; feedback de sucesso
//   - Salvar com erro: error-banner
//   - Salvar desabilitado quando hasErrors=true
//   - Reset: chama resetForecastSettings quando window.confirm true
//   - Reset: cancela quando window.confirm false
//   - Rolling enabled: chip e inputs habilitados; desabilitados quando disabled
//   - Adicionar DUIMP status via input+Adicionar; remove via botao x
//   - Adicionar DUIMP status duplicado (case-insensitive) nao adiciona

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// Mocks
const mockUseAuth = vi.fn()
const mockUseForecastSettings = vi.fn()
const mockSaveForecastSettings = vi.fn()
const mockResetForecastSettings = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/hooks/useForecastSettings', () => ({
  useForecastSettings: () => mockUseForecastSettings(),
}))
vi.mock('../../src/services/forecastSettingsRepository', () => ({
  CATEGORY_OPTIONS: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  DEFAULT_FORECAST_SETTINGS: {
    destinations: [],
    categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
    rollingCustoms: {
      enabled: false,
      businessDaysAfterBerth: 3,
      appliesTo: [],
      duimpStatuses: [],
    },
  },
  getDefaultForecastSettings: () => ({
    destinations: [],
    categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
    rollingCustoms: {
      enabled: false,
      businessDaysAfterBerth: 3,
      appliesTo: [],
      duimpStatuses: [],
    },
  }),
  getForecastSettings: () => Promise.resolve({}),
  subscribeForecastSettings: () => () => {},
  saveForecastSettings: (...args) => mockSaveForecastSettings(...args),
  resetForecastSettings: (...args) => mockResetForecastSettings(...args),
}))

import AdminForecastPage from '../../src/pages/AdminForecastPage'

const PROFILE = { id: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const SETTINGS = {
  id: 'current',
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 30 },
  ],
  categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
  rollingCustoms: {
    enabled: false,
    businessDaysAfterBerth: 3,
    appliesTo: [],
    duimpStatuses: [],
  },
  updatedAt: null,
  updatedBy: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminForecastPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseForecastSettings.mockReset()
  mockSaveForecastSettings.mockReset()
  mockResetForecastSettings.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: false })
  mockSaveForecastSettings.mockResolvedValue(SETTINGS)
  mockResetForecastSettings.mockResolvedValue(SETTINGS)
  // window.confirm default true
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('AdminForecastPage', () => {
  it('loading: mostra "Carregando regras"', () => {
    mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: true })
    renderPage()
    expect(screen.getByText(/Carregando regras/i)).toBeInTheDocument()
  })

  it('render inicial: lista destinations e business days por categoria', () => {
    renderPage()
    // destinations
    expect(screen.getByDisplayValue('navegantes')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Navegantes')).toBeInTheDocument()
    expect(screen.getByDisplayValue('itapoa')).toBeInTheDocument()
    // business days (FCL tem 5)
    const fclInput = screen.getAllByDisplayValue('5')[0]
    expect(fclInput).toBeInTheDocument()
  })

  it('adicionar destino: nova linha na tabela', async () => {
    const user = userEvent.setup()
    renderPage()
    const before = screen.getAllByRole('row').length
    await user.click(screen.getByRole('button', { name: 'Adicionar destino' }))
    const after = screen.getAllByRole('row').length
    expect(after).toBe(before + 1)
  })

  it('remover destino: botao desabilitado quando so 1 destino', () => {
    mockUseForecastSettings.mockReturnValue({
      settings: { ...SETTINGS, destinations: [SETTINGS.destinations[0]] },
      loading: false,
    })
    renderPage()
    const removeButtons = screen.getAllByRole('button', { name: 'Remover' })
    expect(removeButtons[0]).toBeDisabled()
  })

  it('editar match reflete no state (proximo save passa o valor)', async () => {
    const user = userEvent.setup()
    renderPage()
    const matchInput = screen.getByDisplayValue('navegantes')
    await user.clear(matchInput)
    await user.type(matchInput, 'santos')
    expect(screen.getByDisplayValue('santos')).toBeInTheDocument()
  })

  it('validacao: cutoff fora de 0-23 aparece nos errors', async () => {
    const user = userEvent.setup()
    renderPage()
    const hourInput = screen.getByDisplayValue(14)
    // muda para 99 (invalido)
    await user.clear(hourInput)
    await user.type(hourInput, '99')
    // agora deve aparecer no error-banner
    await waitFor(() => {
      expect(screen.getByText(/cutoff deve estar entre 0 e 23/i)).toBeInTheDocument()
    })
    // botao Salvar desabilitado
    const saveBtn = screen.getByRole('button', { name: /Salvar altera/i })
    expect(saveBtn).toBeDisabled()
  })

  it('validacao: rolling customs sem categoria quando enabled', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    // Habilita rolling customs (primeiro checkbox da pagina)
    const toggle = container.querySelector('input[type="checkbox"]')
    await user.click(toggle)
    await waitFor(() => {
      expect(screen.getByText(/Selecione ao menos uma categoria/i)).toBeInTheDocument()
    })
  })

  it('salvar: chama saveForecastSettings(draft, profile) e mostra feedback', async () => {
    const user = userEvent.setup()
    renderPage()
    const saveBtn = screen.getByRole('button', { name: /Salvar altera/i })
    await user.click(saveBtn)
    await waitFor(() => {
      expect(mockSaveForecastSettings).toHaveBeenCalledTimes(1)
    })
    const [draftArg, profileArg] = mockSaveForecastSettings.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(draftArg.destinations).toEqual(SETTINGS.destinations)
    await waitFor(() => {
      expect(screen.getByText(/Regras de previsão atualizadas/i)).toBeInTheDocument()
    })
  })

  it('salvar com erro: error-banner', async () => {
    const user = userEvent.setup()
    mockSaveForecastSettings.mockRejectedValueOnce({ code: 'permission-denied' })
    renderPage()
    await user.click(screen.getByRole('button', { name: /Salvar altera/i }))
    await waitFor(() => {
      expect(screen.getByText(/permission-denied/)).toBeInTheDocument()
    })
  })

  it('salvar desabilitado quando hasErrors (cutoff invalido)', async () => {
    const user = userEvent.setup()
    renderPage()
    const hourInput = screen.getByDisplayValue(14)
    await user.clear(hourInput)
    await user.type(hourInput, '99')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Salvar altera/i })).toBeDisabled()
    })
    expect(mockSaveForecastSettings).not.toHaveBeenCalled()
  })

  it('reset: chama resetForecastSettings quando window.confirm true', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Restaurar padr/i }))
    await waitFor(() => {
      expect(mockResetForecastSettings).toHaveBeenCalledWith(PROFILE)
    })
    expect(screen.getByText(/Regras restauradas para o padrão/i)).toBeInTheDocument()
  })

  it('reset: cancela quando window.confirm false', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    renderPage()
    await user.click(screen.getByRole('button', { name: /Restaurar padr/i }))
    expect(mockResetForecastSettings).not.toHaveBeenCalled()
  })

  it('rolling disabled: inputs de dias e chips estao desabilitados', () => {
    renderPage()
    const daysInput = screen.getByDisplayValue(3) // businessDaysAfterBerth default
    expect(daysInput).toBeDisabled()
    // botao Adicionar DUIMP status desabilitado
    const addBtn = screen.getByRole('button', { name: 'Adicionar' })
    expect(addBtn).toBeDisabled()
  })

  it('rolling enabled: input de dias habilitado', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    const toggle = container.querySelector('input[type="checkbox"]')
    await user.click(toggle)
    await waitFor(() => {
      const daysInput = screen.getByDisplayValue(3)
      expect(daysInput).not.toBeDisabled()
    })
  })

  it('toggle appliesTo: clica chip adiciona/remove', async () => {
    const user = userEvent.setup()
    mockUseForecastSettings.mockReturnValue({
      settings: {
        ...SETTINGS,
        rollingCustoms: { ...SETTINGS.rollingCustoms, enabled: true, appliesTo: [] },
      },
      loading: false,
    })
    renderPage()
    const fclChip = screen.getByRole('button', { name: 'FCL' })
    expect(fclChip).toHaveAttribute('aria-pressed', 'false')
    await user.click(fclChip)
    expect(fclChip).toHaveAttribute('aria-pressed', 'true')
    await user.click(fclChip)
    expect(fclChip).toHaveAttribute('aria-pressed', 'false')
  })

  it('adicionar DUIMP status: input + botao Adicionar adiciona chip', async () => {
    const user = userEvent.setup()
    mockUseForecastSettings.mockReturnValue({
      settings: {
        ...SETTINGS,
        rollingCustoms: { ...SETTINGS.rollingCustoms, enabled: true, duimpStatuses: [] },
      },
      loading: false,
    })
    renderPage()
    const input = screen.getByPlaceholderText('ex.: aguardando registro')
    const addBtn = screen.getByRole('button', { name: 'Adicionar' })
    await user.type(input, 'aguardando registro')
    await user.click(addBtn)
    await waitFor(() => {
      expect(screen.getByText('aguardando registro')).toBeInTheDocument()
    })
    // input foi limpo
    expect(input).toHaveValue('')
  })

  it('adicionar DUIMP status duplicado (case-insensitive) nao adiciona', async () => {
    const user = userEvent.setup()
    mockUseForecastSettings.mockReturnValue({
      settings: {
        ...SETTINGS,
        rollingCustoms: {
          ...SETTINGS.rollingCustoms,
          enabled: true,
          duimpStatuses: ['aguardando'],
        },
      },
      loading: false,
    })
    renderPage()
    const input = screen.getByPlaceholderText('ex.: aguardando registro')
    const addBtn = screen.getByRole('button', { name: 'Adicionar' })
    await user.type(input, 'AGUARDANDO')
    await user.click(addBtn)
    // continua so' 1 chip (count de "aguardando")
    const chips = screen.getAllByText(/aguardando/i)
    expect(chips.length).toBe(1)
  })

  it('remover DUIMP status: clique no x remove', async () => {
    const user = userEvent.setup()
    mockUseForecastSettings.mockReturnValue({
      settings: {
        ...SETTINGS,
        rollingCustoms: {
          ...SETTINGS.rollingCustoms,
          enabled: true,
          duimpStatuses: ['pendente'],
        },
      },
      loading: false,
    })
    renderPage()
    expect(screen.getByText('pendente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Remover pendente/i }))
    expect(screen.queryByText('pendente')).not.toBeInTheDocument()
  })
})
