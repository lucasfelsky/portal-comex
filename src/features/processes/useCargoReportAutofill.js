import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { loadErpProcessReference } from '../../services/erpReferenceRepository'
import {
  applyCargoDiff,
  buildCargoSources,
  diffCargoReportAgainstSources,
  resolveCargoSupplierName,
} from './cargoReportAutofill'
import { CARGO_REPORT_ROWS_LIMIT_MESSAGE } from './cargoReportFormModel'

// S9-C do Relatório de Carga: liga o preenchimento automático (processo + FUP) à tela. Só o admin com o relatório
// no estágio 1 (rascunho do COMEX) lê o FUP (as rules negam os demais). Guarda a referência lida, abre a prévia do
// "Atualizar" (lê o FUP de novo, para pegar uma importação feita depois) e aplica só o que o usuário marcou.
// Padrão replicado (não é util compartilhado): guard `isMounted` na leitura assíncrona.

const REFRESH_ERROR = 'Não foi possível ler o FUP agora. Tente atualizar de novo em instantes.'
const APPLIED_MESSAGE = 'Alterações aplicadas'

// Leitura do FUP do processo; falha vira só o aviso (o relatório se preenche só com o processo).
export async function fetchCargoReference(processId) {
  try {
    return { reference: await loadErpProcessReference(processId), error: null }
  } catch (error) {
    console.warn('Não foi possível ler o FUP deste processo.', error)
    return { reference: null, error }
  }
}

// `form`/`setForm`: estado do formulário; `purchaseOrders`: POs do consolidado (reordena ao aplicar);
// `onApplied`: chamado depois de aplicar (o formulário limpa o aviso de salvamento).
export default function useCargoReportAutofill({ process, form, setForm, purchaseOrders, onApplied }) {
  const toast = useToast()
  const formRef = useRef(form)
  const isMountedRef = useRef(true)
  const [state, setState] = useState({ reference: null, error: null, fetched: false })
  const [panel, setPanel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refreshError, setRefreshError] = useState('')

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const sources = useMemo(() => buildCargoSources(process, state.reference), [process, state.reference])
  const supplier = useMemo(() => resolveCargoSupplierName(process, state.reference), [process, state.reference])

  // Depois da carga: guarda a referência lida e, em relatório novo, abre a prévia com o que ficou de fora.
  const initialize = useCallback(({ reference = null, error = null, pending = [], fetched = false } = {}) => {
    setState({ reference, error, fetched })
    setRefreshError('')
    setPanel(pending.length > 0 ? { mode: 'pending', items: pending, selected: [] } : null)
  }, [])

  // Relatório aberto fora do estágio 1 e depois reaberto para o COMEX: o FUP não foi lido na carga; lê agora para o
  // campo "Fonte dos itens" não dizer "Sem FUP" só porque a referência nunca foi pedida.
  const refetch = useCallback(async () => {
    const result = await fetchCargoReference(process?.id)
    if (!isMountedRef.current) return
    setState({ reference: result.reference, error: result.error, fetched: true })
  }, [process])

  const openRefresh = useCallback(async () => {
    const current = formRef.current
    if (!current || busy) return
    setBusy(true)
    setRefreshError('')
    const result = await fetchCargoReference(process?.id)
    if (!isMountedRef.current) return
    setBusy(false)
    if (result.error) {
      setRefreshError(REFRESH_ERROR)
      return
    }
    setState({ reference: result.reference, error: null, fetched: true })
    const latest = formRef.current ?? current
    const items = diffCargoReportAgainstSources(latest, latest.autofill, buildCargoSources(process, result.reference))
    setPanel({
      mode: 'refresh',
      items,
      selected: items.filter((item) => item.applicable && item.defaultOn).map((item) => item.id),
    })
  }, [busy, process])

  const toggleItem = useCallback((id) => {
    setPanel((current) => {
      if (!current) return current
      const selected = current.selected.includes(id)
        ? current.selected.filter((value) => value !== id)
        : [...current.selected, id]
      return { ...current, selected }
    })
  }, [])

  const applySelected = useCallback(() => {
    const current = formRef.current
    if (!panel || !current) return
    const snapshotId = sources.fupInfo.hasFup ? sources.fupInfo.snapshotId : undefined
    const result = applyCargoDiff(current, current.autofill, panel.items, panel.selected, { purchaseOrders, snapshotId })
    if (result.error === 'limit') {
      toast.error(CARGO_REPORT_ROWS_LIMIT_MESSAGE)
      return
    }
    setForm(() => result.form)
    setPanel(null)
    toast.success(APPLIED_MESSAGE)
    onApplied?.()
  }, [onApplied, panel, purchaseOrders, setForm, sources, toast])

  const dismiss = useCallback(() => setPanel(null), [])

  return {
    sources,
    fupInfo: sources.fupInfo,
    supplier,
    readError: Boolean(state.error),
    fetched: state.fetched,
    refetch,
    panel,
    busy,
    refreshError,
    initialize,
    openRefresh,
    toggleItem,
    applySelected,
    dismiss,
  }
}
