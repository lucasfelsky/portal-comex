// Campo TRANSPORTADORA (PLAN.md — campo transportadora no fluxo de coleta):
// card de LEITURA (sem <input>/<textarea>) na aba "Processo" do detalhe,
// visível a partir de "Coleta Agendada" (inclusive) em diante — usa
// `isCollectionScheduledOrBeyondStatus` (módulo REAL, sem mock).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProcessDetailView from '../../src/features/processes/ProcessDetailView'

const identRow = (pattern) => (_content, element) =>
  Boolean(element?.classList?.contains('detail-ident__row')) &&
  (typeof pattern === 'string' ? element.textContent === pattern : pattern.test(element.textContent))

const mockListProcessEvents = vi.fn().mockResolvedValue([])
vi.mock('../../src/services/processEventsRepository', () => ({
  listProcessEvents: (...args) => mockListProcessEvents(...args),
}))

// F18a: defensivo - ProcessDetailView agora renderiza ProcessDocumentsPanel
// na aba "Documentos" (autocarregado, mesmo padrao de processEventsRepository).
vi.mock('../../src/services/processDocumentsRepository', () => ({
  listProcessDocuments: vi.fn().mockResolvedValue([]),
  uploadProcessDocument: vi.fn(),
  deleteProcessDocument: vi.fn(),
  downloadProcessDocumentBlob: vi.fn(),
  saveBlobAsFile: vi.fn(),
  setInvoicePackingListLink: vi.fn(),
}))

function makeProcess(overrides = {}) {
  return {
    id: 'p-1',
    name: 'Processo teste',
    category: 'FCL',
    processNumber: 'PO-1',
    destination: 'Itajaí',
    etd: '',
    eta: '',
    etaOriginal: '',
    processStatus: 'Aguardando Embarque',
    containerQuantity: 1,
    palletQuantity: 0,
    processNotes: '',
    carrierName: '',
    warehouseDeliveryDateOverride: '',
    postReceiptNotes: '',
    postReceiptImages: [],
    cargoReceivedAt: '',
    items: [],
    berthed: false,
    arrived: false,
    cargoPresenceInformed: false,
    duimpStatus: '',
    parameterizationChannel: '',
    collectionStatus: '',
    collectionWindows: [],
    collectionScheduledAt: '',
    licenses: [],
    dtaStatus: '',
    dtaLoadingScheduledAt: '',
    dtaArrivalAtItajai: '',
    // F17.3a (D-1): chegada com data, CE/terminal, free time, presenca.
    berthedAt: '',
    arrivedAt: '',
    cargoPresenceInformedAt: '',
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: null,
    demurrageDailyRateUsd: null,
    migratedApproxFields: [],
    ...overrides,
  }
}

function renderDetail(props = {}) {
  const defaultProps = {
    selectedProcess: makeProcess(),
    detailTab: 'process',
    isAdmin: false,
    isSaving: false,
    favoriteProcessIds: [],
    canEditPostReceiptNotes: false,
    canEditSelectedCollectionStatus: false,
    itemSearchTerm: '',
    selectedItemName: '',
    processMessages: [],
    isLoadingMessages: false,
    messageDraft: '',
    deletingMessageId: '',
    isSendingMessage: false,
    messageLimitReached: false,
    remainingMessages: 0,
    hasUnlimitedMessages: false,
    visibleProcessItems: [],
    relatedActiveProcesses: [],
    selectedProcessPostReceiptImages: [],
    profile: { name: 'Teste' },
    itemsSectionRef: { current: null },
    onDetailTabChange: vi.fn(),
    onSetItemSearchTerm: vi.fn(),
    onMessageDraftChange: vi.fn(),
    onOpenRelatedItemTab: vi.fn(),
    onOpenProcessDetail: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSetViewModeList: vi.fn(),
    onEditMode: vi.fn(),
    onPostReceiptEditMode: vi.fn(),
    onCollectionStatusEditMode: vi.fn(),
    onOpenPostReceiptGallery: vi.fn(),
    onDeleteProcess: vi.fn(),
    onSendMessage: vi.fn(),
    onDeleteMessage: vi.fn(),
  }
  return render(<ProcessDetailView {...defaultProps} {...props} />)
}

// UX-6b-3 (passo 6): rotulos viraram `dt` (sem ":") dentro de `DetailRow`.
function getDefinition(label) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling
}

describe('ProcessDetailView — Rastrear navio', () => {
  it('FCL com nome + IMO abre modal com iframe e links externos', async () => {
    const user = userEvent.setup()
    renderDetail({
      selectedProcess: makeProcess({ category: 'FCL', vesselName: 'EVER BLOOM', vesselImo: '9787027' }),
    })
    await user.click(screen.getByRole('button', { name: 'Rastrear navio' }))
    const dialog = screen.getByRole('dialog')
    const iframe = dialog.querySelector('iframe')
    expect(iframe.getAttribute('src')).toContain('imo=9787027')
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    const vf = within(dialog).getByRole('link', { name: 'Abrir no VesselFinder' })
    expect(vf).toHaveAttribute('href', 'https://www.vesselfinder.com/vessels/details/9787027')
    expect(vf).toHaveAttribute('target', '_blank')
    expect(vf).toHaveAttribute('rel', 'noopener noreferrer')
    const mt = within(dialog).getByRole('link', { name: 'Abrir no MarineTraffic' })
    expect(mt).toHaveAttribute('href', 'https://www.marinetraffic.com/en/ais/details/ships/imo:9787027')
    expect(mt).toHaveAttribute('target', '_blank')
    expect(mt).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('LCL so com nome vira link de busca em nova aba', () => {
    renderDetail({ selectedProcess: makeProcess({ category: 'LCL', vesselName: 'EVER BLOOM' }) })
    const link = screen.getByRole('link', { name: 'Rastrear navio' })
    expect(link).toHaveAttribute(
      'href',
      `https://www.vesselfinder.com/vessels?name=${encodeURIComponent('EVER BLOOM')}`
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('AEREO nao mostra o botao', () => {
    renderDetail({ selectedProcess: makeProcess({ category: 'AEREO', flightNumber: 'LA123' }) })
    expect(screen.queryByText('Rastrear navio')).toBeNull()
  })

  it('FCL so com IMO mostra o bloco, a linha IMO e o botao', () => {
    renderDetail({ selectedProcess: makeProcess({ category: 'FCL', vesselImo: '9787027' }) })
    expect(getDefinition('IMO do navio')).toHaveTextContent('9787027')
    expect(screen.getByRole('button', { name: 'Rastrear navio' })).toBeInTheDocument()
  })

  it('FCL sem nome nem IMO nao mostra o botao', () => {
    renderDetail({ selectedProcess: makeProcess({ category: 'FCL', masterBl: 'MBL1' }) })
    expect(screen.queryByText('Rastrear navio')).toBeNull()
  })
})

describe('ProcessDetailView — card "Transportadora" (aba Processo)', () => {
  it('coleta agendada + carrierName preenchido: mostra rótulo e valor', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Coleta Agendada', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(screen.getByText('Rapido Sul')).toBeInTheDocument()
  })

  it('status posterior à coleta agendada (Carga recebida) continua mostrando o card', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Carga recebida', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(screen.getByText('Rapido Sul')).toBeInTheDocument()
  })

  it('status pré-coleta (Aguardando agendamento): card ausente', () => {
    renderDetail({
      selectedProcess: makeProcess({ collectionStatus: 'Aguardando agendamento', carrierName: 'Rapido Sul' }),
    })
    expect(screen.queryByText('Transportadora')).not.toBeInTheDocument()
  })

  it('mesmo com isAdmin true, o card é somente leitura (sem input/textarea)', () => {
    const { container } = renderDetail({
      isAdmin: true,
      selectedProcess: makeProcess({ collectionStatus: 'Coleta Agendada', carrierName: 'Rapido Sul' }),
    })
    expect(screen.getByText('Transportadora')).toBeInTheDocument()
    expect(container.querySelector('input')).not.toBeInTheDocument()
    expect(container.querySelector('textarea')).not.toBeInTheDocument()
  })
})

// F17.1a (D-E): card "Dados pendentes" na aba "Detalhes gerais", admin-only.
describe('ProcessDetailView — card "Dados pendentes" (F17.1a)', () => {
  it('admin ve o card quando ha campos faltando (etd/eta vazios no fixture)', () => {
    renderDetail({
      isAdmin: true,
      detailTab: 'general',
      selectedProcess: makeProcess(),
    })
    expect(screen.getByText('Dados pendentes')).toBeInTheDocument()
  })

  it('user/logistica (isAdmin false) NAO ve o card mesmo com campos faltando', () => {
    renderDetail({
      isAdmin: false,
      detailTab: 'general',
      selectedProcess: makeProcess(),
    })
    expect(screen.queryByText('Dados pendentes')).not.toBeInTheDocument()
  })
})

// F17.1b: aba "Histórico" — painel autocarregado via listProcessEvents.
// F18a (D6): historico e' restrito a admin/logistica (`profile.role`), nao
// mais a qualquer usuario. Deep link (`detailTab='history'`) com role sem
// acesso cai na aba "Detalhes gerais" (guard `effectiveTab`).
describe('ProcessDetailView — aba "Histórico" (F17.1b, restrita no F18a)', () => {
  it('detailTab="history" com role admin renderiza o painel e chama listProcessEvents(selectedProcess.id)', async () => {
    renderDetail({
      detailTab: 'history',
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({ id: 'p-history' }),
    })
    await waitFor(() => expect(mockListProcessEvents).toHaveBeenCalledWith('p-history'))
    expect(screen.getByText('Histórico de marcos')).toBeInTheDocument()
  })

  it('a opção/botão "Histórico" aparece para profile.role admin', () => {
    renderDetail({ isAdmin: true, profile: { name: 'Admin', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument()
  })

  it('a opção/botão "Histórico" aparece para profile.role logistica', () => {
    renderDetail({ isAdmin: false, profile: { name: 'Log', role: 'logistica' } })
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument()
  })

  it('a opção/botão "Histórico" NAO aparece para profile.role user (isAdmin false)', () => {
    renderDetail({ isAdmin: false, profile: { name: 'User', role: 'user' } })
    expect(screen.queryByRole('button', { name: 'Histórico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Documentos' })).not.toBeInTheDocument()
  })

  it('deep link detailTab="history" com role user renderiza a aba geral', () => {
    renderDetail({
      detailTab: 'history',
      profile: { name: 'User', role: 'user' },
      selectedProcess: makeProcess({ id: 'p-history' }),
    })
    expect(screen.queryByText('Histórico de marcos')).not.toBeInTheDocument()
    expect(screen.getByText('ETD / ETA')).toBeInTheDocument()
  })

  it('clicar no botão "Histórico" chama onDetailTabChange("history")', () => {
    const onDetailTabChange = vi.fn()
    renderDetail({ profile: { name: 'Admin', role: 'admin' }, onDetailTabChange })
    screen.getByRole('button', { name: 'Histórico' }).click()
    expect(onDetailTabChange).toHaveBeenCalledWith('history')
  })
})

// F18a (D9): aba "Documentos" - mesma restricao de D6.
describe('ProcessDetailView — aba "Documentos" (F18a)', () => {
  it('a opção/botão "Documentos" aparece para profile.role admin', () => {
    renderDetail({ profile: { name: 'Admin', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument()
  })

  it('detailTab="documents" com role logistica renderiza o painel', async () => {
    renderDetail({
      detailTab: 'documents',
      profile: { name: 'Log', role: 'logistica' },
      selectedProcess: makeProcess({ id: 'p-doc' }),
    })
    expect(await screen.findByText('Documentos do processo')).toBeInTheDocument()
  })

  it('deep link detailTab="documents" com role user renderiza a aba geral', () => {
    renderDetail({
      detailTab: 'documents',
      profile: { name: 'User', role: 'user' },
      selectedProcess: makeProcess({ id: 'p-doc' }),
    })
    expect(screen.queryByText('Documentos do processo')).not.toBeInTheDocument()
  })
})

// F18b-2 (E3): contador de documentos pendentes na aba/select "Documentos".
describe('ProcessDetailView — contador da aba "Documentos" (F18b-2)', () => {
  it('N=0: nome acessível continua "Documentos" (sem contador)', () => {
    renderDetail({ profile: { name: 'Admin', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument()
  })

  it('N>0: item IMO sem FISPQ no documentIndex mostra "N pendente(s)" no botao e na option', () => {
    renderDetail({
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-pend',
        items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
    })
    expect(screen.getByRole('button', { name: /Documentos.*1 pendente/s })).toBeInTheDocument()
    expect(screen.getByText('Documentos (1 pendente)')).toBeInTheDocument()
  })

  it('logistica tambem ve o contador (nao e admin-only)', () => {
    renderDetail({
      profile: { name: 'Log', role: 'logistica' },
      selectedProcess: makeProcess({
        id: 'p-pend',
        items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
    })
    expect(screen.getByRole('button', { name: /Documentos.*1 pendente/s })).toBeInTheDocument()
  })

  it('embarque confirmado + indice com processSlotKeys vazio: botao mostra 4 pendentes', () => {
    renderDetail({
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-ship',
        shippedAt: '2026-09-01',
        items: [],
        containers: [],
        documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] },
      }),
    })
    expect(screen.getByRole('button', { name: /Documentos.*4 pendentes/s })).toBeInTheDocument()
  })

  it('embarque confirmado + indice legado (sem processSlotKeys): sem contador', () => {
    renderDetail({
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-ship-legacy',
        shippedAt: '2026-09-01',
        items: [],
        containers: [],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
    })
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument()
  })

  it('admin + embarcado + processSlotKeys vazio: card "Dados pendentes" lista BL/AWB', () => {
    renderDetail({
      isAdmin: true,
      detailTab: 'general',
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-ship-card',
        shippedAt: '2026-09-01',
        items: [],
        containers: [],
        documentIndex: { fispqItemIds: [], containerWashIds: [], processSlotKeys: [] },
      }),
    })
    expect(screen.getByText('Dados pendentes')).toBeInTheDocument()
    expect(screen.getByText('BL/AWB')).toBeInTheDocument()
  })
})

// F18b-2 (E9): indicadores read-only de FISPQ (aba Itens) e lavação (bloco Carga).
describe('ProcessDetailView — indicadores FISPQ/lavação (F18b-2, E9)', () => {
  it('aba Itens: item IMO sem FISPQ no indice -> badge "FISPQ pendente" (admin)', () => {
    renderDetail({
      detailTab: 'items',
      isAdmin: true,
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-imo',
        items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
      visibleProcessItems: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
    })
    expect(screen.getByText('FISPQ pendente')).toBeInTheDocument()
  })

  it('aba Itens: item IMO com FISPQ no indice -> badge "FISPQ enviada"', () => {
    renderDetail({
      detailTab: 'items',
      isAdmin: true,
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-imo',
        items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
        documentIndex: { fispqItemIds: ['ITEM-1'], containerWashIds: [] },
      }),
      visibleProcessItems: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
    })
    expect(screen.getByText('FISPQ enviada')).toBeInTheDocument()
  })

  it('role user: badges FISPQ ausentes mesmo com item IMO', () => {
    renderDetail({
      detailTab: 'items',
      isAdmin: false,
      profile: { name: 'User', role: 'user' },
      selectedProcess: makeProcess({
        id: 'p-imo',
        items: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
      visibleProcessItems: [{ id: 'ITEM-1', commercialName: 'Resina Atlas', dangerousGoods: true, quantity: 1 }],
    })
    expect(screen.queryByText('FISPQ pendente')).not.toBeInTheDocument()
    expect(screen.queryByText('FISPQ enviada')).not.toBeInTheDocument()
  })

  it('bloco Carga: contêiner devolvido sem lavação no indice -> "Lavação pendente"', () => {
    renderDetail({
      detailTab: 'process',
      isAdmin: true,
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-cnt',
        category: 'FCL',
        containers: [{ id: 'CNT-1', number: 'MSCU1234567', type: '20DC', seal: '', returnedAt: '2026-09-01' }],
        documentIndex: { fispqItemIds: [], containerWashIds: [] },
      }),
    })
    expect(screen.getByText('Lavação pendente')).toBeInTheDocument()
  })

  it('bloco Carga: contêiner devolvido com lavação no indice -> "Lavação enviada"', () => {
    renderDetail({
      detailTab: 'process',
      isAdmin: true,
      profile: { name: 'Admin', role: 'admin' },
      selectedProcess: makeProcess({
        id: 'p-cnt',
        category: 'FCL',
        containers: [{ id: 'CNT-1', number: 'MSCU1234567', type: '20DC', seal: '', returnedAt: '2026-09-01' }],
        documentIndex: { fispqItemIds: [], containerWashIds: ['CNT-1'] },
      }),
    })
    expect(screen.getByText('Lavação enviada')).toBeInTheDocument()
  })
})

// F17.2b (D-6): card "Anuências" - substitui o card MAPA legado.
describe('ProcessDetailView — card "Anuências" (F17.2b)', () => {
  it('licença MAPA Deferida renderiza o card com "MAPA" e "Deferida"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        licenses: [{ id: 'LIC-1', agency: 'MAPA', lpcoNumber: '', status: 'Deferida', inspectionScheduledAt: '', deferredAt: '', notes: '' }],
      }),
    })
    expect(screen.getByText('Anuências')).toBeInTheDocument()
    expect(screen.getByText(/MAPA/)).toBeInTheDocument()
    expect(screen.getByText(/Deferida/)).toBeInTheDocument()
  })

  it('sem licenças: só o placeholder (sem o bloco real)', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ licenses: [] }),
    })
    // jsdom nao aplica styles.css: o placeholder (display:none fora do desktop) aparece no DOM.
    const block = screen.getByRole('heading', { level: 3, name: 'Anuências' }).closest('.detail-block')
    expect(block).toHaveClass('detail-block--placeholder')
    expect(block).toHaveTextContent('Nenhuma anuência registrada.')
    expect(screen.queryByText(/deferidas/)).not.toBeInTheDocument()
  })
})

describe('ProcessDetailView — fornecedor mascarado (F17.2a D-8)', () => {
  it('FCL: supplierName NÃO aparece com canSeeName=false', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: false,
      selectedProcess: makeProcess({ category: 'FCL', supplierName: 'Fornecedor Atlas' }),
    })
    expect(screen.queryByText('Fornecedor Atlas')).not.toBeInTheDocument()
  })

  it('FCL: supplierName aparece com canSeeName=true', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({ category: 'FCL', supplierName: 'Fornecedor Atlas' }),
    })
    expect(screen.getByText(identRow('Fornecedor: Fornecedor Atlas'))).toBeInTheDocument()
  })

  it('CONSOLIDADO: nunca mostra "Fornecedor:" de processo, mesmo com supplierName legado populado (Q1)', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({ category: 'CONSOLIDADO', supplierName: 'Fornecedor Delta' }),
    })
    expect(screen.queryByText(identRow(/^Fornecedor: /))).not.toBeInTheDocument()
    expect(screen.queryByText('Fornecedor Delta')).not.toBeInTheDocument()
  })
})

// F17.3a (D-12): card "Chegada" + card "Free time".
describe('ProcessDetailView — card "Chegada" (F17.3a)', () => {
  it('atracação com data aproximada mostra "(aprox.)"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        migratedApproxFields: ['berthedAt'],
      }),
    })
    expect(screen.getByText('Atracação', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText(/\(aprox\.\)/)).toBeInTheDocument()
  })

  it('legado berthed sem data mostra "Confirmada (sem data)"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL', berthed: true, berthedAt: '' }),
    })
    expect(screen.getByText(/Confirmada \(sem data\)/)).toBeInTheDocument()
  })

  it('sem sinal de chegada nao renderiza o card "Chegada"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL' }),
    })
    // jsdom nao aplica styles.css: exclui o placeholder (desktop) e confere o aviso.
    expect(document.querySelector('.process-block--arrival:not(.detail-block--placeholder)')).toBeNull()
    expect(document.querySelector('.process-block--arrival.detail-block--placeholder')).toHaveTextContent(
      'Chegada ainda não registrada.',
    )
  })
})

describe('ProcessDetailView — card "Free time" (F17.3a)', () => {
  it('waiting-presence mostra "inicia na presença de carga"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        freeTimeDays: 7,
      }),
    })
    expect(screen.getByText(/inicia na presença de carga/)).toBeInTheDocument()
  })

  it('prazo vencido mostra badge de aviso (datas relativas a hoje)', () => {
    const today = new Date()
    const presenceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10)
    const presenceIso = `${presenceDate.getFullYear()}-${String(presenceDate.getMonth() + 1).padStart(2, '0')}-${String(presenceDate.getDate()).padStart(2, '0')}T10:00`
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        category: 'FCL',
        berthed: true,
        berthedAt: '2026-09-20T10:00',
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: presenceIso,
        freeTimeDays: 5,
      }),
    })
    expect(screen.getByText(/vencido há/)).toBeInTheDocument()
  })

  it('freeTimeDays nao informado (null) nao renderiza o card', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'FCL', freeTimeDays: null }),
    })
    // FCL not-informed gera placeholder (jsdom nao aplica CSS): exclui-o e confere o aviso.
    expect(document.querySelector('.process-block--free-time:not(.detail-block--placeholder)')).toBeNull()
    expect(screen.getByText('Free time não informado.')).toBeInTheDocument()
  })

  it('LCL nunca renderiza o card Free time', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ category: 'LCL', freeTimeDays: 5 }),
    })
    expect(screen.queryByText('Free time')).not.toBeInTheDocument()
    // cobre bloco real E placeholder
    expect(document.querySelector('.process-block--free-time')).toBeNull()
  })
})

// F17.2c/F17.2d-2 (D-10/D-6): card "POs consolidadas" + PO por item na aba
// Itens. F17.2d-2 (Q6/Q1): PO virou objeto { po, reference, supplierName },
// mascarado por `canSeeName` (`canSeePurchaseOrderDetails`).
describe('ProcessDetailView — POs do consolidado (F17.2c/F17.2d-2)', () => {
  it('CONSOLIDADO com purchaseOrders (strings legadas) renderiza o card "POs consolidadas"', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({ category: 'CONSOLIDADO', purchaseOrders: ['PO-A', 'PO-B'] }),
    })
    expect(screen.getByText('POs consolidadas')).toBeInTheDocument()
    expect(screen.getByText('PO-A')).toBeInTheDocument()
    expect(screen.getByText('PO-B')).toBeInTheDocument()
  })

  it('FCL nao renderiza o card "POs consolidadas"', () => {
    renderDetail({
      detailTab: 'general',
      selectedProcess: makeProcess({ category: 'FCL' }),
    })
    expect(screen.queryByText('POs consolidadas')).not.toBeInTheDocument()
  })

  it('aba Itens do CONSOLIDADO mostra a PO do item', () => {
    renderDetail({
      detailTab: 'items',
      selectedProcess: makeProcess({ category: 'CONSOLIDADO' }),
      visibleProcessItems: [{ id: 'i1', commercialName: 'Item A', quantity: 1, poNumber: 'PO-A' }],
    })
    expect(screen.getByText('PO:')).toBeInTheDocument()
    expect(screen.getByText('PO-A')).toBeInTheDocument()
  })

  it('canSeeName: true mostra PO + Ref. + Fornecedor', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({
        category: 'CONSOLIDADO',
        purchaseOrders: [{ po: 'PO-A', reference: 'R1', supplierName: 'ACME' }],
      }),
    })
    expect(screen.getByText('PO-A · Ref.: R1 · Fornecedor: ACME')).toBeInTheDocument()
  })

  it('canSeeName: false mostra so o PO (referencia/fornecedor ausentes)', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: false,
      selectedProcess: makeProcess({
        category: 'CONSOLIDADO',
        purchaseOrders: [{ po: 'PO-A', reference: 'R1', supplierName: 'ACME' }],
      }),
    })
    expect(screen.getByText('PO-A')).toBeInTheDocument()
    expect(screen.queryByText(/ACME/)).not.toBeInTheDocument()
    expect(screen.queryByText(/R1/)).not.toBeInTheDocument()
  })

  it('CONSOLIDADO nao mostra "Fornecedor:" de processo (Q1)', () => {
    renderDetail({
      detailTab: 'general',
      canSeeName: true,
      selectedProcess: makeProcess({
        category: 'CONSOLIDADO',
        supplierName: '',
        purchaseOrders: [{ po: 'PO-A', reference: '', supplierName: 'ACME' }],
      }),
    })
    expect(screen.queryByText(identRow(/^Fornecedor: /))).not.toBeInTheDocument()
  })
})

// F17.2d-1 (D-4, Q4): carga perigosa POR ITEM - badge na aba Itens.
describe('ProcessDetailView — carga perigosa por item (F17.2d-1)', () => {
  it('item com dangerousGoods mostra o badge "Carga perigosa"', () => {
    renderDetail({
      detailTab: 'items',
      selectedProcess: makeProcess(),
      visibleProcessItems: [
        { id: 'i1', commercialName: 'Resina', quantity: 1, dangerousGoods: true, imoClass: '3', unNumber: '1203' },
      ],
    })
    expect(screen.getByText('Carga perigosa · Classe 3 · ONU 1203')).toBeInTheDocument()
  })

  it('item sem dangerousGoods NAO mostra o badge', () => {
    renderDetail({
      detailTab: 'items',
      selectedProcess: makeProcess(),
      visibleProcessItems: [{ id: 'i1', commercialName: 'Resina', quantity: 1 }],
    })
    expect(screen.queryByText(/Carga perigosa/)).not.toBeInTheDocument()
  })
})

// F17.3b (D-14): card "DUIMP" completo (numero + datas + canal +
// conferencia + exigencia/procedimento especial + desembaraco).
describe('ProcessDetailView — DUIMP completa (F17.3b)', () => {
  it('numero + registro + parametrizacao formatados', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        berthed: true,
        cargoPresenceInformed: true,
        duimpNumber: 'DU-2026-001',
        duimpRegisteredAt: '2026-09-19T10:00',
        parameterizedAt: '2026-09-20T11:00',
        parameterizationChannel: 'Verde',
        duimpStatus: 'Parametrizada',
      }),
    })
    expect(getDefinition('Nº da DUIMP')).toHaveTextContent('DU-2026-001')
    expect(screen.getByText('Registro', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Parametrização', { selector: 'dt' })).toBeInTheDocument()
  })

  it('legado sem data mostra "Registro: sem data (registro antigo)"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        berthed: true,
        cargoPresenceInformed: true,
        duimpStatus: 'Aguardando parametrização da DUIMP',
      }),
    })
    expect(getDefinition('Registro')).toHaveTextContent('sem data (registro antigo)')
  })

  it('canal Cinza mostra "Procedimento especial:"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Cinza',
        duimpStatus: 'Parametrizada',
        customsRequirementNotes: 'procedimento especial X',
      }),
    })
    expect(getDefinition('Procedimento especial')).toHaveTextContent('procedimento especial X')
  })

  it('canal Vermelho mostra "Conferência agendada para:"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        berthed: true,
        cargoPresenceInformed: true,
        parameterizedAt: '2026-09-20T10:00',
        parameterizationChannel: 'Vermelho',
        duimpStatus: 'Parametrizada',
        customsInspectionScheduledAt: '2026-09-21T09:00',
      }),
    })
    expect(screen.getByText('Conferência agendada para', { selector: 'dt' })).toBeInTheDocument()
  })

  it('sem nenhum dado DUIMP o card nao renderiza', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess(),
    })
    // jsdom nao aplica styles.css: exclui o placeholder (desktop) e confere o aviso.
    expect(document.querySelector('.process-block--customs:not(.detail-block--placeholder)')).toBeNull()
    expect(screen.getByText('DUIMP ainda não registrada.')).toBeInTheDocument()
  })
})

// F17.4b (B-4/B-7): card "Divergência no recebimento" + "vazio devolvido em"
// na lista de contêineres (aba Processo).
describe('ProcessDetailView — divergência no recebimento / devolução de vazio (F17.4b)', () => {
  it('receiptDivergence true com tipo "Falta" mostra o card com o tipo', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        receiptDivergence: true,
        receiptDivergenceType: 'Falta',
        receiptDivergenceNotes: 'faltaram 2 caixas',
      }),
    })
    expect(screen.getByText('Divergência no recebimento')).toBeInTheDocument()
    expect(screen.getByText('Falta')).toBeInTheDocument()
    expect(screen.getByText('faltaram 2 caixas')).toBeInTheDocument()
  })

  it('receiptDivergence false -> sem o card', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ receiptDivergence: false }),
    })
    expect(screen.queryByText('Divergência no recebimento')).not.toBeInTheDocument()
  })

  it('container com returnedAt mostra "vazio devolvido em 10/09/2026"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        containers: [
          { id: 'CNT-1', number: 'CSQU3054383', seal: 'L1', type: '40DC', returnedAt: '2026-09-10' },
        ],
      }),
    })
    expect(screen.getByText(/Devolvido em 10\/09\/2026/)).toBeInTheDocument()
  })

  it('container com returnedAt futuro mostra "Devolução prevista para" e nao "Devolvido em"', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({
        containers: [
          { id: 'CNT-1', number: 'CSQU3054383', seal: 'L1', type: '40DC', returnedAt: '2999-01-15' },
        ],
      }),
    })
    expect(screen.getByText('Devolução prevista para 15/01/2999')).toBeInTheDocument()
    expect(screen.queryByText(/Devolvido em/)).not.toBeInTheDocument()
  })
})

describe('ProcessDetailView — plural de mensagens (aba Mensagens)', () => {
  it('mensagens restantes: singular com 1', () => {
    renderDetail({ detailTab: 'messages', isAdmin: true, remainingMessages: 1 })
    expect(screen.getByText('Resta 1 mensagem disponível nesta conversa para este perfil.')).toBeInTheDocument()
  })

  it('mensagens restantes: plural com 20', () => {
    renderDetail({ detailTab: 'messages', isAdmin: true, remainingMessages: 20 })
    expect(screen.getByText('Restam 20 mensagens disponíveis nesta conversa para este perfil.')).toBeInTheDocument()
    expect(screen.queryByText(/mensagemns|disponívelis/)).toBeNull()
  })

  it('contador do cabecalho: "1 mensagem" com 1 e "N mensagens" com N diferente de 1', () => {
    const msg = (id) => ({ id, authorName: 'Maria', createdAt: '2026-09-20T10:00:00.000Z', content: 'Oi ' + id })
    const { unmount } = renderDetail({ detailTab: 'messages', isAdmin: true, processMessages: [msg('a')] })
    expect(screen.getByText('1 mensagem')).toBeInTheDocument()
    unmount()
    renderDetail({ detailTab: 'messages', isAdmin: true, processMessages: [msg('a'), msg('b')] })
    expect(screen.getByText('2 mensagens')).toBeInTheDocument()
  })
})

// UX-1 (2026-09-25): confirmacao antes de excluir mensagem do processo.
describe('ProcessDetailView — confirmacao ao excluir mensagem (UX-1)', () => {
  const MESSAGE = {
    id: 'm-1',
    authorName: 'Maria Souza',
    createdAt: '2026-09-20T10:00:00.000Z',
    content: 'Dúvida sobre o processo.',
  }

  it('clicar em "Excluir" abre a confirmacao e nao chama onDeleteMessage', async () => {
    const user = userEvent.setup()
    const onDeleteMessage = vi.fn()
    renderDetail({
      detailTab: 'messages',
      isAdmin: true,
      processMessages: [MESSAGE],
      onDeleteMessage,
    })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    await screen.findByRole('alertdialog')
    expect(onDeleteMessage).not.toHaveBeenCalled()
  })

  it('Cancelar fecha o dialogo e nao chama onDeleteMessage', async () => {
    const user = userEvent.setup()
    const onDeleteMessage = vi.fn()
    renderDetail({
      detailTab: 'messages',
      isAdmin: true,
      processMessages: [MESSAGE],
      onDeleteMessage,
    })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onDeleteMessage).not.toHaveBeenCalled()
  })

  it('confirmar chama onDeleteMessage(msg, onError) e fecha quando resolve true', async () => {
    const user = userEvent.setup()
    const onDeleteMessage = vi.fn().mockResolvedValue(true)
    renderDetail({
      detailTab: 'messages',
      isAdmin: true,
      processMessages: [MESSAGE],
      onDeleteMessage,
    })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir mensagem' }))
    await waitFor(() => {
      expect(onDeleteMessage).toHaveBeenCalledWith(MESSAGE, expect.any(Function))
    })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('quando onDeleteMessage chama o onError recebido e resolve false, o dialogo continua aberto com o texto', async () => {
    const user = userEvent.setup()
    const onDeleteMessage = vi.fn().mockImplementation(async (_message, onError) => {
      onError('Não foi possível excluir a mensagem.')
      return false
    })
    renderDetail({
      detailTab: 'messages',
      isAdmin: true,
      processMessages: [MESSAGE],
      onDeleteMessage,
    })
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Excluir mensagem' }))
    await waitFor(() => {
      expect(
        within(screen.getByRole('alertdialog')).getByText('Não foi possível excluir a mensagem.')
      ).toBeInTheDocument()
    })
  })
})

// UX-6b-3: detalhe pelo fluxo em blocos 1-5 — cabeçalho (nome/status/
// subtítulo com máscara intacta), menu "Mais ações" (admin, Excluir
// processo) e ordem dos blocos numerados.
function makeFullFlowProcess(overrides = {}) {
  return makeProcess({
    category: 'FCL',
    name: 'Processo teste',
    processNumber: 'PO-1',
    destination: 'Itajaí',
    containers: [{ id: 'CNT-1', number: 'CSQU3054383', seal: 'L1', type: '40HC', returnedAt: '' }],
    grossWeightKg: 1000,
    shippedAt: '2026-09-01',
    berthed: true,
    berthedAt: '2026-09-20T10:00',
    cargoPresenceInformed: true,
    cargoPresenceInformedAt: '2026-09-21T10:00',
    freeTimeDays: 10,
    duimpNumber: 'DU-1',
    duimpStatus: 'Parametrizada',
    parameterizedAt: '2026-09-22T10:00',
    parameterizationChannel: 'Verde',
    licenses: [
      { id: 'LIC-1', agency: 'MAPA', status: 'Deferida', lpcoNumber: '', inspectionScheduledAt: '', deferredAt: '', notes: '' },
    ],
    collectionStatus: 'Coleta Agendada',
    collectionWindows: [{ id: 'W1', containerId: 'CNT-1', scheduledAt: '2026-09-25T09:00:00.000Z', notes: '' }],
    carrierName: 'Transportadora X',
    ...overrides,
  })
}

describe('ProcessDetailView — cabeçalho, máscara e status (UX-6b-3)', () => {
  it('n1: FCL canSeeName true mostra o nome (h2) e o subtitulo modal · PO · destino', () => {
    renderDetail({
      canSeeName: true,
      selectedProcess: makeFullFlowProcess(),
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Processo teste' })).toBeInTheDocument()
    expect(document.querySelector('.process-detail-heading__meta')).toHaveTextContent('FCL · PO: PO-1 · Itajaí')
  })

  it('n1: FCL canSeeName false mascara o nome no h2 e em todo o DOM', () => {
    renderDetail({
      canSeeName: false,
      selectedProcess: makeFullFlowProcess(),
    })
    expect(screen.getByRole('heading', { level: 2, name: 'PO: PO-1' })).toBeInTheDocument()
    expect(screen.queryByText('Processo teste')).not.toBeInTheDocument()
  })

  it('n1: CONSOLIDADO canSeeName false mostra o nome (categoria nao restrita)', () => {
    renderDetail({
      canSeeName: false,
      selectedProcess: makeFullFlowProcess({ category: 'CONSOLIDADO', processNumber: '' }),
    })
    expect(screen.getByRole('heading', { level: 2, name: 'Processo teste' })).toBeInTheDocument()
  })

  it('n2: badge do cabecalho usa getDisplayedProcessStatus (nao o quick-read de coleta)', () => {
    renderDetail({ selectedProcess: makeFullFlowProcess({ processStatus: 'Coleta Agendada' }) })
    const heading = document.querySelector('.process-detail-view > .process-detail-card-heading')
    expect(within(heading).getByText('Coleta agendada')).toBeInTheDocument()
  })

  it('n2: aba Processo nao mostra mais o card solto "Status do processo"', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeFullFlowProcess() })
    expect(screen.queryByText('Status do processo')).not.toBeInTheDocument()
  })

  it('n2: aba Detalhes gerais nao mostra mais "Categoria" nem "Processo"', () => {
    renderDetail({ detailTab: 'general', selectedProcess: makeFullFlowProcess() })
    expect(screen.queryByText('Categoria')).not.toBeInTheDocument()
    expect(screen.queryByText('Processo', { selector: 'span.detail-label' })).not.toBeInTheDocument()
  })
})

describe('ProcessDetailView — ordem dos blocos numerados 1-5 (UX-6b-3 D6/D7)', () => {
  it('n3: ordem Carga/Embarque/Chegada/Aduana/Anuências/Coleta com step 1..5', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeFullFlowProcess() })
    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles.slice(0, 7)).toEqual([
      'Carga',
      'Embarque e trânsito',
      'Chegada',
      'Free time',
      'Aduana (DUIMP)',
      'Anuências',
      'Coleta',
    ])
    const steps = Array.from(document.querySelectorAll('.detail-block__step')).map((el) => el.textContent)
    expect(steps).toEqual(['1', '2', '3', '4', '5'])
  })

  it('n3: sem DUIMP e com anuencia, o bloco "Anuências" herda o step 4', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({
        duimpNumber: '',
        duimpStatus: '',
        duimpRegisteredAt: '',
        parameterizedAt: '',
        parameterizationChannel: '',
        clearanceCompletedAt: '',
      }),
    })
    const licensesHeading = screen.getByRole('heading', { level: 3, name: 'Anuências' })
    const step = licensesHeading.closest('.detail-block').querySelector('.detail-block__step')
    expect(step).toHaveTextContent('4')
  })
})

describe('ProcessDetailView — bloco "Carga" (UX-6b-3 D7.1)', () => {
  it('n4: tipo do container por extenso, sem card solto de quantidade, e Pallets presente', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeFullFlowProcess() })
    expect(screen.getByText("40' High Cube")).toBeInTheDocument()
    expect(screen.queryByText('Quantidade de containers')).not.toBeInTheDocument()
    expect(getDefinition('Pallets')).toBeInTheDocument()
  })

  it('n4: legado sem containers[] com containerQuantity mostra "Contêineres" via dl', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({ containers: undefined, containerQuantity: 2 }),
    })
    expect(getDefinition('Contêineres')).toHaveTextContent('2 containers')
  })
})

describe('ProcessDetailView — DUIMP neutra (UX-6b-3 D7.4)', () => {
  it('n5: canal Verde vira badge "Canal Verde" (inline-badge--ok), bloco sem detail-card--success', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess(),
    })
    const badge = screen.getByText('Canal Verde')
    expect(badge).toHaveClass('inline-badge--ok')
    const block = badge.closest('.detail-block')
    expect(block).not.toHaveClass('detail-card--success')
  })
})

describe('ProcessDetailView — Free time vencido em --danger-50 (UX-6b-3 F2)', () => {
  it('n6: prazo vencido marca o bloco com detail-block--danger; waiting-presence nao', () => {
    const today = new Date()
    const presenceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10)
    const presenceIso = `${presenceDate.getFullYear()}-${String(presenceDate.getMonth() + 1).padStart(2, '0')}-${String(presenceDate.getDate()).padStart(2, '0')}T10:00`
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({
        cargoPresenceInformed: true,
        cargoPresenceInformedAt: presenceIso,
        freeTimeDays: 5,
      }),
    })
    const heading = screen.getByRole('heading', { level: 3, name: 'Free time' })
    expect(heading.closest('.detail-block')).toHaveClass('detail-block--danger')
    expect(screen.getByText(/vencido há/)).toBeInTheDocument()
  })

  it('n6: waiting-presence nao marca o bloco como danger', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({ cargoPresenceInformed: false, cargoPresenceInformedAt: '' }),
    })
    const heading = screen.getByRole('heading', { level: 3, name: 'Free time' })
    expect(heading.closest('.detail-block')).not.toHaveClass('detail-block--danger')
  })
})

describe('ProcessDetailView — Anuências com badge de resumo (UX-6b-3 D7.4)', () => {
  it('n7: 1 Deferida + 1 Indeferida mostra "1 de 2 deferidas" (danger) e badge "Indeferida" (danger)', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({
        licenses: [
          { id: 'LIC-1', agency: 'MAPA', status: 'Deferida', lpcoNumber: '', inspectionScheduledAt: '', deferredAt: '', notes: '' },
          { id: 'LIC-2', agency: 'ANVISA', status: 'Indeferida', lpcoNumber: '', inspectionScheduledAt: '', deferredAt: '', notes: '' },
        ],
      }),
    })
    const summary = screen.getByText('1 de 2 deferidas')
    expect(summary).toHaveClass('inline-badge--danger')
    const statusBadge = screen.getByText('Indeferida')
    expect(statusBadge).toHaveClass('inline-badge--danger')
  })
})

describe('ProcessDetailView — bloco "Coleta" (UX-6b-3 D3/D7.5)', () => {
  it('n8: badge de status, rotulo de janela + notas visiveis, sem o rotulo antigo "Coleta: "', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({
        collectionWindows: [
          { id: 'W1', containerId: 'CNT-1', scheduledAt: '2026-09-25T09:00:00.000Z', notes: 'levar EPI' },
        ],
      }),
    })
    const heading = screen.getByRole('heading', { level: 3, name: 'Coleta' })
    const block = heading.closest('.detail-block')
    expect(within(block).getByText('Coleta Agendada')).toBeInTheDocument()
    expect(within(block).getByText('levar EPI')).toBeInTheDocument()
    expect(screen.queryByText(/^Coleta: /)).not.toBeInTheDocument()
  })
})

describe('ProcessDetailView — timeline (UX-6b-3 D5)', () => {
  it('n9: "Coleta Agendada" mostra 4 nos concluidos e o 5o em --now (sem --done)', () => {
    renderDetail({ selectedProcess: makeFullFlowProcess({ processStatus: 'Coleta Agendada' }) })
    const nodes = document.querySelectorAll('.process-timeline__node')
    const done = document.querySelectorAll('.process-timeline__node--done')
    const now = document.querySelectorAll('.process-timeline__node--now')
    expect(nodes).toHaveLength(5)
    expect(done).toHaveLength(4)
    expect(now).toHaveLength(1)
    expect(now[0]).not.toHaveClass('process-timeline__node--done')
  })

  it('n9: "Carga recebida" mostra 5 nos concluidos e 0 em --now', () => {
    renderDetail({ selectedProcess: makeFullFlowProcess({ processStatus: 'Carga recebida' }) })
    expect(document.querySelectorAll('.process-timeline__node--done')).toHaveLength(5)
    expect(document.querySelectorAll('.process-timeline__node--now')).toHaveLength(0)
  })
})

describe('ProcessDetailView — menu "Mais ações" / Excluir processo (UX-6b-3 D1/D4, UX-1 intacto)', () => {
  it('n10: isAdmin false nao mostra o gatilho "Mais ações"', () => {
    renderDetail({ isAdmin: false, selectedProcess: makeFullFlowProcess() })
    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument()
  })

  it('n10: isAdmin true abre/fecha o menu, exclui com confirmacao e cancela sem excluir', async () => {
    const user = userEvent.setup()
    const onDeleteProcess = vi.fn()
    renderDetail({ isAdmin: true, selectedProcess: makeFullFlowProcess(), onDeleteProcess })

    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    const menuItem = screen.getByRole('menuitem', { name: 'Excluir processo' })
    expect(menuItem).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(document.body)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Excluir processo' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Excluir processo?')).toBeInTheDocument()
    expect(onDeleteProcess).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onDeleteProcess).not.toHaveBeenCalled()

    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Excluir processo' }))
    const dialog2 = await screen.findByRole('alertdialog')
    await user.click(within(dialog2).getByRole('button', { name: 'Excluir' }))
    expect(onDeleteProcess).toHaveBeenCalledTimes(1)
  })

  it('n10: isSaving true desabilita o menuitem "Excluir processo"', async () => {
    const user = userEvent.setup()
    renderDetail({ isAdmin: true, isSaving: true, selectedProcess: makeFullFlowProcess() })
    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    expect(screen.getByRole('menuitem', { name: /Excluir processo/ })).toBeDisabled()
  })
})

describe('ProcessDetailView — ações por role no cabecalho (UX-6b-3 D3)', () => {
  it('n11: isAdmin chama onEditMode; canEditSelectedCollectionStatus/canEditPostReceiptNotes mostram os botoes', () => {
    const onEditMode = vi.fn()
    renderDetail({
      isAdmin: true,
      canEditSelectedCollectionStatus: true,
      onEditMode,
      selectedProcess: makeFullFlowProcess(),
    })
    screen.getByRole('button', { name: 'Editar processo' }).click()
    expect(onEditMode).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Status de coleta' })).toBeInTheDocument()
  })

  it('n11: canEditPostReceiptNotes + Carga recebida mostra "Editar observações"', () => {
    renderDetail({
      canEditPostReceiptNotes: true,
      selectedProcess: makeFullFlowProcess({ processStatus: 'Carga recebida' }),
    })
    expect(screen.getByRole('button', { name: 'Editar observações' })).toBeInTheDocument()
  })

  it('n11: usuario comum nao ve os 3 botoes admin, e Favoritar/Desfavoritar chama onToggleFavorite', () => {
    const onToggleFavorite = vi.fn()
    const { rerender } = renderDetail({
      isAdmin: false,
      onToggleFavorite,
      selectedProcess: makeFullFlowProcess({ id: 'p-1' }),
    })
    expect(screen.queryByRole('button', { name: 'Editar processo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Status de coleta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar observações' })).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Favoritar' }).click()
    expect(onToggleFavorite).toHaveBeenCalledWith('p-1')

    rerender(
      <ProcessDetailView
        {...{
          selectedProcess: makeFullFlowProcess({ id: 'p-1' }),
          detailTab: 'process',
          isAdmin: false,
          isSaving: false,
          favoriteProcessIds: ['p-1'],
          canEditPostReceiptNotes: false,
          canEditSelectedCollectionStatus: false,
          itemSearchTerm: '',
          selectedItemName: '',
          processMessages: [],
          isLoadingMessages: false,
          messageDraft: '',
          deletingMessageId: '',
          isSendingMessage: false,
          messageLimitReached: false,
          remainingMessages: 0,
          hasUnlimitedMessages: false,
          visibleProcessItems: [],
          relatedActiveProcesses: [],
          selectedProcessPostReceiptImages: [],
          profile: { name: 'Teste' },
          itemsSectionRef: { current: null },
          onDetailTabChange: vi.fn(),
          onSetItemSearchTerm: vi.fn(),
          onMessageDraftChange: vi.fn(),
          onOpenRelatedItemTab: vi.fn(),
          onOpenProcessDetail: vi.fn(),
          onToggleFavorite,
          onSetViewModeList: vi.fn(),
          onEditMode: vi.fn(),
          onPostReceiptEditMode: vi.fn(),
          onCollectionStatusEditMode: vi.fn(),
          onOpenPostReceiptGallery: vi.fn(),
          onDeleteProcess: vi.fn(),
          onSendMessage: vi.fn(),
          onDeleteMessage: vi.fn(),
        }}
      />
    )
    expect(screen.getByRole('button', { name: 'Desfavoritar' })).toBeInTheDocument()
  })
})

describe('ProcessDetailView — aba Itens sem altura fixa e sem "Nome comercial:" (UX-6b-3 D9)', () => {
  it('n12: detailTab items nao tem process-items-list--scroll nem o rotulo "Nome comercial:"', () => {
    const { container } = renderDetail({
      detailTab: 'items',
      selectedProcess: makeFullFlowProcess(),
      visibleProcessItems: [{ id: 'i1', commercialName: 'Item A', quantity: 2 }],
    })
    expect(container.querySelector('.process-items-list--scroll')).not.toBeInTheDocument()
    expect(screen.queryByText('Nome comercial:')).not.toBeInTheDocument()
    expect(screen.getByText('Item A')).toBeInTheDocument()
  })

  it('n12: detailTab related-item continua com process-items-list--scroll', () => {
    const { container } = renderDetail({
      detailTab: 'related-item',
      selectedItemName: 'Item A',
      selectedProcess: makeFullFlowProcess(),
      relatedActiveProcesses: [],
    })
    expect(container.querySelector('.process-items-list--scroll')).toBeInTheDocument()
  })
})

describe('ProcessDetailView — fotos pos-recebimento (UX-6b-3, D7 sem numero)', () => {
  it('n13: clicar na foto chama onOpenPostReceiptGallery(0)', async () => {
    const user = userEvent.setup()
    const onOpenPostReceiptGallery = vi.fn()
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeFullFlowProcess({ processStatus: 'Carga recebida', postReceiptNotes: 'nota' }),
      selectedProcessPostReceiptImages: [{ id: 'img1', url: 'x', name: 'foto.jpg', size: 10 }],
      onOpenPostReceiptGallery,
    })
    await user.click(screen.getByRole('button', { name: /foto\.jpg/ }))
    expect(onOpenPostReceiptGallery).toHaveBeenCalledWith(0)
  })
})

// Blocos vazios (SPEC 2026-09-28): placeholder so' aparece no desktop via CSS;
// no DOM do jsdom ele sempre existe quando o bloco real esta vazio.
describe('ProcessDetailView — blocos vazios com placeholder (desktop, SPEC 2026-09-28)', () => {
  const CLASSES = ['transit', 'arrival', 'customs', 'licenses', 'collection', 'free-time']
  const MESSAGES = {
    transit: 'Embarque ainda não registrado.',
    arrival: 'Chegada ainda não registrada.',
    customs: 'DUIMP ainda não registrada.',
    licenses: 'Nenhuma anuência registrada.',
    collection: 'Coleta ainda não agendada.',
    'free-time': 'Free time não informado.',
  }
  const WIDE = ['transit', 'licenses', 'collection', 'free-time']
  const placeholder = (name) => document.querySelector(`.process-block--${name}.detail-block--placeholder`)

  it('FCL vazio: 6 placeholders com classe e aviso corretos, sem numero de passo', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeProcess() })
    expect(document.querySelectorAll('.detail-block--placeholder')).toHaveLength(6)
    CLASSES.forEach((name) => {
      const el = placeholder(name)
      expect(el).not.toBeNull()
      expect(el).toHaveTextContent(MESSAGES[name])
      expect(el.querySelector('.detail-block__step')).toBeNull()
    })
  })

  it('wide herdado do bloco real', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeProcess() })
    CLASSES.forEach((name) => {
      if (WIDE.includes(name)) expect(placeholder(name)).toHaveClass('detail-block--wide')
      else expect(placeholder(name)).not.toHaveClass('detail-block--wide')
    })
  })

  it('processo completo: nenhum placeholder', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeFullFlowProcess() })
    expect(document.querySelectorAll('.detail-block--placeholder')).toHaveLength(0)
  })

  it('bloco real nunca coexiste com o placeholder', () => {
    ;[makeProcess(), makeFullFlowProcess()].forEach((process) => {
      const { unmount } = renderDetail({ detailTab: 'process', selectedProcess: process })
      CLASSES.forEach((name) => {
        expect(document.querySelectorAll(`.process-block--${name}`).length).toBeLessThanOrEqual(1)
      })
      unmount()
    })
  })

  it.each(['LCL', 'AEREO'])('%s vazio: sem Free time, demais 5 placeholders presentes', (category) => {
    renderDetail({ detailTab: 'process', selectedProcess: makeProcess({ category }) })
    expect(document.querySelector('.process-block--free-time')).toBeNull()
    CLASSES.filter((name) => name !== 'free-time').forEach((name) => {
      expect(placeholder(name)).not.toBeNull()
    })
  })

  it('numeracao intacta: FCL vazio so numera Carga', () => {
    renderDetail({ detailTab: 'process', selectedProcess: makeProcess() })
    const steps = [...document.querySelectorAll('.detail-block__step')].map((el) => el.textContent)
    expect(steps).toEqual(['1'])
  })

  it('placeholder individual some quando ha dado', () => {
    renderDetail({
      detailTab: 'process',
      selectedProcess: makeProcess({ shippedAt: '2026-09-01', collectionStatus: 'Coleta Agendada' }),
    })
    expect(placeholder('transit')).toBeNull()
    expect(document.querySelector('.process-block--transit')).not.toBeNull()
    expect(placeholder('collection')).toBeNull()
    expect(document.querySelector('.process-block--collection')).not.toBeNull()
  })
})
