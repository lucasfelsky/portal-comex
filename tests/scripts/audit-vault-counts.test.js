// Testes do script scripts/audit-vault-counts.cjs.
// Roda o script como child process e verifica que o exit code bate
// com o esperado (0 quando os counts conferem, 1 quando ha drift).
//
// Tambem verifica que o script detecta drift quando um valor esperado
// e' alterado temporariamente na fixture (e restaurado no final).

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'audit-vault-counts.cjs')
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'expected-counts.json')

function runScript() {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

// Em Windows + PowerShell, o process.exit(1) nao chega corretamente
// para o spawnSync. Garantimos que exit code > 0 ou que o output contem
// a string 'AUDIT FAILED' (que vai para stderr via console.error).
function isAuditFailure(result) {
  return result.status !== 0 || /AUDIT FAILED/.test(result.stdout) || /AUDIT FAILED/.test(result.stderr)
}

function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
}

function writeFixture(obj) {
  fs.writeFileSync(FIXTURE, JSON.stringify(obj, null, 2) + '\n')
}

describe('audit-vault-counts', () => {
  it('roda sem erro quando os counts conferem (exit 0)', () => {
    const result = runScript()
    expect(isAuditFailure(result)).toBe(false)
    expect(result.stdout).toMatch(/0 mismatches/)
  })

  it('output lista 9 checks (src, components, features, pages, services, utils, firestore top + sub, tests)', () => {
    const result = runScript()
    expect(isAuditFailure(result)).toBe(false)
    expect(result.stdout).toMatch(/9 checks/)
    expect(result.stdout).toMatch(/src\/ directories = 9/)
    expect(result.stdout).toMatch(/src\/components\/ top-level = 2/)
    expect(result.stdout).toMatch(/src\/features\/ directories = 3/)
    expect(result.stdout).toMatch(/src\/pages\/ count = 8/)
    expect(result.stdout).toMatch(/src\/services\/ count = 15/)
    expect(result.stdout).toMatch(/src\/utils\/ count = 6/)
    expect(result.stdout).toMatch(/firestore\.rules top-level = 10/)
    expect(result.stdout).toMatch(/firestore\.rules subcollections = 1/)
    expect(result.stdout).toMatch(/tests\/ total = 23/)
  })

  describe('detecao de drift', () => {
    let original

    beforeEach(() => {
      original = readFixture()
    })

    afterEach(() => {
      // Garante restauracao mesmo se a assertion falhar no meio
      try {
        writeFixture(original)
      } catch {
        // ignora
      }
    })

    it('exit 1 quando src.services.count nao bate', () => {
      const fixture = readFixture()
      fixture.srcServices.count = 999
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stdout).toMatch(/1 mismatches/)
      expect(result.stderr).toMatch(/src\/services\/ count: esperado 999/)
    })

    it('exit 1 quando firestore.topLevelCollections nao bate', () => {
      const fixture = readFixture()
      fixture.firestore.topLevelCollections = 99
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/firestore\.rules top-level collections: esperado 99/)
    })

    it('exit 1 quando tests.totalFiles nao bate', () => {
      const fixture = readFixture()
      fixture.tests.totalFiles = 99
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/tests\/ total: esperado 99/)
    })

    it('exit 1 quando a lista de services diverge (mesmo count)', () => {
      const fixture = readFixture()
      fixture.srcServices._list = [...fixture.srcServices._list, 'extraService.js']
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/src\/services\/ diverge/)
    })

    it('exit 0 novamente apos restaurar a fixture', () => {
      const fixture = readFixture()
      fixture.srcServices.count = 999
      writeFixture(fixture)
      const first = runScript()
      expect(isAuditFailure(first)).toBe(true)

      writeFixture(original)
      const second = runScript()
      expect(second.status).toBe(0)
    })
  })
})
