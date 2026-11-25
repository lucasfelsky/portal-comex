// Tests do AdminCargoReportRecipientsPanel (/admin/relatorio-carga).
// Cobre: loading, erro de load, doc inexistente, render das 2 listas e contador,
// adicionar (trim/minúsculas), rejeições (duplicado, não-corporativo, vazio), bloqueio em 50,
// remover, salvar (payload + actor), "Salvando…", sucesso, erro de save, entradas inválidas
// do doc legado e "Descartar alterações".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockUseAuth = vi.fn()
const mockGetRecipients = vi.fn()
const mockSaveRecipients = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/lib/firebase', () => ({
  isFirebaseConfigured: false,
}))
vi.mock('../../src/services/cargoReportRecipientsRepository', () => ({
  getCargoReportRecipients: (...args) => mockGetRecipients(...args),
  saveCargoReportRecipients: (...args) => mockSaveRecipients(...args),
}))
// Card da tabela Item x Emb. (S2) tem teste proprio (tests/unit/itemPackagingCatalogCard.test.jsx).
vi.mock('../../src/features/admin/ItemPackagingCatalogCard', () => ({
  default: () => <div data-testid="item-packaging-card" />,
}))

// Card das embalagens por item + fornecedor (S9-D) tem teste proprio (tests/unit/supplierPackagingCatalogCard.test.jsx).
vi.mock('../../src/features/admin/SupplierPackagingCatalogCard', () => ({
  default: () => <div data-testid="supplier-packaging-card" />,
}))

import AdminCargoReportRecipientsPanel from '../../src/features/admin/AdminCargoReportRecipientsPanel'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const LOADED = {
  exists: true,
  tecnico: ['tec1@sqquimica.com', 'tec2@sqquimica.com'],
  faturamento: ['fiscal@sqquimica.com'],
  ignoredNonCorporate: 0,
  invalidEntries: [],
}

function renderPanel() {
  return render(<AdminCargoReportRecipientsPanel />)
}

async function renderLoaded() {
  const utils = renderPanel()
  await screen.findByRole('heading', { name: 'Técnico' })
  return utils
}

function card(name) {
  return screen.getByRole('heading', { name }).closest('article')
}

async function addEmail(user, name, value) {
  const article = card(name)
  const input = within(article).getByLabelText('Adicionar e-mail')
  await user.clear(input)
  if (value) await user.type(input, value)
  await user.click(within(article).getByRole('button', { name: 'Adicionar' }))
}

const fifty = (count) => Array.from({ length: count }, (_, index) => `user${index}@sqquimica.com`)

beforeEach(() => {
  mockUseAuth.mockReset()
  mockGetRecipients.mockReset()
  mockSaveRecipients.mockReset()
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetRecipients.mockResolvedValue(LOADED)
  mockSaveRecipients.mockImplementation((lists) => Promise.resolve(lists))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AdminCargoReportRecipientsPanel', () => {
  it('loading inicial: skeleton com texto acessível', () => {
    let resolveGet
    mockGetRecipients.mockReturnValue(new Promise((resolve) => { resolveGet = resolve }))
    const { container } = renderPanel()
    expect(screen.getByLabelText('Carregando destinatários')).toBeInTheDocument()
    expect(container.querySelector('.skeleton')).toBeTruthy()
    resolveGet(LOADED)
  })

  it('erro ao carregar aparece no error-banner', async () => {
    mockGetRecipients.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'permission-denied' }))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar os destinatários/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Técnico' })).not.toBeInTheDocument()
  })

  it('o card da tabela Item x Emb. aparece carregando, com erro e com os destinatários prontos', async () => {
    let resolveGet
    mockGetRecipients.mockReturnValueOnce(new Promise((resolve) => { resolveGet = resolve }))
    const { unmount } = renderPanel()
    expect(screen.getByTestId('item-packaging-card')).toBeInTheDocument()
    resolveGet(LOADED)
    await screen.findByRole('heading', { name: 'Técnico' })
    expect(screen.getByTestId('item-packaging-card')).toBeInTheDocument()
    unmount()

    mockGetRecipients.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'permission-denied' }))
    renderPanel()
    expect(await screen.findByText(/Não foi possível carregar os destinatários/i)).toBeInTheDocument()
    expect(screen.getByTestId('item-packaging-card')).toBeInTheDocument()
  })

  it('doc inexistente: banner e listas vazias', async () => {
    mockGetRecipients.mockResolvedValue({
      exists: false,
      tecnico: [],
      faturamento: [],
      ignoredNonCorporate: 0,
      invalidEntries: [],
    })
    await renderLoaded()
    expect(
      screen.getByText('Nenhuma lista cadastrada ainda. Ao salvar, a configuração será criada.')
    ).toBeInTheDocument()
    expect(screen.getAllByText('Nenhum e-mail cadastrado.')).toHaveLength(2)
  })

  it('renderiza as 2 listas com itens e contador', async () => {
    await renderLoaded()
    const tecnico = card('Técnico')
    const faturamento = card('Faturamento/fiscal')
    expect(within(tecnico).getByText('tec1@sqquimica.com')).toBeInTheDocument()
    expect(within(tecnico).getByText('tec2@sqquimica.com')).toBeInTheDocument()
    expect(within(tecnico).getByText('2 de 50')).toBeInTheDocument()
    expect(within(faturamento).getByText('fiscal@sqquimica.com')).toBeInTheDocument()
    expect(within(faturamento).getByText('1 de 50')).toBeInTheDocument()
    expect(
      screen.queryByText('Nenhuma lista cadastrada ainda. Ao salvar, a configuração será criada.')
    ).not.toBeInTheDocument()
  })

  it('avisa quando há e-mails fora do domínio no documento atual', async () => {
    mockGetRecipients.mockResolvedValue({ ...LOADED, ignoredNonCorporate: 3 })
    await renderLoaded()
    expect(screen.getByText(/3 e-mail\(s\) fora do domínio @sqquimica\.com/)).toBeInTheDocument()
  })

  it('adiciona com trim e minúsculas', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await addEmail(user, 'Faturamento/fiscal', '  Novo@SQQuimica.com ')
    const faturamento = card('Faturamento/fiscal')
    expect(within(faturamento).getByText('novo@sqquimica.com')).toBeInTheDocument()
    expect(within(faturamento).getByText('2 de 50')).toBeInTheDocument()
    expect(within(faturamento).getByLabelText('Adicionar e-mail')).toHaveValue('')
  })

  it('Enter no campo também adiciona', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const input = within(card('Técnico')).getByLabelText('Adicionar e-mail')
    await user.type(input, 'enter@sqquimica.com{Enter}')
    expect(within(card('Técnico')).getByText('enter@sqquimica.com')).toBeInTheDocument()
  })

  it('rejeita duplicado, não-corporativo e vazio com erro inline', async () => {
    const user = userEvent.setup()
    await renderLoaded()

    await addEmail(user, 'Técnico', 'TEC1@sqquimica.com')
    expect(within(card('Técnico')).getByRole('alert')).toHaveTextContent('Este e-mail já está nesta lista.')

    await addEmail(user, 'Técnico', 'alguem@gmail.com')
    expect(within(card('Técnico')).getByRole('alert')).toHaveTextContent(
      'Use um e-mail corporativo @sqquimica.com.'
    )

    await addEmail(user, 'Técnico', '')
    expect(within(card('Técnico')).getByRole('alert')).toHaveTextContent('Informe um e-mail.')

    expect(within(card('Técnico')).getByText('2 de 50')).toBeInTheDocument()
  })

  it('o erro inline some ao digitar de novo', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await addEmail(user, 'Técnico', 'x@gmail.com')
    expect(within(card('Técnico')).getByRole('alert')).toBeInTheDocument()
    await user.type(within(card('Técnico')).getByLabelText('Adicionar e-mail'), 'a')
    expect(within(card('Técnico')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('bloqueia a adição com 50 itens', async () => {
    mockGetRecipients.mockResolvedValue({ ...LOADED, tecnico: fifty(50) })
    await renderLoaded()
    const tecnico = card('Técnico')
    expect(within(tecnico).getByText('50 de 50')).toBeInTheDocument()
    expect(within(tecnico).getByLabelText('Adicionar e-mail')).toBeDisabled()
    expect(within(tecnico).getByRole('button', { name: 'Adicionar' })).toBeDisabled()
    // A outra lista continua livre.
    expect(within(card('Faturamento/fiscal')).getByLabelText('Adicionar e-mail')).toBeEnabled()
  })

  it('remove um e-mail da lista', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: 'Remover tec1@sqquimica.com da lista Técnico' }))
    const tecnico = card('Técnico')
    expect(within(tecnico).queryByText('tec1@sqquimica.com')).not.toBeInTheDocument()
    expect(within(tecnico).getByText('1 de 50')).toBeInTheDocument()
  })

  it('"Salvar alterações" fica desabilitado sem mudança e habilita ao editar', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar alterações' })).toBeDisabled()
    await addEmail(user, 'Técnico', 'novo@sqquimica.com')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Descartar alterações' })).toBeEnabled()
  })

  it('salvar chama saveCargoReportRecipients com as listas e o profile e mostra sucesso', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await addEmail(user, 'Técnico', 'novo@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Remover fiscal@sqquimica.com da lista Faturamento/fiscal' }))
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(mockSaveRecipients).toHaveBeenCalledWith(
        {
          tecnico: ['tec1@sqquimica.com', 'tec2@sqquimica.com', 'novo@sqquimica.com'],
          faturamento: [],
        },
        PROFILE
      )
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Destinatários salvos. O próximo Relatório de Carga já usa as novas listas.'
    )
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('mostra "Salvando…" e desabilita os controles durante o save', async () => {
    const user = userEvent.setup()
    let resolveSave
    mockSaveRecipients.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    await renderLoaded()
    await addEmail(user, 'Técnico', 'novo@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    const saving = await screen.findByRole('button', { name: 'Salvando…' })
    expect(saving).toBeDisabled()
    expect(within(card('Técnico')).getByLabelText('Adicionar e-mail')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descartar alterações' })).toBeDisabled()

    resolveSave({ tecnico: ['tec1@sqquimica.com', 'tec2@sqquimica.com', 'novo@sqquimica.com'], faturamento: LOADED.faturamento })
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('erro ao salvar aparece como alerta e mantém o rascunho', async () => {
    const user = userEvent.setup()
    mockSaveRecipients.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'permission-denied' }))
    await renderLoaded()
    await addEmail(user, 'Técnico', 'novo@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    const alert = await screen.findByText(/Não foi possível salvar os destinatários/i)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
    expect(within(card('Técnico')).getByText('novo@sqquimica.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
  })

  it('entradas inválidas do doc bloqueiam o save até serem removidas', async () => {
    const user = userEvent.setup()
    mockGetRecipients.mockResolvedValue({
      ...LOADED,
      tecnico: ['tec1@sqquimica.com', 'joão@sqquimica.com'],
      invalidEntries: ['joão@sqquimica.com'],
    })
    await renderLoaded()
    expect(screen.getByText('Há e-mails em formato inválido. Remova-os para salvar.')).toBeInTheDocument()
    expect(within(card('Técnico')).getByText(/Formato inválido - remova para salvar/)).toBeInTheDocument()

    // Edita outra lista: mesmo sujo, o save segue bloqueado pelo item inválido.
    await addEmail(user, 'Faturamento/fiscal', 'novo@sqquimica.com')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remover joão@sqquimica.com da lista Técnico' }))
    expect(screen.queryByText('Há e-mails em formato inválido. Remova-os para salvar.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
  })

  it('"Descartar alterações" restaura o último estado salvo', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await addEmail(user, 'Técnico', 'novo@sqquimica.com')
    await user.click(screen.getByRole('button', { name: 'Remover fiscal@sqquimica.com da lista Faturamento/fiscal' }))
    await user.click(screen.getByRole('button', { name: 'Descartar alterações' }))

    expect(within(card('Técnico')).queryByText('novo@sqquimica.com')).not.toBeInTheDocument()
    expect(within(card('Faturamento/fiscal')).getByText('fiscal@sqquimica.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
    expect(mockSaveRecipients).not.toHaveBeenCalled()
  })
})
