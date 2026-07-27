import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { useToast } from './Toast'
import { saveNotificationPreferences } from '../services/usersRepository'

// F9 (backlog 2026-07-12): preferências de notificação por usuário —
// grid tipo × canal. Substitui o sino de FCM que ficava duplicado no
// painel de notificações: o push agora é um CANAL aqui dentro, e a
// permissão do navegador só é pedida quando o usuário liga um toggle de
// push (gesto explícito — prompt no load é punido pelos navegadores e um
// "Bloquear" é quase irreversível).
//
// Default LIGADO: ausência de preferência = recebe tudo (mesma semântica
// do shouldNotify nas functions).

export const PREFERENCE_TYPES = [
  { key: 'processos', label: 'Processos', hint: 'Mensagens, atualizações e pós-recebimento' },
  { key: 'noticias', label: 'Notícias', hint: 'Publicações manuais e automáticas' },
  { key: 'suporte', label: 'Suporte', hint: 'Chamados abertos e resolvidos' },
]

export const PREFERENCE_CHANNELS = [
  { key: 'inApp', label: 'No portal' },
  { key: 'email', label: 'E-mail' },
  { key: 'push', label: 'Navegador' },
]

export function buildEffectivePreferences(stored) {
  const effective = {}
  for (const type of PREFERENCE_TYPES) {
    effective[type.key] = {}
    for (const channel of PREFERENCE_CHANNELS) {
      // false explícito desliga; qualquer outra coisa = ligado.
      effective[type.key][channel.key] = stored?.[type.key]?.[channel.key] !== false
    }
  }
  return effective
}

export default function NotificationPreferencesModal({ open, onClose, profile, fcm }) {
  const toast = useToast()
  const [draft, setDraft] = useState(() => buildEffectivePreferences(profile?.notificationPreferences))
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(buildEffectivePreferences(profile?.notificationPreferences))
    }
  }, [open, profile?.notificationPreferences])

  const pushEnabled = fcm?.status === 'granted'
  const pushSupported = Boolean(fcm?.supported)
  const anyPushOn = useMemo(
    () => PREFERENCE_TYPES.some((type) => draft[type.key]?.push),
    [draft]
  )

  function toggle(typeKey, channelKey) {
    setDraft((current) => ({
      ...current,
      [typeKey]: { ...current[typeKey], [channelKey]: !current[typeKey][channelKey] },
    }))
  }

  async function handleSave() {
    if (!profile?.uid || isSaving) return
    setIsSaving(true)

    try {
      // Ligar qualquer push exige permissão do navegador — pedida AQUI,
      // no clique de salvar (gesto do usuário).
      if (anyPushOn && pushSupported && !pushEnabled) {
        const { token, status } = await fcm.enable()
        if (!token) {
          // 'denied'/'default' = o usuário/navegador recusou a permissão.
          // Qualquer outro status (ex. 'error') é falha técnica (VAPID key,
          // service worker, API do FCM) com a permissão JÁ concedida — dizer
          // "permissão não concedida" nesse caso confundia o diagnóstico
          // (o usuário reportava "não deu permissão" quando tinha dado).
          toast.error(
            status === 'denied' || status === 'default'
              ? 'Permissão de notificações do navegador não concedida — os canais "Navegador" seguem inativos.'
              : 'Não foi possível ativar as notificações do navegador agora (falha técnica, não é a permissão). Os canais "Navegador" seguem inativos — tente novamente mais tarde.'
          )
        }
      }
      if (!anyPushOn && pushEnabled) {
        await fcm.disable()
      }

      await saveNotificationPreferences(profile.uid, draft)
      toast.success('Preferências de notificação salvas.')
      onClose()
    } catch (error) {
      console.error('Falha ao salvar preferências de notificação.', error)
      toast.error('Não foi possível salvar as preferências.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Preferências de notificação">
      <div className="notification-prefs">
        <p className="notification-prefs__lead">
          Escolha o que você recebe e por onde. Tudo vem ligado por padrão.
        </p>

        <table className="notification-prefs__grid">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              {PREFERENCE_CHANNELS.map((channel) => (
                <th key={channel.key} scope="col">
                  {channel.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREFERENCE_TYPES.map((type) => (
              <tr key={type.key}>
                <th scope="row">
                  <span className="notification-prefs__type">{type.label}</span>
                  <span className="notification-prefs__hint">{type.hint}</span>
                </th>
                {PREFERENCE_CHANNELS.map((channel) => {
                  const isPushColumn = channel.key === 'push'
                  const disabled = isPushColumn && !pushSupported
                  return (
                    <td key={channel.key}>
                      <input
                        type="checkbox"
                        checked={draft[type.key]?.[channel.key] ?? true}
                        disabled={disabled || isSaving}
                        onChange={() => toggle(type.key, channel.key)}
                        aria-label={`${type.label}: ${channel.label}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {!pushSupported ? (
          <p className="notification-prefs__hint">
            Notificações do navegador não estão disponíveis neste dispositivo/navegador.
          </p>
        ) : null}

        <div className="action-row">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar preferências'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
