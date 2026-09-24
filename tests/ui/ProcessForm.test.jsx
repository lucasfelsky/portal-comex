// C11 (auditoria mobile F14): ProcessForm virou wizard de etapas. Estes
// testes cobrem a MECÂNICA do wizard (passos, progresso, navegação, chips
// clicáveis, passo de fluxo condicional, salvar sempre disponível) — os
// campos em si são os mesmos do form antigo, só reagrupados.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProcessForm from '../../src/features/processes/ProcessForm'

function makeDraft(overrides = {}) {
  return {
    id: 'p-1',
    name: '',
    category: 'FCL',
    destination: '',
    processNumber: '',
    etd: '',
    eta: '',
    warehouseDeliveryDateOverride: '',
    etaOriginal: '',
    processStatus: 'Em andamento',
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
    collectionStatus: '',
    collectionWindows: [],
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    items: [],
    // F17.2a (D-1): identificacao, carga por modal, embarque e transito.
    supplierName: '',
    originLocation: '',
    incoterm: '',
    forwarderName: '',
    unNumber: '',
    imoClass: '',
    shippedAt: '',
    vesselName: '',
    voyage: '',
    flightNumber: '',
    masterBl: '',
    houseBl: '',
    mawb: '',
    hawb: '',
    transshipmentPort: '',
    dangerousGoods: false,
    transshipment: false,
    grossWeightKg: 0,
    volumeM3: 0,
    chargeableWeightKg: 0,
    packagesQuantity: 0,
    containers: [],
    ...overrides,
  }
}

function renderForm(props = {}) {
  const onSave = vi.fn()
  const onDraftChange = vi.fn()
  const defaultProps = {
    viewMode: 'create',
    draft: makeDraft(),
    isSaving: false,
    isImportingItems: false,
    canShowMaritimeFlow: false,
    canShowAirFlow: false,
    itemsFileInputRef: { current: null },
    channelOptions: ['Verde', 'Amarelo', 'Vermelho'],
    collectionStatusOptions: ['Coleta Pendente', 'Coleta Agendada'],
    dtaStatusOptions: ['Registrada'],
    duimpStatusOptions: ['Registrada', 'Parametrizada'],
    processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
    onDraftChange,
    onSetViewModeList: vi.fn(),
    onSave,
    onImportItemsFile: vi.fn(),
    onAddItem: vi.fn(),
    onItemChange: vi.fn(),
    onRemoveItem: vi.fn(),
    onClickCapture: vi.fn(),
  }
  const utils = render(<ProcessForm {...defaultProps} {...props} />)
  return { ...utils, onSave, onDraftChange }
}

const stepsRow = () => screen.getByLabelText('Etapas do cadastro')

describe('ProcessForm — wizard de etapas (C11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre no passo 1 (Identificação) de 5 (sem fluxo em create FCL)', () => {
    renderForm()
    expect(screen.getByText(/Passo 1 de 5/)).toBeInTheDocument()
    expect(screen.getByText('Identificação', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex.: Importação Atlas')).toBeInTheDocument()
  })

  it('"Voltar" começa desabilitado no primeiro passo', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled()
  })

  it('"Avançar" vai pro passo 2 (Datas e previsão)', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: 'Avançar' }))
    expect(screen.getByText(/Passo 2 de 5/)).toBeInTheDocument()
    // ETD/ETA são exclusivos do passo de datas
    expect(screen.getByText('ETD')).toBeInTheDocument()
    expect(screen.getByText('ETA')).toBeInTheDocument()
    // Voltar agora habilitado
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled()
  })

  it('chip de passo pula direto (Itens) sem passar pelos intermediários', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    expect(screen.getByText(/Passo 5 de 5/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeInTheDocument()
    // No último passo, "Avançar" some
    expect(screen.queryByRole('button', { name: 'Avançar' })).not.toBeInTheDocument()
  })

  it('passo "Embarque e trânsito" existe em create e dispara onDraftChange("shippedAt", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque e trânsito' }))
    expect(screen.getByText('Data de embarque')).toBeInTheDocument()
    const dateInput = document.querySelector('input[type="date"]')
    await user.type(dateInput, '2026-09-20')
    expect(onDraftChange).toHaveBeenCalledWith('shippedAt', expect.any(String))
  })

  it('FCL mostra "Adicionar contêiner" no passo de status e carga', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'FCL' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
    expect(screen.getByRole('button', { name: 'Adicionar contêiner' })).toBeInTheDocument()
  })

  it('LCL mostra "Cubagem" no passo de status e carga', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'LCL' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
    expect(screen.getByText('Cubagem (m³)')).toBeInTheDocument()
  })

  it('número de contêiner com dígito verificador invalido mostra o aviso', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'FCL',
        containers: [{ id: 'CNT-1', number: 'TGHU1234560', seal: '', type: '' }],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
    expect(
      screen.getByText('Dígito verificador não confere (esperado: 7).')
    ).toBeInTheDocument()
  })

  it('dangerousGoods marcado mostra "Número ONU" e "Classe IMO"', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ dangerousGoods: true }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
    expect(screen.getByText('Número ONU')).toBeInTheDocument()
    expect(screen.getByText('Classe IMO')).toBeInTheDocument()
  })

  it('botão Salvar fica disponível em qualquer passo e chama onSave', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()
    // passo 1
    const saveBtn = screen.getByRole('button', { name: 'Criar processo' })
    expect(saveBtn).toBeInTheDocument()
    await user.click(saveBtn)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('inclui o passo "Fluxo operacional" quando canShowMaritimeFlow (6 passos)', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true })
    expect(screen.getByText(/Passo 1 de 6/)).toBeInTheDocument()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.getByText('Pós-atracação')).toBeInTheDocument()
    expect(screen.getByText('Atracou?')).toBeInTheDocument()
  })

  it('NÃO inclui o passo de fluxo em create sem maritime/air (5 passos)', () => {
    renderForm()
    expect(
      within(stepsRow()).queryByRole('tab', { name: 'Fluxo operacional' })
    ).not.toBeInTheDocument()
  })

  it('CONSOLIDADO esconde o campo "Código do processo"', () => {
    renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    expect(screen.queryByText('Código do processo')).not.toBeInTheDocument()
    // troca pra FCL mostra
    renderForm({ draft: makeDraft({ category: 'FCL' }) })
    expect(screen.getAllByText('Código do processo').length).toBeGreaterThan(0)
  })

  it('digitar o nome dispara onDraftChange("name", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm()
    await user.type(screen.getByPlaceholderText('Ex.: Importação Atlas'), 'Atlas')
    expect(onDraftChange).toHaveBeenCalledWith('name', expect.any(String))
  })

  it('isSaving mostra "Salvando..." e desabilita o Salvar', () => {
    renderForm({ isSaving: true })
    expect(screen.getByText('Salvando...')).toBeInTheDocument()
    const saveBtn = screen.getByText('Salvando...').closest('button')
    expect(saveBtn).toBeDisabled()
  })

  // F17.2b (D-5): a anuencia MAPA saiu do passo "Fluxo operacional" (agora
  // vive em "Status e carga", via `LicensesEditor`).
  it('edit marítimo NÃO tem mais "MAPA" no passo de fluxo', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.queryByText('MAPA')).not.toBeInTheDocument()
  })

  it.each([['FCL'], ['AEREO']])(
    '"Status e carga" tem "Adicionar anuência" em create %s',
    async (category) => {
      const user = userEvent.setup()
      renderForm({ draft: makeDraft({ category }) })
      await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
      expect(screen.getByRole('button', { name: 'Adicionar anuência' })).toBeInTheDocument()
    }
  )

  it('coleta agendada mostra "Transportadora" no passo de fluxo e dispara onDraftChange', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ collectionStatus: 'Coleta Agendada' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Transportadora'), 'X')
    expect(onDraftChange).toHaveBeenCalledWith('carrierName', expect.any(String))
  })

  it('sem coleta agendada NÃO mostra "Transportadora" no passo de fluxo', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ collectionStatus: '' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.queryByText('Transportadora')).not.toBeInTheDocument()
  })
})

// F17.0 bugs 2 e 3: precedencia de operador em `canUsePostCollectionStatuses`
// (bug com janela libera pos-coleta mesmo sem status "retentor") e MAPA vazio
// bloqueando o select de Coleta em maritimo.
describe('ProcessForm — bugs 2 e 3 (fluxo operacional)', () => {
  function maritimeReadyDraft(overrides = {}) {
    return makeDraft({
      category: 'FCL',
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      ...overrides,
    })
  }

  async function openFlowStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
  }

  it('janela + "Coleta Agendada" mostra a opção de estoque', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      collectionStatusOptions: ['Coleta Agendada', 'Carga disponível em estoque'],
      draft: maritimeReadyDraft({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00' }],
      }),
    })
    await openFlowStep(user)
    expect(screen.getByRole('option', { name: 'Carga disponível em estoque' })).toBeInTheDocument()
  })

  it('janela + collectionStatus vazio NÃO mostra a opção de estoque (bug antes do fix)', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      collectionStatusOptions: ['Coleta Agendada', 'Carga disponível em estoque'],
      draft: maritimeReadyDraft({
        collectionStatus: '',
        collectionWindows: [{ scheduledAt: '2026-01-01T10:00:00' }],
      }),
    })
    await openFlowStep(user)
    expect(
      screen.queryByRole('option', { name: 'Carga disponível em estoque' })
    ).not.toBeInTheDocument()
  })

  it('collectionWindows vazio + collectionScheduledAt legado + "Coleta Agendada" mostra a opção de estoque', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      collectionStatusOptions: ['Coleta Agendada', 'Carga disponível em estoque'],
      draft: maritimeReadyDraft({
        collectionStatus: 'Coleta Agendada',
        collectionWindows: [],
        collectionScheduledAt: '2026-01-01T10:00:00',
      }),
    })
    await openFlowStep(user)
    expect(screen.getByRole('option', { name: 'Carga disponível em estoque' })).toBeInTheDocument()
  })

  // F17.2b (D-4): o gate de coleta agora usa `licenses[]` (multi-orgao, com
  // compat de leitura MAPA) em vez do `mapaStatus` isolado.
  it('licenses: [] renderiza o select de Coleta', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: maritimeReadyDraft({ licenses: [] }),
    })
    await openFlowStep(user)
    expect(screen.getByText('Coleta')).toBeInTheDocument()
  })

  it('licenses com anuência "Em análise" NÃO renderiza o select de Coleta', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: maritimeReadyDraft({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Em análise' }],
      }),
    })
    await openFlowStep(user)
    expect(screen.queryByText('Coleta')).not.toBeInTheDocument()
  })

  // F17.2b (D5 do spec): AEREO agora tambem e' bloqueado por anuencia nao
  // deferida (antes so' maritimo tinha MAPA).
  it('AEREO com anuência "Em análise" NÃO renderiza o select de Coleta', async () => {
    const user = userEvent.setup()
    const draft = makeDraft({
      category: 'AEREO',
      arrived: true,
      dtaStatus: 'Trânsito concluído',
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      licenses: [{ id: 'LIC-1', agency: 'ANVISA', status: 'Em análise' }],
    })
    renderForm({ viewMode: 'edit', canShowAirFlow: true, draft })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.queryByText('Coleta')).not.toBeInTheDocument()
  })
})

// F17.2b (D-5): editor de anuencias no passo "Status e carga".
describe('ProcessForm — LicensesEditor (F17.2b)', () => {
  async function openStatusStepFor(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
  }

  it('status "Vistoria agendada" mostra "Vistoria agendada para"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Vistoria agendada', inspectionScheduledAt: '' }],
      }),
    })
    await openStatusStepFor(user)
    expect(screen.getByText('Vistoria agendada para')).toBeInTheDocument()
  })

  it('status "Indeferida" mostra o badge "Indeferida"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
      }),
    })
    await openStatusStepFor(user)
    expect(screen.getByText('Indeferida', { selector: 'span' })).toBeInTheDocument()
  })

  it('botão "Adicionar anuência" desabilita com 10 anuências', async () => {
    const user = userEvent.setup()
    const licenses = Array.from({ length: 10 }, (_, index) => ({
      id: `LIC-${index + 1}`,
      agency: 'MAPA',
      status: 'Aguardando registro',
    }))
    renderForm({ draft: makeDraft({ licenses }) })
    await openStatusStepFor(user)
    expect(screen.getByRole('button', { name: 'Adicionar anuência' })).toBeDisabled()
  })
})

// F17.2a (D-3): status derivado read-only - select de etapa pre-chegada
// acabou (shippedAt no passo "Embarque e trânsito" e' quem avanca o status).
describe('ProcessForm — status derivado (F17.2a D-3)', () => {
  async function openStatusStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Status e carga' }))
  }

  it('NÃO existe mais o select de etapa pré-chegada', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({ category: 'FCL', berthed: false, processStatus: 'Aguardando Embarque' }),
    })
    await openStatusStep(user)
    expect(
      screen.queryByText('Etapa pré-chegada (manual até o registro da data de embarque)')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Informe a data de embarque (passo Embarque e trânsito) para o status avançar.')
    ).toBeInTheDocument()
  })

  it('com berthed:true a tag mostra "Atracação confirmada"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({ category: 'FCL', berthed: true, processStatus: 'Aguardando Embarque' }),
    })
    await openStatusStep(user)
    expect(screen.getByText('Atracação confirmada')).toBeInTheDocument()
  })
})

// F17.2c (D-7/D-10): PurchaseOrdersEditor no passo Identificação, PO por
// item no passo Itens (CONSOLIDADO), e select de contêiner nas janelas
// de coleta (FCL/CONSOLIDADO com containers[]).
describe('ProcessForm — purchaseOrders/janelas por container (F17.2c)', () => {
  function maritimeReadyDraft(overrides = {}) {
    return makeDraft({
      category: 'FCL',
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      ...overrides,
    })
  }

  async function openFlowStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
  }

  it('CONSOLIDADO mostra "Adicionar PO" e adicionar dispara onDraftChange("purchaseOrders", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    await user.type(screen.getByPlaceholderText('Ex.: PO-12345'), 'PO-A')
    await user.click(screen.getByRole('button', { name: 'Adicionar PO' }))
    expect(onDraftChange).toHaveBeenCalledWith('purchaseOrders', ['PO-A'])
  })

  it('passo Itens do CONSOLIDADO mostra o select "PO" com as POs cadastradas', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        purchaseOrders: ['PO-A', 'PO-B'],
        items: [{ id: 'i1', commercialName: 'Item', quantity: 1, poNumber: '' }],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    expect(screen.getByRole('option', { name: 'PO-A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'PO-B' })).toBeInTheDocument()
  })

  it('passo Itens do CONSOLIDADO sem POs mostra o hint de cadastro', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        purchaseOrders: [],
        items: [{ id: 'i1', commercialName: 'Item', quantity: 1 }],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    expect(screen.getByText('Cadastre as POs no passo Identificação.')).toBeInTheDocument()
  })

  it('FCL com 2 containers + "Coleta Agendada" mostra o select "Contêiner" com as 2 opções', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: maritimeReadyDraft({
        collectionStatus: 'Coleta Agendada',
        containers: [{ id: 'CNT-1', number: 'CSQU3054383' }, { id: 'CNT-2', number: 'MSCU1234566' }],
        collectionWindows: [{ id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '' }],
      }),
    })
    await openFlowStep(user)
    expect(screen.getByText('Contêiner')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'CSQU3054383' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'MSCU1234566' })).toBeInTheDocument()
  })

  it('janela com containerId inexistente mostra "Contêiner removido do processo"', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: maritimeReadyDraft({
        collectionStatus: 'Coleta Agendada',
        containers: [{ id: 'CNT-1', number: 'CSQU3054383' }],
        collectionWindows: [{ id: 'W1', containerId: 'CNT-REMOVIDO', scheduledAt: '' }],
      }),
    })
    await openFlowStep(user)
    expect(
      screen.getByText('Contêiner removido do processo — selecione outro contêiner para esta janela.')
    ).toBeInTheDocument()
  })

  it('AEREO/LCL nao mostra campo de contêiner e "Adicionar janela" desabilita com 1 janela', async () => {
    const user = userEvent.setup()
    const draft = makeDraft({
      category: 'AEREO',
      arrived: true,
      dtaStatus: 'Trânsito concluído',
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      collectionStatus: 'Coleta Agendada',
      collectionWindows: [{ id: 'W1', scheduledAt: '' }],
    })
    renderForm({ viewMode: 'edit', canShowAirFlow: true, draft })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Fluxo operacional' }))
    expect(screen.queryByText('Contêiner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar janela' })).toBeDisabled()
  })
})
