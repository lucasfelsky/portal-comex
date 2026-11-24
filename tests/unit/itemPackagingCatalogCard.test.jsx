// S2 do Relatório de Carga: card "Tabela Item x Emb." (versão atual + importação com prévia).
// O repositório e o leitor de .xlsx são mockados; a prévia usa o diff real do módulo puro.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUseAuth = vi.fn()
const mockGetCatalog = vi.fn()
const mockSaveCatalog = vi.fn()
const mockReadWorkbook = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  ITEM_PACKAGING_VERSION_CONFLICT_CODE: 'catalog/version-conflict',
  getItemPackagingCatalog: (...args) => mockGetCatalog(...args),
  saveItemPackagingCatalog: (...args) => mockSaveCatalog(...args),
}))
vi.mock('../../src/features/processes/cargoReportCatalog', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readItemPackagingWorkbook: (...args) => mockReadWorkbook(...args) }
})

import ItemPackagingCatalogCard from '../../src/features/admin/ItemPackagingCatalogCard'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const CURRENT_ITEMS = [
  { code: 'AA0001', description: 'ITEM UM', packagingType: 'BALDE', netWeightKg: 5 },
  { code: 'AA0002', description: 'ITEM DOIS', packagingType: 'CAIXA', netWeightKg: 5 },
  { code: 'AA0003', description: 'ITEM TRES', packagingType: '', netWeightKg: null },
]

const LOADED = {
  exists: true,
  version: 3,
  items: CURRENT_ITEMS,
  itemCount: 3,
  sourceFileName: 'FR.CMX.001.xlsx',
  sourceSheetName: 'Item x Emb.',
  sourceSha256: 'a'.repeat(64),
  importedAt: new Date(2026, 10, 23, 19, 40),
  importedById: 'u1',
  importedByName: 'Lucas Felsky',
}

const EMPTY = { ...LOADED, exists: false, version: 0, items: [], itemCount: 0, importedAt: null, importedByName: '' }

function parsed(items, overrides = {}) {
  return {
    items,
    errors: [],
    warnings: [],
    stats: { rows: items.length, withPackaging: 0, withoutPackaging: 0, packagingTypes: {} },
    fatal: '',
    sourceFileName: 'nova.xlsx',
    sourceSheetName: 'Item x Emb.',
    sourceSha256: 'b'.repeat(64),
    estimatedBytes: 1000,
    ...overrides,
  }
}

// novo + alterado + removido (AA0003) + inalterado (AA0001)
const NEXT_WITH_REMOVED = [
  CURRENT_ITEMS[0],
  { ...CURRENT_ITEMS[1], netWeightKg: 25 },
  { code: 'AA0009', description: 'NOVO', packagingType: 'PET', netWeightKg: 1 },
]
// só novo + alterado (sem removidos)
const NEXT_NO_REMOVED = [...NEXT_WITH_REMOVED, CURRENT_ITEMS[2]]

async function chooseFile(user, name = 'nova.xlsx') {
  const input = screen.getByLabelText('Planilha .xlsx com a aba Item x Emb.')
  await user.upload(input, new File(['x'], name))
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetCatalog.mockResolvedValue(LOADED)
  mockSaveCatalog.mockResolvedValue({ version: 4, itemCount: 3 })
  mockReadWorkbook.mockResolvedValue(parsed(NEXT_NO_REMOVED))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ItemPackagingCatalogCard', () => {
  it('carregando: skeleton com texto acessível', () => {
    mockGetCatalog.mockReturnValue(new Promise(() => {}))
    render(<ItemPackagingCatalogCard />)
    expect(screen.getByRole('status', { name: 'Carregando tabela Item x Emb.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tabela Item x Emb.' })).toBeInTheDocument()
  })

  it('vazio: avisa que nenhuma tabela foi importada', async () => {
    mockGetCatalog.mockResolvedValue(EMPTY)
    render(<ItemPackagingCatalogCard />)
    expect(
      await screen.findByText(
        'Nenhuma tabela importada ainda. O formulário do Relatório de Carga vai usar a tabela importada aqui.'
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar planilha (.xlsx)' })).toBeEnabled()
  })

  it('versão atual: versão, totais, quem, quando e arquivo', async () => {
    render(<ItemPackagingCatalogCard />)
    expect(await screen.findByText('Versão 3 · 3 itens')).toBeInTheDocument()
    expect(screen.getByText('Com embalagem').nextSibling).toHaveTextContent('2 itens')
    expect(screen.getByText('Sem embalagem cadastrada').nextSibling).toHaveTextContent('1 item')
    expect(screen.getByText('Importada por').nextSibling).toHaveTextContent('Lucas Felsky')
    expect(screen.getByText('Em').nextSibling).toHaveTextContent(/23\/11\/2026.{1,3}19:40/)
    expect(screen.getByText('Arquivo').nextSibling).toHaveTextContent('FR.CMX.001.xlsx')
  })

  it('erro de carga: role="alert" e sem botão de importar', async () => {
    mockGetCatalog.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    render(<ItemPackagingCatalogCard />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível carregar a tabela Item x Emb.')
    expect(screen.queryByRole('button', { name: 'Importar planilha (.xlsx)' })).toBeNull()
  })

  it('arquivo inválido (fatal) mostra o alerta e não abre prévia', async () => {
    mockReadWorkbook.mockResolvedValue(parsed([], { fatal: 'Arquivo inválido: use um .xlsx com a aba "Item x Emb."' }))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo inválido')
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
  })

  it('exceção do leitor (ex.: maior que 5 MB) mostra a mensagem', async () => {
    mockReadWorkbook.mockRejectedValue(new Error('Arquivo maior que 5 MB. Exporte só a aba "Item x Emb." e tente de novo.'))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo maior que 5 MB')
  })

  it('lendo a planilha: status e botão ocupado', async () => {
    let resolveRead
    mockReadWorkbook.mockReturnValue(new Promise((resolve) => { resolveRead = resolve }))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    expect(await screen.findByText('Lendo a planilha…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar planilha (.xlsx)' })).toBeDisabled()
    resolveRead(parsed(NEXT_NO_REMOVED))
    expect(await screen.findByRole('heading', { name: 'Prévia da importação' })).toBeInTheDocument()
    expect(screen.queryByText('Lendo a planilha…')).toBeNull()
  })

  it('prévia: contadores, tabela de mudanças e foco no título', async () => {
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)

    const title = await screen.findByRole('heading', { name: 'Prévia da importação' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByText('1 novo')).toBeInTheDocument()
    expect(screen.getByText('1 alterado')).toBeInTheDocument()
    expect(screen.getByText('0 removidos')).toBeInTheDocument()
    expect(screen.getByText('2 sem mudança')).toBeInTheDocument()

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('novo')).toBeInTheDocument()
    expect(within(rows[1]).getByText('AA0009')).toBeInTheDocument()
    expect(within(rows[2]).getByText('alterado')).toBeInTheDocument()
    expect(within(rows[2]).getByText('5 → 25')).toBeInTheDocument()
    expect(screen.getByText(/Mostrando 2 de 2 mudanças/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeEnabled()
  })

  it('erros desabilitam Confirmar e listam as linhas', async () => {
    mockReadWorkbook.mockResolvedValue(
      parsed(NEXT_NO_REMOVED, {
        errors: [
          { row: 412, code: '', message: 'código vazio' },
          { row: 1021, code: 'AA0004', message: 'peso inválido: "abc" (use número, ex. 12,5)' },
        ],
      })
    )
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)

    await screen.findByRole('heading', { name: 'Prévia da importação' })
    expect(screen.getByText('2 erros')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Corrija a planilha e escolha o arquivo de novo. Nada foi gravado.')
    expect(screen.getByText('Linha 412').closest('li')).toHaveTextContent('Linha 412 · código vazio')
    expect(screen.getByText('Linha 1.021').closest('li')).toHaveTextContent('peso inválido: "abc"')
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Escolher outro arquivo' })).toBeEnabled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('avisos aparecem sem bloquear a confirmação', async () => {
    mockReadWorkbook.mockResolvedValue(
      parsed(NEXT_NO_REMOVED, { warnings: [{ row: 7, code: 'AA0009', message: 'peso preenchido sem tipo de embalagem' }] })
    )
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)

    await screen.findByRole('heading', { name: 'Prévia da importação' })
    expect(screen.getByText('Avisos (não bloqueiam a gravação)')).toBeInTheDocument()
    expect(screen.getByText('Linha 7').closest('li')).toHaveTextContent('Linha 7 · AA0009 · peso preenchido sem tipo')
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeEnabled()
  })

  it('sem alterações: mensagem e Confirmar desabilitado', async () => {
    mockReadWorkbook.mockResolvedValue(parsed(CURRENT_ITEMS))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)

    expect(await screen.findByText('Nenhuma alteração em relação à versão atual.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeDisabled()
  })

  it('removidos mudam o rótulo do botão', async () => {
    mockReadWorkbook.mockResolvedValue(parsed(NEXT_WITH_REMOVED))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)

    expect(await screen.findByRole('button', { name: 'Confirmar e remover 1 item' })).toBeEnabled()
    expect(screen.getByText('1 removido')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('removido')).toBeInTheDocument()
  })

  it('Cancelar fecha a prévia sem gravar e devolve o foco ao botão de importar', async () => {
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await screen.findByRole('heading', { name: 'Prévia da importação' })

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Importar planilha (.xlsx)' })).toHaveFocus()
    expect(mockSaveCatalog).not.toHaveBeenCalled()
  })

  it('confirmar grava com expectedVersion e profile, recarrega e mostra sucesso', async () => {
    mockGetCatalog
      .mockResolvedValueOnce(LOADED)
      .mockResolvedValueOnce({ ...LOADED, version: 4, itemCount: 4 })
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))

    await waitFor(() => expect(mockSaveCatalog).toHaveBeenCalledTimes(1))
    const [payload, actor] = mockSaveCatalog.mock.calls[0]
    expect(payload).toMatchObject({
      items: NEXT_NO_REMOVED,
      sourceFileName: 'nova.xlsx',
      sourceSheetName: 'Item x Emb.',
      sourceSha256: 'b'.repeat(64),
      expectedVersion: 3,
      summary: { added: 1, changed: 1, removed: 0 },
    })
    expect(actor).toBe(PROFILE)

    expect(await screen.findByText('Versão 4 · 4 itens')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tabela importada: versão 4, 3 itens (1 novo, 1 alterado, 0 removidos).'
    )
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
  })

  it('gravando: botões desabilitados e aviso para não fechar a página', async () => {
    let resolveSave
    mockSaveCatalog.mockReturnValue(new Promise((resolve) => { resolveSave = resolve }))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))

    expect(await screen.findByRole('button', { name: 'Gravando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByText('Gravando… não feche esta página.')).toBeInTheDocument()
    resolveSave({ version: 4, itemCount: 3 })
    await waitFor(() => expect(screen.queryByText('Gravando… não feche esta página.')).toBeNull())
  })

  it('conflito de versão: fecha a prévia, recarrega a versão atual e orienta importar de novo', async () => {
    mockSaveCatalog.mockRejectedValue(Object.assign(new Error('version-conflict'), { code: 'catalog/version-conflict' }))
    mockGetCatalog
      .mockResolvedValueOnce(LOADED)
      .mockResolvedValueOnce({ ...LOADED, version: 4 })
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Outra importação foi concluída enquanto você revisava (versão atual 4). Escolha o arquivo de novo e confirme.'
    )
    expect(await screen.findByText('Versão 4 · 3 itens')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
  })

  it('sem permissão: mensagem própria e a prévia continua aberta', async () => {
    mockSaveCatalog.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sem permissão para gravar a tabela. Entre com um usuário admin.'
    )
    expect(screen.getByRole('heading', { name: 'Prévia da importação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar e gravar' })).toBeEnabled()
  })

  it('erro genérico ao gravar: mensagem de ação e a prévia continua aberta', async () => {
    mockSaveCatalog.mockRejectedValue(Object.assign(new Error('x'), { code: 'unavailable' }))
    const user = userEvent.setup()
    render(<ItemPackagingCatalogCard />)
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gravar a tabela.')
    expect(screen.getByRole('heading', { name: 'Prévia da importação' })).toBeInTheDocument()
  })
})

// Celular (<= 720px): a prévia abre no Modal do app (portal em document.body), não inline, para não
// ficar presa ao .page-fade (transform = bloco de contenção do position: fixed).
describe('ItemPackagingCatalogCard (celular, folha inferior)', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    window.matchMedia = (query) => ({
      matches: query === '(max-width: 720px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
    document.body.style.overflow = ''
  })

  async function openSheet(user) {
    const view = render(
      <main className="main-content">
        <div className="page-fade page-fade--visible" data-testid="page-fade">
          <ItemPackagingCatalogCard />
        </div>
      </main>
    )
    await screen.findByText('Versão 3 · 3 itens')
    await chooseFile(user)
    const dialog = await screen.findByRole('dialog', { name: 'Prévia da importação' })
    return { view, dialog }
  }

  it('abre como dialog modal em portal fora do .page-fade, com trava de scroll do body', async () => {
    const user = userEvent.setup()
    const { dialog } = await openSheet(user)

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('page-fade')).not.toContainElement(dialog)
    expect(document.body).toContainElement(dialog)
    expect(document.body.style.overflow).toBe('hidden')
    expect(within(dialog).getByText('Versão 3 → 4 · 4 linhas lidas')).toBeInTheDocument()
    expect(within(dialog).getByText('1 novo')).toBeInTheDocument()
    // pílula "sem mudança" não aparece na folha (mock f5)
    expect(within(dialog).queryByText(/sem mudança/)).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Confirmar e gravar' })).toBeEnabled()
  })

  it('Esc fecha a folha sem gravar e libera o scroll do body', async () => {
    const user = userEvent.setup()
    await openSheet(user)

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockSaveCatalog).not.toHaveBeenCalled()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('Cancelar fecha a folha e devolve o foco ao botão de importar', async () => {
    const user = userEvent.setup()
    const { dialog } = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Importar planilha (.xlsx)' })).toHaveFocus()
  })

  it('confirmar grava pela folha e fecha com sucesso', async () => {
    const user = userEvent.setup()
    mockGetCatalog.mockResolvedValueOnce(LOADED).mockResolvedValueOnce({ ...LOADED, version: 4 })
    const { dialog } = await openSheet(user)

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar e gravar' }))

    await waitFor(() => expect(mockSaveCatalog).toHaveBeenCalledTimes(1))
    expect(mockSaveCatalog.mock.calls[0][0].expectedVersion).toBe(3)
    expect(await screen.findByText(/Tabela importada: versão 4/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
