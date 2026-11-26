// S11-D2 (D-9): selo da leitura automática do COA (D-20 da fatia C) lido UMA vez por painel e repassado ao card, às
// células da PO e ao bloco "COA sem PO". Só admin lê `coaReads`; relê quando a lista de COAs muda; falha de leitura =
// sem selo. Devolve `{ [documentId]: { text, tone } }` (só os documentos que têm selo).
//
// Padrão replicado (não é util compartilhado): guard `isMounted` em async.

import { useEffect, useMemo, useState } from 'react'
import { listCoaReads } from '../../services/coaReadsRepository'
import { describeReadBadge } from './coaReadBadge'
import { listCoaDocuments } from './processDocuments'

export default function useCoaReadBadges({ processId, documents, enabled }) {
  const [reads, setReads] = useState({})
  const coaIds = listCoaDocuments(documents)
    .map((document_) => document_.id)
    .join(',')

  useEffect(() => {
    if (!enabled || !processId || !coaIds) return undefined
    let isMounted = true
    listCoaReads(processId)
      .then((result) => {
        if (isMounted) setReads(result)
      })
      .catch(() => {
        if (isMounted) setReads({})
      })
    return () => {
      isMounted = false
    }
  }, [enabled, processId, coaIds])

  return useMemo(() => {
    const badges = {}
    if (!enabled) return badges
    for (const [documentId, read] of Object.entries(reads)) {
      const badge = describeReadBadge(read)
      if (badge) badges[documentId] = badge
    }
    return badges
  }, [enabled, reads])
}
