import { useRef, useState } from 'react'
import Modal from '../../components/Modal'
import { parseProcessesFromWorkbook } from '../../utils/importProcesses'

// F11 (backlog 2026-07-12): modal de import de processos em lote. UI que
// consome o parser puro `parseProcessesFromWorkbook` — pega o arquivo,
// mostra o preview (N válidas / M erros / K duplicadas puladas) e, ao
// confirmar, delega a criação em lote pro parent via `onConfirm(rows)`
// (o parent chama saveProcess por linha, preenchendo updatedById/Name, e
// faz refresh + toast). A checagem de duplicata é contra os processos já
// carregados na página (`existingProcessNumbers`) — mesma fonte que a
// query por processNumber traria, sem leitura extra.
export default function ImportProcessesModal({
  open,
  onClose,
  existingProcessNumbers,
  onConfirm,
}) {
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [phase, setPhase] = useState('idle') // idle | parsing | parsed | importing
  const [parseError, setParseError] = useState('')
  const [toCreate, setToCreate] = useState([])
  const [skipped, setSkipped] = useState([])
  const [rowErrors, setRowErrors] = useState([])

  const existingSet =
    existingProcessNumbers instanceof Set
      ? existingProcessNumbers
      : new Set(existingProcessNumbers ?? [])

  function resetPreview() {
    setToCreate([])
    setSkipped([])
    setRowErrors([])
    setParseError('')
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setPhase('parsing')
    resetPreview()

    try {
      const { validRows, errors } = await parseProcessesFromWorkbook(file)

      // Separa duplicatas (processNumber já existente em produção) das que
      // serão criadas. Linhas sem processNumber (ex.: CONSOLIDADO) nunca
      // são tratadas como duplicata.
      const dup = []
      const create = []
      for (const row of validRows) {
        if (row.processNumber && existingSet.has(row.processNumber)) {
          dup.push(row)
        } else {
          create.push(row)
        }
      }

      setToCreate(create)
      setSkipped(dup)
      setRowErrors(errors)
      setPhase('parsed')
    } catch (error) {
      setParseError(error?.message ?? 'Não foi possível ler a planilha.')
      setPhase('idle')
    } finally {
      // Permite re-selecionar o mesmo arquivo (onChange dispara de novo).
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleConfirm() {
    if (toCreate.length === 0) return
    setPhase('importing')
    setParseError('')
    try {
      await onConfirm(toCreate)
      handleClose()
    } catch (error) {
      setParseError(error?.message ?? 'Não foi possível importar os processos.')
      setPhase('parsed')
    }
  }

  function handleClose() {
    setFileName('')
    setPhase('idle')
    resetPreview()
    onClose?.()
  }

  const isImporting = phase === 'importing'

  return (
    <Modal open={open} onClose={handleClose} title="Importar processos" wide>
      <div className="import-processes">
        <p className="import-processes__hint">
          Selecione uma planilha (.xlsx, .xls ou .csv). Colunas reconhecidas:{' '}
          <strong>Nome</strong> e <strong>Categoria</strong> (obrigatórias), além de PO, Destino,
          ETD, ETA, Containers, Pallets, Status e Observações.
        </p>

        <label className="import-processes__file">
          <span style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Arquivo da planilha</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={isImporting}
          />
        </label>

        {fileName ? <p className="import-processes__filename">Arquivo: {fileName}</p> : null}

        {phase === 'parsing' ? (
          <div className="empty-state" role="status">
            <strong>Lendo planilha…</strong>
            <p>Validando as linhas do arquivo.</p>
          </div>
        ) : null}

        {parseError ? <div className="error-banner">{parseError}</div> : null}

        {phase === 'parsed' || phase === 'importing' ? (
          <div className="import-processes__preview">
            <div className="import-processes__summary">
              <span className="inline-badge inline-badge--ok">{toCreate.length} a criar</span>
              {skipped.length > 0 ? (
                <span className="inline-badge inline-badge--warn">
                  {skipped.length} duplicada{skipped.length > 1 ? 's' : ''} (pulada{skipped.length > 1 ? 's' : ''})
                </span>
              ) : null}
              {rowErrors.length > 0 ? (
                <span className="inline-badge inline-badge--danger">
                  {rowErrors.length} com erro
                </span>
              ) : null}
            </div>

            {toCreate.length > 0 ? (
              <details className="import-processes__group" open>
                <summary>Serão criados ({toCreate.length})</summary>
                <ul>
                  {toCreate.map((row, index) => (
                    <li key={`create-${index}`}>
                      <strong>{row.name}</strong> — {row.category}
                      {row.processNumber ? ` · PO ${row.processNumber}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {skipped.length > 0 ? (
              <details className="import-processes__group">
                <summary>Duplicadas — já existem (puladas) ({skipped.length})</summary>
                <ul>
                  {skipped.map((row, index) => (
                    <li key={`skip-${index}`}>
                      <strong>{row.name}</strong> · PO {row.processNumber}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {rowErrors.length > 0 ? (
              <details className="import-processes__group" open={toCreate.length === 0}>
                <summary>Linhas com erro ({rowErrors.length})</summary>
                <ul>
                  {rowErrors.map((rowError, index) => (
                    <li key={`err-${index}`}>
                      Linha {rowError.linha}: {rowError.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="import-processes__actions" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 'auto', zIndex: 1 }}>
          <button type="button" className="ghost-button" onClick={handleClose} disabled={isImporting}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleConfirm}
            disabled={isImporting || phase !== 'parsed' || toCreate.length === 0}
          >
            {isImporting ? 'Importando…' : `Importar ${toCreate.length} processo${toCreate.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
