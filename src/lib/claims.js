// Leitura de custom claims do Firebase Auth via getIdTokenResult.
//
// S3 / Sprint 5.1: claims sao a fonte primaria de role/status. O cache do
// Firebase Web SDK dura ~1h; apos um adminUpdateUserClaims o front precisa
// chamar `forceRefresh = true` para o novo role/status ser visto sem logout.
//
// https://firebase.google.com/docs/auth/admin/custom-claims#access_custom_claims_on_the_client

const DEFAULT_ROLE = 'user'
const DEFAULT_STATUS = 'Pendente'

const ALLOWED_ROLES = new Set(['user', 'admin', 'logistica', 'compras', 'viewer'])
const ALLOWED_STATUSES = new Set(['Pendente', 'Ativo', 'Bloqueado', 'Reprovado'])

function normalizeRole(value) {
  const candidate = String(value ?? '').trim()
  return ALLOWED_ROLES.has(candidate) ? candidate : DEFAULT_ROLE
}

function normalizeStatus(value) {
  const candidate = String(value ?? '').trim()
  return ALLOWED_STATUSES.has(candidate) ? candidate : DEFAULT_STATUS
}

/**
 * Retorna { role, status } das custom claims do usuario atual.
 * Em caso de erro, devolve defaults seguros (sem quebrar a UX).
 */
export async function getUserClaims(user, { forceRefresh = false } = {}) {
  if (!user) {
    return { role: DEFAULT_ROLE, status: DEFAULT_STATUS }
  }

  try {
    const idTokenResult = await user.getIdTokenResult(forceRefresh)
    const claims = idTokenResult?.claims ?? {}
    return {
      role: normalizeRole(claims.role),
      status: normalizeStatus(claims.status),
    }
  } catch {
    return { role: DEFAULT_ROLE, status: DEFAULT_STATUS }
  }
}
