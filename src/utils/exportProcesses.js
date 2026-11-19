// F3 (backlog 2026-07-12): exportação da lista de processos para Excel.
// O time de COMEX vive em planilha — o botão "Exportar" da lista gera um
// .xlsx com as MESMAS linhas visíveis (a lista já filtrada é passada como
// argumento; filtros são respeitados por construção).
//
// Separação por testabilidade: `buildProcessesExportRows` é pura (recebe
// processos + now, devolve linhas prontas); `exportProcessesToXlsx` faz o
// I/O via import dinâmico de `xlsx` (mesmo padrão do import de itens no
// ProcessesPage — a lib só entra no chunk quando alguém usa).
import { getProcessDerivedStatus } from '../features/processes/processDerivedStatus'
import { canShowProcessName } from '../features/processes/processLabels'
import {
  canSeePurchaseOrderDetails,
  getProcessPurchaseOrders,
  getPurchaseOrderNumbers,
} from '../features/processes/purchaseOrders'
import { getCollectionWindows } from './collectionWindows'

function formatDateBr(isoDate) {
  if (!isoDate) return ''
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate))
    ? new Date(`${isoDate}T12:00:00`)
    : new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return String(isoDate)
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTimeBr(isoDateTime) {
  if (!isoDateTime) return ''
  const parsed = new Date(isoDateTime)
  if (Number.isNaN(parsed.getTime())) return String(isoDateTime)
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nextCollectionWindowLabel(process) {
  const windows = getCollectionWindows(process)
  if (!Array.isArray(windows) || windows.length === 0) return ''
  const scheduled = windows
    .map((window) => window?.scheduledAt)
    .filter(Boolean)
    .sort()
  return scheduled.length > 0 ? formatDateTimeBr(scheduled[0]) : ''
}

// Datas como TEXTO pt-BR de propósito: evita o serial date do Excel e
// mantém o arquivo legível sem formatação extra.
export function buildProcessesExportRows(processes, now = new Date(), { canSeeName = false } = {}) {
  const canSeeDetails = canSeePurchaseOrderDetails(canSeeName)
  return (Array.isArray(processes) ? processes : []).map((process) => {
    const showName = canShowProcessName(process, canSeeName)
    const purchaseOrders = getProcessPurchaseOrders(process)
    const references = canSeeDetails
      ? purchaseOrders.map((order) => order.reference).filter(Boolean)
      : []
    const supplierNames = canSeeDetails
      ? purchaseOrders.map((order) => order.supplierName).filter(Boolean)
      : []
    return {
      Processo: process.processNumber || (showName ? process.name || '' : ''),
      Nome: showName ? process.name || '' : '',
      POs: getPurchaseOrderNumbers(purchaseOrders).join(', '),
      'Referências das POs': references.join(', '),
      'Fornecedores das POs': supplierNames.join(', '),
      Categoria: process.category || '',
      Destino: process.destination || '',
      ETD: formatDateBr(process.etd),
      ETA: formatDateBr(process.eta),
      Navio: process.vesselName || '',
      Viagem: process.voyage || '',
      'IMO do navio': String(process.vesselImo ?? ''),
      'Status do processo': process.processStatus || '',
      'Status derivado': getProcessDerivedStatus(process, now).label,
      'Status de coleta': process.collectionStatus || '',
      'Próxima coleta': nextCollectionWindowLabel(process),
      Contêineres: process.containerQuantity ?? '',
      Pallets: process.palletQuantity ?? '',
    }
  })
}

export function buildExportFileName(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `processos-${year}-${month}-${day}.xlsx`
}

export async function exportProcessesToXlsx(processes, now = new Date(), options = {}) {
  const rows = buildProcessesExportRows(processes, now, options)
  const { utils, writeFile } = await import('xlsx')
  const worksheet = utils.json_to_sheet(rows)
  // Larguras aproximadas pra abrir legível sem ajuste manual.
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 24 },
    // F17.2d-2 (D-6): "Referências das POs" e "Fornecedores das POs".
    { wch: 24 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 11 },
    { wch: 11 },
    // Navio / Viagem / IMO do navio (rastreio #207).
    { wch: 22 },
    { wch: 12 },
    { wch: 13 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 17 },
    { wch: 11 },
    { wch: 9 },
  ]
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'Processos')
  writeFile(workbook, buildExportFileName(now))
  return rows.length
}

// O toast de progresso so aparece se a exportacao passar desse tempo:
// exportacoes rapidas mostram apenas o resultado, sem piscar "Gerando planilha…".
export const PROGRESS_TOAST_DELAY_MS = 400

// Fluxo de toasts da exportacao. Com `showProgress` (folha de filtros do
// mobile, que fecha ANTES de exportar e por isso nao mostra o spinner do botao)
// e depois de PROGRESS_TOAST_DELAY_MS aparece "Gerando planilha…" e o resultado
// o TROCA (`replaces`, sem empilhar). Se o resultado chegar antes disso, o timer
// e cancelado e o resultado aparece sozinho, sem `replaces`. Sem `showProgress`
// (desktop/tablet) so aparece o resultado.
export async function runProcessesExport({
  rows,
  toast,
  canSeeName = false,
  showProgress = false,
  exportFn = exportProcessesToXlsx,
  progressDelayMs = PROGRESS_TOAST_DELAY_MS,
}) {
  let progressId = null
  let settled = false
  let timerId = null
  if (showProgress) {
    timerId = setTimeout(() => {
      timerId = null
      // Nunca mostra "Gerando" depois do resultado.
      if (settled) return
      progressId = toast.info('Gerando planilha…', { persist: true })
    }, progressDelayMs)
  }
  const finish = () => {
    settled = true
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }
  const resultOptions = () => (progressId ? { replaces: progressId } : undefined)
  try {
    const exportedCount = await exportFn(rows, new Date(), { canSeeName })
    finish()
    toast.success(`Exportados ${exportedCount} processos para Excel.`, resultOptions())
  } catch (error) {
    console.error('Falha ao exportar processos.', error)
    finish()
    toast.error('Não foi possível exportar os processos.', resultOptions())
  }
}
