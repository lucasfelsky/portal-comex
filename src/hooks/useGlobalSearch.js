// useGlobalSearch: hook que retorna uma funcao `searcher` para o
// CommandPalette (Sprint 23). Combina processos + news, com historico
// de buscas recentes persistido em localStorage.
//
// API:
//   const { searcher, recentSearches, clearRecent } = useGlobalSearch()
//   searcher(query) -> [{ id, label, group, description?, to, action?, icon? }]
//   recentSearches: ['foo', 'bar', ...] (max 5, ordem: mais recente primeiro)
//   clearRecent(): limpa o historico

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProcesses } from '../services/processesRepository'
import { searchNews } from '../services/newsRepository'

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

export function useGlobalSearch() {
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
      const [processResults, newsResults] = await Promise.all([
        searchProcesses(trimmed).catch(() => []),
        searchNews(trimmed).catch(() => []),
      ])

      const processItems = processResults.slice(0, 6).map((process) => {
        const destination = process.destination ? ` · ${process.destination}` : ''
        const description = `${process.processNumber ?? 'sem PO'}${destination}`
        return {
          id: `process-${process.id}`,
          label: process.name ?? 'Processo sem nome',
          description,
          group: 'Resultados',
          icon: 'arrivals',
          to: '/processos',
          action: () => {
            navigate('/processos', { state: { selectedProcessId: process.id } })
          },
        }
      })

      const newsItems = newsResults.map((news) => ({
        id: `news-${news.id}`,
        label: news.title ?? 'Sem titulo',
        description: news.summary ?? '',
        group: 'Noticias',
        icon: 'news',
        to: '/news',
        action: () => {
          navigate('/news', { state: { selectedNewsId: news.id } })
        },
      }))

      return [...processItems, ...newsItems]
    },
    [navigate, pushRecent]
  )

  return { searcher, recentSearches, clearRecent }
}

export default useGlobalSearch
