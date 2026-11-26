// S11-E: elo entre um componente do COA (card ou célula por PO) e a fila única da leitura automática
// (`coaAutoReadQueue`). Só admin (`enabled`): quem não é admin nunca registra montagem e nunca enfileira, então a
// callable nunca é chamada por ele. Devolve o que a tela mostra (`status`: linha "Lendo os COAs: X de Y", `notice`:
// aviso de fila interrompida) e `enqueue(documents)` para o envio.
//
// Padrão replicado (não é util compartilhado): guard de montagem em efeito; aqui o registro/cancelamento fica no
// store (sem setState depois de desmontar: o React cuida da assinatura via `useSyncExternalStore`).

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  COA_AUTO_READ_HINT,
  buildCoaAutoReadKey,
  enqueueCoaAutoRead,
  getCoaAutoReadState,
  registerCoaAutoReadMount,
  subscribeCoaAutoRead,
} from './coaAutoReadQueue'

// Versão do que foi lido no processo: muda a cada arquivo que a fila termina (os selos relêem `coaReads`).
export function useCoaReadVersion(processId) {
  return useSyncExternalStore(
    subscribeCoaAutoRead,
    () => getCoaAutoReadState().readVersions[processId] ?? 0,
    () => 0
  )
}

export default function useCoaAutoRead({ processId, enabled, scope = '' }) {
  const key = buildCoaAutoReadKey(processId, scope)
  const progress = useSyncExternalStore(
    subscribeCoaAutoRead,
    () => getCoaAutoReadState().progress[key],
    () => undefined
  )
  const notice = useSyncExternalStore(
    subscribeCoaAutoRead,
    () => getCoaAutoReadState().notices[key] ?? '',
    () => ''
  )

  useEffect(() => {
    if (!enabled || !processId) return undefined
    return registerCoaAutoReadMount(processId)
  }, [enabled, processId])

  const enqueue = useCallback(
    (documents) => (enabled ? enqueueCoaAutoRead(processId, documents, scope) : 0),
    [enabled, processId, scope]
  )

  const status = enabled && progress ? `Lendo os COAs: ${progress.done + 1} de ${progress.total}. ${COA_AUTO_READ_HINT}` : ''
  return { status, notice: enabled ? notice : '', enqueue }
}
