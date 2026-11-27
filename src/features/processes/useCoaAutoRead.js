// S11-E: elo entre um componente do COA (card ou célula por PO) e a fila única da leitura automática
// (`coaAutoReadQueue`). Só admin (`enabled`): quem não é admin nunca registra montagem e nunca enfileira, então a
// callable nunca é chamada por ele. Devolve o que a tela mostra (`status`: linha "Lendo os COAs: X de Y", `notice`:
// aviso de fila interrompida) e `enqueue(documents)` para o envio.
//
// Padrão replicado (não é util compartilhado): guard de montagem em efeito; aqui o registro/cancelamento fica no
// store (sem setState depois de desmontar: o React cuida da assinatura via `useSyncExternalStore`).
//
// S11-F: a fila segue sem componente montado (sair da aba ou trocar de processo não descarta nada). Ao montar de novo,
// o hook só relê o store: o status/contador e o aviso da fila atual aparecem na hora e o selo atualiza a cada arquivo.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  COA_AUTO_READ_HINT,
  COA_AUTO_READ_WAITING,
  beginCoaAutoReadSend,
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
  const isReading = useSyncExternalStore(
    subscribeCoaAutoRead,
    () => getCoaAutoReadState().activeKey === key,
    () => false
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

  // S11-H: `beginSend()` no início de cada envio (nulo se não for admin ou sem componente montado); `enqueue(docs, send)`
  // a cada arquivo que sobe, com o bilhete devolvido. Sem bilhete, vale a regra antiga (componente montado agora).
  const beginSend = useCallback(() => (enabled ? beginCoaAutoReadSend(processId) : null), [enabled, processId])
  const enqueue = useCallback(
    (documents, send) => (enabled ? enqueueCoaAutoRead(processId, documents, scope, send) : 0),
    [enabled, processId, scope]
  )

  // Quem está de fato lendo mostra o progresso; quem tem arquivo na fila mas espera a vez mostra só "Na fila".
  let status = ''
  if (enabled && progress) {
    status = isReading ? `Lendo os COAs: ${progress.done + 1} de ${progress.total}. ${COA_AUTO_READ_HINT}` : COA_AUTO_READ_WAITING
  }
  return { status, notice: enabled ? notice : '', enqueue, beginSend }
}
