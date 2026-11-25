// S9-D do Relatório de Carga: card "Embalagens por item e fornecedor" (cadastro por fornecedor + importação com
// prévia + "Fornecedor para um item" + "Juntar nomes"). Repositórios e leitor de .xlsx mockados; as funções puras
// (diff, filtros, aliases) são as reais.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockUseAuth = vi.fn()
const mockGetItems = vi.fn()
const mockGetSuppliers = vi.fn()
const mockSaveSuppliers = vi.fn()
const mockUpsert = vi.fn()
const mockReadWorkbook = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({
  default: () => mockUseAuth(),
}))
vi.mock('../../src/services/itemPackagingCatalogRepository', () => ({
  getItemPackagingCatalog: (...args) => mockGetItems(...args),
}))
vi.mock('../../src/services/supplierPackagingCatalogRepository', () => ({
  SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE: 'catalog/version-conflict',
  SUPPLIER_PACKAGING_LIMIT_CODE: 'catalog/limit',
  getSupplierPackagingCatalog: (...args) => mockGetSuppliers(...args),
  saveSupplierPackagingCatalog: (...args) => mockSaveSuppliers(...args),
  upsertSupplierPackagingEntry: (...args) => mockUpsert(...args),
}))
vi.mock('../../src/features/processes/cargoSupplierPackaging', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readSupplierPackagingWorkbook: (...args) => mockReadWorkbook(...args) }
})

import SupplierPackagingCatalogCard from '../../src/features/admin/SupplierPackagingCatalogCard'

const PROFILE = { uid: 'admin-1', name: 'Admin', email: 'admin@sqquimica.com', role: 'admin' }

const ITEMS = {
  exists: true,
  version: 3,
  itemCount: 4,
  items: [
    { code: 'BA5012', description: 'POLIOL PE-3000', packagingType: 'TAMBOR', netWeightKg: 200 },
    { code: 'BA5033', description: 'CATALISADOR ZN-12', packagingType: 'BOMBONA', netWeightKg: 25 },
    { code: 'BA5301', description: 'SOLVENTE XIL-9', packagingType: '', netWeightKg: null },
    { code: 'BA5190', description: 'RESINA ACRÍLICA RA-55', packagingType: '', netWeightKg: null },
  ],
}

const entry = (code, supplierName, tare, overrides = {}) => ({
  code,
  supplierKey: supplierName.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
  supplierName,
  packagingType: supplierName ? 'TAMBOR' : '',
  netWeightKg: supplierName ? 200 : null,
  packageWeightKg: tare,
  ...overrides,
})

const SUPPLIERS = {
  exists: true,
  version: 2,
  entries: [
    entry('BA5012', 'GOOYER CHEMICALS LTD', 9.2),
    entry('BA5012', 'ORION CHEM CO', 11.5),
    entry('BA5033', '', 1.1),
    entry('BA5190', 'GOOYER CHEMICAL CO', 9.5),
  ],
  entryCount: 4,
  aliases: [],
  updatedAt: new Date(2026, 10, 25, 9, 30),
  updatedById: 'u1',
  updatedByName: 'Lucas Felsky',
}

const EMPTY = { exists: false, version: 0, entries: [], entryCount: 0, aliases: [], updatedAt: null, updatedById: '', updatedByName: '' }

function parsed(entries, overrides = {}) {
  return {
    entries,
    errors: [],
    warnings: [],
    stats: { rows: entries.length, suppliers: entries.length, defaults: 0 },
    fatal: '',
    sourceFileName: 'embalagens.xlsx',
    sourceSheetName: 'Embalagens por fornecedor',
    estimatedBytes: 1000,
    ...overrides,
  }
}

// igual (BA5012 GOOYER), alterada (BA5012 ORION 12), nova (BA5033 ORION) e as demais removidas
const NEXT_WITH_REMOVED = [
  SUPPLIERS.entries[0],
  { ...SUPPLIERS.entries[1], packageWeightKg: 12 },
  entry('BA5033', 'ORION CHEM CO', 1.4),
]
// só novas + alteradas (nada removido)
const NEXT_NO_REMOVED = [...SUPPLIERS.entries.slice(0, 2).map((item, index) => (index === 1 ? { ...item, packageWeightKg: 12 } : item)), ...SUPPLIERS.entries.slice(2), entry('BA5301', 'ORION CHEM CO', 2)]

async function chooseFile(user, name = 'embalagens.xlsx') {
  await user.upload(screen.getByLabelText('Planilha .xlsx com as embalagens por fornecedor'), new File(['x'], name))
}

async function renderCard() {
  const user = userEvent.setup()
  render(<SupplierPackagingCatalogCard />)
  await screen.findByText('Versão 2 · 4 embalagens')
  return user
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ profile: PROFILE })
  mockGetItems.mockResolvedValue(ITEMS)
  mockGetSuppliers.mockResolvedValue(SUPPLIERS)
  mockSaveSuppliers.mockImplementation(async ({ entries, aliases }, { expectedVersion }) => ({
    ...SUPPLIERS,
    version: expectedVersion + 1,
    entries,
    entryCount: entries.length,
    aliases,
  }))
  mockUpsert.mockImplementation(async (item) => ({ ...SUPPLIERS, version: 3, entries: [...SUPPLIERS.entries, item], entryCount: 5 }))
  mockReadWorkbook.mockResolvedValue(parsed(NEXT_NO_REMOVED))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SupplierPackagingCatalogCard', () => {
  it('carregando: skeleton com texto acessível e o título do card', () => {
    mockGetSuppliers.mockReturnValue(new Promise(() => {}))
    render(<SupplierPackagingCatalogCard />)
    expect(screen.getByRole('status', { name: 'Carregando embalagens por fornecedor' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Embalagens por item e fornecedor' })).toBeInTheDocument()
  })

  it('mostra a versão, os botões, a faixa 1º/2º/3º e a tabela do mock (padrão + uma linha por fornecedor)', async () => {
    await renderCard()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Fornecedor para um item' })).toBeEnabled()
    expect(screen.getByText('Item + fornecedor')).toBeInTheDocument()
    expect(screen.getByText('Padrão do item')).toBeInTheDocument()
    expect(screen.getByText('Sem cadastro')).toBeInTheDocument()
    expect(screen.getByText(/Admin › Relatório de Carga\. Hoje a tabela Item x Emb\. tem um peso por item/)).toBeInTheDocument()

    const table = screen.getByRole('table', { name: '' })
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Item', 'Descrição', 'Fornecedor', 'Tipo emb.', 'Peso líq. (kg)', 'Peso da emb. (kg)', 'Origem'])
    const rows = within(table).getAllByRole('row').slice(1)
    // BA5012: padrão + GOOYER + ORION; BA5033: padrão (com tara 1,1); BA5190: padrão sem embalagem + GOOYER CHEMICAL CO; BA5301: padrão sem embalagem
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual([
      'Padrão (qualquer fornecedor)',
      'GOOYER CHEMICALS LTD',
      'ORION CHEM CO',
      'Padrão (qualquer fornecedor)',
      'Padrão (qualquer fornecedor)',
      'GOOYER CHEMICAL CO',
      'Padrão (qualquer fornecedor)',
    ])
    expect(within(rows[0]).getByText('cadastrado')).toBeInTheDocument()
    expect(within(rows[1]).getByText('deste fornecedor')).toBeInTheDocument()
    expect(within(rows[1]).getAllByRole('cell')[5]).toHaveTextContent('9,2')
    expect(within(rows[3]).getAllByRole('cell')[5]).toHaveTextContent('1,1') // tara do padrão
    expect(within(rows[4]).getByText('sem embalagem')).toBeInTheDocument()
  })

  it('filtros Todos (N) / Com fornecedor / Sem embalagem (aria-pressed) e a busca', async () => {
    const user = await renderCard()
    const all = screen.getByRole('button', { name: 'Todos (4)' })
    const withSupplier = screen.getByRole('button', { name: 'Com fornecedor' })
    const none = screen.getByRole('button', { name: 'Sem embalagem' })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(withSupplier).toHaveAttribute('aria-pressed', 'false')

    await user.click(withSupplier)
    expect(withSupplier).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('SOLVENTE XIL-9')).not.toBeInTheDocument()
    expect(screen.getByText('POLIOL PE-3000')).toBeInTheDocument()

    await user.click(none)
    expect(screen.getByText('SOLVENTE XIL-9')).toBeInTheDocument()
    expect(screen.queryByText('POLIOL PE-3000')).not.toBeInTheDocument()

    await user.click(all)
    await user.type(screen.getByLabelText('Buscar item ou fornecedor'), 'orion')
    expect(screen.getByText('POLIOL PE-3000')).toBeInTheDocument()
    expect(screen.queryByText('CATALISADOR ZN-12')).not.toBeInTheDocument()
  })

  it('lista só os 50 primeiros itens e avisa quantos faltam', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      code: `AA${String(index).padStart(4, '0')}`,
      description: `ITEM ${index}`,
      packagingType: 'BALDE',
      netWeightKg: 5,
    }))
    mockGetItems.mockResolvedValue({ ...ITEMS, items: many })
    mockGetSuppliers.mockResolvedValue(EMPTY)
    render(<SupplierPackagingCatalogCard />)
    expect(await screen.findByText('Mostrando 50 de 60 itens. Use a busca ou os filtros para achar os demais.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todos (60)' })).toBeInTheDocument()
  })

  it('cadastro vazio: orienta a importar; sem a tabela Item x Emb. a tela ainda abre', async () => {
    mockGetSuppliers.mockResolvedValue(EMPTY)
    mockGetItems.mockRejectedValue(new Error('x'))
    render(<SupplierPackagingCatalogCard />)
    expect(
      await screen.findByText('Nada cadastrado ainda. Importe a tabela Item x Emb. ou a planilha de embalagens por fornecedor.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toBeEnabled()
  })

  it('erro de carga (ex.: rules ainda não publicadas): role="alert" e sem botões de importar', async () => {
    mockGetSuppliers.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    render(<SupplierPackagingCatalogCard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o cadastro por fornecedor.')
    expect(screen.queryByRole('button', { name: 'Importar planilha' })).toBeNull()
  })
})

describe('importar planilha (prévia sem gravar antes de confirmar)', () => {
  it('arquivo inválido (fatal) mostra o alerta e não abre prévia', async () => {
    mockReadWorkbook.mockResolvedValue(parsed([], { fatal: 'Arquivo inválido: use um .xlsx com as colunas ITEM, FORNECEDOR' }))
    const user = await renderCard()
    await chooseFile(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Arquivo inválido')
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
  })

  it('prévia com novas, alteradas e sem remoção: nada é gravado até "Confirmar e gravar"', async () => {
    const user = await renderCard()
    await chooseFile(user)

    const preview = (await screen.findByRole('heading', { name: 'Prévia da importação' })).closest('article')
    expect(within(preview).getByText('1 nova')).toBeInTheDocument()
    expect(within(preview).getByText('1 alterada')).toBeInTheDocument()
    expect(within(preview).getByText('0 removidas')).toBeInTheDocument()
    expect(within(preview).getByText('Versão 2 → 3')).toBeInTheDocument()
    const changed = within(preview).getByText('alterado').closest('tr')
    expect(changed).toHaveTextContent('11,5 → 12')
    expect(mockSaveSuppliers).not.toHaveBeenCalled()

    await user.click(within(preview).getByRole('button', { name: 'Confirmar e gravar' }))
    await waitFor(() => expect(mockSaveSuppliers).toHaveBeenCalledTimes(1))
    const [next, options] = mockSaveSuppliers.mock.calls[0]
    expect(next.entries).toEqual(NEXT_NO_REMOVED)
    expect(next.aliases).toEqual([])
    expect(options).toMatchObject({ expectedVersion: 2, actor: PROFILE, summary: { added: 1, changed: 1, removed: 0 } })
    expect(await screen.findByText(/Cadastro importado: versão 3, 5 embalagens \(1 nova, 1 alterada, 0 removidas\)/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toHaveFocus()
  })

  it('com removidas o botão vira "Confirmar e remover N embalagens"', async () => {
    mockReadWorkbook.mockResolvedValue(parsed(NEXT_WITH_REMOVED))
    const user = await renderCard()
    await chooseFile(user)
    expect(await screen.findByRole('button', { name: 'Confirmar e remover 2 embalagens' })).toBeEnabled()
    expect(screen.getByText('2 removidas')).toBeInTheDocument()
  })

  it('erros da planilha bloqueiam: lista as linhas e oferece escolher outro arquivo; avisos não bloqueiam', async () => {
    mockReadWorkbook.mockResolvedValue(
      parsed([], {
        errors: [{ row: 3, code: 'BA 1', message: 'código inválido: "BA 1"' }],
        warnings: [{ row: 4, code: 'BA2', message: 'sem peso da embalagem' }],
      })
    )
    const user = await renderCard()
    await chooseFile(user)
    const preview = (await screen.findByRole('heading', { name: 'Prévia da importação' })).closest('article')
    expect(within(preview).getByText('Corrija a planilha e escolha o arquivo de novo. Nada foi gravado.')).toBeInTheDocument()
    expect(within(preview).getByText(/Linha 3/)).toBeInTheDocument()
    expect(within(preview).getByText(/Linha 4/)).toBeInTheDocument()
    expect(within(preview).getByRole('button', { name: /^Confirmar e/ })).toBeDisabled()
    expect(within(preview).getByRole('button', { name: 'Escolher outro arquivo' })).toBeEnabled()
  })

  it('Cancelar fecha a prévia sem gravar e devolve o foco ao botão de importar', async () => {
    const user = await renderCard()
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
    expect(mockSaveSuppliers).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toHaveFocus()
  })

  it('conflito de versão: fecha a prévia, relê o cadastro e pede para escolher o arquivo de novo', async () => {
    mockSaveSuppliers.mockRejectedValue(Object.assign(new Error('x'), { code: 'catalog/version-conflict' }))
    const user = await renderCard()
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Outra gravação foi concluída enquanto você revisava (versão atual 2).')
    expect(screen.queryByRole('heading', { name: 'Prévia da importação' })).toBeNull()
    expect(mockGetSuppliers).toHaveBeenCalledTimes(2)
  })

  it('erro de gravação (permissão) mostra a mensagem e mantém a prévia', async () => {
    mockSaveSuppliers.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }))
    const user = await renderCard()
    await chooseFile(user)
    await user.click(await screen.findByRole('button', { name: 'Confirmar e gravar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para gravar o cadastro')
    expect(screen.getByRole('heading', { name: 'Prévia da importação' })).toBeInTheDocument()
  })
})

describe('Fornecedor para um item', () => {
  it('abre o diálogo, valida, grava UMA entrada e mostra o item na tabela', async () => {
    const user = await renderCard()
    await user.click(screen.getByRole('button', { name: 'Fornecedor para um item' }))
    const dialog = screen.getByRole('dialog', { name: 'Fornecedor para um item' })
    const code = within(dialog).getByLabelText('Item (código)')
    await waitFor(() => expect(code).toHaveFocus())

    await user.click(within(dialog).getByRole('button', { name: 'Salvar no cadastro' }))
    expect(within(dialog).getByText('Informe o código do item.')).toBeInTheDocument()
    expect(within(dialog).getByText('Informe o fornecedor.')).toBeInTheDocument()
    expect(mockUpsert).not.toHaveBeenCalled()

    await user.type(code, 'ba5033')
    await user.type(within(dialog).getByLabelText('Fornecedor'), 'Orion Chem, Co.')
    await user.type(within(dialog).getByLabelText('Peso líquido (kg)'), '30')
    await user.type(within(dialog).getByLabelText('Peso da emb. (kg)'), '1,4')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar no cadastro' }))

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1))
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      code: 'BA5033',
      supplierKey: 'ORION CHEM CO',
      supplierName: 'Orion Chem, Co.',
      netWeightKg: 30,
      packageWeightKg: 1.4,
    })
    expect(mockUpsert.mock.calls[0][1]).toBe(PROFILE)
    expect(await screen.findByText('Embalagem de BA5033 cadastrada para Orion Chem, Co..')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Fornecedor para um item' })).toBeNull()
    expect(screen.getByText('Versão 3 · 5 embalagens')).toBeInTheDocument()
  })

  it('Cancelar fecha sem gravar', async () => {
    const user = await renderCard()
    await user.click(screen.getByRole('button', { name: 'Fornecedor para um item' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('Juntar nomes', () => {
  it('lista os nomes pelo nome que vale, sugere os parecidos e só junta quando o admin escolhe', async () => {
    const user = await renderCard()
    const section = screen.getByRole('region', { name: 'Juntar nomes' })
    expect(within(section).getByText('GOOYER CHEMICALS LTD').closest('li')).toHaveTextContent('1 embalagem')
    const suggestion = within(section).getByRole('list', { name: 'Nomes parecidos (sugestão)' })
    expect(suggestion).toHaveTextContent('GOOYER CHEMICAL CO · GOOYER CHEMICALS LTD')
    const join = within(section).getByRole('button', { name: 'Juntar' })
    expect(join).toBeDisabled()
    expect(mockSaveSuppliers).not.toHaveBeenCalled()

    // a sugestão só marca os nomes; quem junta é o admin
    await user.click(within(suggestion).getByRole('button', { name: 'Selecionar' }))
    expect(within(section).getByRole('checkbox', { name: 'Juntar GOOYER CHEMICAL CO' })).toBeChecked()
    expect(within(section).getByRole('checkbox', { name: 'Juntar GOOYER CHEMICALS LTD' })).toBeChecked()
    expect(mockSaveSuppliers).not.toHaveBeenCalled()
    expect(join).toBeEnabled()

    await user.selectOptions(within(section).getByLabelText('Nome que fica'), 'GOOYER CHEMICALS LTD')
    await user.click(join)

    await waitFor(() => expect(mockSaveSuppliers).toHaveBeenCalledTimes(1))
    const [next, options] = mockSaveSuppliers.mock.calls[0]
    expect(next.aliases).toEqual([{ fromKey: 'GOOYER CHEMICAL CO', toKey: 'GOOYER CHEMICALS LTD' }])
    expect(next.entries).toEqual(SUPPLIERS.entries)
    expect(options).toMatchObject({ expectedVersion: 2, actor: PROFILE })
    expect(await screen.findByText(/Nomes juntados: 1 nome passa a valer como GOOYER CHEMICALS LTD/)).toBeInTheDocument()
    // depois de juntar, os dois nomes viram um só na lista
    expect(within(screen.getByRole('region', { name: 'Juntar nomes' })).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('conflito de versão ao juntar: avisa, relê e não junta', async () => {
    mockSaveSuppliers.mockRejectedValue(Object.assign(new Error('x'), { code: 'catalog/version-conflict' }))
    const user = await renderCard()
    const section = screen.getByRole('region', { name: 'Juntar nomes' })
    await user.click(within(section).getByRole('checkbox', { name: 'Juntar GOOYER CHEMICAL CO' }))
    await user.click(within(section).getByRole('checkbox', { name: 'Juntar ORION CHEM CO' }))
    await user.click(within(section).getByRole('button', { name: 'Juntar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Outra gravação foi concluída enquanto você juntava.')
    expect(mockGetSuppliers).toHaveBeenCalledTimes(2)
  })
})

// Celular (<= 720px): a prévia abre no Modal do app (portal em document.body), fora do .page-fade.
describe('SupplierPackagingCatalogCard (celular)', () => {
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
    render(
      <main className="main-content">
        <div className="page-fade page-fade--visible" data-testid="page-fade">
          <SupplierPackagingCatalogCard />
        </div>
      </main>
    )
    await screen.findByText('Versão 2 · 4 embalagens')
    await chooseFile(user)
    return screen.findByRole('dialog', { name: 'Prévia da importação' })
  }

  it('o card usa a variante mobile (alvos de 44 px) e a prévia abre como folha em portal, sem "sem mudança"', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    expect(document.querySelector('.spc-card--mobile')).not.toBeNull()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByTestId('page-fade')).not.toContainElement(dialog)
    expect(document.body.style.overflow).toBe('hidden')
    expect(within(dialog).getByText('Versão 2 → 3 · 5 linhas lidas')).toBeInTheDocument()
    expect(within(dialog).queryByText(/sem mudança/)).toBeNull()
    expect(mockSaveSuppliers).not.toHaveBeenCalled()
  })

  it('Cancelar fecha a folha sem gravar e devolve o foco ao botão de importar; confirmar grava', async () => {
    const user = userEvent.setup()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockSaveSuppliers).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Importar planilha' })).toHaveFocus()

    await chooseFile(user)
    const again = await screen.findByRole('dialog', { name: 'Prévia da importação' })
    await user.click(within(again).getByRole('button', { name: 'Confirmar e gravar' }))
    await waitFor(() => expect(mockSaveSuppliers).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
