import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SqQuimicaLogo } from '../../components/BrandMark'
import {
  CARGO_REPORT_FORM_CODE,
  CARGO_REPORT_TEMPLATE_ROWS,
  CARGO_TYPE_OPTIONS,
  formatCargoNumber,
} from './cargoReportFormModel'

// S4 do Relatório de Carga: visão de impressão A4 paisagem (Imprimir / Salvar como PDF).
// Renderizada em `document.body` e escondida na tela; o CSS de impressão (`@media print` em
// styles.css) esconde o app e mostra só esta seção quando `body.crf-printing` está ligada.
// Nada é gravado: o PDF vem do navegador e não é anexado sozinho.

export const PRINT_BODY_CLASS = 'crf-printing'
// Foco da janela só limpa a classe se vier bem depois de `window.print()` (não pode cortar a impressão).
const STUCK_FOCUS_DELAY_MS = 1500

// `width` em % da largura da folha (soma 100): descrições largas, códigos e números estreitos.
// `wide` marca as colunas de descrição (classe `is-wide`: alinhadas à esquerda, uma linha só, com reticências).
export const PRINT_COLUMNS = [
  { key: 'po', label: 'PO / PROCESSO', width: 7.2 },
  { key: 'dbcorpCode', label: 'CÓD. DBCORP', width: 6.4 },
  { key: 'supplierDescription', label: 'DESCRIÇÃO FORNECEDOR', width: 15.4, wide: true },
  { key: 'sqDescription', label: 'DESCRIÇÃO SQ', width: 14.4, wide: true },
  { key: 'ok', label: 'OK?', width: 3, center: true },
  { key: 'supplierLot', label: 'LOTE FORNEC.', width: 6.6 },
  { key: 'lotSq', label: 'LOTE SQ', width: 6.4 },
  { key: 'wmsLabel', label: 'ETIQ. WMS', width: 6.2 },
  { key: 'sqLabel', label: 'ETIQ. SQ', width: 5.6 },
  { key: 'quantityKg', label: 'QTD (KG)', width: 5, number: true },
  { key: 'countOk', label: 'CONTAGEM', width: 5.6, center: true },
  { key: 'netWeightKg', label: 'PESO LÍQ. EMB.', width: 6.6, number: true },
  { key: 'packageWeightKg', label: 'PESO DA EMB.', width: 6.2, number: true },
  { key: 'packages', label: 'Nº EMB.', width: 5.4, number: true },
]

function box(checked) {
  return checked ? '☑' : '☐'
}

function cellText(row, key) {
  if (key === 'ok') return box(row.ok)
  if (key === 'countOk') return box(row.countOk)
  if (key === 'netWeightKg') return formatCargoNumber(row.netWeightKg, { decimals: 1 })
  if (key === 'quantityKg' || key === 'packageWeightKg' || key === 'packages') return formatCargoNumber(row[key])
  // Lotes longos quebram em até 2 linhas (nunca viram reticências); ver `.crf-print__lot` em styles.css.
  if (key === 'supplierLot' || key === 'lotSq') return <span className="crf-print__lot">{row[key] ?? ''}</span>
  return row[key] ?? ''
}

function cellClass(column) {
  if (column.wide) return 'is-wide'
  if (column.number) return 'is-number'
  if (column.center) return 'is-center'
  return undefined
}

// Folha de impressão (só marcação): usada pelo portal abaixo e pelo teste de largura das colunas.
export function CargoReportPrintView({ sheet }) {
  // Até 28 linhas a folha tem sempre 28 (as vazias completam a página); acima disso só as preenchidas.
  const emptyRows = Math.max(0, CARGO_REPORT_TEMPLATE_ROWS - sheet.rows.length)

  return (
    <section className="crf-print" aria-label="Visão de impressão do relatório de carga">
      <header className="crf-print__head">
        <div className="crf-print__logo">
          <SqQuimicaLogo variant="minusc" tone="light" size={44} />
        </div>
        <div className="crf-print__title">
          <h1>{sheet.title}</h1>
          <p>{`${CARGO_REPORT_FORM_CODE} · REVISÃO: 005`}</p>
        </div>
        <div className="crf-print__type">
          <p>
            {CARGO_TYPE_OPTIONS.map((option) => (
              <span key={option.value}>{`${box(sheet.cargoType === option.value)} ${option.label}`}</span>
            ))}
          </p>
          <p>{`Nº da DUIMP: ${sheet.duimpNumber}`}</p>
        </div>
      </header>

      <table className="crf-print__table">
        <colgroup>
          {PRINT_COLUMNS.map((column) => (
            <col key={column.key} className={column.wide ? 'is-wide' : undefined} style={{ width: `${column.width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {PRINT_COLUMNS.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row) => (
            <tr key={row.id}>
              {PRINT_COLUMNS.map((column) => (
                <td key={column.key} className={cellClass(column)}>
                  {cellText(row, column.key)}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: emptyRows }, (_, index) => (
            <tr key={`empty-${index}`} aria-hidden="true">
              {PRINT_COLUMNS.map((column) => (
                <td key={column.key} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="crf-print__foot">
        <div>
          <p>{`CONFERÊNCIA: ${sheet.checkedByName}`}</p>
          <p>{`ETIQUETAGEM: ${sheet.labelingOk ? ['OK', sheet.checkedByName].filter(Boolean).join(' · ') : sheet.checkedByName}`}</p>
          <p>{`CONFECÇÃO ETIQUETA: ${sheet.checkedByName}`}</p>
        </div>
        <div>
          <p>
            {'STATUS DO RECEBIMENTO: '}
            <span>{`${box(sheet.receiptStatus === 'com_ressalva')} COM RESSALVA`}</span>{' '}
            <span>{`${box(sheet.receiptStatus === 'sem_ressalva')} SEM RESSALVA`}</span>
          </p>
          <p>{`DATA RECEBIMENTO: ${sheet.receivedDateBr}`}</p>
          <p>{`INÍCIO DA DESCARGA: ${sheet.unloadStartBr}`}</p>
          <p>{`FIM DA DESCARGA: ${sheet.unloadEndBr}`}</p>
          <p>{`TEMPO TOTAL DA DESCARGA: ${typeof sheet.unloadTotalMinutes === 'number' ? `${sheet.unloadTotalMinutes} min` : ''}`}</p>
          <p>{`DATA CONCLUSÃO: ${sheet.completedDateBr}`}</p>
          <p>{`Nº DA NF: ${sheet.nfNumber}`}</p>
        </div>
        <div>
          <p>{`OBSERVAÇÕES: ${sheet.notes}`}</p>
        </div>
      </footer>
    </section>
  )
}

// `sheet` vem de `buildCargoReportSheet`; `onDone` roda quando a impressão termina.
export default function CargoReportPrintSheet({ sheet, onDone }) {
  const printedRef = useRef(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    let finished = false
    let printedAt = 0
    let beforePrintCount = 0
    const printQuery = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null

    function removeListeners() {
      window.removeEventListener('afterprint', finish)
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('focus', handleFocus)
      printQuery?.removeEventListener?.('change', handlePrintMedia)
    }

    function finish() {
      document.body.classList.remove(PRINT_BODY_CLASS)
      removeListeners()
      if (finished) return
      finished = true
      onDoneRef.current?.()
    }

    // O 1º `beforeprint` é desta impressão; um 2º com a classe ainda ligada é uma impressão nova do
    // usuário (Ctrl+P) depois de um `afterprint` perdido: limpa para imprimir a tela normal.
    function handleBeforePrint() {
      beforePrintCount += 1
      if (beforePrintCount > 1) finish()
    }

    // Saiu do modo de impressão (alternativa ao `afterprint`, que alguns navegadores não disparam).
    function handlePrintMedia(event) {
      if (!event.matches) finish()
    }

    // Voltou o foco para a janela bem depois do `window.print()`: a impressão já acabou.
    function handleFocus() {
      if (printedAt > 0 && Date.now() - printedAt > STUCK_FOCUS_DELAY_MS) finish()
    }

    document.body.classList.add(PRINT_BODY_CLASS)
    window.addEventListener('afterprint', finish)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('focus', handleFocus)
    printQuery?.addEventListener?.('change', handlePrintMedia)

    // O StrictMode (dev) roda o efeito duas vezes: o ref evita abrir o diálogo de impressão em dobro.
    if (!printedRef.current) {
      printedRef.current = true
      window.print()
      printedAt = Date.now()
    }

    return () => {
      document.body.classList.remove(PRINT_BODY_CLASS)
      removeListeners()
    }
  }, [])

  return createPortal(<CargoReportPrintView sheet={sheet} />, document.body)
}
