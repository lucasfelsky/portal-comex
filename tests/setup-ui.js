// Setup file para tests de UI do Portal COMEX.
// Aplicado a specs que rodam em jsdom (tests/ui/**).
// Adiciona matchers do @testing-library/jest-dom (toBeInTheDocument, etc)
// e faz cleanup automatico apos cada test (remove DOM residual entre tests).
//
// PR #8 (2026-07-09): configure() com asyncUtilTimeout de 3000ms
// (default do RTL/Testing Library e' 1000ms). CI do GitHub Actions
// (ubuntu-latest) tem cold start + jsdom init que pode levar
// > 500ms, e o `listProcesses` mockado + render do React
// DashboardPage precisa de 2-3 ticks do Event Loop pra renderizar
// os 2 grupos (scheduled/unscheduled). 1000ms era muito apertado
// (flaky em CI). 3000ms e' seguro pra desktop, e o CI nao
// degrada significativamente (3s no pior caso).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  cleanup()
})
