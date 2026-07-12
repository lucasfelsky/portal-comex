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
export function buildProcessesExportRows(processes, now = new Date()) {
  return (Array.isArray(processes) ? processes : []).map((process) => ({
    Processo: process.processNumber || process.name || '',
    Nome: process.name || '',
    Categoria: process.category || '',
    Destino: process.destination || '',
    ETD: formatDateBr(process.etd),
    ETA: formatDateBr(process.eta),
    'Status do processo': process.processStatus || '',
    'Status derivado': getProcessDerivedStatus(process, now).label,
    'Status de coleta': process.collectionStatus || '',
    'Próxima coleta': nextCollectionWindowLabel(process),
    Containers: process.containerQuantity ?? '',
    Pallets: process.palletQuantity ?? '',
  }))
}

export function buildExportFileName(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `processos-${year}-${month}-${day}.xlsx`
}

export async function exportProcessesToXlsx(processes, now = new Date()) {
  const rows = buildProcessesExportRows(processes, now)
  const { utils, writeFile } = await import('xlsx')
  const worksheet = utils.json_to_sheet(rows)
  // Larguras aproximadas pra abrir legível sem ajuste manual.
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 11 },
    { wch: 11 },
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
