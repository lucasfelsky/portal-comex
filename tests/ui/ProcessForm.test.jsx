// C11 (auditoria mobile F14): ProcessForm virou wizard de etapas. Estes
// testes cobrem a MECÂNICA do wizard (passos, progresso, navegação, chips
// clicáveis, salvar sempre disponível) — os campos em si são os mesmos do
// form antigo, só reagrupados.
//
// UX-6b-1: os passos viraram 6 FIXOS (Identificação / Embarque / Carga /
// Chegada e liberação / Coleta / Itens), na mesma ordem em create e em
// edit — o antigo passo condicional "Fluxo operacional" saiu.
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
    // F17.3b (D-11/D-12): DUIMP completa (numero + datas), conferencia,
    // exigencia.
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
    transshipmentEtd: '',
    dangerousGoods: false,
    transshipment: false,
    grossWeightKg: 0,
    volumeM3: 0,
    chargeableWeightKg: 0,
    packagesQuantity: 0,
    containers: [],
    // F17.3a (D-1): chegada com data, CE/terminal/free time, presenca de
    // carga com data, marcador de aproximacao.
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

describe('ProcessForm — wizard de etapas (C11 / UX-6b-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre no passo 1 (Identificação) de 6', () => {
    renderForm()
    expect(screen.getByText(/Passo 1 de 6/)).toBeInTheDocument()
    expect(screen.getByText('Identificação', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex.: Importação Atlas')).toBeInTheDocument()
  })

  it('"Voltar" começa desabilitado no primeiro passo', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled()
  })

  it('"Avançar" vai pro passo 2 (Embarque)', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: 'Avançar' }))
    expect(screen.getByText(/Passo 2 de 6/)).toBeInTheDocument()
    // ETD/ETA são exclusivos do passo de embarque
    expect(screen.getByText('ETD')).toBeInTheDocument()
    expect(screen.getByText('ETA')).toBeInTheDocument()
    // Voltar agora habilitado
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled()
  })

  it('chip de passo pula direto (Itens) sem passar pelos intermediários', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    expect(screen.getByText(/Passo 6 de 6/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeInTheDocument()
    // No último passo, "Avançar" some
    expect(screen.queryByRole('button', { name: 'Avançar' })).not.toBeInTheDocument()
  })

  // F17.2d-1 (D-1, Q5): "Data de embarque" saiu do passo "Embarque" - virou
  // o checkbox "Embarque confirmado".
  it('passo "Embarque" NAO tem "Data de embarque"', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque' }))
    expect(screen.queryByText('Data de embarque')).not.toBeInTheDocument()
  })

  it('transbordo marcado mostra "ETD do transbordo" e dispara onDraftChange("transshipmentEtd", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ transshipment: true }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque' }))
    expect(screen.getByText('ETD do transbordo')).toBeInTheDocument()
    const label = screen.getByText('ETD do transbordo').closest('label')
    const input = within(label).getByDisplayValue('')
    await user.type(input, '2026-09-20')
    expect(onDraftChange).toHaveBeenCalledWith('transshipmentEtd', expect.any(String))
  })

  // F17.2d-1 (D-1/D-2, Q5): checkbox "Embarque confirmado" no passo
  // "Embarque".
  it('checkbox "Embarque confirmado" desabilita sem ETD', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ etd: '' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque' }))
    expect(screen.getByRole('checkbox', { name: 'Embarque confirmado' })).toBeDisabled()
  })

  it('marcar "Embarque confirmado" dispara onDraftChange("shipmentConfirmed", true)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ etd: '2026-09-18' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque' }))
    await user.click(screen.getByRole('checkbox', { name: 'Embarque confirmado' }))
    expect(onDraftChange).toHaveBeenCalledWith('shipmentConfirmed', true)
  })

  it('divergencia entre shippedAt e ETD mostra "Usar esta data como ETD"', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ etd: '2026-09-18', shippedAt: '2026-09-10' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Embarque' }))
    expect(screen.getByRole('button', { name: 'Usar esta data como ETD' })).toBeInTheDocument()
  })

  it('FCL mostra "Adicionar contêiner" no passo Carga', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'FCL' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    expect(screen.getByRole('button', { name: 'Adicionar contêiner' })).toBeInTheDocument()
  })

  it('LCL mostra "Cubagem" no passo Carga', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'LCL' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    expect(screen.getByText('Cubagem (m³)')).toBeInTheDocument()
  })

  // F17.2d-1 (D-7, Q2): cubagem opcional tambem em FCL/CONSOLIDADO.
  it('FCL mostra "Cubagem (m³)" no passo Carga', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ category: 'FCL' }) })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    expect(screen.getByText('Cubagem (m³)')).toBeInTheDocument()
  })

  // F17.2d-1 (D-4/D-5, Q4): legado de nivel-processo (sem item classificado).
  it('legado de carga perigosa (sem item classificado) mostra "Descartar classificação do processo"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'FCL',
        dangerousGoods: true,
        unNumber: '1203',
        imoClass: '3',
        items: [],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    expect(
      screen.getByRole('button', { name: 'Descartar classificação do processo' })
    ).toBeInTheDocument()
  })

  it('número de contêiner com dígito verificador invalido mostra o aviso', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'FCL',
        containers: [{ id: 'CNT-1', number: 'TGHU1234560', seal: '', type: '' }],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    expect(
      screen.getByText('Dígito verificador não confere (esperado: 7).')
    ).toBeInTheDocument()
  })

  // F17.2d-1 (D-4, Q4): carga perigosa passou a ser classificada POR ITEM
  // (no passo Itens, nao mais em Carga).
  it('item com dangerousGoods marcado mostra "Número ONU" e "Classe IMO" no passo Itens', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        items: [{ id: 'i1', commercialName: 'Resina', quantity: 10, dangerousGoods: true }],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    expect(screen.getByText('Número ONU')).toBeInTheDocument()
    expect(screen.getByText('Classe IMO')).toBeInTheDocument()
  })

  it('checkbox "Carga perigosa (IMO)" do item dispara onItemChange(id, "dangerousGoods", true)', async () => {
    const user = userEvent.setup()
    const onItemChange = vi.fn()
    renderForm({
      draft: makeDraft({ items: [{ id: 'i1', commercialName: 'Resina', quantity: 10 }] }),
      onItemChange,
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Itens' }))
    await user.click(screen.getByRole('checkbox', { name: 'Carga perigosa (IMO)' }))
    expect(onItemChange).toHaveBeenCalledWith('i1', 'dangerousGoods', true)
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

  it('passo "Chegada e liberação" mostra Chegada/Atracação quando canShowMaritimeFlow', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true })
    expect(screen.getByText(/Passo 1 de 6/)).toBeInTheDocument()
    await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
    expect(screen.getByText('Chegada')).toBeInTheDocument()
    expect(screen.getByText('Atracação (data e hora)')).toBeInTheDocument()
  })

  it('create sempre tem 6 passos, com os 6 rótulos fixos (D1)', () => {
    renderForm()
    expect(screen.getByText(/Passo 1 de 6/)).toBeInTheDocument()
    const labels = ['Identificação', 'Embarque', 'Carga', 'Chegada e liberação', 'Coleta', 'Itens']
    labels.forEach((label) => {
      expect(within(stepsRow()).getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
    })
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

  // F17.2b (D-5): a anuencia MAPA saiu do passo de fluxo (agora vive em
  // "Chegada e liberação", via `LicensesEditor`).
  it('edit marítimo NÃO tem mais "MAPA" no passo "Chegada e liberação"', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
    expect(screen.queryByText('MAPA')).not.toBeInTheDocument()
  })

  it.each([['FCL'], ['AEREO']])(
    '"Chegada e liberação" tem "Adicionar anuência" em create %s',
    async (category) => {
      const user = userEvent.setup()
      renderForm({ draft: makeDraft({ category }) })
      await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
      expect(screen.getByRole('button', { name: 'Adicionar anuência' })).toBeInTheDocument()
    }
  )

  it('coleta agendada mostra "Transportadora" no passo Coleta e dispara onDraftChange', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ collectionStatus: 'Coleta Agendada' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Coleta' }))
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Transportadora'), 'X')
    expect(onDraftChange).toHaveBeenCalledWith('carrierName', expect.any(String))
  })

  it('sem coleta agendada NÃO mostra "Transportadora" no passo Coleta', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ collectionStatus: '' }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Coleta' }))
    expect(screen.queryByText('Transportadora')).not.toBeInTheDocument()
  })
})

// F17.3a (D-11): "Chegada" com data - substitui os checkboxes "Atracou?"/
// "Chegou?" (D-10). UX-6b-1: vive no passo "Chegada e liberação".
describe('ProcessForm — ProcessArrivalFields (F17.3a)', () => {
  async function openArrivalStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
  }

  it('AEREO mostra "Chegada (data e hora)"', async () => {
    const user = userEvent.setup()
    renderForm({ canShowAirFlow: true, draft: makeDraft({ category: 'AEREO' }) })
    await openArrivalStep(user)
    expect(screen.getByText('Chegada (data e hora)')).toBeInTheDocument()
  })

  it('sem sinal de chegada NAO mostra "Presença de carga (data e hora)"', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: false }),
    })
    await openArrivalStep(user)
    expect(screen.queryByText('Presença de carga (data e hora)')).not.toBeInTheDocument()
  })

  it('com sinal de chegada (berthed) mostra "Presença de carga (data e hora)"', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: true }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Presença de carga (data e hora)')).toBeInTheDocument()
  })

  it('FCL mostra "Free time (dias)" no passo "Chegada e liberação"', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true, draft: makeDraft({ category: 'FCL' }) })
    await openArrivalStep(user)
    expect(screen.getByText('Free time (dias)')).toBeInTheDocument()
  })

  it('LCL NAO mostra "Free time (dias)" no passo "Chegada e liberação"', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true, draft: makeDraft({ category: 'LCL' }) })
    await openArrivalStep(user)
    expect(screen.queryByText('Free time (dias)')).not.toBeInTheDocument()
  })

  it('hint de data aproximada aparece com migratedApproxFields: ["berthedAt"]', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: true, migratedApproxFields: ['berthedAt'] }),
    })
    await openArrivalStep(user)
    expect(
      screen.getByText('Data aproximada (migrada do ETA) — confirme a data real.')
    ).toBeInTheDocument()
  })

  it('digitar a data de atracação dispara onDraftChange("berthedAt", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL' }),
    })
    await openArrivalStep(user)
    const dateInput = document.querySelector('input[type="datetime-local"]')
    await user.type(dateInput, '2026-09-20T10:00')
    expect(onDraftChange).toHaveBeenCalledWith('berthedAt', expect.any(String))
  })
})

// F17.0 bugs 2 e 3: precedencia de operador em `canUsePostCollectionStatuses`
// (bug com janela libera pos-coleta mesmo sem status "retentor") e MAPA vazio
// bloqueando o select de Coleta em maritimo. UX-6b-1: o select/leitura de
// Coleta vive no passo "Coleta".
describe('ProcessForm — bugs 2 e 3 (passo Coleta)', () => {
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

  async function openCollectionStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Coleta' }))
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
    await openCollectionStep(user)
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
    await openCollectionStep(user)
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
    await openCollectionStep(user)
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
    await openCollectionStep(user)
    expect(screen.getByText('Coleta', { selector: 'span' })).toBeInTheDocument()
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
    await openCollectionStep(user)
    expect(screen.queryByText('Coleta', { selector: 'span' })).not.toBeInTheDocument()
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
    await openCollectionStep(user)
    expect(screen.queryByText('Coleta', { selector: 'span' })).not.toBeInTheDocument()
  })
})

// F17.4b (B-7, D6): devolucao de vazio - so' admin, so' FCL/CONSOLIDADO
// apos "Carga recebida" (derivado por `collectionStatus` pos-recebimento).
// UX-6b-1: vive no passo "Coleta".
describe('ProcessForm — EmptyReturnFields (F17.4b)', () => {
  function receivedDraft(overrides = {}) {
    return makeDraft({
      category: 'FCL',
      berthed: true,
      cargoPresenceInformed: true,
      duimpStatus: 'Parametrizada',
      parameterizationChannel: 'Verde',
      collectionStatus: 'Carga disponível em estoque',
      containers: [
        { id: 'CNT-1', number: 'CSQU3054383', seal: 'L1', type: '40DC', returnedAt: '' },
        { id: 'CNT-2', number: 'MSCU1234566', seal: 'L2', type: '40DC', returnedAt: '' },
      ],
      ...overrides,
    })
  }

  async function openCollectionStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Coleta' }))
  }

  it('FCL com 2 conteineres e "Carga recebida" mostra "Devolução do vazio" com 2 inputs de data', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: receivedDraft(),
    })
    await openCollectionStep(user)

    expect(screen.getByText('Devolução do vazio')).toBeInTheDocument()
    expect(screen.getByLabelText('CSQU3054383')).toBeInTheDocument()
    expect(screen.getByLabelText('MSCU1234566')).toBeInTheDocument()
  })

  it('editar a data chama onDraftChange("containers", [...]) so no conteiner editado', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: receivedDraft(),
    })
    await openCollectionStep(user)

    const input = screen.getByLabelText('MSCU1234566')
    await user.type(input, '2026-09-10')

    expect(onDraftChange).toHaveBeenCalled()
    const lastCall = onDraftChange.mock.calls.find((call) => call[0] === 'containers')
    expect(lastCall).toBeTruthy()
    const nextContainers = lastCall[1]
    expect(nextContainers.find((c) => c.id === 'CNT-1').returnedAt).toBe('')
    expect(nextContainers.find((c) => c.id === 'CNT-2').returnedAt).not.toBe('')
  })

  it('LCL nunca mostra "Devolução do vazio"', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: receivedDraft({ category: 'LCL', containers: [] }),
    })
    await openCollectionStep(user)

    expect(screen.queryByText('Devolução do vazio')).not.toBeInTheDocument()
  })

  it('FCL em "Coleta Agendada" (nao recebido) -> sem o bloco', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: receivedDraft({ collectionStatus: 'Coleta Agendada' }),
    })
    await openCollectionStep(user)

    expect(screen.queryByText('Devolução do vazio')).not.toBeInTheDocument()
  })
})

// F17.2b (D-5): editor de anuencias, agora no passo "Chegada e liberação".
describe('ProcessForm — LicensesEditor (F17.2b)', () => {
  async function openArrivalStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
  }

  it('status "Vistoria agendada" mostra "Vistoria agendada para"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Vistoria agendada', inspectionScheduledAt: '' }],
      }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Vistoria agendada para')).toBeInTheDocument()
  })

  it('status "Indeferida" mostra o badge "Indeferida"', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Indeferida' }],
      }),
    })
    await openArrivalStep(user)
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
    await openArrivalStep(user)
    expect(screen.getByRole('button', { name: 'Adicionar anuência' })).toBeDisabled()
  })
})

// F17.2a (D-3): status derivado read-only - o badge vive no cabeçalho do
// wizard (D5), sempre visível (nao depende de nenhum passo aberto).
describe('ProcessForm — status derivado (F17.2a D-3 / UX-6b-1 D5)', () => {
  it('NÃO existe mais o select de etapa pré-chegada nem o hint do card removido', () => {
    renderForm({
      draft: makeDraft({ category: 'FCL', berthed: false, processStatus: 'Aguardando Embarque' }),
    })
    expect(
      screen.queryByText('Etapa pré-chegada (manual até o registro da data de embarque)')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Marque "Embarque confirmado" no passo/)
    ).not.toBeInTheDocument()
  })

  it('com berthed:true o badge do cabeçalho mostra "Atracação confirmada"', () => {
    renderForm({
      draft: makeDraft({ category: 'FCL', berthed: true, processStatus: 'Aguardando Embarque' }),
    })
    expect(screen.getByText('Atracação confirmada')).toBeInTheDocument()
  })
})

// F17.2c/F17.2d-2 (D-7/D-8/D-11): PurchaseOrdersEditor no passo Identificação
// (agora com Referência/Fornecedor por PO), PO por item no passo Itens
// (CONSOLIDADO), e 1 row de janela por contêiner (FCL/CONSOLIDADO com
// containers[]) no passo Coleta.
describe('ProcessForm — purchaseOrders/janelas por container (F17.2c/F17.2d-2)', () => {
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

  async function openCollectionStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Coleta' }))
  }

  it('CONSOLIDADO mostra "Adicionar PO" e adicionar dispara onDraftChange("purchaseOrders", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    await user.type(screen.getByPlaceholderText('Ex.: PO-12345'), 'PO-A')
    await user.click(screen.getByRole('button', { name: 'Adicionar PO' }))
    expect(onDraftChange).toHaveBeenCalledWith('purchaseOrders', [
      { po: 'PO-A', reference: '', supplierName: '' },
    ])
  })

  it('Enter no input "Nova PO" emite o mesmo sem clicar', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    await user.type(screen.getByPlaceholderText('Ex.: PO-12345'), 'PO-A{Enter}')
    expect(onDraftChange).toHaveBeenCalledWith('purchaseOrders', [
      { po: 'PO-A', reference: '', supplierName: '' },
    ])
  })

  it('Enter no campo "Fornecedor" tambem adiciona a PO', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    await user.type(screen.getByPlaceholderText('Ex.: PO-12345'), 'PO-A')
    const supplierInputs = screen.getAllByLabelText('Fornecedor')
    await user.type(supplierInputs[0], 'ACME{Enter}')
    expect(onDraftChange).toHaveBeenCalledWith('purchaseOrders', [
      { po: 'PO-A', reference: '', supplierName: 'ACME' },
    ])
  })

  it('editar Referência de PO existente emite o objeto atualizado', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: '' }],
      }),
    })
    const referenceInputs = screen.getAllByLabelText('Referência')
    // [0] e' o campo de adicao; [1] e' o da PO ja cadastrada.
    await user.type(referenceInputs[1], 'R')
    expect(onDraftChange).toHaveBeenCalledWith('purchaseOrders', [
      { po: 'PO-A', reference: 'R', supplierName: '' },
    ])
  })

  it('passo Itens do CONSOLIDADO mostra o select "PO" com as POs cadastradas (objetos)', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        purchaseOrders: [
          { po: 'PO-A', reference: '', supplierName: '' },
          { po: 'PO-B', reference: '', supplierName: '' },
        ],
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

  it('CONSOLIDADO NAO mostra o input "Fornecedor" de nivel-processo no passo Identificação (Q1)', async () => {
    renderForm({ draft: makeDraft({ category: 'CONSOLIDADO' }) })
    // "Fornecedor" so' aparece dentro do PurchaseOrdersEditor (rotulo do
    // proprio editor); nao ha input de fornecedor de nivel-processo.
    expect(screen.queryByDisplayValue('Fornecedor Atlas')).not.toBeInTheDocument()
  })

  it('FCL mostra o input "Fornecedor" de nivel-processo', () => {
    renderForm({ draft: makeDraft({ category: 'FCL', supplierName: 'Fornecedor Atlas' }) })
    expect(screen.getByDisplayValue('Fornecedor Atlas')).toBeInTheDocument()
  })

  it('FCL com 2 containers + "Coleta Agendada" mostra 2 rows (uma por contêiner), sem botoes/select de contêiner', async () => {
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
    await openCollectionStep(user)
    expect(screen.getByText('CSQU3054383')).toBeInTheDocument()
    expect(screen.getByText('MSCU1234566')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar container' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar primeira janela' })).not.toBeInTheDocument()
    expect(screen.queryByText('Contêiner')).not.toBeInTheDocument()
  })

  it('janela orfa (containerId de contêiner removido) mostra "Contêiner removido" + botão "Remover"', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      draft: maritimeReadyDraft({
        collectionStatus: 'Coleta Agendada',
        containers: [{ id: 'CNT-1', number: 'CSQU3054383' }],
        collectionWindows: [
          { id: 'W1', containerId: 'CNT-REMOVIDO', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00' },
        ],
      }),
    })
    await openCollectionStep(user)
    expect(screen.getByText('Contêiner removido')).toBeInTheDocument()
    expect(
      screen.queryByText('Contêiner removido do processo — selecione outro contêiner para esta janela.')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument()
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
    await openCollectionStep(user)
    expect(screen.queryByText('Contêiner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar janela' })).toBeDisabled()
  })

  it('conteiner com janela agendada tem "Remover" desabilitado + hint; sem janela fica habilitado', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'FCL',
        containers: [
          { id: 'CNT-1', number: 'CSQU3054383', seal: '', type: '' },
          { id: 'CNT-2', number: 'MSCU1234566', seal: '', type: '' },
        ],
        collectionWindows: [
          { id: 'W1', containerId: 'CNT-1', containerNumber: 1, scheduledAt: '2026-07-08T10:00:00' },
        ],
      }),
    })
    await user.click(within(stepsRow()).getByRole('button', { name: 'Carga' }))
    const removeButtons = screen.getAllByRole('button', { name: 'Remover' })
    expect(removeButtons[0]).toBeDisabled()
    expect(removeButtons[1]).not.toBeDisabled()
    expect(screen.getByText('Contêiner com coleta agendada — só pode ser editado.')).toBeInTheDocument()
  })
})

// F17.3b (D-11): ProcessCustomsFields reescrito - select manual "DUIMP" sai,
// status derivado das datas. Vive no passo "Chegada e liberação".
describe('ProcessForm — ProcessCustomsFields (F17.3b)', () => {
  async function openArrivalStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: 'Chegada e liberação' }))
  }

  it('com presenca aparece Nº da DUIMP e Registro da DUIMP, e NAO aparece o combobox "DUIMP"', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: true, cargoPresenceInformed: true }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Nº da DUIMP')).toBeInTheDocument()
    expect(screen.getByText('Registro da DUIMP (data e hora)')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'DUIMP' })).not.toBeInTheDocument()
  })

  it('Parametrização (data e hora) so aparece com sinal de registro', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: true, cargoPresenceInformed: true }),
    })
    await openArrivalStep(user)
    expect(screen.queryByText('Parametrização (data e hora)')).not.toBeInTheDocument()
  })

  it('Parametrização (data e hora) aparece com registro preenchido', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        duimpRegisteredAt: '2026-09-20T10:00',
      }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Parametrização (data e hora)')).toBeInTheDocument()
  })

  it('Canal da parametrização NAO aparece so com registro (sem parametrizacao)', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        duimpRegisteredAt: '2026-09-20T10:00',
      }),
    })
    await openArrivalStep(user)
    expect(screen.queryByText('Canal da parametrização')).not.toBeInTheDocument()
  })

  it('Canal da parametrização aparece com parametrizacao', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
      }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Canal da parametrização')).toBeInTheDocument()
  })

  it('Amarelo mostra Conferência agendada para e checkbox Exigência?', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Amarelo',
      }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Conferência agendada para')).toBeInTheDocument()
    expect(screen.getByText('Exigência?')).toBeInTheDocument()
  })

  it('Cinza mostra Procedimento especial (canal Cinza)', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Cinza',
      }),
    })
    await openArrivalStep(user)
    expect(screen.getByText('Procedimento especial (canal Cinza)')).toBeInTheDocument()
  })

  it('Verde nao mostra Exigência?', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Verde',
      }),
    })
    await openArrivalStep(user)
    expect(screen.queryByText('Exigência?')).not.toBeInTheDocument()
  })

  it('legado Parametrizada sem data mostra o hint "DUIMP parametrizada sem data (registro antigo)"', async () => {
    const user = userEvent.setup()
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({
        category: 'FCL',
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Parametrizada',
      }),
    })
    await openArrivalStep(user)
    expect(
      screen.getByText('DUIMP parametrizada sem data (registro antigo) — informe a data e hora.')
    ).toBeInTheDocument()
  })

  it('digitar em Registro da DUIMP chama onDraftChange("duimpRegisteredAt", ...)', async () => {
    const user = userEvent.setup()
    const { onDraftChange } = renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', berthed: true, cargoPresenceInformed: true }),
    })
    await openArrivalStep(user)
    const label = screen.getByText('Registro da DUIMP (data e hora)').closest('label')
    const input = within(label).getByDisplayValue('')
    await user.type(input, '2026-09-20T10:00')
    expect(onDraftChange).toHaveBeenCalledWith('duimpRegisteredAt', expect.any(String))
  })
})

// UX-3b: validacao inline (erros + avisos + navegacao/foco via focusRequest).
describe('ProcessForm — validacao inline (UX-3b)', () => {
  async function openIdentStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /Identificação/ }))
  }
  async function openShipmentStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /^Embarque/ }))
  }
  async function openCargoStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /^Carga/ }))
  }
  async function openArrivalStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /Chegada e liberação/ }))
  }
  async function openCollectionStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /^Coleta/ }))
  }
  async function openItemsStep(user) {
    await user.click(within(stepsRow()).getByRole('button', { name: /Itens/ }))
  }

  it('anuencias: teto (11) mostra erro no grupo; data invalida na anuencia "Vistoria agendada" mostra erro no campo', async () => {
    const user = userEvent.setup()
    const licenses = Array.from({ length: 11 }, (_, index) => ({
      id: `LIC-${index + 1}`,
      agency: 'MAPA',
      status: 'Aguardando registro',
    }))
    licenses[0] = { ...licenses[0], status: 'Vistoria agendada', inspectionScheduledAt: '1999-01-01' }
    renderForm({
      fieldErrors: {
        licenses: 'Máximo de 10 anuências por processo (atual: 11). Remova 1.',
        'licenses.LIC-1.inspectionScheduledAt': 'Data inválida: informe um ano entre 2000 e 2100.',
      },
      draft: makeDraft({ licenses }),
    })
    await openArrivalStep(user)

    const group = document.getElementById('process-field-licenses')
    expect(group).toHaveAttribute('aria-describedby', 'process-field-licenses-error')
    expect(group).toHaveAccessibleDescription(/Máximo de 10/)

    const inspectionInput = document.getElementById('process-field-licenses-LIC-1-inspectionScheduledAt')
    expect(inspectionInput).toHaveAttribute('aria-invalid', 'true')
    expect(inspectionInput).toHaveAccessibleDescription(/entre 2000 e 2100/)
  })

  it('POs: teto (51, CONSOLIDADO) mostra erro no grupo', async () => {
    const user = userEvent.setup()
    const purchaseOrders = Array.from({ length: 51 }, (_, index) => ({
      po: `PO-${index + 1}`,
      reference: '',
      supplierName: '',
    }))
    renderForm({
      fieldErrors: { purchaseOrders: 'Máximo de 50 POs por processo (atual: 51). Remova 1.' },
      draft: makeDraft({ category: 'CONSOLIDADO', purchaseOrders }),
    })
    await openIdentStep(user)

    const group = document.getElementById('process-field-purchaseOrders')
    expect(group).toHaveAccessibleDescription(/Máximo de 50/)
  })

  it('transbordo: ETD do transbordo invalido mostra aria-invalid/descricao', async () => {
    const user = userEvent.setup()
    renderForm({
      fieldErrors: { transshipmentEtd: 'Data inválida: informe um ano entre 2000 e 2100.' },
      draft: makeDraft({ transshipment: true, transshipmentEtd: '1999-01-01' }),
    })
    await openShipmentStep(user)

    const input = document.getElementById('process-field-transshipmentEtd')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/entre 2000 e 2100/)
  })

  it('free time (edit FCL, canShowMaritimeFlow): freeTimeDays invalido mostra aria-invalid/descricao', async () => {
    const user = userEvent.setup()
    renderForm({
      viewMode: 'edit',
      canShowMaritimeFlow: true,
      fieldErrors: { freeTimeDays: 'Informe um número inteiro maior ou igual a zero.' },
      draft: makeDraft({ category: 'FCL', freeTimeDays: '-1' }),
    })
    await openArrivalStep(user)

    const input = document.getElementById('process-field-freeTimeDays')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/número inteiro/)
  })

  it('nome acessivel do campo NAO contem o texto do erro (aria-hidden no <small>)', async () => {
    const user = userEvent.setup()
    renderForm({
      fieldErrors: { eta: 'Data inválida: informe um ano entre 2000 e 2100.' },
    })
    await user.click(screen.getByRole('button', { name: 'Avançar' }))

    const etaInput = document.getElementById('process-field-eta')
    expect(etaInput).toHaveAccessibleName('ETA')
  })

  it('avisos NAO bloqueantes (ISO 6346, ONU, "mínimo 2" das POs) ganham aria-describedby sem aria-invalid', async () => {
    const user = userEvent.setup()
    renderForm({
      draft: makeDraft({
        category: 'CONSOLIDADO',
        containers: [{ id: 'CNT-1', number: 'ABC', seal: '', type: '', returnedAt: '' }],
        items: [{ id: 'ITEM-1', commercialName: 'X', quantity: 1, dangerousGoods: true, unNumber: '12' }],
      }),
    })

    // hint "mínimo 2" das POs (passo Identificação, CONSOLIDADO)
    await openIdentStep(user)
    const poInput = screen.getByPlaceholderText('Ex.: PO-12345')
    expect(poInput).toHaveAccessibleDescription(/mínimo 2/)
    expect(poInput).not.toHaveAttribute('aria-invalid')

    // aviso ISO 6346 (passo Carga, FCL/CONSOLIDADO)
    await openCargoStep(user)
    const containerNumberInput = screen.getByPlaceholderText('Ex.: CSQU3054383')
    expect(containerNumberInput).toHaveAccessibleDescription(/ISO 6346/)
    expect(containerNumberInput).not.toHaveAttribute('aria-invalid')

    // aviso ONU (passo Itens)
    await openItemsStep(user)
    const unNumberInput = screen.getByPlaceholderText('Ex.: 1203')
    expect(unNumberInput).toHaveAccessibleDescription(/4 dígitos/)
    expect(unNumberInput).not.toHaveAttribute('aria-invalid')
  })

  it('chip do passo com erro tem nome acessivel "…, contém erro"', () => {
    renderForm({ fieldErrors: { eta: 'erro' } })
    expect(
      within(stepsRow()).getByRole('button', { name: 'Embarque, contém erro' })
    ).toBeInTheDocument()
  })

  it('focusRequest com key do passo "Carga" troca o passo e foca o campo', () => {
    renderForm({
      fieldErrors: { volumeM3: 'Informe um número maior ou igual a zero.' },
      focusRequest: { key: 'volumeM3', nonce: 1 },
    })
    expect(screen.getByText(/Passo 3 de 6/)).toBeInTheDocument()
    expect(document.activeElement).toBe(document.getElementById('process-field-volumeM3'))
  })

  // UX-6b-1: os 6 passos sao sempre fixos - um campo pode nao RENDERIZAR
  // (ex.: berthedAt sem canShowMaritimeFlow/AirFlow), mas o passo continua
  // existindo. O foco cai no resumo porque o elemento do campo nao existe.
  it('focusRequest com campo nao renderizado no passo alvo foca o resumo', () => {
    renderForm({
      canShowMaritimeFlow: false,
      canShowAirFlow: false,
      fieldErrors: { berthedAt: 'Data inválida: informe um ano entre 2000 e 2100.' },
      focusRequest: { key: 'berthedAt', nonce: 1 },
    })
    expect(document.activeElement).toBe(document.getElementById('process-form-error-summary'))
  })

  // (i) UX-6b-1 D1: ordem exata dos 6 rotulos.
  it('ordem dos rotulos dos chips e exatamente a dos 6 passos fixos', () => {
    renderForm()
    const buttons = within(stepsRow()).getAllByRole('button')
    const labels = buttons.map((button) => button.textContent.replace(/^\d+/, '').replace('✓', ''))
    expect(labels).toEqual([
      'Identificação',
      'Embarque',
      'Carga',
      'Chegada e liberação',
      'Coleta',
      'Itens',
    ])
  })

  // (ii) "Embarque confirmado" e ETD no mesmo passo.
  it('"Embarque confirmado" e o ETD ficam no mesmo passo (Embarque)', async () => {
    const user = userEvent.setup()
    renderForm({ draft: makeDraft({ etd: '2026-09-18' }) })
    await openShipmentStep(user)
    expect(screen.getByText('ETD')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Embarque confirmado' })).toBeInTheDocument()
  })

  // (iii) Previsao manual no passo "Chegada e liberação" (create e edit).
  it.each([['create'], ['edit']])(
    'previsao manual de entrega vive no passo "Chegada e liberação" em %s',
    async (viewMode) => {
      const user = userEvent.setup()
      renderForm({ viewMode, draft: makeDraft({ eta: '2026-09-20' }) })
      await openArrivalStep(user)
      expect(screen.getByText('Previsão manual de entrega no armazém')).toBeInTheDocument()
      expect(screen.getByText(/previsão automática \(/)).toBeInTheDocument()
    }
  )

  // (iv) "Agente de carga" no passo Embarque, ausente em Identificação.
  it('"Agente de carga" fica no passo Embarque, ausente em Identificação', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByText('Agente de carga')).not.toBeInTheDocument()
    await openShipmentStep(user)
    expect(screen.getByText('Agente de carga')).toBeInTheDocument()
  })

  // (v) "Quantidade de pallets" no passo Carga.
  it('"Quantidade de pallets" fica no passo Carga', async () => {
    const user = userEvent.setup()
    renderForm()
    await openCargoStep(user)
    expect(screen.getByText('Quantidade de pallets')).toBeInTheDocument()
  })

  // (vi) D3: hint corrigido do Free time.
  it('hint do Free time menciona "presença de carga" (correção factual D3)', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true, draft: makeDraft({ category: 'FCL' }) })
    await openArrivalStep(user)
    expect(screen.getByText('O prazo conta a partir da presença de carga.')).toBeInTheDocument()
  })

  // (vii) Passo Coleta vazio mostra a nota do D1.
  it('passo Coleta sem conteudo mostra a nota "aparecem aqui depois da liberação"', async () => {
    const user = userEvent.setup()
    renderForm()
    await openCollectionStep(user)
    expect(
      screen.getByText('Os dados de coleta aparecem aqui depois da liberação da carga.')
    ).toBeInTheDocument()
  })

  // (viii) focusRequest com licenses.* e warehouseDeliveryDateOverride
  // navega para "Chegada e liberação" (D1 STEP_ORDER: licenses/
  // warehouseDeliveryDateOverride -> 'arrival').
  it.each([
    ['licenses.LIC-1.deferredAt'],
    ['warehouseDeliveryDateOverride'],
  ])('focusRequest com key "%s" navega ao passo "Chegada e liberação"', (key) => {
    renderForm({
      canShowMaritimeFlow: true,
      draft: makeDraft({ category: 'FCL', licenses: [{ id: 'LIC-1', agency: 'MAPA', status: 'Deferida', deferredAt: '1999-01-01' }] }),
      fieldErrors: { [key]: 'erro' },
      focusRequest: { key, nonce: 1 },
    })
    expect(
      within(stepsRow()).getByRole('button', { name: /Chegada e liberação/ })
    ).toHaveAttribute('aria-current', 'step')
  })

  // (ix) UX-6b-1 D8: rolagem do stepper ate o chip ativo.
  it('rola o stepper ate o chip ativo quando a row tem overflow', async () => {
    const user = userEvent.setup()
    renderForm()
    const row = stepsRow()
    const buttons = within(row).getAllByRole('button')

    Object.defineProperty(row, 'scrollWidth', { value: 900, configurable: true })
    Object.defineProperty(row, 'clientWidth', { value: 300, configurable: true })
    row.scrollLeft = 0

    const target = buttons[1]
    Object.defineProperty(target, 'offsetLeft', { value: 200, configurable: true })
    Object.defineProperty(target, 'offsetWidth', { value: 80, configurable: true })

    await user.click(screen.getByRole('button', { name: 'Avançar' }))

    expect(row.scrollLeft).toBe(200 - (300 - 80) / 2)
  })

  it('nao mexe no scrollLeft quando a row nao tem overflow (scrollWidth <= clientWidth)', async () => {
    const user = userEvent.setup()
    renderForm()
    const row = stepsRow()

    Object.defineProperty(row, 'scrollWidth', { value: 300, configurable: true })
    Object.defineProperty(row, 'clientWidth', { value: 300, configurable: true })
    row.scrollLeft = 42

    await user.click(screen.getByRole('button', { name: 'Avançar' }))

    expect(row.scrollLeft).toBe(42)
  })

  // (x) D6: nome acessivel "Voltar para lista", texto visivel "Voltar".
  it('"Voltar para lista" tem nome acessivel completo e texto visivel "Voltar"', () => {
    renderForm()
    const backButton = screen.getByRole('button', { name: 'Voltar para lista' })
    expect(backButton).toBeInTheDocument()
    expect(backButton).toHaveTextContent('Voltar')
  })
})
