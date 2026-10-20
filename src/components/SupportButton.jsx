import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import Icon from './Icon'
import Modal from './Modal'
import { useToast } from './Toast'
import { getActiveProcess } from '../utils/activeProcessContext'
import {
  SUPPORT_TICKET_MAX_IMAGES,
  SUPPORT_TICKET_MAX_MESSAGE_LENGTH,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_TONES,
  createSupportTicket,
  listMySupportTickets,
} from '../services/supportTicketsRepository'
import { buildActionErrorMessage } from '../utils/errorMessages'
import { getFieldA11yProps, getFieldErrorId, focusField } from '../utils/fieldErrors'

// Evento global disparado pelo AppLayout quando o usuário clica numa
// notificação `support_ticket_resolved` — abre o modal com "Meus chamados"
// (o autor não tem acesso à rota /admin/suporte).
export const OPEN_SUPPORT_MODAL_EVENT = 'sq-comex:open-support-modal'

// Aba de suporte (backlog 2026-07-10): botão flutuante persistente no canto
// da tela (somente desktop, ver `.support-fab` em styles.css) que abre um
// modal para relatar bugs. Nome/email vêm do usuário logado; o usuário
// descreve o problema e pode anexar até 5 prints. Abaixo do formulário,
// os chamados já abertos pelo usuário aparecem em modo somente leitura.
//
// Refino visual F2 (Flutuantes.dc.html): no DESKTOP (>1040px) o modal vira o
// cartão do mock — título "Suporte" + link "Meus chamados" que ALTERNA entre o
// formulário e o histórico, campos Nome/Email (somente leitura, D9), chip
// "Contexto anexado: <página>" e "Cancelar" / "Enviar chamado". Tablet e mobile
// (<=1040px) mantêm o modal anterior (formulário + histórico empilhados).

// Rótulos legíveis das rotas para o chip de contexto (é o contextPage que o
// ticket já grava).
const CONTEXT_PAGE_LABELS = {
  '/': 'Dashboard operacional',
  '/news': 'Notícias',
  '/processos': 'Central de chegadas',
  '/notifications': 'Central de notificações',
  '/menu': 'Menu',
}

function describeContextPage(pathname) {
  if (CONTEXT_PAGE_LABELS[pathname]) return CONTEXT_PAGE_LABELS[pathname]
  if (pathname.startsWith('/admin')) return 'Centro administrativo'
  return pathname
}

function describeContextProcess(activeProcess) {
  if (!activeProcess) return null
  return (
    [activeProcess.processNumber, activeProcess.destination].filter(Boolean).join(' · ') ||
    activeProcess.name ||
    null
  )
}

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
  const location = useLocation()
  const toast = useToast()
  const fileInputRef = useRef(null)
  // UX-6a (item 7): foco inicial do modal vai pro textarea (era o botao
  // Fechar padrao do Modal).
  const messageRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [myTickets, setMyTickets] = useState([])
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)
  // UX-3b (D10): mensagem vazia/so-espacos e' erro INLINE (nao chama o
  // repositorio); > 5 prints tambem vira inline no input de arquivo (era
  // `toast.error`).
  const [messageError, setMessageError] = useState('')
  const [filesError, setFilesError] = useState('')
  // Refino F2: visão do modal no desktop ('form' | 'tickets') e breakpoint.
  const [view, setView] = useState('form')
  const [isCompactLayout, setIsCompactLayout] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(max-width: 1040px)')
    setIsCompactLayout(mq.matches)
    const handler = (event) => setIsCompactLayout(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  const isSubmittingRef = useRef(false)
  useEffect(() => {
    isSubmittingRef.current = isSubmitting
  }, [isSubmitting])

  useEffect(() => {
    function handleOpenRequest() {
      // Notificação de chamado resolvido/respondido: abre direto em "Meus chamados".
      setView('tickets')
      setIsOpen(true)
    }

    window.addEventListener(OPEN_SUPPORT_MODAL_EVENT, handleOpenRequest)
    return () => window.removeEventListener(OPEN_SUPPORT_MODAL_EVENT, handleOpenRequest)
  }, [])

  const handleClose = useCallback(() => {
    if (isSubmittingRef.current) return
    setIsOpen(false)
  }, [])

  function handleSelectFiles(event) {
    const selectedFiles = Array.from(event.target.files ?? [])
    const nextFiles = [...files, ...selectedFiles].slice(0, SUPPORT_TICKET_MAX_IMAGES)

    setFilesError(
      files.length + selectedFiles.length > SUPPORT_TICKET_MAX_IMAGES
        ? `Anexe no máximo ${SUPPORT_TICKET_MAX_IMAGES} imagens.`
        : ''
    )

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

    // UX-3b (D10): vazio/so-espacos bloqueia ANTES de chamar o repositorio -
    // `<form noValidate>` tira a bolha nativa do `required`, o erro agora e'
    // inline (foco no textarea).
    if (!message.trim()) {
      setMessageError('Descreva o que aconteceu antes de enviar o chamado.')
      focusField('support-message')
      return
    }
    setMessageError('')

    setIsSubmitting(true)

    try {
      // Captura a aba atual e o processo selecionado (se houver)
      // para dar contexto ao admin mesmo sem o usuário descrever.
      const contextPage = location.pathname
      const activeProcess = getActiveProcess()
      const contextProcessId = activeProcess?.id ?? location.state?.selectedProcessId ?? null
      const contextProcessName = describeContextProcess(activeProcess)

      const createdTicket = await createSupportTicket({ message, files, contextPage, contextProcessId, contextProcessName }, profile)

      setMyTickets((currentTickets) => [createdTicket, ...currentTickets])
      setMessage('')
      setFiles([])
      toast.success('Chamado enviado. A equipe administrativa foi notificada.')
      // Desktop: o histórico é uma visão alternada — mostra o chamado recém-criado.
      setView('tickets')
    } catch (error) {
      toast.error(buildActionErrorMessage('Não foi possível enviar o chamado.', error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const messagePlaceholder = isCompactLayout
    ? 'Descreva o problema: o que você estava fazendo, o que esperava e o que aconteceu.'
    : 'Conte o que você tentou fazer e o que apareceu na tela.'

  const messageField = (
    <label className="field">
      <span>O que aconteceu?</span>
      <textarea
        ref={messageRef}
        className="text-input"
        rows={5}
        maxLength={SUPPORT_TICKET_MAX_MESSAGE_LENGTH}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value)
          if (messageError) setMessageError('')
        }}
        placeholder={messagePlaceholder}
        {...getFieldA11yProps('support-message', messageError)}
      />
      {messageError ? (
        <small className="field-error" id={getFieldErrorId('support-message')} aria-hidden="true">
          {messageError}
        </small>
      ) : null}
    </label>
  )

  const filesField = (
    <div className="field">
      <span id="support-files-label">
        Prints (opcional, até {SUPPORT_TICKET_MAX_IMAGES} imagens de 5 MB)
      </span>
      <div className="file-picker">
        <label
          className={`ghost-button file-picker__button${
            files.length >= SUPPORT_TICKET_MAX_IMAGES ? ' file-picker__button--disabled' : ''
          }`}
        >
          <input
            ref={fileInputRef}
            className="file-picker__input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleSelectFiles}
            disabled={files.length >= SUPPORT_TICKET_MAX_IMAGES}
            aria-labelledby="support-files-label"
            {...getFieldA11yProps('support-files', filesError, ['support-files-status'])}
          />
          Adicionar imagens
        </label>
        <span className="file-picker__status" id="support-files-status">
          {files.length === 0
            ? 'Nenhuma imagem selecionada'
            : `${files.length} de ${SUPPORT_TICKET_MAX_IMAGES} imagens`}
        </span>
      </div>
      {filesError ? (
        <small className="field-error" id={getFieldErrorId('support-files')} aria-hidden="true">
          {filesError}
        </small>
      ) : null}
    </div>
  )

  const selectedFilesList =
    files.length > 0 ? (
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
    ) : null

  const ticketsList = isLoadingTickets ? (
    <p className="support-modal__muted">Carregando seus chamados...</p>
  ) : myTickets.length === 0 ? (
    <p className="support-modal__muted">Você ainda não abriu nenhum chamado.</p>
  ) : (
    <ul className="support-modal__tickets">
      {myTickets.map((ticket) => (
        <li key={ticket.id}>
          <div className="support-modal__ticket-head">
            <span
              className={`status-tag status-tag--${SUPPORT_TICKET_STATUS_TONES[ticket.status] ?? 'warn'}`}
            >
              {SUPPORT_TICKET_STATUS_LABELS[ticket.status] ?? 'Aberto'}
            </span>
            <span className="support-modal__muted">{formatTicketDate(ticket.createdAt)}</span>
          </div>
          <p>{ticket.message}</p>

          {ticket.replies.length > 0 ? (
            <ul className="support-modal__replies">
              {ticket.replies.map((reply) => (
                <li key={reply.id} className="support-modal__reply">
                  <span className="support-modal__muted">
                    {reply.authorName} respondeu em {formatTicketDate(reply.createdAt)}
                  </span>
                  <p>{reply.message}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {ticket.status === 'resolvido' && ticket.resolutionMessage ? (
            <div className="support-modal__reply support-modal__reply--resolution">
              <span className="support-modal__muted">Resposta da equipe</span>
              <p>{ticket.resolutionMessage}</p>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )

  const contextLabel = [
    describeContextPage(location.pathname),
    isOpen ? describeContextProcess(getActiveProcess()) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const fab = (
    <div className="support-fab">
      <button
        type="button"
        className="support-fab__trigger"
        onClick={() => {
          setView('form')
          setIsOpen(true)
        }}
        aria-haspopup="dialog"
        aria-label="Abrir suporte"
        title="Relatar um problema"
      >
        <Icon name={isCompactLayout ? 'help' : 'message'} size={18} strokeWidth={1.9} />
        <span>Suporte</span>
      </button>
    </div>
  )

  if (isCompactLayout) {
    // Tablet / mobile (<=1040px): modal anterior, intacto.
    return (
      <>
        {fab}

        <Modal open={isOpen} onClose={handleClose} title="Suporte" wide initialFocusRef={messageRef}>
          <div className="support-modal">
            <p className="support-modal__lead">
              Encontrou um erro ou comportamento estranho? Descreva o que aconteceu e, se possível,
              anexe prints. A equipe administrativa recebe o chamado na hora.
            </p>

            <form className="detail-stack" onSubmit={handleSubmit} noValidate>
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

              {messageField}
              {filesField}
              {selectedFilesList}

              <div className="action-row">
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando...' : 'Enviar chamado'}
                </button>
              </div>
            </form>

            <div className="support-modal__history">
              <h3>Meus chamados</h3>
              {ticketsList}
            </div>
          </div>
        </Modal>
      </>
    )
  }

  return (
    <>
      {fab}

      <Modal
        open={isOpen}
        onClose={handleClose}
        ariaLabel="Suporte"
        className="support-modal-shell"
        initialFocusRef={view === 'form' ? messageRef : undefined}
      >
        <div className="support-modal support-modal--desktop">
          <div className="support-modal__head">
            <h2 className="support-modal__title">Suporte</h2>
            <button
              type="button"
              className="support-modal__switch"
              onClick={() => setView((current) => (current === 'form' ? 'tickets' : 'form'))}
            >
              {view === 'form' ? 'Meus chamados' : 'Novo chamado'}
            </button>
          </div>

          {view === 'form' ? (
            <form className="support-modal__form" onSubmit={handleSubmit} noValidate>
              <div className="support-modal__field">
                <label htmlFor="support-name">Nome</label>
                <input
                  id="support-name"
                  className="support-modal__input"
                  value={profile?.name ?? 'Usuário'}
                  readOnly
                />
              </div>
              <div className="support-modal__field">
                <label htmlFor="support-email">Email</label>
                <input
                  id="support-email"
                  className="support-modal__input"
                  value={profile?.email ?? 'Sem email'}
                  readOnly
                />
              </div>

              {messageField}
              {filesField}
              {selectedFilesList}

              <div className="support-modal__context">
                <Icon name="image" size={16} strokeWidth={1.9} aria-hidden="true" />
                <span>Contexto anexado: {contextLabel}</span>
              </div>

              <div className="support-modal__actions">
                <button type="button" className="support-modal__cancel" onClick={handleClose}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={isSubmitting}>
                  {isSubmitting ? 'Enviando...' : 'Enviar chamado'}
                </button>
              </div>
            </form>
          ) : (
            <div className="support-modal__history support-modal__history--view">
              <h3>Meus chamados</h3>
              {ticketsList}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
