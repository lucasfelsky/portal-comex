// useProcessSearch: hook que retorna uma funcao `searcher` para o
// CommandPalette (Sprint 18.0). Recebe o navigate do react-router e
// devolve items no formato { id, label, group, to, action }.
//
// Comportamento:
//   - searcher(query) -> [{ id, label, description, to, action }]
//   - action: navega para /processos com state { selectedProcessId, detailTab: 'general' } (deep link)
//   - to: /processos e so informativo (action tem precedencia no CommandPalette)
//
// O CommandPalette lida com debounce internamente (200ms).

import { useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { searchProcesses } from '../services/processesRepository'
import { buildProcessLinkState, getReturnToFromLocation } from '../utils/processNavigation'

export function useProcessSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnToRef = useRef('')
  returnToRef.current = getReturnToFromLocation(location)

  return useCallback(
    async (query) => {
      const processes = await searchProcesses(query)
      return processes.map((process) => {
        const id = `process-${process.id}`
        const destination = process.destination ? ` · ${process.destination}` : ''
        const description = `${process.processNumber ?? 'sem PO'}${destination}`

        return {
          id,
          label: process.name ?? 'Processo sem nome',
          description,
          group: 'Resultados',
          icon: 'arrivals',
          to: '/processos',
          action: () => {
            navigate('/processos', {
              state: buildProcessLinkState(process.id, 'general', returnToRef.current),
            })
          },
        }
      })
    },
    [navigate]
  )
}

export default useProcessSearch
