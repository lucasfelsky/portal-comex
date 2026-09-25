import { useState } from 'react'
import { formatDateTime } from '../../utils/dateFormat'
import ConfirmDialog from '../../components/ConfirmDialog'

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
}) {
  const [pendingMessage, setPendingMessage] = useState(null)
  const [confirmError, setConfirmError] = useState('')

  return (
    <div className="detail-card">
      <div className="card-heading process-detail-card-heading">
        <div>
          <span className="detail-label">Mensagens para dúvidas</span>
          <p>Histórico vinculado ao processo.</p>
        </div>
        <span className="inline-badge">{messages.length} mensagens</span>
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
                    className="ghost-button process-message-card__delete"
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
          Resta{remainingMessages === 1 ? '' : 'm'} {remainingMessages} mensagem{remainingMessages === 1 ? '' : 'ns'} disponível{remainingMessages === 1 ? '' : 'is'} nesta conversa para este perfil.
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
    </div>
  )
}
