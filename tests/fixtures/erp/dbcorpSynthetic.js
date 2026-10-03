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

// ---------------------------------------------------------------------------
// Cenario da CRIACAO de processos (F3). Datas relativas a `SCENARIO_TODAY`
// ('2026-10-02'), escritas como serial do Excel (o formato real da planilha).
// Nomes, POs, REFs e BLs sao sinteticos (prefixo grego, PEDIDO 9nnn, REF
// `CON DG 9nn-26`, BL `HBL-9nn`).
// ---------------------------------------------------------------------------
const MS_PER_DAY = 86400000
const EXCEL_EPOCH_SERIAL = 25569

// 'YYYY-MM-DD' -> serial do Excel (so' aritmetica em UTC, sem Date a partir de texto).
export function isoToExcelSerial(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY) + EXCEL_EPOCH_SERIAL
}

// Chave do embarque (PO ou REF) de cada linha do cenario.
export const CREATION_SCENARIO_KEYS = {
  fclAgEmbarque: 'ALFA SEA 962-26',
  lclAgEmbarque: 'BETA SEA 963-26',
  con: 'CON DG 964-26',
  fclEmbarcouComDi: 'ZETA SEA 967-26',
  fclAtracado: 'TETA SEA 968-26',
  fclConflito: 'IOTA SEA 969-26',
  fclDoisPedidos: 'KAPPA SEA 984-26',
  fclSemEta: 'LAMBDA SEA 985-26',
  aConsolidar: 'MU SEA 986-26',
  aguardandoProntidao: 'NU SEA 987-26',
  amostra: 'XI SAMPLE 988-26',
  nacional: 'OMICRON SEA 989-26',
  erpDesatualizado: 'PI SEA 990-26',
  possivelmenteRecebido: 'RHO SEA 991-26',
  indefinido: 'SIGMA SEA 992-26',
  aereo: 'TAU AIR 993-26',
}

// 8 embarques criaveis (4 em aguardando_embarque e 4 em embarcado_sem_processo), 7 de
// categorias excluidas e 1 AEREO (nao criavel). Datas de etd/eta/diDate entram como
// YYYY-MM-DD e saem como serial do Excel.
export function buildCreationScenarioLooseRows() {
  let sequence = 0
  const row = (overrides) => {
    sequence += 1
    const next = { ...overrides }
    for (const key of ['etd', 'eta', 'diDate']) {
      if (typeof next[key] === 'string' && next[key] !== '') next[key] = isoToExcelSerial(next[key])
    }
    return makeLooseRow({ itemId: `C-${String(sequence).padStart(3, '0')}`, ...next })
  }
  const K = CREATION_SCENARIO_KEYS
  return [
    // FCL AG. EMBARQUE: FOB com local (ORIGEM vazia -> origem pela dica), BL, ETD futuro.
    row({
      status: 'AG. EMBARQUE', exporter: 'ALFA CHEM', pedido: 9620, poRef: K.fclAgEmbarque,
      refEmbarque: 'FCL - FOB KOBE', blAwb: 'HBL-962', destination: 'Itajaí', etd: '2026-10-20',
      eta: '2026-11-25', commercialName: 'RESINA OMEGA', quantityKg: 1000,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'ALFA CHEM', pedido: 9620, poRef: K.fclAgEmbarque,
      refEmbarque: 'FCL - FOB KOBE', blAwb: 'HBL-962', destination: 'Itajaí', etd: '2026-10-20',
      eta: '2026-11-25', commercialName: 'SOLVENTE PI', quantityKg: 500.5,
    }),
    // LCL AG. EMBARQUE: FOB fora do hub SHANGHAI.
    row({
      status: 'AG. EMBARQUE', exporter: 'BETA TRADING', pedido: 9630, poRef: K.lclAgEmbarque,
      refEmbarque: 'LCL - FOB NINGBO', blAwb: 'HBL-963', destination: 'Navegantes', etd: '2026-10-18',
      eta: '2026-11-22', commercialName: 'GLICOL UPSILON', quantityKg: 800,
    }),
    // CON: 3 PEDIDOs, 3 exportadores, BL, e itens de mesmo nome em 2 PEDIDOs.
    row({
      status: 'AG. EMBARQUE', exporter: 'GAMA TRADING', pedido: 9640, poRef: 'GAMA SEA 964-26',
      refEmbarque: K.con, blAwb: 'HBL-964', origin: 'SHANGHAI', destination: 'NAVEGANTES',
      etd: '2026-10-15', eta: '2026-11-20', commercialName: 'SOLVENTE PI', quantityKg: 2000,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'DELTA CHEM', pedido: 9641, poRef: 'DELTA SEA 965-26',
      refEmbarque: K.con, blAwb: 'HBL-964', origin: 'SHANGHAI', destination: 'NAVEGANTES',
      etd: '2026-10-15', eta: '2026-11-20', commercialName: 'SOLVENTE PI', quantityKg: 1500,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'EPSILON TRADING', pedido: 9642, poRef: 'EPSILON SEA 966-26',
      refEmbarque: K.con, blAwb: 'HBL-964', origin: 'SHANGHAI', destination: 'NAVEGANTES',
      etd: '2026-10-15', eta: '2026-11-20', commercialName: 'ACIDO PSI', quantityKg: 800,
    }),
    // FCL EMBARCOU: ETD passado, ETA futura, Nº DI, DATA DI e BL.
    row({
      status: 'EMBARCOU', exporter: 'ZETA TRADING', pedido: 9670, poRef: K.fclEmbarcouComDi,
      refEmbarque: 'FCL - CFR HAMBURG', blAwb: 'HBL-967', origin: 'HAMBURG', destination: 'ITAJAI',
      vesselRaw: 'ALFA MAERSK 639W', etd: '2026-09-28', eta: '2026-10-20',
      diNumber: '25/1234567-8', diDate: '2026-10-01', commercialName: 'OLEO FI', quantityKg: 700,
    }),
    // FCL ATRAC. AG. LIBERACAO: ETA ha 2 dias (<= 7), sem NF recebida.
    row({
      status: 'ATRAC. AG. LIBERAÇÃO', exporter: 'TETA TRADING', pedido: 9680, poRef: K.fclAtracado,
      refEmbarque: 'FCL - FOB BUSAN', blAwb: 'HBL-968', vesselRaw: 'BETA FAME 12W', etd: '2026-09-10',
      eta: '2026-09-30', commercialName: 'RESINA QUI', quantityKg: 300,
    }),
    // FCL com 2 ETDs e 2 navios (conflito).
    row({
      status: 'EMBARCOU', exporter: 'IOTA TRADING', pedido: 9690, poRef: K.fclConflito,
      refEmbarque: 'FCL - CFR HAMBURG', blAwb: 'HBL-969', vesselRaw: 'ALFA MAERSK 639W',
      etd: '2026-09-25', eta: '2026-10-25', commercialName: 'RESINA OMEGA', quantityKg: 1200,
    }),
    row({
      status: 'EMBARCOU', exporter: 'IOTA TRADING', pedido: 9690, poRef: K.fclConflito,
      refEmbarque: 'FCL - CFR HAMBURG', blAwb: 'HBL-969', vesselRaw: 'BETA FAME 12W',
      etd: '2026-09-26', eta: '2026-10-25', commercialName: 'SOLVENTE PI', quantityKg: 400,
    }),
    // FCL com 2 PEDIDOs e 2 exportadores (mesma PO).
    row({
      status: 'AG. EMBARQUE', exporter: 'KAPPA CHEM', pedido: 9841, poRef: K.fclDoisPedidos,
      refEmbarque: 'FCL - FOB KOBE', etd: '2026-10-22', eta: '2026-11-27', commercialName: 'ACIDO PSI', quantityKg: 600,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'KAPPA TRADING', pedido: 9840, poRef: K.fclDoisPedidos,
      refEmbarque: 'FCL - FOB KOBE', etd: '2026-10-22', eta: '2026-11-27', commercialName: 'SAL TAU', quantityKg: 250,
    }),
    // FCL EMBARCOU sem ETA (needsReview).
    row({
      status: 'EMBARCOU', exporter: 'LAMBDA TRADING', pedido: 9850, poRef: K.fclSemEta,
      refEmbarque: 'FCL - CFR HAMBURG', blAwb: 'HBL-985', etd: '2026-09-29', commercialName: 'SAL TAU', quantityKg: 900,
    }),
    // Um embarque por categoria excluida (7) e o AEREO.
    row({
      status: 'AG. PRONT. DA CARGA', exporter: 'MU TRADING', pedido: 9860, poRef: K.aConsolidar,
      refEmbarque: 'LCL - FOB SHANGHAI', etd: '2026-10-10', commercialName: 'ACIDO PSI', quantityKg: 100,
    }),
    row({
      status: 'AG. PAGAMENTO (ANT)', exporter: 'NU TRADING', pedido: 9870, poRef: K.aguardandoProntidao,
      refEmbarque: 'FCL - FOB BUSAN', commercialName: 'RESINA QUI', quantityKg: 110,
    }),
    row({
      status: 'EMBARCOU', exporter: 'XI TRADING', pedido: 9880, poRef: K.amostra,
      refEmbarque: 'AMOSTRA', vesselRaw: 'AMOSTRA', commercialName: 'AMOSTRA SIGMA', quantityKg: 5,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'OMICRON TRADING', pedido: 9890, poRef: K.nacional,
      refEmbarque: 'NACIONAL', commercialName: 'SAL TAU', quantityKg: 120,
    }),
    row({
      status: 'ATRAC. AG. LIBERAÇÃO', statusNf: 'Recebido Total', exporter: 'PI TRADING', pedido: 9900,
      poRef: K.erpDesatualizado, refEmbarque: 'FCL - FOB BUSAN', commercialName: 'OLEO FI', quantityKg: 130,
    }),
    row({
      status: 'EMBARCOU', exporter: 'RHO TRADING', pedido: 9910, poRef: K.possivelmenteRecebido,
      refEmbarque: 'FCL - FOB KOBE', etd: '2026-09-01', eta: '2026-09-15', commercialName: 'RESINA OMEGA', quantityKg: 140,
    }),
    row({
      status: 'EM TRANSITO', exporter: 'SIGMA TRADING', pedido: 9920, poRef: K.indefinido,
      refEmbarque: 'FCL - FOB KOBE', commercialName: 'GLICOL UPSILON', quantityKg: 150,
    }),
    row({
      status: 'AG. EMBARQUE', exporter: 'TAU TRADING', pedido: 9930, poRef: K.aereo,
      refEmbarque: 'DAP - ITAJAI', commercialName: 'AMOSTRA SIGMA', quantityKg: 160,
    }),
  ]
}
