// useProcessSearch: hook que retorna uma funcao `searcher` para o
// CommandPalette (Sprint 18.0). Recebe o navigate do react-router e
// devolve items no formato { id, label, group, to, action }.
//
// Comportamento:
//   - searcher(query) -> [{ id, label, description, to, action }]
//   - to: /processos com state { selectedProcessId } (deep link)
//   - action: navegar + fechar
//
// O CommandPalette lida com debounce internamente (200ms).

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProcesses } from '../services/processesRepository'

export function useProcessSearch() {
  const navigate = useNavigate()

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
              state: { selectedProcessId: process.id },
            })
          },
        }
      })
    },
    [navigate]
  )
}

export default useProcessSearch
