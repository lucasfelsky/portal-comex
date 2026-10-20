// Refino F6a: arvore DESKTOP do painel Barra do porto (AdminBarra.dc.html): status em 3 cartoes de radio
// (no lugar do select) e cartao do robo da Praticagem ZP21. O desktop e escolhido por
// matchMedia('(min-width: 1041px)'); a arvore legada (tablet/mobile: select + banners) segue coberta por
// tests/ui/AdminBarStatusPanel.test.jsx (matchMedia falso = legado). Fica em tests/unit para nao entrar na
// contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockGetBarStatus = vi.fn()
const mockGetBarSuggestion = vi.fn()
const mockSaveBarStatus = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/lib/firebase', () => ({ isFirebaseConfigured: false }))
vi.mock('../../src/services/barStatusRepository', () => ({
  BAR_STATUS_OPTIONS: [
    { value: 'PRATICAVEL', label: 'PRATICAVEL', tone: 'ok' },
    { value: 'PRATICAVEL_RESTRICOES', label: 'PRATICAVEL C/ RESTRICOES', tone: 'warn' },
    { value: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' },
  ],
  getBarStatus: (...args) => mockGetBarStatus(...args),
  getBarSuggestion: (...args) => mockGetBarSuggestion(...args),
  saveBarStatus: (...args) => mockSaveBarStatus(...args),
}))

import AdminBarStatusPanel from '../../src/features/admin/AdminBarStatusPanel'

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

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()

const BAR_STATUS = {
  id: 'current',
  status: 'PRATICAVEL_RESTRICOES',
  label: 'PRATICAVEL C/ RESTRICOES',
  tone: 'warn',
  notes: 'Sem apontamentos operacionais no momento.',
  updatedAt: '2026-06-30T10:00:00Z',
}

function suggestion(overrides = {}) {
  return {
    status: 'PRATICAVEL_RESTRICOES',
    label: 'PRATICAVEL C/ RESTRICOES',
    tone: 'warn',
    sourceName: 'Praticagem ZP21',
    sourceUrl: 'https://example.test/zp21',
    fetchedAt: minutesAgo(12),
    siteDescription: 'PRATICÁVEL COM RESTRIÇÕES',
    restriction: 'calado máximo de 11,5 m',
    lastAttemptAt: minutesAgo(12),
    lastSuccessAt: minutesAgo(12),
    lastError: '',
    lastErrorStage: '',
    lastAppliedAt: null,
    ...overrides,
  }
}

function renderPanel() {
  return render(<AdminBarStatusPanel />)
}

const radios = () => screen.getAllByRole('radio')

beforeEach(() => {
  mockUseAuth.mockReset()
  mockGetBarStatus.mockReset()
  mockGetBarSuggestion.mockReset()
  mockSaveBarStatus.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetBarStatus.mockResolvedValue(BAR_STATUS)
  mockGetBarSuggestion.mockResolvedValue(null)
  mockSaveBarStatus.mockImplementation((draft) => Promise.resolve({ ...BAR_STATUS, ...draft }))
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('AdminBarra - desktop (>= 1041px): estrutura e cartoes de radio', () => {
  it('raiz .admin-panel--bar: titulo (h3), subtitulo e etiqueta do status atual com o texto do mock', async () => {
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável c/ restrições' })
    expect(container.querySelector('.admin-panel.admin-panel--bar')).not.toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: 'Barra Itajaí/Navegantes' })).toBeInTheDocument()
    expect(screen.getByText('Indica a condição operacional do canal de acesso ao porto.')).toBeInTheDocument()
    const state = container.querySelector('.ab-state')
    expect(state).toHaveClass('ab-state--warn')
    expect(state).toHaveTextContent('Praticável c/ restrições')
    expect(state.querySelector('.ab-state__dot')).not.toBeNull()
  })

  it('o select some: 3 radios num fieldset com legenda "Status atual", na ordem do repositorio', async () => {
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(container.querySelector('select')).toBeNull()
    const group = screen.getByRole('group', { name: 'Status atual' })
    expect(group.tagName).toBe('FIELDSET')
    expect(within(group).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Praticável',
      'Praticável c/ restrições',
      'Impraticável',
    ])
    expect(radios().map((radio) => radio.value)).toEqual(['PRATICAVEL', 'PRATICAVEL_RESTRICOES', 'IMPRATICAVEL'])
  })

  it('cada cartao tem rotulo, dica (descricao do radio) e bolinha de tom; o salvo vem marcado', async () => {
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    const options = [...container.querySelectorAll('.ab-option')]
    expect(options.map((option) => option.querySelector('.ab-option__label').textContent)).toEqual([
      'Praticável',
      'Praticável c/ restrições',
      'Impraticável',
    ])
    expect(options.map((option) => option.querySelector('.ab-option__hint').textContent)).toEqual([
      'Canal liberado, sem restrições.',
      'Navios com limite de calado ou janela.',
      'Canal fechado para manobras.',
    ])
    expect(options[0]).toHaveClass('ab-option--ok')
    expect(options[1]).toHaveClass('ab-option--warn')
    expect(options[2]).toHaveClass('ab-option--danger')
    expect(options.every((option) => option.querySelector('.ab-option__tone'))).toBe(true)
    expect(screen.getByRole('radio', { name: 'Praticável c/ restrições' })).toBeChecked()
    expect(options[1]).toHaveClass('ab-option--checked')
    expect(options[0]).not.toHaveClass('ab-option--checked')
    expect(screen.getByRole('radio', { name: 'Impraticável' })).toHaveAccessibleDescription('Canal fechado para manobras.')
  })

  it('o radio fica visualmente escondido mas continua no DOM e focavel por teclado (setas trocam a opcao)', async () => {
    const user = userEvent.setup()
    renderPanel()
    const restricoes = await screen.findByRole('radio', { name: 'Praticável c/ restrições' })
    restricoes.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Impraticável' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Impraticável' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('radio', { name: 'Praticável' })).toBeChecked()
  })

  it('clicar no cartao inteiro (rotulo) escolhe a opcao; a etiqueta do topo so muda depois de salvar', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await user.click(screen.getByText('Impraticável', { selector: '.ab-option__label' }))
    expect(screen.getByRole('radio', { name: 'Impraticável' })).toBeChecked()
    expect(container.querySelector('.ab-option--checked .ab-option__label')).toHaveTextContent('Impraticável')
    expect(container.querySelector('.ab-state')).toHaveTextContent('Praticável c/ restrições')
    expect(mockSaveBarStatus).not.toHaveBeenCalled()
  })

  it('loading inicial: 3 skeletons no lugar dos cartoes', () => {
    let resolveGet
    mockGetBarStatus.mockReturnValue(new Promise((resolve) => { resolveGet = resolve }))
    const { container } = renderPanel()
    expect(container.querySelectorAll('.ab-skeleton .skeleton')).toHaveLength(3)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    resolveGet(BAR_STATUS)
  })

  it('erro ao carregar vira error-banner', async () => {
    mockGetBarStatus.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar o status da barra/i)).toBeInTheDocument()
  })
})

describe('AdminBarra - desktop: salvar', () => {
  it('Salvar status da barra: saveBarStatus(draft com o valor escolhido, profile) e a etiqueta acompanha', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await user.click(screen.getByRole('radio', { name: 'Impraticável' }))
    await user.click(screen.getByRole('button', { name: 'Salvar status da barra' }))
    await waitFor(() => expect(mockSaveBarStatus).toHaveBeenCalledTimes(1))
    const [draft, profile] = mockSaveBarStatus.mock.calls[0]
    expect(profile).toEqual(PROFILE)
    expect(draft).toEqual({ status: 'IMPRATICAVEL', notes: BAR_STATUS.notes })
    await waitFor(() => expect(container.querySelector('.ab-state')).toHaveTextContent('Impraticável'))
  })

  it('salvar sem mudar nada grava os valores atuais; botao "Salvando..." desabilitado durante a gravacao', async () => {
    const user = userEvent.setup()
    let resolveSave
    mockSaveBarStatus.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await user.click(screen.getByRole('button', { name: 'Salvar status da barra' }))
    const saving = await screen.findByRole('button', { name: 'Salvando...' })
    expect(saving).toBeDisabled()
    expect(mockSaveBarStatus.mock.calls[0][0]).toEqual({ status: 'PRATICAVEL_RESTRICOES', notes: BAR_STATUS.notes })
    await act(async () => resolveSave({ ...BAR_STATUS }))
  })

  it('erro ao salvar aparece no error-banner', async () => {
    const user = userEvent.setup()
    mockSaveBarStatus.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await user.click(screen.getByRole('button', { name: 'Salvar status da barra' }))
    expect(await screen.findByText(/Não foi possível salvar o status da barra/i)).toBeInTheDocument()
  })
})

describe('AdminBarra - desktop: cartao do robo da Praticagem ZP21', () => {
  it('sem leitura (sem doc de sugestao): nenhum cartao do robo e o status ocupa uma coluna', async () => {
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    expect(container.querySelector('.ab-robot')).toBeNull()
    expect(container.querySelector('.ab-grid')).toHaveClass('ab-grid--single')
  })

  it('cartao: nome do robo, "Le o campo cond_barra do site · ha N min", etiqueta "Em dia"', async () => {
    mockGetBarSuggestion.mockResolvedValue(suggestion())
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-grid')).not.toHaveClass('ab-grid--single')
    expect(container.querySelector('.ab-robot__source')).toHaveTextContent('Lê o campo cond_barra do site · há 12 min')
    expect(container.querySelector('.ab-robot__source .ad-mono')).toHaveTextContent('cond_barra')
    const pill = container.querySelector('.ab-robot__head .ad-pill')
    expect(pill).toHaveTextContent('Em dia')
    expect(pill).toHaveClass('ad-pill--ok')
    expect(container.querySelector('.ab-robot__icon svg')).not.toBeNull()
  })

  it('texto lido do site e restricao: "Texto do site: “…” — restricao: …"', async () => {
    mockGetBarSuggestion.mockResolvedValue(suggestion())
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-robot__read')).toHaveTextContent(
      'Texto do site: “PRATICÁVEL COM RESTRIÇÕES” — restrição: calado máximo de 11,5 m'
    )
  })

  it('sem restricao: so o texto do site; sem texto: o bloco nao aparece', async () => {
    mockGetBarSuggestion.mockResolvedValue(suggestion({ restriction: '' }))
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-robot__read')).toHaveTextContent(/^Texto do site: “PRATICÁVEL COM RESTRIÇÕES”$/)
    expect(container.querySelector('.ab-robot__read')).not.toHaveTextContent('restrição:')
  })

  it('coincide com o status atual: aviso verde (role=status) e "Aplicado automaticamente as HH:MM"', async () => {
    const applied = new Date()
    applied.setHours(8, 42, 0, 0)
    mockGetBarSuggestion.mockResolvedValue(suggestion({ lastAppliedAt: applied.toISOString() }))
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    const notice = container.querySelector('.ab-notice--ok')
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent('Coincide com o status atual. Aplicado automaticamente às 08:42.')
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
  })

  it('coincide sem aplicacao automatica: so "Coincide com o status atual."; aplicado em outro dia mostra a data', async () => {
    mockGetBarSuggestion.mockResolvedValue(suggestion())
    const { container, unmount } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-notice--ok')).toHaveTextContent(/^Coincide com o status atual\.$/)
    unmount()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(23, 5, 0, 0)
    const pad = (n) => String(n).padStart(2, '0')
    mockGetBarSuggestion.mockResolvedValue(suggestion({ lastAppliedAt: yesterday.toISOString() }))
    const second = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(second.container.querySelector('.ab-notice--ok')).toHaveTextContent(
      `Aplicado automaticamente em ${pad(yesterday.getDate())}/${pad(yesterday.getMonth() + 1)} às 23:05.`
    )
  })

  it('coincide com data de aplicacao invalida: so "Coincide com o status atual." (sem "Aplicado automaticamente .")', async () => {
    mockGetBarSuggestion.mockResolvedValue(suggestion({ lastAppliedAt: 'nao-e-uma-data' }))
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    const notice = container.querySelector('.ab-notice--ok')
    expect(notice).toHaveTextContent(/^Coincide com o status atual\.$/)
    expect(notice.textContent).not.toContain('Aplicado automaticamente')
  })

  it('difere do status atual: aviso de atencao (role=alert) com o que o robo leu e botao Aplicar', async () => {
    const user = userEvent.setup()
    mockGetBarSuggestion.mockResolvedValue(suggestion({ status: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' }))
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    const notice = container.querySelector('.ab-notice--warn')
    expect(notice).toHaveAttribute('role', 'alert')
    expect(notice).toHaveTextContent('Status manual difere do site: o robô leu “Impraticável”.')
    expect(notice).toHaveTextContent('Volta a seguir a praticagem na próxima mudança do site.')
    await user.click(within(notice).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(mockSaveBarStatus).toHaveBeenCalledTimes(1))
    expect(mockSaveBarStatus.mock.calls[0][0]).toEqual({ status: 'IMPRATICAVEL', notes: BAR_STATUS.notes })
    expect(mockSaveBarStatus.mock.calls[0][1]).toEqual(PROFILE)
    // depois de aplicar o status passa a coincidir
    await waitFor(() => expect(container.querySelector('.ab-notice--ok')).not.toBeNull())
    expect(container.querySelector('.ab-notice--warn')).toBeNull()
  })

  it('Aplicar preserva as notas do rascunho e erro ao aplicar vai para o error-banner', async () => {
    const user = userEvent.setup()
    mockGetBarSuggestion.mockResolvedValue(suggestion({ status: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' }))
    mockSaveBarStatus.mockRejectedValueOnce(new Error('boom'))
    renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByText(/Não foi possível aplicar a sugestão da barra/i)).toBeInTheDocument()
  })

  it('ultima leitura falhou: etiqueta "Com falha" e alerta de perigo com o erro e a hora da tentativa', async () => {
    mockGetBarSuggestion.mockResolvedValue(
      suggestion({
        lastAttemptAt: minutesAgo(20),
        lastSuccessAt: minutesAgo(180),
        lastError: 'HTTP 503 ao ler o site.',
      })
    )
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-robot__head .ad-pill')).toHaveTextContent('Com falha')
    expect(container.querySelector('.ab-robot__head .ad-pill')).toHaveClass('ad-pill--danger')
    const alert = container.querySelector('.ab-notice--danger')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert).toHaveTextContent('Falha na última leitura da Praticagem ZP21 (há 20 min): HTTP 503 ao ler o site. O status atual pode estar desatualizado.')
    expect(alert.querySelector('svg')).not.toBeNull()
  })

  it('leitura velha (> 8 h, sem erro): etiqueta "Atrasado" e "Robo sem leitura ha mais de 8 h"', async () => {
    mockGetBarSuggestion.mockResolvedValue(
      suggestion({ lastAttemptAt: minutesAgo(60 * 9 + 10), lastSuccessAt: minutesAgo(60 * 9 + 10), fetchedAt: minutesAgo(60 * 9 + 10) })
    )
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-robot__head .ad-pill')).toHaveTextContent('Atrasado')
    expect(container.querySelector('.ab-robot__head .ad-pill')).toHaveClass('ad-pill--warn')
    const alert = container.querySelector('.ab-notice--danger')
    expect(alert).toHaveTextContent('Robô sem leitura há mais de 8 h. A última leitura bem-sucedida foi há 9h.')
    expect(alert).toHaveTextContent('Confira o site da praticagem e ajuste manualmente se preciso.')
  })

  it('so campos de falha (sem status e sem leitura boa): alerta aparece, aviso de coincidencia e Aplicar nao', async () => {
    mockGetBarSuggestion.mockResolvedValue(
      suggestion({
        status: null,
        label: null,
        tone: null,
        siteDescription: '',
        restriction: '',
        fetchedAt: null,
        lastSuccessAt: null,
        lastAttemptAt: minutesAgo(5),
        lastError: 'Timeout.',
      })
    )
    const { container } = renderPanel()
    await screen.findByText('Robô da Praticagem ZP21')
    expect(container.querySelector('.ab-notice--danger')).toHaveTextContent('Falha na última leitura da Praticagem ZP21 (há 5 min): Timeout.')
    expect(container.querySelector('.ab-notice--ok')).toBeNull()
    expect(container.querySelector('.ab-notice--warn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
    expect(container.querySelector('.ab-robot__read')).toBeNull()
    expect(container.querySelector('.ab-robot__source')).toHaveTextContent(/^Lê o campo cond_barra do site$/)
  })

  it('erro ao ler a sugestao: o painel segue funcional, sem cartao do robo', async () => {
    mockGetBarSuggestion.mockRejectedValueOnce(new Error('permission-denied'))
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await waitFor(() => expect(mockGetBarSuggestion).toHaveBeenCalled())
    expect(container.querySelector('.ab-robot')).toBeNull()
    expect(document.querySelector('.error-banner')).toBeNull()
  })
})

describe('AdminBarra - troca ao vivo entre arvores (1041px)', () => {
  it('a opcao escolhida e ainda nao salva sobrevive a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    await user.click(screen.getByRole('radio', { name: 'Impraticável' }))

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--bar')).toBeNull()
    expect(screen.getByRole('combobox')).toHaveValue('IMPRATICAVEL')

    await user.selectOptions(screen.getByRole('combobox'), 'PRATICAVEL')
    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--bar')).not.toBeNull()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Praticável' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Impraticável' })).not.toBeChecked()
  })

  it('sem listener preso ao desmontar', async () => {
    const { unmount } = renderPanel()
    await screen.findByRole('radio', { name: 'Praticável' })
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (select, list-card, banner de sugestao, Aplicar)', async () => {
    media = installMatchMedia(false)
    mockGetBarSuggestion.mockResolvedValue(suggestion({ status: 'IMPRATICAVEL', label: 'IMPRATICAVEL', tone: 'danger' }))
    const { container } = renderPanel()
    await screen.findByRole('combobox')
    expect(container.querySelector('.list-card')).not.toBeNull()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.suggestion-banner')).not.toBeNull())
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument()
    expect(container.querySelector('.ab-root')).toBeNull()
  })
})
