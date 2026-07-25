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

  // 21 checks sem a vault (9 de cardinalidade + 12 de conteudo da L26); 23
  // quando a vault esta' presente (+2 checks que a leem). O teste aceita os
  // dois modos porque a vault existe na maquina do dev e nao no CI.
  it('output lista 21 checks sem vault (23 com vault)', () => {
    const result = runScript()
    expect(isAuditFailure(result)).toBe(false)
    expect(result.stdout).toMatch(/2[13] checks/)
    expect(result.stdout).toMatch(/src\/ directories = 9/)
    expect(result.stdout).toMatch(/src\/components\/ top-level = 23/)
    expect(result.stdout).toMatch(/src\/features\/ directories = 2/)
    expect(result.stdout).toMatch(/src\/pages\/ count = 12/)
    expect(result.stdout).toMatch(/src\/services\/ count = 17/)
    expect(result.stdout).toMatch(/src\/utils\/ count = 12/)
    expect(result.stdout).toMatch(/firestore\.rules top-level = 12/)
    expect(result.stdout).toMatch(/firestore\.rules subcollections = 1/)
    expect(result.stdout).toMatch(/tests\/ total = 67/)
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

  // L26 (2026-07-23): checks de CONTEUDO. Cada teste abaixo reproduz um bug
  // REAL encontrado na auditoria vault×codigo de 2026-07-23 — todos passavam
  // sem ser detectados quando o script so' validava cardinalidade.
  describe('checks de conteudo (L26)', () => {
    let original

    beforeEach(() => {
      original = readFixture()
    })

    afterEach(() => {
      try {
        writeFixture(original)
      } catch {
        // ignora
      }
    })

    it('reporta as 4 novas familias de check no happy path', () => {
      const result = runScript()
      expect(isAuditFailure(result)).toBe(false)
      expect(result.stdout).toMatch(/firestore\.rules isAllowedSelfUserUpdate\(\) = 9 campos/)
      expect(result.stdout).toMatch(/firestore\.rules isAdminProcessFields\(\) = 35 campos/)
      expect(result.stdout).toMatch(/src\/App\.jsx rotas = 15/)
      expect(result.stdout).toMatch(/declaredDependencies = \d+ \(todas instaladas\)/)
      expect(result.stdout).toMatch(
        /src\/services com onSnapshot = 1 \(forecastSettingsRepository\.js\)/
      )
    })

    // Bug L25: `notificationPreferences` estava na rule e em NENHUM lugar da
    // vault — o que levou ao permission-denied de producao de 2026-07-23.
    it('detecta campo presente na rule mas ausente da fixture (bug L25)', () => {
      const fixture = readFixture()
      fixture.firestoreAllowlists.isAllowedSelfUserUpdate =
        fixture.firestoreAllowlists.isAllowedSelfUserUpdate.filter(
          (field) => field !== 'notificationPreferences'
        )
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/isAllowedSelfUserUpdate\(\) diverge/)
      expect(result.stderr).toMatch(/no codigo mas NAO na fixture: notificationPreferences/)
      // A mensagem tem que dizer QUAL arquivo da vault atualizar.
      expect(result.stderr).toMatch(/Coleções\.md/)
    })

    // Campos-fantasma: a vault documentava `body`/`audience` em announcements,
    // mas a rule so' aceita `content`/`channel`. Sobreviveu 15 dias.
    it('detecta campo na fixture que a rule nao aceita (campo-fantasma)', () => {
      const fixture = readFixture()
      fixture.firestoreAllowlists.isAdminAnnouncementUpdate = [
        ...fixture.firestoreAllowlists.isAdminAnnouncementUpdate,
        'body',
        'audience',
      ]
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/isAdminAnnouncementUpdate\(\) diverge/)
      expect(result.stderr).toMatch(/na fixture mas NAO no codigo: audience, body/)
    })

    it('detecta helper de rule renomeado ou removido', () => {
      const fixture = readFixture()
      fixture.firestoreAllowlists.isHelperQueNaoExiste = ['campo']
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/isHelperQueNaoExiste\(\).*nao encontrado/)
    })

    // Em 2026-07-23 faltavam 3 rotas em producao no vault: /notifications
    // (F16.12), /menu (F16.7) e /admin/suporte.
    it('detecta rota do App.jsx ausente da fixture', () => {
      const fixture = readFixture()
      fixture.routes._list = fixture.routes._list.filter((p) => p !== '/notifications')
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/rotas diverge/)
      expect(result.stderr).toMatch(/no codigo mas NAO na fixture: \/notifications/)
      expect(result.stderr).toMatch(/Rotas\.md/)
    })

    it('detecta rota na fixture que nao existe no App.jsx', () => {
      const fixture = readFixture()
      fixture.routes._list = [...fixture.routes._list, '/dashboard', '/noticias']
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/na fixture mas NAO no codigo: \/dashboard, \/noticias/)
    })

    // Stack.md listava lucide-react, date-fns e zod — nenhuma instalada.
    it('detecta dependencia-fantasma (citada na vault, nao instalada)', () => {
      const fixture = readFixture()
      fixture.declaredDependencies._list = [
        ...fixture.declaredDependencies._list,
        'lucide-react',
        'date-fns',
        'zod',
      ]
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/dependencias-fantasma/)
      expect(result.stderr).toMatch(/lucide-react, date-fns, zod/)
      expect(result.stderr).toMatch(/Stack\.md/)
    })

    // O vault afirmava "real-time via onSnapshot" em 6 arquivos. Só o
    // forecastSettingsRepository usa — e por isso precisa do SDK completo (L24).
    it('detecta mudanca na lista de services com onSnapshot', () => {
      const fixture = readFixture()
      fixture.onSnapshotServices._list = ['notificationsRepository.js']
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/onSnapshot diverge/)
      expect(result.stderr).toMatch(/L24/)
    })

    it('ignora chaves de metadados (_comment) da fixture', () => {
      const result = runScript()
      expect(isAuditFailure(result)).toBe(false)
      expect(result.stdout).not.toMatch(/_comment/)
      expect(result.stderr).not.toMatch(/_comment/)
    })
  })

  // Elo final da L26: checks que leem o VAULT de verdade. Sao OPCIONAIS —
  // rodam quando a pasta e' encontrada e sao pulados quando nao, para o CI
  // seguir hermetico.
  describe('checks de vault (opcionais)', () => {
    let original

    beforeEach(() => {
      original = readFixture()
    })

    afterEach(() => {
      try {
        writeFixture(original)
      } catch {
        // ignora
      }
    })

    function runWithEnv(env) {
      return spawnSync(process.execPath, [SCRIPT], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      })
    }

    it('pula os checks de vault com SKIP_VAULT_CHECK=1 e continua verde', () => {
      const result = runWithEnv({ SKIP_VAULT_CHECK: '1' })
      expect(isAuditFailure(result)).toBe(false)
      expect(result.stdout).toMatch(/checks de vault PULADOS/)
      expect(result.stdout).toMatch(/21 checks, 0 mismatches/)
    })

    it('pula (sem falhar) quando VAULT_DIR aponta para pasta inexistente', () => {
      const result = runWithEnv({ VAULT_DIR: path.join(ROOT, 'nao-existe-xyz') })
      expect(isAuditFailure(result)).toBe(false)
      expect(result.stdout).toMatch(/checks de vault PULADOS/)
    })

    it('quando a vault existe, roda 23 checks (21 + 2 de vault)', () => {
      const result = runScript()
      // Se a vault nao estiver presente na maquina, o teste nao se aplica.
      if (/checks de vault PULADOS/.test(result.stdout)) return
      expect(isAuditFailure(result)).toBe(false)
      expect(result.stdout).toMatch(/23 checks, 0 mismatches/)
      expect(result.stdout).toMatch(/vault menciona todos os \d+ identificadores/)
      expect(result.stdout).toMatch(/vault sem mencao ativa aos \d+ fantasmas/)
    })

    it('acusa identificador exigido que a vault nao menciona (classe do bug L25)', () => {
      const probe = runScript()
      if (/checks de vault PULADOS/.test(probe.stdout)) return

      const fixture = readFixture()
      fixture.vaultMustMention._list = [
        ...fixture.vaultMustMention._list,
        'campoQueNinguemDocumentou',
      ]
      writeFixture(fixture)

      const result = runScript()
      expect(isAuditFailure(result)).toBe(true)
      expect(result.stderr).toMatch(/vault NAO menciona em lugar nenhum/)
      expect(result.stderr).toMatch(/campoQueNinguemDocumentou/)
    })
  })
})
