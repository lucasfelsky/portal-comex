// F17.1a/F17.2a (D-E, D-6): "dados pendentes" - so' admin. Calculado na
// leitura, nunca gravado. Extensivel: F17.2+ so acrescenta objetos a este
// array (novos campos de transito/desembaraco).

import { deriveProcessStatus } from './deriveProcessStatus.js'
import { getProcessStage } from './processStage.js'
import { isMaritimeCategory } from './processCategories.js'
import { getCollectionWindows } from '../../utils/collectionWindows.js'
import { getEffectiveLicenses } from './licenses.js'
import {
  MIN_CONSOLIDATED_PURCHASE_ORDERS,
  getProcessPurchaseOrders,
} from './purchaseOrders.js'
import { isLegacyProcessDangerousGoods } from './operationalOptions.js'
import {
  CE_HOUSE_CATEGORIES,
  CUSTOMS_INSPECTION_CHANNELS,
  FREE_TIME_CATEGORIES,
  hasDuimpRegistrationSignal,
  hasParameterizationSignal,
  isApproxDate,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
} from './arrivalCustoms.js'

function hasText(value) {
  return String(value ?? '').trim() !== ''
}

function hasValidItems(process) {
  return (
    Array.isArray(process?.items) &&
    process.items.some((item) => hasText(item?.commercialName) && Number(item?.quantity) > 0)
  )
}

function hasContainerWithout(process, field) {
  const containers = Array.isArray(process?.containers) ? process.containers : []
  return containers.some((container) => !hasText(container?.[field]))
}

export const PENDING_FIELD_RULES = [
  { id: 'name', field: 'name', label: 'Nome do processo', stage: 0, isMissing: (p) => !hasText(p?.name) },
  {
    id: 'category',
    field: 'category',
    label: 'Categoria',
    stage: 0,
    isMissing: (p) => !hasText(p?.category),
  },
  {
    id: 'destination',
    field: 'destination',
    label: 'Destino',
    stage: 0,
    isMissing: (p) => !hasText(p?.destination),
  },
  {
    id: 'processNumber',
    field: 'processNumber',
    label: 'Número do processo',
    stage: 0,
    when: (p) => p?.category !== 'CONSOLIDADO',
    isMissing: (p) => !hasText(p?.processNumber),
  },
  // F17.2c (D-11): POs do consolidado - minimo 2 (aviso, nunca bloqueio).
  {
    id: 'purchaseOrders',
    field: 'purchaseOrders',
    label: 'POs consolidadas (mín. 2)',
    stage: 0,
    categories: ['CONSOLIDADO'],
    isMissing: (p) => getProcessPurchaseOrders(p).length < MIN_CONSOLIDATED_PURCHASE_ORDERS,
  },
  {
    id: 'itemPoNumber',
    field: 'items',
    label: 'PO do item',
    stage: 0,
    categories: ['CONSOLIDADO'],
    when: (p) => hasValidItems(p),
    isMissing: (p) =>
      p.items.some(
        (item) => hasText(item?.commercialName) && Number(item?.quantity) > 0 && !hasText(item?.poNumber)
      ),
  },
  { id: 'etd', field: 'etd', label: 'ETD', stage: 0, isMissing: (p) => !hasText(p?.etd) },
  { id: 'eta', field: 'eta', label: 'ETA', stage: 0, isMissing: (p) => !hasText(p?.eta) },
  {
    id: 'items',
    field: 'items',
    label: 'Itens',
    stage: 0,
    isMissing: (p) => !hasValidItems(p),
  },
  // F17.2a (D-6): substitui a regra antiga de `containerQuantity` (o campo
  // agora e' derivado de `containers.length`, ver D-4).
  {
    id: 'containers',
    field: 'containers',
    label: 'Contêineres (mín. 1)',
    stage: 0,
    categories: ['FCL', 'CONSOLIDADO'],
    isMissing: (p) => !(Array.isArray(p?.containers) && p.containers.length >= 1),
  },
  {
    id: 'containerTypes',
    field: 'containers',
    label: 'Tipo de contêiner',
    stage: 0,
    categories: ['FCL', 'CONSOLIDADO'],
    when: (p) => Array.isArray(p?.containers) && p.containers.length >= 1,
    isMissing: (p) => hasContainerWithout(p, 'type'),
  },
  {
    id: 'palletQuantity',
    field: 'palletQuantity',
    label: 'Quantidade de pallets',
    stage: 0,
    categories: ['LCL'],
    isMissing: (p) => !(Number(p?.palletQuantity) >= 1),
  },
  {
    id: 'supplierName',
    field: 'supplierName',
    label: 'Fornecedor',
    stage: 0,
    isMissing: (p) => !hasText(p?.supplierName),
  },
  {
    id: 'originLocation',
    field: 'originLocation',
    label: 'Origem',
    stage: 0,
    isMissing: (p) => !hasText(p?.originLocation),
  },
  {
    id: 'incoterm',
    field: 'incoterm',
    label: 'Incoterm',
    stage: 0,
    isMissing: (p) => !hasText(p?.incoterm),
  },
  {
    id: 'grossWeightKg',
    field: 'grossWeightKg',
    label: 'Peso bruto',
    stage: 0,
    categories: ['LCL', 'AEREO'],
    isMissing: (p) => !(Number(p?.grossWeightKg) > 0),
  },
  {
    id: 'volumeM3',
    field: 'volumeM3',
    label: 'Cubagem',
    stage: 0,
    categories: ['LCL'],
    isMissing: (p) => !(Number(p?.volumeM3) > 0),
  },
  {
    id: 'chargeableWeightKg',
    field: 'chargeableWeightKg',
    label: 'Peso taxado',
    stage: 0,
    categories: ['AEREO'],
    isMissing: (p) => !(Number(p?.chargeableWeightKg) > 0),
  },
  {
    id: 'packagesQuantity',
    field: 'packagesQuantity',
    label: 'Volumes',
    stage: 0,
    categories: ['AEREO'],
    isMissing: (p) => !(Number(p?.packagesQuantity) > 0),
  },
  // F17.2d-1 (D-4/D-5, Q4): carga perigosa passou a ser classificada POR
  // ITEM - substitui as regras antigas de nivel-processo (`unNumber`/
  // `imoClass`). Processo legado (flag true, nenhum item classificado)
  // vira pendencia dedicada; item classificado sem ONU/classe cobra por
  // item.
  {
    id: 'dangerousGoodsPerItem',
    field: 'dangerousGoods',
    label: 'Classificar carga perigosa por item',
    stage: 0,
    when: (p) => isLegacyProcessDangerousGoods(p),
    isMissing: () => true,
  },
  {
    id: 'itemUnNumber',
    field: 'items',
    label: 'Número ONU do item',
    stage: 0,
    isMissing: (p) =>
      Array.isArray(p?.items) &&
      p.items.some((item) => item?.dangerousGoods === true && !hasText(item?.unNumber)),
  },
  {
    id: 'itemImoClass',
    field: 'items',
    label: 'Classe IMO do item',
    stage: 0,
    isMissing: (p) =>
      Array.isArray(p?.items) &&
      p.items.some((item) => item?.dangerousGoods === true && !hasText(item?.imoClass)),
  },
  {
    id: 'shippedAt',
    field: 'shippedAt',
    label: 'Embarque confirmado',
    stage: 1,
    isMissing: (p) => !hasText(p?.shippedAt),
  },
  {
    id: 'masterBl',
    field: 'masterBl',
    label: 'MBL',
    stage: 1,
    categories: ['FCL'],
    isMissing: (p) => !hasText(p?.masterBl),
  },
  {
    id: 'houseBl',
    field: 'houseBl',
    label: 'HBL',
    stage: 1,
    categories: ['LCL', 'CONSOLIDADO'],
    isMissing: (p) => !hasText(p?.houseBl),
  },
  {
    id: 'mawb',
    field: 'mawb',
    label: 'MAWB',
    stage: 1,
    categories: ['AEREO'],
    isMissing: (p) => !hasText(p?.mawb),
  },
  {
    id: 'vesselName',
    field: 'vesselName',
    label: 'Navio',
    stage: 1,
    when: (p) => isMaritimeCategory(p?.category),
    isMissing: (p) => !hasText(p?.vesselName),
  },
  {
    id: 'voyage',
    field: 'voyage',
    label: 'Viagem',
    stage: 1,
    when: (p) => isMaritimeCategory(p?.category),
    isMissing: (p) => !hasText(p?.voyage),
  },
  {
    id: 'flightNumber',
    field: 'flightNumber',
    label: 'Voo',
    stage: 1,
    categories: ['AEREO'],
    isMissing: (p) => !hasText(p?.flightNumber),
  },
  {
    id: 'containerNumbers',
    field: 'containers',
    label: 'Número de contêiner',
    stage: 1,
    categories: ['FCL', 'CONSOLIDADO'],
    isMissing: (p) => hasContainerWithout(p, 'number'),
  },
  {
    id: 'containerSeals',
    field: 'containers',
    label: 'Lacre de contêiner',
    stage: 1,
    categories: ['FCL', 'CONSOLIDADO'],
    isMissing: (p) => hasContainerWithout(p, 'seal'),
  },
  // F17.2b (D-7): substitui a pendencia antiga de MAPA - le `licenses[]`
  // (com compat de leitura, `getEffectiveLicenses`), TODAS as categorias.
  // Stage 0 (nao a etapa do processo): o gatilho e' o status explicito da
  // anuencia - com stage 3 a pendencia ficaria invisivel enquanto a
  // vistoria/deferimento acontece antes da chegada.
  {
    id: 'licenseInspectionDate',
    field: 'licenses',
    label: 'Data da vistoria da anuência',
    stage: 0,
    isMissing: (p) =>
      getEffectiveLicenses(p).some(
        (license) => license?.status === 'Vistoria agendada' && !hasText(license?.inspectionScheduledAt)
      ),
  },
  {
    id: 'licenseDeferredDate',
    field: 'licenses',
    label: 'Data do deferimento da anuência',
    stage: 0,
    isMissing: (p) =>
      getEffectiveLicenses(p).some(
        (license) => license?.status === 'Deferida' && !hasText(license?.deferredAt)
      ),
  },
  // F17.3b (D-6): DUIMP completa - numero, datas de registro/parametrizacao
  // (legado sem data), canal, conferencia (Amarelo/Vermelho) e procedimento
  // especial (Cinza). Guarda "derivado != Carga recebida": processo
  // historico ja recebido nao ganha ruido (spec, secao Migracao).
  {
    id: 'duimpNumber',
    field: 'duimpNumber',
    label: 'Nº da DUIMP',
    stage: 3,
    when: (p) => hasDuimpRegistrationSignal(p),
    isMissing: (p) => !hasText(p?.duimpNumber),
  },
  {
    id: 'duimpRegisteredAt',
    field: 'duimpRegisteredAt',
    label: 'Data do registro da DUIMP',
    stage: 3,
    when: (p) => isLegacyDuimpRegisteredWithoutDate(p) && deriveProcessStatus(p) !== 'Carga recebida',
    isMissing: () => true,
  },
  {
    id: 'parameterizedAt',
    field: 'parameterizedAt',
    label: 'Data da parametrização',
    stage: 3,
    when: (p) => isLegacyParameterizedWithoutDate(p) && deriveProcessStatus(p) !== 'Carga recebida',
    isMissing: () => true,
  },
  {
    id: 'parameterizationChannel',
    field: 'parameterizationChannel',
    label: 'Canal da parametrização',
    stage: 3,
    when: (p) => hasParameterizationSignal(p),
    isMissing: (p) => !hasText(p?.parameterizationChannel),
  },
  {
    id: 'customsInspectionScheduledAt',
    field: 'customsInspectionScheduledAt',
    label: 'Data da conferência aduaneira',
    stage: 3,
    when: (p) =>
      hasParameterizationSignal(p) && CUSTOMS_INSPECTION_CHANNELS.includes(p?.parameterizationChannel),
    isMissing: (p) => !hasText(p?.customsInspectionScheduledAt),
  },
  {
    id: 'customsRequirementNotes',
    field: 'customsRequirementNotes',
    label: 'Procedimento especial (canal Cinza)',
    stage: 3,
    when: (p) => hasParameterizationSignal(p) && p?.parameterizationChannel === 'Cinza',
    isMissing: (p) => !hasText(p?.customsRequirementNotes),
  },
  {
    // AD-1/F17.3b: desembaraco concluido cobrado quando a duimp ja
    // parametrizou e o canal esta preenchido - exceto Verde ja recebido
    // (spec, secao Migracao: "Parametrizada + Verde -> clearanceCompletedAt
    // = null + pendencia", mas processo historico ja recebido nao pede).
    id: 'clearanceCompletedAt',
    field: 'clearanceCompletedAt',
    label: 'Data do desembaraço',
    stage: 3,
    when: (p) =>
      hasParameterizationSignal(p) &&
      hasText(p?.parameterizationChannel) &&
      (p?.parameterizationChannel !== 'Verde' || deriveProcessStatus(p) !== 'Carga recebida'),
    isMissing: (p) => !hasText(p?.clearanceCompletedAt),
  },
  {
    id: 'carrierName',
    field: 'carrierName',
    label: 'Transportadora',
    stage: 4,
    when: (p) => getCollectionWindows(p).some((window) => hasText(window?.scheduledAt)),
    isMissing: (p) => !hasText(p?.carrierName),
  },
  // F17.3a (D-6): Etapa 3 (chegada/CE/terminal/free time) + presenca de
  // carga (stage 3). Datas aproximadas (`migratedApproxFields`) NAO geram
  // pendencia - `isApproxDate` cobre o gate.
  {
    id: 'ceMercante',
    field: 'ceMercante',
    label: 'CE Mercante',
    stage: 2,
    when: (p) => isMaritimeCategory(p?.category),
    isMissing: (p) => !hasText(p?.ceMercante),
  },
  {
    id: 'ceHouse',
    field: 'ceHouse',
    label: 'CE house',
    stage: 2,
    categories: CE_HOUSE_CATEGORIES,
    isMissing: (p) => !hasText(p?.ceHouse),
  },
  {
    id: 'terminalName',
    field: 'terminalName',
    label: 'Terminal / armazém',
    stage: 2,
    when: (p) => isMaritimeCategory(p?.category),
    isMissing: (p) => !hasText(p?.terminalName),
  },
  {
    id: 'freeTimeDays',
    field: 'freeTimeDays',
    label: 'Free time (dias)',
    stage: 2,
    categories: FREE_TIME_CATEGORIES,
    isMissing: (p) => p?.freeTimeDays == null,
  },
  {
    id: 'berthedAt',
    field: 'berthedAt',
    label: 'Data da atracação',
    stage: 2,
    when: (p) => isMaritimeCategory(p?.category) && p?.berthed === true,
    isMissing: (p) => !hasText(p?.berthedAt) && !isApproxDate(p, 'berthedAt'),
  },
  {
    id: 'arrivedAt',
    field: 'arrivedAt',
    label: 'Data da chegada',
    stage: 2,
    categories: ['AEREO'],
    when: (p) => p?.arrived === true,
    isMissing: (p) => !hasText(p?.arrivedAt) && !isApproxDate(p, 'arrivedAt'),
  },
  {
    id: 'cargoPresenceInformedAt',
    field: 'cargoPresenceInformedAt',
    label: 'Data da presença de carga',
    stage: 3,
    categories: FREE_TIME_CATEGORIES,
    when: (p) => p?.cargoPresenceInformed === true,
    isMissing: (p) => !hasText(p?.cargoPresenceInformedAt),
  },
]

export function getPendingFields(process) {
  const derivedStatus = deriveProcessStatus(process)
  const { currentStage } = getProcessStage({ processStatus: derivedStatus })

  return PENDING_FIELD_RULES.filter((rule) => {
    if (rule.stage > currentStage) return false
    if (rule.categories && !rule.categories.includes(process?.category)) return false
    if (rule.when && !rule.when(process)) return false
    return rule.isMissing(process)
  }).map((rule) => ({ id: rule.id, field: rule.field, label: rule.label, stage: rule.stage }))
}
