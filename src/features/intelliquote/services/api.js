import { getAuth } from 'firebase/auth'
import { app } from '../../../lib/firebase'

/**
 * Wrapper de fetch para chamar a API do IntelliQuote.
 * Anexa automaticamente o token Firebase do usuario logado no header
 * Authorization (Bearer). O backend valida o token e mapeia para um
 * usuario interno do IntelliQuote.
 *
 * Em dev, aponta para http://localhost:3000 (backend local).
 * Em prod, defina VITE_INTELLIQUOTE_API_BASE=https://intelliquote-api-xxx.run.app
 */

const API_BASE =
  import.meta.env.VITE_INTELLIQUOTE_API_BASE ?? 'http://localhost:3000'

const auth = getAuth(app)

async function getAuthHeaders() {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sessao expirada. Faca login novamente.')
  }
  const token = await user.getIdToken(false)
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function apiGet(path) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers })
  return handleResponse(res)
}

export async function apiPost(path, body) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handleResponse(res)
}

export async function apiPut(path, body) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return handleResponse(res)
}

export async function apiDelete(path) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers })
  return handleResponse(res)
}

async function handleResponse(res) {
  if (res.status === 204) return null
  let payload = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch (_err) {
      payload = text
    }
  }
  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && payload.message) ||
      res.statusText ||
      `Falha na requisicao (${res.status})`
    throw new ApiError(message, res.status)
  }
  return payload
}

export { API_BASE }