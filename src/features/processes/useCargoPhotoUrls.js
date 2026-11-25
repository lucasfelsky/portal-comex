import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadCargoConferencePhotoBlob } from '../../services/cargoConferencePhotosRepository'

// S10-J1b do Relatório de Carga: imagens das fotos de avaria. As fotos ficam no Storage com leitura fechada (L38):
// cada miniatura/foto cheia vem da function `downloadCargoConferencePhoto` (token do usuário) como blob e vira uma URL
// local (`URL.createObjectURL`), nunca uma URL permanente. Cache de módulo por sessão (id + tamanho), no máximo 3
// downloads ao mesmo tempo e fila que descarta quem já não tem tela esperando. A foto recém-enviada entra no cache pelo
// blob local (`registerCargoPhotoBlobs`), sem baixar de novo. As URLs locais são criadas e revogadas pelo hook (cada
// tela revoga as suas ao desmontar; o blob continua no cache).

const MAX_CONCURRENT_DOWNLOADS = 3
const MAX_CACHED_PHOTOS = 150

const cache = new Map()
const queue = []
let active = 0

function keyOf(photoId, size) {
  return `${photoId}|${size}`
}

function notify(entry) {
  for (const listener of Array.from(entry.listeners)) listener()
}

// Mantém o cache dentro do teto: sai primeiro a foto pronta mais antiga que nenhuma tela está usando.
function trimCache() {
  if (cache.size <= MAX_CACHED_PHOTOS) return
  for (const [key, entry] of cache) {
    if (cache.size <= MAX_CACHED_PHOTOS) return
    if (entry.status !== 'loading' && entry.status !== 'queued' && entry.listeners.size === 0) cache.delete(key)
  }
}

function pump() {
  while (active < MAX_CONCURRENT_DOWNLOADS && queue.length > 0) {
    const entry = queue.shift()
    if (entry.status !== 'queued') continue
    // Cancelamento: a tela que pediu já foi embora; não gasta uma invocação da function.
    if (entry.listeners.size === 0) {
      cache.delete(entry.key)
      continue
    }
    entry.status = 'loading'
    active += 1
    downloadCargoConferencePhotoBlob(entry.processId, entry.photoId, entry.size)
      .then((blob) => {
        entry.blob = blob
        entry.status = 'ready'
      })
      .catch(() => {
        entry.status = 'error'
      })
      .finally(() => {
        active -= 1
        trimCache()
        notify(entry)
        pump()
      })
  }
}

function acquire(processId, photoId, size) {
  const key = keyOf(photoId, size)
  let entry = cache.get(key)
  // Erro antigo: tenta de novo (o "Tentar de novo" do usuário e a próxima abertura da tela).
  if (entry?.status === 'error') {
    cache.delete(key)
    entry = undefined
  }
  if (!entry) {
    entry = { key, processId, photoId, size, status: 'queued', blob: null, listeners: new Set() }
    cache.set(key, entry)
    queue.push(entry)
  }
  return entry
}

function subscribe(processId, photoId, size, listener) {
  const entry = acquire(processId, photoId, size)
  entry.listeners.add(listener)
  pump()
  return { entry, unsubscribe: () => entry.listeners.delete(listener) }
}

// Foto que acabou de ser enviada: o blob reduzido e a miniatura que já estão na memória valem como cache.
export function registerCargoPhotoBlobs(photoId, { thumb, full } = {}) {
  for (const [size, blob] of [
    ['thumb', thumb],
    ['full', full],
  ]) {
    if (!blob || !photoId) continue
    const key = keyOf(photoId, size)
    if (cache.get(key)?.status === 'ready') continue
    cache.set(key, { key, processId: '', photoId, size, status: 'ready', blob, listeners: new Set() })
  }
  trimCache()
}

export function clearCargoPhotoCache() {
  cache.clear()
  queue.length = 0
}

// `photos`: fotos do item (`{ id, ... }`). `size`: 'thumb' (miniatura) ou 'full' (foto reduzida a 1.600 px).
// -> { urlOf(id), statusOf(id): 'loading' | 'ready' | 'error', retry(id) }. Padrão `isMounted` no efeito.
export default function useCargoPhotoUrls(processId, photos, { size = 'thumb' } = {}) {
  const ids = useMemo(
    () => (Array.isArray(photos) ? photos : []).map((photo) => photo?.id).filter((id) => typeof id === 'string' && id),
    [photos]
  )
  const idsKey = ids.join(',')
  const [snapshot, setSnapshot] = useState({ urls: {}, statuses: {} })
  const [retryToken, setRetryToken] = useState(0)
  const urlsRef = useRef(new Map())

  useEffect(() => {
    let isMounted = true
    const wanted = idsKey ? idsKey.split(',') : []
    const subscriptions = []

    function refresh() {
      if (!isMounted) return
      const urls = {}
      const statuses = {}
      const keep = new Set(wanted)
      for (const [id, item] of urlsRef.current) {
        if (keep.has(id)) continue
        URL.revokeObjectURL(item.url)
        urlsRef.current.delete(id)
      }
      subscriptions.forEach(({ entry }, index) => {
        const id = wanted[index]
        statuses[id] = entry.status === 'queued' ? 'loading' : entry.status
        if (entry.status !== 'ready' || !entry.blob) return
        let item = urlsRef.current.get(id)
        if (item && item.blob !== entry.blob) {
          URL.revokeObjectURL(item.url)
          item = undefined
        }
        if (!item) {
          item = { blob: entry.blob, url: URL.createObjectURL(entry.blob) }
          urlsRef.current.set(id, item)
        }
        urls[id] = item.url
      })
      setSnapshot({ urls, statuses })
    }

    for (const id of wanted) subscriptions.push(subscribe(processId, id, size, refresh))
    refresh()
    return () => {
      isMounted = false
      subscriptions.forEach(({ unsubscribe }) => unsubscribe())
    }
  }, [processId, idsKey, size, retryToken])

  // Ao desmontar: revoga as URLs locais desta tela (o blob segue no cache da sessão).
  useEffect(() => {
    const urls = urlsRef.current
    return () => {
      for (const item of urls.values()) URL.revokeObjectURL(item.url)
      urls.clear()
    }
  }, [])

  return {
    urlOf: (id) => snapshot.urls[id] ?? '',
    statusOf: (id) => snapshot.statuses[id] ?? 'loading',
    retry: () => setRetryToken((token) => token + 1),
  }
}
