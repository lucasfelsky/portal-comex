import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { CARGO_REPORT_ROWS_LIMIT_MESSAGE } from './cargoReportFormModel'
import { orderCargoRowsByPurchaseOrder, resolveCargoRowPurchaseOrder } from './cargoReportGroups'
import {
  duplicateCargoRow,
  insertCargoRow,
  insertCargoRowInPurchaseOrder,
  moveCargoRow,
  moveCargoRowToPurchaseOrder,
  removeCargoRow,
  restoreCargoRow,
  splitCargoRow,
} from './cargoReportRowOps'

// S9-B do Relatório de Carga: liga as operações por linha (menu ⋯) ao formulário. Estado do diálogo de dividir,
// "Desfazer" da remoção (toast com ação), destaque e foco da linha mexida. A lógica das operações é pura e vive
// em `cargoReportRowOps.js`; no consolidado a ordem do array é mantida igual à da tela (`cargoReportGroups.js`).

const UNDO_DURATION_MS = 7000
const NEW_ROW_HIGHLIGHT_MS = 1400
const SPLIT_ERRORS = {
  sum: 'A soma dos lotes precisa ser igual à quantidade da linha.',
  limit: CARGO_REPORT_ROWS_LIMIT_MESSAGE,
}
const SPLIT_FALLBACK_ERROR = 'Não foi possível dividir esta linha.'

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
}

// `purchaseOrders`: POs do consolidado (vazio nos demais tipos). `onChanged`: chamado a cada alteração aplicada
// (o formulário limpa o aviso de salvamento).
export default function useCargoReportRowActions({ rows, setForm, purchaseOrders, onChanged }) {
  const toast = useToast()
  const rowsRef = useRef(rows)
  const [splitRowId, setSplitRowId] = useState(null)
  const [newRowIds, setNewRowIds] = useState(() => new Set())
  const [focusRequest, setFocusRequest] = useState(null)
  const highlightTimerRef = useRef(null)
  const focusNonceRef = useRef(0)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(
    () => () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    },
    []
  )

  const isGrouped = purchaseOrders.length > 0

  const commit = useCallback(
    (nextRows) => {
      const ordered = isGrouped ? orderCargoRowsByPurchaseOrder(nextRows, purchaseOrders) : nextRows
      rowsRef.current = ordered
      setForm((current) => ({ ...current, rows: ordered }))
      onChanged?.()
    },
    [isGrouped, purchaseOrders, setForm, onChanged]
  )

  const markNew = useCallback((ids) => {
    if (prefersReducedMotion()) return
    setNewRowIds(new Set(ids))
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setNewRowIds(new Set()), NEW_ROW_HIGHLIGHT_MS)
  }, [])

  // `target`: 'input' (1º campo da linha) ou 'menu' (botão ⋯ da linha).
  const requestFocus = useCallback((rowId, target = 'input') => {
    focusNonceRef.current += 1
    setFocusRequest({ rowId, target, nonce: focusNonceRef.current })
  }, [])

  const finishInsert = useCallback(
    (result) => {
      if (result.error === 'limit') {
        toast.error(CARGO_REPORT_ROWS_LIMIT_MESSAGE)
        return
      }
      if (result.error) return
      commit(result.rows)
      markNew([result.insertedId])
      requestFocus(result.insertedId)
    },
    [commit, markNew, requestFocus, toast]
  )

  const undoRemove = useCallback(
    (removed) => {
      const before = rowsRef.current
      if (before.some((row) => row.id === removed.row.id)) return
      const restored = restoreCargoRow(before, removed)
      if (restored.length === before.length) {
        toast.error(CARGO_REPORT_ROWS_LIMIT_MESSAGE)
        return
      }
      commit(restored)
      markNew([removed.row.id])
      requestFocus(removed.row.id)
    },
    [commit, markNew, requestFocus, toast]
  )

  const handleRowAction = useCallback(
    (action, rowId, payload) => {
      const current = rowsRef.current
      const groupOf = isGrouped ? (row) => resolveCargoRowPurchaseOrder(row.po, purchaseOrders) : undefined

      if (action === 'above' || action === 'below') {
        finishInsert(insertCargoRow(current, rowId, action))
      } else if (action === 'dup') {
        finishInsert(duplicateCargoRow(current, rowId))
      } else if (action === 'addInPo') {
        finishInsert(insertCargoRowInPurchaseOrder(current, payload?.purchaseOrder, purchaseOrders))
      } else if (action === 'split') {
        if (current.some((row) => row.id === rowId)) setSplitRowId(rowId)
      } else if (action === 'up' || action === 'down') {
        commit(moveCargoRow(current, rowId, action === 'up' ? -1 : 1, groupOf))
        requestFocus(rowId, 'menu')
      } else if (action === 'toPo') {
        commit(moveCargoRowToPurchaseOrder(current, rowId, payload?.purchaseOrder, purchaseOrders))
        markNew([rowId])
        requestFocus(rowId, 'menu')
      } else if (action === 'remove') {
        const { rows: next, removed } = removeCargoRow(current, rowId)
        if (!removed) return
        commit(next)
        const neighbor = next[Math.min(removed.index, next.length - 1)]
        if (neighbor) requestFocus(neighbor.id)
        toast.info(`Linha ${removed.index + 1} removida`, {
          durationMs: UNDO_DURATION_MS,
          action: { label: 'Desfazer', onSelect: () => undoRemove(removed) },
        })
      }
    },
    [commit, finishInsert, isGrouped, markNew, purchaseOrders, requestFocus, toast, undoRemove]
  )

  const applySplit = useCallback(
    (lots) => {
      const result = splitCargoRow(rowsRef.current, splitRowId, lots)
      if (result.error) {
        toast.error(SPLIT_ERRORS[result.error] ?? SPLIT_FALLBACK_ERROR)
        return
      }
      commit(result.rows)
      setSplitRowId(null)
      markNew(result.insertedIds)
      requestFocus(result.insertedIds[0])
      toast.success(`Dividido em ${result.insertedIds.length} lotes`)
    },
    [commit, markNew, requestFocus, splitRowId, toast]
  )

  const cancelSplit = useCallback(() => setSplitRowId(null), [])

  const splitRow = splitRowId ? (rows.find((row) => row.id === splitRowId) ?? null) : null

  return { handleRowAction, splitRow, applySplit, cancelSplit, newRowIds, focusRequest }
}
