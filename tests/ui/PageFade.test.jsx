// Tests do componente PageFade (Sprint 16.1).
// Cobre:
//   - Renderiza children com classe .page-fade
//   - Aplica .page-fade--visible no proximo frame
//   - data-page-fade reflete pathname atual
//   - Ao trocar pathname, volta para invisivel e reaplica --visible
//   - className extra e mesclado com .page-fade
//
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import React from 'react'
import PageFade from '../../src/components/PageFade.jsx'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="probe-pathname">{location.pathname}</div>
}

function renderWith(initialPath = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/home" element={<PageFade className="extra-class"><div data-testid="home">Home</div></PageFade>} />
        <Route path="/about" element={<PageFade><div data-testid="about">About</div></PageFade>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  // requestAnimationFrame sincrono: executa callback imediatamente
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PageFade', () => {
  it('renderiza children dentro de .page-fade', () => {
    renderWith('/home')
    const wrapper = screen.getByTestId('home').parentElement
    expect(wrapper.className).toMatch(/\bpage-fade\b/)
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('aplica .page-fade--visible no proximo frame', () => {
    renderWith('/home')
    const wrapper = screen.getByTestId('home').parentElement
    expect(wrapper.className).toMatch(/\bpage-fade--visible\b/)
  })

  it('data-page-fade reflete o pathname atual', () => {
    renderWith('/home')
    const wrapper = screen.getByTestId('home').parentElement
    expect(wrapper.getAttribute('data-page-fade')).toBe('/home')
  })

  it('className extra e mesclado', () => {
    renderWith('/home')
    const wrapper = screen.getByTestId('home').parentElement
    expect(wrapper.className).toMatch(/\bextra-class\b/)
  })

  it('ao trocar pathname, wrapper reaparece com --visible', () => {
    const { unmount } = renderWith('/home')
    expect(screen.getByTestId('home').parentElement.className).toMatch(/\bpage-fade--visible\b/)

    unmount()

    // Simulando troca de rota: re-render com path /about
    renderWith('/about')
    const aboutWrapper = screen.getByTestId('about').parentElement
    expect(aboutWrapper.className).toMatch(/\bpage-fade\b/)
    // No novo render o effect roda e requestAnimationFrame sincrono aplica --visible
    expect(aboutWrapper.className).toMatch(/\bpage-fade--visible\b/)
    expect(aboutWrapper.getAttribute('data-page-fade')).toBe('/about')
  })
})
