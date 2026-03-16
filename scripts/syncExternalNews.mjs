import crypto from 'node:crypto'

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL

function normalizePrivateKey(value) {
  if (!value) return ''

  const normalizedValue = String(value)
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')

  return normalizedValue
}

const FIREBASE_PRIVATE_KEY = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY)

const PRIMARY_WINDOW_HOURS = 24
const FALLBACK_WINDOW_HOURS = 24 * 30

const externalNewsSources = [
  {
    id: 'siscomex-importacao',
    name: 'Siscomex Importacao',
    rssUrl: 'https://www.gov.br/siscomex/pt-br/noticias/noticias-siscomex-importacao/noticias-siscomex-importacao/RSS',
  },
  {
    id: 'siscomex-exportacao',
    name: 'Siscomex Exportacao',
    rssUrl: 'https://www.gov.br/siscomex/pt-br/noticias/noticias-siscomex-exportacao/noticias-siscomex-exportacao/RSS',
  },
  {
    id: 'siscomex-sistemas',
    name: 'Siscomex Sistemas',
    rssUrl: 'https://www.gov.br/siscomex/pt-br/noticias/noticias-siscomex-sistemas/noticias-siscomex-sistemas/RSS',
  },
  {
    id: 'mdic-informativos',
    name: 'MDIC Comercio Exterior',
    rssUrl: 'https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas/informativos/RSS',
  },
  {
    id: 'jornal-portuario',
    name: 'Jornal Portuario',
    rssUrl: 'https://jornalportuario.com.br/rss/noticias',
  },
]

function ensureEnvironment() {
  const missingVariables = [
    !FIREBASE_PROJECT_ID && 'FIREBASE_PROJECT_ID',
    !FIREBASE_CLIENT_EMAIL && 'FIREBASE_CLIENT_EMAIL',
    !FIREBASE_PRIVATE_KEY && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean)

  if (missingVariables.length > 0) {
    throw new Error(`Variaveis ausentes: ${missingVariables.join(', ')}`)
  }

  if (!FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') || !FIREBASE_PRIVATE_KEY.includes('END PRIVATE KEY')) {
    throw new Error('FIREBASE_PRIVATE_KEY invalida: a chave nao esta em formato PEM.')
  }
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function extractAttributeValue(xml, pattern, attributeName) {
  const match = xml.match(pattern)
  if (!match) return ''

  const attributeMatch = match[0].match(new RegExp(`${attributeName}=["']([^"']+)["']`, 'i'))
  return attributeMatch ? decodeXml(attributeMatch[1]) : ''
}

function extractImageUrl(itemXml, rawDescription) {
  const mediaContentUrl = extractAttributeValue(itemXml, /<media:content\b[^>]*>/i, 'url')
  if (mediaContentUrl) return mediaContentUrl

  const mediaThumbnailUrl = extractAttributeValue(itemXml, /<media:thumbnail\b[^>]*>/i, 'url')
  if (mediaThumbnailUrl) return mediaThumbnailUrl

  const enclosureUrl = extractAttributeValue(itemXml, /<enclosure\b[^>]*>/i, 'url')
  if (enclosureUrl) return enclosureUrl

  const imageMatch = String(rawDescription ?? '').match(/<img[^>]+src=["']([^"']+)["']/i)
  return imageMatch ? decodeXml(imageMatch[1]) : ''
}

function sanitizeDescriptionText(value) {
  return stripHtml(value)
    .replace(/\s+-\s+[^-]+$/, '')
    .trim()
}

function isBlockedImageUrl(value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase()

  return (
    normalizedValue.includes('google.com/s2/favicons') ||
    normalizedValue.includes('news.google.com') ||
    normalizedValue.includes('gstatic.com') ||
    normalizedValue.includes('favicon')
  )
}

function buildEditorialFallback(newsItem) {
  const publishedAt = newsItem?.publishedAt ? new Date(newsItem.publishedAt) : null
  const formattedDate =
    publishedAt && !Number.isNaN(publishedAt.getTime())
      ? new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(publishedAt)
      : 'data recente'

  return `Atualização automática coletada de ${newsItem.sourceName} em ${formattedDate}. Abra a fonte oficial para consultar a matéria completa e os detalhes originais desta publicação.`
}

function extractMetaContent(htmlText, attributeName, attributeValue) {
  const pattern = new RegExp(
    `<meta[^>]+${attributeName}=["']${attributeValue}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+${attributeName}=["']${attributeValue}["'][^>]*>`,
    'i'
  )
  const match = htmlText.match(pattern)
  return decodeXml(match?.[1] ?? match?.[2] ?? '')
}

async function fetchArticleMetadata(newsItem) {
  if (!newsItem?.externalUrl) {
    return newsItem
  }

  try {
    const response = await fetch(newsItem.externalUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Portal-COMEX-News-Bot/1.0',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return newsItem
    }

    const htmlText = await response.text()
    const metaDescription =
      extractMetaContent(htmlText, 'property', 'og:description') ||
      extractMetaContent(htmlText, 'name', 'description') ||
      extractMetaContent(htmlText, 'name', 'twitter:description')
    const metaImage =
      extractMetaContent(htmlText, 'property', 'og:image') ||
      extractMetaContent(htmlText, 'name', 'twitter:image')

    return {
      ...newsItem,
      content: newsItem.content || metaDescription || buildEditorialFallback(newsItem),
      summary: newsItem.summary || metaDescription || buildEditorialFallback(newsItem),
      coverImage: !isBlockedImageUrl(newsItem.coverImage) ? newsItem.coverImage : metaImage,
    }
  } catch {
    return {
      ...newsItem,
      content: newsItem.content || buildEditorialFallback(newsItem),
      summary: newsItem.summary || buildEditorialFallback(newsItem),
      coverImage: isBlockedImageUrl(newsItem.coverImage) ? '' : newsItem.coverImage,
    }
  }
}

function parseFeedItems(xmlText) {
  const items = [...xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)]

  return items.map((itemMatch) => {
    const itemXml = itemMatch[1]
    const rawDescription = extractTagValue(itemXml, 'description')

    return {
      title: stripHtml(extractTagValue(itemXml, 'title')),
      description: sanitizeDescriptionText(rawDescription),
      link: stripHtml(extractTagValue(itemXml, 'link')),
      guid: stripHtml(extractTagValue(itemXml, 'guid')),
      pubDate: stripHtml(extractTagValue(itemXml, 'pubDate')),
      imageUrl: extractImageUrl(itemXml, rawDescription),
    }
  })
}

function buildAutomaticNewsId(sourceId, rawId) {
  const baseId = String(rawId ?? '')
    .trim()
    .replace(/[^\w-]+/g, '-')

  return `AUTO-${sourceId}-${baseId || crypto.randomUUID()}`
}

function buildDedupKey(newsItem) {
  const normalizedUrl = String(newsItem.externalUrl ?? '')
    .trim()
    .toLowerCase()

  if (normalizedUrl) {
    return normalizedUrl
  }

  return `${String(newsItem.title ?? '').trim().toLowerCase()}::${String(newsItem.publishedAt ?? '').trim()}`
}

function isWithinLastHours(value, hours) {
  if (!value) return false

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false

  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000
}

async function fetchFeedItems(source) {
  const response = await fetch(source.rssUrl, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  })

  if (!response.ok) {
    throw new Error(`Falha ao consultar feed ${source.name}.`)
  }

  const xmlText = await response.text()

  return parseFeedItems(xmlText)
    .slice(0, 20)
    .map((item) => {
      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()

      return {
        id: buildAutomaticNewsId(source.id, item.guid || item.link || item.title),
        title: item.title,
        content: item.description || '',
        summary: item.description || '',
        coverImage: isBlockedImageUrl(item.imageUrl) ? '' : item.imageUrl,
        mediaItems: [],
        references: item.link ? [item.link] : [],
        sourceType: 'automatic',
        sourceName: source.name,
        externalUrl: item.link,
        createdAt: publishedAt,
        updatedAt: publishedAt,
        publishedAt,
      }
    })
    .filter((item) => item.title && item.externalUrl && isWithinLastHours(item.publishedAt, FALLBACK_WINDOW_HOURS))
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getAccessToken() {
  const nowInSeconds = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowInSeconds,
    exp: nowInSeconds + 3600,
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(FIREBASE_PRIVATE_KEY, 'base64url')
  const assertion = `${unsignedToken}.${signature}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw new Error('Falha ao obter token OAuth para gravar noticias externas.')
  }

  const payloadResponse = await response.json()
  return payloadResponse.access_token
}

function toFirestoreValue(value) {
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    }
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value }
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }

  return { stringValue: String(value ?? '') }
}

function toFirestoreDocument(newsItem) {
  return {
    fields: Object.fromEntries(
      Object.entries(newsItem).map(([key, value]) => [key, toFirestoreValue(value)])
    ),
  }
}

async function upsertExternalNewsItem(newsItem, accessToken) {
  const requestUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/externalNews/${encodeURIComponent(newsItem.id)}`

  const response = await fetch(requestUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDocument(newsItem)),
  })

  if (!response.ok) {
    const errorPayload = await response.text()
    throw new Error(`Falha ao gravar noticia externa ${newsItem.id}: ${errorPayload}`)
  }
}

async function main() {
  ensureEnvironment()

  const settledFeeds = await Promise.allSettled(
    externalNewsSources.map((source) => fetchFeedItems(source))
  )

  const loadedNews = settledFeeds
    .filter((item) => item.status === 'fulfilled')
    .flatMap((item) => item.value)
    .filter((item, index, allItems) => index === allItems.findIndex((candidate) => buildDedupKey(candidate) === buildDedupKey(item)))

  if (loadedNews.length === 0) {
    console.log('Nenhuma noticia externa encontrada nos ultimos 30 dias.')
    return
  }

  const enrichedNews = await Promise.all(loadedNews.map((item) => fetchArticleMetadata(item)))
  const finalizedNews = enrichedNews.map((item) => ({
    ...item,
    content: item.content || buildEditorialFallback(item),
    summary: item.summary || buildEditorialFallback(item),
    coverImage: isBlockedImageUrl(item.coverImage) ? '' : item.coverImage,
  }))
  const accessToken = await getAccessToken()
  await Promise.all(finalizedNews.map((item) => upsertExternalNewsItem(item, accessToken)))

  const recentNewsCount = finalizedNews.filter((item) => isWithinLastHours(item.publishedAt, PRIMARY_WINDOW_HOURS)).length

  console.log(
    `Sincronizacao concluida: ${finalizedNews.length} noticias externas processadas (${recentNewsCount} nas ultimas 24 horas).`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
