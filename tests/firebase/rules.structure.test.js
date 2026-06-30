// Testa que `firestore.rules` contem os blocos criticos esperados. Como o
// parser de Rules nao pode ser executado sem emulador Firestore, validamos
// a estrutura textual. Quando o ambiente tiver Java 21+ e o emulador,
// trocar por testes com `@firebase/rules-unit-testing` (asserts reais de
// `assertFails` / `assertSucceeds`).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = join(HERE, '..', '..', 'firestore.rules')
const rules = readFileSync(RULES_PATH, 'utf-8')

describe('firestore.rules structure', () => {
  describe('regras v2 + servico', () => {
    it('declara rules_version = 2', () => {
      expect(rules).toMatch(/rules_version\s*=\s*['"]2['"]/)
    })

    it('declara service cloud.firestore', () => {
      expect(rules).toMatch(/service\s+cloud\.firestore\s*\{/)
    })
  })

  describe('funcoes auxiliares (S3 / custom claims)', () => {
    it('declara myRoleClaims() lendo de request.auth.token', () => {
      expect(rules).toMatch(/function\s+myRoleClaims\s*\(\s*\)\s*\{[^}]*request\.auth\.token[^}]*\}/)
    })

    it('declara myStatusClaims() lendo de request.auth.token', () => {
      expect(rules).toMatch(/function\s+myStatusClaims\s*\(\s*\)\s*\{[^}]*request\.auth\.token[^}]*\}/)
    })

    it('myRole() le SO de claims (sem fallback para profile — L18)', () => {
      // A partir de Sprint 5.1 (2026-06-30), myRole() e' apenas
      // myRoleClaims(). Sem fallback para myProfile() — a unica fonte
      // de verdade de role/status agora sao as custom claims.
      const match = rules.match(/function\s+myRole\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/myRoleClaims\s*\(\s*\)/)
      // NUNCA chama myProfile() no caminho de leitura de role.
      expect(body).not.toMatch(/myProfile\s*\(\s*\)/)
    })

    it('myStatus() le SO de claims (sem fallback para profile — L18)', () => {
      const match = rules.match(/function\s+myStatus\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/myStatusClaims\s*\(\s*\)/)
      expect(body).not.toMatch(/myProfile\s*\(\s*\)/)
    })
  })

  describe('colecoes esperadas', () => {
    const expectedCollections = [
      'announcements',
      'forecastSettings',
      'news',
      'externalNews',
      'barra',
      'processes',
      'notifications',
      'users',
      'userCredentials',
      'audits',
    ]

    for (const collection of expectedCollections) {
      it(`declara match /${collection}/{docId}`, () => {
        // O pattern pode ser `match /<col>/{docId} {` ou `match /<col>/{processId} {` etc.
        const re = new RegExp(`match\\s+/${collection}/\\{[a-zA-Z]+\\}\\s*\\{`)
        expect(rules, `colecao ${collection} nao encontrada em firestore.rules`).toMatch(re)
      })
    }

    it('declara a subcollection processes/{pid}/messages/{mid}', () => {
      // As regras aninham `match /messages/{messageId} {` dentro de `match /processes/{processId} {`
      expect(rules).toMatch(/match\s+\/processes\/\{processId\}\s*\{[\s\S]*match\s+\/messages\/\{messageId\}\s*\{/)
    })
  })

  describe('guardas de seguranca', () => {
    it('match /userCredentials/{uid} tem allow read, write: if false', () => {
      const re = /match\s+\/userCredentials\/\{uid\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false\s*;?/
      expect(rules).toMatch(re)
    })

    it('existe catch-all match /{document=**} com allow false', () => {
      const re = /match\s+\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false\s*;?/
      expect(rules).toMatch(re)
    })

    it('isAdmin() exige isApprovedUser() E role admin', () => {
      const match = rules.match(/function\s+isAdmin\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/isApprovedUser\s*\(\s*\)/)
      expect(match[1]).toMatch(/['"]admin['"]/)
    })

    it('isLogistics() exige isApprovedUser() E role logistica', () => {
      const match = rules.match(/function\s+isLogistics\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/isApprovedUser\s*\(\s*\)/)
      expect(match[1]).toMatch(/['"]logistica['"]/)
    })
  })

  describe('Sprint 5.1 — endurecimento de users/{uid}', () => {
    it('declara isAdminUserFieldsUpdate restringindo os 6 campos', () => {
      // Funcao existe e cita os campos esperados.
      const match = rules.match(/function\s+isAdminUserFieldsUpdate\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      for (const field of ['role', 'status', 'statusTone', 'updatedAt', 'updatedById', 'updatedByName']) {
        expect(body, `campo ${field} nao esta em isAdminUserFieldsUpdate`).toMatch(new RegExp(`['"]${field}['"]`))
      }
      // Tem que ser hasOnly (whitelist), nao hasAny.
      expect(body).toMatch(/hasOnly/)
    })

    it('match /users/{uid} update exige isAdminUserFieldsUpdate E updatedById/Name para admin', () => {
      const block = rules.match(/match\s+\/users\/\{uid\}\s*\{([\s\S]*?)\n\s{2}\}/)
      expect(block).not.toBeNull()
      const body = block[1]
      // Self update (isAllowedSelfUserUpdate) continua permitido.
      expect(body).toMatch(/isAllowedSelfUserUpdate\s*\(\s*uid\s*\)/)
      // Admin update restrito a 6 campos.
      expect(body).toMatch(/isAdminUserFieldsUpdate\s*\(\s*\)/)
      // updatedById == request.auth.uid (assinatura do callable).
      expect(body).toMatch(/updatedById\s*==\s*request\.auth\.uid/)
      // updatedByName == myName() (apenas display, mas obrigatorio).
      expect(body).toMatch(/updatedByName\s*==\s*myName\s*\(\s*\)/)
    })
  })
})
