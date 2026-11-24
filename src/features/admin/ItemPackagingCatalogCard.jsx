import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Modal from '../../components/Modal'
import Skeleton from '../../components/Skeleton'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import {
  ITEM_PACKAGING_VERSION_CONFLICT_CODE,
  getItemPackagingCatalog,
  saveItemPackagingCatalog,
} from '../../services/itemPackagingCatalogRepository'
import { formatDateTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import {
  diffItemPackagingCatalogs,
  readItemPackagingWorkbook,
  summarizeItemPackaging,
} from '../processes/cargoReportCatalog'

const MAX_LISTED = 50
// Mesma faixa do bottom sheet do Modal: até 720px a prévia abre como folha inferior (Modal em portal).
const SHEET_QUERY = '(max-width: 720px)'
const FILE_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PERMISSION_MESSAGE = 'Sem permissão para gravar a tabela. Entre com um usuário admin.'

const formatNumber = (value) => Number(value ?? 0).toLocaleString('pt-BR')
const plural = (count, singular, pluralForm) => `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`
const formatWeight = (value) =>
  typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'
const formatText = (value) => (value ? value : '—')

// "antes → depois" quando o campo mudou; senão só o valor.
function renderField(row, field, format) {
  if (row.kind === 'alterado' && row.fields.includes(field)) {
    return `${format(row.before[field])} → ${format(row.after[field])}`
  }
  return format(row.item[field])
}

// Lista a prévia na ordem do mock: novos, alterados, removidos.
function buildChangeRows(diff, nextItems, currentItems) {
  const nextByCode = new Map(nextItems.map((item) => [item.code, item]))
  const currentByCode = new Map(currentItems.map((item) => [item.code, item]))

  return [
    ...diff.added.map((code) => ({ kind: 'novo', code, item: nextByCode.get(code) })),
    ...diff.changed.map((change) => ({
      kind: 'alterado',
      code: change.code,
      item: change.after,
      fields: change.fields,
      before: change.before,
      after: change.after,
    })),
    ...diff.removed.map((code) => ({ kind: 'removido', code, item: currentByCode.get(code) })),
  ].filter((row) => row.item)
}

// Função de renderização (não componente): recebe lista já validada pelo parser deste módulo.
function renderProblemList({ title, entries, showCode, tone }) {
  if (entries.length === 0) return null
  const hidden = entries.length - MAX_LISTED

  return (
    <div className="ipc-problems">
      {title ? <p className="ipc-problems__title">{title}</p> : null}
      <ul className={`ipc-problems__list ipc-problems__list--${tone}`}>
        {entries.slice(0, MAX_LISTED).map((entry) => (
          <li key={`${entry.row}-${entry.message}`}>
            <b>{`Linha ${formatNumber(entry.row)}`}</b>
            {showCode && entry.code ? ` · ${entry.code}` : ''}
            {` · ${entry.message}`}
          </li>
        ))}
        {hidden > 0 ? <li>{`e mais ${formatNumber(hidden)}`}</li> : null}
      </ul>
    </div>
  )
}

// Card "Tabela Item x Emb." de /admin/relatorio-carga: mostra a versão atual de
// `cargoReportCatalog/itemPackaging` e importa a aba "Item x Emb." do FR.CMX.001 com prévia
// (nada é gravado antes da confirmação). Desktop: a prévia abre abaixo do card; celular: folha inferior.
export default function ItemPackagingCatalogCard() {
  const { profile } = useAuth()
  const titleId = useId()
  const previewTitleId = useId()
  const isSheet = useMediaQuery(SHEET_QUERY)
  const fileInputRef = useRef(null)
  const importButtonRef = useRef(null)
  const previewTitleRef = useRef(null)
  const mountedRef = useRef(true)
  const hadPreviewRef = useRef(false)
  const restoreFocusRef = useRef(true)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [catalog, setCatalog] = useState(null)
  const [isReading, setIsReading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function loadCatalog(isActive) {
    try {
      const loaded = await getItemPackagingCatalog()
      if (!isActive()) return null
      setCatalog(loaded)
      setLoadError('')
      return loaded
    } catch (error) {
      if (isActive()) {
        setLoadError(buildActionErrorMessage('Não foi possível carregar a tabela Item x Emb.', error))
      }
      return null
    }
  }

  useEffect(() => {
    let isMounted = true
    mountedRef.current = true

    async function loadInitial() {
      await loadCatalog(() => isMounted)
      if (isMounted) setIsLoading(false)
    }

    loadInitial()

    return () => {
      isMounted = false
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!preview) return
    const title = previewTitleRef.current
    title?.focus?.()
    title?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [preview])

  // Ao fechar a prévia devolve o foco ao botão de importar. Roda depois do cleanup do Modal (folha do
  // celular), que restauraria o foco para o <input> oculto onde o arquivo foi escolhido.
  useEffect(() => {
    if (preview) {
      hadPreviewRef.current = true
      return
    }
    if (!hadPreviewRef.current) return
    hadPreviewRef.current = false
    if (restoreFocusRef.current) importButtonRef.current?.focus?.()
  }, [preview])

  const summary = useMemo(() => summarizeItemPackaging(catalog?.items ?? []), [catalog])
  const previewData = useMemo(() => {
    if (!preview) return null
    const diff = diffItemPackagingCatalogs(catalog?.items ?? [], preview.items)
    const changeRows = buildChangeRows(diff, preview.items, catalog?.items ?? [])
    return { diff, changeRows }
  }, [preview, catalog])

  function closePreview({ restoreFocus = true } = {}) {
    restoreFocusRef.current = restoreFocus
    setPreview(null)
    setSaveError('')
    if (restoreFocus) importButtonRef.current?.focus?.()
  }

  async function handleFileChosen(event) {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    restoreFocusRef.current = true
    setNotice(null)
    setPreview(null)
    setSaveError('')
    setIsReading(true)

    try {
      const result = await readItemPackagingWorkbook(file)
      if (!mountedRef.current) return

      if (result.fatal) {
        setNotice({ type: 'error', text: result.fatal })
      } else {
        setPreview({ ...result, baseVersion: catalog?.version ?? 0 })
      }
    } catch (error) {
      if (mountedRef.current) {
        setNotice({
          type: 'error',
          text: error instanceof Error && error.message ? error.message : 'Não foi possível ler a planilha.',
        })
      }
    } finally {
      if (mountedRef.current) setIsReading(false)
    }
  }

  function handleChooseAnother() {
    closePreview({ restoreFocus: false })
    fileInputRef.current?.click()
  }

  async function handleConfirm() {
    if (!preview || !previewData || isSaving) return
    const { diff } = previewData

    restoreFocusRef.current = true
    setIsSaving(true)
    setSaveError('')

    try {
      const written = await saveItemPackagingCatalog(
        {
          items: preview.items,
          sourceFileName: preview.sourceFileName,
          sourceSheetName: preview.sourceSheetName,
          sourceSha256: preview.sourceSha256,
          expectedVersion: preview.baseVersion,
          summary: { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length },
        },
        profile
      )
      if (!mountedRef.current) return

      setPreview(null)
      setNotice({
        type: 'success',
        text: `Tabela importada: versão ${written.version}, ${formatNumber(written.itemCount)} itens (${plural(diff.added.length, 'novo', 'novos')}, ${plural(diff.changed.length, 'alterado', 'alterados')}, ${plural(diff.removed.length, 'removido', 'removidos')}).`,
      })
      await loadCatalog(() => mountedRef.current)
      importButtonRef.current?.focus?.()
    } catch (error) {
      if (!mountedRef.current) return

      if (error?.code === ITEM_PACKAGING_VERSION_CONFLICT_CODE) {
        setPreview(null)
        const latest = await loadCatalog(() => mountedRef.current)
        if (!mountedRef.current) return
        setNotice({
          type: 'error',
          text: `Outra importação foi concluída enquanto você revisava${latest ? ` (versão atual ${latest.version})` : ''}. Escolha o arquivo de novo e confirme.`,
        })
      } else if (error?.code === 'permission-denied') {
        setSaveError(PERMISSION_MESSAGE)
      } else {
        setSaveError(buildActionErrorMessage('Não foi possível gravar a tabela.', error))
      }
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }
  }

  const header = (
    <div className="card-heading">
      <div>
        <h3 id={titleId}>Tabela Item x Emb.</h3>
        <p>Peso líquido por embalagem usado no cálculo do Relatório de Carga.</p>
      </div>
      {catalog?.exists ? (
        <span className="ad-pill">{`Versão ${catalog.version} · ${plural(catalog.itemCount, 'item', 'itens')}`}</span>
      ) : null}
    </div>
  )

  if (isLoading) {
    return (
      <article className="list-card ipc-card" aria-labelledby={titleId}>
        {header}
        <div role="status" aria-label="Carregando tabela Item x Emb.">
          <Skeleton variant="card" style={{ height: 120 }} />
        </div>
      </article>
    )
  }

  const errorCount = preview?.errors.length ?? 0
  const diff = previewData?.diff
  const changeTotal = diff ? diff.added.length + diff.changed.length + diff.removed.length : 0
  const removedCount = diff?.removed.length ?? 0
  const canConfirm = Boolean(preview) && errorCount === 0 && changeTotal > 0 && !isSaving
  const confirmLabel = isSaving
    ? 'Gravando…'
    : removedCount > 0
      ? `Confirmar e remover ${plural(removedCount, 'item', 'itens')}`
      : 'Confirmar e gravar'
  const listedChanges = previewData?.changeRows.slice(0, MAX_LISTED) ?? []

  // Corpo da prévia (igual no desktop inline e na folha do celular).
  const previewBody =
    preview && previewData ? (
      <>
        {errorCount > 0 ? (
          <>
            <div className="error-banner" role="alert">
              Corrija a planilha e escolha o arquivo de novo. Nada foi gravado.
            </div>
            {renderProblemList({ entries: preview.errors, showCode: false, tone: 'error' })}
          </>
        ) : (
          <>
            <div className="ipc-pills">
              <span className="inline-badge inline-badge--ok">{plural(diff.added.length, 'novo', 'novos')}</span>
              <span className="inline-badge inline-badge--warn">
                {plural(diff.changed.length, 'alterado', 'alterados')}
              </span>
              <span className="inline-badge inline-badge--danger">
                {plural(removedCount, 'removido', 'removidos')}
              </span>
              {isSheet ? null : <span className="inline-badge">{`${formatNumber(diff.unchanged)} sem mudança`}</span>}
            </div>

            {changeTotal === 0 ? (
              <p className="field-hint">Nenhuma alteração em relação à versão atual.</p>
            ) : (
              <>
                <div className="ipc-table-wrap">
                  <table className="ipc-table">
                    <thead>
                      <tr>
                        <th scope="col">Mudança</th>
                        <th scope="col">Código</th>
                        <th scope="col">Descrição</th>
                        <th scope="col">Tipo emb.</th>
                        <th scope="col">Peso líq. (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listedChanges.map((row) => (
                        <tr key={`${row.kind}-${row.code}`}>
                          <td>
                            <span className={`ipc-chg ipc-chg--${row.kind}`}>{row.kind}</span>
                          </td>
                          <td>{row.code}</td>
                          <td>{renderField(row, 'description', formatText)}</td>
                          <td>{renderField(row, 'packagingType', formatText)}</td>
                          <td>{renderField(row, 'netWeightKg', formatWeight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field-hint">
                  {`Mostrando ${formatNumber(listedChanges.length)} de ${plural(changeTotal, 'mudança', 'mudanças')}. Itens sem tipo e peso entram como "sem embalagem cadastrada".`}
                </p>
              </>
            )}
          </>
        )}

        {renderProblemList({
          title: 'Avisos (não bloqueiam a gravação)',
          entries: preview.warnings,
          showCode: true,
          tone: 'warn',
        })}

        {saveError ? (
          <div className="error-banner" role="alert">
            {saveError}
          </div>
        ) : null}

        {isSaving ? (
          <p className="field-hint" role="status">
            Gravando… não feche esta página.
          </p>
        ) : null}

        <div className="action-row ipc-preview__actions">
          <button type="button" className="primary-button" disabled={!canConfirm} onClick={handleConfirm}>
            {confirmLabel}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving}
            onClick={errorCount > 0 ? handleChooseAnother : () => closePreview()}
          >
            {errorCount > 0 ? 'Escolher outro arquivo' : 'Cancelar'}
          </button>
        </div>
      </>
    ) : null

  // Desktop: prévia inline abaixo do card (quadros 2 e 3 do mock). Celular: folha inferior pelo
  // Modal do app (portal em document.body, fora do .page-fade que prende `position: fixed`),
  // com role="dialog", Esc, focus trap, trava de scroll do body e retorno de foco.
  let previewPanel = null
  if (preview && previewData) {
    const versionLine = `Versão ${preview.baseVersion} → ${preview.baseVersion + 1}`
    const rowsLine = `${formatNumber(preview.stats.rows)} linhas lidas`

    previewPanel = isSheet ? (
      <Modal
        open
        wide
        title="Prévia da importação"
        className="ipc-preview-sheet"
        onClose={() => {
          if (!isSaving) closePreview()
        }}
      >
        <div className="ipc-preview">
          <p className="field-hint">{`${versionLine} · ${rowsLine}`}</p>
          {previewBody}
        </div>
      </Modal>
    ) : (
      <article className="list-card ipc-preview" aria-labelledby={previewTitleId}>
        <div className="card-heading">
          <div>
            <h3 id={previewTitleId} ref={previewTitleRef} tabIndex={-1}>
              Prévia da importação
            </h3>
            <p>{`${preview.sourceFileName} · aba "${preview.sourceSheetName}" · ${rowsLine}`}</p>
          </div>
          {errorCount > 0 ? (
            <span className="ad-pill ad-pill--neutral">{plural(errorCount, 'erro', 'erros')}</span>
          ) : (
            <span className="ad-pill">{versionLine}</span>
          )}
        </div>
        {previewBody}
      </article>
    )
  }

  return (
    <>
      <article className="list-card ipc-card" aria-labelledby={titleId}>
        {header}

        {loadError ? (
          <div className="error-banner" role="alert">
            {loadError}
          </div>
        ) : catalog?.exists ? (
          <dl className="ipc-facts">
            <div>
              <dt>Com embalagem</dt>
              <dd>{plural(summary.withPackaging, 'item', 'itens')}</dd>
            </div>
            <div>
              <dt>Sem embalagem cadastrada</dt>
              <dd>{plural(summary.withoutPackaging, 'item', 'itens')}</dd>
            </div>
            <div>
              <dt>Importada por</dt>
              <dd>{catalog.importedByName || '—'}</dd>
            </div>
            <div>
              <dt>Em</dt>
              <dd>{formatDateTime(catalog.importedAt)}</dd>
            </div>
            <div>
              <dt>Arquivo</dt>
              <dd>{catalog.sourceFileName || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="field-hint">
            Nenhuma tabela importada ainda. O formulário do Relatório de Carga vai usar a tabela importada aqui.
          </p>
        )}

        {notice ? (
          <div
            className={notice.type === 'success' ? 'success-banner' : 'error-banner'}
            role={notice.type === 'success' ? 'status' : 'alert'}
          >
            {notice.text}
          </div>
        ) : null}

        {isReading ? (
          <div className="field-hint ipc-reading" role="status">
            <span className="skeleton ipc-reading__dot" aria-hidden="true" />
            Lendo a planilha…
          </div>
        ) : null}

        {loadError ? null : (
          <>
            <p className="field-hint">Lê a aba &quot;Item x Emb.&quot; do FR.CMX.001. Nada é gravado antes da confirmação.</p>
            <div className="action-row">
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                hidden
                aria-label="Planilha .xlsx com a aba Item x Emb."
                onChange={handleFileChosen}
              />
              <button
                ref={importButtonRef}
                type="button"
                className="primary-button"
                disabled={isReading || isSaving}
                aria-busy={isReading}
                onClick={() => fileInputRef.current?.click()}
              >
                Importar planilha (.xlsx)
              </button>
            </div>
          </>
        )}
      </article>

      {preview && previewData ? previewPanel : null}
    </>
  )
}
