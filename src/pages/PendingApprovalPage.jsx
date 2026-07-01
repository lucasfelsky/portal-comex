import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import { auth, isFirebaseConfigured } from '../lib/firebase'
import { getUserClaims } from '../lib/claims'

export default function PendingApprovalPage() {
  const { isAuthenticated, hasAccess, isEmailVerified, profile, logout, refreshAuthenticatedUser } = useAuth()
  const currentStatus = profile?.status || 'Pendente'
  const isRejected = currentStatus === 'Reprovado'
  const isBlocked = currentStatus === 'Bloqueado'
  const [diagnostic, setDiagnostic] = useState(null)
  const [reloading, setReloading] = useState(false)

  // Diagnostico inline: mostra o que o front esta' lendo das claims AGORA.
  // Ajuda a distinguir bug do front de claims erradas no Firebase
  // (Sprint 6.7 / hotfix 'Acesso pendente' indevido em admin).
  useEffect(() => {
    let cancelled = false

    async function runDiagnostic() {
      if (!isFirebaseConfigured || !auth?.currentUser) {
        return
      }
      try {
        const fresh = await getUserClaims(auth.currentUser, { forceRefresh: true })
        if (!cancelled) {
          setDiagnostic({
            ok: true,
            role: fresh.role,
            status: fresh.status,
            email: auth.currentUser.email ?? null,
            uid: auth.currentUser.uid,
          })
        }
      } catch (error) {
        if (!cancelled) {
          setDiagnostic({
            ok: false,
            error: error?.message ?? String(error),
          })
        }
      }
    }

    runDiagnostic()
    return () => {
      cancelled = true
    }
  }, [profile?.status])

  async function handleForceReload() {
    setReloading(true)
    try {
      await refreshAuthenticatedUser({ forceClaimsRefresh: true })
    } catch {
      // ignora
    } finally {
      setReloading(false)
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (hasAccess) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--form">
        <span className="brand__eyebrow">Portal COMEX</span>
        <h1>{isRejected ? 'Acesso reprovado' : isBlocked ? 'Acesso bloqueado' : 'Acesso pendente'}</h1>
        <p>
          O usuário <strong>{profile?.email}</strong> foi criado com sucesso, mas o acesso ainda não
          foi liberado.
        </p>
        <div className="auth-reset-panel">
          <strong>Próximo passo</strong>
          <p>
            {isRejected
              ? 'Seu cadastro foi reprovado. Procure um administrador caso precise revisar o acesso.'
              : isBlocked
                ? 'Seu acesso foi bloqueado por um administrador. Procure a administracao para regularizar o acesso.'
                : isEmailVerified
                  ? 'Seu email ja foi verificado. Agora aguarde a liberacao manual de um administrador.'
                  : 'Confirme primeiro o email corporativo e, depois disso, aguarde a liberacao manual de um administrador.'}
          </p>
        </div>
        <div className="success-banner">Status atual: {currentStatus}</div>

        {diagnostic && (
          <div className="auth-reset-panel" style={{ fontSize: '0.85rem' }}>
            <strong>Diagnostico (claims lidas agora)</strong>
            {diagnostic.ok ? (
              <>
                <p>uid: <code>{diagnostic.uid}</code></p>
                <p>email: <code>{diagnostic.email}</code></p>
                <p>role: <code>{diagnostic.role ?? '(vazio)'}</code></p>
                <p>status: <code>{diagnostic.status ?? '(vazio)'}</code></p>
                <p style={{ marginTop: 8, color: 'var(--ink-soft)' }}>
                  Se <code>status</code> = <code>Ativo</code> aqui mas a pagina diz Pendente,
                  o bug esta' no AuthContext. Se <code>status</code> = <code>Pendente</code> (ou vazio)
                  aqui, o admin precisa re-rodar <code>adminUpdateUserClaims</code>.
                </p>
              </>
            ) : (
              <p>Falha ao ler claims: <code>{diagnostic.error}</code></p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ghost-button auth-button"
            onClick={handleForceReload}
            disabled={reloading}
          >
            {reloading ? 'Recarregando...' : 'Forcar reload das claims'}
          </button>
          <button type="button" className="ghost-button auth-button" onClick={logout}>
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
