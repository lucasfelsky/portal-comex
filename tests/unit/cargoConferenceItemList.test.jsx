// Conferência por item (Fatia A): a aba Itens (lista só com os itens, busca, "Só pendentes"), a barra de busca (teclado,
// limpar) e a navegação da tela (item na URL, "Próximo item" pelos itens da busca, voltar do aparelho, rolagem). Dados
// inventados (nenhum dado real). Repositórios mockados como em cargoConferenceScreen.test.jsx.
// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'

const mockGetCargoReport = vi.fn()

vi.mock('../../src/services/cargoReportRepository', () => ({
  getCargoReport: (...args) => mockGetCargoReport(...args),
  saveCargoReportConference: vi.fn(),
  reopenCargoReportConference: vi.fn(),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, itemCount: 0, items: [] }),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  getSupplierPackagingCatalog: vi.fn().mockResolvedValue({ exists: false, version: 0, entries: [], entryCount: 0, aliases: [] }),
  upsertSupplierPackagingEntry: vi.fn(),
}))
vi.mock('../../src/features/processes/useCargoConferenceList', () => ({ invalidateCargoConference: vi.fn() }))

import { ToastProvider } from '../../src/components/Toast'
import CargoConferenceItemList from '../../src/features/processes/CargoConferenceItemList'
import CargoConferenceScreen from '../../src/features/processes/CargoConferenceScreen'
import { buildCargoConferenceItems } from '../../src/features/processes/cargoConferenceItems'

const row = (id, code, name, supplier, lot = `L-${id}`) => ({
  id,
  po: '',
  dbcorpCode: code,
  sqDescription: name,
  supplierDescription: supplier,
  supplierLot: lot,
  quantityKg: 1000,
})

const ROWS = [
  row('r1', 'BA5012', 'Poliol Flex 3000', 'POLYETHER POLYOL PE-3000', 'L-2231'),
  row('r2', 'BA5012', 'Poliol Flex 3000', 'POLYETHER POLYOL PE-3000', 'L-2232'),
  row('r3', 'BA5033', 'Catalisador ZN-12', 'ZINC CATALYST ZN12', 'Z-9910'),
  row('r4', 'BA5190', 'Resina Acrílica RA-55', 'ACRYLIC RESIN AR-55 (50%)', 'A-1180'),
]
const model = buildCargoConferenceItems(ROWS, [])
const EMPTY = { okByRowId: {}, countOkByRowId: {}, palletsByRowId: {}, damageByRowId: {} }

function Harness({ conference = EMPTY, canSave = true, initialQuery = '', initialPending = false, pinned = new Set(), onOpen = vi.fn() }) {
  const [query, setQuery] = useState(initialQuery)
  const [pending, setPending] = useState(initialPending)
  return (
    <CargoConferenceItemList
      model={model}
      conference={conference}
      query={query}
      onQueryChange={setQuery}
      canSave={canSave}
      onlyPending={pending}
      onOnlyPendingChange={setPending}
      onMarkAllOk={vi.fn()}
      pinnedKeys={pinned}
      onOpen={onOpen}
    />
  )
}

const rowButton = (name) => screen.getByRole('button', { name: `Abrir ${name}` })
const searchBox = () => screen.getByRole('textbox', { name: 'Buscar item pelo nome' })

afterEach(() => {
  cleanup()
  document.body.className = ''
})

describe('lista de itens', () => {
  it('uma linha por item (não por lote): nome, "N lotes · d conferidos", barra fina e selos', () => {
    render(
      <Harness
        conference={{
          ...EMPTY,
          okByRowId: { r1: true, r3: true },
          palletsByRowId: { r1: 4, r3: 2 },
          damageByRowId: { r2: { flagged: true, note: 'Tambor amassado', photos: [] } },
        }}
      />
    )
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)
    const poliol = rowButton('Poliol Flex 3000')
    expect(within(poliol).getByText(/2 lotes/)).toBeInTheDocument()
    expect(within(poliol).getByText('1').tagName).toBe('B')
    expect(poliol).not.toHaveClass('ccf-irow--done')
    expect(within(poliol).getByText('4 pallets')).toBeInTheDocument()
    expect(within(poliol).getByText('Avaria registrada')).toHaveClass('ccf-badge--danger')
    expect(within(poliol).queryByText('Conferido')).not.toBeInTheDocument()
    const catalisador = rowButton('Catalisador ZN-12')
    expect(catalisador).toHaveClass('ccf-irow--done')
    expect(within(catalisador).getByText(/1 lote ·/)).toBeInTheDocument()
    expect(within(catalisador).getByText('Conferido')).toHaveClass('ccf-badge--ok')
    expect(within(catalisador).getByText('2 pallets')).toBeInTheDocument()
    expect(within(rowButton('Resina Acrílica RA-55')).getByText('0 pallets')).toBeInTheDocument()
    expect(screen.queryByText(/^de \d+ itens?$/)).not.toBeInTheDocument()
  })

  it('tocar na linha abre o item (onOpen com o item)', async () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    await userEvent.click(rowButton('Catalisador ZN-12'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0].name).toBe('Catalisador ZN-12')
  })

  it('"Marcar todos OK" e "Só pendentes" só para quem edita', () => {
    const { unmount } = render(<Harness />)
    expect(screen.getByRole('button', { name: 'Marcar todos OK' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Só pendentes' })).toBeInTheDocument()
    unmount()
    render(<Harness canSave={false} initialPending />)
    expect(screen.queryByRole('button', { name: 'Marcar todos OK' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Só pendentes' })).not.toBeInTheDocument()
    // Só leitura: o filtro não vale, a lista segue inteira e sem a contagem "X de Y".
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)
  })
})

describe('busca', () => {
  it('filtra ao digitar sem diferenciar caixa nem acento e mostra "X de Y itens"', async () => {
    render(<Harness />)
    await userEvent.type(searchBox(), 'ACRILICA')
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(1)
    expect(rowButton('Resina Acrílica RA-55')).toBeInTheDocument()
    expect(screen.getByText(/^de 3 itens$/).querySelector('b')).toHaveTextContent('1')
    // Achou pelo nome da SQ: sem motivo.
    expect(screen.queryByText(/Achado pelo/)).not.toBeInTheDocument()
  })

  it('quando o item aparece pelo fornecedor ou pelo código, a linha diz por quê', async () => {
    render(<Harness />)
    await userEvent.type(searchBox(), 'zinc catalyst')
    expect(within(rowButton('Catalisador ZN-12')).getByText('Achado pelo nome no fornecedor')).toBeInTheDocument()
    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), 'ba5190')
    expect(within(rowButton('Resina Acrílica RA-55')).getByText('Achado pelo código BA5190')).toBeInTheDocument()
  })

  it('sem resultado: "Nenhum item encontrado para “tinta”." e "Limpar busca" (secondary-button) que traz a lista de volta', async () => {
    render(<Harness />)
    await userEvent.type(searchBox(), 'tinta')
    expect(screen.getByText('Nenhum item encontrado para “tinta”.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('button', { name: /^Abrir / })).not.toBeInTheDocument()
    const clearButtons = screen.getAllByRole('button', { name: 'Limpar busca' })
    const secondary = clearButtons.find((button) => button.classList.contains('secondary-button'))
    expect(secondary).toBeDefined()
    await userEvent.click(secondary)
    expect(searchBox()).toHaveValue('')
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)
  })

  it('busca e "Só pendentes" valem juntos; sem resultado com o filtro ligado, o aviso diz isso', async () => {
    render(
      <Harness
        initialPending
        conference={{ ...EMPTY, okByRowId: { r3: true }, palletsByRowId: { r3: 1 } }}
      />
    )
    // Catalisador está conferido: o filtro o esconde; a busca por ele não acha nada.
    expect(screen.queryByRole('button', { name: 'Abrir Catalisador ZN-12' })).not.toBeInTheDocument()
    await userEvent.type(searchBox(), 'catalisador')
    expect(screen.getByText('Nenhum item encontrado para “catalisador”. O filtro Só pendentes está ligado.')).toBeInTheDocument()
    await userEvent.clear(searchBox())
    await userEvent.type(searchBox(), 'resina')
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(1)
    expect(screen.getByText(/^de 3 itens$/).querySelector('b')).toHaveTextContent('1')
  })

  it('o item fixado (tocado nesta sessão) continua na lista com o filtro ligado', () => {
    render(
      <Harness
        initialPending
        pinned={new Set([model.items[1].key])}
        conference={{ ...EMPTY, okByRowId: { r3: true }, palletsByRowId: { r3: 1 } }}
      />
    )
    expect(rowButton('Catalisador ZN-12')).toBeInTheDocument()
  })

  it('todos conferidos: aviso verde; com o filtro ligado e nada fixado, só o aviso', () => {
    const done = { okByRowId: { r1: true, r2: true, r3: true, r4: true }, palletsByRowId: { r1: 1, r2: 1, r3: 1, r4: 1 } }
    const { unmount } = render(<Harness conference={{ ...EMPTY, ...done }} />)
    expect(screen.getByText('Todos os itens estão conferidos.')).toHaveClass('ccf-note--ok')
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)
    unmount()
    render(<Harness initialPending conference={{ ...EMPTY, ...done }} />)
    expect(screen.getByText('Todos os itens estão conferidos.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Abrir / })).not.toBeInTheDocument()
  })
})

describe('barra de busca', () => {
  it('tem o texto, os atributos de teclado e a lupa; o limpar (44 px) só aparece com texto', async () => {
    render(<Harness />)
    const input = searchBox()
    expect(input).toHaveAttribute('placeholder', 'Buscar item')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('enterkeyhint', 'search')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('autocapitalize', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
    expect(document.querySelector('.ccf-sbar__ic svg')).not.toBeNull()
    expect(document.querySelector('.ccf-sbar__x')).toHaveAttribute('hidden')
    await userEvent.type(input, 'a')
    const clear = document.querySelector('.ccf-sbar__x')
    expect(clear).not.toHaveAttribute('hidden')
    expect(clear).toHaveAttribute('aria-label', 'Limpar busca')
    await userEvent.click(clear)
    expect(input).toHaveValue('')
  })

  it('o contêiner sticky e a barra ficam dentro de um bloco só (filho direto, sem overflow no meio)', () => {
    render(<Harness />)
    const wrap = document.querySelector('.ccf-searchwrap')
    expect(wrap).not.toBeNull()
    expect(wrap.querySelector('.ccf-sbar')).not.toBeNull()
  })

  it('com o campo em foco (teclado aberto) liga ccf-kbd no body; blur e desmonte desligam; Enter fecha o teclado', async () => {
    const { unmount } = render(<Harness />)
    const input = searchBox()
    expect(document.body).not.toHaveClass('ccf-kbd')
    await userEvent.click(input)
    expect(input).toHaveFocus()
    expect(document.body).toHaveClass('ccf-kbd')
    await userEvent.keyboard('{Enter}')
    expect(input).not.toHaveFocus()
    expect(document.body).not.toHaveClass('ccf-kbd')
    await userEvent.click(input)
    expect(document.body).toHaveClass('ccf-kbd')
    unmount()
    expect(document.body).not.toHaveClass('ccf-kbd')
  })

  it('limpar com o campo em foco não fecha o teclado (o foco volta ao campo)', async () => {
    render(<Harness initialQuery="poliol" />)
    const input = searchBox()
    await userEvent.click(input)
    const clear = document.querySelector('.ccf-sbar__x')
    // `mousedown` com preventDefault: o campo não perde o foco.
    expect(fireEvent.mouseDown(clear)).toBe(false)
    await userEvent.click(clear)
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(document.body).toHaveClass('ccf-kbd')
  })
})

describe('barra de busca fixa: classe "stuck" pela rolagem da página', () => {
  let top
  let rectTop
  let restoreRaf
  let rectSpy

  beforeEach(() => {
    top = 0
    rectTop = 300
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value) => {
        top = value
      },
    })
    const original = window.requestAnimationFrame
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 0
    }
    restoreRaf = () => {
      window.requestAnimationFrame = original
    }
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      const y = this.classList?.contains('ccf-searchwrap') ? rectTop : 0
      return { top: y, bottom: y, left: 0, right: 0, width: 0, height: 0, x: 0, y }
    })
  })

  afterEach(() => {
    delete document.documentElement.scrollTop
    restoreRaf()
    rectSpy.mockRestore()
  })

  const scrollTo = (scrollTop, barTop) => {
    act(() => {
      top = scrollTop
      rectTop = barTop
      window.dispatchEvent(new Event('scroll'))
    })
  }

  it('liga com a página rolada e a barra no topo fixo; desliga em scrollTop 0 e quando a barra ainda não chegou', () => {
    render(<Harness />)
    const wrap = document.querySelector('.ccf-searchwrap')
    expect(wrap).not.toHaveClass('ccf-searchwrap--stuck')
    // Rolou, mas a barra ainda está abaixo do topo fixo (0, pois o jsdom não resolve a variável): sem classe.
    scrollTo(120, 40)
    expect(wrap).not.toHaveClass('ccf-searchwrap--stuck')
    // Encostou (tolerância de 0,5 px).
    scrollTo(400, 0.4)
    expect(wrap).toHaveClass('ccf-searchwrap--stuck')
    scrollTo(900, 0)
    expect(wrap).toHaveClass('ccf-searchwrap--stuck')
    // De volta ao topo: nunca com scrollTop 0.
    scrollTo(0, 0)
    expect(wrap).not.toHaveClass('ccf-searchwrap--stuck')
  })

  it('desmontar tira o ouvinte de rolagem (nada atualiza depois)', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Harness />)
    unmount()
    expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true)
  })
})

// ---------- navegação da tela (item na URL) ----------

const PROCESS = { id: 'p1', name: 'DEMO SEA 001-26', category: 'FCL', supplierName: 'Fornecedor Alfa Ltda', archived: false }
const LOGISTICA = { uid: 'log-1', name: 'Operador Logística', email: 'op@sqquimica.com', role: 'logistica' }

const NAV_ROWS = [
  row('n1', 'BA5012', 'Alfa Um', 'ALPHA ONE'),
  row('n2', 'BA5033', 'Beta Dois', 'BETA TWO'),
  row('n3', 'BA5190', 'Alfa Três', 'ALPHA THREE'),
]

function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>
        voltar do aparelho
      </button>
    </>
  )
}

async function renderNav({ entry = '/conferencia?processo=p1', rows = NAV_ROWS } = {}) {
  mockGetCargoReport.mockResolvedValue({
    current: { status: 'concluido', revision: 1, cargoType: 'FCL', titleSuffix: 'DEMO', rows },
    conference: { revision: 1, status: 'aberta', okByRowId: {}, palletsByRowId: {}, damageByRowId: {}, labelsByRowId: {} },
  })
  const user = userEvent.setup()
  const utils = render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <CargoConferenceScreen process={PROCESS} profile={LOGISTICA} canSeeName onBack={vi.fn()} />
      </MemoryRouter>
    </ToastProvider>
  )
  // Lista (abas) ou, na entrada direta, a tela do item (voltar na faixa e na barra de ações).
  await waitFor(() =>
    expect(screen.queryByRole('tablist') ?? screen.queryAllByRole('button', { name: 'Voltar aos itens' })[0]).toBeTruthy()
  )
  return { user, ...utils }
}

describe('navegação: item na URL', () => {
  let scrollTop

  beforeEach(() => {
    scrollTop = 0
    Object.defineProperty(document.documentElement, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value) => {
        scrollTop = value
      },
    })
    mockGetCargoReport.mockReset()
  })

  afterEach(() => {
    delete document.documentElement.scrollTop
  })

  const itemButton = (name) => screen.getByRole('button', { name: `Abrir ${name}` })
  const location = () => screen.getByTestId('location').textContent

  it('abrir o item põe `item` na URL (mantendo `processo`); o voltar do aparelho volta à lista de itens do mesmo processo', async () => {
    const { user } = await renderNav()
    await user.click(itemButton('Beta Dois'))
    expect(location()).toMatch(/^\/conferencia\?processo=p1&item=/)
    expect(screen.getByRole('heading', { level: 2, name: 'Beta Dois' })).toBeInTheDocument()
    expect(screen.getByText('Item 2 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'voltar do aparelho' }))
    expect(location()).toBe('/conferencia?processo=p1')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(itemButton('Beta Dois')).toBeInTheDocument()
  })

  it('"Voltar aos itens" (faixa) volta no histórico quando veio da lista', async () => {
    const { user } = await renderNav()
    await user.click(itemButton('Alfa Um'))
    await user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
    expect(location()).toBe('/conferencia?processo=p1')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('entrada direta no item (sem histórico da lista): voltar troca a URL e mostra a lista', async () => {
    const { user } = await renderNav({ entry: '/conferencia?processo=p1&item=all~c%3ABA5190' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Alfa Três' })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
    expect(location()).toBe('/conferencia?processo=p1')
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })

  it('`item` que não existe: mostra a lista', async () => {
    await renderNav({ entry: '/conferencia?processo=p1&item=nao-existe' })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(itemButton('Alfa Um')).toBeInTheDocument()
  })

  it('a busca e o Só pendentes sobrevivem a abrir e voltar do item', async () => {
    const { user } = await renderNav()
    await user.type(searchBox(), 'alfa')
    await user.click(screen.getByRole('checkbox', { name: 'Só pendentes' }))
    await user.click(itemButton('Alfa Um'))
    await user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
    expect(searchBox()).toHaveValue('alfa')
    expect(screen.getByRole('checkbox', { name: 'Só pendentes' })).toBeChecked()
    expect(screen.getAllByRole('button', { name: /^Abrir / })).toHaveLength(2)
  })

  it('"Próximo item" anda só pelos itens da busca (pula o que ficou de fora) e troca a URL sem empilhar histórico', async () => {
    const { user } = await renderNav()
    await user.type(searchBox(), 'alfa')
    await user.click(itemButton('Alfa Um'))
    expect(screen.getByText('Item 1 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    // Beta Dois não bate com a busca: pula para o item 3 (a posição é a da lista inteira).
    expect(screen.getByRole('heading', { level: 2, name: 'Alfa Três' })).toBeInTheDocument()
    expect(screen.getByText('Item 3 de 3')).toBeInTheDocument()
    // Último da busca: "Voltar aos itens" no lugar de "Próximo item" (na barra de ações).
    const bar = screen.getByRole('group', { name: 'Ações da conferência' })
    expect(within(bar).queryByRole('button', { name: /Próximo item/ })).not.toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Voltar aos itens' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
    // Um passo só de volta: o Próximo item trocou (replace) a entrada do item.
    await user.click(screen.getByRole('button', { name: 'voltar do aparelho' }))
    expect(location()).toBe('/conferencia?processo=p1')
    expect(searchBox()).toHaveValue('alfa')
  })

  it('o Só pendentes não limita o Próximo item (anda por todos os itens da busca)', async () => {
    const { user } = await renderNav()
    await user.click(itemButton('Alfa Um'))
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Beta Dois' })).toBeInTheDocument()
  })

  it('a rolagem da lista volta ao lugar ao voltar do item; abrir o item e o Próximo item sobem ao topo', async () => {
    const { user } = await renderNav()
    scrollTop = 480
    await user.click(itemButton('Alfa Um'))
    expect(scrollTop).toBe(0)
    scrollTop = 150
    await user.click(screen.getByRole('button', { name: /Próximo item/ }))
    expect(scrollTop).toBe(0)
    await user.click(screen.getAllByRole('button', { name: 'Voltar aos itens' })[0])
    await waitFor(() => expect(scrollTop).toBe(480))
  })
})
