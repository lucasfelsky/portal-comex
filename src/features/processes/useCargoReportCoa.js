import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { describeCoaReadError, listCoaReads, readProcessCoa } from '../../services/coaReadsRepository'
import { listProcessDocuments } from '../../services/processDocumentsRepository'
import { buildActionErrorMessage } from '../../utils/errorMessages'
import {
  applyCoaProposals,
  buildCoaProposals,
  buildCoaReportItems,
  collectCoaCertificates,
  isCoaPdf,
  matchCoaCertificates,
} from './cargoCoaMatch'
import { CARGO_REPORT_ROWS_LIMIT_MESSAGE } from './cargoReportFormModel'
import { listCoaDocuments } from './processDocuments'

// S11-C do Relatório de Carga: liga a leitura dos COAs (Tess, via function `readProcessCoa`) à tela. Só o admin com o
// relatório no estágio 1 (rascunho) usa. A leitura é EM SEQUÊNCIA (um arquivo por vez: a 2ª chamada só sai depois da
// 1ª resolver) e o resultado é só uma PROPOSTA: nada vai para o formulário sem o usuário marcar e aplicar, e nada é
// salvo até "Salvar rascunho". Padrão replicado (não é util compartilhado): guard `isMounted` na leitura assíncrona.

const LIST_ERROR_PREFIX = 'Não foi possível listar os COAs do processo.'
const APPLIED_MESSAGE = 'Lotes do COA aplicados'
const STALE_MESSAGE =
  'O relatório mudou depois da leitura dos COAs. A prévia foi atualizada: confira e aplique de novo.'

// Erros que valem só para o arquivo (a fila segue). Qualquer outro (sessão, configuração, limite do dia, serviço fora
// do ar, "ocupado" e o erro genérico que o Cloud Run devolve num 429) INTERROMPE a fila: o resto fica "não lido".
export const COA_READ_FILE_ERROR_CODES = new Set([
  'not-pdf',
  'too-large',
  'tess-too-large',
  'attempts',
  'invalid-response',
  'tess-bad-response',
  'tess-timeout',
  'invalid-file',
  'not-found',
])

const SYNTHETIC_FAILURE = (code) => ({ status: 'failed', documentType: null, certificates: [], error: { code } })

function signatureOf(proposal) {
  return JSON.stringify([proposal.lots, proposal.sumState, proposal.signature])
}

// `form`/`setForm`: estado do formulário; `conference`: marcas da logística (a prévia avisa antes de trocar linhas
// marcadas); `purchaseOrders`: POs do consolidado (reordena ao aplicar); `enabled`: admin no estágio 1.
// `buttonRef`: o foco volta ao botão "Ler COAs" quando a prévia fecha.
export default function useCargoReportCoa({ process, form, setForm, conference, purchaseOrders, enabled, onApplied }) {
  const toast = useToast()
  const processId = process?.id
  const formRef = useRef(form)
  const conferenceRef = useRef(conference)
  const isMountedRef = useRef(true)
  const busyRef = useRef(false)
  const runRef = useRef(0)
  const sessionRef = useRef(null)
  const buttonRef = useRef(null)
  const wasOpenRef = useRef(false)
  const [state, setState] = useState('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState(null)

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    conferenceRef.current = conference
  }, [conference])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Prévia a partir do que foi lido + o formulário MAIS RECENTE. `previous` mantém a escolha do usuário nas propostas
  // que não mudaram; as que mudaram voltam ao padrão.
  const buildPanel = useCallback(
    (session, manualLinks, previous) => {
      const current = formRef.current
      const { certificates, documentNotes } = collectCoaCertificates(session.docs, session.reads, {
        describeError: describeCoaReadError,
      })
      const items = buildCoaReportItems(current, process)
      const match = matchCoaCertificates(certificates, items, process, manualLinks)
      const proposals = buildCoaProposals(current, {
        items,
        certificates,
        match,
        conference: conferenceRef.current,
        process,
      })
      const before = new Map((previous?.proposals ?? []).map((proposal) => [proposal.id, proposal]))
      const selected = proposals
        .filter((proposal) => {
          if (!proposal.applicable) return false
          const old = before.get(proposal.id)
          return old && signatureOf(old) === signatureOf(proposal)
            ? (previous?.selected ?? []).includes(proposal.id)
            : proposal.defaultOn
        })
        .map((proposal) => proposal.id)
      return {
        proposals,
        selected,
        manualLinks,
        documentNotes,
        certificateCount: certificates.length,
        fileCount: new Set(certificates.map((cert) => cert.documentId)).size,
        pdfCount: session.docs.filter(isCoaPdf).length,
        docCount: session.docs.length,
      }
    },
    [process]
  )

  const run = useCallback(
    async ({ force }) => {
      if (!enabled || !processId || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      runRef.current += 1
      const token = runRef.current
      const isAlive = () => isMountedRef.current && runRef.current === token
      setError('')
      setState('reading')
      setProgress({ done: 0, total: 0 })
      setPanel(null)
      try {
        let docs
        let reads
        try {
          docs = listCoaDocuments(await listProcessDocuments(processId, { types: ['coaOriginal'] }))
          reads = await listCoaReads(processId).catch(() => ({}))
        } catch (listError) {
          if (!isAlive()) return
          setError(buildActionErrorMessage(LIST_ERROR_PREFIX, listError))
          setState('error')
          return
        }
        if (!isAlive()) return

        const session = { docs, reads: {} }
        for (const document of docs) {
          if (reads[document.id]) session.reads[document.id] = reads[document.id]
        }
        const readable = docs.filter(isCoaPdf)
        const pending = force ? readable : readable.filter((document) => session.reads[document.id]?.status !== 'done')
        setProgress({ done: 0, total: pending.length })

        let interruption = ''
        for (let index = 0; index < pending.length; index += 1) {
          const document = pending[index]
          let failureCode = ''
          try {
            // Um arquivo por vez: a próxima chamada só sai depois desta resolver.
            const result = await readProcessCoa(processId, document.id, { force })
            if (!isAlive()) return
            if (result.status === 'reading') {
              session.reads[document.id] = { status: 'reading', certificates: [] }
            } else if (result.read) {
              session.reads[document.id] = result.read
              if (result.read.status === 'failed') failureCode = result.read.error?.code ?? 'unknown'
            } else {
              session.reads[document.id] = SYNTHETIC_FAILURE('unknown')
              failureCode = 'unknown'
            }
          } catch (readError) {
            if (!isAlive()) return
            failureCode = readError?.code ?? 'unknown'
            // Sem `force` o resultado bom anterior continua valendo; com `force` o servidor já o zerou.
            if (force || session.reads[document.id]?.status !== 'done') session.reads[document.id] = SYNTHETIC_FAILURE(failureCode)
          }
          if (failureCode && !COA_READ_FILE_ERROR_CODES.has(failureCode)) {
            interruption = describeCoaReadError(failureCode)
            break
          }
          setProgress({ done: index + 1, total: pending.length })
        }

        sessionRef.current = session
        setError(interruption)
        setPanel(buildPanel(session, {}, null))
        setState('ready')
      } finally {
        busyRef.current = false
        if (isMountedRef.current) setBusy(false)
      }
    },
    [buildPanel, enabled, processId]
  )

  const open = useCallback(() => run({ force: false }), [run])
  // Só depois do ConfirmDialog da prévia: apaga o resultado anterior de cada arquivo no servidor.
  const rereadAll = useCallback(() => run({ force: true }), [run])

  const dismiss = useCallback(() => {
    // Leitura em andamento: a chamada em voo termina sozinha (e `busy` segue ligado até lá), mas a fila para.
    runRef.current += 1
    setState('idle')
    setPanel(null)
    setError('')
    setProgress({ done: 0, total: 0 })
  }, [])

  // Saiu do estágio 1 (ou perdeu o direito): a leitura em andamento para e a prévia some.
  useEffect(() => {
    if (!enabled) runRef.current += 1
  }, [enabled])
  const [wasEnabled, setWasEnabled] = useState(enabled)
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled)
    if (!enabled) {
      setState('idle')
      setPanel(null)
      setError('')
      setProgress({ done: 0, total: 0 })
    }
  }

  const isOpen = state !== 'idle'
  useEffect(() => {
    // Só devolve o foco se ele caiu no body (a prévia fechou com o foco dentro dela); clicar em outro botão fica.
    const active = document.activeElement
    if (wasOpenRef.current && !isOpen && (!active || active === document.body)) buttonRef.current?.focus()
    wasOpenRef.current = isOpen
  }, [isOpen])

  const toggle = useCallback((id) => {
    setPanel((current) => {
      if (!current) return current
      const selected = current.selected.includes(id) ? current.selected.filter((value) => value !== id) : [...current.selected, id]
      return { ...current, selected }
    })
  }, [])

  // "Só no COA": liga o certificado a um item (ou desliga com itemKey vazio) e refaz as propostas.
  const link = useCallback(
    (certId, itemKey) => {
      if (!panel || !sessionRef.current) return
      const manualLinks = { ...panel.manualLinks }
      if (itemKey) manualLinks[certId] = itemKey
      else delete manualLinks[certId]
      setPanel(buildPanel(sessionRef.current, manualLinks, panel))
    },
    [buildPanel, panel]
  )

  const apply = useCallback(() => {
    const current = formRef.current
    if (!panel || !current) return
    const result = applyCoaProposals(current, panel.proposals, panel.selected, { purchaseOrders })
    if (result.error === 'limit') {
      toast.error(CARGO_REPORT_ROWS_LIMIT_MESSAGE)
      return
    }
    if (result.error === 'stale') {
      toast.error(STALE_MESSAGE)
      if (sessionRef.current) setPanel(buildPanel(sessionRef.current, panel.manualLinks, null))
      return
    }
    setForm(() => result.form)
    dismiss()
    toast.success(APPLIED_MESSAGE)
    onApplied?.()
  }, [buildPanel, dismiss, onApplied, panel, purchaseOrders, setForm, toast])

  return { state, progress, panel, busy, error, buttonRef, open, rereadAll, toggle, link, apply, dismiss }
}
