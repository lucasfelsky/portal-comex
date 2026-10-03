// Fixtures SINTETICAS da conciliacao ERP (DBCorp) x Portal. Nenhum dado real:
// EXPORTADOR/PO/NAVIO usam so' prefixos gregos (ALFA, BETA...), PEDIDO fica em
// 9000-9999 e toda REF de consolidado e' `CON (CN|DG) 9nn-26`. A guarda
// positiva em `tests/unit/erpReadOnlyGuard.test.js` confere isso.
//
// As 8 colunas financeiras do DBCorp saem preenchidas com SENTINELAS
// (`FIN-SENTINEL-7731`, 987654.32, `31/12/2099`): se qualquer saida do nucleo
// contiver uma delas, o teste de cada camada reprova.

// Os 39 cabecalhos exatos, na ordem da planilha (inclui `NF'S ` com espaco no fim).
export const DBCORP_HEADERS = [
  'STATUS', 'EXPORTADOR', 'IMPORTADOR', 'PEDIDO', 'PO', 'REF. EMBARQUE', 'DATA PO',
  'DATA PRONTIDÃO', 'CÓD. SQ', 'CÓD. SUL', 'REF. FORNECEDOR', 'NOME COMERCIAL', 'NCM',
  'IPI (%)', 'II (%)', 'QTD - KGS', 'MOEDA', 'PREÇO FOB', 'ADI. FRETE', 'PREÇO CFR', 'TOTAL',
  'INVOICE', 'BL / AWB', 'TRACKING NUMBER', 'ORIGEM (POL)', 'DESTINO (POD)', 'NAVIO',
  'ETD (EMBARQUE)', 'ETA (CHEGADA)', 'ETA FINAL', 'PAYMENT TERM', 'VENCIMENTO', 'PTAX (DI)',
  'Nº DI', 'DATA EMISSÃO (DI)', "NF'S ", "DATA EMISSÃO (NF'S)", 'STATUS NF', 'ItemPedCpId',
]

export const FINANCIAL_SENTINELS = {
  text: 'FIN-SENTINEL-7731',
  number: 987654.32,
  date: '31/12/2099',
}

export const FINANCIAL_SENTINEL_STRINGS = [
  FINANCIAL_SENTINELS.text,
  String(FINANCIAL_SENTINELS.number),
  FINANCIAL_SENTINELS.date,
]

const GREEK = [
  'ALFA', 'BETA', 'GAMA', 'DELTA', 'EPSILON', 'ZETA', 'TETA', 'IOTA', 'KAPPA', 'LAMBDA',
  'MU', 'NU', 'XI', 'OMICRON', 'PI', 'RHO', 'SIGMA', 'TAU', 'UPSILON', 'FI', 'QUI', 'PSI',
  'OMEGA',
]
const GREEK_ALTERNATION = GREEK.join('|')

export const SYNTHETIC_VOCABULARY = {
  greek: GREEK,
  // EXPORTADOR: prefixo grego (`ALFA CHEM`, `ALFA CHEM 2`, `BETA (GAMA)`...).
  exporter: new RegExp(`^(?:${GREEK_ALTERNATION})(?:\\s|$)`),
  // PO: `<GREGO> <SEA|AIR|SAMPLE> 9nn-26`, com sufixo de divisao opcional.
  po: new RegExp(`^(?:${GREEK_ALTERNATION}) (?:SEA|AIR|SAMPLE) 9\\d\\d-26(?:\\.\\d)?$`),
  // NAVIO: prefixo grego ou placeholder/vazio.
  vessel: new RegExp(`^(?:(?:${GREEK_ALTERNATION})(?:\\s|/|$).*|AMOSTRA|COURIER|NACIONAL)?$`),
  pedidoRange: [9000, 9999],
  conRef: /^CON (CN|DG) 9\d\d-26$/,
}

const KEY_BY_HEADER = {
  STATUS: 'status',
  EXPORTADOR: 'exporter',
  PEDIDO: 'pedido',
  PO: 'poRef',
  'REF. EMBARQUE': 'refEmbarque',
  'DATA PO': 'poDate',
  'DATA PRONTIDÃO': 'readinessText',
  'CÓD. SQ': 'sqCode',
  'REF. FORNECEDOR': 'supplierRef',
  'NOME COMERCIAL': 'commercialName',
  NCM: 'ncm',
  'IPI (%)': 'ipiRate',
  'II (%)': 'iiRate',
  'QTD - KGS': 'quantityKg',
  INVOICE: 'invoice',
  'BL / AWB': 'blAwb',
  'TRACKING NUMBER': 'tracking',
  'ORIGEM (POL)': 'origin',
  'DESTINO (POD)': 'destination',
  NAVIO: 'vesselRaw',
  'ETD (EMBARQUE)': 'etd',
  'ETA (CHEGADA)': 'eta',
  'ETA FINAL': 'etaFinal',
  'Nº DI': 'diNumber',
  'DATA EMISSÃO (DI)': 'diDate',
  "NF'S ": 'nfNumbers',
  "DATA EMISSÃO (NF'S)": 'nfDate',
  'STATUS NF': 'statusNf',
  ItemPedCpId: 'itemId',
}

const FINANCIAL_VALUE_BY_HEADER = {
  MOEDA: FINANCIAL_SENTINELS.text,
  'PREÇO FOB': FINANCIAL_SENTINELS.number,
  'ADI. FRETE': FINANCIAL_SENTINELS.number,
  'PREÇO CFR': FINANCIAL_SENTINELS.number,
  TOTAL: FINANCIAL_SENTINELS.number,
  'PAYMENT TERM': FINANCIAL_SENTINELS.text,
  VENCIMENTO: FINANCIAL_SENTINELS.date,
  'PTAX (DI)': FINANCIAL_SENTINELS.number,
}

const DISCARDED_VALUE_BY_HEADER = {
  IMPORTADOR: 'OMEGA IMPORTADORA',
  'CÓD. SUL': '',
}

export const SLOT_KEYS = ['shipmentKind', 'consolidatedRef', 'incoterm', 'originHint', 'vesselName', 'voyage']

let itemSequence = 0

// Linha "solta" (chaves canonicas, valores crus) com padroes validos.
export function makeLooseRow(overrides = {}) {
  itemSequence += 1
  return {
    status: 'EMBARCOU',
    exporter: 'ALFA CHEM',
    pedido: 9000,
    poRef: 'ALFA SEA 900-26',
    refEmbarque: 'FCL - CFR HAMBURG',
    poDate: '',
    readinessText: '',
    sqCode: '',
    supplierRef: '',
    commercialName: 'RESINA OMEGA',
    ncm: '',
    ipiRate: '',
    iiRate: '',
    quantityKg: 1000,
    invoice: '',
    blAwb: '',
    tracking: '',
    origin: '',
    destination: '',
    vesselRaw: '',
    etd: '',
    eta: '',
    etaFinal: '',
    diNumber: '',
    diDate: '',
    nfNumbers: '',
    nfDate: '',
    statusNf: 'Pendente',
    itemId: `ITEM-${itemSequence}`,
    ...overrides,
  }
}

// Matriz (aoa) no formato da planilha: cabecalho + linhas, com as colunas
// financeiras sempre preenchidas com as sentinelas.
export function looseRowsToMatrix(looseRows, { leadingRows = [], headers = DBCORP_HEADERS } = {}) {
  const body = looseRows.map((row) =>
    headers.map((header) => {
      if (Object.prototype.hasOwnProperty.call(KEY_BY_HEADER, header)) {
        const value = row[KEY_BY_HEADER[header]]
        return value === undefined ? '' : value
      }
      if (Object.prototype.hasOwnProperty.call(FINANCIAL_VALUE_BY_HEADER, header)) {
        return FINANCIAL_VALUE_BY_HEADER[header]
      }
      if (Object.prototype.hasOwnProperty.call(DISCARDED_VALUE_BY_HEADER, header)) {
        return DISCARDED_VALUE_BY_HEADER[header]
      }
      return ''
    })
  )
  return [...leadingRows, headers, ...body]
}

// Processo do Portal ja no formato lido por `listProcesses`.
export function makePortalProcess(overrides = {}) {
  return {
    id: 'p-1',
    name: '',
    processNumber: '',
    category: 'FCL',
    archived: false,
    processStatus: 'Aguardando Embarque',
    supplierName: '',
    originLocation: '',
    incoterm: '',
    destination: '',
    etd: '',
    eta: '',
    shippedAt: '',
    vesselName: '',
    voyage: '',
    transshipment: false,
    transshipmentPort: '',
    masterBl: '',
    houseBl: '',
    mawb: '',
    hawb: '',
    purchaseOrders: [],
    items: [],
    duimpNumber: '',
    duimpRegisteredAt: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Cenario integrado (contrato xlsx x API, UI do modal). `today` = 2026-10-02.
// Cada linha leva os SLOTS escritos a mao: a matriz (xlsx) ignora; a versao
// "tipo API" os manda prontos. Se o parser derivar algo diferente, o teste de
// contrato reprova.
// ---------------------------------------------------------------------------
export const SCENARIO_TODAY = '2026-10-02'

function scenarioRow(overrides, slots) {
  return { loose: makeLooseRow(overrides), slots }
}

const NO_SLOTS = { consolidatedRef: '', incoterm: '', originHint: '', vesselName: '', voyage: '' }

export function buildScenarioEntries() {
  itemSequence = 0
  const fcl = {
    status: 'EMBARCOU', exporter: 'BETA TRADING', pedido: 9036, poRef: 'BETA SEA 904-26',
    refEmbarque: 'FCL - CFR HAMBURG', blAwb: 'BL9036', origin: 'HAMBURG', destination: 'ITAJAI',
    vesselRaw: 'ALFA MAERSK 639W', etd: 46301, eta: 46309, commercialName: 'RESINA OMEGA',
  }
  const fclSlots = { ...NO_SLOTS, shipmentKind: 'FCL', incoterm: 'CFR', originHint: '', vesselName: 'ALFA MAERSK', voyage: '639W' }
  const con = {
    status: 'EMBARCOU', refEmbarque: 'CON CN 901-26', blAwb: 'CONBL901', origin: 'SHANGHAI',
    destination: 'NAVEGANTES', vesselRaw: 'DELTA BRIDGE/105W', etd: 46301, eta: 46309,
    commercialName: 'SOLVENTE PI',
  }
  const conSlots = { ...NO_SLOTS, shipmentKind: 'CONSOLIDADO', consolidatedRef: 'CON CN 901-26', vesselName: 'DELTA BRIDGE', voyage: '105W' }
  const lclHubSlots = { ...NO_SLOTS, shipmentKind: 'LCL', incoterm: 'FOB', originHint: 'SHANGHAI' }
  return [
    scenarioRow({ ...fcl, itemId: 'I-001', quantityKg: 1000 }, fclSlots),
    scenarioRow({ ...fcl, itemId: 'I-002', quantityKg: 500.5 }, fclSlots),
    scenarioRow({ ...con, itemId: 'I-003', exporter: 'ALFA CHEM 2', pedido: 9010, poRef: 'ALFA SEA 905-26', quantityKg: 2000 }, conSlots),
    scenarioRow({ ...con, itemId: 'I-004', exporter: 'GAMA TRADING', pedido: 9011, poRef: 'GAMA SEA 906-26', quantityKg: 3000 }, conSlots),
    scenarioRow({
      itemId: 'I-005', status: 'AG. PRONT. DA CARGA', exporter: 'OMICRON TRADING', pedido: 9172, poRef: 'OMICRON SEA 907-26',
      refEmbarque: 'LCL -  FOB SHANGHAI', etd: 46281, commercialName: 'ACIDO PSI', quantityKg: 800,
    }, lclHubSlots),
    scenarioRow({
      itemId: 'I-006', status: 'AG. EMBARQUE', exporter: 'PI TRADING', pedido: 9180, poRef: 'PI SEA 908-26',
      refEmbarque: 'NACIONAL', commercialName: 'SAL TAU', quantityKg: 100,
    }, { ...NO_SLOTS, shipmentKind: 'NACIONAL' }),
    scenarioRow({
      itemId: 'I-007', status: 'EMBARCOU', exporter: 'MU TRADING', pedido: 9190, poRef: 'MU SAMPLE 903-26',
      refEmbarque: 'AMOSTRA', vesselRaw: 'AMOSTRA', commercialName: 'AMOSTRA SIGMA', quantityKg: 5,
    }, { ...NO_SLOTS, shipmentKind: 'AMOSTRA' }),
    scenarioRow({
      itemId: 'I-008', status: 'EMBARCOU', exporter: 'RHO TRADING', pedido: 9174, poRef: 'RHO SEA 911-26',
      refEmbarque: 'LCL - FOB SHANGHAI', etd: 46301, eta: 46330, commercialName: 'GLICOL UPSILON', quantityKg: 900,
    }, lclHubSlots),
    scenarioRow({
      itemId: 'I-009', status: 'ATRAC. AG. LIBERAÇÃO', statusNf: 'Recebido Total', exporter: 'XI TRADING', pedido: 9200,
      poRef: 'XI SEA 912-26', refEmbarque: 'FCL - FOB BUSAN', commercialName: 'OLEO FI', quantityKg: 700,
    }, { ...NO_SLOTS, shipmentKind: 'FCL', incoterm: 'FOB', originHint: 'BUSAN' }),
    scenarioRow({
      itemId: 'I-010', status: 'CONCLUÍDO', exporter: 'TAU TRADING', pedido: 9210, poRef: 'TAU SEA 913-26',
      refEmbarque: 'FCL - FOB KOBE', commercialName: 'RESINA QUI', quantityKg: 300,
    }, { ...NO_SLOTS, shipmentKind: 'FCL', incoterm: 'FOB', originHint: 'KOBE' }),
  ]
}

export function buildScenarioLooseRows() {
  return buildScenarioEntries().map((entry) => entry.loose)
}

// Mesmo dataset como uma API entregaria: sem `rowNumber`, PEDIDO numerico,
// datas `YYYY-MM-DDT00:00:00` e slots ja preenchidos.
const SERIAL_TO_ISO = { 46301: '2026-10-06', 46309: '2026-10-14', 46281: '2026-09-16', 46330: '2026-11-04' }

export function buildScenarioApiRows() {
  return buildScenarioEntries().map(({ loose, slots }) => {
    const api = { ...loose, ...slots, rowNumber: null }
    for (const key of ['etd', 'eta']) {
      if (typeof api[key] === 'number') api[key] = `${SERIAL_TO_ISO[api[key]]}T00:00:00`
    }
    return api
  })
}

export function buildScenarioPortalProcesses() {
  return [
    makePortalProcess({
      id: 'p-fcl', name: 'BETA SEA 904-26', processNumber: '9036', category: 'FCL', processStatus: 'Embarcou',
      supplierName: 'BETA TRADING', originLocation: 'HAMBURG', incoterm: 'CFR', destination: 'ITAJAÍ',
      etd: '2026-09-30', eta: '2026-10-14', vesselName: 'ALFA MAERSK', voyage: '639W', masterBl: 'BL9036',
      items: [{ id: 'it-1', commercialName: 'RESINA OMEGA', quantity: 1500 }],
    }),
    makePortalProcess({
      id: 'p-con', name: 'CON CN 901-26', processNumber: '', category: 'CONSOLIDADO', processStatus: 'Embarcou',
      originLocation: 'SHANGHAI', destination: 'NAVEGANTES', etd: '2026-10-06', eta: '2026-10-14',
      vesselName: 'DELTA BRIDGE', voyage: '105W', masterBl: 'CONBL901',
      purchaseOrders: [
        { po: '9010', reference: 'ALFA SEA 905-26', supplierName: 'ALFA CHEM' },
        { po: '9011', reference: 'GAMA SEA 906-26', supplierName: 'GAMA TRADING' },
      ],
      items: [
        { id: 'it-2', commercialName: 'SOLVENTE PI', quantity: 2000, poNumber: '9010' },
        { id: 'it-3', commercialName: 'SOLVENTE PI', quantity: 3000, poNumber: '9011' },
      ],
    }),
    makePortalProcess({
      id: 'p-done', name: 'TAU SEA 913-26', processNumber: '9210', category: 'FCL', processStatus: 'Carga recebida',
      supplierName: 'TAU TRADING', originLocation: 'KOBE', incoterm: 'FOB',
      items: [{ id: 'it-4', commercialName: 'RESINA QUI', quantity: 300 }],
    }),
    makePortalProcess({ id: 'p-orphan', name: 'ZETA SEA 999-26', processNumber: '9999', category: 'LCL' }),
    makePortalProcess({ id: 'p-arch', name: 'SIGMA SEA 998-26', processNumber: '9998', category: 'FCL', archived: true }),
  ]
}
