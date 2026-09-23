// F17.1a/F17.2a (D-E, D-6): "dados pendentes" - so' admin. Calculado na
// leitura, nunca gravado. Extensivel: F17.2+ so acrescenta objetos a este
// array (novos campos de transito/desembaraco).

import { deriveProcessStatus } from './deriveProcessStatus.js'
import { getProcessStage } from './processStage.js'
import { normalizeComparableText, isMapaInspectionScheduledStatus } from './processStatus.js'
import { isMaritimeCategory } from './processCategories.js'
import { getCollectionWindows } from '../../utils/collectionWindows.js'

function hasText(value) {
  return String(value ?? '').trim() !== ''
}

function hasValidItems(process) {
  return (
    Array.isArray(process?.items) &&
    process.items.some((item) => hasText(item?.commercialName) && Number(item?.quantity) > 0)
  )
}

function isDuimpParametrizadaNaoVerde(process) {
  const duimp = normalizeComparableText(process?.duimpStatus).trim()
  const channel = normalizeComparableText(process?.parameterizationChannel).trim()
  return duimp === 'parametrizada' && channel !== 'verde'
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
  {
    id: 'unNumber',
    field: 'unNumber',
    label: 'Número ONU',
    stage: 0,
    when: (p) => p?.dangerousGoods === true,
    isMissing: (p) => !hasText(p?.unNumber),
  },
  {
    id: 'imoClass',
    field: 'imoClass',
    label: 'Classe IMO',
    stage: 0,
    when: (p) => p?.dangerousGoods === true,
    isMissing: (p) => !hasText(p?.imoClass),
  },
  {
    id: 'shippedAt',
    field: 'shippedAt',
    label: 'Data de embarque',
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
  {
    id: 'mapaInspectionScheduledAt',
    field: 'mapaInspectionScheduledAt',
    label: 'Data da vistoria MAPA',
    stage: 3,
    when: (p) => isMaritimeCategory(p?.category) && isMapaInspectionScheduledStatus(p?.mapaStatus),
    isMissing: (p) => !hasText(p?.mapaInspectionScheduledAt),
  },
  {
    // AD-1: desembaraco concluido cobrado so quando a duimp ja parametrizou
    // e o canal nao e Verde (Verde continua liberando sozinho).
    id: 'clearanceCompletedAt',
    field: 'clearanceCompletedAt',
    label: 'Data do desembaraço',
    stage: 3,
    when: (p) => isDuimpParametrizadaNaoVerde(p),
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
