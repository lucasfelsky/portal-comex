// Testa que `firestore.rules` contem os blocos criticos esperados. Como o
// parser de Rules nao pode ser executado sem emulador Firestore, validamos
// a estrutura textual. Quando o ambiente tiver Java 21+ e o emulador,
// trocar por testes com `@firebase/rules-unit-testing` (asserts reais de
// `assertFails` / `assertSucceeds`).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_READER_ROLES,
  DOCUMENT_READER_TYPES,
} from '../../functions/src/process/documentIndex.js'

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

    // D6 revista (tela admin /admin/relatorio-carga, aprovada pelo Lucas): SO'
    // `config/cargoReportRecipients` tem match no cliente, admin-only e com
    // validacao de shape; o trigger segue lendo via Admin SDK. Os demais docs de
    // `config/*` continuam no catch-all `match /{document=**}` (negado).
    it('declara match /config/cargoReportRecipients admin-only com validacao de shape', () => {
      const block = rules.match(/match\s+\/config\/cargoReportRecipients\s*\{[^}]*\}/)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/allow\s+read:\s*if\s+isAdmin\(\)\s*;/)
      expect(block[0]).toMatch(
        /allow\s+create,\s*update:\s*if\s+isAdmin\(\)\s*&&\s*isValidCargoReportRecipientsConfig\(\)\s*;/
      )
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('nao declara match curinga em config (so o doc cargoReportRecipients e aberto)', () => {
      expect(rules).not.toMatch(/match\s+\/config\/\{/)
    })

    // S2 do Relatorio de Carga: tabela mestra "Item x Emb." em doc unico. Admin grava,
    // admin e logistica leem; nenhum curinga em cargoReportCatalog (demais ids no catch-all).
    it('declara match /cargoReportCatalog/itemPackaging com leitura admin/logistica e escrita admin validada', () => {
      const block = rules.match(/match\s+\/cargoReportCatalog\/itemPackaging\s*\{[^}]*\}/)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/allow\s+read:\s*if\s+isAdmin\(\)\s*\|\|\s*isLogistics\(\)\s*;/)
      expect(block[0]).toMatch(
        /allow\s+create,\s*update:\s*if\s+isAdmin\(\)\s*&&\s*isValidItemPackagingCatalog\(\)\s*;/
      )
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('nao declara match curinga em cargoReportCatalog (so o doc itemPackaging e aberto)', () => {
      expect(rules).not.toMatch(/match\s+\/cargoReportCatalog\/\{/)
    })

    it('isValidItemPackagingCatalog: hasOnly + hasAll das 10 chaves, limites, autoria e trava de versao', () => {
      const fn = rules.match(/function\s+isValidItemPackagingCatalog\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/)
      expect(fn).not.toBeNull()
      const body = fn[0]
      const keys = [
        'schemaVersion', 'version', 'items', 'itemCount', 'sourceFileName',
        'sourceSheetName', 'sourceSha256', 'importedAt', 'importedById', 'importedByName',
      ]
      const only = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/)
      const all = body.match(/keys\(\)\.hasAll\(\[([^\]]*)\]\)/)
      expect(only).not.toBeNull()
      expect(all).not.toBeNull()
      const parse = (match) => match[1].match(/'([^']+)'/g).map((item) => item.replace(/'/g, '')).sort()
      expect(parse(only)).toEqual([...keys].sort())
      expect(parse(all)).toEqual([...keys].sort())
      expect(body).toMatch(/items\.size\(\)\s*<=\s*5000/)
      expect(body).toMatch(/itemCount\s*==\s*request\.resource\.data\.items\.size\(\)/)
      expect(body).toMatch(/importedAt\s*==\s*request\.time/)
      expect(body).toMatch(/importedById\s*==\s*request\.auth\.uid/)
      expect(body).toMatch(/resource\.data\.version\s*\+\s*1/)
      expect(body).toMatch(/sourceSha256\.matches\('\^\[0-9a-f\]\{64\}\$'\)/)
    })

    // S3 do Relatorio de Carga: formulario FR.CMX.001 em 2 docs nomeados por processo.
    // `current` so' admin grava; `conference` admin e logistica; Tecnico/Faturamento nao leem.
    // Docs nomeados (e nao `match /cargoReport/{id}`) para o audit-vault-counts nao contar
    // uma colecao top-level nova; qualquer outro id cai no catch-all (negado).
    it('declara match /cargoReport/current (admin grava; admin e logistica leem) dentro de processes', () => {
      const processes = rules.match(/match\s+\/processes\/\{processId\}\s*\{[\s\S]*?\n {4}\}/)
      expect(processes).not.toBeNull()
      const block = processes[0].match(/match\s+\/cargoReport\/current\s*\{[^}]*\}/)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/allow\s+read:\s*if\s+isAdmin\(\)\s*\|\|\s*isLogistics\(\)\s*;/)
      expect(block[0]).toMatch(
        /allow\s+create,\s*update:\s*if\s+isAdmin\(\)\s*&&\s*isValidCargoReportCurrent\(processId\)\s*;/
      )
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('declara match /cargoReport/conference (admin e logistica gravam e leem) dentro de processes', () => {
      const processes = rules.match(/match\s+\/processes\/\{processId\}\s*\{[\s\S]*?\n {4}\}/)
      expect(processes).not.toBeNull()
      const block = processes[0].match(/match\s+\/cargoReport\/conference\s*\{[^}]*\}/)
      expect(block).not.toBeNull()
      expect(block[0]).toMatch(/allow\s+read:\s*if\s+isAdmin\(\)\s*\|\|\s*isLogistics\(\)\s*;/)
      expect(block[0]).toMatch(
        /allow\s+create,\s*update:\s*if\s+\(isAdmin\(\)\s*\|\|\s*isLogistics\(\)\)\s*&&\s*isValidCargoReportConference\(processId\)\s*;/
      )
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('nao declara match curinga em cargoReport (so os docs current e conference sao abertos)', () => {
      expect(rules).not.toMatch(/match\s+\/cargoReport\/\{/)
    })

    it('Tecnico e Faturamento nao leem cargoReport (leitura so admin/logistica)', () => {
      const blocks = rules.match(/match\s+\/cargoReport\/(?:current|conference)\s*\{[^}]*\}/g)
      expect(blocks).toHaveLength(2)
      for (const block of blocks) {
        expect(block).not.toMatch(/isDocumentReader|tecnico|faturamento/)
      }
    })

    it('isValidCargoReportCurrent: hasOnly + hasAll das 20 chaves, limites, revisao e autoria', () => {
      const fn = rules.match(/function\s+isValidCargoReportCurrent\s*\(\s*processId\s*\)\s*\{[\s\S]*?\n {4}\}/)
      expect(fn).not.toBeNull()
      const body = fn[0]
      const keys = [
        'schemaVersion', 'formCode', 'formRevision', 'revision', 'status', 'cargoType', 'titleSuffix',
        'rows', 'notes', 'labeledBy', 'labelMadeBy', 'receiptStatus', 'receivedDate', 'completedDate',
        'nfNumber', 'catalogVersion', 'lastGenerated', 'updatedAt', 'updatedById', 'updatedByName',
      ]
      const only = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/)
      const all = body.match(/request\.resource\.data\.keys\(\)\.hasAll\(\[([^\]]*)\]\)/)
      expect(only).not.toBeNull()
      expect(all).not.toBeNull()
      const parse = (match) => match[1].match(/'([^']+)'/g).map((item) => item.replace(/'/g, '')).sort()
      expect(parse(only)).toEqual([...keys].sort())
      expect(parse(all)).toEqual([...keys].sort())
      expect(body).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/processes\/\$\(processId\)\)/)
      expect(body).toMatch(/formCode\s*==\s*'FR\.CMX\.001'/)
      expect(body).toMatch(/formRevision\s*==\s*'005'/)
      expect(body).toMatch(/rows\.size\(\)\s*<=\s*28/)
      expect(body).toMatch(/rows\[0\]\.keys\(\)\.size\(\)\s*==\s*13/)
      expect(body).toMatch(/cargoType\s+in\s+\[\s*'',\s*'FCL',\s*'LCL',\s*'CONSOLIDADO',\s*'AEREO'\s*\]/)
      expect(body).toMatch(/resource\s*==\s*null\s*\?\s*1\s*:\s*resource\.data\.revision\s*\+\s*1/)
      expect(body).toMatch(/updatedAt\s*==\s*request\.time/)
      expect(body).toMatch(/updatedById\s*==\s*request\.auth\.uid/)
      expect(body).toMatch(/updatedByName\s*==\s*myName\(\)/)
    })

    it('isValidCargoReportConference: hasOnly + hasAll das 7 chaves, okByRowId booleano e current existente', () => {
      const fn = rules.match(/function\s+isValidCargoReportConference\s*\(\s*processId\s*\)\s*\{[\s\S]*?\n {4}\}/)
      expect(fn).not.toBeNull()
      const body = fn[0]
      const keys = ['schemaVersion', 'revision', 'okByRowId', 'checkedByName', 'updatedAt', 'updatedById', 'updatedByName']
      const only = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/)
      const all = body.match(/request\.resource\.data\.keys\(\)\.hasAll\(\[([^\]]*)\]\)/)
      expect(only).not.toBeNull()
      expect(all).not.toBeNull()
      const parse = (match) => match[1].match(/'([^']+)'/g).map((item) => item.replace(/'/g, '')).sort()
      expect(parse(only)).toEqual([...keys].sort())
      expect(parse(all)).toEqual([...keys].sort())
      expect(body).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/processes\/\$\(processId\)\/cargoReport\/current\)/)
      expect(body).toMatch(/okByRowId\.size\(\)\s*<=\s*28/)
      expect(body).toMatch(/okByRowId\.values\(\)\.hasOnly\(\[\s*true,\s*false\s*\]\)/)
      expect(body).toMatch(/checkedByName\.size\(\)\s*<=\s*120/)
      expect(body).toMatch(/resource\s*==\s*null\s*\?\s*1\s*:\s*resource\.data\.revision\s*\+\s*1/)
      expect(body).toMatch(/updatedByName\s*==\s*myName\(\)/)
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
      'externalNewsDlq',
      'barra',
      'processes',
      'notifications',
      'users',
      'userCredentials',
      'audits',
      'supportTickets',
      // PR 3 (Importar do DBCorp): referencia do ERP, so admin.
      'erpSnapshots',
      'erpProcessHints',
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

    it('declara a subcollection processes/{pid}/events/{eventId} (F17.1b)', () => {
      expect(rules).toMatch(/match\s+\/processes\/\{processId\}\s*\{[\s\S]*match\s+\/events\/\{eventId\}\s*\{/)
    })

    it('match /events/{eventId} permite leitura so admin/logistica (F18a Decisao 10) e write: if false', () => {
      const match = rules.match(/match\s+\/events\/\{eventId\}\s*\{([\s\S]*?)\n\s{6}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/allow\s+read:\s*if\s+isAdmin\s*\(\s*\)\s*\|\|\s*isLogistics\s*\(\s*\)/)
      expect(body).toMatch(/allow\s+create,\s*update,\s*delete:\s*if\s+false/)
    })

    it('declara a subcollection processes/{pid}/documents/{documentId} (F18a)', () => {
      expect(rules).toMatch(/match\s+\/processes\/\{processId\}\s*\{[\s\S]*match\s+\/documents\/\{documentId\}\s*\{/)
    })

    it('match /documents/{documentId} so permite update do vinculo Invoice->Packing List ou do nome do documento adicional (admin), leitura so admin/logistica', () => {
      const match = rules.match(/match\s+\/documents\/\{documentId\}\s*\{([\s\S]*?)\n\s{6}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(
        /allow\s+read:\s*if\s+isAdmin\s*\(\s*\)\s*\|\|\s*isLogistics\s*\(\s*\)\s*\|\|\s*\(\s*isDocumentReader\s*\(\s*\)\s*&&\s*isDocumentReaderType\s*\(\s*resource\.data\.type\s*\)\s*\)\s*;/
      )
      expect(body).toMatch(
        /allow\s+update:\s*if\s+isAdmin\s*\(\s*\)\s*&&\s*\(\s*isValidInvoicePackingListLinkUpdate\s*\(\s*\)\s*\|\|\s*isValidAdditionalDocumentRenameUpdate\s*\(\s*\)\s*\)/
      )
      expect(body).toMatch(/isValidProcessDocumentCreate\s*\(\s*processId\s*\)/)
    })

    it('isValidAdditionalDocumentRenameUpdate so aceita description + carimbos, type other, 1..120', () => {
      const match = rules.match(/function\s+isValidAdditionalDocumentRenameUpdate\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/resource\.data\.type\s*==\s*'other'/)
      expect(body).toMatch(/request\.resource\.data\.type\s*==\s*'other'/)
      expect(body).toMatch(
        /affectedKeys\(\)\s*\.hasOnly\(\s*\[\s*'description'\s*,\s*'descriptionUpdatedAt'\s*,\s*'descriptionUpdatedById'\s*\]\s*\)/
      )
      expect(body).toMatch(/descriptionUpdatedAt\s*==\s*request\.time/)
      expect(body).toMatch(/descriptionUpdatedById\s*==\s*request\.auth\.uid/)
      expect(body).toMatch(/description\.size\(\)\s*>=\s*1/)
      expect(body).toMatch(/description\.size\(\)\s*<=\s*120/)
    })
  })

  describe('F18a — isValidProcessDocumentCreate (D1-D5, AD-1)', () => {
    it('hasOnly contem os 15 campos (13 do D1 + poNumber do AD-1 + alsoPackingList)', () => {
      const match = rules.match(/function\s+isValidProcessDocumentCreate\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      const fields = [
        'type', 'slotKey', 'itemId', 'containerId', 'description', 'name',
        'mimeType', 'size', 'storagePath', 'uploadedAt', 'uploadedById',
        'uploadedByName', 'uploadedByRole', 'poNumber', 'alsoPackingList',
      ]
      for (const field of fields) {
        expect(body, `campo ${field} nao esta em isValidProcessDocumentCreate`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
    })

    it('AD-1: slotKey de invoice/packingList no CONSOLIDADO usa poNumber', () => {
      const match = rules.match(/function\s+isValidProcessDocumentSlotKey\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/poNumber/)
      expect(match[1]).toMatch(/CONSOLIDADO/)
    })

    it('containerWash so em FCL/CONSOLIDADO', () => {
      const match = rules.match(/function\s+isValidProcessDocumentCreate\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/\[\s*['"]FCL['"]\s*,\s*['"]CONSOLIDADO['"]\s*\]/)
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

    it('isDocumentReader() exige isApprovedUser() E a lista exata [tecnico, faturamento]', () => {
      const match = rules.match(/function\s+isDocumentReader\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/isApprovedUser\s*\(\s*\)/)
      expect(match[1]).toMatch(/myRole\s*\(\s*\)\s+in\s+\[\s*'tecnico'\s*,\s*'faturamento'\s*\]/)
    })

    it('isDocumentReaderType(type) libera exatamente [cargoReport, coaOriginal]', () => {
      const match = rules.match(/function\s+isDocumentReaderType\s*\(\s*type\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/type\s+in\s+\[\s*'cargoReport'\s*,\s*'coaOriginal'\s*\]/)
    })

    it('as listas literais das rules sao iguais a DOCUMENT_READER_ROLES/DOCUMENT_READER_TYPES do backend', () => {
      const parseList = (source) => [...source.matchAll(/'([^']+)'/g)].map((m) => m[1])
      const roles = rules.match(/function\s+isDocumentReader\s*\(\s*\)\s*\{[\s\S]*?myRole\s*\(\s*\)\s+in\s+\[([^\]]*)\]/)
      const types = rules.match(/function\s+isDocumentReaderType\s*\(\s*type\s*\)\s*\{[\s\S]*?type\s+in\s+\[([^\]]*)\]/)
      expect(roles).not.toBeNull()
      expect(types).not.toBeNull()
      expect(parseList(roles[1])).toEqual(DOCUMENT_READER_ROLES)
      expect(parseList(types[1])).toEqual(DOCUMENT_READER_TYPES)
    })

    it('perfis leitores nao entram em nenhum ramo de escrita de documents', () => {
      const match = rules.match(/match\s+\/documents\/\{documentId\}\s*\{([\s\S]*?)\n\s{6}\}/)
      expect(match).not.toBeNull()
      const withoutRead = match[1].replace(/allow\s+read:[^;]*;/, '')
      expect(withoutRead).toMatch(/allow\s+create:/)
      expect(withoutRead).not.toMatch(/isDocumentReader/)
    })

    it('coaOriginal e valido em type, slotKey e storagePath de documents', () => {
      expect(rules).toMatch(/request\.resource\.data\.type\s*==\s*'coaOriginal'\s*&&\s*request\.resource\.data\.slotKey\s*==\s*'coaOriginal'/)
      expect(rules).toMatch(/request\.resource\.data\.type\s+in\s*\[[^\]]*'coaOriginal'[^\]]*\]/)
      expect(rules).toMatch(/request\.resource\.data\.type\s*==\s*'cargoReport'\s*\|\|\s*request\.resource\.data\.type\s*==\s*'coaOriginal'/)
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

  describe('F17.1a — status derivado (D-F, D-A)', () => {
    it('isPreCollectionStatus contem o legado "Aguardando agendamento"', () => {
      const match = rules.match(/function\s+isPreCollectionStatus\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/['"]Aguardando agendamento['"]/)
    })

    // F17.4a (D-3): 'Aguardando liberação no Terminal' saiu da lista do app
    // e entrou como pre-coleta na rule.
    it('isPreCollectionStatus contem "Aguardando liberação no Terminal" (F17.4a)', () => {
      const match = rules.match(/function\s+isPreCollectionStatus\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/['"]Aguardando liberação no Terminal['"]/)
    })

    it('isLogisticsCollectionStatusUpdate usa hasOnly com processStatus/cargoReceivedAt e allowlist de valor', () => {
      const match = rules.match(
        /function\s+isLogisticsCollectionStatusUpdate\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/
      )
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/hasOnly/)
      expect(body).toMatch(/['"]processStatus['"]/)
      expect(body).toMatch(/['"]cargoReceivedAt['"]/)
      expect(body).toMatch(/\[\s*['"]Coleta Agendada['"]\s*,\s*['"]Carga recebida['"]\s*\]/)
    })
  })

  describe('F17.2a — identificacao/carga por modal/embarque e transito (D-10)', () => {
    it('isAdminProcessFields contem os 22 campos novos', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      const newFields = [
        'supplierName', 'originLocation', 'incoterm', 'forwarderName',
        'unNumber', 'imoClass', 'shippedAt', 'vesselName', 'voyage',
        'flightNumber', 'masterBl', 'houseBl', 'mawb', 'hawb',
        'transshipmentPort', 'dangerousGoods', 'transshipment',
        'grossWeightKg', 'volumeM3', 'chargeableWeightKg',
        'packagesQuantity', 'containers',
      ]
      for (const field of newFields) {
        expect(body, `campo ${field} nao esta em isAdminProcessFields`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
    })

    it('isAdminProcessFields contem vesselImo e guarda o formato (string, 7 digitos ou vazio)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/['"]vesselImo['"]/)
      expect(body).toMatch(/vesselImo\s+is\s+string/)
      expect(body).toMatch(/vesselImo\.matches\(/)
    })

    it('isAdminProcessFields guarda o shape de containers (list, size <= 40)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/containers\s+is\s+list/)
      expect(body).toMatch(/containers\.size\(\)\s*<=\s*40/)
    })
  })

  describe('F17.2d-1 — ETD do transbordo (D-8)', () => {
    it('isAdminProcessFields contem transshipmentEtd', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      expect(match[1]).toMatch(/['"]transshipmentEtd['"]/)
    })
  })

  describe('F17.2b — anuencias licenses[] (D-12)', () => {
    it('isAdminProcessFields contem "licenses"', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/['"]licenses['"]/)
    })

    it('isAdminProcessFields guarda o shape de licenses (list, size <= 10)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/licenses\s+is\s+list/)
      expect(body).toMatch(/licenses\.size\(\)\s*<=\s*10/)
    })

    it('mapaStatus/mapaInspectionScheduledAt AINDA presentes (compat de 1 release)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/['"]mapaStatus['"]/)
      expect(body).toMatch(/['"]mapaInspectionScheduledAt['"]/)
    })
  })

  describe('F17.2c - purchaseOrders (D-8)', () => {
    it('isAdminProcessFields contem "purchaseOrders"', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/['"]purchaseOrders['"]/)
    })

    it('isAdminProcessFields guarda o shape de purchaseOrders (list, size <= 50)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/purchaseOrders\s+is\s+list/)
      expect(body).toMatch(/purchaseOrders\.size\(\)\s*<=\s*50/)
    })
  })

  describe('F17.3a — chegada com data/CE/free time/presenca de carga (D-9)', () => {
    it('isAdminProcessFields contem as 9 chaves novas', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      const newFields = [
        'berthedAt', 'arrivedAt', 'ceMercante', 'ceHouse', 'terminalName',
        'freeTimeDays', 'demurrageDailyRateUsd', 'cargoPresenceInformedAt',
        'migratedApproxFields',
      ]
      for (const field of newFields) {
        expect(body, `campo ${field} nao esta em isAdminProcessFields`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
    })

    it('isAdminProcessFields guarda o shape de migratedApproxFields (list, size <= 10)', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/migratedApproxFields\s+is\s+list/)
      expect(body).toMatch(/migratedApproxFields\.size\(\)\s*<=\s*10/)
    })
  })

  describe('F17.3b — DUIMP completa/conferencia/exigencia (D-9)', () => {
    it('isAdminProcessFields contem as 6 chaves novas', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      const newFields = [
        'duimpNumber', 'duimpRegisteredAt', 'parameterizedAt',
        'customsInspectionScheduledAt', 'customsRequirement',
        'customsRequirementNotes',
      ]
      for (const field of newFields) {
        expect(body, `campo ${field} nao esta em isAdminProcessFields`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
    })
  })

  describe('F17.4b — divergencia no recebimento (B-3)', () => {
    it('isAdminProcessFields contem as 3 chaves novas e chama isValidReceiptDivergence()', () => {
      const match = rules.match(/function\s+isAdminProcessFields\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      const newFields = ['receiptDivergence', 'receiptDivergenceType', 'receiptDivergenceNotes']
      for (const field of newFields) {
        expect(body, `campo ${field} nao esta em isAdminProcessFields`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
      expect(body).toMatch(/isValidReceiptDivergence\(\)/)
    })

    it('isLogisticsCollectionStatusUpdate contem as 3 chaves novas e chama isValidReceiptDivergence()', () => {
      const match = rules.match(
        /function\s+isLogisticsCollectionStatusUpdate\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/
      )
      expect(match).not.toBeNull()
      const body = match[1]
      const newFields = ['receiptDivergence', 'receiptDivergenceType', 'receiptDivergenceNotes']
      for (const field of newFields) {
        expect(body, `campo ${field} nao esta em isLogisticsCollectionStatusUpdate`).toMatch(
          new RegExp(`['"]${field}['"]`)
        )
      }
      expect(body).toMatch(/isValidReceiptDivergence\(\)/)
    })

    it('isLogisticsCollectionStatusUpdate NAO contem "containers"', () => {
      const match = rules.match(
        /function\s+isLogisticsCollectionStatusUpdate\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/
      )
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).not.toMatch(/['"]containers['"]/)
    })

    it('isValidReceiptDivergence valida o vocabulario fechado e o teto de notas', () => {
      const match = rules.match(/function\s+isValidReceiptDivergence\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/)
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/\[\s*['"]{2},\s*['"]Avaria['"],\s*['"]Falta['"],\s*['"]Sobra['"],\s*['"]Lote['"]\s*\]/)
      expect(body).toMatch(/size\(\)\s*<=\s*2000/)
    })

    it('isLogisticsCollectionStatusUpdate contem "postReceiptImages" com guarda de shape/tamanho', () => {
      const match = rules.match(
        /function\s+isLogisticsCollectionStatusUpdate\s*\(\s*\)\s*\{([\s\S]*?)\n\s{4}\}/
      )
      expect(match).not.toBeNull()
      const body = match[1]
      expect(body).toMatch(/['"]postReceiptImages['"]/)
      expect(body).toMatch(/postReceiptImages\s+is\s+list/)
      expect(body).toMatch(/postReceiptImages\.size\(\)\s*<=\s*10/)
    })
  })

  describe('F18b-1 — documentIndex (B1)', () => {
    it('firestore.rules NAO contem "documentIndex" (gravado SO pelo trigger, nunca pelo cliente)', () => {
      expect(rules).not.toMatch(/documentIndex/)
    })
  })

  describe('PR 3 — referência do ERP (erpSnapshots / erpProcessHints)', () => {
    const readFunction = (name) => {
      const match = rules.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s{4}\\}`))
      expect(match, `function ${name} nao encontrada`).not.toBeNull()
      return match[1]
    }
    const readMatch = (collection) => {
      const match = rules.match(new RegExp(`match\\s+/${collection}/\\{[a-zA-Z]+\\}\\s*\\{([\\s\\S]*?)\\n\\s{4}\\}`))
      expect(match, `match /${collection} nao encontrado`).not.toBeNull()
      return match[1]
    }

    it('erpSnapshots: read so isAdmin(), update so no latest e delete: if false', () => {
      const body = readMatch('erpSnapshots')
      expect(body).toMatch(/allow\s+read:\s*if\s+isAdmin\s*\(\s*\)\s*;/)
      expect(body).toMatch(
        /allow\s+update:\s*if\s+isAdmin\s*\(\s*\)\s*&&\s*snapshotId\s*==\s*'latest'\s*&&\s*isValidErpLatestPointer\s*\(\s*\)/
      )
      expect(body).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('erpProcessHints: read so isAdmin(), teto de 128 no id e delete: if false', () => {
      const body = readMatch('erpProcessHints')
      expect(body).toMatch(/allow\s+read:\s*if\s+isAdmin\s*\(\s*\)\s*;/)
      expect(body).toMatch(
        /allow\s+create,\s*update:\s*if\s+isAdmin\s*\(\s*\)\s*&&\s*processId\.size\(\)\s*<=\s*128\s*&&\s*isValidErpProcessHint\s*\(\s*\)/
      )
      expect(body).toMatch(/allow\s+delete:\s*if\s+false\s*;/)
    })

    it('isValidErpProcessHint: hasOnly das 5 chaves, tetos de 300 itens e 100 pedidos, transport e vessel fechados', () => {
      const body = readFunction('isValidErpProcessHint')
      expect(body).toMatch(
        /keys\(\)\.hasOnly\(\[\s*'snapshotId',\s*'savedAt',\s*'savedById',\s*'matchRule',\s*'shipment',?\s*\]\)/
      )
      expect(body).toMatch(/shipment\.items\.size\(\)\s*<=\s*300/)
      expect(body).toMatch(/shipment\.orders\.size\(\)\s*<=\s*100/)
      expect(body).toMatch(/shipment\.transport\.keys\(\)\.hasOnly\(/)
      expect(body).toMatch(/shipment\.transport\.vessel\.keys\(\)\.hasOnly\(\['name',\s*'raw',\s*'voyage'\]\)/)
    })

    it('isValidErpLatestPointer: hasOnly/hasAll das 6 chaves (com hints inteiro >= 0, contra importacoes concorrentes)', () => {
      const body = readFunction('isValidErpLatestPointer')
      const keys = String.raw`'snapshotId',\s*'updatedAt',\s*'updatedById',\s*'updatedByName',\s*'fileName',\s*'hints',?`
      expect(body).toMatch(new RegExp(String.raw`keys\(\)\.hasOnly\(\[\s*${keys}\s*\]\)`))
      expect(body).toMatch(new RegExp(String.raw`keys\(\)\.hasAll\(\[\s*${keys}\s*\]\)`))
      expect(body).toMatch(/request\.resource\.data\.hints\s+is\s+int/)
      expect(body).toMatch(/request\.resource\.data\.hints\s*>=\s*0/)
    })

    it('isValidErpLatestPointer usa existsAfter apontando para o meta do snapshot', () => {
      const body = readFunction('isValidErpLatestPointer')
      expect(body).toMatch(
        /existsAfter\(\s*\/databases\/\$\(database\)\/documents\/erpSnapshots\/\$\(request\.resource\.data\.snapshotId\)\s*\)/
      )
    })

    it('todo allow dentro dos 2 match novos e "if false" ou comeca com "if isAdmin()"', () => {
      for (const collection of ['erpSnapshots', 'erpProcessHints']) {
        const body = readMatch(collection)
        // Cada `allow` termina em ';' (as condicoes podem quebrar linha).
        const conditions = [...body.matchAll(/allow\s+[a-z, ]+:\s*if\s+([^;]*);/g)].map((match) =>
          match[1].replace(/\s+/g, ' ').trim()
        )
        expect(conditions.length, collection).toBeGreaterThanOrEqual(3)
        for (const condition of conditions) {
          expect(condition === 'false' || condition.startsWith('isAdmin()'), `${collection}: ${condition}`).toBe(true)
        }
      }
    })
  })
})
