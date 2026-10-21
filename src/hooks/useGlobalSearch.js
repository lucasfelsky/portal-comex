// useGlobalSearch: hook que retorna uma funcao `searcher` para o
// CommandPalette (Sprint 23). Hoje busca apenas processos, com
// historico de buscas recentes persistido em localStorage.
//
// API:
//   const { searcher, recentSearches, clearRecent } = useGlobalSearch()
//   searcher(query) -> [{ id, label, group, description?, to, action?, icon? }]
//   recentSearches: ['foo', 'bar', ...] (max 5, ordem: mais recente primeiro)
//   clearRecent(): limpa o historico

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProcesses } from '../services/processesRepository'
import { getProcessTitle } from '../features/processes/processLabels'
import { getQuickReadProcessStatus } from '../features/processes/processStatus'

const HISTORY_KEY = 'sq-comex:cmd-history'
const MAX_HISTORY = 5

function readHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function writeHistory(items) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
  } catch {
    // ignore
  }
}

export function useGlobalSearch(canSeeName) {
  const navigate = useNavigate()
  const [recentSearches, setRecentSearches] = useState(readHistory)

  const pushRecent = useCallback((query) => {
    const trimmed = String(query ?? '').trim()
    if (trimmed.length < 2) return
    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_HISTORY)
      writeHistory(next)
      return next
    })
  }, [])

  const clearRecent = useCallback(() => {
    setRecentSearches([])
    writeHistory([])
  }, [])

  // Escuta event fcm:message pra invalidar cache se necessario (futuro)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    return () => {}
  }, [])
  const searcher = useCallback(
    async (query) => {
      const trimmed = String(query ?? '').trim()
      if (trimmed.length < 2) return []

      pushRecent(trimmed)

      const processResults = await searchProcesses(trimmed, { canSeeName }).catch(() => [])

      return processResults.slice(0, 8).map((process) => {
        // Refino F2: subtitulo da paleta = "PO ... · status" (Flutuantes.dc.html).
        // Sem status, cai no destino (comportamento anterior).
        const number = String(process.processNumber ?? '').trim()
        const po = number ? (/^po(\s|:|$)/i.test(number) ? number : `PO ${number}`) : 'sem PO'
        const status = getQuickReadProcessStatus(process) || process.destination
        const description = [po, status].filter(Boolean).join(' · ')
        return {
          id: `process-${process.id}`,
          label: getProcessTitle(process, canSeeName) ?? 'Processo sem nome',
          description,
          group: 'Resultados',
          icon: 'arrivals',
          to: '/processos',
          action: () => {
            // Paleta abre o processo em Detalhes gerais (notificacoes seguem com targetTab/messages)
            navigate('/processos', {
              state: { selectedProcessId: process.id, detailTab: 'general' },
            })
          },
        }
      })
    },
    [navigate, pushRecent, canSeeName]
  )

  return { searcher, recentSearches, clearRecent }
}

export default useGlobalSearch
