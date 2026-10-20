// Refino F6b: arvore DESKTOP da aba Suporte (AdminSuporte.dc.html): 3 indicadores com sparkline, abas
// segmentadas com contagem, um chamado por vez com paginador, conversa em baloes e coluna lateral com resposta,
// prioridade, encerramento e acoes. O desktop e escolhido por matchMedia('(min-width: 1041px)'); a arvore legada
// (tablet/mobile) segue coberta por tests/ui/AdminSupportPanel.test.jsx (matchMedia ausente = legado). Fica em
// tests/unit para nao entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockListAllSupportTickets = vi.fn()
const mockUpdateSupportTicket = vi.fn()
const mockAddSupportTicketReply = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/lib/firebase', () => ({ isFirebaseConfigured: false }))
vi.mock('../../src/services/supportTicketsRepository', () => ({
  SUPPORT_TICKET_STATUS_LABELS: { aberto: 'Aberto', em_andamento: 'Em andamento', resolvido: 'Resolvido' },
  SUPPORT_TICKET_STATUS_TONES: { aberto: 'warn', em_andamento: 'info', resolvido: 'ok' },
  SUPPORT_TICKET_MAX_REPLY_LENGTH: 1000,
  listAllSupportTickets: (...args) => mockListAllSupportTickets(...args),
  updateSupportTicket: (...args) => mockUpdateSupportTicket(...args),
  addSupportTicketReply: (...args) => mockAddSupportTicketReply(...args),
}))

import AdminSupportPanel from '../../src/features/admin/AdminSupportPanel'

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

const PROFILE = { uid: 'admin-1', name: 'Admin Root', email: 'admin@sqquimica.com', role: 'admin' }
const thisYear = new Date().getFullYear()
const iso = (month, day, hour, minute) => new Date(thisYear, month, day, hour, minute).toISOString()
const daysAgo = (days) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

function ticket(overrides) {
  return {
    id: 't',
    authorId: 'user-1',
    authorName: 'Nome Sobrenome',
    authorEmail: 'nome@sqquimica.com',
    message: 'Mensagem do chamado.',
    imageUrls: [],
    status: 'aberto',
    priority: 3,
    createdAt: iso(9, 19, 9, 14),
    updatedAt: iso(9, 19, 9, 14),
    resolvedAt: null,
    resolvedByName: null,
    resolutionMessage: null,
    contextPage: null,
    contextProcessId: null,
    contextProcessName: null,
    replies: [],
    ...overrides,
  }
}

const T1 = ticket({
  id: 't1',
  authorName: 'Beatriz Rocha',
  authorEmail: 'beatriz@sqquimica.com',
  message: 'Mensagem do chamado 1',
  priority: 4,
  createdAt: daysAgo(0),
  contextPage: '/processos',
  contextProcessName: 'Resina epóxi líquida',
  imageUrls: ['https://img.test/a.png', 'https://img.test/b.png'],
  replies: [
    { id: 'r1', authorId: 'admin-1', authorName: 'Equipe COMEX', message: 'Pode detalhar o processo?', createdAt: iso(9, 19, 9, 40) },
    { id: 'r2', authorId: 'user-1', authorName: 'Beatriz Rocha', message: 'É o processo da resina.', createdAt: iso(9, 19, 10, 5) },
  ],
})
const T2 = ticket({ id: 't2', authorName: 'Carlos Siqueira', message: 'Mensagem do chamado 2', priority: 3, createdAt: daysAgo(0) })
const T3 = ticket({ id: 't3', authorName: 'Daniela Martins', message: 'Mensagem do chamado 3', priority: 2, createdAt: daysAgo(0) })
const T4 = ticket({ id: 't4', authorName: 'Eduardo Ferraz', message: 'Mensagem do chamado 4', status: 'em_andamento', priority: 3, createdAt: daysAgo(7) })
const T5 = ticket({
  id: 't5',
  authorName: 'Fernanda Lima',
  message: 'Mensagem do chamado 5',
  status: 'resolvido',
  priority: 5,
  createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
  resolvedAt: new Date(Date.now() - 20 * 24 * 3600 * 1000 + 6 * 3600 * 1000).toISOString(),
  resolvedByName: 'Admin Root',
  resolutionMessage: 'Corrigido na versão de ontem.',
})
const ALL = [T1, T2, T3, T4, T5]

function renderPanel() {
  return render(<AdminSupportPanel />)
}

const tab = (name) => screen.getByRole('tab', { name })

beforeEach(() => {
  mockUseAuth.mockReset()
  mockListAllSupportTickets.mockReset()
  mockUpdateSupportTicket.mockReset()
  mockAddSupportTicketReply.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockListAllSupportTickets.mockResolvedValue(ALL)
  mockUpdateSupportTicket.mockResolvedValue(null)
  mockAddSupportTicketReply.mockImplementation((ticketId, message, actor) =>
    Promise.resolve({ id: 'reply-new', authorId: actor?.uid, authorName: actor?.name, message, createdAt: new Date().toISOString() })
  )
  media = installMatchMedia(true)
})

afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
  vi.clearAllMocks()
})

describe('Suporte - desktop (>= 1041px): indicadores', () => {
  it('raiz .admin-panel--support, sem os cartoes da arvore anterior, 3 indicadores com os textos do mock', async () => {
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(container.querySelector('.admin-panel.admin-panel--support')).not.toBeNull()
    expect(container.querySelector('.list-card')).toBeNull()
    expect(container.querySelector('.dashboard-stat-row')).toBeNull()
    const kpis = container.querySelectorAll('.as-kpi')
    expect(kpis).toHaveLength(3)
    expect(kpis[0]).toHaveTextContent('Tempo médio de resolução')
    expect(kpis[0].querySelector('.as-kpi__value')).toHaveTextContent('6h')
    expect(kpis[1]).toHaveTextContent('Em aberto')
    expect(kpis[1].querySelector('.as-kpi__value')).toHaveTextContent('4')
    expect(kpis[1].querySelector('.as-kpi__note')).toHaveTextContent('1 de prioridade alta')
    expect(kpis[1].querySelector('.as-kpi__note')).toHaveClass('as-kpi__note--danger')
    expect(kpis[2]).toHaveTextContent('Chamados abertos por semana')
  })

  it('abertos por semana: valor da semana, sparkline 140x40 com 8 semanas e "+N vs. semana anterior (+X%)"', async () => {
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    const third = container.querySelectorAll('.as-kpi')[2]
    expect(third.querySelector('.as-kpi__value')).toHaveTextContent('3')
    const spark = within(third).getByRole('img', { name: 'Tendência das últimas 8 semanas' })
    expect(spark).toHaveAttribute('width', '140')
    expect(spark).toHaveAttribute('height', '40')
    expect(spark.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(8)
    expect(spark.querySelector('circle')).not.toBeNull()
    expect(third.querySelector('.as-kpi__note')).toHaveTextContent('+2 vs. semana anterior (+200%)')
  })

  it('sem prioridade alta: "Nenhum de prioridade alta" neutro; sem chamados: traco e zeros (os indicadores nao somem)', async () => {
    mockListAllSupportTickets.mockResolvedValue([T2, T3])
    const first = renderPanel()
    await screen.findByText('Mensagem do chamado 2')
    expect(first.container.querySelectorAll('.as-kpi')[1].querySelector('.as-kpi__note')).toHaveTextContent('Nenhum de prioridade alta')
    expect(first.container.querySelectorAll('.as-kpi')[1].querySelector('.as-kpi__note')).not.toHaveClass('as-kpi__note--danger')
    first.unmount()

    mockListAllSupportTickets.mockResolvedValue([])
    const second = renderPanel()
    await screen.findByText('Nenhum chamado por aqui')
    const kpis = second.container.querySelectorAll('.as-kpi')
    expect(kpis[0].querySelector('.as-kpi__value')).toHaveTextContent('—')
    expect(kpis[1].querySelector('.as-kpi__value')).toHaveTextContent('0')
    expect(kpis[2]).toHaveTextContent('0 vs. semana anterior')
  })
})

describe('Suporte - desktop: abas e paginador', () => {
  it('abas segmentadas Abertos / Em andamento / Resolvidos / Todos com a contagem em mono; so uma aba selecionada', async () => {
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(screen.getByRole('heading', { level: 3, name: 'Chamados de suporte' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Filtro de chamados' })).toBeInTheDocument()
    expect(tab(/^Abertos/)).toHaveTextContent('Abertos 3')
    expect(tab(/^Em andamento/)).toHaveTextContent('Em andamento 1')
    expect(tab(/^Resolvidos/)).toHaveTextContent('Resolvidos 1')
    expect(tab(/^Todos/)).toHaveTextContent('Todos 5')
    expect(tab(/^Abertos/)).toHaveAttribute('aria-selected', 'true')
    expect(tab(/^Abertos/)).toHaveClass('as-tab--active')
    expect(tab(/^Todos/)).toHaveAttribute('aria-selected', 'false')
    expect(document.querySelector('.as-tab__count')).toHaveClass('as-tab__count')
  })

  it('cada aba mostra o chamado do seu status (abertos por prioridade 5 -> 1) e a aba Todos lista tudo', async () => {
    const user = userEvent.setup()
    renderPanel()
    // abertos: maior prioridade primeiro
    expect(await screen.findByText('Mensagem do chamado 1')).toBeInTheDocument()
    await user.click(tab(/^Em andamento/))
    expect(screen.getByText('Mensagem do chamado 4')).toBeInTheDocument()
    expect(screen.queryByText('Mensagem do chamado 1')).not.toBeInTheDocument()
    await user.click(tab(/^Resolvidos/))
    expect(screen.getByText('Mensagem do chamado 5')).toBeInTheDocument()
    await user.click(tab(/^Todos/))
    expect(screen.getByText('Mensagem do chamado 1')).toBeInTheDocument()
    expect(document.querySelector('.as-pager__counter')).toHaveTextContent('1/5')
  })

  it('paginador 1/3: setas de 40px, "Próximo" avanca, volta ao 1o no fim e esconde com um unico chamado', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    const counter = () => document.querySelector('.as-pager__counter')
    expect(counter()).toHaveTextContent('1/3')
    expect(counter()).toHaveAttribute('aria-label', 'Chamado 1 de 3')
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    expect(screen.getByText('Mensagem do chamado 2')).toBeInTheDocument()
    expect(screen.queryByText('Mensagem do chamado 1')).not.toBeInTheDocument()
    expect(counter()).toHaveTextContent('2/3')
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    expect(screen.getByText('Mensagem do chamado 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chamado anterior' }))
    expect(screen.getByText('Mensagem do chamado 3')).toBeInTheDocument()

    await user.click(tab(/^Em andamento/))
    expect(screen.queryByRole('button', { name: 'Próximo chamado' })).not.toBeInTheDocument()
    await user.click(tab(/^Abertos/))
    expect(counter()).toHaveTextContent('1/3')
  })
})

describe('Suporte - desktop: o chamado', () => {
  it('cabecalho: avatar com iniciais, nome, "email · dd/mm HH:MM" e etiqueta de status em perigo (mock)', async () => {
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(container.querySelector('.as-avatar')).toHaveTextContent('BR')
    expect(container.querySelector('.as-author__name')).toHaveTextContent('Beatriz Rocha')
    expect(container.querySelector('.as-author__meta')).toHaveTextContent(/^beatriz@sqquimica\.com · \d{2}\/\d{2} \d{2}:\d{2}$/)
    const pill = container.querySelector('.as-ticket .ad-pill')
    expect(pill).toHaveTextContent('Aberto')
    expect(pill).toHaveClass('ad-pill--danger')
  })

  it('mensagem, chip "Contexto: <pagina> · <processo>" e miniaturas dos prints (links que abrem em nova aba)', async () => {
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(container.querySelector('.as-message')).toHaveTextContent('Mensagem do chamado 1')
    expect(container.querySelector('.as-context')).toHaveTextContent('Contexto: Chegadas · Resina epóxi líquida')
    const shots = container.querySelectorAll('.as-shot')
    expect(shots).toHaveLength(2)
    expect(shots[0]).toHaveAttribute('href', 'https://img.test/a.png')
    expect(shots[0]).toHaveAttribute('target', '_blank')
    expect(screen.getByAltText('Print 2 do chamado')).toHaveAttribute('src', 'https://img.test/b.png')
  })

  it('sem contexto e sem prints: nenhum dos dois blocos aparece', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    expect(container.querySelector('.as-context')).toBeNull()
    expect(container.querySelector('.as-shots')).toBeNull()
  })

  it('"Conversa com o usuario": equipe a direita, usuario a esquerda, com autor e hora; vazio avisa', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(screen.getByRole('heading', { level: 4, name: 'Conversa com o usuário' })).toBeInTheDocument()
    const bubbles = container.querySelectorAll('.as-bubble')
    expect(bubbles).toHaveLength(2)
    expect(bubbles[0]).toHaveClass('as-bubble--team')
    expect(bubbles[0]).toHaveTextContent('Pode detalhar o processo?')
    expect(bubbles[0].querySelector('.as-bubble__meta')).toHaveTextContent(/^Equipe COMEX · \d{2}\/\d{2} 09:40$/)
    expect(bubbles[1]).toHaveClass('as-bubble--user')
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    expect(screen.getByText('Nenhuma resposta enviada ainda.')).toBeInTheDocument()
  })

  it('resolvido: "Resolvido por X em dd/mm HH:MM." e bloco "Resposta da equipe" com a mensagem de encerramento', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(tab(/^Resolvidos/))
    expect(container.querySelector('.as-resolved-by')).toHaveTextContent(/^Resolvido por Admin Root em \d{2}\/\d{2}(\/\d{4})? \d{2}:\d{2}\.$/)
    expect(screen.getByRole('heading', { level: 4, name: 'Resposta da equipe' })).toBeInTheDocument()
    expect(container.querySelector('.as-resolution__text')).toHaveTextContent('Corrigido na versão de ontem.')
    expect(container.querySelector('.as-ticket .ad-pill')).toHaveClass('ad-pill--ok')
    expect(screen.queryByLabelText('Mensagem de encerramento (opcional)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reabrir chamado' })).toHaveClass('secondary-button')
  })

  it('em andamento: etiqueta informativa e "Marcar como resolvido" vira o botao primario (sem "Iniciar atendimento")', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(tab(/^Em andamento/))
    expect(container.querySelector('.as-ticket .ad-pill')).toHaveClass('ad-pill--info')
    expect(screen.queryByRole('button', { name: 'Iniciar atendimento' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar como resolvido' })).toHaveClass('primary-button')
  })
})

describe('Suporte - desktop: coluna lateral (resposta, prioridade, encerramento, acoes)', () => {
  it('campos e botoes do mock: Nova resposta, Enviar resposta, Prioridade 1-5, Mensagem de encerramento, Iniciar e Marcar', async () => {
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(screen.getByLabelText('Nova resposta')).toHaveAttribute('placeholder', 'Escreva a resposta ao usuário.')
    expect(screen.getByRole('button', { name: 'Enviar resposta' })).toHaveClass('secondary-button')
    expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
    const priority = screen.getByLabelText('Prioridade')
    expect(priority).toHaveValue('4')
    expect(within(priority).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '1 · Muito baixa',
      '2 · Baixa',
      '3 · Média',
      '4 · Alta',
      '5 · Máxima',
    ])
    expect(screen.getByLabelText('Mensagem de encerramento (opcional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar atendimento' })).toHaveClass('primary-button')
    expect(screen.getByRole('button', { name: 'Marcar como resolvido' })).toHaveClass('ghost-button')
  })

  it('digitar + Enviar resposta: addSupportTicketReply(ticketId, texto, profile), sem updateSupportTicket; limpa o campo e mostra o balao', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.type(screen.getByLabelText('Nova resposta'), 'Já estamos olhando.')
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }))
    await waitFor(() => expect(mockAddSupportTicketReply).toHaveBeenCalledWith('t1', 'Já estamos olhando.', PROFILE))
    expect(mockUpdateSupportTicket).not.toHaveBeenCalled()
    expect(await screen.findByText('Já estamos olhando.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nova resposta')).toHaveValue('')
  })

  it('erro ao enviar a resposta: mensagem no error-banner e o texto continua no campo', async () => {
    const user = userEvent.setup()
    mockAddSupportTicketReply.mockRejectedValueOnce(new Error('falhou'))
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.type(screen.getByLabelText('Nova resposta'), 'texto')
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }))
    expect(await screen.findByText(/Não foi possível enviar a resposta\./)).toBeInTheDocument()
    expect(screen.getByLabelText('Nova resposta')).toHaveValue('texto')
  })

  it('Prioridade: trocar salva so a prioridade (status mantido, sem mensagem de encerramento)', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.selectOptions(screen.getByLabelText('Prioridade'), '5')
    await waitFor(() =>
      expect(mockUpdateSupportTicket).toHaveBeenCalledWith('t1', { status: 'aberto', priority: 5, resolutionMessage: '' }, PROFILE)
    )
    expect(screen.getByLabelText('Prioridade')).toHaveValue('5')
  })

  it('Iniciar atendimento: status em andamento; o chamado sai de Abertos (contagem cai) e aparece em Em andamento', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(screen.getByRole('button', { name: 'Iniciar atendimento' }))
    await waitFor(() =>
      expect(mockUpdateSupportTicket).toHaveBeenCalledWith('t1', { status: 'em_andamento', priority: 4, resolutionMessage: '' }, PROFILE)
    )
    expect(tab(/^Abertos/)).toHaveTextContent('Abertos 2')
    expect(tab(/^Em andamento/)).toHaveTextContent('Em andamento 2')
  })

  it('Marcar como resolvido com mensagem de encerramento: salva, aparece em Resolvidos com "Resolvido por" e a resposta da equipe', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.type(screen.getByLabelText('Mensagem de encerramento (opcional)'), 'Resolvido hoje.')
    await user.click(screen.getByRole('button', { name: 'Marcar como resolvido' }))
    await waitFor(() =>
      expect(mockUpdateSupportTicket).toHaveBeenCalledWith('t1', { status: 'resolvido', priority: 4, resolutionMessage: 'Resolvido hoje.' }, PROFILE)
    )
    expect(tab(/^Resolvidos/)).toHaveTextContent('Resolvidos 2')
    await user.click(tab(/^Resolvidos/))
    // resolvidos tambem por prioridade: o antigo (5) vem primeiro, o recem resolvido e o 2o
    await user.click(screen.getByRole('button', { name: 'Próximo chamado' }))
    expect(await screen.findByText('Resolvido hoje.')).toBeInTheDocument()
    expect(container.querySelector('.as-resolved-by')).toHaveTextContent('Resolvido por Admin Root em')
  })

  it('Reabrir chamado: volta para aberto sem mensagem de encerramento', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(tab(/^Resolvidos/))
    await user.click(screen.getByRole('button', { name: 'Reabrir chamado' }))
    await waitFor(() =>
      expect(mockUpdateSupportTicket).toHaveBeenCalledWith('t5', { status: 'aberto', priority: 5, resolutionMessage: '' }, PROFILE)
    )
    expect(tab(/^Abertos/)).toHaveTextContent('Abertos 4')
  })

  it('erro ao atualizar: mensagem no error-banner e o chamado continua onde estava', async () => {
    const user = userEvent.setup()
    mockUpdateSupportTicket.mockRejectedValueOnce(new Error('negado'))
    renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.click(screen.getByRole('button', { name: 'Iniciar atendimento' }))
    expect(await screen.findByText(/Não foi possível atualizar o chamado\./)).toBeInTheDocument()
    expect(tab(/^Abertos/)).toHaveTextContent('Abertos 3')
  })
})

describe('Suporte - desktop: estados vazios e de carga', () => {
  it('sem chamados: "Nenhum chamado por aqui" com o texto de cada filtro', async () => {
    const user = userEvent.setup()
    mockListAllSupportTickets.mockResolvedValue([])
    renderPanel()
    expect(await screen.findByText('Nenhum chamado por aqui')).toBeInTheDocument()
    expect(screen.getByText('Não há chamados em aberto no momento.')).toBeInTheDocument()
    await user.click(tab(/^Resolvidos/))
    expect(screen.getByText('Nenhum chamado corresponde ao filtro selecionado.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nova resposta')).not.toBeInTheDocument()
  })

  it('carregando: esqueleto dentro da moldura desktop; erro de carga no error-banner', async () => {
    mockListAllSupportTickets.mockReturnValue(new Promise(() => {}))
    const first = renderPanel()
    expect(first.container.querySelector('.admin-panel--support .skeleton')).not.toBeNull()
    first.unmount()
    mockListAllSupportTickets.mockRejectedValue(new Error('boom'))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar os chamados\./)).toBeInTheDocument()
  })
})

describe('Suporte - troca ao vivo entre arvores (1041px)', () => {
  it('rascunhos de resposta e de encerramento e a aba escolhida sobrevivem a troca desktop <-> tablet', async () => {
    const user = userEvent.setup()
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    await user.type(screen.getByLabelText('Nova resposta'), 'rascunho da resposta')
    await user.type(screen.getByLabelText('Mensagem de encerramento (opcional)'), 'rascunho do encerramento')

    media.setDesktop(false)
    expect(container.querySelector('.admin-panel--support')).toBeNull()
    expect(container.querySelector('.list-card')).not.toBeNull()
    expect(screen.getByDisplayValue('rascunho da resposta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('rascunho do encerramento')).toBeInTheDocument()

    media.setDesktop(true)
    expect(container.querySelector('.admin-panel--support')).not.toBeNull()
    expect(screen.getByLabelText('Nova resposta')).toHaveValue('rascunho da resposta')
    expect(screen.getByLabelText('Mensagem de encerramento (opcional)')).toHaveValue('rascunho do encerramento')
    expect(mockListAllSupportTickets).toHaveBeenCalledTimes(1)
  })

  it('sem listener preso ao desmontar', async () => {
    const { unmount } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('tablet/mobile: a arvore anterior segue intacta (list-card, StatCards, abas com TabButton, "1 de 3")', async () => {
    media = installMatchMedia(false)
    const { container } = renderPanel()
    await screen.findByText('Mensagem do chamado 1')
    expect(container.querySelector('.list-card')).not.toBeNull()
    expect(container.querySelector('.dashboard-stat-row')).not.toBeNull()
    expect(container.querySelector('.as-root')).toBeNull()
    expect(screen.getByText('1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Em andamento' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Em andamento/ })).toBeNull()
  })
})
