import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import { countCargoReportImportAlerts, readCargoReportWorkbook } from './cargoReportImport'
import { formatCargoNumber } from './cargoReportFormModel'

// S5 do Relatório de Carga: diálogo de prévia da importação de planilha (FR.CMX.001).
// Só lê e mostra; quem substitui as linhas do formulário (sem gravar nada) é o `CargoReportForm`.
// Padrão replicado (não é util compartilhado): guard `isMounted` na leitura assíncrona.

const READ_ERROR_PREFIX = 'Não foi possível ler a planilha.'

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function toKb(size) {
  return Math.max(1, Math.round((Number(size) || 0) / 1024))
}

function buildApplyLabel(result, currentRowCount) {
  if (!result || result.fatal) return 'Substituir as linhas atuais'
  if (currentRowCount > 0) {
    return currentRowCount === 1 ? 'Substituir a linha atual' : `Substituir as ${currentRowCount} linhas atuais`
  }
  return result.rows.length === 1 ? 'Preencher com 1 linha' : `Preencher com ${result.rows.length} linhas`
}

export default function CargoReportImportDialog({
  open,
  file,
  catalog,
  currentRowCount = 0,
  onChooseAnother,
  onApply,
  onClose,
}) {
  const [state, setState] = useState({ status: 'idle', result: null, error: '' })

  useEffect(() => {
    if (!open || !file) return undefined
    let isMounted = true

    async function read() {
      setState({ status: 'reading', result: null, error: '' })
      try {
        const result = await readCargoReportWorkbook(file)
        if (isMounted) setState({ status: 'done', result, error: '' })
      } catch (error) {
        if (isMounted) setState({ status: 'failed', result: null, error: buildActionErrorMessage(READ_ERROR_PREFIX, error) })
      }
    }

    read()
    return () => {
      isMounted = false
    }
  }, [open, file])

  const { status, result, error } = state
  const fatal = status === 'done' ? result?.fatal : null
  const success = status === 'done' && result && !result.fatal ? result : null
  const fileName = result?.fileName || file?.name || ''
  const fileSize = result?.fileSize ?? file?.size
  const alertCount = success ? countCargoReportImportAlerts(success.rows, catalog) : 0
  const notes = success
    ? [
        ...success.warnings.map((warning) => warning.message),
        ...success.missingOptional.map((label) => `Coluna ausente no arquivo (ficou vazia): ${label}`),
      ]
    : []

  return (
    <Modal open={open} onClose={onClose} title="Importar de planilha" wide className="cri-dialog">
      <p className="cri-intro">
        Use para trazer um Relatório de Carga já preenchido no modelo FR.CMX.001 revisão 5. As linhas atuais do
        formulário serão substituídas.
      </p>

      {status === 'reading' ? (
        <p className="field-hint" role="status">
          Lendo a planilha…
        </p>
      ) : null}

      {status === 'done' || status === 'failed' ? (
        <div className={`cri-drop${success ? '' : ' cri-drop--error'}`}>
          <b>{fileName}</b>
          <br />
          {success
            ? `${toKb(fileSize)} KB · aba "${success.sheetName}" reconhecida · cabeçalhos conferidos em ${success.headerRange}`
            : `${toKb(fileSize)} KB`}
        </div>
      ) : null}

      {fatal ? (
        <div className="error-banner" role="alert">
          <b>{fatal.title}</b> {fatal.message}
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      {success ? (
        <>
          <div className="cri-badges">
            <span className="inline-badge inline-badge--ok">
              {plural(success.rows.length, 'linha reconhecida', 'linhas reconhecidas')}
            </span>
            {alertCount > 0 ? (
              <span className="inline-badge inline-badge--warn">{plural(alertCount, 'alerta', 'alertas')}</span>
            ) : null}
            <span className="inline-badge">
              {success.cargoTypeRead
                ? 'Tipo de carga lido · DUIMP vem do processo'
                : 'Tipo de carga não marcado no arquivo · DUIMP vem do processo'}
            </span>
          </div>

          <div className="cri-mini">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>PO</th>
                  <th>Código</th>
                  <th>Descrição SQ</th>
                  <th>Lote forn.</th>
                  <th>Qtd (kg)</th>
                </tr>
              </thead>
              <tbody>
                {success.rows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td>{row.po}</td>
                    <td>{row.dbcorpCode}</td>
                    <td>{row.sqDescription}</td>
                    <td>
                      {row.supplierLot === '' && row.dbcorpCode !== '' ? (
                        <span className="cri-pill">sem lote</span>
                      ) : (
                        row.supplierLot
                      )}
                    </td>
                    <td>{formatCargoNumber(row.quantityKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {notes.length > 0 ? (
            <ul className="cri-warnings">
              {notes.map((note, index) => (
                <li key={`${index}-${note}`}>{note}</li>
              ))}
            </ul>
          ) : null}

          <div className="cri-callout">
            Lote SQ, peso líquido e nº de embalagens não são importados: o Portal recalcula com a tabela Item x Emb.
            atual. OK?, etiquetas e contagem também não: são da conferência da logística.
          </div>
        </>
      ) : null}

      <div className="cri-actions">
        <button type="button" className="secondary-button" onClick={() => onChooseAnother?.()}>
          Escolher outro arquivo
        </button>
        <button type="button" className="primary-button" disabled={!success} onClick={() => onApply?.(success)}>
          {buildApplyLabel(success, currentRowCount)}
        </button>
      </div>
    </Modal>
  )
}
