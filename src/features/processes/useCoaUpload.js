// S11-D2: envio de COA em sequência (vários arquivos), usado pelo card do COA (FCL/LCL/AÉREO e leitores do
// consolidado) e pela célula "COA" de cada PO. Progresso "Enviando X de Y…", erro por arquivo, teto de vagas
// (`room`, vem de `getCoaUploadRoom`), arrastar e soltar e foco de volta ao botão ao terminar.
//
// S11-I: o laço de upload mora em `coaUploadStore` (envio em segundo plano). Este hook só valida, inicia o envio com
// tudo capturado e lê o andamento do store (`useSyncExternalStore`): sair da aba ou trocar de processo não interrompe.
//
// `po` só vale no CONSOLIDADO (o COA é por PO lá); sem PO o envio é barrado ANTES do upload.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useOptionalToast } from '../../components/Toast'
import useCoaAutoRead from './useCoaAutoRead'
import { buildCoaAutoReadKey } from './coaAutoReadQueue'
import {
  COA_UPLOAD_ERROR_TITLE,
  getCoaUploadState,
  isCoaUploadBusy,
  startCoaUpload,
  subscribeCoaUpload,
  watchCoaUpload,
} from './coaUploadStore'
import {
  MAX_COA_FILES_PER_PROCESS,
  MAX_COA_FILES_PER_PURCHASE_ORDER,
  canUploadDocumentType,
  isCoaPurchaseOrderScoped,
  isFileDragEvent,
  pickDroppedFiles,
} from './processDocuments'

const COA_TYPE = 'coaOriginal'
export { COA_UPLOAD_ERROR_TITLE }

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export default function useCoaUpload({ processId, profile, category, po = '', room, onChanged }) {
  const role = profile?.role
  const canUpload = canUploadDocumentType(role, COA_TYPE)
  const scoped = isCoaPurchaseOrderScoped(category)
  const poNumber = String(po ?? '').trim()
  const scope = scoped ? poNumber : ''
  const key = buildCoaAutoReadKey(processId, scope)
  // S11-E: leitura automática ao anexar (sempre ligada, só admin; fila única do painel).
  const autoRead = useCoaAutoRead({ processId, enabled: canUpload && role === 'admin', scope })
  const toast = useOptionalToast()

  const entry = useSyncExternalStore(
    subscribeCoaUpload,
    () => getCoaUploadState().entries[key],
    () => undefined
  )
  const [blocked, setBlocked] = useState(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef(null)
  const buttonRef = useRef(null)
  const wasUploadingRef = useRef(false)
  const startedHereRef = useRef(false)
  const onChangedRef = useRef(onChanged)
  const doneSeq = entry?.doneSeq ?? 0
  const seqRef = useRef({ key, seq: doneSeq })

  useEffect(() => {
    onChangedRef.current = onChanged
  })

  // Conta este componente como "assistindo" a chave (resultado pronto aparece uma vez; falha com a tela fechada vira toast).
  useEffect(() => (canUpload ? watchCoaUpload(key) : undefined), [canUpload, key])

  // Recarrega a lista quando um envio termina com a tela aberta (inclusive se voltou no meio do envio). O valor da
  // montagem só é guardado: o painel já carrega a lista ao montar.
  useEffect(() => {
    const last = seqRef.current
    if (last.key !== key) {
      seqRef.current = { key, seq: doneSeq }
      startedHereRef.current = false
      return
    }
    if (doneSeq === last.seq) return
    seqRef.current = { key, seq: doneSeq }
    if (doneSeq > last.seq) onChangedRef.current?.()
  }, [key, doneSeq])

  const isUploading = entry?.status === 'sending'
  const progress = isUploading ? { current: entry.current, total: entry.total } : null
  const errors = blocked ? [blocked] : (entry?.errors ?? [])
  let resultMessage = ''
  if (!blocked && entry?.status === 'done' && entry.sent > 0) {
    resultMessage =
      entry.errors.length === 0
        ? `${entry.sent} ${pluralize(entry.sent, 'COA enviado', 'COAs enviados')}.`
        : `${entry.sent} de ${entry.total} COAs enviados.`
  }

  // Teclado: o botão de envio fica desabilitado durante o envio; ao terminar, o foco volta a ele (só se esta instância
  // iniciou o envio: quem voltou à aba no meio dele não perde o foco).
  useEffect(() => {
    if (isUploading) {
      wasUploadingRef.current = true
      return
    }
    if (!wasUploadingRef.current) return
    wasUploadingRef.current = false
    if (!startedHereRef.current) return
    startedHereRef.current = false
    buttonRef.current?.focus()
  }, [isUploading])

  // Por que o envio não pode seguir: consolidado sem PO, ou arquivos demais para as vagas que restam.
  function getBlockedMessage(selected) {
    if (scoped && !poNumber) return { name: '', detail: 'Escolha a PO do COA antes de enviar.' }
    if (selected <= room) return null
    const max = scoped ? MAX_COA_FILES_PER_PURCHASE_ORDER : MAX_COA_FILES_PER_PROCESS
    const base = `Limite de ${max} COAs por ${scoped ? 'PO' : 'processo'}.`
    return { name: '', detail: room > 0 ? `${base} Cabem mais ${room}; você escolheu ${selected}.` : base }
  }

  function uploadFiles(files) {
    if (!canUpload || files.length === 0 || isCoaUploadBusy(key)) return
    const message = getBlockedMessage(files.length)
    if (message) {
      setBlocked(message)
      return
    }
    setBlocked(null)
    // Tudo é capturado AGORA: o envio segue com estes valores mesmo que a tela feche ou o processo mude.
    startedHereRef.current = startCoaUpload({
      processId,
      scope,
      category,
      actor: { uid: profile?.uid, name: profile?.name, role },
      files,
      // S11-H (L157): bilhete da leitura automática pedido AGORA (montado e admin no início). Nulo = nada é enfileirado.
      send: autoRead.beginSend(),
      notify: toast,
    })
  }

  function handleDragOver(event) {
    if (isUploading || !isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsDragOver(false)
  }

  function handleDrop(event) {
    if (isUploading || !isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    const dropped = event.dataTransfer?.files?.length ?? 0
    const message = getBlockedMessage(Math.max(dropped, 1))
    if (message) {
      setBlocked(message)
      return
    }
    const { files } = pickDroppedFiles(event.dataTransfer, room)
    if (files.length > 0) uploadFiles(files)
  }

  const dropProps = canUpload
    ? { onDragEnter: handleDragOver, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }
    : {}

  return {
    canUpload,
    uploadFiles,
    progress,
    errors,
    resultMessage,
    isUploading,
    buttonRef,
    inputRef,
    dropProps,
    isDragOver: canUpload && isDragOver,
    autoRead,
  }
}
