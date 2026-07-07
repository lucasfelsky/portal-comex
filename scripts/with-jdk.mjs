#!/usr/bin/env node
// with-jdk.mjs — roda o comando passado com o bin do $JAVA_HOME na frente do PATH.
//
// Motivo: o Firestore Emulator (firebase-tools) exige JDK 11+, mas em algumas
// maquinas o `java` default do PATH e' Java 8 (ex.: o shim Oracle "javapath"
// tem precedencia). Como o instalador do Temurin ja seta JAVA_HOME -> JDK 21,
// basta garantir que o bin do JAVA_HOME venha primeiro no PATH *so' para este
// processo* (nao mexe em env global nem exige elevacao).
//
// Uso: node scripts/with-jdk.mjs <comando> [args...]
// Ex.: node scripts/with-jdk.mjs firebase emulators:start --only firestore
//
// Se JAVA_HOME nao estiver setado, e' um no-op: cai no `java` do PATH (o dev
// e' responsavel por ter um JDK 11+ como default).

import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const [, , cmd, ...args] = process.argv

if (!cmd) {
  console.error('uso: node scripts/with-jdk.mjs <comando> [args...]')
  process.exit(1)
}

const javaHome = process.env.JAVA_HOME
if (javaHome) {
  const javaBin = path.join(javaHome, 'bin')
  if (fs.existsSync(javaBin)) {
    process.env.PATH = javaBin + path.delimiter + (process.env.PATH ?? '')
  } else {
    console.warn(`[with-jdk] JAVA_HOME setado mas ${javaBin} nao existe; usando o java do PATH.`)
  }
} else {
  console.warn('[with-jdk] JAVA_HOME nao setado; usando o java do PATH (precisa ser JDK 11+ pro emulador).')
}

// Sem shell:true de proposito — evita re-serializacao/escaping de args no
// Windows (que quebra payloads com espaco, ex. o comando do emulators:exec).
// Por isso os npm scripts invocam o firebase pelo entrypoint node
// (`node node_modules/firebase-tools/lib/bin/firebase.js ...`) em vez do
// binario `.cmd`, que precisaria de shell pra resolver.
const child = spawn(cmd, args, { stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
child.on('error', (err) => {
  console.error(`[with-jdk] falha ao iniciar "${cmd}":`, err.message)
  process.exit(1)
})
