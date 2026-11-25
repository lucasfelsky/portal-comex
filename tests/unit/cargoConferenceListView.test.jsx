// S9-F do Relatório de Carga: lista da aba Conferência (CargoConferenceListView). Entradas montadas com as regras reais
// (`summarizeCargoConferenceEntry`); filtro e busca ficam na página, aqui num Harness.
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ToastProvider } from '../../src/components/Toast'
import CargoConferenceListView from '../../src/features/processes/CargoConferenceListView'
import { summarizeCargoConferenceEntry } from '../../src/features/processes/cargoConferenceList'

const NOW = new Date(2026, 10, 25, 10, 0)
const iso = (...args) => new Date(...args).toISOString()
const render = (ui) => rtlRender(ui, { wrapper: ToastProvider })

// A lista usa o relógio do aparelho (ordem e "quando"): congelado em NOW (só `Date`) para o teste não depender da hora.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const rows = (count) => Array.from({ length: count }, (_, index) => ({ id: `r-${index}`, dbcorpCode: `A${index}`, quantityKg: 10 }))
const current = (count, status = 'concluido') => ({ status, revision: 1, rows: rows(count) })

const GOOYER = {
  id: 'gooyer',
  name: 'GOOYER SEA 001-26',
  processNumber: '4500123',
  category: 'FCL',
  supplierName: 'GOOYER CHEMICALS LTD',
  archived: false,
  collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 25, 14, 0) }],
}
const ACME_AIR = {
  id: 'air',
  name: 'ACME AIR 044-26',
  category: 'AEREO',
  supplierName: 'ACME AEROSPACE INC',
  archived: false,
  collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 26, 9, 30) }],
}
const CONS = {
  id: 'cons',
  name: 'CON DG 009-26',
  category: 'CONSOLIDADO',
  archived: false,
  collectionStatus: 'Carga a caminho do CD',
  collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 24, 9, 0) }],
  purchaseOrders: [
    { po: '1', reference: 'ACME SEA 011-26', supplierName: 'ACME RESINS CO' },
    { po: '2', reference: 'NOVA SEA 034-26', supplierName: 'NOVA POLYMERS' },
    { po: '3', reference: 'ORION SEA 007-26', supplierName: 'ORION CHEM CO' },
  ],
}
const NOVA = {
  id: 'nova',
  name: 'NOVA SEA 034-26',
  category: 'LCL',
  supplierName: 'NOVA POLYMERS',
  archived: false,
  collectionStatus: 'Veículo no CD para descarga',
  cargoReceivedAt: iso(2026, 10, 24, 15, 0),
}
const ORION = {
  id: 'orion',
  name: 'ORION SEA 007-26',
  category: 'FCL',
  supplierName: 'ORION CHEM CO',
  archived: false,
  collectionStatus: 'Veículo no CD para descarga',
  cargoReceivedAt: iso(2026, 10, 24, 10, 0),
}
const KRONOS = {
  id: 'kronos',
  name: 'KRONOS SEA 012-26',
  category: 'FCL',
  supplierName: 'KRONOS MATERIALS',
  archived: false,
  collectionWindows: [{ id: 'w', scheduledAt: iso(2026, 10, 27, 10, 0) }],
}

const entry = (process, report, options) => summarizeCargoConferenceEntry(process, report, { now: NOW, ...options })

const ENTRIES = [
  entry(GOOYER, {
    current: current(3),
    conference: { okByRowId: { 'r-0': true }, countOkByRowId: { 'r-0': true } },
  }),
  entry(ACME_AIR, { current: current(2, 'rascunho'), conference: null }),
  entry(CONS, { current: current(5), conference: { okByRowId: { 'r-0': true }, countOkByRowId: { 'r-0': true } } }),
  entry(NOVA, { current: current(2), conference: { receiptStatus: 'sem_ressalva' } }),
  entry(ORION, { current: current(1), conference: { status: 'fechada', receiptStatus: 'com_ressalva' } }),
  entry(KRONOS, { current: null, conference: null }),
]

function Harness({ entries = ENTRIES, status = 'ready', isAdmin = false, canSeeName = true, handlers = {} }) {
  const [filter, setFilter] = useState('pendentes')
  const [query, setQuery] = useState('')
  return (
    <CargoConferenceListView
      entries={entries}
      status={status}
      isAdmin={isAdmin}
      canSeeName={canSeeName}
      filter={filter}
      query={query}
      onFilterChange={setFilter}
      onQueryChange={setQuery}
      onRefresh={handlers.onRefresh ?? vi.fn()}
      onRetryEntry={handlers.onRetryEntry ?? vi.fn()}
      onOpen={handlers.onOpen ?? vi.fn()}
    />
  )
}

const cards = () => screen.getAllByRole('button').filter((button) => button.classList.contains('ccf-entry'))
const titles = () => cards().map((card) => card.querySelector('.ccf-entry__title').textContent)

describe('lista da aba Conferência', () => {
  it('selo do papel, texto de apoio, busca e filtros com a contagem', () => {
    render(<Harness />)
    expect(screen.getByText('Logística')).toBeInTheDocument()
    expect(
      screen.getByText('Previsão de chegada nesta semana, mais conferências abertas de semanas anteriores.')
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar processo, fornecedor ou tipo' })).toHaveAttribute(
      'placeholder',
      'Buscar processo, fornecedor ou tipo'
    )
    const para = screen.getByRole('button', { name: /Para conferir/ })
    const fechadas = screen.getByRole('button', { name: /Fechadas/ })
    expect(para).toHaveAttribute('aria-pressed', 'true')
    expect(fechadas).toHaveAttribute('aria-pressed', 'false')
    expect(para).toHaveTextContent('Para conferir5')
    expect(fechadas).toHaveTextContent('Fechadas1')
  })

  it('admin: selo "Admin · só acompanha"', () => {
    render(<Harness isAdmin />)
    expect(screen.getByText('Admin · só acompanha')).toBeInTheDocument()
  })

  it('"Para conferir" ordena por fase e data; bloqueado no fim; "Fechadas" mostra só as fechadas', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(titles()).toEqual([
      'GOOYER SEA 001-26',
      'ACME AIR 044-26',
      'CON DG 009-26',
      'NOVA SEA 034-26',
      'KRONOS SEA 012-26',
    ])
    await user.click(screen.getByRole('button', { name: /Fechadas/ }))
    expect(screen.getByRole('button', { name: /Fechadas/ })).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toEqual(['ORION SEA 007-26'])
  })

  it('cartão: selo da fase, "categoria · fornecedor · quando", progresso e selo do COMEX', () => {
    render(<Harness />)
    const gooyer = cards()[0]
    expect(within(gooyer).getByText('Coleta agendada')).toHaveClass('status-tag')
    expect(gooyer).toHaveTextContent('FCL · GOOYER CHEMICALS LTD · Coleta hoje 14:00')
    expect(gooyer).toHaveTextContent('1 de 3 itens conferidos')
    expect(within(gooyer).getByText('COMEX fechado')).toBeInTheDocument()
    expect(gooyer.querySelector('.ccf-bar')).toHaveAttribute('aria-hidden', 'true')
    expect(gooyer.querySelector('.ccf-bar > i').style.width).toBe('33%')

    const air = cards()[1]
    expect(air).toHaveTextContent('AÉREO · ACME AEROSPACE INC · Coleta amanhã 09:30')
    expect(within(air).getByText('COMEX em rascunho')).toBeInTheDocument()
    expect(air).toHaveTextContent('0 de 2 itens conferidos')

    const cons = cards()[2]
    expect(cons).toHaveTextContent('CONSOLIDADO · 3 POs · Coleta feita 24/11')
    expect(cons).toHaveTextContent('1 de 5 itens conferidos')
    expect(cards()[3]).toHaveTextContent('LCL · NOVA POLYMERS · Recebida ontem')
  })

  it('selo "Conferência fechada" no filtro Fechadas', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Fechadas/ }))
    expect(within(cards()[0]).getByText('Conferência fechada')).toBeInTheDocument()
    expect(cards()[0]).toHaveTextContent('0 de 1 itens conferidos')
  })

  it('busca sem acento e sem caixa; vazio com busca: "Tente outra busca."', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const search = screen.getByRole('searchbox')
    await user.type(search, 'aereo')
    expect(titles()).toEqual(['ACME AIR 044-26'])
    await user.clear(search)
    await user.type(search, 'nova polymers')
    expect(titles()).toEqual(['CON DG 009-26', 'NOVA SEA 034-26'])
    await user.clear(search)
    await user.type(search, 'inexistente')
    expect(cards()).toHaveLength(0)
    expect(screen.getByText('Nada por aqui. Tente outra busca.')).toBeInTheDocument()
  })

  it('sem nenhum processo: "Quando uma coleta for agendada, o processo aparece nesta lista."', () => {
    render(<Harness entries={[]} />)
    expect(screen.getByText('Nenhum processo com previsão de chegada nesta semana.')).toBeInTheDocument()
  })

  it('o nome do processo vem de getProcessTitle (quem não vê o nome de FCL/LCL/AÉREO vê "PO: …")', () => {
    render(<Harness canSeeName={false} entries={[ENTRIES[0]]} />)
    expect(titles()).toEqual(['PO: 4500123'])
  })

  it('toque num processo normal abre a conferência (onOpen com o id)', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<Harness handlers={{ onOpen }} />)
    await user.click(cards()[0])
    expect(onOpen).toHaveBeenCalledWith('gooyer')
  })
})

describe('processo sem Relatório de Carga', () => {
  it('bloqueado: aria-disabled, nota com a explicação e sem barra de progresso', () => {
    render(<Harness />)
    const kronos = cards().find((card) => card.textContent.includes('KRONOS'))
    expect(kronos).toHaveAttribute('aria-disabled', 'true')
    expect(kronos).toHaveClass('ccf-entry--blocked')
    expect(kronos).toHaveTextContent(
      'O COMEX ainda não criou o Relatório de Carga deste processo. Sem ele não há o que conferir.'
    )
    expect(kronos.querySelector('.ccf-bar')).toBeNull()
    expect(kronos).toHaveTextContent('Coleta 27/11 10:00')
  })

  it('o toque avisa por toast e não navega', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<Harness handlers={{ onOpen }} />)
    await user.click(cards().find((card) => card.textContent.includes('KRONOS')))
    expect(await screen.findByText('Sem Relatório de Carga do COMEX: nada para conferir ainda.')).toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('carga, atualizar e erro', () => {
  it('"Atualizar" pede a releitura', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(<Harness handlers={{ onRefresh }} />)
    const button = screen.getByRole('button', { name: 'Atualizar' })
    expect(button).toHaveClass('secondary-button')
    await user.click(button)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('carregando sem cartões: 3 esqueletos e o botão fica desabilitado', () => {
    const { container } = render(<Harness entries={[]} status="loading" />)
    expect(screen.getByRole('status', { name: 'Carregando processos' })).toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeDisabled()
    expect(screen.queryByText(/Nada por aqui/)).not.toBeInTheDocument()
  })

  it('carregando com os cartões dos candidatos: cada um mostra "Carregando…" até o relatório chegar', () => {
    const loading = [entry(GOOYER, undefined), ENTRIES[1]]
    render(<Harness entries={loading} status="loading" />)
    expect(cards()).toHaveLength(2)
    expect(cards()[0]).toHaveTextContent('Carregando…')
    expect(cards()[0]).toHaveAttribute('aria-disabled', 'true')
    expect(cards()[1]).toHaveTextContent('0 de 2 itens conferidos')
    expect(screen.getByRole('button', { name: 'Atualizando…' })).toBeDisabled()
  })

  it('erro de leitura de um processo não derruba a lista: o toque tenta de novo', async () => {
    const user = userEvent.setup()
    const onRetryEntry = vi.fn()
    const entries = [entry(GOOYER, undefined, { error: true }), ENTRIES[1]]
    render(<Harness entries={entries} handlers={{ onRetryEntry }} />)
    expect(cards()).toHaveLength(2)
    // Com erro de leitura o cartão vai para o fim da lista (como o bloqueado).
    expect(titles()).toEqual(['ACME AIR 044-26', 'GOOYER SEA 001-26'])
    expect(cards()[1]).toHaveTextContent('Não foi possível ler o relatório. Toque para tentar de novo.')
    await user.click(cards()[1])
    expect(onRetryEntry).toHaveBeenCalledWith('gooyer')
  })

  it('erro geral ao listar: alerta com "Tentar novamente"', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    render(<Harness entries={[]} status="error" handlers={{ onRefresh }} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar os processos.')
    await user.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('previsão de chegada e semana anterior (S9-G)', () => {
  const OLD = {
    id: 'antigo',
    name: 'ANTIGO SEA 003-26',
    category: 'FCL',
    supplierName: 'ANTIGO LTDA',
    archived: false,
    collectionStatus: 'Veículo no CD para descarga',
    cargoReceivedAt: iso(2026, 10, 20, 15, 0),
  }
  const withOld = [
    entry(OLD, { current: current(2), conference: { receiptStatus: 'sem_ressalva' } }),
    ENTRIES[0],
  ]

  it('o cartão mostra a previsão de chegada em formato curto (dia da semana e dd/mm)', () => {
    render(<Harness />)
    expect(cards()[0]).toHaveTextContent('Chegada prevista qua 25/11')
    expect(cards()[1]).toHaveTextContent('Chegada prevista qui 26/11')
    // Carga já recebida mostra a data real.
    expect(cards().find((card) => card.textContent.includes('NOVA SEA'))).toHaveTextContent('Chegada ter 24/11')
  })

  it('pendência de semana anterior vem primeiro, com o selo discreto "Semana anterior" (aviso)', () => {
    render(<Harness entries={withOld} />)
    expect(titles()).toEqual(['ANTIGO SEA 003-26', 'GOOYER SEA 001-26'])
    const old = cards()[0]
    expect(old).toHaveTextContent('Chegada sex 20/11')
    const badge = within(old).getByText('Semana anterior')
    expect(badge).toHaveClass('ccf-badge', 'ccf-badge--warn')
    expect(within(cards()[1]).queryByText('Semana anterior')).not.toBeInTheDocument()
    // O resto do cartão segue: progresso e selo do COMEX.
    expect(old).toHaveTextContent('0 de 2 itens conferidos')
    expect(old).toHaveTextContent('COMEX fechado')
  })

  it('conferência fechada de semana anterior não aparece em nenhum filtro; os chips contam só o visível', async () => {
    const user = userEvent.setup()
    const closedOld = entry(OLD, { current: current(1), conference: { status: 'fechada', receiptStatus: 'sem_ressalva' } })
    render(<Harness entries={[closedOld, ...withOld]} />)
    expect(screen.getByRole('button', { name: /Para conferir/ })).toHaveTextContent('Para conferir2')
    expect(screen.getByRole('button', { name: /Fechadas/ })).toHaveTextContent('Fechadas0')
    await user.click(screen.getByRole('button', { name: /Fechadas/ }))
    expect(cards()).toHaveLength(0)
    expect(screen.getByText('Nenhum processo com previsão de chegada nesta semana.')).toBeInTheDocument()
  })
})
