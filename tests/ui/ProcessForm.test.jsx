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
    mapaStatus: '',
    mapaInspectionScheduledAt: '',
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
    mapaStatusOptions: ['Deferido'],
    processCategoryOptions: ['FCL', 'LCL', 'AEREO', 'CONSOLIDADO'],
    processStatusOptions: ['Em andamento', 'Finalizado'],
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

const stepsRow = () => screen.getByRole('tablist')

describe('ProcessForm — wizard de etapas (C11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre no passo 1 (Identificação) de 4 (sem fluxo em create FCL)', () => {
    renderForm()
    expect(screen.getByText(/Passo 1 de 4/)).toBeInTheDocument()
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
    expect(screen.getByText(/Passo 2 de 4/)).toBeInTheDocument()
    // ETD/ETA são exclusivos do passo de datas
    expect(screen.getByText('ETD')).toBeInTheDocument()
    expect(screen.getByText('ETA')).toBeInTheDocument()
    // Voltar agora habilitado
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled()
  })

  it('chip de passo pula direto (Itens) sem passar pelos intermediários', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(within(stepsRow()).getByRole('tab', { name: 'Itens' }))
    expect(screen.getByText(/Passo 4 de 4/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeInTheDocument()
    // No último passo, "Avançar" some
    expect(screen.queryByRole('button', { name: 'Avançar' })).not.toBeInTheDocument()
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

  it('inclui o passo "Fluxo operacional" quando canShowMaritimeFlow (5 passos)', async () => {
    const user = userEvent.setup()
    renderForm({ canShowMaritimeFlow: true })
    expect(screen.getByText(/Passo 1 de 5/)).toBeInTheDocument()
    await user.click(within(stepsRow()).getByRole('tab', { name: 'Fluxo operacional' }))
    expect(screen.getByText('Pós-atracação')).toBeInTheDocument()
    expect(screen.getByText('Atracou?')).toBeInTheDocument()
  })

  it('NÃO inclui o passo de fluxo em create sem maritime/air (4 passos)', () => {
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

  it('edit marítimo inclui fluxo mesmo sem canShowMaritimeFlow (passo MAPA)', async () => {
    const user = userEvent.setup()
    renderForm({ viewMode: 'edit', draft: makeDraft({ category: 'FCL' }) })
    const flowTab = within(stepsRow()).getByRole('tab', { name: 'Fluxo operacional' })
    await user.click(flowTab)
    expect(screen.getByText('MAPA')).toBeInTheDocument()
  })
})
