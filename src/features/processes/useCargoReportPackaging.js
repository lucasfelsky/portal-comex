import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import {
  getSupplierPackagingCatalog,
  upsertSupplierPackagingEntry,
} from '../../services/supplierPackagingCatalogRepository'
import { fillCargoRowFromRegistry, matchCargoRowsForSupplier, refillCargoTares } from './cargoReportAutofill'
import { canonicalSupplierKey, collectPackagingTypes, resolveCargoPackaging } from './cargoSupplierPackaging'

// S9-D do Relatório de Carga: liga as embalagens por item + fornecedor ao formulário. O cadastro por fornecedor é
// lido junto com a tabela Item x Emb. (cache de módulo de 5 min, como ela); falha NÃO bloqueia: a tela cai no padrão do
// item (também é o que acontece se as rules do doc novo ainda não foram publicadas). O fornecedor da linha não é
// gravado: vem do processo/FUP (FCL, LCL, AÉREO) ou da PO da linha (CONSOLIDADO). Aqui ficam o contexto de embalagem
// por linha (peso líquido), o preenchimento ao sair do campo Cód. DBCorp, a troca de PO no consolidado e o diálogo
// "Cadastrar para <fornecedor>".

const CACHE_TTL_MS = 5 * 60 * 1000
export const SUPPLIER_CATALOG_ERROR_MESSAGE =
  'Não foi possível carregar o cadastro por fornecedor; vale o padrão do item.'

let supplierCatalogCache = null

// -> { data, error }: nunca rejeita (a falha só vira o aviso na tela).
export function loadSupplierCatalogCached() {
  const now = Date.now()
  if (supplierCatalogCache && now - supplierCatalogCache.at < CACHE_TTL_MS) return supplierCatalogCache.promise

  const promise = getSupplierPackagingCatalog().then(
    (data) => ({ data, error: null }),
    (error) => {
      if (supplierCatalogCache?.promise === promise) supplierCatalogCache = null
      console.warn('Não foi possível ler o cadastro de embalagens por fornecedor.', error)
      return { data: null, error }
    }
  )
  supplierCatalogCache = { promise, at: now }
  return promise
}

// Relê o cadastro ignorando o cache (o "Atualizar" traz o cadastro que o admin mudou depois).
export function reloadSupplierCatalog() {
  supplierCatalogCache = null
  return loadSupplierCatalogCached()
}

function storeSupplierCatalog(data) {
  supplierCatalogCache = { promise: Promise.resolve({ data, error: null }), at: Date.now() }
}

// Zera o cache (testes).
export function resetSupplierCatalogCache() {
  supplierCatalogCache = null
}

// `registry` = { itemCatalog, supplierCatalog, supplierNameOf(row) } (de `useCargoReportAutofill`); `rows`/`setForm`:
// linhas e estado do formulário; `setSupplierCatalog`: guarda o cadastro depois de "Cadastrar para"; `canEdit`: admin
// com o COMEX em rascunho; `onChanged`: chamado quando o cadastro mexe no formulário (a tela limpa o aviso de salvar).
export default function useCargoReportPackaging({
  process,
  profile,
  registry,
  rows,
  setForm,
  setSupplierCatalog,
  canEdit,
  onChanged,
}) {
  const toast = useToast()
  const isConsolidated = process?.category === 'CONSOLIDADO'
  const [quickRowId, setQuickRowId] = useState(null)
  const registryRef = useRef(registry)
  useEffect(() => {
    registryRef.current = registry
  }, [registry])

  const { itemCatalog, supplierCatalog, supplierNameOf } = registry

  // Fornecedor de cada linha (derivado do PO / do processo a cada render) e contexto do peso líquido.
  const supplierNameByRowId = useMemo(() => {
    const map = {}
    for (const row of rows) map[row.id] = supplierNameOf(row)
    return map
  }, [rows, supplierNameOf])
  const packaging = useMemo(() => ({ supplierCatalog, supplierNameByRowId }), [supplierCatalog, supplierNameByRowId])

  // Consolidado: mover a linha para outra PO troca o fornecedor; a tara que o usuário não mexeu (vazia ou ainda a da
  // base C) acompanha o cadastro do fornecedor novo. Só ids que já existiam antes (linha nova não conta).
  const previousSuppliersRef = useRef(null)
  useEffect(() => {
    const previous = previousSuppliersRef.current
    previousSuppliersRef.current = supplierNameByRowId
    if (!canEdit || !isConsolidated || !previous) return
    const aliases = registryRef.current.supplierCatalog?.aliases
    const moved = new Set(
      Object.keys(supplierNameByRowId).filter(
        (id) =>
          id in previous &&
          canonicalSupplierKey(previous[id], aliases) !== canonicalSupplierKey(supplierNameByRowId[id], aliases)
      )
    )
    if (moved.size === 0) return
    setForm((current) => refillCargoTares(current, registryRef.current, (row) => moved.has(row.id)).form)
  }, [canEdit, isConsolidated, setForm, supplierNameByRowId])

  // Ao sair do campo Cód. DBCorp: tara vazia e Descrição SQ vazia vêm do cadastro.
  const handleCodeBlur = useCallback(
    (rowId) => {
      setForm((current) => fillCargoRowFromRegistry(current, rowId, registryRef.current))
    },
    [setForm]
  )

  const quickRow = quickRowId ? (rows.find((row) => row.id === quickRowId) ?? null) : null
  const openQuick = useCallback((rowId) => setQuickRowId(rowId), [])
  const closeQuick = useCallback(() => setQuickRowId(null), [])

  // Grava a entrada e preenche, na hora, as linhas do mesmo código + fornecedor cuja tara está vazia ou ainda é a da base C.
  const saveQuick = useCallback(
    async (entry) => {
      const saved = await upsertSupplierPackagingEntry(entry, profile)
      storeSupplierCatalog(saved)
      setSupplierCatalog(saved)
      const next = { ...registryRef.current, supplierCatalog: saved }
      registryRef.current = next
      setForm(
        (current) => refillCargoTares(current, next, matchCargoRowsForSupplier(entry.code, entry.supplierName, next)).form
      )
      setQuickRowId(null)
      toast.success(`Embalagem de ${entry.code} cadastrada para ${entry.supplierName}`)
      onChanged?.()
    },
    [onChanged, profile, setForm, setSupplierCatalog, toast]
  )

  const quick = useMemo(() => {
    if (!quickRow) return null
    const base = resolveCargoPackaging(quickRow.dbcorpCode, '', { itemCatalog, supplierCatalog })
    return {
      code: String(quickRow.dbcorpCode ?? '').trim().toUpperCase(),
      supplierName: supplierNameByRowId[quickRow.id] ?? '',
      packagingTypes: collectPackagingTypes({ itemCatalog, supplierCatalog }),
      defaults: base ? { packagingType: base.packagingType, netWeightKg: base.netWeightKg } : null,
      onSave: saveQuick,
      onCancel: closeQuick,
    }
  }, [closeQuick, itemCatalog, quickRow, saveQuick, supplierCatalog, supplierNameByRowId])

  return { packaging, supplierNameByRowId, handleCodeBlur, openQuick, quick }
}
