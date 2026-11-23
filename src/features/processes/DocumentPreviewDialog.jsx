// Dialogo de pre-visualizacao do documento anexado (Relatorio de carga, S1).
// Abre o arquivo SEM baixar para o computador: o blob vem da mesma Function
// autenticada do "Baixar" e fica em memoria; o botao "Baixar" do rodape reaproveita
// esse blob (nenhuma segunda requisicao).
//
// API:
//   <DocumentPreviewDialog
//     open={boolean}
//     document={{ id, name, mimeType, uploadedAt }}  // documento atual do slot
//     processId="..."
//     title="Relatório de carga"
//     onClose={() => void}
//   />
//
// Planilha (xlsx/xls/csv): tabela simplificada (sem cores, logo ou fontes; o aviso
// diz isso) com cartoes do cabecalho do modelo, abas, primeira coluna fixa e
// rolagem lateral. PDF: iframe. Imagem: <img>. O <Modal> cuida de foco, Esc, focus
// trap e do bottom sheet no celular.
//
// Padroes do repo replicados (nao sao util compartilhado): guard `isMounted` em
// async load e `buildActionErrorMessage(prefix, error)`.

import { useEffect, useState } from 'react'
import Modal from '../../components/Modal'
import Skeleton from '../../components/Skeleton'
import { downloadProcessDocumentBlob, saveBlobAsFile } from '../../services/processDocumentsRepository'
import { getDocumentFileKindLabel } from './processDocuments'
import {
  PREVIEW_MAX_COLS,
  PREVIEW_MAX_SPREADSHEET_BYTES,
  getDocumentPreviewKind,
  readSpreadsheetPreview,
} from './spreadsheetPreview'

function buildActionErrorMessage(prefix, error) {
  const details = error?.code ?? error?.message
  return details ? `${prefix} (${details})` : prefix
}

function formatShortDateFromIso(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function blobToArrayBuffer(blob) {
  return typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Response(blob).arrayBuffer()
}

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')

export default function DocumentPreviewDialog({
  open,
  document: doc,
  processId,
  title = 'Relatório de carga',
  onClose,
}) {
  const docId = doc?.id ?? ''
  const docName = doc?.name ?? ''
  const docMime = doc?.mimeType ?? ''
  const kind = getDocumentPreviewKind(docMime, docName)

  // status: 'idle' | 'loading' | 'ready' | 'too-large' | 'error'
  const [status, setStatus] = useState(open && docId ? 'loading' : 'idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [blob, setBlob] = useState(null)
  const [objectUrl, setObjectUrl] = useState('')
  const [preview, setPreview] = useState(null)
  const [sheetIndex, setSheetIndex] = useState(undefined)
  const [isParsing, setIsParsing] = useState(false)
  const [parseFailed, setParseFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  // Ao abrir (ou trocar de documento) recomeca do zero, ajustando o estado DURANTE o
  // render (mesmo padrao do RenameDocumentDialog): sem isso o 1o frame da reabertura
  // mostraria a tabela/URL do uso anterior antes do efeito zerar.
  const sessionKey = open && docId ? `${processId}|${docId}` : ''
  const [lastSessionKey, setLastSessionKey] = useState(sessionKey)
  if (sessionKey !== lastSessionKey) {
    setLastSessionKey(sessionKey)
    if (sessionKey) {
      setStatus('loading')
      setErrorMessage('')
      setBlob(null)
      setObjectUrl('')
      setPreview(null)
      setSheetIndex(undefined)
      setParseFailed(false)
      setIsParsing(false)
    }
  }

  // 1) Baixa o blob (uma vez por abertura/documento).
  useEffect(() => {
    if (!open || !docId) return undefined
    let isMounted = true
    let createdUrl = ''

    async function load() {
      try {
        const downloaded = await downloadProcessDocumentBlob(processId, docId)
        if (!isMounted) return
        if (!kind) {
          setStatus('error')
          setErrorMessage('Este tipo de arquivo não tem pré-visualização. Use Baixar.')
          setBlob(downloaded)
          return
        }
        setBlob(downloaded)
        if (kind === 'sheet') {
          if (downloaded.size > PREVIEW_MAX_SPREADSHEET_BYTES) {
            setStatus('too-large')
            return
          }
          // A leitura da planilha roda no efeito 2 (depende de `sheetIndex`).
          setStatus('ready')
          return
        }
        createdUrl = URL.createObjectURL(downloaded)
        setObjectUrl(createdUrl)
        setStatus('ready')
      } catch (error) {
        if (!isMounted) return
        setStatus('error')
        setErrorMessage(buildActionErrorMessage('Não foi possível abrir o documento.', error))
      }
    }
    load()

    return () => {
      isMounted = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, processId, docId, kind, reloadToken])

  // 2) Planilha: le o blob e monta a tabela (e troca de aba).
  useEffect(() => {
    if (!open || kind !== 'sheet' || !blob || status !== 'ready') return undefined
    let isMounted = true

    async function parse() {
      try {
        const buffer = await blobToArrayBuffer(blob)
        const next = await readSpreadsheetPreview(buffer, {
          sheetIndex,
          csv: String(docName).toLowerCase().endsWith('.csv'),
        })
        if (!isMounted) return
        setPreview(next)
      } catch (error) {
        console.error('Falha ao ler a planilha para pré-visualização.', error)
        if (!isMounted) return
        setPreview(null)
        setParseFailed(true)
      } finally {
        if (isMounted) setIsParsing(false)
      }
    }
    parse()

    return () => {
      isMounted = false
    }
  }, [open, kind, blob, status, sheetIndex, docName])

  function handleSelectSheet(index) {
    setIsParsing(true)
    setParseFailed(false)
    setSheetIndex(index)
  }

  function handleRetry() {
    setStatus('loading')
    setErrorMessage('')
    setReloadToken((token) => token + 1)
  }

  function handleDownload() {
    if (!blob) return
    saveBlobAsFile(blob, docName || 'documento')
  }

  const kindLabel = getDocumentFileKindLabel(docMime, docName)
  const uploadedOn = formatShortDateFromIso(doc?.uploadedAt)
  const subtitle = [docName, kindLabel, uploadedOn ? `enviado em ${uploadedOn}` : ''].filter(Boolean).join(' · ')

  const isLoading = status === 'loading' || (status === 'ready' && kind === 'sheet' && !preview && !parseFailed)
  const canDownload = Boolean(blob)
  const showRetry = status === 'error' && !blob

  // Rodape da planilha (mock aprovado): "Mostrando N de M linhas preenchidas ...".
  let footHint = ''
  if (status === 'ready' && kind === 'sheet' && preview && preview.rows.length > 0) {
    footHint =
      `Mostrando ${NUMBER_FORMAT.format(preview.rows.length)} de ${NUMBER_FORMAT.format(preview.totalRows)} linhas preenchidas · role para o lado para ver todas as colunas` +
      (preview.truncatedCols ? ` · só as primeiras ${PREVIEW_MAX_COLS} colunas` : '')
  }

  function renderSheet() {
    if (parseFailed) {
      return (
        <p className="docpv__state docpv__state--error" role="alert">
          Não foi possível ler esta planilha. O arquivo pode estar corrompido ou em formato inválido. Use Baixar para
          abri-lo no Excel.
        </p>
      )
    }
    if (!preview) return null
    const { sheets, columns, rows, meta } = preview
    const activeIndex = preview.sheetIndex

    return (
      <>
        {meta.length > 0 ? (
          <dl className="docpv__meta" aria-label="Dados do cabeçalho do relatório">
            {meta.map((item) => (
              <div key={item.key} className="docpv__meta-card">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {sheets.length > 0 ? (
          <div className="docpv__tabs" role="group" aria-label="Abas da planilha">
            {sheets.length === 1 ? (
              <span className="inline-badge inline-badge--ok">{sheets[0].name}</span>
            ) : (
              sheets.map((sheet) => (
                <button
                  key={sheet.index}
                  type="button"
                  className={`inline-badge docpv__tab${sheet.index === activeIndex ? ' inline-badge--ok docpv__tab--active' : ''}`}
                  aria-pressed={sheet.index === activeIndex}
                  disabled={isParsing}
                  onClick={() => handleSelectSheet(sheet.index)}
                >
                  {sheet.name}
                </button>
              ))
            )}
          </div>
        ) : null}

        <div className="docpv__note">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>
            Pré-visualização simplificada: cores, logo e fontes do modelo não aparecem aqui. Para ver o arquivo
            original, use <strong>Baixar</strong>.
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="docpv__state" role="status">
            Esta planilha não tem linhas preenchidas.
          </p>
        ) : (
          <div
            className="docpv__scroll"
            role="region"
            aria-label="Tabela do documento, role para o lado para ver todas as colunas"
            aria-busy={isParsing || undefined}
            tabIndex={0}
          >
            <table className="docpv__table">
              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th key={`${column.label}-${index}`} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((cells, rowIndex) => (
                  <tr key={rowIndex}>
                    {cells.map((cell, cellIndex) =>
                      cellIndex === 0 ? (
                        <th key={cellIndex} scope="row">
                          {cell.text}
                        </th>
                      ) : (
                        <td key={cellIndex}>{cell.text}</td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </>
    )
  }

  function renderBody() {
    if (isLoading) {
      return (
        <div className="docpv__loading" role="status" aria-label="Carregando pré-visualização">
          <Skeleton variant="card" />
          <Skeleton variant="text" />
        </div>
      )
    }
    if (status === 'error') {
      return (
        <p className="docpv__state docpv__state--error" role="alert">
          {errorMessage}
        </p>
      )
    }
    if (status === 'too-large') {
      return (
        <p className="docpv__state docpv__state--error" role="alert">
          Arquivo grande demais para visualizar aqui. Use Baixar.
        </p>
      )
    }
    if (status !== 'ready') return null
    if (kind === 'pdf') {
      return <iframe className="docpv__frame" title="Pré-visualização do PDF" src={objectUrl} />
    }
    if (kind === 'image') {
      return (
        <div className="docpv__image">
          <img src={objectUrl} alt={docName || 'Documento anexado'} />
        </div>
      )
    }
    return renderSheet()
  }

  return (
    <Modal open={open} onClose={onClose} title={title} ariaLabel={title} wide className="docpv">
      <p className="docpv__subtitle">{subtitle}</p>
      {renderBody()}
      <div className="docpv__foot">
        {footHint ? <p className="docpv__hint">{footHint}</p> : null}
        <div className="docpv__actions">
          {showRetry ? (
            <button
              type="button"
              className="ghost-button ghost-button--outline"
              onClick={handleRetry}
            >
              Tentar novamente
            </button>
          ) : (
            <button
              type="button"
              className="ghost-button ghost-button--outline"
              disabled={!canDownload}
              onClick={handleDownload}
            >
              Baixar
            </button>
          )}
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
