import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { auth, isFirebaseConfigured } from '../lib/firebase'
import { getUserClaims } from '../lib/claims'
import useAuth from '../hooks/useAuth'

// Pagina de diagnostico temporaria (Sprint 6.7 / hotfix de claims).
// Mostra exatamente o que o front esta' lendo das custom claims para
// ajudar a distinguir "bug do front" de "claims do Firebase erradas".
// Acessivel em /debug/claims sem ProtectedRoute.
export default function DebugClaimsPage() {
  const { isAuthenticated, profile, logout } = useAuth()
  const [claimsState, setClaimsState] = useState({
    status: 'loading',
    role: null,
    raw: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!isFirebaseConfigured || !auth?.currentUser) {
        if (!cancelled) {
          setClaimsState({
            status: 'no-auth',
            role: null,
            raw: null,
            error: 'Firebase nao configurado ou sem usuario logado',
          })
        }
        return
      }

      try {
        const fresh = await getUserClaims(auth.currentUser, { forceRefresh: true })
        const tokenResult = await auth.currentUser.getIdTokenResult(true)
        if (!cancelled) {
          setClaimsState({
            status: 'ok',
            role: fresh.role,
            raw: fresh,
            error: null,
            tokenClaims: tokenResult?.claims ?? {},
            tokenEmail: auth.currentUser.email ?? null,
            tokenUid: auth.currentUser.uid,
            tokenIssuedAt: tokenResult?.issuedAtTime ?? null,
            tokenExpiration: tokenResult?.expirationTime ?? null,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setClaimsState({
            status: 'error',
            role: null,
            raw: null,
            error: error?.message ?? String(error),
          })
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form" style={{ width: 'min(100%, 720px)' }}>
        <span className="brand__eyebrow">Diagnostico de claims</span>
        <h1>O que o front esta vendo das suas claims</h1>
        <p>
          Esta pagina mostra o estado bruto lido pelo Firebase Web SDK e o perfil derivado
          pelo AuthContext. Use para distinguir bug do front de claims erradas no Firebase.
        </p>

        <div className="auth-reset-panel">
          <strong>AuthContext (profile em memoria)</strong>
          <p>status: <code>{profile?.status ?? '(vazio)'}</code></p>
          <p>role: <code>{profile?.role ?? '(vazio)'}</code></p>
          <p>email: <code>{profile?.email ?? '(vazio)'}</code></p>
          <p>uid: <code>{profile?.uid ?? '(vazio)'}</code></p>
        </div>

        <div className="auth-reset-panel">
          <strong>getIdTokenResult(forceRefresh=true) agora</strong>
          {claimsState.status === 'loading' && <p>Carregando...</p>}
          {claimsState.status === 'no-auth' && <p>{claimsState.error}</p>}
          {claimsState.status === 'error' && (
            <>
              <p>role: <code>ERRO</code></p>
              <p>error: <code>{claimsState.error}</code></p>
            </>
          )}
          {claimsState.status === 'ok' && (
            <>
              <p>role lido: <code>{claimsState.role ?? '(vazio)'}</code></p>
              <p>claims completas: <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.78rem', margin: 0 }}>{JSON.stringify(claimsState.tokenClaims, null, 2)}</pre></p>
              <p>uid: <code>{claimsState.tokenUid}</code></p>
              <p>email: <code>{claimsState.tokenEmail}</code></p>
              <p>emitido em: <code>{claimsState.tokenIssuedAt}</code></p>
              <p>expira em: <code>{claimsState.tokenExpiration}</code></p>
            </>
          )}
        </div>

        <div className="error-banner" style={{ background: 'var(--surface-alt)', color: 'var(--ink-soft)' }}>
          <strong>Diagnostico rapido:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>Se <code>status</code> nas claims = <code>Ativo</code> mas o AuthContext mostra <code>Pendente</code>: bug no AuthContext.</li>
            <li>Se <code>status</code> nas claims = <code>Pendente</code> (ou ausente): o admin precisa rodar <code>adminUpdateUserClaims</code> novamente.</li>
            <li>Se <code>role</code> = <code>user</code> mas voce e' admin: claims nao foram propagadas pelo callable.</li>
          </ul>
        </div>

        <button type="button" className="ghost-button auth-button" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  )
}
