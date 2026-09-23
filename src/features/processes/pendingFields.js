// F17.1a (D-E): "dados pendentes" - so' admin. Calculado na leitura, nunca
// gravado. Extensivel: F17.2+ so acrescenta objetos a este array (novos
// campos de transito/desembaraco).

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
  {
    id: 'containerQuantity',
    field: 'containerQuantity',
    label: 'Quantidade de contêineres',
    stage: 0,
    categories: ['FCL', 'CONSOLIDADO'],
    isMissing: (p) => !(Number(p?.containerQuantity) >= 1),
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
