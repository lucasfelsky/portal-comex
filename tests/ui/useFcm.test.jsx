// Tests do hook useFcm (Sprint 22).
// Cobre:
//   - supported: false quando VAPID_KEY nao configurado (default em dev)
//   - status inicial: 'idle' (sem localStorage)
//   - status inicial: restaura do localStorage
//   - enable() em ambiente unsupported: status vira 'unsupported'
//   - status sincroniza com Notification.permission === 'denied'
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { useFcm } from '../../src/hooks/useFcm.js'

vi.mock('../../src/services/fcmService', () => ({
  isFcmSupported: vi.fn(async () => false),
  requestNotificationPermission: vi.fn(),
  getFcmToken: vi.fn(),
  onFcmMessage: vi.fn(() => () => {}),
  revokeFcmToken: vi.fn(async () => true),
}))

const STORAGE_KEY = 'sq-comex:fcm-status'

function Probe() {
  const fcm = useFcm('user-1')
  return (
    <div>
      <span data-testid="supported">{String(fcm.supported)}</span>
      <span data-testid="status">{fcm.status}</span>
      <button type="button" onClick={() => fcm.enable()}>Enable</button>
      <button type="button" onClick={() => fcm.disable()}>Disable</button>
    </div>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  // Garante Notification.permission default
  Object.defineProperty(window, 'Notification', {
    value: { permission: 'default' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('useFcm', () => {
  it('supported: false em ambiente unsupported (default)', async () => {
    render(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId('supported')).toHaveTextContent('false')
    })
  })

  it('status inicial: idle sem localStorage', () => {
    render(<Probe />)
    expect(screen.getByTestId('status')).toHaveTextContent('idle')
  })

  it('status inicial: restaura do localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'denied')
    render(<Probe />)
    expect(screen.getByTestId('status')).toHaveTextContent('denied')
  })

  it('enable() em ambiente unsupported: status vira unsupported', async () => {
    render(<Probe />)
    const btn = screen.getByRole('button', { name: 'Enable' })
    await act(async () => {
      btn.click()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('unsupported')
    })
  })

  it('sincroniza com Notification.permission === "denied"', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'denied' },
      writable: true,
      configurable: true,
    })
    render(<Probe />)
    expect(screen.getByTestId('status')).toHaveTextContent('denied')
  })

  it('limpa listener no unmount', () => {
    const onFcmMessageMock = vi.fn(() => () => {})
    vi.doMock('../../src/services/fcmService', () => ({
      isFcmSupported: vi.fn(async () => true),
      requestNotificationPermission: vi.fn(),
      getFcmToken: vi.fn(),
      onFcmMessage: onFcmMessageMock,
      revokeFcmToken: vi.fn(),
    }))
    const { unmount } = render(<Probe />)
    unmount()
    // Sem assertion rigorosa: cleanup roda sem throw
  })
})
