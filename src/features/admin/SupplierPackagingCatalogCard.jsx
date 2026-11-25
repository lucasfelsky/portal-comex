import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'
import Skeleton from '../../components/Skeleton'
import useAuth from '../../hooks/useAuth'
import useMediaQuery from '../../hooks/useMediaQuery'
import { getItemPackagingCatalog } from '../../services/itemPackagingCatalogRepository'
import {
  SUPPLIER_PACKAGING_LIMIT_CODE,
  SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE,
  getSupplierPackagingCatalog,
  saveSupplierPackagingCatalog,
  upsertSupplierPackagingEntry,
} from '../../services/supplierPackagingCatalogRepository'
import { formatDateTime } from '../../utils/dateFormat'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import CargoReportQuickPackagingDialog from '../processes/CargoReportQuickPackagingDialog'
import {
  buildSupplierNameList,
  buildSupplierPackagingRows,
  collectPackagingTypes,
  diffSupplierPackaging,
  filterSupplierPackagingRows,
  joinSupplierNames,
  readSupplierPackagingWorkbook,
  suggestSimilarSuppliers,
} from '../processes/cargoSupplierPackaging'
import SupplierPackagingJoinNames from './SupplierPackagingJoinNames'

const MAX_LISTED = 50
// Mesma faixa do bottom sheet do Modal: até 720px a prévia abre como folha inferior (Modal em portal).
const SHEET_QUERY = '(max-width: 720px)'
const FILE_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PERMISSION_MESSAGE = 'Sem permissão para gravar o cadastro. Entre com um usuário admin.'
const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'supplier', label: 'Com fornecedor' },
  { value: 'none', label: 'Sem embalagem' },
]

const formatNumber = (value) => Number(value ?? 0).toLocaleString('pt-BR')
const plural = (count, singular, pluralForm) => `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`
const formatWeight = (value) =>
  typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'
const formatText = (value) => (value ? value : '—')

function renderField(row, field, format) {
  if (row.kind === 'alterado' && row.fields.includes(field)) {
    return `${format(row.before[field])} → ${format(row.after[field])}`
  }
  return format(row.item[field])
}

// Prévia na ordem do mock: novas, alteradas, removidas.
function buildChangeRows(diff) {
  return [
    ...diff.added.map((item) => ({ kind: 'novo', id: `n-${item.code}|${item.supplierKey}`, item })),
    ...diff.changed.map((change) => ({
      kind: 'alterado',
      id: `a-${change.id}`,
      item: change.after,
      fields: change.fields,
      before: change.before,
      after: change.after,
    })),
    ...diff.removed.map((item) => ({ kind: 'removido', id: `r-${item.code}|${item.supplierKey}`, item })),
  ]
}

function renderProblemList({ title, entries, tone }) {
  if (entries.length === 0) return null
  const hidden = entries.length - MAX_LISTED
  return (
    <div className="ipc-problems">
      {title ? <p className="ipc-problems__title">{title}</p> : null}
      <ul className={`ipc-problems__list ipc-problems__list--${tone}`}>
        {entries.slice(0, MAX_LISTED).map((entry) => (
          <li key={`${entry.row}-${entry.message}`}>
            <b>{`Linha ${formatNumber(entry.row)}`}</b>
            {entry.code ? ` · ${entry.code}` : ''}
            {` · ${entry.message}`}
          </li>
        ))}
        {hidden > 0 ? <li>{`e mais ${formatNumber(hidden)}`}</li> : null}
      </ul>
    </div>
  )
}

function describeSaveError(error, fallback) {
  if (error?.code === 'permission-denied') return PERMISSION_MESSAGE
  if (error?.code === SUPPLIER_PACKAGING_LIMIT_CODE) return error.message
  return buildActionErrorMessage(fallback, error)
}

// Card "Embalagens por item e fornecedor" de /admin/relatorio-carga (S9-D): mostra o cadastro por fornecedor
// (`cargoReportCatalog/supplierPackaging`) sobre a tabela Item x Emb., importa uma planilha com prévia (nada é gravado
// antes da confirmação), cadastra "Fornecedor para um item" e junta nomes de fornecedor.
export default function SupplierPackagingCatalogCard() {
  const { profile } = useAuth()
  const titleId = useId()
  const previewTitleId = useId()
  const searchId = useId()
  const isSheet = useMediaQuery(SHEET_QUERY)
  const fileInputRef = useRef(null)
  const importButtonRef = useRef(null)
  const previewTitleRef = useRef(null)
  const mountedRef = useRef(true)
  const hadPreviewRef = useRef(false)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [itemCatalog, setItemCatalog] = useState(null)
  const [suppliers, setSuppliers] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)

  async function loadAll(isActive) {
    const [itemResult, supplierResult] = await Promise.allSettled([getItemPackagingCatalog(), getSupplierPackagingCatalog()])
    if (!isActive()) return null
    setItemCatalog(itemResult.status === 'fulfilled' ? itemResult.value : null)
    if (supplierResult.status === 'fulfilled') {
      setSuppliers(supplierResult.value)
      setLoadError('')
      return supplierResult.value
    }
    setLoadError(buildActionErrorMessage('Não foi possível carregar o cadastro por fornecedor.', supplierResult.reason))
    return null
  }

  useEffect(() => {
    let isMounted = true
    mountedRef.current = true

    async function loadInitial() {
      await loadAll(() => isMounted)
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

  // Ao fechar a prévia devolve o foco ao botão de importar.
  useEffect(() => {
    if (preview) {
      hadPreviewRef.current = true
      return
    }
    if (!hadPreviewRef.current) return
    hadPreviewRef.current = false
    importButtonRef.current?.focus?.()
  }, [preview])

  const allRows = useMemo(
    () => buildSupplierPackagingRows({ itemCatalog, supplierCatalog: suppliers }),
    [itemCatalog, suppliers]
  )
  const visibleRows = useMemo(() => filterSupplierPackagingRows(allRows, filter, query), [allRows, filter, query])
  const names = useMemo(() => buildSupplierNameList(suppliers), [suppliers])
  const suggestions = useMemo(() => suggestSimilarSuppliers(names.map((item) => item.key)), [names])
  const packagingTypes = useMemo(
    () => collectPackagingTypes({ itemCatalog, supplierCatalog: suppliers }),
    [itemCatalog, suppliers]
  )
  const previewData = useMemo(() => {
    if (!preview) return null
    const diff = diffSupplierPackaging(suppliers?.entries ?? [], preview.entries)
    return { diff, changeRows: buildChangeRows(diff) }
  }, [preview, suppliers])

  function closePreview() {
    setPreview(null)
    setSaveError('')
  }

  async function handleFileChosen(event) {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setNotice(null)
    setPreview(null)
    setSaveError('')
    setIsReading(true)
    try {
      const result = await readSupplierPackagingWorkbook(file)
      if (!mountedRef.current) return
      if (result.fatal) setNotice({ type: 'error', text: result.fatal })
      else setPreview({ ...result, baseVersion: suppliers?.version ?? 0 })
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
    closePreview()
    fileInputRef.current?.click()
  }

  async function handleConfirm() {
    if (!preview || !previewData || isSaving) return
    const { diff } = previewData

    setIsSaving(true)
    setSaveError('')
    try {
      const written = await saveSupplierPackagingCatalog(
        { entries: preview.entries, aliases: suppliers?.aliases ?? [] },
        {
          expectedVersion: preview.baseVersion,
          actor: profile,
          summary: { added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length },
        }
      )
      if (!mountedRef.current) return

      setPreview(null)
      setSuppliers(written)
      setNotice({
        type: 'success',
        text: `Cadastro importado: versão ${written.version}, ${plural(written.entryCount, 'embalagem', 'embalagens')} (${plural(diff.added.length, 'nova', 'novas')}, ${plural(diff.changed.length, 'alterada', 'alteradas')}, ${plural(diff.removed.length, 'removida', 'removidas')}).`,
      })
      importButtonRef.current?.focus?.()
    } catch (error) {
      if (!mountedRef.current) return
      if (error?.code === SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE) {
        setPreview(null)
        const latest = await loadAll(() => mountedRef.current)
        if (!mountedRef.current) return
        setNotice({
          type: 'error',
          text: `Outra gravação foi concluída enquanto você revisava${latest ? ` (versão atual ${latest.version})` : ''}. Escolha o arquivo de novo e confirme.`,
        })
      } else {
        setSaveError(describeSaveError(error, 'Não foi possível gravar o cadastro.'))
      }
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }
  }

  // "Fornecedor para um item": acrescenta ou troca UMA entrada sobre a versão atual do cadastro.
  async function handleAddEntry(entry) {
    const written = await upsertSupplierPackagingEntry(entry, profile)
    if (!mountedRef.current) return
    setSuppliers(written)
    setIsAddOpen(false)
    setNotice({ type: 'success', text: `Embalagem de ${entry.code} cadastrada para ${entry.supplierName}.` })
  }

  // "Juntar nomes": grava só os aliases (as entradas ficam como estão), sobre a versão que o admin está vendo.
  async function handleJoin(fromKeys, toKey) {
    if (!suppliers || isSaving) return false
    setIsSaving(true)
    setNotice(null)
    try {
      const aliases = joinSupplierNames(suppliers.aliases, fromKeys, toKey)
      const written = await saveSupplierPackagingCatalog(
        { entries: suppliers.entries, aliases },
        { expectedVersion: suppliers.version, actor: profile }
      )
      if (!mountedRef.current) return false
      setSuppliers(written)
      setNotice({ type: 'success', text: `Nomes juntados: ${plural(fromKeys.length, 'nome passa', 'nomes passam')} a valer como ${names.find((item) => item.key === toKey)?.name ?? toKey}.` })
      return true
    } catch (error) {
      if (!mountedRef.current) return false
      if (error?.code === SUPPLIER_PACKAGING_VERSION_CONFLICT_CODE) {
        await loadAll(() => mountedRef.current)
        if (mountedRef.current) setNotice({ type: 'error', text: 'Outra gravação foi concluída enquanto você juntava. Confira os nomes e tente de novo.' })
      } else {
        setNotice({ type: 'error', text: describeSaveError(error, 'Não foi possível juntar os nomes.') })
      }
      return false
    } finally {
      if (mountedRef.current) setIsSaving(false)
    }
  }

  const header = (
    <div className="card-heading">
      <div>
        <h3 id={titleId}>Embalagens por item e fornecedor</h3>
        <p>
          Admin › Relatório de Carga. Hoje a tabela Item x Emb. tem um peso por item; aqui cada fornecedor pode ter o seu.
        </p>
      </div>
      {suppliers?.exists ? (
        <span className="ad-pill">{`Versão ${suppliers.version} · ${plural(suppliers.entryCount, 'embalagem', 'embalagens')}`}</span>
      ) : null}
    </div>
  )

  if (isLoading) {
    return (
      <article className={`list-card ipc-card spc-card${isSheet ? ' spc-card--mobile' : ''}`} aria-labelledby={titleId}>
        {header}
        <div role="status" aria-label="Carregando embalagens por fornecedor">
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
      ? `Confirmar e remover ${plural(removedCount, 'embalagem', 'embalagens')}`
      : 'Confirmar e gravar'
  const listedChanges = previewData?.changeRows.slice(0, MAX_LISTED) ?? []
  const listedRows = visibleRows.slice(0, MAX_LISTED)

  const previewBody =
    preview && previewData ? (
      <>
        {errorCount > 0 ? (
          <>
            <div className="error-banner" role="alert">
              Corrija a planilha e escolha o arquivo de novo. Nada foi gravado.
            </div>
            {renderProblemList({ entries: preview.errors, tone: 'error' })}
          </>
        ) : (
          <>
            <div className="ipc-pills">
              <span className="inline-badge inline-badge--ok">{plural(diff.added.length, 'nova', 'novas')}</span>
              <span className="inline-badge inline-badge--warn">{plural(diff.changed.length, 'alterada', 'alteradas')}</span>
              <span className="inline-badge inline-badge--danger">{plural(removedCount, 'removida', 'removidas')}</span>
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
                        <th scope="col">Item</th>
                        <th scope="col">Fornecedor</th>
                        <th scope="col">Tipo emb.</th>
                        <th scope="col">Peso líq. (kg)</th>
                        <th scope="col">Peso da emb. (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listedChanges.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <span className={`ipc-chg ipc-chg--${row.kind}`}>{row.kind}</span>
                          </td>
                          <td>{row.item.code}</td>
                          <td>{row.item.supplierName || 'Padrão (qualquer fornecedor)'}</td>
                          <td>{renderField(row, 'packagingType', formatText)}</td>
                          <td>{renderField(row, 'netWeightKg', formatWeight)}</td>
                          <td>{renderField(row, 'packageWeightKg', formatWeight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="field-hint">
                  {`Mostrando ${formatNumber(listedChanges.length)} de ${plural(changeTotal, 'mudança', 'mudanças')}. A planilha vale como o cadastro inteiro: o que não está nela é removido.`}
                </p>
              </>
            )}
          </>
        )}

        {renderProblemList({ title: 'Avisos (não bloqueiam a gravação)', entries: preview.warnings, tone: 'warn' })}

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
            onClick={errorCount > 0 ? handleChooseAnother : closePreview}
          >
            {errorCount > 0 ? 'Escolher outro arquivo' : 'Cancelar'}
          </button>
        </div>
      </>
    ) : null

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
      <article className={`list-card ipc-card spc-card${isSheet ? ' spc-card--mobile' : ''}`} aria-labelledby={titleId}>
        {header}

        {loadError ? (
          <div className="error-banner" role="alert">
            {loadError}
          </div>
        ) : null}

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
            <div className="action-row">
              <input
                ref={fileInputRef}
                type="file"
                accept={FILE_ACCEPT}
                hidden
                aria-label="Planilha .xlsx com as embalagens por fornecedor"
                onChange={handleFileChosen}
              />
              <button
                ref={importButtonRef}
                type="button"
                className="secondary-button"
                disabled={isReading || isSaving}
                aria-busy={isReading}
                onClick={() => fileInputRef.current?.click()}
              >
                Importar planilha
              </button>
              <button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsAddOpen(true)}>
                <Icon name="plus" size={16} />
                Fornecedor para um item
              </button>
            </div>
            <p className="field-hint">
              Colunas: ITEM, FORNECEDOR, TIPO EMB., PESO LÍQ. (KG) e PESO DA EMB. (KG). FORNECEDOR vazio = padrão do item (só o
              peso da embalagem). Nada é gravado antes da confirmação.
            </p>

            <ol className="spc-flow">
              <li>
                <span>1º</span>
                <b>Item + fornecedor</b>
                <small>Se existe linha para este fornecedor, vale ela.</small>
              </li>
              <li>
                <span>2º</span>
                <b>Padrão do item</b>
                <small>Sem linha do fornecedor, vale o padrão (a tabela de hoje).</small>
              </li>
              <li>
                <span>3º</span>
                <b>Sem cadastro</b>
                <small>Aparece “Sem embalagem cadastrada” e o atalho para cadastrar.</small>
              </li>
            </ol>

            <div className="spc-toolbar">
              <div className="spc-chips" role="group" aria-label="Filtro">
                {FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="spc-chip"
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.value === 'all' ? `${option.label} (${formatNumber(allRows.length)})` : option.label}
                  </button>
                ))}
              </div>
              <div className="spc-search">
                <label htmlFor={searchId}>Buscar item ou fornecedor</label>
                <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>

            {listedRows.length === 0 ? (
              <p className="field-hint">
                {allRows.length === 0
                  ? 'Nada cadastrado ainda. Importe a tabela Item x Emb. ou a planilha de embalagens por fornecedor.'
                  : 'Nenhum item neste filtro.'}
              </p>
            ) : (
              <>
                <div className="spc-table-wrap">
                  <table className="ipc-table spc-table">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Descrição</th>
                        <th scope="col">Fornecedor</th>
                        <th scope="col">Tipo emb.</th>
                        <th scope="col">Peso líq. (kg)</th>
                        <th scope="col">Peso da emb. (kg)</th>
                        <th scope="col">Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listedRows.map((row) => (
                        <SupplierPackagingRows key={row.code} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
                {visibleRows.length > listedRows.length ? (
                  <p className="field-hint">
                    {`Mostrando ${formatNumber(listedRows.length)} de ${plural(visibleRows.length, 'item', 'itens')}. Use a busca ou os filtros para achar os demais.`}
                  </p>
                ) : null}
              </>
            )}

            {suppliers ? (
              <SupplierPackagingJoinNames names={names} suggestions={suggestions} busy={isSaving} onJoin={handleJoin} />
            ) : null}

            {suppliers?.exists ? (
              <p className="field-hint">
                {`Última gravação: ${suppliers.updatedByName || '—'} em ${formatDateTime(suppliers.updatedAt)}.`}
              </p>
            ) : null}
          </>
        )}
      </article>

      {preview && previewData ? previewPanel : null}

      {isAddOpen ? (
        <CargoReportQuickPackagingDialog
          askTarget
          mobile={isSheet}
          packagingTypes={packagingTypes}
          onSave={handleAddEntry}
          onCancel={() => setIsAddOpen(false)}
        />
      ) : null}
    </>
  )
}

// Linhas de um item: o padrão (tabela Item x Emb. + tara do padrão) e uma linha por fornecedor.
function SupplierPackagingRows({ row }) {
  const base = row.defaultPackaging
  return (
    <>
      <tr className="spc-row spc-row--def">
        <td>{row.code}</td>
        <td>{row.description || '—'}</td>
        <td>Padrão (qualquer fornecedor)</td>
        <td>{formatText(base.packagingType)}</td>
        <td>{formatWeight(base.netWeightKg)}</td>
        <td>{formatWeight(base.packageWeightKg)}</td>
        <td>
          <span className={`spc-badge ${base.registered ? 'spc-badge--ok' : 'spc-badge--warn'}`}>
            {base.registered ? 'cadastrado' : 'sem embalagem'}
          </span>
        </td>
      </tr>
      {row.suppliers.map((entry) => (
        <tr key={entry.supplierKey} className="spc-row spc-row--sup">
          <td />
          <td />
          <td>{entry.supplierName}</td>
          <td>{formatText(entry.packagingType)}</td>
          <td>{formatWeight(entry.netWeightKg)}</td>
          <td>{formatWeight(entry.packageWeightKg)}</td>
          <td>
            <span className="spc-badge spc-badge--sup">deste fornecedor</span>
          </td>
        </tr>
      ))}
    </>
  )
}
