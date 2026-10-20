// Refino F6b: arvore DESKTOP do painel Lead time (AdminLeadTime.dc.html): "Previsao x real" com uma tabela por
// modal (Porto / Atual / Mediana real / P80 / n + barras duplas + "Aplicar N dias") e os outros 5 trechos na
// secao recolhivel "Outros trechos" (D11). O desktop e escolhido por matchMedia('(min-width: 1041px)'); a arvore
// legada (tablet/mobile) segue coberta por tests/ui/AdminLeadTimePanel.test.jsx (matchMedia ausente = legado).
// Fica em tests/unit para nao entrar na contagem do audit-vault-counts. Datas relativas a hoje (o periodo
// padrao e de 180 dias).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { countBusinessDaysBetween } from '../../src/utils/deliveryForecast'

const mockUseAuth = vi.fn()
const mockUseForecastSettings = vi.fn()
const mockLoadLeadTimeDataset = vi.fn()
const mockSaveForecastSettings = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/hooks/useForecastSettings', () => ({ useForecastSettings: () => mockUseForecastSettings() }))
vi.mock('../../src/services/processEventsRepository', () => ({
  loadLeadTimeDataset: (...args) => mockLoadLeadTimeDataset(...args),
}))
vi.mock('../../src/services/forecastSettingsRepository', () => ({
  saveForecastSettings: (...args) => mockSaveForecastSettings(...args),
}))

import AdminLeadTimePanel from '../../src/features/admin/AdminLeadTimePanel'

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

const SETTINGS = {
  id: 'current',
  destinations: [
    { match: 'navegantes', label: 'Navegantes', cutoffHour: 14, cutoffMinute: 0 },
    { match: 'itapoa', label: 'Itapoá', cutoffHour: 12, cutoffMinute: 0 },
  ],
  categoryBusinessDays: { FCL: 3, LCL: 7, AEREO: 10, CONSOLIDADO: 5 },
}

// --- datas relativas a hoje --------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
function keyDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return keyOf(date)
}
const at = (key) => `${key}T12:00:00-03:00`
// primeira data em que se completam exatamente N dias uteis depois da chegada (mesmo calendario do app)
function receivedAfter(arrivalKey, businessDays) {
  const date = new Date(`${arrivalKey}T12:00:00`)
  for (let step = 0; step < 90; step += 1) {
    const key = keyOf(date)
    if (countBusinessDaysBetween(arrivalKey, key) === businessDays) return key
    date.setDate(date.getDate() + 1)
  }
  throw new Error('sem data')
}
const makeEvent = (type, key) => ({ type, occurredAt: at(key), value: '', recordedAt: at(key) })

// processos FCL/Navegantes com N dias uteis entre a chegada (berthed) e o recebimento; o embarque fica 10 dias
// corridos antes da chegada (trecho "Embarque -> Atracacao/Chegada").
function buildDataset(values, { category = 'FCL', destination = 'NAVEGANTES - SC', prefix = 'p', arrivalAgo = 40, transitDays = 10 } = {}) {
  const processes = values.map((_, index) => ({ id: `${prefix}${index + 1}`, category, destination }))
  const eventsByProcessId = {}
  values.forEach((businessDays, index) => {
    const arrival = keyDaysAgo(arrivalAgo - index)
    const shipped = keyDaysAgo(arrivalAgo - index + transitDays)
    eventsByProcessId[`${prefix}${index + 1}`] = [
      makeEvent('shipped', shipped),
      makeEvent(category === 'AEREO' ? 'arrived' : 'berthed', arrival),
      makeEvent('received', receivedAfter(arrival, businessDays)),
    ]
  })
  return { processes, eventsByProcessId }
}

const merge = (...datasets) => ({
  processes: datasets.flatMap((d) => d.processes),
  eventsByProcessId: Object.assign({}, ...datasets.map((d) => d.eventsByProcessId)),
})

function renderPanel() {
  return render(
    <MemoryRouter>
      <AdminLeadTimePanel />
    </MemoryRouter>
  )
}

const fclCard = () => screen.getByRole('region', { name: /Previsão × real \(dias úteis da atracação\/chegada até o recebimento\) — FCL/ })
const rowOf = (card, name) => within(card).getByText(name).closest('tr')

beforeEach(() => {
  mockUseAuth.mockReset()
  mockUseForecastSettings.mockReset()
  mockLoadLeadTimeDataset.mockReset()
  mockSaveForecastSettings.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockUseForecastSettings.mockReturnValue({ settings: SETTINGS, loading: false })
  mockSaveForecastSettings.mockImplementation((draft) => Promise.resolve({ ...SETTINGS, ...draft }))
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('Lead time - desktop (>= 1041px): estrutura', () => {
  it('raiz .admin-panel--lead-time, titulo "Previsão × real", subtitulo do mock e seletor Período com os 4 periodos', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { container } = renderPanel()
    await screen.findByRole('heading', { level: 3, name: 'Previsão × real' })
    expect(container.querySelector('.admin-panel.admin-panel--lead-time')).not.toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    expect(container.querySelector('.admin-toolbar')).toBeNull()
    expect(screen.getByText('Dias úteis da atracação/chegada até o recebimento, por modal e porto.')).toBeInTheDocument()
    const select = container.querySelector('.al-period select')
    expect(select).toHaveValue('180')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Últimos 90 dias',
      'Últimos 180 dias',
      'Últimos 365 dias',
      'Todo o histórico',
    ])
  })

  it('carregando: esqueleto dentro da moldura desktop', () => {
    mockLoadLeadTimeDataset.mockReturnValue(new Promise(() => {}))
    const { container } = renderPanel()
    expect(container.querySelector('.admin-panel--lead-time .skeleton')).not.toBeNull()
    expect(container.querySelector('.al-head')).toBeNull()
  })

  it('erro ao carregar: error-banner e "Tentar novamente" (secundario) refaz a carga', async () => {
    const user = userEvent.setup()
    mockLoadLeadTimeDataset.mockRejectedValueOnce(new Error('boom'))
    const { container } = renderPanel()
    expect(await screen.findByText(/Não foi possível carregar o histórico de marcos\./)).toBeInTheDocument()
    expect(container.querySelector('.admin-panel--lead-time')).not.toBeNull()
    mockLoadLeadTimeDataset.mockResolvedValueOnce(buildDataset([5, 6, 6, 7, 7]))
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument()
  })
})

describe('Lead time - desktop: tabela por modal (chegada -> recebimento)', () => {
  it('colunas Porto / Atual / Mediana real / P80 / n / Atual × mediana, uma linha por porto + "Todos os portos"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    const card = fclCard()
    const headers = within(card).getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers.slice(0, 6)).toEqual(['Porto', 'Atual', 'Mediana real', 'P80', 'n', 'Atual × mediana'])
    const navegantes = within(rowOf(card, 'Navegantes')).getAllByRole('cell')
    expect(navegantes.slice(0, 5).map((cell) => cell.textContent)).toEqual(['Navegantes', '3', '6', '7', '5'])
    const all = within(rowOf(card, 'Todos os portos')).getAllByRole('cell')
    expect(all.slice(0, 5).map((cell) => cell.textContent)).toEqual(['Todos os portos', '3', '6', '7', '5'])
    expect(within(card).getByText('Previsão atual: 3 dias úteis · 5 amostras no trecho')).toBeInTheDocument()
  })

  it('divergencia de 2+ dias: mediana em --warning-700 e barra em --warning; ate 1 dia nao destaca', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { unmount } = renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    let row = rowOf(fclCard(), 'Navegantes')
    expect(row.querySelector('.al-num--median')).toHaveClass('al-num--diverge')
    expect(row.querySelector('.al-bar--median')).toHaveClass('al-bar--diverge')
    expect(row.querySelector('.al-bar--current')).not.toBeNull()
    unmount()

    mockUseForecastSettings.mockReturnValue({
      settings: { ...SETTINGS, categoryBusinessDays: { ...SETTINGS.categoryBusinessDays, FCL: 5 } },
      loading: false,
    })
    renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    row = rowOf(fclCard(), 'Navegantes')
    expect(row.querySelector('.al-num--median')).not.toHaveClass('al-num--diverge')
    expect(row.querySelector('.al-bar--median')).not.toHaveClass('al-bar--diverge')
  })

  it('barras: a largura segue a escala comum (atual e mediana) e a legenda traz os 3 itens do mock', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { container } = renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    const row = rowOf(fclCard(), 'Navegantes')
    // escala maxima = 6 (mediana): atual 3 = 50%, mediana 6 = 100%
    expect(row.querySelector('.al-bar--current').style.width).toBe('50%')
    expect(row.querySelector('.al-bar--median').style.width).toBe('100%')
    const legend = container.querySelector('.al-legend')
    expect(legend).toHaveTextContent('Previsão atual')
    expect(legend).toHaveTextContent('Mediana real')
    expect(legend).toHaveTextContent('Diverge 2+ dias')
  })

  it('"Aplicar N dias" so na linha "Todos os portos"; clicar salva so os dias uteis do modal e avisa', async () => {
    const user = userEvent.setup()
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    const card = fclCard()
    expect(within(rowOf(card, 'Navegantes')).queryByRole('button')).toBeNull()
    const apply = within(rowOf(card, 'Todos os portos')).getByRole('button', { name: 'Aplicar 6 dias' })
    expect(apply).toHaveClass('secondary-button')
    expect(mockSaveForecastSettings).not.toHaveBeenCalled()

    await user.click(apply)
    await waitFor(() => expect(mockSaveForecastSettings).toHaveBeenCalledTimes(1))
    const [draft, profileArg] = mockSaveForecastSettings.mock.calls[0]
    expect(profileArg).toEqual(PROFILE)
    expect(draft.categoryBusinessDays).toEqual({ FCL: 6, LCL: 7, AEREO: 10, CONSOLIDADO: 5 })
    expect(await screen.findByText('Dias úteis de FCL atualizados de 3 para 6.')).toBeInTheDocument()
  })

  it('erro ao aplicar: mensagem no error-banner e o painel continua', async () => {
    const user = userEvent.setup()
    mockSaveForecastSettings.mockRejectedValueOnce(new Error('negado'))
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    renderPanel()
    await user.click(await screen.findByRole('button', { name: 'Aplicar 6 dias' }))
    expect(await screen.findByText(/Não foi possível aplicar a sugestão\./)).toBeInTheDocument()
  })

  it('menos de 5 amostras: sem botao e "sem sugestão (n < 5)"; linha com n < 3 mostra traco e "insuficiente"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(
      merge(buildDataset([5, 6, 6]), buildDataset([4], { destination: 'ITAPOA - SC', prefix: 'q' }))
    )
    renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    const card = fclCard()
    expect(screen.queryByRole('button', { name: /Aplicar \d+ dias/ })).not.toBeInTheDocument()
    expect(within(rowOf(card, 'Todos os portos')).getByText('sem sugestão (n < 5)')).toBeInTheDocument()
    const itapoa = rowOf(card, 'Itapoá')
    expect(within(itapoa).getAllByText('—')).toHaveLength(2)
    expect(within(itapoa).getByText('n = 1 · insuficiente')).toBeInTheDocument()
    expect(itapoa.querySelector('.al-bars')).toBeNull()
  })

  it('mediana com casa decimal usa virgula (3,5) e o modal sem amostras vira linha em "Sem amostras no período"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([3, 3, 4, 4]))
    const { container } = renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    expect(within(rowOf(fclCard(), 'Navegantes')).getAllByRole('cell')[2]).toHaveTextContent('3,5')
    const empty = container.querySelector('.al-card--empty')
    expect(empty).toHaveTextContent('Sem amostras no período')
    for (const [category, days] of [['LCL', 7], ['AEREO', 10], ['CONSOLIDADO', 5]]) {
      expect(within(empty).getByText(category)).toBeInTheDocument()
      expect(empty).toHaveTextContent(`previsão atual ${days} d úteis`)
    }
    expect(within(empty).queryByText('FCL')).not.toBeInTheDocument()
  })

  it('dados insuficientes: estado vazio com a explicacao e os 4 modais em "Sem amostras"', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue({ processes: [], eventsByProcessId: {} })
    const { container } = renderPanel()
    expect(await screen.findByText('Dados insuficientes')).toBeInTheDocument()
    expect(screen.getByText(/O histórico de marcos só é registrado desde set\/2026/)).toBeInTheDocument()
    expect(container.querySelectorAll('.al-card').length).toBe(1)
    expect(container.querySelector('.al-card--empty')).toHaveTextContent('FCL')
    expect(container.querySelector('.al-card--empty')).toHaveTextContent('CONSOLIDADO')
  })

  it('trocar o periodo filtra (amostra antiga some) e nao salva nada', async () => {
    const user = userEvent.setup()
    mockLoadLeadTimeDataset.mockResolvedValue(
      buildDataset([4, 5, 6], { arrivalAgo: 330, prefix: 'old' })
    )
    const { container } = renderPanel()
    await screen.findByText('Dados insuficientes')
    await user.selectOptions(container.querySelector('.al-period select'), 'all')
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    expect(mockSaveForecastSettings).not.toHaveBeenCalled()
  })
})

describe('Lead time - desktop: Outros trechos (D11)', () => {
  const OTHER_LABELS = [
    'Embarque → Atracação/Chegada',
    'Presença de carga → Desembaraço',
    'Desembaraço → Coleta',
    'Coleta → Recebimento',
    'Embarque → Recebimento',
  ]

  function datasetWithAllMilestones() {
    const processes = [1, 2, 3].map((n) => ({ id: `m${n}`, category: 'FCL', destination: 'NAVEGANTES - SC' }))
    const eventsByProcessId = {}
    processes.forEach((process, index) => {
      const arrival = keyDaysAgo(40 - index)
      eventsByProcessId[process.id] = [
        makeEvent('shipped', keyDaysAgo(50 - index)),
        makeEvent('berthed', arrival),
        makeEvent('cargoPresence', keyDaysAgo(39 - index)),
        makeEvent('cleared', keyDaysAgo(37 - index)),
        { type: 'collectionScheduled', occurredAt: at(keyDaysAgo(37 - index)), value: keyDaysAgo(36 - index), recordedAt: at(keyDaysAgo(37 - index)) },
        makeEvent('received', receivedAfter(arrival, 4 + index)),
      ]
    })
    return { processes, eventsByProcessId }
  }

  it('recolhida por padrao: botao com aria-expanded=false e nenhuma tabela dos outros trechos', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(datasetWithAllMilestones())
    renderPanel()
    const toggle = await screen.findByRole('button', { name: /Outros trechos/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'al-others-body')
    expect(document.querySelector('.al-segment')).toBeNull()
    expect(screen.getByText('5 trechos em dias corridos, por modal e porto (mediana, P80 e n).')).toBeInTheDocument()
  })

  it('aberta: os 5 outros trechos (sem chegada -> recebimento) no estilo das tabelas, com unidade e dados', async () => {
    const user = userEvent.setup()
    mockLoadLeadTimeDataset.mockResolvedValue(datasetWithAllMilestones())
    renderPanel()
    const toggle = await screen.findByRole('button', { name: /Outros trechos/ })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const sections = Array.from(document.querySelectorAll('.al-segment'))
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(OTHER_LABELS)
    expect(screen.queryByRole('heading', { name: 'Atracação/Chegada → Recebimento' })).not.toBeInTheDocument()
    for (const section of sections) {
      expect(within(section).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
        'Modal',
        'Porto',
        'Mediana real',
        'P80',
        'n',
        'Mediana × P80',
      ])
      expect(section).toHaveTextContent('dias corridos')
    }
    const transit = within(sections[0]).getByText('Navegantes').closest('tr')
    expect(within(transit).getAllByRole('cell').slice(0, 5).map((cell) => cell.textContent)).toEqual(['FCL', 'Navegantes', '10', '10', '3'])
    expect(transit.querySelector('.al-bar--median')).not.toBeNull()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.al-segment')).toBeNull()
  })
})

describe('Lead time - troca ao vivo entre arvores (1041px)', () => {
  it('o periodo escolhido e a secao aberta sobrevivem a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { container } = renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    await user.selectOptions(container.querySelector('.al-period select'), '365')
    await user.click(screen.getByRole('button', { name: /Outros trechos/ }))

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--lead-time')).toBeNull()
    expect(container.querySelector('.list-card')).not.toBeNull()
    expect(screen.getByRole('combobox')).toHaveValue('365')

    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--lead-time')).not.toBeNull()
    expect(container.querySelector('.al-period select')).toHaveValue('365')
    expect(screen.getByRole('button', { name: /Outros trechos/ })).toHaveAttribute('aria-expanded', 'true')
    expect(mockLoadLeadTimeDataset).toHaveBeenCalledTimes(1)
  })

  it('sem listener preso ao desmontar', async () => {
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { unmount } = renderPanel()
    await screen.findByRole('heading', { level: 4, name: 'FCL' })
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (list-card, tabela de 6 trechos, "Previsão × real (dias úteis após a chegada)")', async () => {
    media = installMatchMedia(false)
    mockLoadLeadTimeDataset.mockResolvedValue(buildDataset([5, 6, 6, 7, 7]))
    const { container } = renderPanel()
    expect(await screen.findByRole('heading', { name: 'Previsão × real (dias úteis após a chegada)' })).toBeInTheDocument()
    expect(container.querySelectorAll('.list-card').length).toBeGreaterThan(1)
    expect(container.querySelector('.al-root')).toBeNull()
    expect(screen.getByRole('button', { name: 'Aplicar 6 dias' })).toBeInTheDocument()
  })
})
