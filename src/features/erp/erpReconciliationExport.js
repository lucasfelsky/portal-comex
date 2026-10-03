// Conciliacao ERP (DBCorp) x Portal - F1. Exporta o RESULTADO da conciliacao
// em .xlsx (somente leitura: baixa um arquivo, nao grava nada no Portal).
// ZERO imports estaticos: o `xlsx` entra por `import('xlsx')` dinamico dentro de
// `exportErpReconciliationToXlsx`, e as abas sao montadas por funcoes puras.
// Nenhuma coluna financeira existe aqui (o nucleo nem le essas colunas).

// Rotulos (a UI do modal reaproveita estes). Os de categoria espelham
// `ERP_ONLY_CATEGORIES` (paridade testada, sem importar o modulo).
export const ERP_DIFF_KIND_LABELS = {
  divergente: 'Divergente',
  portal_sem_dado: 'Portal sem dado',
  erp_sem_dado: 'ERP sem dado',
  erp_conflito: 'ERP em conflito',
  erp_atrasado: 'ERP atrasado',
  formato: 'Formato',
  informativo: 'Informativo',
}

export const ERP_ONLY_CATEGORY_LABELS = {
  nacional: 'Nacional',
  amostra_courier: 'Amostra / courier',
  erp_desatualizado: 'ERP desatualizado (NF recebida)',
  possivelmente_recebido_oculto: 'Possivelmente recebido (fora da lista do Portal)',
  a_consolidar: 'Aguardando consolidação (provável)',
  aguardando_prontidao_pagamento: 'Aguardando prontidão / pagamento',
  aguardando_embarque: 'Aguardando embarque',
  embarcado_sem_processo: 'Embarcado sem processo no Portal',
  indefinido: 'Indefinido',
}

export const ERP_FLAG_LABELS = {
  etd_vencido: 'ETD vencido',
  consolidado_fora_do_portal: 'Consolidado fora do Portal',
}

export const ERP_MATCH_RULE_LABELS = {
  'consolidado:ref': 'REF do consolidado',
  'consolidado:pedidos': 'Pedidos do consolidado',
  pedido: 'Pedido',
  po: 'PO',
  'po-base': 'Base da PO',
}

const SHEET_NAMES = {
  summary: 'Resumo',
  diffs: 'Divergências',
  erpOnly: 'Só no ERP',
  portalOnly: 'Só no Portal',
  warnings: 'Avisos',
}

const MAX_COLUMN_WIDTH = 60

function yesNo(value) {
  return value ? 'Sim' : 'Não'
}

function joinList(values) {
  return Array.isArray(values) ? values.join(', ') : ''
}

// -> [{ name, columns: string[], rows: object[] }] (5 abas, sempre presentes).
export function buildErpReconciliationSheets(result) {
  const data = result ?? {}
  const summary = data.summary ?? {}
  const info = data.sourceInfo ?? {}
  const byCategory = summary.erpOnlyByCategory ?? {}

  const summaryRows = [
    { Indicador: 'Fonte', Valor: info.label || info.source || '' },
    { Indicador: 'Arquivo', Valor: info.fileName ?? '' },
    { Indicador: 'Carregado em', Valor: info.fetchedAt ?? '' },
    { Indicador: 'Gerado em', Valor: info.generatedOn ?? '' },
    { Indicador: 'Linhas do ERP', Valor: info.rowCount ?? summary.erpRows ?? 0 },
  ]
  if (data.blocked) {
    summaryRows.push({ Indicador: 'Conciliação bloqueada', Valor: data.blockedMessage ?? data.blocked })
  }
  summaryRows.push(
    { Indicador: 'Embarques no ERP', Valor: summary.shipments ?? 0 },
    { Indicador: 'Embarques ativos', Valor: summary.activeShipments ?? 0 },
    { Indicador: 'Processos casados', Valor: summary.matched ?? 0 },
    { Indicador: '  dos quais arquivados (casados)', Valor: summary.matchedArchived ?? 0 },
    { Indicador: 'Casados com divergências', Valor: summary.matchedWithDiffs ?? 0 },
    { Indicador: 'Campos sem dado no ERP', Valor: summary.erpMissingFields ?? 0 },
    { Indicador: 'Só no ERP', Valor: summary.erpOnly ?? 0 }
  )
  for (const key of Object.keys(ERP_ONLY_CATEGORY_LABELS)) {
    summaryRows.push({ Indicador: `  ${ERP_ONLY_CATEGORY_LABELS[key]}`, Valor: byCategory[key] ?? 0 })
  }
  summaryRows.push(
    { Indicador: 'Só no Portal (não encontrados nesta planilha)', Valor: summary.portalOnly ?? 0 },
    { Indicador: '  dos quais arquivados', Valor: summary.portalOnlyArchived ?? 0 },
    { Indicador: 'Avisos', Valor: summary.warnings ?? 0 }
  )
  for (const code of Object.keys(summary.warningsByCode ?? {}).sort()) {
    summaryRows.push({ Indicador: `  ${code}`, Valor: summary.warningsByCode[code] })
  }

  const diffRows = []
  for (const entry of data.matched ?? []) {
    for (const diff of entry.diffs ?? []) {
      diffRows.push({
        Processo: entry.processName,
        Categoria: entry.category,
        Arquivado: yesNo(entry.archived),
        'Embarque (REF)': entry.shipmentKey,
        'Regra de casamento': ERP_MATCH_RULE_LABELS[entry.matchRule] ?? entry.matchRule,
        Campo: diff.label,
        Comparação: diff.authorityLabel ?? '',
        Tipo: ERP_DIFF_KIND_LABELS[diff.kind] ?? diff.kind,
        'Conta como divergência': yesNo(diff.counts),
        'Candidato à F2': yesNo(diff.applicable),
        Portal: diff.portal ?? '',
        ERP: diff.erp ?? '',
        Nota: diff.note ?? '',
      })
    }
  }

  const erpOnlyRows = (data.erpOnly ?? []).map((item) => ({
    Categoria: ERP_ONLY_CATEGORY_LABELS[item.category] ?? item.category,
    'Embarque (REF/PO)': item.shipmentKey,
    Tipo: item.kind,
    Pedidos: joinList(item.pedidos),
    POs: joinList(item.poRefs),
    Exportador: item.exporter ?? '',
    Estágio: item.stage ?? '',
    Status: joinList(item.statuses),
    'Status NF': joinList(item.statusNf),
    ETD: item.etd ?? '',
    ETA: item.eta ?? '',
    Sinais: (item.flags ?? []).map((flag) => ERP_FLAG_LABELS[flag] ?? flag).join(', '),
  }))

  const portalOnlyRows = (data.portalOnly ?? []).map((item) => ({
    Processo: item.processName,
    Categoria: item.category,
    Arquivado: yesNo(item.archived),
    Observação: 'Não encontrado nesta planilha',
  }))

  const warningRows = (data.warnings ?? []).map((warning) => ({
    Código: warning.code,
    Mensagem: warning.message,
    Linha: warning.ref?.rowNumber ?? '',
    ItemPedCpId: warning.ref?.itemId ?? '',
    Pedido: warning.ref?.pedido ?? '',
    Embarque: warning.ref?.shipmentKey ?? '',
    Processo: warning.ref?.processId ?? '',
    'Embarque concluído': yesNo(warning.concludedShipment),
  }))

  const sheet = (name, columns, rows) => ({ name, columns, rows })
  return [
    sheet(SHEET_NAMES.summary, ['Indicador', 'Valor'], summaryRows),
    sheet(
      SHEET_NAMES.diffs,
      [
        'Processo', 'Categoria', 'Arquivado', 'Embarque (REF)', 'Regra de casamento', 'Campo', 'Comparação',
        'Tipo', 'Conta como divergência', 'Candidato à F2', 'Portal', 'ERP', 'Nota',
      ],
      diffRows
    ),
    sheet(
      SHEET_NAMES.erpOnly,
      [
        'Categoria', 'Embarque (REF/PO)', 'Tipo', 'Pedidos', 'POs', 'Exportador', 'Estágio', 'Status',
        'Status NF', 'ETD', 'ETA', 'Sinais',
      ],
      erpOnlyRows
    ),
    sheet(SHEET_NAMES.portalOnly, ['Processo', 'Categoria', 'Arquivado', 'Observação'], portalOnlyRows),
    sheet(
      SHEET_NAMES.warnings,
      ['Código', 'Mensagem', 'Linha', 'ItemPedCpId', 'Pedido', 'Embarque', 'Processo', 'Embarque concluído'],
      warningRows
    ),
  ]
}

// Data local (getters locais, nunca ISO/UTC): meia-noite em BRT nao pode virar o dia anterior.
export function buildErpReconciliationFileName(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `conciliacao-erp-${year}-${month}-${day}.xlsx`
}

function columnWidths(columns, rows) {
  return columns.map((column) => {
    let widest = String(column).length
    for (const row of rows) {
      const length = String(row[column] ?? '').length
      if (length > widest) widest = length
    }
    return { wch: Math.min(MAX_COLUMN_WIDTH, widest + 2) }
  })
}

// Baixa o resultado como .xlsx. Devolve o nome do arquivo.
export async function exportErpReconciliationToXlsx(result, now = new Date()) {
  const sheets = buildErpReconciliationSheets(result)
  const { utils, writeFile } = await import('xlsx')
  const workbook = utils.book_new()
  for (const sheet of sheets) {
    const worksheet = utils.json_to_sheet(sheet.rows, { header: sheet.columns })
    worksheet['!cols'] = columnWidths(sheet.columns, sheet.rows)
    utils.book_append_sheet(workbook, worksheet, sheet.name)
  }
  const fileName = buildErpReconciliationFileName(now)
  writeFile(workbook, fileName)
  return fileName
}
