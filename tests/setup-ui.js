// Setup file para tests de UI do Portal COMEX.
// Aplicado a specs que rodam em jsdom (tests/ui/**).
// Adiciona matchers do @testing-library/jest-dom (toBeInTheDocument, etc)
// e faz cleanup automatico apos cada test (remove DOM residual entre tests).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
