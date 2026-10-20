import { useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatShortStamp } from './shortStamp'

// F10.1 (backlog 2026-07-12): painel de mensagens/dúvidas do processo,
// extraído do ProcessesPage (god component de 2.164 linhas). Componente
// de apresentação — o estado e os handlers de dados continuam na página,
// passados por props; o painel guarda apenas o estado local do dialogo
// de confirmação de exclusão de mensagem (UX-1).
export const MAX_PROCESS_MESSAGES = 20

export default function ProcessMessagesPanel({
  messages,
  isLoading,
  messageDraft,
  onMessageDraftChange,
  onSubmit,
  isSending,
  currentUserName,
  messageLimitReached,
  remainingMessages,
  canSendMessages,
  showRemainingMessages,
  canDeleteMessages,
  deletingMessageId,
  onDeleteMessage,
  // Refino F4c: `variant="desktop"` (Processo.dc.html) troca os cartoes por baloes com
  // avatar e poe o formulario numa coluna lateral; `currentUserId` marca as
  // mensagens proprias (balao a direita). Sem a prop o render e' o de sempre.
  variant,
  currentUserId,
}) {
  const [pendingMessage, setPendingMessage] = useState(null)
  const [confirmError, setConfirmError] = useState('')

  const confirmDialog = (
    <ConfirmDialog
      tone="danger"
      open={Boolean(pendingMessage)}
      busy={Boolean(pendingMessage) && deletingMessageId === pendingMessage.id}
      error={confirmError}
      title="Excluir mensagem?"
      message={
        pendingMessage
          ? `A mensagem de ${pendingMessage.authorName} (${formatDateTime(pendingMessage.createdAt)}) será excluída do histórico do processo. Esta ação não pode ser desfeita.`
          : ''
      }
      confirmLabel="Excluir mensagem"
      busyLabel="Excluindo..."
      onConfirm={async () => {
        if (await onDeleteMessage(pendingMessage, setConfirmError)) {
          setPendingMessage(null)
        }
      }}
      onCancel={() => {
        setPendingMessage(null)
        setConfirmError('')
      }}
    />
  )

  if (variant === 'desktop') {
    const countLabel = messages.length === 1 ? '1 mensagem' : `${messages.length} mensagens`
    return (
      <div className="pdv-msgs">
        <section className="pdv-section pdv-msgs__thread" aria-label="Conversa do processo">
          <div className="pdv-items__head">
            <div className="pdv-items__titles">
              <h3 className="pdv-section__title pdv-items__title">Mensagens para dúvidas</h3>
              <p className="pdv-items__sub">Histórico vinculado ao processo.</p>
            </div>
            <span className="inline-badge pdv-items__count">{countLabel}</span>
          </div>
          <div className="pdv-msgs__list">
            {isLoading ? (
              <div className="empty-state" role="status">
                <strong>Carregando mensagens</strong>
                <p>Buscando o histórico deste processo.</p>
              </div>
            ) : messages.length > 0 ? (
              messages.map((message) => {
                const isOwn = Boolean(currentUserId) && message.authorId === currentUserId
                const initial = String(message.authorName ?? '?').trim().charAt(0).toUpperCase() || '?'
                return (
                  <article key={message.id} className={`pdv-msg${isOwn ? ' pdv-msg--own' : ''}`}>
                    <span className="pdv-msg__avatar" aria-hidden="true">
                      {initial}
                    </span>
                    <div className="pdv-msg__bubble">
                      <div className="pdv-msg__meta">
                        <span className="pdv-msg__who" title={formatDateTime(message.createdAt)}>
                          <strong>{message.authorName}</strong> · {formatShortStamp(message.createdAt)}
                        </span>
                        {canDeleteMessages ? (
                          <button
                            type="button"
                            className="pdv-msg__delete"
                            onClick={() => {
                              setConfirmError('')
                              setPendingMessage(message)
                            }}
                            disabled={deletingMessageId === message.id}
                          >
                            {deletingMessageId === message.id ? 'Excluindo...' : 'Excluir'}
                          </button>
                        ) : null}
                      </div>
                      <p className="pdv-msg__text">{message.content}</p>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="empty-state" role="status">
                <strong>Nenhuma dúvida registrada</strong>
                <p>As interações do processo passam a ficar salvas neste histórico.</p>
              </div>
            )}
          </div>
        </section>

        <section className="pdv-section pdv-msgs__composer">
          <label className="pdv-msgs__label" htmlFor="pdv-new-message">
            Nova mensagem
          </label>
          <textarea
            id="pdv-new-message"
            className="text-input text-area pdv-msgs__textarea"
            rows={5}
            value={messageDraft}
            onChange={(event) => onMessageDraftChange(event.target.value)}
            placeholder={`Escreva uma dúvida ou atualização como ${currentUserName}.`}
            disabled={!canSendMessages}
          />
          {!canSendMessages ? (
            <div className="pdv-msgs__limit" role="status">
              <strong>Limite atingido</strong>
              <span>Este processo atingiu o limite de {MAX_PROCESS_MESSAGES} mensagens para este perfil.</span>
            </div>
          ) : showRemainingMessages ? (
            <p className="pdv-msgs__quota">
              {remainingMessages === 1
                ? 'Resta 1 mensagem disponível nesta conversa para este perfil.'
                : `Restam ${remainingMessages} mensagens disponíveis nesta conversa para este perfil.`}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-button pdv-msgs__submit"
            onClick={onSubmit}
            disabled={isSending || messageLimitReached}
          >
            {isSending ? 'Enviando...' : 'Registrar mensagem'}
          </button>
        </section>
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading process-detail-card-heading--end">
        <div>
          <span className="detail-label">Mensagens para dúvidas</span>
          <p>Histórico vinculado ao processo.</p>
        </div>
        <span className="inline-badge">{messages.length === 1 ? '1 mensagem' : `${messages.length} mensagens`}</span>
      </div>

      <div className="process-messages-list">
        {isLoading ? (
          <div className="empty-state" role="status">
            <strong>Carregando mensagens</strong>
            <p>Buscando o histórico deste processo.</p>
          </div>
        ) : messages.length > 0 ? (
          messages.map((message) => (
            <article key={message.id} className="process-message-card">
              <div className="process-message-card__meta">
                <div className="process-message-card__meta-content">
                  <strong>{message.authorName}</strong>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                {canDeleteMessages ? (
                  <button
                    type="button"
                    className="ghost-button ghost-button--outline process-message-card__delete"
                    onClick={() => {
                      setConfirmError('')
                      setPendingMessage(message)
                    }}
                    disabled={deletingMessageId === message.id}
                  >
                    {deletingMessageId === message.id ? 'Excluindo...' : 'Excluir'}
                  </button>
                ) : null}
              </div>
              <p>{message.content}</p>
            </article>
          ))
        ) : (
          <div className="empty-state" role="status">
            <strong>Nenhuma dúvida registrada</strong>
            <p>As interações do processo passam a ficar salvas neste histórico.</p>
          </div>
        )}
      </div>

      <label className="field">
        <span>Nova mensagem</span>
        <textarea
          className="text-input text-area"
          value={messageDraft}
          onChange={(event) => onMessageDraftChange(event.target.value)}
          placeholder={`Escreva uma dúvida ou atualização como ${currentUserName}.`}
          disabled={!canSendMessages}
        />
      </label>

      {!canSendMessages ? (
        <div className="detail-card detail-card--warning process-message-limit-card">
          <span className="detail-label">Limite atingido</span>
          <p>Este processo atingiu o limite de {MAX_PROCESS_MESSAGES} mensagens para este perfil.</p>
        </div>
      ) : showRemainingMessages ? (
        <p className="process-message-limit-text">
          {remainingMessages === 1
            ? 'Resta 1 mensagem disponível nesta conversa para este perfil.'
            : `Restam ${remainingMessages} mensagens disponíveis nesta conversa para este perfil.`}
        </p>
      ) : null}

      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          onClick={onSubmit}
          disabled={isSending || messageLimitReached}
        >
          {isSending ? 'Enviando...' : 'Registrar mensagem'}
        </button>
      </div>

      {confirmDialog}
    </div>
  )
}
