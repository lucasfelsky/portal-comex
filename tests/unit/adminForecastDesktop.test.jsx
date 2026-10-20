// Refino F6b: arvore DESKTOP da pagina Previsoes (AdminPrevisoes.dc.html): barra de status no topo (origem dos
// dados + ultima atualizacao + Restaurar/Salvar) e cartoes em 2 colunas. O desktop e escolhido por
// matchMedia('(min-width: 1041px)'); a arvore legada (tablet/mobile) segue coberta por
// tests/ui/AdminForecastPage.test.jsx (matchMedia ausente = legado). Fica em tests/unit para nao entrar na
// contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const state = vi.hoisted(() => ({ firebaseConfigured: true }))
const mockUseAuth = vi.fn()
const mockUseForecastSettings = vi.fn()
const mockSave = vi.fn()
const mockReset = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/hooks/useForecastSettings', () => ({ useForecastSettings: () => mockUseForecastSettings() }))
vi.mock('../../src/lib/firebase', () => ({
  get isFirebaseConfigured() {
    return state.firebaseConfigured
  },
}))
vi.mock('../../src/services/forecastSettingsRepository', () => ({
  CATEGORY_OPTIONS: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  DEFAULT_FORECAST_SETTINGS: {},
  getDefaultForecastSettings: () => ({
    destinations: [],
    categoryBusinessDays: { FCL: 5, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
    rollingCustoms: { enabled: false, businessDaysAfterBerth: 3, appliesTo: [], duimpStatuses: [] },
  }),
  saveForecastSettings: (...args) => mockSave(...args),
  resetForecastSettings: (...args) => mockReset(...args),
}))

import AdminForecastPage from '../../src/pages/AdminForecastPage'

// --- matchMedia controlavel -------------------------------------------------
function installMatchMedia(initialDesktop = true) {
  let desktop = initialDesktop
  const listeners = new Set()
  window.matchMedia = vi.fn((query) => {
    const isDesktopQuery = query.includes('min-width: 1041px')
    return {
      get matches() {
        return isDesktopQuery ? desktop : false
      },
      media: query,
      onchange: null,
      addEventListener: (type, fn) => {
        if (type === 'change' && isDesktopQuery) listeners.add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && isDesktopQuery) listeners.delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  return {
    listeners,
    setDesktop(value) {
      desktop = value
      act(() => {
        listeners.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia
let media

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }
const thisYear = new Date().getFullYear()

const SETTINGS = {
  id: 'current',
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 30 },
  ],
  categoryBusinessDays: { FCL: 3, LCL: 5, AEREO: 2, CONSOLIDADO: 4 },
  rollingCustoms: {
    enabled: true,
    businessDaysAfterBerth: 3,
    appliesTo: ['FCL', 'CONSOLIDADO'],
    duimpStatuses: ['aguardando registro', 'aguardando parametrizacao'],
  },
  operationalAlerts: { clearanceOverdueDays: 2 },
  updatedAt: new Date(thisYear, 9, 18, 17, 20).toISOString(),
  updatedBy: { uid: 'u1', name: 'Mariana Souza' },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminForecastPage />
    </MemoryRouter>
  )
}

const saveButton = () => screen.getByRole('button', { name: /Salvar altera|Salvando/ })

beforeEach(() => {
  state.firebaseConfigured = true
  mockUseAuth.mockReset()
  mockUseForecastSettings.mockReset()
  mockSave.mockReset()
  mockReset.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: false })
  mockSave.mockImplementation((draft) => Promise.resolve({ ...SETTINGS, ...draft }))
  mockReset.mockResolvedValue(SETTINGS)
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('Previsoes - desktop (>= 1041px): estrutura e barra de status', () => {
  it('raiz .admin-panel--forecast, sem os cartoes/toolbar da arvore anterior, e 4 cartoes com os titulos do mock', () => {
    const { container } = renderPage()
    expect(container.querySelector('.admin-panel.admin-panel--forecast')).not.toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    expect(container.querySelector('.admin-toolbar')).toBeNull()
    expect(container.querySelector('.admin-feature-footer')).toBeNull()
    for (const title of ['Destinos e cutoff', 'Dias úteis por categoria', 'Rolling customs forecast', 'Alertas operacionais']) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }
  })

  it('barra: "Firestore ativo · Última atualização dd/mm HH:MM por <nome>" com Restaurar padroes e Salvar alteracoes', () => {
    const { container } = renderPage()
    const status = container.querySelector('.af-status')
    expect(status).toHaveTextContent('Firestore ativo · Última atualização 18/10 17:20 por Mariana Souza')
    expect(status.querySelector('strong')).toHaveTextContent('18/10 17:20')
    expect(status.querySelector('.af-status__dot')).not.toHaveClass('af-status__dot--fallback')
    const bar = container.querySelector('.af-bar')
    expect(within(bar).getByRole('button', { name: 'Restaurar padrões' })).toHaveClass('secondary-button')
    expect(within(bar).getByRole('button', { name: 'Salvar alterações' })).toHaveClass('primary-button')
  })

  it('origem "Fallback local" quando o Firebase nao esta configurado (ponto de aviso)', () => {
    state.firebaseConfigured = false
    const { container } = renderPage()
    expect(container.querySelector('.af-status')).toHaveTextContent(/^Fallback local · Última atualização/)
    expect(container.querySelector('.af-status__dot')).toHaveClass('af-status__dot--fallback')
    expect(screen.queryByText('Firestore ativo')).not.toBeInTheDocument()
  })

  it('sem historico: "sem alterações registradas ainda"; outro ano mostra o ano; sem autor omite o "por"', () => {
    mockUseForecastSettings.mockReturnValue({ settings: { ...SETTINGS, updatedAt: null, updatedBy: null }, loading: false })
    const first = renderPage()
    expect(first.container.querySelector('.af-status')).toHaveTextContent(
      'Firestore ativo · Última atualização sem alterações registradas ainda'
    )
    first.unmount()

    mockUseForecastSettings.mockReturnValue({
      settings: { ...SETTINGS, updatedAt: new Date(2020, 0, 5, 8, 7).toISOString(), updatedBy: null },
      loading: false,
    })
    const second = renderPage()
    expect(second.container.querySelector('.af-status')).toHaveTextContent(
      'Firestore ativo · Última atualização 05/01/2020 08:07'
    )
    expect(second.container.querySelector('.af-status')).not.toHaveTextContent(' por ')
  })

  it('carregando: esqueleto dentro da moldura desktop (sem cartoes)', () => {
    mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: true })
    const { container } = renderPage()
    expect(container.querySelector('.admin-panel--forecast .skeleton')).not.toBeNull()
    expect(container.querySelector('.af-card')).toBeNull()
  })
})

describe('Previsoes - desktop: Destinos e cutoff', () => {
  it('tabela Match / Rotulo / Cutoff (h) / Min com um destino por linha e a nota de Brasilia', () => {
    const { container } = renderPage()
    const table = container.querySelector('.af-table')
    const headers = within(table).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers.slice(0, 4)).toEqual(['Match', 'Rótulo', 'Cutoff (h)', 'Min'])
    expect(screen.getByLabelText('Match do destino 1')).toHaveValue('navegantes')
    expect(screen.getByLabelText('Rótulo do destino 1')).toHaveValue('Navegantes')
    expect(screen.getByLabelText('Cutoff em horas do destino 2')).toHaveValue(12)
    expect(screen.getByLabelText('Minutos do destino 2')).toHaveValue(30)
    expect(screen.getByLabelText('Match do destino 1')).toHaveClass('text-input--mono')
    expect(screen.getByText('Horário de Brasília (UTC−03).')).toBeInTheDocument()
    expect(screen.getByText(/Match é comparado \(sem acento, case-insensitive\)/)).toBeInTheDocument()
  })

  it('"+ Adicionar destino" cria linha vazia marcada como invalida; Remover tira a linha e trava na ultima', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: '+ Adicionar destino' }))
    expect(screen.getByLabelText('Match do destino 3')).toHaveValue('')
    expect(screen.getByLabelText('Match do destino 3')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Cutoff em horas do destino 3')).toHaveValue(12)
    expect(saveButton()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remover destino 3' }))
    expect(screen.queryByLabelText('Match do destino 3')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remover destino 2' }))
    expect(screen.getByRole('button', { name: 'Remover destino 1' })).toBeDisabled()
  })

  it('editar cutoff e salvar: saveForecastSettings(draft, profile) e aviso de sucesso', async () => {
    const user = userEvent.setup()
    renderPage()
    const hour = screen.getByLabelText('Cutoff em horas do destino 1')
    await user.clear(hour)
    await user.type(hour, '15')
    await user.click(saveButton())
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    const [draft, profileArg] = mockSave.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(Number(draft.destinations[0].cutoffHour)).toBe(15)
    expect(await screen.findByText(/Regras de previsão atualizadas/)).toBeInTheDocument()
  })

  it('erro de validacao: lista os problemas, marca os campos e trava o Salvar', async () => {
    const user = userEvent.setup()
    renderPage()
    const hour = screen.getByLabelText('Cutoff em horas do destino 1')
    await user.clear(hour)
    await user.type(hour, '25')
    const minute = screen.getByLabelText('Minutos do destino 2')
    await user.clear(minute)
    await user.type(minute, '75')
    expect(screen.getByText('Verifique os campos:')).toBeInTheDocument()
    expect(screen.getByText('Destino 1: cutoff deve estar entre 0 e 23.')).toBeInTheDocument()
    expect(screen.getByText('Destino 2: minuto deve estar entre 0 e 59.')).toBeInTheDocument()
    expect(hour).toHaveAttribute('aria-invalid', 'true')
    expect(minute).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Cutoff em horas do destino 2')).not.toHaveAttribute('aria-invalid')
    expect(saveButton()).toBeDisabled()
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('erro ao salvar: mensagem de acao no error-banner e o rascunho continua', async () => {
    const user = userEvent.setup()
    mockSave.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    await user.clear(screen.getByLabelText('Match do destino 1'))
    await user.type(screen.getByLabelText('Match do destino 1'), 'itajai')
    await user.click(saveButton())
    expect(await screen.findByText(/Não foi possível salvar as regras\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Match do destino 1')).toHaveValue('itajai')
  })
})

describe('Previsoes - desktop: categorias, rolling customs e alertas', () => {
  it('Dias uteis por categoria: 4 campos mono com o rotulo da categoria e o atalho para o lead time real', async () => {
    const user = userEvent.setup()
    renderPage()
    for (const [label, value] of [['FCL', 3], ['LCL', 5], ['AEREO', 2], ['CONSOLIDADO', 4]]) {
      expect(screen.getByLabelText(label)).toHaveValue(value)
      expect(screen.getByLabelText(label)).toHaveClass('text-input--mono')
    }
    expect(screen.getByRole('link', { name: 'Ver lead time real' })).toHaveAttribute('href', '/admin/lead-time')
    const lcl = screen.getByLabelText('LCL')
    await user.clear(lcl)
    await user.type(lcl, '40')
    expect(lcl).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Dias úteis de LCL deve estar entre 0 e 30.')).toBeInTheDocument()
  })

  it('Rolling: interruptor Ativo/Desativado liga e desliga dias, "Aplicar a" e fichas DUIMP', async () => {
    const user = userEvent.setup()
    renderPage()
    const toggle = screen.getByRole('checkbox', { name: 'Ativo' })
    expect(toggle).toBeChecked()
    expect(screen.getByLabelText('Dias úteis após atracar')).toBeEnabled()
    await user.click(toggle)
    expect(screen.getByRole('checkbox', { name: 'Desativado' })).not.toBeChecked()
    expect(screen.getByLabelText('Dias úteis após atracar')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'FCL' })).toBeDisabled()
    expect(screen.getByLabelText('Novo status DUIMP')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover aguardando registro' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled()
  })

  it('Aplicar a: pilulas com aria-pressed; sem nenhuma categoria vira erro de validacao', async () => {
    const user = userEvent.setup()
    renderPage()
    const group = screen.getByRole('group', { name: 'Aplicar a' })
    expect(within(group).getByRole('button', { name: 'FCL' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'LCL' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(within(group).getByRole('button', { name: 'LCL' }))
    expect(within(group).getByRole('button', { name: 'LCL' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(group).getByRole('button', { name: 'LCL' }))
    await user.click(within(group).getByRole('button', { name: 'FCL' }))
    await user.click(within(group).getByRole('button', { name: 'CONSOLIDADO' }))
    expect(screen.getByText('Selecione ao menos uma categoria para o rolling customs.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('DUIMP status: adiciona por Enter e pelo botao (minusculo, sem duplicar) e remove pela ficha', async () => {
    const user = userEvent.setup()
    renderPage()
    const group = screen.getByRole('group', { name: 'DUIMP status (match normalizado)' })
    const input = within(group).getByLabelText('Novo status DUIMP')
    expect(input).toHaveAttribute('placeholder', 'ex.: aguardando registro')
    expect(within(group).getByRole('button', { name: 'Adicionar' })).toBeDisabled()

    await user.type(input, 'Desembaraco Em Analise{Enter}')
    expect(within(group).getByText('desembaraco em analise')).toBeInTheDocument()
    expect(input).toHaveValue('')

    await user.type(input, 'AGUARDANDO REGISTRO')
    await user.click(within(group).getByRole('button', { name: 'Adicionar' }))
    expect(within(group).getAllByText('aguardando registro')).toHaveLength(1)

    await user.click(within(group).getByRole('button', { name: 'Remover aguardando parametrizacao' }))
    expect(within(group).queryByText('aguardando parametrizacao')).not.toBeInTheDocument()
  })

  it('Alertas operacionais: campo ao lado do rotulo; editar para 7 e salvar envia operationalAlerts', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByLabelText('Dias sem desembaraço após parametrização')
    expect(input).toHaveValue(2)
    expect(screen.getByText('Resumo diário enviado aos admins às 7h (horário de Brasília).')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '7')
    await user.click(saveButton())
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(Number(mockSave.mock.calls[0][0].operationalAlerts.clearanceOverdueDays)).toBe(7)
  })

  it('0 dia de alerta: erro de validacao e campo marcado', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByLabelText('Dias sem desembaraço após parametrização')
    await user.clear(input)
    await user.type(input, '0')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Dias sem desembaraço para alerta deve estar entre 1 e 30.')).toBeInTheDocument()
  })
})

describe('Previsoes - desktop: restaurar padroes', () => {
  it('Restaurar abre a confirmacao; Cancelar nao executa; Restaurar executa e avisa', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
    const dialog = await screen.findByRole('alertdialog')
    // espera o focus-trap do dialogo assentar antes de interagir
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(mockReset).not.toHaveBeenCalled()
    // o dialogo sai com animacao: espera sumir antes de abrir de novo
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
    const second = await screen.findByRole('alertdialog')
    await waitFor(() => expect(second.contains(document.activeElement)).toBe(true))
    await user.click(within(second).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith(PROFILE))
    expect(await screen.findByText('Regras restauradas para o padrão do sistema.')).toBeInTheDocument()
  })

  it('erro ao restaurar: mensagem no error-banner', async () => {
    const user = userEvent.setup()
    mockReset.mockRejectedValueOnce(new Error('falhou'))
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await user.click(within(dialog).getByRole('button', { name: 'Restaurar' }))
    expect(await screen.findByText(/Não foi possível restaurar as regras\./)).toBeInTheDocument()
  })
})

describe('Previsoes - troca ao vivo entre arvores (1041px)', () => {
  it('o rascunho digitado sobrevive a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    const hour = screen.getByLabelText('Cutoff em horas do destino 1')
    await user.clear(hour)
    await user.type(hour, '16')

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--forecast')).toBeNull()
    expect(container.querySelector('.list-card')).not.toBeNull()
    expect(screen.getAllByDisplayValue('16').length).toBeGreaterThan(0)

    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--forecast')).not.toBeNull()
    expect(screen.getByLabelText('Cutoff em horas do destino 1')).toHaveValue(16)
  })

  it('sem listener preso ao desmontar', () => {
    const { unmount } = renderPage()
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (list-card, toolbar com o selo, rodape e Voltar)', () => {
    media = installMatchMedia(false)
    const { container } = renderPage()
    expect(container.querySelector('.af-root')).toBeNull()
    expect(container.querySelectorAll('.list-card')).toHaveLength(4)
    expect(container.querySelector('.admin-toolbar--right .inline-badge')).toHaveTextContent('Firestore ativo')
    expect(container.querySelector('.admin-feature-footer')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar destino' })).toBeInTheDocument()
  })
})
