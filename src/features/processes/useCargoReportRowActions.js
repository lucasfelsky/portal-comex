import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import {
  autofillForBlankRow,
  autofillForCopies,
  autofillForPurchaseOrder,
  restoreAutofillEntry,
  takeAutofillEntry,
} from './cargoReportAutofill'
import { CARGO_REPORT_ROWS_LIMIT_MESSAGE, createEmptyCargoAutofill } from './cargoReportFormModel'
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
// (o formulário limpa o aviso de salvamento). `autofillRows`: mapa `autofill.rows` do formulário (S9-C): as
// operações levam a origem das células junto (inserir herda o PO, duplicar e dividir copiam, remover e desfazer
// levam e devolvem a entrada, mover de PO regrava a base do PO).
export default function useCargoReportRowActions({ rows, setForm, purchaseOrders, onChanged, autofillRows }) {
  const toast = useToast()
  const rowsRef = useRef(rows)
  const autofillRef = useRef(autofillRows ?? {})
  const [splitRowId, setSplitRowId] = useState(null)
  const [newRowIds, setNewRowIds] = useState(() => new Set())
  const [focusRequest, setFocusRequest] = useState(null)
  const highlightTimerRef = useRef(null)
  const focusNonceRef = useRef(0)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    autofillRef.current = autofillRows ?? {}
  }, [autofillRows])

  useEffect(
    () => () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    },
    []
  )

  const isGrouped = purchaseOrders.length > 0

  // `carry` (opcional): (mapa autofill.rows) -> mapa novo, aplicado junto com as linhas.
  const commit = useCallback(
    (nextRows, carry) => {
      const ordered = isGrouped ? orderCargoRowsByPurchaseOrder(nextRows, purchaseOrders) : nextRows
      rowsRef.current = ordered
      setForm((current) => {
        const next = { ...current, rows: ordered }
        if (carry) {
          const autofill = current.autofill ?? createEmptyCargoAutofill()
          const entries = carry(autofill.rows ?? {})
          autofillRef.current = entries
          next.autofill = { ...autofill, rows: entries }
        }
        return next
      })
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
    (result, carry) => {
      if (result.error === 'limit') {
        toast.error(CARGO_REPORT_ROWS_LIMIT_MESSAGE)
        return
      }
      if (result.error) return
      commit(result.rows, carry)
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
      commit(restored, (entries) => restoreAutofillEntry(entries, removed.row.id, removed.autofillEntry))
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
        const result = insertCargoRow(current, rowId, action)
        finishInsert(result, (entries) => autofillForBlankRow(entries, rowId, result.insertedId))
      } else if (action === 'dup') {
        const result = duplicateCargoRow(current, rowId)
        finishInsert(result, (entries) => autofillForCopies(entries, rowId, [result.insertedId]))
      } else if (action === 'addInPo') {
        const result = insertCargoRowInPurchaseOrder(current, payload?.purchaseOrder, purchaseOrders)
        const inserted = result.rows.find((row) => row.id === result.insertedId)
        finishInsert(result, (entries) => autofillForPurchaseOrder(entries, result.insertedId, inserted?.po ?? ''))
      } else if (action === 'split') {
        if (current.some((row) => row.id === rowId)) setSplitRowId(rowId)
      } else if (action === 'up' || action === 'down') {
        commit(moveCargoRow(current, rowId, action === 'up' ? -1 : 1, groupOf))
        requestFocus(rowId, 'menu')
      } else if (action === 'toPo') {
        const next = moveCargoRowToPurchaseOrder(current, rowId, payload?.purchaseOrder, purchaseOrders)
        const before = current.find((row) => row.id === rowId)
        const moved = next.find((row) => row.id === rowId)
        const changed = Boolean(moved) && moved.po !== before?.po
        commit(next, changed ? (entries) => autofillForPurchaseOrder(entries, rowId, moved.po) : undefined)
        markNew([rowId])
        requestFocus(rowId, 'menu')
      } else if (action === 'remove') {
        const { rows: next, removed } = removeCargoRow(current, rowId)
        if (!removed) return
        const taken = takeAutofillEntry(autofillRef.current, rowId)
        removed.autofillEntry = taken.entry
        commit(next, (entries) => takeAutofillEntry(entries, rowId).entries)
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
      commit(result.rows, (entries) =>
        autofillForCopies(entries, splitRowId, result.insertedIds, { dropSource: true })
      )
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
