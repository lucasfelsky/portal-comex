// Tests do componente Breadcrumb (Sprint 13).
// Cobre:
//   - Renderiza <nav aria-label="Breadcrumb"> com <ol>
//   - Cada item vira um <li> com link ou current
//   - Ultimo item recebe aria-current="page" e classe breadcrumb__current
//   - Itens intermediarios recebem breadcrumb__link + <Link to=...>
//   - Separador chevron entre itens
//   - items=[] nao renderiza nada
//   - Item sem `to` e' tratado como current (sem link)
//
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import Breadcrumb from '../../src/components/Breadcrumb.jsx'

function renderWithRouter(items) {
  return render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>
  )
}

describe('Breadcrumb', () => {
  it('nao renderiza nada com items vazios', () => {
    const { container } = renderWithRouter([])
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renderiza nav com aria-label="Breadcrumb"', () => {
    renderWithRouter([{ label: 'Admin' }])
    const nav = screen.getByLabelText('Breadcrumb')
    expect(nav).toBeInTheDocument()
  })

  it('renderiza <ol> com 1 <li> para 1 item', () => {
    const { container } = renderWithRouter([{ label: 'Admin' }])
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(1)
  })

  it('ultimo item recebe aria-current="page"', () => {
    renderWithRouter([{ label: 'Admin', to: '/admin' }, { label: 'Usuarios' }])
    const current = screen.getByText('Usuarios')
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  it('ultimo item NAO tem link (current)', () => {
    const { container } = renderWithRouter([
      { label: 'Admin', to: '/admin' },
      { label: 'Usuarios' },
    ])
    const lastLi = container.querySelectorAll('li')[1]
    // Sem <a> dentro
    expect(lastLi.querySelector('a')).toBeNull()
  })

  it("item sem 'to' e' tratado como current (sem link)", () => {
    const { container } = renderWithRouter([{ label: 'Algo' }])
    const li = container.querySelector('li')
    expect(li.querySelector('a')).toBeNull()
    expect(screen.getByText('Algo').getAttribute('aria-current')).toBe('page')
  })

  it('item intermediario vira <Link to=...> com classe breadcrumb__link', () => {
    renderWithRouter([{ label: 'Admin', to: '/admin' }, { label: 'Usuarios' }])
    const link = screen.getByText('Admin')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/admin')
    expect(link.className).toBe('breadcrumb__link')
  })

  it('renderiza separador chevron entre itens (nao no ultimo)', () => {
    const { container } = renderWithRouter([
      { label: 'Admin', to: '/admin' },
      { label: 'Usuarios' },
    ])
    const separators = container.querySelectorAll('.breadcrumb__separator')
    // 1 separador (entre Admin e Usuarios). Ultimo item nao tem.
    expect(separators.length).toBe(1)
  })

  it('separador contem um <svg> (chevron) com aria-hidden', () => {
    const { container } = renderWithRouter([
      { label: 'Admin', to: '/admin' },
      { label: 'Usuarios' },
    ])
    const separator = container.querySelector('.breadcrumb__separator')
    expect(separator.getAttribute('aria-hidden')).toBe('true')
    expect(separator.querySelector('svg')).toBeInTheDocument()
  })

  it('com 3 itens, renderiza 2 separadores', () => {
    const { container } = renderWithRouter([
      { label: 'Admin', to: '/admin' },
      { label: 'Sub', to: '/admin/sub' },
      { label: 'Atual' },
    ])
    const separators = container.querySelectorAll('.breadcrumb__separator')
    expect(separators.length).toBe(2)
  })

  it('breadcrumb__current tem a classe certa', () => {
    renderWithRouter([{ label: 'Admin', to: '/admin' }, { label: 'Atual' }])
    const current = screen.getByText('Atual')
    expect(current.className).toBe('breadcrumb__current')
  })
})
