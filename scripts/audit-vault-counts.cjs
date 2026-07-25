#!/usr/bin/env node
// audit-vault-counts.cjs
//
// Compara contagens de filesystem com os valores declarados em
// `tests/fixtures/expected-counts.json`. Sai com codigo 0 se tudo bate,
// 1 se ha divergencias.
//
// Garante que a vault nao fica drift em relacao ao codigo (L16).
// Para atualizar apos uma mudanca intencional: ajuste o JSON e a vault.
//
// Uso:  node scripts/audit-vault-counts.cjs
//       npm run audit:vault

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'expected-counts.json')
const FIRESTORE_RULES = path.join(ROOT, 'firestore.rules')
const APP_JSX = path.join(ROOT, 'src', 'App.jsx')
const PACKAGE_JSON = path.join(ROOT, 'package.json')

function fail(msg) {
  console.error(`\u2717 ${msg}`)
  return false
}
function ok(msg) {
  console.log(`\u2713 ${msg}`)
  return true
}

// ---------------------------------------------------------------------------
// L26 (2026-07-23): checks de CONTEUDO, nao so' de cardinalidade.
//
// Motivacao: a auditoria vault\u00d7codigo de 2026-07-23 achou drift grave em 31
// arquivos do vault ENQUANTO este script passava 9/9, 0 mismatches. Ele
// comparava apenas contagens (quantos arquivos/diretorios/colecoes) \u2014 nomes de
// campo, paths de rota, dependencias e comportamento derivaram livremente sob
// um check verde, o que da' falsa seguranca.
//
// Os checks abaixo derivam os fatos do CODIGO e comparam com a fixture. A
// fixture e' o espelho versionado do vault: quando o codigo muda, o check
// falha, o dev atualiza a fixture \u2014 e a mensagem de falha diz QUAL arquivo do
// vault precisa mudar junto. O vault mora fora do repo, entao ele nao e' lido
// aqui (CI precisa ser hermetico); o elo humano e' a mensagem de erro.
// ---------------------------------------------------------------------------

// Remove comentarios de linha (`// ...`) preservando o resto.
function stripLineComments(text) {
  return text.replace(/\/\/[^\n]*/g, '')
}

// Extrai o corpo de `function NAME(...) { ... }` por contagem de chaves.
function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)
  if (start === -1) return null

  const open = source.indexOf('{', start)
  if (open === -1) return null

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return null
}

// Dado o corpo de um helper de rule, devolve os campos do primeiro
// `hasOnly([...])` \u2014 ordenados, sem duplicatas.
function extractHasOnlyFields(functionBody) {
  if (!functionBody) return null
  const clean = stripLineComments(functionBody)
  const match = clean.match(/hasOnly\(\s*\[([\s\S]*?)\]\s*\)/)
  if (!match) return null
  const fields = Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1])
  return Array.from(new Set(fields)).sort()
}

// Extrai os valores literais de `path="..."` do App.jsx (inclui os relativos
// das rotas filhas de /admin, propositalmente \u2014 drift em qualquer um importa).
function extractRoutePaths(source) {
  return Array.from(source.matchAll(/path="([^"]*)"/g))
    .map((m) => m[1])
    .sort()
}

// Quais arquivos de src/services usam onSnapshot. O app usa
// `firebase/firestore/lite` (sem onSnapshot) em quase tudo; a excecao unica e'
// o forecastSettingsRepository, que por isso precisa do SDK completo \u2014 causa
// da L24. Se essa lista crescer sem intencao, a vault que descreve o app como
// "nao real-time" fica errada.
function listOnSnapshotServices(servicesDir) {
  if (!fs.existsSync(servicesDir)) return []
  return fs
    .readdirSync(servicesDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /\bonSnapshot\b/.test(fs.readFileSync(path.join(servicesDir, f), 'utf8')))
    .sort()
}

// ---------------------------------------------------------------------------
// Checks que leem o VAULT de verdade (fecham o elo fixture↔vault).
//
// O vault mora fora do repo, entao estes checks sao OPCIONAIS: rodam quando a
// pasta e' encontrada (dev local) e sao PULADOS quando nao (CI). Assim o CI
// segue hermetico sem perder a validacao onde ela e' possivel.
//
// Localizacao: env `VAULT_DIR` (override explicito) ou auto-deteccao subindo
// da raiz do repo procurando `Obsidian/Portal COMEX/Portal COMEX/Inventário`.
// ---------------------------------------------------------------------------

// Aponta para o subtree DESTE app. O `Inventário/` contem tambem o do
// IntelliQuote, e ha' arquivos homonimos nos dois (`Stack.md`, `_index.md`) —
// varrer os dois juntos gera falso positivo cruzado.
const VAULT_REL = path.join(
  'Obsidian',
  'Portal COMEX',
  'Portal COMEX',
  'Inventário',
  'Portal COMEX'
)

function findVaultDir() {
  if (process.env.SKIP_VAULT_CHECK === '1') return null
  if (process.env.VAULT_DIR) {
    return fs.existsSync(process.env.VAULT_DIR) ? process.env.VAULT_DIR : null
  }
  let dir = ROOT
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, VAULT_REL)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function listMarkdown(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listMarkdown(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

// Uma mencao a um identificador-fantasma e' LEGITIMA quando esta' num contexto
// historico/de correcao — e' assim que o vault documenta o proprio drift. O
// check so' acusa mencao FORA desse contexto (ou seja: alguem voltou a
// descrever o fantasma como se fosse real).
const CORRECTION_CONTEXT =
  /corrigid|correç|corre[cç]ao|nunca existiu|drift|removid|substitu|era documentad|fantasma|superad|deprecad/i

// Negacao na MESMA linha do fantasma. Uma linha que nega ("sem lucide-react",
// "`date-fns` **não** está instalado", "**não** gravados como objetos") esta'
// documentando corretamente a ausencia — nao e' o erro que buscamos, que e' o
// fantasma descrito COMO SE FOSSE REAL. Precisa tolerar markdown no meio
// (`**não**`), por isso a checagem e' por token em qualquer posicao da linha.
const NEGATION = /\b(sem|não|nao|nunca|inexistent|ausent)\b|\*\*(não|nao|sem)\*\*/i

function isHistoricalLine(line) {
  return (
    line.trimStart().startsWith('>') ||
    CORRECTION_CONTEXT.test(line) ||
    NEGATION.test(line)
  )
}

function scanVaultForPhantoms(vaultDir, phantoms) {
  const hits = []
  for (const file of listMarkdown(vaultDir)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (isHistoricalLine(line)) return
      for (const phantom of phantoms) {
        if (line.includes(phantom)) {
          hits.push(`${path.basename(file)}:${index + 1} → "${phantom}"`)
        }
      }
    })
  }
  return hits
}

function scanVaultForMissing(vaultDir, required) {
  const corpus = listMarkdown(vaultDir)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n')
  return required.filter((item) => !corpus.includes(item))
}

function compareSets(label, expected, actual, vaultHint) {
  const missingInCode = expected.filter((item) => !actual.includes(item))
  const missingInFixture = actual.filter((item) => !expected.includes(item))
  if (missingInCode.length === 0 && missingInFixture.length === 0) return null

  const parts = []
  if (missingInFixture.length > 0) {
    parts.push(`no codigo mas NAO na fixture: ${missingInFixture.join(', ')}`)
  }
  if (missingInCode.length > 0) {
    parts.push(`na fixture mas NAO no codigo: ${missingInCode.join(', ')}`)
  }
  return `${label} diverge \u2014 ${parts.join(' | ')}. Atualize a fixture E ${vaultHint}`
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext))
}

function listDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

function readFixture() {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`Fixture nao encontrada: ${FIXTURE}`)
    process.exit(2)
  }
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
}

function audit() {
  const fixture = readFixture()
  const mismatches = []
  let checks = 0

  // 1. src/ directories
  {
    const expected = fixture.src.directories
    const expectedList = fixture.src._directories_list?.sort()
    const actual = listDirs(path.join(ROOT, 'src')).sort()
    checks++
    if (actual.length !== expected) {
      mismatches.push(fail(`src/ directories: esperado ${expected}, obtido ${actual.length} (${actual.join(', ')})`))
    } else if (expectedList && JSON.stringify(actual) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `src/ directories ordem diverge: esperado ${expectedList.join(',')}, obtido ${actual.join(',')}`
        )
      )
    } else {
      ok(`src/ directories = ${actual.length}`)
    }
  }

  // 2. src/components/ top-level
  {
    const expected = fixture.srcComponents.topLevel
    const expectedList = fixture.srcComponents._topLevel_list?.sort()
    // Stories (.stories.jsx) documentam os componentes mas nao sao
    // componentes em si -- excluidas desta contagem.
    const actual = listFiles(path.join(ROOT, 'src', 'components'), '.jsx')
      .filter((f) => !f.endsWith('.stories.jsx'))
      .sort()
    checks++
    if (actual.length !== expected) {
      mismatches.push(
        fail(`src/components/ top-level: esperado ${expected}, obtido ${actual.length} (${actual.join(', ')})`)
      )
    } else if (expectedList && JSON.stringify(actual) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `src/components/ top-level diverge: esperado ${expectedList.join(',')}, obtido ${actual.join(',')}`
        )
      )
    } else {
      ok(`src/components/ top-level = ${actual.length}`)
    }
  }

  // 3. src/features/ directories
  {
    const expected = fixture.srcFeatures.directories
    const expectedList = fixture.srcFeatures._directories_list?.sort()
    const actual = listDirs(path.join(ROOT, 'src', 'features')).sort()
    checks++
    if (actual.length !== expected) {
      mismatches.push(
        fail(`src/features/ directories: esperado ${expected}, obtido ${actual.length} (${actual.join(', ')})`)
      )
    } else if (expectedList && JSON.stringify(actual) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `src/features/ directories diverge: esperado ${expectedList.join(',')}, obtido ${actual.join(',')}`
        )
      )
    } else {
      ok(`src/features/ directories = ${actual.length}`)
    }
  }

  // 4. src/pages/ count
  {
    const expected = fixture.srcPages.count
    const actual = listFiles(path.join(ROOT, 'src', 'pages'), '.jsx').length
    checks++
    if (actual !== expected) {
      mismatches.push(fail(`src/pages/ count: esperado ${expected}, obtido ${actual}`))
    } else {
      ok(`src/pages/ count = ${actual}`)
    }
  }

  // 5. src/services/ count
  {
    const expected = fixture.srcServices.count
    const expectedList = fixture.srcServices._list?.sort()
    const actual = listFiles(path.join(ROOT, 'src', 'services'), '.js').sort()
    checks++
    if (actual.length !== expected) {
      mismatches.push(
        fail(`src/services/ count: esperado ${expected}, obtido ${actual.length} (${actual.join(', ')})`)
      )
    } else if (expectedList && JSON.stringify(actual) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `src/services/ diverge: esperado ${expectedList.join(',')}, obtido ${actual.join(',')}`
        )
      )
    } else {
      ok(`src/services/ count = ${actual.length}`)
    }
  }

  // 6. src/utils/ count
  {
    const expected = fixture.srcUtils.count
    const expectedList = fixture.srcUtils._list?.sort()
    const actual = listFiles(path.join(ROOT, 'src', 'utils'), '.js').sort()
    checks++
    if (actual.length !== expected) {
      mismatches.push(
        fail(`src/utils/ count: esperado ${expected}, obtido ${actual.length} (${actual.join(', ')})`)
      )
    } else if (expectedList && JSON.stringify(actual) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `src/utils/ diverge: esperado ${expectedList.join(',')}, obtido ${actual.join(',')}`
        )
      )
    } else {
      ok(`src/utils/ count = ${actual.length}`)
    }
  }

  // 7. firestore.rules: top-level collections + subcollections
  {
    const expectedTop = fixture.firestore.topLevelCollections
    const expectedSub = fixture.firestore.subcollections
    const expectedList = fixture.firestore._topLevel_list?.sort()
    const expectedSubList = fixture.firestore._subcollections_list?.sort()
    const rules = fs.existsSync(FIRESTORE_RULES) ? fs.readFileSync(FIRESTORE_RULES, 'utf8') : ''
    // Regex captura só `match /<col>/{...}` (curinga) — matches com
    // documento nomeado (ex.: `match /barra/suggestion`) não contam
    // como top-level collection nova.
    const matches = Array.from(rules.matchAll(/match\s+\/([a-zA-Z][a-zA-Z0-9_]*)\/\{[a-zA-Z]+\}/g)).map((m) => m[1])
    const topLevel = matches.filter((n) => n !== 'databases' && n !== 'messages').sort()
    const subLevel = matches.filter((n) => n === 'messages').length > 0 ? 1 : 0
    checks++
    if (topLevel.length !== expectedTop) {
      mismatches.push(
        fail(
          `firestore.rules top-level collections: esperado ${expectedTop}, obtido ${topLevel.length} (${topLevel.join(', ')})`
        )
      )
    } else if (expectedList && JSON.stringify(topLevel) !== JSON.stringify(expectedList)) {
      mismatches.push(
        fail(
          `firestore.rules top-level collections diverge: esperado ${expectedList.join(',')}, obtido ${topLevel.join(',')}`
        )
      )
    } else {
      ok(`firestore.rules top-level = ${topLevel.length}`)
    }
    checks++
    if (subLevel !== expectedSub) {
      mismatches.push(
        fail(`firestore.rules subcollections: esperado ${expectedSub}, obtido ${subLevel}`)
      )
    } else if (expectedSubList && expectedSubList.length !== subLevel) {
      mismatches.push(
        fail(
          `firestore.rules subcollections lista: esperado ${expectedSubList.join(',')}, obtido count ${subLevel}`
        )
      )
    } else {
      ok(`firestore.rules subcollections = ${subLevel}`)
    }
  }

  // 8. tests/ total files (firebase + functions + ui)
  {
    const expected = fixture.tests.totalFiles
    const breakdown = fixture.tests._breakdown
    const fb = listFiles(path.join(ROOT, 'tests', 'firebase'), '.test.js').length
    const fn = listFiles(path.join(ROOT, 'tests', 'functions'), '.test.js').length
    const ui = listFiles(path.join(ROOT, 'tests', 'ui'), '.test.jsx').length
    const total = fb + fn + ui
    checks++
    if (total !== expected) {
      mismatches.push(
        fail(`tests/ total: esperado ${expected}, obtido ${total} (firebase=${fb}, functions=${fn}, ui=${ui})`)
      )
    } else if (
      breakdown &&
      (breakdown.firebase !== fb || breakdown.functions !== fn || breakdown.ui !== ui)
    ) {
      mismatches.push(
        fail(
          `tests/ breakdown diverge: esperado firebase=${breakdown.firebase},functions=${breakdown.functions},ui=${breakdown.ui}; obtido firebase=${fb},functions=${fn},ui=${ui}`
        )
      )
    } else {
      ok(`tests/ total = ${total} (firebase=${fb}, functions=${fn}, ui=${ui})`)
    }
  }

  // -------------------------------------------------------------------------
  // 9. L26: allowlists de campo das firestore.rules (nivel de CAMPO, nao de
  //    contagem). Pega a classe de bug da L25: campo novo numa rule sem
  //    documentacao correspondente, e campo-fantasma documentado que a rule
  //    nunca aceitou.
  // -------------------------------------------------------------------------
  if (fixture.firestoreAllowlists) {
    const rulesSource = fs.existsSync(FIRESTORE_RULES)
      ? fs.readFileSync(FIRESTORE_RULES, 'utf8')
      : ''

    for (const [fnName, expectedFields] of Object.entries(fixture.firestoreAllowlists)) {
      // Chaves `_*` sao metadados da fixture (ex.: `_comment`), nao helpers.
      if (fnName.startsWith('_')) continue
      checks++
      const actualFields = extractHasOnlyFields(extractFunctionBody(rulesSource, fnName))

      if (actualFields === null) {
        mismatches.push(
          fail(
            `firestore.rules ${fnName}(): funcao ou hasOnly([...]) nao encontrado. ` +
              'Se a rule foi renomeada/removida, atualize a fixture E ' +
              'Inventário/Portal COMEX/04 - Banco de dados (Firestore)/Rules.md'
          )
        )
        continue
      }

      const problem = compareSets(
        `firestore.rules ${fnName}()`,
        [...expectedFields].sort(),
        actualFields,
        'a tabela de campos em "Inventário/Portal COMEX/04 - Banco de dados (Firestore)/Coleções.md" + a allowlist em ".../Rules.md"'
      )
      if (problem) mismatches.push(fail(problem))
      else ok(`firestore.rules ${fnName}() = ${actualFields.length} campos`)
    }
  }

  // -------------------------------------------------------------------------
  // 10. L26: paths de rota do App.jsx. Pega rota nova em producao sem
  //     documentacao (em 2026-07-23 faltavam 3: /notifications, /menu,
  //     /admin/suporte).
  // -------------------------------------------------------------------------
  if (fixture.routes?._list) {
    checks++
    const appSource = fs.existsSync(APP_JSX) ? fs.readFileSync(APP_JSX, 'utf8') : ''
    const actualPaths = extractRoutePaths(appSource)
    const problem = compareSets(
      'src/App.jsx rotas',
      [...fixture.routes._list].sort(),
      actualPaths,
      'a tabela em "Inventário/Portal COMEX/02 - Frontend/Rotas.md" (e o detalhe em .../Páginas.md)'
    )
    if (problem) mismatches.push(fail(problem))
    else ok(`src/App.jsx rotas = ${actualPaths.length}`)
  }

  // -------------------------------------------------------------------------
  // 11. L26: dependencias declaradas. A vault (Stack.md) chegou a listar
  //     `lucide-react`, `date-fns` e `zod` — nenhuma instalada. Aqui a fixture
  //     espelha o que o Stack.md afirma; o script confirma no package.json.
  // -------------------------------------------------------------------------
  if (fixture.declaredDependencies?._list) {
    checks++
    const pkg = fs.existsSync(PACKAGE_JSON)
      ? JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'))
      : {}
    const installed = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ])
    const phantom = fixture.declaredDependencies._list.filter((dep) => !installed.has(dep))

    if (phantom.length > 0) {
      mismatches.push(
        fail(
          `dependencias-fantasma (citadas na vault, ausentes do package.json): ${phantom.join(', ')}. ` +
            'Instale-as OU remova a mencao de "Inventário/Portal COMEX/01 - Visão geral/Stack.md"'
        )
      )
    } else {
      ok(`declaredDependencies = ${fixture.declaredDependencies._list.length} (todas instaladas)`)
    }
  }

  // -------------------------------------------------------------------------
  // 12. L26: quem usa onSnapshot. O app e' descrito na vault como NAO
  //     real-time (SDK lite). Se essa lista crescer, a descricao fica errada —
  //     e o mix de SDK lite/completo e' exatamente a L24.
  // -------------------------------------------------------------------------
  if (fixture.onSnapshotServices?._list) {
    checks++
    const actual = listOnSnapshotServices(path.join(ROOT, 'src', 'services'))
    const problem = compareSets(
      'src/services com onSnapshot',
      [...fixture.onSnapshotServices._list].sort(),
      actual,
      'as linhas de "Leitura"/"Listeners" em "Inventário/Portal COMEX/04 - Banco de dados (Firestore)/Coleções.md" + a tabela de "Acesso a dados" em ".../01 - Visão geral/Stack.md" (cuidado: SDK lite NAO tem onSnapshot — ver L24)'
    )
    if (problem) mismatches.push(fail(problem))
    else ok(`src/services com onSnapshot = ${actual.length} (${actual.join(', ') || 'nenhum'})`)
  }

  // -------------------------------------------------------------------------
  // 13-14. L26 (elo final): checks que leem o VAULT. Opcionais — pulados
  //        quando a pasta nao e' encontrada (CI) ou com SKIP_VAULT_CHECK=1.
  // -------------------------------------------------------------------------
  const vaultDir = findVaultDir()

  if (!vaultDir) {
    console.log('· vault nao encontrada — checks de vault PULADOS (normal em CI)')
  } else {
    if (fixture.vaultMustMention?._list) {
      checks++
      const missing = scanVaultForMissing(vaultDir, fixture.vaultMustMention._list)
      if (missing.length > 0) {
        mismatches.push(
          fail(
            `vault NAO menciona em lugar nenhum: ${missing.join(', ')}. ` +
              'Existe no codigo e nao esta' +
              ' documentado — foi exatamente assim que a L25 virou bug de producao.'
          )
        )
      } else {
        ok(`vault menciona todos os ${fixture.vaultMustMention._list.length} identificadores exigidos`)
      }
    }

    if (fixture.vaultMustNotMention?._list) {
      checks++
      const hits = scanVaultForPhantoms(vaultDir, fixture.vaultMustNotMention._list)
      if (hits.length > 0) {
        mismatches.push(
          fail(
            'vault descreve identificador-FANTASMA como se fosse real ' +
              `(fora de nota de correcao):\n    ${hits.join('\n    ')}\n  ` +
              'Se for contexto historico, deixe a linha dentro de um blockquote (">") ' +
              'ou mencione a correcao explicitamente.'
          )
        )
      } else {
        ok(`vault sem mencao ativa aos ${fixture.vaultMustNotMention._list.length} fantasmas conhecidos`)
      }
    }
  }

  console.log(`\n${checks} checks, ${mismatches.length} mismatches`)

  if (mismatches.length > 0) {
    console.error('\nAUDIT FAILED. Atualize tests/fixtures/expected-counts.json e a vault.')
    process.exit(1)
  }
  process.exit(0)
}

audit()
