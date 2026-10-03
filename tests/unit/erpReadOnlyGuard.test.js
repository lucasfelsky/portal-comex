// Guarda estatica da conciliacao ERP (DBCorp) x Portal - F1 (SOMENTE LEITURA).
// Le `src/features/erp/**` como TEXTO (depois de remover comentarios com o
// tokenizador do esbuild, que respeita literais) e prova que o nucleo e o modal
// nao gravam, nao usam rede/armazenamento, nao importam servicos nem os
// modulos que o `ProcessesPage.test.jsx` mocka com lista fechada, e que o CSS
// do botao e o vocabulario das fixtures seguem o plano.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { transformWithEsbuild } from 'vite'
import {
  DBCORP_HEADERS,
  SYNTHETIC_VOCABULARY,
  buildScenarioApiRows,
  buildScenarioLooseRows,
  buildScenarioPortalProcesses,
  makeLooseRow,
} from '../fixtures/erp/dbcorpSynthetic.js'

const ROOT = process.cwd()
const ERP_DIR = path.resolve(ROOT, 'src/features/erp')

// Remocao de comentarios por REGEX: so' para o CSS e para os exports de
// `src/services` (nao ha literal com `//` ali). O codigo do ERP passa pelo
// tokenizador (`stripCommentsTokenized`): um literal `'//'` nao esconde o resto.
function stripCommentsRegex(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// Esbuild: tira `//`, `/* */` e `/*! */` (legalComments: 'none'), preserva o
// JSX e os literais. Ele imprime aspas duplas; as regex abaixo aceitam as duas.
async function stripCommentsTokenized(raw, file) {
  const { code } = await transformWithEsbuild(raw, file, {
    loader: file.endsWith('.jsx') ? 'jsx' : 'js',
    jsx: 'preserve',
    legalComments: 'none',
    charset: 'utf8',
  })
  return code
}

function walk(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

// Chave do indice: caminho relativo a `src/features/erp`, com `/` (dois
// arquivos de mesmo nome em pastas diferentes nao se sobrepoem).
const toKey = (file) => path.relative(ERP_DIR, file).split(path.sep).join('/')

const erpFiles = walk(ERP_DIR).sort()
const sources = Object.fromEntries(
  await Promise.all(
    erpFiles.map(async (file) => [toKey(file), await stripCommentsTokenized(fs.readFileSync(file, 'utf8'), file)])
  )
)
const isUi = (name) => name.endsWith('.jsx')
const nonUiNames = Object.keys(sources).filter((name) => !isUi(name))

// Unicos modulos que podem carregar o `xlsx` (e so por `import('xlsx')`).
const XLSX_ADAPTERS = ['readDbcorpWorkbook.js', 'erpReconciliationExport.js']

// Especificadores: `from '...'`, `import '...'`, `import('...')`, `require('...')`.
function readSpecifiers(source) {
  const statics = []
  const dynamics = []
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) statics.push(match[1])
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) statics.push(match[1])
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) dynamics.push(match[1])
  for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) statics.push(match[1])
  return { statics, dynamics }
}

// Lista de permitidos do import dinamico: conta TODA chamada `import(` (qualquer
// argumento: template string, concatenacao, escape unicode, variavel...) e as que
// sao exatamente `import('xlsx')`. Qualquer diferenca entre os dois numeros e'
// um import dinamico fora da lista.
const countDynamicImportCalls = (source) => [...source.matchAll(/\bimport\s*\(/g)].length
const countXlsxDynamicImports = (source) => [...source.matchAll(/\bimport\s*\(\s*(['"])xlsx\1\s*\)/g)].length

// Funcoes/constantes exportadas por `src/services/*` (repositorios, audits, storage,
// notificacoes...). Lidas em tempo de teste: um repositorio novo entra sozinho.
function readServiceExports() {
  const dir = path.resolve(ROOT, 'src/services')
  const names = new Set()
  for (const file of fs.readdirSync(dir).filter((entry) => /\.jsx?$/.test(entry))) {
    const text = stripCommentsRegex(fs.readFileSync(path.join(dir, file), 'utf8'))
    for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
      names.add(match[1])
    }
    for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of match[1].split(',')) {
        const exported = part.trim().split(/\s+as\s+/).pop().trim()
        if (exported) names.add(exported)
      }
    }
  }
  return [...names].sort()
}

const FORBIDDEN_IDENTIFIERS = [
  ['saveProcess', /\bsaveProcess\b/],
  ['setDoc', /\bsetDoc\b/],
  ['updateDoc', /\bupdateDoc\b/],
  ['addDoc', /\baddDoc\b/],
  ['deleteDoc', /\bdeleteDoc\b/],
  ['writeBatch', /\bwriteBatch\b/],
  ['runTransaction', /\brunTransaction\b/],
  ['httpsCallable', /\bhttpsCallable\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
  ['toISOString/toJSON', /\btoISOString\b|\btoJSON\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['EventSource', /\bEventSource\b/],
  ['new Image', /\bnew\s+Image\b/],
  ['navigator.serviceWorker', /\bnavigator\s*\.\s*serviceWorker\b/],
  ['caches.', /\bcaches\s*\./],
  ['document.cookie', /\bdocument\s*\.\s*cookie\b/],
  ['window.open', /\bwindow\s*\.\s*open\b/],
  ['postMessage', /\bpostMessage\b/],
]

const MODAL_ALLOWLIST = [
  'react',
  '../../components/Modal',
  '../../components/TabButton',
  '../../utils/errorMessages',
  '../processes/shipmentConfirmation',
  './reconcileErp.js',
  './erpReference.js',
  './erpReconciliationExport.js',
]

// Camadas: erpText <- dbcorpColumns <- parseDbcorpRows <- readDbcorpWorkbook;
// erpText <- erpItemRow; erpText <- groupErpShipments;
// erpText + erpItemRow + groupErpShipments <- reconcileErp. Nada importa de cima.
const ALLOWED_STATIC_IMPORTS = {
  'erpText.js': [],
  'dbcorpColumns.js': ['./erpText.js'],
  'parseDbcorpRows.js': ['./dbcorpColumns.js', './erpText.js'],
  'readDbcorpWorkbook.js': ['./parseDbcorpRows.js'],
  'erpItemRow.js': ['./erpText.js'],
  'groupErpShipments.js': ['./erpText.js'],
  'reconcileErp.js': ['./erpText.js', './erpItemRow.js', './groupErpShipments.js'],
  'erpReconciliationExport.js': [],
  // PR 3: modulo puro da referencia do ERP (payload, lotes e avisos do detalhe).
  'erpReference.js': ['./erpText.js', './reconcileErp.js'],
}

const mockedByProcessesPage = [
  ...fs
    .readFileSync(path.resolve(ROOT, 'tests/ui/ProcessesPage.test.jsx'), 'utf8')
    .matchAll(/vi\.mock\(\s*'([^']+)'/g),
].map((match) => path.resolve(ROOT, 'tests/ui', match[1]))

const stripExtension = (file) => file.replace(/\.(jsx?|mjs)$/, '')

describe('erpReadOnlyGuard - escopo dos arquivos', () => {
  it('src/features/erp tem exatamente os 11 arquivos do plano', () => {
    expect(Object.keys(sources).sort()).toEqual(
      [
        'ErpHint.jsx',
        'ErpReconcileModal.jsx',
        'dbcorpColumns.js',
        'erpItemRow.js',
        'erpReconciliationExport.js',
        'erpReference.js',
        'erpText.js',
        'groupErpShipments.js',
        'parseDbcorpRows.js',
        'readDbcorpWorkbook.js',
        'reconcileErp.js',
      ].sort()
    )
  })

  it('o mock fechado do ProcessesPage tem 16 modulos (a lista que a guarda vigia)', () => {
    expect(mockedByProcessesPage).toHaveLength(16)
  })
})

describe('erpReadOnlyGuard - nada de escrita, rede ou armazenamento', () => {
  for (const [label, pattern] of FORBIDDEN_IDENTIFIERS) {
    it(`nenhum arquivo usa ${label}`, () => {
      const offenders = Object.entries(sources)
        .filter(([, source]) => pattern.test(source))
        .map(([name]) => name)
      expect(offenders).toEqual([])
    })
  }

  it('modulos nao-UI nao constroem Date a partir de texto nem usam Date.parse', () => {
    for (const name of nonUiNames) {
      const source = sources[name]
      expect(source, name).not.toMatch(/new Date\(\s*'/)
      expect(source, name).not.toMatch(/new Date\(\s*"/)
      expect(source, name).not.toMatch(/new Date\(\s*`/)
      expect(source, name).not.toMatch(/Date\.parse\s*\(/)
    }
  })

  it('o parser de datas usa so Date.UTC/getUTC (sem getters locais) no erpText', () => {
    const text = sources['erpText.js']
    expect(text).toMatch(/Date\.UTC\(/)
    expect(text).not.toMatch(/\.getFullYear\(|\.getMonth\(|\.getDate\(|\.getHours\(|\.getTimezoneOffset\(/)
  })
})

describe('erpReadOnlyGuard - especificadores de import', () => {
  it('nenhum especificador contem firebase nem services/', () => {
    for (const [name, source] of Object.entries(sources)) {
      const { statics, dynamics } = readSpecifiers(source)
      for (const specifier of [...statics, ...dynamics]) {
        expect(specifier, name).not.toMatch(/firebase/)
        expect(specifier, name).not.toMatch(/services\//)
      }
    }
  })

  it('xlsx so entra por import() dinamico, e so em readDbcorpWorkbook.js e erpReconciliationExport.js', () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(source, name).not.toMatch(/(from\s+|require\()\s*['"]xlsx['"]/)
      const { statics, dynamics } = readSpecifiers(source)
      expect(statics, name).not.toContain('xlsx')
      const usesXlsx = dynamics.includes('xlsx')
      const allowed = XLSX_ADAPTERS.includes(name)
      expect(usesXlsx, name).toBe(allowed)
    }
  })

  it('modulos nao-UI importam estaticamente so ./*.js, dentro das camadas do plano', () => {
    for (const name of nonUiNames) {
      // Arquivo novo em src/features/erp sem camada declarada reprova aqui.
      expect(Object.keys(ALLOWED_STATIC_IMPORTS), `${name}: sem camada em ALLOWED_STATIC_IMPORTS`).toContain(name)
      const { statics } = readSpecifiers(sources[name])
      for (const specifier of statics) {
        expect(specifier, name).toMatch(/^\.\/[A-Za-z0-9_]+\.js$/)
      }
      expect([...statics].sort(), name).toEqual([...ALLOWED_STATIC_IMPORTS[name]].sort())
    }
  })

  it('erpText.js e erpReconciliationExport.js nao tem nenhum import estatico', () => {
    expect(readSpecifiers(sources['erpText.js']).statics).toEqual([])
    expect(readSpecifiers(sources['erpReconciliationExport.js']).statics).toEqual([])
  })

  it('o modal importa so da allowlist e de nenhum dos 16 modulos mockados no ProcessesPage', () => {
    const { statics, dynamics } = readSpecifiers(sources['ErpReconcileModal.jsx'])
    expect(dynamics).toEqual([])
    for (const specifier of statics) {
      expect(MODAL_ALLOWLIST, specifier).toContain(specifier)
      if (specifier.startsWith('.')) {
        const resolved = stripExtension(path.resolve(ERP_DIR, specifier))
        const clash = mockedByProcessesPage.map(stripExtension).includes(resolved)
        expect(clash, `${specifier} colide com um mock do ProcessesPage`).toBe(false)
      }
    }
    // o nucleo que o modal importa tambem nao pode puxar nenhum mockado
    for (const name of nonUiNames) {
      for (const specifier of readSpecifiers(sources[name]).statics) {
        const resolved = stripExtension(path.resolve(ERP_DIR, specifier))
        expect(mockedByProcessesPage.map(stripExtension), `${name} -> ${specifier}`).not.toContain(resolved)
      }
    }
  })
})

describe('erpReadOnlyGuard - import dinamico so em lista de permitidos', () => {
  it('toda chamada import(...) e exatamente import("xlsx"), e so em readDbcorpWorkbook.js e erpReconciliationExport.js', () => {
    for (const [name, source] of Object.entries(sources)) {
      const calls = countDynamicImportCalls(source)
      const xlsxCalls = countXlsxDynamicImports(source)
      expect(calls, `${name}: import() fora da lista de permitidos (so import('xlsx'))`).toBe(xlsxCalls)
      if (!XLSX_ADAPTERS.includes(name)) expect(calls, `${name}: import() em modulo sem permissao`).toBe(0)
    }
  })

  it('sem import.meta (glob/env), require(, eval( nem Function( - nada que carregue modulo de outro jeito', () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(source, `${name}: import.meta`).not.toMatch(/\bimport\s*\.\s*meta\b/)
      expect(source, `${name}: require(`).not.toMatch(/\brequire\s*\(/)
      expect(source, `${name}: eval(`).not.toMatch(/\beval\s*\(/)
      expect(source, `${name}: Function(`).not.toMatch(/\bFunction\s*\(/)
    }
  })

  it('especificadores sem escape (\\u...), template (${}) nem barra invertida', () => {
    for (const [name, source] of Object.entries(sources)) {
      const { statics, dynamics } = readSpecifiers(source)
      for (const specifier of [...statics, ...dynamics]) {
        expect(specifier, name).not.toMatch(/[\\`]|\$\{/)
      }
    }
  })

  it('caso-real: CR-42 controle do tokenizador: tira comentarios (//, /* */, /*! */) mas um literal "//" NAO esconde o codigo seguinte', async () => {
    expect(await stripCommentsTokenized('const a = 1 // fetch(url)\nconst b = 2', 'x.js')).not.toContain('fetch')
    expect(await stripCommentsTokenized('/* fetch(url) */ const b = 2', 'x.js')).not.toContain('fetch')
    expect(await stripCommentsTokenized('/*! fetch(x) */ const b = 2', 'x.js')).not.toContain('fetch')
    expect(await stripCommentsTokenized("const s = '//'; fetch(u)", 'x.js')).toContain('fetch')
    expect(await stripCommentsTokenized("const s = '/*'; fetch(u) // fim", 'x.js')).toContain('fetch(u)')
    // O JSX (modal) passa intacto pelo tokenizador.
    expect(await stripCommentsTokenized('const a = <div>{/* x */}ok</div>', 'x.jsx')).toContain('<div>')
  })

  it('caso-real: CR-42 indice por caminho relativo: arquivos de mesmo nome em pastas diferentes nao se sobrepoem', () => {
    expect(toKey(path.join(ERP_DIR, 'sub', 'erpText.js'))).toBe('sub/erpText.js')
    expect(toKey(path.join(ERP_DIR, 'erpText.js'))).toBe('erpText.js')
    expect(Object.keys(sources)).toContain('erpText.js')
    expect(Object.keys(sources).every((name) => !name.includes('\\'))).toBe(true)
  })

  it('caso-real: CR-42 os novos identificadores proibidos pegam o uso real (e nao o texto de comentario)', async () => {
    const hit = (label, code) => FORBIDDEN_IDENTIFIERS.find(([name]) => name === label)[1].test(code)
    expect(hit('XMLHttpRequest', 'const r = new XMLHttpRequest()')).toBe(true)
    expect(hit('WebSocket', 'new WebSocket(url)')).toBe(true)
    expect(hit('EventSource', 'new EventSource(url)')).toBe(true)
    expect(hit('new Image', 'const i = new Image()')).toBe(true)
    expect(hit('navigator.serviceWorker', 'navigator . serviceWorker.register(x)')).toBe(true)
    expect(hit('caches.', 'await caches.open("x")')).toBe(true)
    expect(hit('document.cookie', 'document.cookie = "a=1"')).toBe(true)
    expect(hit('window.open', 'window.open(url)')).toBe(true)
    expect(hit('postMessage', 'worker.postMessage(1)')).toBe(true)
    expect(hit('toISOString/toJSON', 'date.toISOString()')).toBe(true)
    expect(hit('toISOString/toJSON', 'const f = date.toJSON')).toBe(true)
    // Comentario nao conta (o tokenizador o remove antes da varredura).
    expect(hit('postMessage', await stripCommentsTokenized('// postMessage(1)\nconst a = 1', 'x.js'))).toBe(false)
    expect(hit('new Image', 'const i = new ImageData(1, 1)')).toBe(false)
  })

  it('nenhuma funcao/constante exportada por src/services/* aparece no nucleo (repositorios, audits, storage...)', () => {
    const serviceExports = readServiceExports()
    // a leitura dos exports nao pode degradar em silencio: os escritores abaixo tem de estar la.
    for (const writer of [
      'saveProcess', 'archiveProcess', 'deleteProcess', 'createAuditEvent', 'createNotifications',
      'createProcessMessage', 'uploadProcessDocument', 'saveUser', 'deleteUser', 'saveNewsItem',
    ]) {
      expect(serviceExports, writer).toContain(writer)
    }
    expect(serviceExports.length).toBeGreaterThan(50)
    const offenders = []
    for (const [name, source] of Object.entries(sources)) {
      for (const exported of serviceExports) {
        if (new RegExp(`(?<![A-Za-z0-9_$])${exported.replace(/\$/g, '\\$')}(?![A-Za-z0-9_$])`).test(source)) {
          offenders.push(`${name}: ${exported}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('erpReadOnlyGuard - bloco ERP-RECONCILE do styles.css', () => {
  const css = fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8')
  const start = css.indexOf('/* ERP-RECONCILE:START */')
  const end = css.indexOf('/* ERP-RECONCILE:END */')
  const block = start >= 0 && end > start ? css.slice(start, end) : ''

  it('o bloco existe uma unica vez, entre marcadores', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(css.split('/* ERP-RECONCILE:START */')).toHaveLength(2)
    expect(css.split('/* ERP-RECONCILE:END */')).toHaveLength(2)
  })

  it('sem literal de cor (#hex, rgb(, hsl()', () => {
    const code = stripCommentsRegex(block)
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).not.toMatch(/rgba?\(/)
    expect(code).not.toMatch(/hsla?\(/)
  })

  it('so usa tokens ja definidos no tema', () => {
    const used = [...new Set([...stripCommentsRegex(block).matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]))]
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) {
      expect(css, token).toMatch(new RegExp(`${token}\\s*:`))
    }
  })

  it('esconde o botao em <= 1040px com display: none', () => {
    const code = stripCommentsRegex(block)
    expect(code).toMatch(/@media \(max-width: 1040px\)\s*\{[^{}]*\.ghost-button\.erp-reconcile-trigger\s*\{\s*display:\s*none;\s*\}\s*\}/)
    expect(code).toContain('.erp-reconcile-trigger')
    expect(code).toContain('display: none')
  })

  it('caso-real: CR-32 seletor de arquivo: o input do padrao UX-6a fica oculto por clip (nunca display: none) e o modal tem o seu bloco', () => {
    const rules = [...css.matchAll(/\.file-picker__input\s*\{([^}]*)\}/g)].map((match) => match[1])
    expect(rules.length).toBeGreaterThan(0)
    for (const body of rules) {
      expect(body).toContain('clip')
      expect(body).not.toMatch(/display\s*:\s*none/)
    }
    const code = stripCommentsRegex(block)
    expect(code).toContain('.erp-reconcile__file .file-picker__button')
    expect(code).toContain('.erp-reconcile__file .file-picker__status')
    // O modal nao esconde o input por conta propria.
    expect(code).not.toMatch(/file-picker__input\s*\{[^}]*display\s*:\s*none/)
  })
})

describe('erpReadOnlyGuard - ErpHint.jsx (PR 3)', () => {
  it('ErpHint.jsx importa so react (nenhum import dinamico)', () => {
    const { statics, dynamics } = readSpecifiers(sources['ErpHint.jsx'])
    expect(statics).toEqual(['react'])
    expect(dynamics).toEqual([])
  })
})

describe('erpReadOnlyGuard - escrita da referencia (PR 3)', () => {
  const serviceFile = path.resolve(ROOT, 'src/services/erpReferenceRepository.js')

  // Exports (funcao/constante/classe e `export { ... }`) de UM arquivo de servico.
  function readExportsOf(file) {
    const text = stripCommentsRegex(fs.readFileSync(file, 'utf8'))
    const names = new Set()
    for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
      names.add(match[1])
    }
    for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of match[1].split(',')) {
        const exported = part.trim().split(/\s+as\s+/).pop().trim()
        if (exported) names.add(exported)
      }
    }
    return [...names].sort()
  }

  it('o servico da referencia nunca referencia a colecao de processos (aspas simples, duplas, crase ou caminho)', () => {
    const text = fs.readFileSync(serviceFile, 'utf8')
    expect(text).not.toMatch(/['"`]processes['"`/]/)
    expect(text).not.toContain("'processes'")
    expect(text).not.toContain('"processes"')
    expect(text).not.toContain('`processes')
  })

  it('nenhuma function (functions/src) cita erpSnapshots nem erpProcessHints', () => {
    const files = walk(path.resolve(ROOT, 'functions/src')).filter((file) => file.endsWith('.js'))
    expect(files.length).toBeGreaterThan(5)
    const offenders = files.filter((file) => /erpSnapshots|erpProcessHints/.test(fs.readFileSync(file, 'utf8')))
    expect(offenders.map((file) => path.basename(file))).toEqual([])
  })

  it('o modal recebe a gravacao por callback injetado (onSaveReference) e nao importa o servico', () => {
    expect(sources['ErpReconcileModal.jsx']).toContain('onSaveReference')
    expect(sources['ErpReconcileModal.jsx']).not.toMatch(/erpReferenceRepository/)
  })

  it('o servico exporta exatamente saveErpReferenceSnapshot e loadErpReference (e a guarda os enxerga)', () => {
    expect(readServiceExports()).toEqual(expect.arrayContaining(['saveErpReferenceSnapshot', 'loadErpReference']))
    expect(readExportsOf(serviceFile)).toEqual(['loadErpReference', 'saveErpReferenceSnapshot'])
  })
})

describe('erpReadOnlyGuard - bloco ERP-HINT do styles.css (PR 3)', () => {
  const css = fs.readFileSync(path.resolve(ROOT, 'src/styles.css'), 'utf8')
  const START = '/* ERP-HINT:START */'
  const END = '/* ERP-HINT:END */'
  const start = css.indexOf(START)
  const end = css.indexOf(END)
  const block = start >= 0 && end > start ? css.slice(start, end) : ''
  const code = stripCommentsRegex(block)

  it('o bloco existe uma unica vez, entre marcadores, depois do bloco ERP-RECONCILE', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(css.split(START)).toHaveLength(2)
    expect(css.split(END)).toHaveLength(2)
    expect(start).toBeGreaterThan(css.indexOf('/* ERP-RECONCILE:END */'))
  })

  it('sem literal de cor (#hex, rgb(, hsl()', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).not.toMatch(/rgba?\(/)
    expect(code).not.toMatch(/hsla?\(/)
  })

  it('so usa tokens ja definidos no tema', () => {
    const used = [...new Set([...code.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]))]
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) {
      expect(css, token).toMatch(new RegExp(`${token}\\s*:`))
    }
  })

  it('sem animation nem transition', () => {
    expect(code).not.toMatch(/\banimation\b/)
    expect(code).not.toMatch(/\btransition\b/)
  })

  it('o balao fechado some por [hidden] (display: none) e o chip tem :focus-visible', () => {
    expect(code).toMatch(/\.erp-hint__bubble\[hidden\]\s*\{\s*display:\s*none;\s*\}/)
    expect(code).toContain('.erp-hint__chip:focus-visible')
    expect(code).toContain('var(--focus-ring)')
  })
})

describe('erpReadOnlyGuard - fixtures sinteticas (guarda positiva)', () => {
  const rows = [...buildScenarioLooseRows(), ...buildScenarioApiRows(), makeLooseRow()]

  it('os 39 cabecalhos exatos, com "NF\'S " (espaco no fim)', () => {
    expect(DBCORP_HEADERS).toHaveLength(39)
    expect(DBCORP_HEADERS).toContain("NF'S ")
  })

  it('todo EXPORTADOR, PO e NAVIO do fixture casa com o vocabulario sintetico', () => {
    for (const row of rows) {
      expect(row.exporter, 'EXPORTADOR').toMatch(SYNTHETIC_VOCABULARY.exporter)
      expect(row.poRef, 'PO').toMatch(SYNTHETIC_VOCABULARY.po)
      expect(row.vesselRaw, 'NAVIO').toMatch(SYNTHETIC_VOCABULARY.vessel)
    }
  })

  it('todo PEDIDO esta em 9000-9999 e toda REF de consolidado e CON (CN|DG) 9nn-26', () => {
    const [min, max] = SYNTHETIC_VOCABULARY.pedidoRange
    for (const row of rows) {
      expect(Number(row.pedido)).toBeGreaterThanOrEqual(min)
      expect(Number(row.pedido)).toBeLessThanOrEqual(max)
      if (/^CON /.test(row.refEmbarque)) {
        expect(row.refEmbarque).toMatch(SYNTHETIC_VOCABULARY.conRef)
      }
    }
  })

  it('os processos do Portal do cenario usam so o vocabulario sintetico', () => {
    for (const process of buildScenarioPortalProcesses()) {
      if (process.processNumber) {
        expect(Number(process.processNumber)).toBeGreaterThanOrEqual(9000)
        expect(Number(process.processNumber)).toBeLessThanOrEqual(9999)
      }
      if (/^CON /.test(process.name)) expect(process.name).toMatch(SYNTHETIC_VOCABULARY.conRef)
      else expect(process.name).toMatch(SYNTHETIC_VOCABULARY.po)
    }
  })

  const scanned = [
    ...erpFiles,
    ...walk(path.resolve(ROOT, 'tests/fixtures/erp')),
    ...fs
      .readdirSync(path.resolve(ROOT, 'tests/unit'))
      .filter((name) => /^erp.*\.test\.js$/.test(name))
      .map((name) => path.resolve(ROOT, 'tests/unit', name)),
    path.resolve(ROOT, 'tests/ui/ErpReconcileModal.test.jsx'),
    path.resolve(ROOT, 'tests/ui/ProcessListView.test.jsx'),
    path.resolve(ROOT, 'tests/ui/ProcessesPage.test.jsx'),
  ]

  it('nenhum arquivo novo ou alterado contem REF de consolidado no padrao real (CON CN|DG 0nn-)', () => {
    const offenders = scanned.filter((file) => /CON (CN|DG) 0\d\d-/.test(fs.readFileSync(file, 'utf8')))
    expect(offenders.map((file) => path.basename(file))).toEqual([])
  })

  it('toda REF de consolidado escrita nos arquivos novos e sintetica (9nn-26) e toda PO usa prefixo grego', () => {
    const newFiles = scanned.filter((file) => !/ProcessListView|ProcessesPage/.test(path.basename(file)))
    for (const file of newFiles) {
      const text = fs.readFileSync(file, 'utf8')
      for (const match of text.matchAll(/CON (?:CN|DG) (\d{3})-(\d{2})\b/g)) {
        expect(`${match[1]}-${match[2]}`, `${path.basename(file)}: ${match[0]}`).toMatch(/^9\d\d-26$/)
      }
      for (const match of text.matchAll(/\b([A-ZÀ-Ú]+) (SEA|AIR|SAMPLE) (\d{3})-(\d{2})(?:\.\d)?\b/g)) {
        expect(SYNTHETIC_VOCABULARY.greek, `${path.basename(file)}: ${match[0]}`).toContain(match[1])
        expect(`${match[3]}-${match[4]}`, `${path.basename(file)}: ${match[0]}`).toMatch(/^9\d\d-26$/)
      }
    }
  })
})
