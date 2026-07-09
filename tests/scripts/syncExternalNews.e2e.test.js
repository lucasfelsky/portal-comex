// Teste E2E REAL do scripts/syncExternalNews.mjs (Fluxo C da Integracao
// end-to-end): roda o script de verdade (child_process) contra o emulador
// Firestore, com feeds RSS servidos por um HTTP server local. Cobre o caminho
// completo: fetch RSS -> parse -> janela de 30 dias -> dedup -> enriquecimento
// og: -> upsert externalNews + DLQ (externalNewsDlq).
//
// Como rodar (precisa de JDK 11+):
//   npm run test:sync-news
// que sobe o emulador Firestore (via scripts/with-jdk.mjs) e roda este arquivo.
//
// Quando FIRESTORE_EMULATOR_HOST NAO esta setado (ex.: `npm test` normal), o
// describe inteiro e' pulado — a suite padrao continua verde sem Java.

import { spawn } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = join(HERE, '..', '..', 'scripts', 'syncExternalNews.mjs')
const PROJECT_ID = 'demo-sqcomex'

const EMULATOR_UP = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const describeEmulator = EMULATOR_UP ? describe : describe.skip

// O script faz fetch de feeds + enriquecimento + upserts; folga pra CI lento.
const SYNC_TIMEOUT_MS = 60_000

function rssFeed(baseUrl) {
  const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toUTCString()
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toUTCString()

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Feed de Teste</title>
    <item>
      <title>Nova regra de &lt;b&gt;importacao&lt;/b&gt; publicada</title>
      <description><![CDATA[<p>Resumo com <b>HTML</b> no corpo.</p>]]></description>
      <link>${baseUrl}/artigo/1</link>
      <guid>item-1</guid>
      <pubDate>${recentDate}</pubDate>
      <media:content url="${baseUrl}/imagens/capa-1.jpg" />
    </item>
    <item>
      <title>Comunicado sem descricao no feed</title>
      <description></description>
      <link>${baseUrl}/artigo/2</link>
      <guid>item-2</guid>
      <pubDate>${recentDate}</pubDate>
    </item>
    <item>
      <title>Noticia velha fora da janela de 30 dias</title>
      <description>Nao deve ser gravada.</description>
      <link>${baseUrl}/artigo/3</link>
      <guid>item-3</guid>
      <pubDate>${oldDate}</pubDate>
    </item>
  </channel>
</rss>`
}

const ARTICLE_2_HTML = `<!doctype html>
<html><head>
  <meta property="og:description" content="Descricao vinda do og:description da pagina." />
  <meta property="og:image" content="https://cdn.example.com/og-capa-2.png" />
</head><body>artigo 2</body></html>`

describeEmulator('syncExternalNews.mjs (emulador, Fluxo C)', () => {
  let app
  let db
  let server
  let baseUrl
  let firstRun

  // spawn assincrono (NAO spawnSync): o server RSS mock vive NESTE processo,
  // e spawnSync bloquearia o event loop -> o child nunca receberia resposta
  // dos feeds (deadlock ate' o timeout).
  function runSync() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SCRIPT_PATH], {
        env: {
          ...process.env,
          FIREBASE_PROJECT_ID: PROJECT_ID,
          EXTERNAL_NEWS_SOURCES_JSON: JSON.stringify([
            { id: 'teste-fonte', name: 'Fonte de Teste', rssUrl: `${baseUrl}/feed-ok` },
            { id: 'teste-quebrado', name: 'Fonte Quebrada', rssUrl: `${baseUrl}/feed-quebrado` },
          ]),
        },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`sync nao terminou em ${SYNC_TIMEOUT_MS - 5000}ms\nstdout: ${stdout}\nstderr: ${stderr}`))
      }, SYNC_TIMEOUT_MS - 5_000)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (status) => {
        clearTimeout(timer)
        resolve({ status, stdout, stderr })
      })
    })
  }

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT_ID }, 'sync-external-news-e2e')
    db = getFirestore(app)

    server = http.createServer((req, res) => {
      if (req.url === '/feed-ok') {
        res.writeHead(200, { 'Content-Type': 'application/rss+xml' })
        res.end(rssFeed(baseUrl))
      } else if (req.url === '/artigo/2') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(ARTICLE_2_HTML)
      } else if (req.url?.startsWith('/artigo/')) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<!doctype html><html><head></head><body>sem og</body></html>')
      } else {
        res.writeHead(500)
        res.end('erro proposital')
      }
    })
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    firstRun = await runSync()
  }, SYNC_TIMEOUT_MS)

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (app) await deleteApp(app)
  })

  it('roda com exit 0 e loga o resumo da sincronizacao', () => {
    expect(firstRun.status).toBe(0)
    // 2 itens recentes gravados (o terceiro cai na janela de 30 dias).
    expect(firstRun.stdout).toContain('Sincronizacao concluida: 2/2 noticias gravadas')
  })

  it(
    'grava externalNews com id AUTO-, sourceType automatic e filtra janela de 30 dias',
    async () => {
      const snapshot = await db.collection('externalNews').get()
      const byId = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))

      expect(byId.size).toBe(2)
      expect(byId.has('AUTO-teste-fonte-item-1')).toBe(true)
      expect(byId.has('AUTO-teste-fonte-item-2')).toBe(true)
      expect(byId.has('AUTO-teste-fonte-item-3')).toBe(false)

      const item1 = byId.get('AUTO-teste-fonte-item-1')
      // Title com HTML do feed vem stripped e decodado.
      expect(item1.title).toBe('Nova regra de importacao publicada')
      expect(item1.content).toBe('Resumo com HTML no corpo.')
      expect(item1.sourceType).toBe('automatic')
      expect(item1.sourceName).toBe('Fonte de Teste')
      expect(item1.externalUrl).toBe(`${baseUrl}/artigo/1`)
      expect(item1.coverImage).toBe(`${baseUrl}/imagens/capa-1.jpg`)
      expect(item1.references).toEqual([`${baseUrl}/artigo/1`])
      // publishedAt ISO valido.
      expect(Number.isNaN(new Date(item1.publishedAt).getTime())).toBe(false)
    },
    SYNC_TIMEOUT_MS
  )

  it('enriquece item sem descricao com og:description e og:image da pagina', async () => {
    const doc = await db.collection('externalNews').doc('AUTO-teste-fonte-item-2').get()
    const item2 = doc.data()

    expect(item2.content).toBe('Descricao vinda do og:description da pagina.')
    expect(item2.summary).toBe('Descricao vinda do og:description da pagina.')
    // Comportamento atual do script: og:image so substitui coverImage quando a
    // imagem do feed e' BLOQUEADA (favicon/gstatic); cover ausente ('') fica
    // vazio (ver ternario em fetchArticleMetadata). Se um dia virar fallback
    // pra cover vazia tambem, atualizar esta asssercao pro og-capa-2.png.
    expect(item2.coverImage).toBe('')
  })

  it('feed quebrado vai pra DLQ (stage fetch-feed) sem derrubar o sync', async () => {
    const snapshot = await db.collection('externalNewsDlq').get()
    const entries = snapshot.docs.map((doc) => doc.data())
    const fetchFailures = entries.filter((entry) => entry.stage === 'fetch-feed')

    expect(fetchFailures.length).toBeGreaterThanOrEqual(1)
    expect(fetchFailures[0].sourceId).toBe('teste-quebrado')
    expect(fetchFailures[0].sourceName).toBe('Fonte Quebrada')
    expect(fetchFailures[0].error).toContain('Fonte Quebrada')
  })

  it(
    'segunda execucao e' + "'" + ' idempotente (upsert nos mesmos ids, sem duplicar)',
    async () => {
      const secondRun = await runSync()
      expect(secondRun.status).toBe(0)

      const snapshot = await db.collection('externalNews').get()
      expect(snapshot.size).toBe(2)
    },
    SYNC_TIMEOUT_MS
  )
})
