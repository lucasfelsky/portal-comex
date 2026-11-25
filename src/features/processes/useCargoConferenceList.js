import { useCallback, useEffect, useRef, useState } from 'react'

// S9-F do Relatório de Carga: dados da lista e do contador da aba Conferência. Cache de MÓDULO (compartilhado entre a
// tela Menu, o item "Menu" da barra de baixo e a lista): `listProcesses()` (1 consulta) e `getCargoReport()` (2 leituras)
// SÓ dos processos candidatos, 4 por vez. Vale por 2 minutos; salvar, fechar ou reabrir invalidam só o processo
// afetado. Uma carga em andamento é compartilhada (contador + lista na mesma montagem = 1 carga). Os repositórios e as
// regras da lista entram por `import()` para o `AppLayout` (contador) não puxar o formulário do relatório no pacote inicial.
// Padrão replicado (não é util compartilhado): guard `isMounted` nas cargas assíncronas.

export const CARGO_CONFERENCE_CACHE_TTL_MS = 2 * 60 * 1000
export const CARGO_CONFERENCE_CONCURRENCY = 4

// { at, processes, reports: Map<processId, { report } | { error: true }> }
let snapshot = null
// { promise, listeners: Set<(entries) => void> }
let loading = null
const versions = new Map()
const changeListeners = new Set()

function versionOf(processId) {
  return versions.get(processId) ?? 0
}

// Zera tudo (testes).
export function resetCargoConferenceCache() {
  snapshot = null
  loading = null
  versions.clear()
  changeListeners.clear()
}

// O relatório do processo mudou (salvar, fechar, reabrir): a próxima carga relê só ele.
export function invalidateCargoConference(processId) {
  versions.set(processId, versionOf(processId) + 1)
  snapshot?.reports.delete(processId)
  for (const listener of [...changeListeners]) listener(processId)
}

export function subscribeCargoConferenceChanges(listener) {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

async function runPool(items, limit, worker) {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

async function readReport(getCargoReport, processId) {
  // Mudou durante a leitura (salvou na tela de conferência): lê de novo uma vez.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const version = versionOf(processId)
    try {
      const report = await getCargoReport(processId)
      if (version === versionOf(processId)) return { stored: { report } }
    } catch {
      if (version === versionOf(processId)) return { stored: { error: true } }
    }
  }
  return { stored: null }
}

async function run({ force, now, onProgress }) {
  const [{ listProcesses }, { getCargoReport }, list] = await Promise.all([
    import('../../services/processesRepository'),
    import('../../services/cargoReportRepository'),
    import('./cargoConferenceList'),
  ])

  if (force || !snapshot || Date.now() - snapshot.at >= CARGO_CONFERENCE_CACHE_TTL_MS) {
    const processes = await listProcesses()
    snapshot = { at: Date.now(), processes, reports: new Map() }
  }
  const current = snapshot
  const candidates = current.processes.filter((process) => list.isCargoConferenceCandidate(process, now))
  const build = () =>
    candidates.map((process) => {
      const stored = current.reports.get(process.id)
      return list.summarizeCargoConferenceEntry(process, stored?.report, { error: stored?.error === true, now })
    })

  onProgress?.(build())
  // Mais de uma rodada: um relatório invalidado durante a carga (salvou na tela de conferência) é lido de novo.
  for (let round = 0; round < 3; round += 1) {
    const missing = candidates.filter((process) => !current.reports.has(process.id))
    if (missing.length === 0) break
    await runPool(missing, CARGO_CONFERENCE_CONCURRENCY, async (process) => {
      const { stored } = await readReport(getCargoReport, process.id)
      if (stored) current.reports.set(process.id, stored)
      onProgress?.(build())
    })
  }

  const entries = build()
  return { processes: current.processes, entries, todo: list.countCargoConferencesToDo(entries) }
}

// -> Promise<{ processes, entries, todo }>. `force` relê tudo; `onProgress(entries)` a cada processo resolvido.
export function loadCargoConferenceEntries({ force = false, now = new Date(), onProgress } = {}) {
  if (!force && loading) {
    if (onProgress) loading.listeners.add(onProgress)
    return loading.promise
  }
  const listeners = new Set(onProgress ? [onProgress] : [])
  const entry = { listeners, promise: null }
  entry.promise = run({ force, now, onProgress: (entries) => listeners.forEach((listener) => listener(entries)) }).finally(
    () => {
      if (loading === entry) loading = null
    }
  )
  loading = entry
  return entry.promise
}

// -> { entries, processes, status: 'idle' | 'loading' | 'ready' | 'error', error, refresh(), retryEntry(processId) }
export function useCargoConferenceList({ enabled = true } = {}) {
  const [state, setState] = useState(() => ({
    status: enabled ? 'loading' : 'idle',
    entries: [],
    processes: [],
    error: null,
  }))
  const [token, setToken] = useState(0)
  const forceRef = useRef(false)

  useEffect(() => {
    if (!enabled) return undefined
    let isMounted = true
    const force = forceRef.current
    forceRef.current = false
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    loadCargoConferenceEntries({
      force,
      onProgress: (entries) => {
        if (isMounted) setState((previous) => ({ ...previous, entries }))
      },
    }).then(
      (result) => {
        if (isMounted) setState({ status: 'ready', entries: result.entries, processes: result.processes, error: null })
      },
      (error) => {
        if (isMounted) setState((previous) => ({ ...previous, status: 'error', error }))
      }
    )
    return () => {
      isMounted = false
    }
  }, [enabled, token])

  // Salvar, fechar ou reabrir (na tela de conferência) invalidam o processo: a lista relê só ele (sem `force`), em vez
  // de ficar com o cartão e os chips antigos. A página fica montada entre a lista e o detalhe.
  useEffect(() => {
    if (!enabled) return undefined
    let isMounted = true
    const unsubscribe = subscribeCargoConferenceChanges(() => {
      loadCargoConferenceEntries().then(
        (result) => {
          if (isMounted) setState({ status: 'ready', entries: result.entries, processes: result.processes, error: null })
        },
        () => {}
      )
    })
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [enabled])

  const refresh = useCallback(() => {
    forceRef.current = true
    setToken((value) => value + 1)
  }, [])

  const retryEntry = useCallback((processId) => {
    invalidateCargoConference(processId)
    setToken((value) => value + 1)
  }, [])

  return { ...state, refresh, retryEntry }
}

// -> number | null (null enquanto carrega ou com erro: nunca "0" falso). Atualiza quando um relatório é invalidado.
export function useCargoConferenceCount({ enabled = false } = {}) {
  const [count, setCount] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setCount(null)
      return undefined
    }
    let isMounted = true
    function load() {
      loadCargoConferenceEntries().then(
        (result) => {
          if (isMounted) setCount(result.todo)
        },
        () => {
          if (isMounted) setCount(null)
        }
      )
    }
    load()
    const unsubscribe = subscribeCargoConferenceChanges(load)
    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [enabled])

  return enabled ? count : null
}
