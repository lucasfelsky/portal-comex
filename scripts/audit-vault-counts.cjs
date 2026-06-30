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

function fail(msg) {
  console.error(`\u2717 ${msg}`)
  return false
}
function ok(msg) {
  console.log(`\u2713 ${msg}`)
  return true
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
    const actual = listFiles(path.join(ROOT, 'src', 'components'), '.jsx').sort()
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
    const matches = Array.from(rules.matchAll(/match \/([a-zA-Z][a-zA-Z0-9_]*)\b/g)).map((m) => m[1])
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

  console.log(`\n${checks} checks, ${mismatches.length} mismatches`)

  if (mismatches.length > 0) {
    console.error('\nAUDIT FAILED. Atualize tests/fixtures/expected-counts.json e a vault.')
    process.exit(1)
  }
  process.exit(0)
}

audit()
