// Refino F4d: formulario de criar/editar processo como MODAL no desktop (>= 1041px,
// ProcessoForm.dc.html). O desktop e escolhido por matchMedia('(min-width: 1041px)');
// aqui o matchMedia diz "desktop" e os modulos de dominio sao os REAIS — so os
// repositorios sao mocks. A vista legada (tablet/mobile) continua coberta por
// tests/ui/ProcessForm.test.jsx e tests/ui/ProcessesPage.test.jsx (matchMedia falso =
// legado). Fica em tests/unit para nao entrar na contagem do audit-vault-counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../../src/components/Toast'
import { UnsavedChangesProvider } from '../../src/contexts/UnsavedChangesContext'

const mockUseAuth = vi.fn()
const mockListProcesses = vi.fn()

vi.mock('../../src/hooks/useAuth', () => ({ default: () => mockUseAuth() }))
vi.mock('../../src/services/processesRepository', () => ({
  archiveProcess: vi.fn(),
  channelOptions: ['Verde', 'Amarelo', 'Vermelho', 'Cinza'],
  collectionStatusOptions: [],
  deleteProcess: vi.fn(),
  dtaStatusOptions: [],
  listProcesses: (...args) => mockListProcesses(...args),
  processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
  saveProcess: vi.fn(),
  saveProcessCollectionStatus: vi.fn(),
  saveProcessPostReceiptNotes: vi.fn(),
  searchProcesses: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processMessagesRepository', () => ({
  listProcessMessages: vi.fn().mockResolvedValue([]),
  createProcessMessage: vi.fn(),
  deleteProcessMessage: vi.fn(),
}))
vi.mock('../../src/services/erpReferenceRepository', () => ({
  loadErpReference: vi.fn().mockResolvedValue(null),
  saveErpReferenceSnapshot: vi.fn(),
}))
vi.mock('../../src/services/auditRepository', () => ({
  createAuditEvent: vi.fn().mockResolvedValue({}),
  listAuditEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: vi.fn().mockResolvedValue([]),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
  renameAdditionalDocument: vi.fn(),
}))
vi.mock('../../src/services/postReceiptImagesStorage', () => ({
  deletePostReceiptImages: vi.fn().mockResolvedValue(undefined),
  getAddedPostReceiptImages: () => [],
  getRemovedPostReceiptImages: () => [],
  resolvePostReceiptImagesForSave: vi.fn().mockResolvedValue([]),
}))

import ProcessForm from '../../src/features/processes/ProcessForm'
import ProcessesPage from '../../src/pages/ProcessesPage'

// --- matchMedia controlavel (desktop >= 1041px | mobile <= 720px) -----------
function installMatchMedia({ desktop = true, mobile = false } = {}) {
  const state = { desktop, mobile }
  const listeners = { desktop: new Set(), mobile: new Set() }
  const keyOf = (query) => (query.includes('1041') ? 'desktop' : query.includes('720') ? 'mobile' : null)
  window.matchMedia = vi.fn((query) => {
    const key = keyOf(query)
    return {
      get matches() {
        return key ? state[key] : false
      },
      media: query,
      onchange: null,
      addEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].add(fn)
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && key) listeners[key].delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  return {
    setDesktop(value) {
      state.desktop = value
      act(() => {
        listeners.desktop.forEach((fn) => fn({ matches: value }))
      })
    },
  }
}

const ORIGINAL_MATCH_MEDIA = window.matchMedia

// Espera o focus trap do <Modal> (foco inicial 30 ms depois de abrir).
const settleFocusTrap = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80))
  })

function makeDraft(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    category: 'FCL',
    destination: 'Itajaí',
    processNumber: '4500128734',
    etd: '2026-09-12',
    eta: '2026-10-20',
    warehouseDeliveryDateOverride: '',
    etaOriginal: '',
    processStatus: 'Aguardando registro da DUIMP',
    containerQuantity: 0,
    palletQuantity: 0,
    processNotes: '',
    carrierName: '',
    licenses: [],
    berthed: false,
    cargoPresenceInformed: false,
    arrived: false,
    duimpStatus: '',
    parameterizationChannel: '',
    duimpNumber: '',
    duimpRegisteredAt: '',
    parameterizedAt: '',
    customsInspectionScheduledAt: '',
    customsRequirement: false,
    customsRequirementNotes: '',
    collectionStatus: '',
    collectionWindows: [],
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    items: [{ id: 'i-1', commercialName: 'Resina EP-128', quantity: 36000 }],
    supplierName: 'ALFA CHEM CO.',
    originLocation: 'Shanghai, CN',
    incoterm: 'CFR',
    forwarderName: '',
    unNumber: '',
    imoClass: '',
    shippedAt: '2026-09-12',
    vesselName: 'MSC AURORA',
    voyage: '123W',
    vesselImo: '',
    flightNumber: '',
    masterBl: '',
    houseBl: '',
    mawb: '',
    hawb: '',
    transshipmentPort: '',
    transshipmentEtd: '',
    dangerousGoods: false,
    transshipment: false,
    grossWeightKg: 0,
    volumeM3: 0,
    chargeableWeightKg: 0,
    packagesQuantity: 0,
    containers: [{ id: 'c-1', type: '20DC', number: 'MSCU4829130', seal: 'FX118204' }],
    berthedAt: '',
    arrivedAt: '',
    cargoPresenceInformedAt: '',
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: '',
    demurrageDailyRateUsd: '',
    migratedApproxFields: [],
    ...overrides,
  }
}

function renderForm(props = {}) {
  const handlers = {
    onSave: vi.fn(),
    onDraftChange: vi.fn(),
    onSetViewModeList: vi.fn(),
    onAddItem: vi.fn(),
    onItemChange: vi.fn(),
    onRemoveItem: vi.fn(),
  }
  const defaultProps = {
    viewMode: 'edit',
    draft: makeDraft(),
    isSaving: false,
    isImportingItems: false,
    canShowMaritimeFlow: true,
    canShowAirFlow: false,
    itemsFileInputRef: { current: null },
    channelOptions: ['Verde', 'Amarelo', 'Vermelho'],
    collectionStatusOptions: ['Coleta Pendente', 'Coleta Agendada'],
    dtaStatusOptions: ['Registrada'],
    processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
    onImportItemsFile: vi.fn(),
    onClickCapture: vi.fn(),
    ...handlers,
  }
  const utils = render(<ProcessForm {...defaultProps} {...props} />)
  return { ...utils, ...handlers, rerenderForm: (next) => utils.rerender(<ProcessForm {...defaultProps} {...next} />) }
}

const dialog = (name = 'Editar processo') => screen.getByRole('dialog', { name })
const stepper = (name) => within(dialog(name)).getByRole('list', { name: 'Etapas do cadastro' })

let media
beforeEach(() => {
  media = installMatchMedia({ desktop: true, mobile: false })
  vi.clearAllMocks()
})
afterEach(() => {
  window.matchMedia = ORIGINAL_MATCH_MEDIA
})

describe('F4d - formulario como modal (ProcessForm direto)', () => {
  it('abre como role=dialog (portal no body, aria-modal) com a raiz .process-form--dialog e sem a vista legada', () => {
    const { container } = renderForm()
    const el = dialog()
    expect(el).toHaveAttribute('aria-modal', 'true')
    expect(document.body.contains(el)).toBe(true)
    expect(container.querySelector('.process-form')).toBeNull()
    expect(el.querySelector('.process-form.process-form--dialog')).not.toBeNull()
    expect(el.closest('.modal-backdrop')).toHaveClass('process-form-modal-backdrop')
    expect(el).toHaveClass('process-form-modal')
    // sem o cabecalho padrao do Modal (o dialogo traz o proprio)
    expect(el.querySelector('.modal__header')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar para lista' })).toBeNull()
  })

  it('cabecalho: titulo h2, chip da categoria, tag de status, "nome · PO" e fechar', () => {
    renderForm()
    const el = dialog()
    expect(within(el).getByRole('heading', { level: 2, name: 'Editar processo' })).toBeInTheDocument()
    expect(el.querySelector('.pfd-chip')).toHaveTextContent('FCL')
    expect(el.querySelector('.pfd-header .status-tag')).not.toBeNull()
    expect(el.querySelector('.pfd-subtitle')).toHaveTextContent('Resina epóxi líquida · PO 4500128734')
    expect(within(el).getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })

  it('criar: titulo "Criar processo" e subtitulo "Novo processo" sem nome', () => {
    renderForm({ viewMode: 'create', draft: makeDraft({ name: '', processNumber: '' }), canShowMaritimeFlow: false })
    expect(within(dialog('Criar processo')).getByRole('heading', { level: 2, name: 'Criar processo' })).toBeInTheDocument()
    expect(dialog('Criar processo').querySelector('.pfd-subtitle')).toHaveTextContent('Novo processo')
  })

  it('consolidado: subtitulo com a contagem de POs (nao ha numero de processo)', () => {
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        processNumber: '',
        purchaseOrders: [{ po: '9010' }, { po: '9011' }],
      }),
    })
    expect(dialog().querySelector('.pfd-subtitle')).toHaveTextContent('Resina epóxi líquida · 2 POs')
  })

  it('fechar (x) e Esc chamam onSetViewModeList; o scrim NAO fecha', async () => {
    const user = userEvent.setup()
    const { onSetViewModeList } = renderForm()
    await user.click(within(dialog()).getByRole('button', { name: 'Fechar' }))
    expect(onSetViewModeList).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onSetViewModeList).toHaveBeenCalledTimes(2)
    fireEvent.click(document.querySelector('.modal-backdrop'))
    expect(onSetViewModeList).toHaveBeenCalledTimes(2)
  })

  it('stepper: 6 passos com aria-current no atual, rotulos e clique troca de passo', async () => {
    const user = userEvent.setup()
    renderForm()
    const items = within(stepper()).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      '1Identificação',
      '2Embarque',
      '3Carga',
      '4Chegada e liberação',
      '5Coleta',
      '6Itens',
    ])
    expect(within(items[0]).getByRole('button')).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveClass('pfd-step--current')
    expect(items[1]).toHaveClass('pfd-step--todo')
    await user.click(within(items[2]).getByRole('button'))
    expect(within(items[2]).getByRole('button')).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveClass('pfd-step--done')
    expect(items[1]).toHaveClass('pfd-step--done')
    expect(items[2]).toHaveClass('pfd-step--current')
    expect(dialog().querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 3 DE 6')
    expect(within(dialog()).getByRole('heading', { level: 3, name: 'Carga' })).toBeInTheDocument()
  })

  it('stepper: passo com erro vira "<passo>, contém erro" com o ponto e o resumo aparece no rodape', () => {
    renderForm({ fieldErrors: { etd: 'Data inválida: informe um ano entre 2000 e 2100.' } })
    expect(within(stepper()).getByRole('button', { name: 'Embarque, contém erro' })).toBeInTheDocument()
    expect(stepper().querySelector('.wizard-step__error-dot')).not.toBeNull()
    const summary = within(dialog()).getByRole('alert')
    expect(summary).toHaveTextContent('Corrija 1 campo destacado antes de salvar.')
    expect(summary).toHaveAttribute('id', 'process-form-error-summary')
    expect(summary.closest('.pfd-footer')).not.toBeNull()
  })

  it('rodape: Voltar (fantasma) desabilitado no 1o passo, Salvar (secundario) e Avancar (primario menta)', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()
    const el = dialog()
    const back = within(el).getByRole('button', { name: 'Voltar' })
    expect(back).toBeDisabled()
    expect(back).toHaveClass('ghost-button')
    const save = within(el).getByRole('button', { name: 'Salvar alterações' })
    expect(save).toHaveClass('secondary-button')
    const next = within(el).getByRole('button', { name: 'Avançar' })
    expect(next).toHaveClass('primary-button')
    expect(next.querySelector('svg')).not.toBeNull()
    await user.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    await user.click(next)
    expect(el.querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 2 DE 6')
    expect(within(el).getByRole('button', { name: 'Voltar' })).toBeEnabled()
    await user.click(within(el).getByRole('button', { name: 'Voltar' }))
    expect(el.querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 1 DE 6')
  })

  it('ultimo passo: "Avançar" some e o botao de salvar vira o primario; criar usa "Criar processo"', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepper()).getByRole('button', { name: /Itens/ }))
    const el = dialog()
    expect(within(el).queryByRole('button', { name: 'Avançar' })).toBeNull()
    expect(within(el).getByRole('button', { name: 'Salvar alterações' })).toHaveClass('primary-button')
    expect(within(el).queryByRole('button', { name: 'Salvar alterações' })).not.toHaveClass('secondary-button')
  })

  it('criar: o rodape salva com "Criar processo" e o ultimo passo tambem', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm({ viewMode: 'create', draft: makeDraft({ name: '' }), canShowMaritimeFlow: false })
    const el = dialog('Criar processo')
    expect(within(el).getByRole('button', { name: 'Criar processo' })).toHaveClass('secondary-button')
    await user.click(within(el).getByRole('button', { name: 'Criar processo' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    await user.click(within(stepper('Criar processo')).getByRole('button', { name: /Itens/ }))
    expect(within(el).getByRole('button', { name: 'Criar processo' })).toHaveClass('primary-button')
  })

  it('salvando: botao desabilitado com "Salvando..."', () => {
    renderForm({ isSaving: true })
    expect(within(dialog()).getByRole('button', { name: /Salvando/ })).toBeDisabled()
  })

  it('os 6 passos mantem os campos (nenhum campo some no modal)', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        berthed: true,
        berthedAt: '2026-10-20T08:00',
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ id: 'w1', scheduledAt: '2026-10-25T09:00', notes: '' }],
        cargoPresenceInformedAt: '2026-10-21T08:00',
      }),
    })
    const go = (label) => user.click(within(stepper()).getByRole('button', { name: new RegExp(label) }))
    const el = dialog()
    // 1 Identificacao
    for (const label of ['Nome do processo', 'Código do processo', 'Categoria', 'Destino', 'Fornecedor', 'Origem', 'Incoterm']) {
      expect(within(el).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
    // 2 Embarque
    await go('Embarque')
    for (const label of ['ETD', 'ETA', 'Navio', 'Viagem', 'IMO do navio', 'House BL', 'Agente de carga']) {
      expect(within(el).getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument()
    }
    expect(within(el).getByLabelText(/Embarque confirmado/)).toBeInTheDocument()
    expect(within(el).getByRole('switch', { name: 'Transbordo' })).toBeInTheDocument()
    // 3 Carga
    await go('Carga')
    expect(within(el).getByRole('button', { name: 'Adicionar contêiner' })).toBeInTheDocument()
    expect(within(el).getByLabelText(/Cubagem/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/Quantidade de pallets/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/Observações do processo/)).toBeInTheDocument()
    // 4 Chegada e liberacao
    await go('Chegada e liberação')
    expect(within(el).getByLabelText(/Atracação/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/Terminal \/ armazém/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/CE Mercante/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/Previsão manual de entrega/)).toBeInTheDocument()
    expect(within(el).getByLabelText(/Nº da DUIMP/)).toBeInTheDocument()
    expect(within(el).getByRole('button', { name: 'Adicionar anuência' })).toBeInTheDocument()
    expect(within(el).getByLabelText(/Free time \(dias\)/)).toBeInTheDocument()
    // 5 Coleta
    await go('Coleta')
    expect(within(el).getByLabelText(/Horário previsto/)).toBeInTheDocument()
    // 6 Itens
    await go('Itens')
    expect(within(el).getByRole('button', { name: 'Importar planilha' })).toBeInTheDocument()
    expect(within(el).getByRole('button', { name: 'Adicionar item' })).toBeInTheDocument()
    expect(within(el).getByLabelText('Nome comercial')).toBeInTheDocument()
    expect(within(el).getByRole('switch', { name: 'Carga perigosa (IMO)' })).toBeInTheDocument()
    expect(within(el).getByRole('button', { name: 'Remover item' })).toBeInTheDocument()
  })

  it('AEREO: passo Embarque com Voo/MAWB/HAWB e Carga com pesos', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'AEREO', containers: [] }), canShowMaritimeFlow: false, canShowAirFlow: true })
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))
    const el = dialog()
    for (const label of ['Voo', 'Master Air Waybill', 'House Air Waybill']) {
      expect(within(el).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
    await user.click(within(stepper()).getByRole('button', { name: /Carga/ }))
    for (const label of ['Peso bruto', 'Peso taxado', 'Volumes']) {
      expect(within(el).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
  })

  it('CONSOLIDADO: POs no passo Identificacao e PO por item no passo Itens', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        processNumber: '',
        supplierName: '',
        purchaseOrders: [{ po: '9010', reference: '', supplierName: 'ALFA' }, { po: '9011', reference: '', supplierName: 'GAMA' }],
        items: [{ id: 'i-1', commercialName: 'Solvente PI', quantity: 10, poNumber: '9010' }],
      }),
    })
    const el = dialog()
    expect(within(el).getByLabelText(/Nova PO/)).toBeInTheDocument()
    expect(within(el).queryByLabelText(/Código do processo/)).toBeNull()
    await user.click(within(stepper()).getByRole('button', { name: /Itens/ }))
    expect(within(el).getByLabelText('PO')).toBeInTheDocument()
    // cabecalho de 5 colunas (Nome | PO | Quantidade | IMO | acao) alinhado com as linhas
    expect(el.querySelector('.editor-grid__head--items')).toHaveClass('editor-grid__head--po')
  })

  it('Transbordo e um switch (mesmo estado booleano): marcar chama onDraftChange("transshipment", true) e revela os campos', async () => {
    const user = userEvent.setup()
    const { onDraftChange, rerenderForm } = renderForm()
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))
    const el = dialog()
    const toggle = within(el).getByRole('switch', { name: 'Transbordo' })
    expect(toggle).not.toBeChecked()
    expect(el.querySelector('.process-form-switch-row')).toHaveTextContent('Ative se a carga troca de navio no caminho.')
    expect(within(el).queryByLabelText('Porto/aeroporto de transbordo')).toBeNull()
    await user.click(toggle)
    expect(onDraftChange).toHaveBeenCalledWith('transshipment', true)
    rerenderForm({ draft: makeDraft({ transshipment: true }) })
    expect(within(dialog()).getByRole('switch', { name: 'Transbordo' })).toBeChecked()
    expect(within(dialog()).getByLabelText('Porto/aeroporto de transbordo')).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('ETD do transbordo')).toBeInTheDocument()
  })

  it('campos de codigo usam .text-input--mono (PO, Incoterm, Viagem, IMO, House BL, conteiner, lacre, quantidade)', async () => {
    const user = userEvent.setup()
    renderForm()
    const el = dialog()
    expect(within(el).getByLabelText(/Código do processo/)).toHaveClass('text-input--mono')
    expect(within(el).getByLabelText(/Incoterm/)).toHaveClass('text-input--mono')
    expect(within(el).getByLabelText(/Nome do processo/)).not.toHaveClass('text-input--mono')
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))
    for (const label of ['Viagem', 'IMO do navio', 'House BL']) {
      expect(within(el).getByLabelText(new RegExp(`^${label}`))).toHaveClass('text-input--mono')
    }
    expect(within(el).getByLabelText(/^Navio/)).not.toHaveClass('text-input--mono')
    await user.click(within(stepper()).getByRole('button', { name: /Carga/ }))
    expect(within(el).getByPlaceholderText('Ex.: CSQU3054383')).toHaveClass('text-input--mono')
    expect(within(el).getByLabelText('Lacre')).toHaveClass('text-input--mono')
    await user.click(within(stepper()).getByRole('button', { name: /Itens/ }))
    expect(within(el).getByLabelText('Quantidade')).toHaveClass('text-input--mono')
  })

  it('aviso ISO 6346 do conteiner continua (numero invalido)', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ containers: [{ id: 'c-1', type: '20DC', number: 'MSCU1234567', seal: '' }] }) })
    await user.click(within(stepper()).getByRole('button', { name: /Carga/ }))
    expect(dialog().querySelector('.inline-badge--warn')).not.toBeNull()
  })

  it('itens: adicionar, alterar e remover chamam os mesmos callbacks', async () => {
    const user = userEvent.setup()
    const { onAddItem, onItemChange, onRemoveItem } = renderForm()
    await user.click(within(stepper()).getByRole('button', { name: /Itens/ }))
    const el = dialog()
    await user.click(within(el).getByRole('button', { name: 'Adicionar item' }))
    expect(onAddItem).toHaveBeenCalled()
    fireEvent.change(within(el).getByLabelText('Quantidade'), { target: { value: '50' } })
    expect(onItemChange).toHaveBeenCalledWith('i-1', 'quantity', '50')
    await user.click(within(el).getByRole('button', { name: 'Remover item' }))
    expect(onRemoveItem).toHaveBeenCalledWith('i-1')
  })

  it('pendentes (edicao): borda de aviso + "Dado pendente" no campo; some quando preenchido; nao existe em criar', async () => {
    const user = userEvent.setup()
    const { rerenderForm } = renderForm()
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))
    const houseBl = within(dialog()).getByLabelText(/^House BL/)
    expect(houseBl.closest('label')).toHaveAttribute('data-pending', 'true')
    expect(within(houseBl.closest('label')).getByText('Dado pendente')).toBeInTheDocument()
    // Navio ja preenchido: sem aviso
    expect(within(dialog()).getByLabelText(/^Navio/).closest('label')).not.toHaveAttribute('data-pending')
    rerenderForm({ draft: makeDraft({ houseBl: 'MEDU0000000' }) })
    expect(within(dialog()).getByLabelText(/^House BL/).closest('label')).not.toHaveAttribute('data-pending')
    expect(within(dialog()).queryAllByText('Dado pendente').some((node) => node.closest('label')?.textContent?.includes('House BL'))).toBe(false)
  })

  it('pendentes: em criar nao ha aviso (rascunho vazio nao e "pendente")', () => {
    renderForm({ viewMode: 'create', draft: makeDraft({ name: '', destination: '', supplierName: '' }), canShowMaritimeFlow: false })
    expect(within(dialog('Criar processo')).queryByText('Dado pendente')).toBeNull()
    expect(dialog('Criar processo').querySelector('[data-pending]')).toBeNull()
  })

  it('pendentes: editor de contêineres mostra o aviso de grupo quando falta tipo/numero/lacre', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ containers: [{ id: 'c-1', type: '20DC', number: '', seal: '' }] }) })
    await user.click(within(stepper()).getByRole('button', { name: /Carga/ }))
    const editor = dialog().querySelector('.collection-windows-editor')
    expect(within(editor).getByText('Dado pendente')).toBeInTheDocument()
  })

  it('foco inicial: sem pedido, o 1o campo do passo (e nao o x do cabecalho), depois do focus trap', async () => {
    renderForm()
    await settleFocusTrap()
    expect(within(dialog()).getByLabelText(/Nome do processo/)).toHaveFocus()
  })

  it('focusRequest ("Completar agora"): foca o campo no passo certo, dentro do modal, e o foco sobrevive ao focus trap', async () => {
    renderForm({ focusRequest: { key: 'etd', nonce: 1 } })
    await waitFor(() => expect(document.getElementById('process-field-etd')).toHaveFocus())
    await settleFocusTrap()
    const etd = document.getElementById('process-field-etd')
    expect(etd).toHaveFocus()
    expect(dialog().contains(etd)).toBe(true)
    expect(dialog().querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 2 DE 6')
  })

  it('focusRequest sem campo renderizavel cai no 1o campo do passo (nunca no body)', async () => {
    renderForm({ focusRequest: { key: 'carrierName', nonce: 1 } })
    await settleFocusTrap()
    expect(dialog().contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('o focus trap prende o Tab dentro do dialogo (Shift+Tab no primeiro vai ao ultimo)', async () => {
    renderForm()
    await settleFocusTrap()
    const el = dialog()
    const focusables = Array.from(
      el.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled])')
    )
    focusables[0].focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(el.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(focusables[focusables.length - 1])
  })

  it('troca ao vivo desktop <-> tablet: a vista legada assume e o passo atual continua', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepper()).getByRole('button', { name: /Carga/ }))
    expect(dialog().querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 3 DE 6')

    media.setDesktop(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.process-form.list-card')).not.toBeNull()
    expect(screen.getByText(/Passo 3 de 6/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar para lista' })).toBeInTheDocument()

    media.setDesktop(true)
    expect(document.querySelector('.process-form.list-card')).toBeNull()
    expect(dialog().querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 3 DE 6')
  })

  it('chip "ERP" (so admin, em edicao) continua no modal: aplica o valor do ERP no rascunho pelo mesmo callback', async () => {
    const user = userEvent.setup()
    const snapshotId = 'AAAAAAAAAAAAAAAAAAAA'
    const erpReference = {
      snapshot: { snapshotId, updatedAtMs: new Date(2026, 9, 2, 14, 30).getTime() },
      hint: {
        snapshotId,
        matchRule: 'pedido',
        shipment: {
          kind: 'FCL',
          portalCategory: 'FCL',
          key: 'BETA SEA 904-26',
          incoterm: '',
          originHint: '',
          stage: 1,
          statuses: ['EMBARCOU'],
          statusNf: [],
          orders: [{ pedido: '4500128734', poRef: 'BETA SEA 904-26', poBase: '', exporter: '' }],
          items: [],
          transport: {
            etd: '',
            eta: '2026-11-14',
            vessel: { name: '', raw: '', voyage: '' },
            blAwb: '',
            origin: '',
            destination: '',
            diNumber: '',
            diDate: '',
          },
          conflicts: [],
        },
      },
    }
    const { onDraftChange } = renderForm({ erpReference })
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))
    const chip = within(dialog()).getByRole('button', { name: 'ETA no ERP: 14/11/2026 (usar este valor)' })
    // o chip fica FORA do label: o input continua com o nome "ETA"
    expect(chip.closest('label')).toBeNull()
    await user.click(chip)
    expect(onDraftChange).toHaveBeenCalledWith('eta', '2026-11-14')
  })

  it('tablet/mobile (matchMedia falso): vista legada, sem modal e sem "Dado pendente"', () => {
    installMatchMedia({ desktop: false, mobile: false })
    renderForm()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.process-form.list-card')).not.toBeNull()
    expect(document.querySelector('.process-form--dialog')).toBeNull()
    expect(screen.queryByText('Dado pendente')).toBeNull()
    // Avancar segue como no legado (secundario), nao menta
    expect(screen.getByRole('button', { name: 'Avançar' })).toHaveClass('ghost-button')
  })
})

// =============================================================================
// Dentro da ProcessesPage (pagina real, repositorios mockados)
// =============================================================================
const PROCESSES = [
  {
    id: 'p-1',
    name: 'Resina epóxi líquida',
    processNumber: '4500128734',
    category: 'FCL',
    destination: 'Itajaí',
    processStatus: 'Aguardando Embarque',
    containerQuantity: 2,
    etd: '',
    eta: '',
    carrierName: '',
    items: [{ id: 'i-1', commercialName: 'Resina EP-128', quantity: 36000 }],
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/processos']}>
      <UnsavedChangesProvider>
        <ToastProvider>
          <Routes>
            <Route path="/processos" element={<ProcessesPage />} />
          </Routes>
        </ToastProvider>
      </UnsavedChangesProvider>
    </MemoryRouter>
  )
}

async function openDetail(container, user) {
  await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
  await user.click(container.querySelector('.chg-row__main'))
  await waitFor(() => expect(container.querySelector('.pdv-head')).not.toBeNull())
}

describe('F4d - formulario dentro da ProcessesPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockListProcesses.mockReset()
    mockUseAuth.mockReturnValue({
      profile: { uid: 'u-1', name: 'Lucas', role: 'admin', favoriteProcessIds: [] },
      toggleFavoriteProcess: vi.fn(),
    })
    mockListProcesses.mockResolvedValue(PROCESSES)
  })

  it('"Editar processo" abre o modal SOBRE o detalhe (o detalhe continua atras do scrim)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    const el = await screen.findByRole('dialog', { name: 'Editar processo' })
    expect(el.closest('.modal-backdrop')).not.toBeNull()
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(container.querySelector('section.surface')).toHaveClass('surface--process-detail')
    expect(container.querySelector('.process-form')).toBeNull()
  })

  it('fechar o modal de edicao devolve o detalhe (sem alteracoes: sem confirmacao)', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await screen.findByRole('dialog', { name: 'Editar processo' })
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar processo' })).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Editar processo' })).toBeInTheDocument()
  })

  it('Esc fecha o modal de edicao', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await screen.findByRole('dialog', { name: 'Editar processo' })
    await settleFocusTrap()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar processo' })).toBeNull())
    expect(container.querySelector('.pdv-head')).not.toBeNull()
  })

  it('devolve o foco ao botao que abriu o modal ("Editar processo") ao fechar', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    const trigger = screen.getByRole('button', { name: 'Editar processo' })
    await user.click(trigger)
    await screen.findByRole('dialog', { name: 'Editar processo' })
    await settleFocusTrap()
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar processo' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Editar processo' })).toHaveFocus()
  })

  it('alteracoes nao salvas: fechar pergunta "Descartar alterações?"; Esc fecha so a pergunta; Descartar fecha o modal', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    const el = await screen.findByRole('dialog', { name: 'Editar processo' })
    await settleFocusTrap()
    await user.type(within(el).getByLabelText(/Nome do processo/), ' (editada)')

    await user.click(within(el).getByRole('button', { name: 'Fechar' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText('Descartar alterações?')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar processo' })).toBeInTheDocument()

    // Esc dentro da pergunta fecha SO a pergunta (pilha de modais)
    await settleFocusTrap()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Editar processo' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog', { name: 'Editar processo' })).getByLabelText(/Nome do processo/)).toHaveValue(
      'Resina epóxi líquida (editada)'
    )

    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    const confirmAgain = await screen.findByRole('alertdialog')
    await user.click(within(confirmAgain).getByRole('button', { name: 'Descartar alterações' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar processo' })).toBeNull())
    expect(container.querySelector('.pdv-head')).not.toBeNull()
  })

  it('"Novo processo" abre o modal de criacao SOBRE a lista; fechar volta a lista', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelectorAll('.chg-row')).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Novo processo' }))
    const el = await screen.findByRole('dialog', { name: 'Criar processo' })
    expect(within(el).getByRole('heading', { level: 2, name: 'Criar processo' })).toBeInTheDocument()
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    expect(container.querySelector('section.surface')).toHaveClass('surface--arrivals')
    await settleFocusTrap()
    await user.click(within(el).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Criar processo' })).toBeNull())
    expect(container.querySelectorAll('.chg-row')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'Fila de chegadas' })).toBeInTheDocument()
  })

  it('"Completar agora" abre o modal com o foco no 1o campo pendente (ETD), dentro do dialogo, e o foco permanece', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await openDetail(container, user)
    const note = screen.getByRole('note')
    await user.click(within(note).getByRole('button', { name: 'Completar agora' }))
    const el = await screen.findByRole('dialog', { name: 'Editar processo' })
    await waitFor(() => expect(document.getElementById('process-field-etd')).toHaveFocus())
    await settleFocusTrap()
    const etd = document.getElementById('process-field-etd')
    expect(etd).toHaveFocus()
    expect(el.contains(etd)).toBe(true)
    expect(el.querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 2 DE 6')
    // o campo pendente aparece marcado
    expect(etd.closest('label')).toHaveAttribute('data-pending', 'true')
    expect(within(etd.closest('label')).getByText('Dado pendente')).toBeInTheDocument()
  })

  it('troca ao vivo desktop <-> tablet com o formulario aberto: a vista legada assume e volta ao modal', async () => {
    const user = userEvent.setup()
    const live = installMatchMedia({ desktop: true, mobile: false })
    const { container } = renderPage()
    await openDetail(container, user)
    await user.click(screen.getByRole('button', { name: 'Editar processo' }))
    await screen.findByRole('dialog', { name: 'Editar processo' })
    await user.click(within(stepper()).getByRole('button', { name: /Embarque/ }))

    live.setDesktop(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('.process-form.list-card')).not.toBeNull()
    expect(container.querySelector('.pdv-head')).toBeNull()
    expect(screen.getByText(/Passo 2 de 6/)).toBeInTheDocument()

    live.setDesktop(true)
    expect(container.querySelector('.process-form.list-card')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Editar processo' }).querySelector('.pfd-eyebrow')).toHaveTextContent('PASSO 2 DE 6')
    expect(container.querySelector('.pdv-head')).not.toBeNull()
    expect(mockListProcesses).toHaveBeenCalledTimes(1)
  })

  it('tablet: "Editar processo" abre a vista legada dentro da pagina (sem modal) e Voltar para lista volta a lista', async () => {
    installMatchMedia({ desktop: false, mobile: false })
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitFor(() => expect(container.querySelector('.process-item--button')).not.toBeNull())
    await user.click(container.querySelector('.process-item--button'))
    await waitFor(() => expect(container.querySelector('.process-timeline')).not.toBeNull())
    await user.click(screen.getAllByRole('button', { name: 'Editar processo' })[0])
    await waitFor(() => expect(container.querySelector('.process-form.list-card')).not.toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Voltar para lista' }))
    await waitFor(() => expect(container.querySelector('.process-form')).toBeNull())
    expect(container.querySelector('.process-item--button')).not.toBeNull()
  })
})
