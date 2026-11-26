// S11-D2 (D-4, L-4, L-12, L-16): bloco "COA sem PO" do CONSOLIDADO. Lista os COAs sem PO ("Sem PO") e de PO removida,
// "Vincular à PO" só para admin (todas as POs aparecem; PO cheia = "Limite de 50 COAs por PO." e não vincula).
// Fica em tests/unit (fora do audit).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockSetCoaPurchaseOrder = vi.fn()

vi.mock('../../src/services/processDocumentsRepository', () => ({
  setCoaPurchaseOrder: (...args) => mockSetCoaPurchaseOrder(...args),
}))

import CoaWithoutPurchaseOrderBlock from '../../src/features/processes/CoaWithoutPurchaseOrderBlock'

const ADMIN = { uid: 'admin-1', name: 'Admin', role: 'admin' }
const LOGISTICA = { uid: 'log-1', name: 'Ana', role: 'logistica' }
const ORDERS = [
  { po: 'PO-1', reference: 'Proc A' },
  { po: 'PO-2', reference: 'Proc B' },
  { po: 'PO-3', reference: '' },
]

const coa = (id, po, overrides = {}) => ({
  id,
  type: 'coaOriginal',
  slotKey: `coaOriginal:${id}`,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  size: 2048,
  uploadedAt: '2026-09-01T10:00:00.000Z',
  uploadedByName: 'Admin',
  poNumber: po,
  ...overrides,
})
const many = (count, po) =>
  Array.from({ length: count }, (_, index) => coa(`${po}-m${index}`, po, { uploadedAt: `2026-09-02T10:${String(index).padStart(2, '0')}:00.000Z` }))

const LEGADO = coa('legado', '', { slotKey: 'coaOriginal' })
const REMOVIDA = coa('removida', 'PO-9', { uploadedAt: '2026-09-02T10:00:00.000Z' })

function renderBlock(props = {}) {
  const handlers = {
    onChanged: vi.fn(),
    onNotice: vi.fn(),
    onDownload: vi.fn(),
    onPreview: vi.fn(),
    onRequestDelete: vi.fn(),
    onRequestRename: vi.fn(),
  }
  const utils = render(
    <CoaWithoutPurchaseOrderBlock
      documents={[LEGADO, REMOVIDA]}
      purchaseOrders={ORDERS}
      processId="p2"
      profile={ADMIN}
      canSeePoReference
      isDesktopVariant
      {...handlers}
      {...props}
    />
  )
  return { ...utils, handlers }
}

async function openLink(user, name = /^Vincular à PO: legado\.pdf/) {
  await user.click(screen.getByRole('button', { name }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CoaWithoutPurchaseOrderBlock - lista', () => {
  it('não renderiza nada sem COA antigo (COA de PO atual não entra)', () => {
    const { container } = renderBlock({ documents: [coa('a1', 'PO-1'), coa('b1', 'PO-2')] })
    expect(container).toBeEmptyDOMElement()
  })

  it('lista o sem PO e o de PO removida, com o motivo, o contador e o texto do admin', () => {
    renderBlock({ documents: [LEGADO, REMOVIDA, coa('a1', 'PO-1')] })
    expect(screen.getByRole('heading', { name: 'COA sem PO' })).toBeInTheDocument()
    expect(screen.getByText('COAs enviados antes da coluna por PO. Vincule cada arquivo à PO certa.')).toBeInTheDocument()
    expect(screen.getByText('2 arquivos')).toBeInTheDocument()
    expect(screen.getByText(/^Sem PO · PDF/)).toBeInTheDocument()
    expect(screen.getByText(/^PO removida · PDF/)).toBeInTheDocument()
    expect(screen.queryByText('a1.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'COA sem PO' })).toBeInTheDocument()
  })

  it('mostra todos os arquivos (sem "+N arquivos") e 1 arquivo no singular', () => {
    renderBlock({ documents: [LEGADO, REMOVIDA, coa('r2', 'PO-8'), coa('r3', 'PO-7')] })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /^\+\d/ })).not.toBeInTheDocument()
    expect(screen.getByText('4 arquivos')).toBeInTheDocument()
  })

  it('erros do painel só dos COAs deste bloco', () => {
    renderBlock({
      rowErrors: {
        coaOriginal: { title: 'Não foi possível baixar o documento.', detail: 'Sem conexão.' },
        'coaOriginal:outro': { title: 'Erro de outra PO', detail: 'x' },
      },
    })
    expect(screen.getByText('Não foi possível baixar o documento.')).toBeInTheDocument()
    expect(screen.queryByText('Erro de outra PO')).not.toBeInTheDocument()
  })

  it('Baixar, Visualizar, Renomear e Excluir usam os handlers do painel (admin)', async () => {
    const user = userEvent.setup()
    const { handlers } = renderBlock()
    await user.click(screen.getByRole('button', { name: 'Baixar legado.pdf' }))
    expect(handlers.onDownload).toHaveBeenCalledWith(LEGADO)
    await user.click(screen.getByRole('button', { name: 'Ações de legado.pdf' }))
    expect(within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Visualizar',
      'Renomear',
      'Excluir',
    ])
    await user.click(screen.getByRole('menuitem', { name: 'Excluir legado.pdf' }))
    expect(handlers.onRequestDelete).toHaveBeenCalledWith(LEGADO)
  })
})

describe('CoaWithoutPurchaseOrderBlock - Vincular à PO (admin)', () => {
  it('abre o painel com TODAS as POs (Referência só quando a há) e só confirma com uma PO escolhida', async () => {
    const user = userEvent.setup()
    renderBlock()
    const button = screen.getByRole('button', { name: /^Vincular à PO: legado\.pdf/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')

    const select = screen.getByLabelText('PO deste arquivo')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Escolha a PO',
      'PO-1 · Proc A',
      'PO-2 · Proc B',
      'PO-3',
    ])
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(mockSetCoaPurchaseOrder).not.toHaveBeenCalled()
  })

  it('vincular grava (processo, documento, PO, ator), avisa e recarrega; o painel fecha', async () => {
    const user = userEvent.setup()
    mockSetCoaPurchaseOrder.mockResolvedValue(undefined)
    const { handlers } = renderBlock()
    await openLink(user)
    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-2')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(mockSetCoaPurchaseOrder).toHaveBeenCalledWith('p2', 'legado', 'PO-2', { uid: 'admin-1' }))
    expect(mockSetCoaPurchaseOrder).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(handlers.onChanged).toHaveBeenCalledTimes(1))
    expect(handlers.onNotice).toHaveBeenCalledWith('COA vinculado à PO-2.')
    expect(screen.queryByLabelText('PO deste arquivo')).not.toBeInTheDocument()
  })

  it('também vincula o COA de PO removida (L-12) à PO escolhida', async () => {
    const user = userEvent.setup()
    mockSetCoaPurchaseOrder.mockResolvedValue(undefined)
    renderBlock()
    await openLink(user, /^Vincular à PO: removida\.pdf/)
    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-1')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(mockSetCoaPurchaseOrder).toHaveBeenCalledWith('p2', 'removida', 'PO-1', { uid: 'admin-1' }))
  })

  it('PO que já tem 50 COAs: "Limite de 50 COAs por PO." e NÃO vincula; outra PO continua vinculando', async () => {
    const user = userEvent.setup()
    mockSetCoaPurchaseOrder.mockResolvedValue(undefined)
    const { handlers } = renderBlock({ documents: [LEGADO, REMOVIDA, ...many(50, 'PO-1')] })
    await openLink(user)
    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-1')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Limite de 50 COAs por PO.')
    expect(mockSetCoaPurchaseOrder).not.toHaveBeenCalled()
    expect(handlers.onChanged).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-2')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(mockSetCoaPurchaseOrder).toHaveBeenCalledWith('p2', 'legado', 'PO-2', { uid: 'admin-1' }))
  })

  it('49 COAs na PO ainda cabem um: vincula', async () => {
    const user = userEvent.setup()
    mockSetCoaPurchaseOrder.mockResolvedValue(undefined)
    renderBlock({ documents: [LEGADO, ...many(49, 'PO-1')] })
    await openLink(user)
    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-1')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(mockSetCoaPurchaseOrder).toHaveBeenCalledTimes(1))
  })

  it('erro ao vincular: mensagem com o código no padrão buildActionErrorMessage; a lista segue e o painel fica aberto', async () => {
    const user = userEvent.setup()
    mockSetCoaPurchaseOrder.mockRejectedValue({ code: 'permission-denied' })
    const { handlers } = renderBlock()
    await openLink(user)
    await user.selectOptions(screen.getByLabelText('PO deste arquivo'), 'PO-2')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível vincular o COA (permission-denied)')
    expect(handlers.onChanged).not.toHaveBeenCalled()
    expect(screen.getByText('legado.pdf')).toBeInTheDocument()
    expect(screen.getByLabelText('PO deste arquivo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled()
  })

  it('o painel de um arquivo não abre o de outro (um por vez)', async () => {
    const user = userEvent.setup()
    renderBlock()
    await openLink(user)
    await openLink(user, /^Vincular à PO: removida\.pdf/)
    expect(screen.getAllByLabelText('PO deste arquivo')).toHaveLength(1)
  })

  it('sem POs no processo não há "Vincular à PO"', () => {
    renderBlock({ purchaseOrders: [] })
    expect(screen.queryByRole('button', { name: /Vincular/ })).not.toBeInTheDocument()
    expect(screen.getByText('legado.pdf')).toBeInTheDocument()
  })

  it('a Referência da PO não aparece para quem não a vê', async () => {
    const user = userEvent.setup()
    renderBlock({ canSeePoReference: false })
    await openLink(user)
    expect(within(screen.getByLabelText('PO deste arquivo')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Escolha a PO',
      'PO-1',
      'PO-2',
      'PO-3',
    ])
  })
})

describe('CoaWithoutPurchaseOrderBlock - logística (só vê e baixa)', () => {
  it('sem Vincular à PO, sem Renomear e sem Excluir; texto sem o convite de vincular', async () => {
    const user = userEvent.setup()
    renderBlock({ profile: LOGISTICA })
    expect(screen.getByText('COAs enviados antes da coluna por PO.')).toBeInTheDocument()
    expect(screen.queryByText(/Vincule/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vincular/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar legado.pdf' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ações de legado.pdf' }))
    expect(within(await screen.findByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Visualizar'])
  })
})

describe('CoaWithoutPurchaseOrderBlock - celular', () => {
  it('ganha a marca da variante e a folha inferior nas Ações', async () => {
    const user = userEvent.setup()
    const { container } = renderBlock({ isDesktopVariant: false })
    expect(container.firstChild).toHaveClass('coa-orphans--mobile')
    await user.click(screen.getByRole('button', { name: 'Ações de legado.pdf' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
