// S11-D2: envio de COA em sequência (vários arquivos), usado pelo card do COA (FCL/LCL/AÉREO e leitores do
// consolidado) e pela célula "COA" de cada PO. Progresso "Enviando X de Y…", erro por arquivo, teto de vagas
// (`room`, vem de `getCoaUploadRoom`), arrastar e soltar e foco de volta ao botão ao terminar.
//
// `po` só vale no CONSOLIDADO (o COA é por PO lá); sem PO o envio é barrado ANTES do upload.
// Padrão replicado (não é util compartilhado): guard `isMounted` em async (aqui via `mountedRef`).

import { useEffect, useRef, useState } from 'react'
import { getFriendlyErrorDetail } from '../../utils/errorMessages'
import { uploadProcessDocument } from '../../services/processDocumentsRepository'
import {
  MAX_COA_FILES_PER_PROCESS,
  MAX_COA_FILES_PER_PURCHASE_ORDER,
  canUploadDocumentType,
  isCoaPurchaseOrderScoped,
  isFileDragEvent,
  pickDroppedFiles,
} from './processDocuments'

const COA_TYPE = 'coaOriginal'
export const COA_UPLOAD_ERROR_TITLE = 'Não foi possível enviar o documento.'

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural
}

export default function useCoaUpload({ processId, profile, category, po = '', room, onChanged }) {
  const role = profile?.role
  const canUpload = canUploadDocumentType(role, COA_TYPE)
  const scoped = isCoaPurchaseOrderScoped(category)
  const poNumber = String(po ?? '').trim()

  const [progress, setProgress] = useState(null)
  const [errors, setErrors] = useState([])
  const [resultMessage, setResultMessage] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef(null)
  const buttonRef = useRef(null)
  const wasUploadingRef = useRef(false)
  const mountedRef = useRef(true)
  const busyRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isUploading = progress !== null

  // Teclado: o botão de envio fica desabilitado durante o envio; ao terminar, o foco volta a ele.
  useEffect(() => {
    if (isUploading) {
      wasUploadingRef.current = true
      return
    }
    if (!wasUploadingRef.current) return
    wasUploadingRef.current = false
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

  async function uploadFiles(files) {
    if (!canUpload || busyRef.current || files.length === 0) return
    const blocked = getBlockedMessage(files.length)
    if (blocked) {
      setResultMessage('')
      setErrors([blocked])
      return
    }

    busyRef.current = true
    setErrors([])
    setResultMessage('')
    const failures = []
    let sent = 0

    try {
      for (let index = 0; index < files.length; index += 1) {
        if (!mountedRef.current) return
        const file = files[index]
        setProgress({ current: index + 1, total: files.length })
        try {
          await uploadProcessDocument(processId, {
            type: COA_TYPE,
            file,
            category,
            po: scoped ? poNumber : undefined,
            actor: { uid: profile?.uid, name: profile?.name, role },
          })
          sent += 1
        } catch (error) {
          console.error(COA_UPLOAD_ERROR_TITLE, error)
          failures.push({ name: file?.name ?? '', detail: getFriendlyErrorDetail(error) })
        }
      }
    } finally {
      busyRef.current = false
    }

    if (!mountedRef.current) return
    setProgress(null)
    setErrors(failures)
    if (sent > 0) {
      setResultMessage(
        failures.length === 0
          ? `${sent} ${pluralize(sent, 'COA enviado', 'COAs enviados')}.`
          : `${sent} de ${files.length} COAs enviados.`
      )
      onChanged?.()
    }
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
    const blocked = getBlockedMessage(Math.max(dropped, 1))
    if (blocked) {
      setResultMessage('')
      setErrors([blocked])
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
  }
}
