import { useEffect, useRef, useState } from 'react'
import useAuth from '../hooks/useAuth'
import Icon from './Icon'
import Modal from './Modal'
import { useToast } from './Toast'
import {
  SUPPORT_TICKET_MAX_IMAGES,
  SUPPORT_TICKET_MAX_MESSAGE_LENGTH,
  createSupportTicket,
  listMySupportTickets,
} from '../services/supportTicketsRepository'

// Aba de suporte (backlog 2026-07-10): botão flutuante persistente no canto
// da tela (somente desktop, ver `.support-fab` em styles.css) que abre um
// modal para relatar bugs. Nome/email vêm do usuário logado; o usuário
// descreve o problema e pode anexar até 5 prints. Abaixo do formulário,
// os chamados já abertos pelo usuário aparecem em modo somente leitura.

function formatTicketDate(isoDate) {
  if (!isoDate) return '—'
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return '—'

  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SupportButton() {
  const { profile } = useAuth()
  const toast = useToast()
  const fileInputRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [myTickets, setMyTickets] = useState([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)

  useEffect(() => {
    if (!isOpen || !profile?.uid) return

    let isMounted = true
    setIsLoadingTickets(true)

    listMySupportTickets(profile.uid)
      .then((tickets) => {
        if (isMounted) setMyTickets(tickets)
      })
      .catch((error) => {
        console.error('Falha ao carregar chamados de suporte.', error)
      })
      .finally(() => {
        if (isMounted) setIsLoadingTickets(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, profile?.uid])

  function handleClose() {
    if (isSubmitting) return
    setIsOpen(false)
  }

  function handleSelectFiles(event) {
    const selectedFiles = Array.from(event.target.files ?? [])
    const nextFiles = [...files, ...selectedFiles].slice(0, SUPPORT_TICKET_MAX_IMAGES)

    if (files.length + selectedFiles.length > SUPPORT_TICKET_MAX_IMAGES) {
      toast.error(`Anexe no máximo ${SUPPORT_TICKET_MAX_IMAGES} imagens.`)
    }

    setFiles(nextFiles)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleRemoveFile(index) {
    setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)

    try {
      const createdTicket = await createSupportTicket({ message, files }, profile)

      setMyTickets((currentTickets) => [createdTicket, ...currentTickets])
      setMessage('')
      setFiles([])
      toast.success('Chamado enviado. A equipe administrativa foi notificada.')
    } catch (error) {
      toast.error(error?.message ?? 'Não foi possível enviar o chamado.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="support-fab">
        <button
          type="button"
          className="support-fab__trigger"
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-label="Abrir suporte"
          title="Relatar um problema"
        >
          <Icon name="help" size={18} />
          <span>Suporte</span>
        </button>
      </div>

      <Modal open={isOpen} onClose={handleClose} title="Suporte" wide>
        <div className="support-modal">
          <p className="support-modal__lead">
            Encontrou um erro ou comportamento estranho? Descreva o que aconteceu e, se possível,
            anexe prints. A equipe administrativa recebe o chamado na hora.
          </p>

          <form className="detail-stack" onSubmit={handleSubmit}>
            <div className="support-modal__identity">
              <div>
                <span className="detail-label">Nome</span>
                <p>{profile?.name ?? 'Usuário'}</p>
              </div>
              <div>
                <span className="detail-label">Email</span>
                <p>{profile?.email ?? 'Sem email'}</p>
              </div>
            </div>

            <label className="field">
              <span>O que aconteceu?</span>
              <textarea
                className="text-input"
                rows={5}
                maxLength={SUPPORT_TICKET_MAX_MESSAGE_LENGTH}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Descreva o problema: o que você estava fazendo, o que esperava e o que aconteceu."
                required
              />
            </label>

            <label className="field">
              <span>Prints (opcional, até {SUPPORT_TICKET_MAX_IMAGES} imagens de 5 MB)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleSelectFiles}
                disabled={files.length >= SUPPORT_TICKET_MAX_IMAGES}
              />
            </label>

            {files.length > 0 ? (
              <ul className="support-modal__files">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleRemoveFile(index)}
                      aria-label={`Remover ${file.name}`}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="action-row">
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar chamado'}
              </button>
            </div>
          </form>

          <div className="support-modal__history">
            <h3>Meus chamados</h3>
            {isLoadingTickets ? (
              <p className="support-modal__muted">Carregando seus chamados...</p>
            ) : myTickets.length === 0 ? (
              <p className="support-modal__muted">Você ainda não abriu nenhum chamado.</p>
            ) : (
              <ul className="support-modal__tickets">
                {myTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <div className="support-modal__ticket-head">
                      <span
                        className={`status-tag status-tag--${ticket.status === 'resolvido' ? 'ok' : 'warn'}`}
                      >
                        {ticket.status === 'resolvido' ? 'Resolvido' : 'Aberto'}
                      </span>
                      <span className="support-modal__muted">{formatTicketDate(ticket.createdAt)}</span>
                    </div>
                    <p>{ticket.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
