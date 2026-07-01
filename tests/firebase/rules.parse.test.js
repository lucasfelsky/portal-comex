// Testa que `firestore.rules` passa pelo parser do firebase-tools sem
// erros de sintaxe. Usa `firebase deploy --only firestore:rules --dry-run`
// em subprocesso, que e' o mesmo caminho usado em CI.
//
// Como o emulador Firestore exige Java 21+ (e este ambiente tem Java 8),
// NAO usamos @firebase/rules-unit-testing. Quando o ambiente ganhar Java
// 21+, este teste pode ser substituido por:
//   import { initializeTestApp, loadFirestoreRules, ... } from '@firebase/rules-unit-testing'
//   com Firestore rodando em `process.env.FIRESTORE_EMULATOR_HOST`.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileP = promisify(execFile)

// O cwd de execFile e' o process.cwd() do vitest, que por padrao e' a raiz
// do projeto. Usar `process.cwd()` evita problemas de path resolution
// (URL encoding de espacos, etc).
const REPO_ROOT = process.cwd()

// `firebase` CLI: usamos `node node_modules/firebase-tools/lib/bin/firebase.js`
// diretamente. Evita problemas com `.cmd` no Windows e garante que usamos
// a versao exata do firebase-tools declarada em devDependencies.
function pickFirebaseCommand() {
  if (process.env.FIREBASE_BIN) {
    return { bin: process.env.FIREBASE_BIN, args: [] }
  }
  return { bin: process.execPath, args: ['node_modules/firebase-tools/lib/bin/firebase.js'] }
}

async function runRulesDryRun() {
  const { bin, args: prefixArgs } = pickFirebaseCommand()
  const args = [
    ...prefixArgs,
    '--config', 'firebase.portal-comex.json',
    '--project', 'sq-comex-updates-3d22f',
    'deploy',
    '--only', 'firestore:rules',
    '--dry-run',
    '--non-interactive',
  ]
  try {
    const { stdout, stderr } = await execFileP(bin, args, {
      cwd: REPO_ROOT,
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      // Sem shell — exec direto para evitar problemas com .cmd / quoting.
    })
    return { stdout, stderr, code: 0, bin, args }
  } catch (error) {
    return {
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? '',
      code: error?.code ?? 1,
      bin,
      args,
    }
  }
}

describe('firestore.rules parse', () => {
  // Pula quando nao houver credencial Firebase no ambiente. O dry-run
  // precisa autenticar antes de validar as rules, entao este teste
  // so roda em CI (job rules-validation) ou local com FIREBASE_TOKEN /
  // FIREBASE_BIN configurado. O `unit-and-build` job (que roda `npm test`)
  // nao tem credenciais, entao pulamos para nao quebrar a suite.
  const hasFirebaseCredential = Boolean(process.env.FIREBASE_TOKEN) || Boolean(process.env.FIREBASE_BIN)
  const itMaybe = hasFirebaseCredential ? it : it.skip

  itMaybe('compila sem erros de sintaxe (firebase deploy --dry-run)', async () => {
    const { stdout, stderr, code, bin, args } = await runRulesDryRun()
    const combined = `${stdout}\n${stderr}`
    if (code !== 0) {
      throw new Error(
        `firebase deploy --dry-run saiu com codigo ${code}.\n` +
        `bin: ${bin}\nargs: ${args?.join(' ')}\n` +
        `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`
      )
    }
    expect(combined).toMatch(/rules file .* compiled successfully/)
  }, 180000)
})
