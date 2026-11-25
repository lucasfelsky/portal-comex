import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteOwnCargoConferencePhotoFiles,
  uploadCargoConferencePhoto,
} from '../../services/cargoConferencePhotosRepository'
import { admitCargoPhotoFiles, cargoPhotoRoom, describeCargoPhotoError } from './cargoConferencePhotos'
import { isCargoPhotoFile, prepareCargoPhoto } from './cargoPhotoResize'
import { registerCargoPhotoBlobs } from './useCargoPhotoUrls'

// S10-J1b do Relatório de Carga: fila de envio das fotos de avaria, compartilhada pelo celular e pelo computador.
// Uma foto por vez: reduz no aparelho (`prepareCargoPhoto`), envia (`uploadCargoConferencePhoto`, com progresso e
// AbortSignal) e, ao terminar, entrega o `Photo` a `onUploaded(rowId, photo)`: a foto entra no estado do item e fica
// "não salva" até o Salvar (nada é gravado no Firestore aqui). Falha de rede/Storage: o que subiu é desfeito pelo
// repositório, a foto reduzida fica na memória e `retry` reenvia sem reduzir de novo. Ao desmontar, os envios em andamento
// são abortados (o repositório apaga o que já tinha subido).

const BUSY = new Set(['queued', 'resizing', 'uploading'])

function countByRow(uploads) {
  const result = {}
  for (const upload of uploads) result[upload.rowId] = (result[upload.rowId] ?? 0) + 1
  return result
}

export default function useCargoPhotoUploads({ processId, uid, conference, enabled = true, onUploaded }) {
  const [uploads, setUploads] = useState([])
  const [notice, setNotice] = useState(null)
  const uploadsRef = useRef([])
  const jobsRef = useRef(new Map())
  const queueRef = useRef([])
  const runningRef = useRef(false)
  const mountedRef = useRef(true)
  const counterRef = useRef(0)
  const conferenceRef = useRef(conference)
  const onUploadedRef = useRef(onUploaded)
  const contextRef = useRef({ processId, uid })

  // Os refs acompanham a última renderização (os envios terminam bem depois da chamada que os iniciou).
  useEffect(() => {
    conferenceRef.current = conference
    onUploadedRef.current = onUploaded
    contextRef.current = { processId, uid }
  })

  useEffect(() => {
    mountedRef.current = true
    const jobs = jobsRef.current
    return () => {
      mountedRef.current = false
      for (const job of jobs.values()) job.controller?.abort()
    }
  }, [])

  function commit(updater) {
    const next = updater(uploadsRef.current)
    uploadsRef.current = next
    if (mountedRef.current) setUploads(next)
  }

  function patchUpload(key, changes) {
    commit((list) => {
      const current = list.find((item) => item.key === key)
      if (!current) return list
      if (Object.keys(changes).every((field) => current[field] === changes[field])) return list
      return list.map((item) => (item.key === key ? { ...item, ...changes } : item))
    })
  }

  function dropUpload(key) {
    jobsRef.current.delete(key)
    queueRef.current = queueRef.current.filter((item) => item !== key)
    commit((list) => list.filter((item) => item.key !== key))
  }

  async function runJob(key, job) {
    const controller = new AbortController()
    job.controller = controller
    const { processId: currentProcessId, uid: currentUid } = contextRef.current
    try {
      if (!job.prepared) {
        patchUpload(key, { status: 'resizing', progress: 0, error: '' })
        job.prepared = await prepareCargoPhoto(job.file)
        if (controller.signal.aborted) return
      }
      patchUpload(key, { status: 'uploading', progress: 0, error: '' })
      const photo = await uploadCargoConferencePhoto(currentProcessId, job.rowId, job.prepared, {
        uid: currentUid,
        signal: controller.signal,
        onProgress: (percent) => patchUpload(key, { progress: percent }),
      })
      if (controller.signal.aborted || !jobsRef.current.has(key)) {
        // Cancelada no fim do envio: o arquivo que acabou de subir não fica órfão.
        await deleteOwnCargoConferencePhotoFiles(currentProcessId, [photo], { uid: currentUid }).catch(() => {})
        return
      }
      registerCargoPhotoBlobs(photo.id, { thumb: job.prepared.thumb.blob, full: job.prepared.full.blob })
      dropUpload(key)
      onUploadedRef.current?.(job.rowId, photo)
    } catch (error) {
      if (controller.signal.aborted || !jobsRef.current.has(key)) return
      const described = describeCargoPhotoError(error)
      if (!described) {
        dropUpload(key)
        return
      }
      patchUpload(key, { status: 'error', error: described.text, retryable: described.retryable && Boolean(job.prepared) })
    } finally {
      job.controller = null
    }
  }

  async function pump() {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (mountedRef.current) {
        const key = queueRef.current.shift()
        if (!key) break
        const job = jobsRef.current.get(key)
        if (job) await runJob(key, job)
      }
    } finally {
      runningRef.current = false
    }
  }

  // Escolheu fotos para um item: só imagem, só as que cabem (5 por item, 30 por conferência, contando as em envio).
  function addFiles(rowId, fileList) {
    if (!enabled) return
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    const images = files.filter(isCargoPhotoFile)
    const ignored = files.length - images.length
    const room = cargoPhotoRoom(conferenceRef.current, rowId, countByRow(uploadsRef.current))
    const admitted = admitCargoPhotoFiles(images, room)
    const messages = []
    if (ignored > 0) messages.push(`${ignored === 1 ? '1 arquivo ignorado' : `${ignored} arquivos ignorados`}: escolha apenas fotos.`)
    if (admitted.message) messages.push(admitted.message)
    setNotice(messages.length > 0 ? { rowId, text: messages.join(' ') } : null)
    for (const file of admitted.accepted) {
      counterRef.current += 1
      const key = `up-${counterRef.current}`
      jobsRef.current.set(key, { rowId, file, prepared: null, controller: null })
      queueRef.current.push(key)
      commit((list) => [...list, { key, rowId, name: file.name ?? '', status: 'queued', progress: 0, error: '', retryable: false }])
    }
    pump()
  }

  function retry(key) {
    const job = jobsRef.current.get(key)
    const upload = uploadsRef.current.find((item) => item.key === key)
    if (!job || !job.prepared || upload?.status !== 'error') return
    setNotice(null)
    patchUpload(key, { status: 'queued', progress: 0, error: '', retryable: false })
    queueRef.current.push(key)
    pump()
  }

  // Cancela o envio em andamento (ou dispensa o que falhou): libera a vaga do item.
  const cancel = useCallback((key) => {
    const job = jobsRef.current.get(key)
    if (!job) return
    jobsRef.current.delete(key)
    job.controller?.abort()
    queueRef.current = queueRef.current.filter((item) => item !== key)
    uploadsRef.current = uploadsRef.current.filter((item) => item.key !== key)
    if (mountedRef.current) setUploads(uploadsRef.current)
  }, [])

  const cancelAll = useCallback(() => {
    for (const key of Array.from(jobsRef.current.keys())) cancel(key)
    setNotice(null)
  }, [cancel])

  const pendingByRow = useMemo(() => countByRow(uploads), [uploads])
  const room = (rowId) => cargoPhotoRoom(conference, rowId, pendingByRow)

  return {
    uploads,
    notice,
    room,
    addFiles,
    retry,
    cancel,
    cancelAll,
    clearNotice: () => setNotice(null),
    isUploading: uploads.some((upload) => BUSY.has(upload.status)),
    hasUploads: uploads.length > 0,
  }
}
