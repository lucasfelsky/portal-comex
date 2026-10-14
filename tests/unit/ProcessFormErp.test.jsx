// Chip "ERP" no formulario de edicao do processo (so' admin, so' em edicao): o
// clique grava o valor do ERP NO RASCUNHO (`onDraftChange`); nada e' persistido
// aqui. Harness com estado (o aviso e' recalculado ao vivo a partir do rascunho).
// Fixtures sinteticas (prefixos gregos, PEDIDO 9000-9999, REF 9nn-26).
//
// @vitest-environment jsdom

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProcessForm from '../../src/features/processes/ProcessForm'

const SNAPSHOT_ID = 'AAAAAAAAAAAAAAAAAAAA'
const SNAPSHOT = { snapshotId: SNAPSHOT_ID, updatedAtMs: new Date(2026, 9, 2, 14, 30).getTime() }

function makeDraft(overrides = {}) {
  return {
    id: 'p-1',
    name: 'BETA SEA 904-26',
    category: 'FCL',
    destination: '',
    processNumber: '9036',
    etd: '',
    eta: '',
    warehouseDeliveryDateOverride: '',
    etaOriginal: '',
    processStatus: 'Aguardando Embarque',
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
    items: [],
    supplierName: '',
    originLocation: '',
    incoterm: '',
    forwarderName: '',
    unNumber: '',
    imoClass: '',
    shippedAt: '',
    vesselName: '',
    voyage: '',
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
    containers: [],
    berthedAt: '',
    arrivedAt: '',
    cargoPresenceInformedAt: '',
    ceMercante: '',
    ceHouse: '',
    terminalName: '',
    freeTimeDays: '',
    demurrageDailyRateUsd: '',
    migratedApproxFields: [],
    purchaseOrders: [],
    ...overrides,
  }
}

function makeShipment({ transport = {}, ...overrides } = {}) {
  return {
    kind: 'FCL',
    portalCategory: 'FCL',
    key: 'BETA SEA 904-26',
    incoterm: '',
    originHint: '',
    stage: 1,
    statuses: ['EMBARCOU'],
    statusNf: [],
    orders: [{ pedido: '9036', poRef: 'BETA SEA 904-26', poBase: '', exporter: '' }],
    items: [],
    transport: {
      etd: '',
      eta: '',
      vessel: { name: '', raw: '', voyage: '' },
      blAwb: '',
      origin: '',
      destination: '',
      diNumber: '',
      diDate: '',
      ...transport,
    },
    conflicts: [],
    ...overrides,
  }
}

const referenceOf = (shipment, matchRule = 'pedido') => ({
  snapshot: SNAPSHOT,
  hint: { snapshotId: SNAPSHOT_ID, matchRule, shipment },
})

// Form com estado: `onDraftChange` grava o campo no rascunho (o espiao registra a chamada).
function Harness({ initial, viewMode = 'edit', erpReference = null, spy }) {
  const [draft, setDraft] = useState(initial)
  const onDraftChange = (field, value) => {
    spy?.(field, value)
    setDraft((current) => ({ ...current, [field]: value }))
  }
  const onItemChange = (itemId, field, value) =>
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }))
  return (
    <ProcessForm
      viewMode={viewMode}
      draft={draft}
      isSaving={false}
      isImportingItems={false}
      canShowMaritimeFlow={false}
      canShowAirFlow={false}
      itemsFileInputRef={{ current: null }}
      channelOptions={['Verde', 'Amarelo', 'Vermelho']}
      collectionStatusOptions={['Coleta Pendente', 'Coleta Agendada']}
      dtaStatusOptions={['Registrada']}
      processCategoryOptions={['FCL', 'LCL', 'AEREO', 'CONSOLIDADO']}
      onDraftChange={onDraftChange}
      onSetViewModeList={vi.fn()}
      onSave={vi.fn()}
      onImportItemsFile={vi.fn()}
      onAddItem={vi.fn()}
      onItemChange={onItemChange}
      onRemoveItem={vi.fn()}
      onClickCapture={vi.fn()}
      erpReference={erpReference}
    />
  )
}

const stepsRow = () => screen.getByLabelText('Etapas do cadastro')
const goToStep = (user, name) => user.click(within(stepsRow()).getByRole('button', { name }))
const erpButtons = () => screen.queryAllByRole('button', { name: /no ERP/i })

describe('ProcessForm - chip "ERP" que preenche o campo (edicao, admin)', () => {
  it('ETA: o hover mostra "No ERP: 14/11/2026"; o clique preenche o input, o chip some e o foco fica no ETA', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(
      <Harness
        initial={makeDraft({ eta: '2026-10-20' })}
        erpReference={referenceOf(makeShipment({ transport: { eta: '2026-11-14' } }))}
        spy={spy}
      />
    )
    await goToStep(user, 'Embarque')

    const chip = screen.getByRole('button', { name: 'ETA no ERP: 14/11/2026 (usar este valor)' })
    await user.hover(chip)
    expect(screen.getByRole('tooltip')).toHaveTextContent('No ERP: 14/11/2026')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Clique em ERP para usar este valor.')

    await user.click(chip)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('eta', '2026-11-14')
    const input = screen.getByLabelText('ETA')
    expect(input).toHaveValue('2026-11-14')
    expect(erpButtons()).toHaveLength(0)
    expect(input).toHaveFocus()
  })

  it('o chip fica fora do label: o input continua com o nome "ETA"', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={makeDraft({ eta: '2026-10-20' })}
        erpReference={referenceOf(makeShipment({ transport: { eta: '2026-11-14' } }))}
      />
    )
    await goToStep(user, 'Embarque')
    const input = screen.getByLabelText('ETA')
    expect(input.tagName).toBe('INPUT')
    const chip = screen.getByRole('button', { name: /ETA no ERP/ })
    expect(chip.closest('label')).toBeNull()
    expect(chip.closest('.erp-form-field')).toContainElement(input)
  })

  it('digitar um valor que bate com o ERP apaga o chip sem remontar o input nem tirar o foco', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={makeDraft({ eta: '2026-10-20' })}
        erpReference={referenceOf(makeShipment({ transport: { eta: '2026-11-14' } }))}
      />
    )
    await goToStep(user, 'Embarque')
    const input = screen.getByLabelText('ETA')
    input.focus()
    expect(erpButtons()).toHaveLength(1)

    fireEvent.change(input, { target: { value: '2026-11-14' } })
    expect(erpButtons()).toHaveLength(0)
    expect(screen.getByLabelText('ETA')).toBe(input)
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: '2026-11-20' } })
    expect(screen.getByRole('button', { name: /ETA no ERP/ })).toBeInTheDocument()
    expect(screen.getByLabelText('ETA')).toBe(input)
  })

  it('consolidado: o chip da PO preenche Referencia e Fornecedor da linha e some', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    const shipment = makeShipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [
        { pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' },
        { pedido: '9113', poRef: 'GAMA SEA 912-26', poBase: '', exporter: 'ZETA TRADING' },
      ],
    })
    render(
      <Harness
        initial={makeDraft({
          name: 'CON CN 929-26',
          category: 'CONSOLIDADO',
          processNumber: '',
          purchaseOrders: [
            { po: '9112', reference: '', supplierName: '' },
            { po: '9113', reference: 'GAMA SEA 912-26', supplierName: 'ZETA TRADING' },
          ],
        })}
        erpReference={referenceOf(shipment, 'consolidado:ref')}
        spy={spy}
      />
    )

    const chip = screen.getByRole('button', { name: /PO 9112 no ERP.*\(usar este valor\)/ })
    expect(erpButtons()).toHaveLength(1)
    await user.click(chip)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('purchaseOrders')

    const row = screen.getByText('9112', { selector: 'span' }).closest('li')
    expect(within(row).getByLabelText('Referência')).toHaveValue('GAMA SEA 911-26')
    expect(within(row).getByLabelText('Fornecedor')).toHaveValue('DELTA TRADING')
    expect(erpButtons()).toHaveLength(0)
    // A outra PO ficou intacta.
    const other = screen.getByText('9113', { selector: 'span' }).closest('li')
    expect(within(other).getByLabelText('Referência')).toHaveValue('GAMA SEA 912-26')
  })

  it('consolidado sem POs no Portal: o chip do conjunto acrescenta as POs do ERP', async () => {
    const user = userEvent.setup()
    const shipment = makeShipment({
      kind: 'CONSOLIDADO',
      portalCategory: 'CONSOLIDADO',
      key: 'CON CN 929-26',
      orders: [
        { pedido: '9112', poRef: 'GAMA SEA 911-26', poBase: '', exporter: 'DELTA TRADING' },
        { pedido: '9113', poRef: 'GAMA SEA 912-26', poBase: '', exporter: 'ZETA TRADING' },
      ],
    })
    render(
      <Harness
        initial={makeDraft({ name: 'CON CN 929-26', category: 'CONSOLIDADO', processNumber: '', purchaseOrders: [] })}
        erpReference={referenceOf(shipment, 'consolidado:ref')}
      />
    )
    await user.click(screen.getByRole('button', { name: /POs consolidadas no ERP.*\(usar este valor\)/ }))
    expect(screen.getByText('2 POs')).toBeInTheDocument()
    expect(screen.getByText('9112', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('9113', { selector: 'span' })).toBeInTheDocument()
    expect(erpButtons()).toHaveLength(0)
  })

  it('quantidade com 1 linha no grupo: o clique preenche a quantidade', async () => {
    const user = userEvent.setup()
    const shipment = makeShipment({
      items: [{ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 1500.5 }],
    })
    render(
      <Harness
        initial={makeDraft({ items: [{ id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 0 }] })}
        erpReference={referenceOf(shipment)}
      />
    )
    await goToStep(user, 'Itens')
    await user.click(screen.getByRole('button', { name: /Quantidade de RESINA OMEGA no ERP.*\(usar este valor\)/ }))
    const input = screen.getByLabelText('Quantidade')
    expect(input).toHaveValue(1500.5)
    expect(erpButtons()).toHaveLength(0)
    expect(input).toHaveFocus()
  })

  it('quantidade com 2 linhas no grupo: so aviso na 1a linha e o clique nao chama onDraftChange', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    const shipment = makeShipment({
      items: [{ commercialName: 'RESINA OMEGA', pedido: '9036', quantityKg: 1500.5 }],
    })
    render(
      <Harness
        initial={makeDraft({
          items: [
            { id: 'i-1', commercialName: 'RESINA OMEGA', quantity: 750 },
            { id: 'i-2', commercialName: 'RESINA OMEGA', quantity: 750 },
          ],
        })}
        erpReference={referenceOf(shipment)}
        spy={spy}
      />
    )
    await goToStep(user, 'Itens')
    const chips = erpButtons()
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveAccessibleName(/^Quantidade de RESINA OMEGA no ERP \(soma do item\): 1500,500 kg$/)
    await user.click(chips[0])
    expect(spy).not.toHaveBeenCalled()
    await user.hover(chips[0])
    expect(screen.getByRole('tooltip')).toHaveTextContent('o Portal tem 2 linhas deste item: ajuste à mão')
  })

  it('modo criar com referencia: nenhum chip e nenhum wrapper', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <Harness
        initial={makeDraft({ eta: '2026-10-20', destination: 'NAVEGANTES' })}
        viewMode="create"
        erpReference={referenceOf(makeShipment({ transport: { eta: '2026-11-14', destination: 'ITAJAI' } }))}
      />
    )
    expect(erpButtons()).toHaveLength(0)
    await goToStep(user, 'Embarque')
    expect(erpButtons()).toHaveLength(0)
    expect(container.querySelector('.erp-form-field')).toBeNull()
  })

  it('sem referencia (nao admin ou sem snapshot): nenhum .erp-form-field no DOM', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness initial={makeDraft({ eta: '2026-10-20' })} erpReference={null} />)
    expect(container.querySelector('.erp-form-field')).toBeNull()
    await goToStep(user, 'Embarque')
    expect(container.querySelector('.erp-form-field')).toBeNull()
    expect(erpButtons()).toHaveLength(0)
  })

  it('referencia sem hint para o processo: nenhum chip nem wrapper', () => {
    const { container } = render(
      <Harness initial={makeDraft({ destination: 'NAVEGANTES' })} erpReference={{ snapshot: SNAPSHOT, hint: null }} />
    )
    expect(container.querySelector('.erp-form-field')).toBeNull()
    expect(erpButtons()).toHaveLength(0)
  })

  it('Destino em Identificacao: o clique grava o valor do ERP', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(
      <Harness
        initial={makeDraft({ destination: 'NAVEGANTES' })}
        erpReference={referenceOf(makeShipment({ transport: { destination: 'ITAJAI' } }))}
        spy={spy}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Destino no ERP: ITAJAI (usar este valor)' }))
    expect(spy).toHaveBeenCalledWith('destination', 'ITAJAI')
    expect(screen.getByLabelText('Destino')).toHaveValue('ITAJAI')
  })
})
