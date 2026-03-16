import { collection, getDocs } from 'firebase/firestore'
import { firestore, isFirebaseConfigured } from '../lib/firebase'

const STORAGE_KEY = 'sq-comex-external-news'

function normalizeStringValue(value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue || normalizedValue === 'null' || normalizedValue === 'undefined') {
    return ''
  }

  return normalizedValue
}

function normalizeExternalNewsItem(rawNewsItem, fallbackId) {
  return {
    id: rawNewsItem.id ?? fallbackId,
    title: normalizeStringValue(rawNewsItem.title),
    content: normalizeStringValue(rawNewsItem.content),
    summary: normalizeStringValue(rawNewsItem.summary ?? rawNewsItem.content),
    coverImage: normalizeStringValue(rawNewsItem.coverImage),
    mediaItems: Array.isArray(rawNewsItem.mediaItems) ? rawNewsItem.mediaItems : [],
    references: Array.isArray(rawNewsItem.references) ? rawNewsItem.references.filter(Boolean) : [],
    createdAt: rawNewsItem.createdAt ?? new Date().toISOString(),
    updatedAt: rawNewsItem.updatedAt ?? rawNewsItem.createdAt ?? new Date().toISOString(),
    publishedAt: rawNewsItem.publishedAt ?? rawNewsItem.updatedAt ?? rawNewsItem.createdAt ?? new Date().toISOString(),
    sourceType: 'automatic',
    sourceName: normalizeStringValue(rawNewsItem.sourceName) || 'Fonte oficial',
    externalUrl: normalizeStringValue(rawNewsItem.externalUrl),
  }
}

function sortNews(newsItems) {
  return [...newsItems].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime()
    const rightTime = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime()
    return rightTime - leftTime
  })
}

function readLocalExternalNews() {
  const storedNews = window.localStorage.getItem(STORAGE_KEY)

  if (!storedNews) return []

  try {
    return JSON.parse(storedNews)
  } catch {
    return []
  }
}

function writeLocalExternalNews(newsItems) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newsItems))
}

export async function listExternalNews() {
  if (!isFirebaseConfigured || !firestore) {
    return sortNews(readLocalExternalNews().map((item) => normalizeExternalNewsItem(item)))
  }

  const snapshot = await getDocs(collection(firestore, 'externalNews'))
  const loadedNews = snapshot.docs.map((item) => normalizeExternalNewsItem(item.data(), item.id))
  const sortedNews = sortNews(loadedNews)
  writeLocalExternalNews(sortedNews)
  return sortedNews
}
