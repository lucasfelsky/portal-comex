// L36: guarda de sincronia das dependencias de backend entre a RAIZ e functions/.
//
// `vitest.config.mjs` faz alias de `firebase-admin/*`, `firebase-functions/*`
// e `nodemailer` para a copia da RAIZ (require.resolve), e o CI so roda
// `npm ci` na raiz. Se a raiz e `functions/` divergirem, `npm test` passa a
// validar uma versao diferente da que o `firebase deploy` empacota (que sai de
// `functions/package-lock.json`). Este teste impede essa divergencia silenciosa.
//
// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const BACKEND_PACKAGES = ['firebase-functions', 'firebase-admin', 'nodemailer']

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8'))
}

const rootPkg = readJson('package.json')
const functionsPkg = readJson('functions/package.json')
const rootLock = readJson('package-lock.json')
const functionsLock = readJson('functions/package-lock.json')

describe('L36 - sincronia de dependencias raiz x functions/', () => {
  it('declara o mesmo range de firebase-functions, firebase-admin e nodemailer na raiz (devDependencies) e em functions/ (dependencies)', () => {
    for (const name of BACKEND_PACKAGES) {
      const rootRange = rootPkg.devDependencies?.[name]
      const functionsRange = functionsPkg.dependencies?.[name]

      expect(rootRange, `${name} ausente em devDependencies da raiz`).toBeTruthy()
      expect(functionsRange, `${name} ausente em dependencies de functions/`).toBeTruthy()
      expect(rootRange, `range divergente para ${name}`).toBe(functionsRange)
    }
  })

  it('resolve a mesma versao de firebase-functions, firebase-admin e nodemailer nos dois package-lock.json', () => {
    for (const name of BACKEND_PACKAGES) {
      const rootVersion = rootLock.packages?.[`node_modules/${name}`]?.version
      const functionsVersion = functionsLock.packages?.[`node_modules/${name}`]?.version

      expect(rootVersion, `${name} ausente no lock da raiz`).toBeTruthy()
      expect(functionsVersion, `${name} ausente no lock de functions/`).toBeTruthy()
      expect(rootVersion, `versao divergente para ${name}`).toBe(functionsVersion)
    }
  })

  it('mantem firebase-functions em 7.x com minor >= 4 em functions/package-lock.json', () => {
    const version = functionsLock.packages?.['node_modules/firebase-functions']?.version
    const [major, minor] = String(version).split('.').map(Number)

    expect(major).toBe(7)
    expect(minor).toBeGreaterThanOrEqual(4)
  })
})
