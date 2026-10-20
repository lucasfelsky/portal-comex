import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import Spinner from '../../components/Spinner'
import { getStatusTagClass } from './processStatusView'
import { ProcessFormContext } from './processFormContext'

// Refino visual F4d — formulario de criar/editar processo como MODAL no desktop
// (>= 1041px), identico ao ProcessoForm.dc.html: dialogo de 22px de raio sobre o
// scrim, cabecalho (titulo + chip de categoria + tag de status + "nome · PO" +
// fechar), stepper de 6 barras, corpo rolavel ("PASSO N DE 6" + titulo do passo +
// campos) e rodape fixo (Voltar | Salvar + Avancar). Presentacional: todo o
// estado (passo atual, rascunho, validacao, foco) fica no ProcessForm, que decide
// entre esta arvore e a legada (tablet/mobile) por matchMedia.
//
// O <Modal> cuida de Esc, focus trap, restauracao de foco e bloqueio de scroll
// (em `bare`: sem o cabecalho padrao). Esc e o "x" chamam `onClose`, a mesma
// rotina do "Voltar para lista" legado (`requestLeave` -> "Descartar alteracoes?").
// O scrim NAO fecha (arrastar a selecao de texto para fora geraria um click nele).

function getSubtitle({ viewMode, draft }) {
  const name = String(draft?.name ?? '').trim()
  const parts = [name || (viewMode === 'create' ? 'Novo processo' : 'Sem nome')]
  if (draft?.category === 'CONSOLIDADO') {
    const count = Array.isArray(draft?.purchaseOrders) ? draft.purchaseOrders.length : 0
    if (count > 0) parts.push(`${count} PO${count === 1 ? '' : 's'}`)
  } else if (String(draft?.processNumber ?? '').trim()) {
    parts.push(`PO ${String(draft.processNumber).trim()}`)
  }
  return parts.join(' · ')
}

export default function ProcessFormDialog({
  viewMode,
  draft,
  steps,
  currentStep,
  onSelectStep,
  stepHasError,
  errorCount,
  derivedProcessStatus,
  displayedProcessStatus,
  isSaving,
  isFirstStep,
  isLastStep,
  onClose,
  onBack,
  onNext,
  onSave,
  onClickCapture,
  panelRef,
  initialFocusRef,
  contextValue,
  children,
}) {
  const isCreate = viewMode === 'create'
  const title = isCreate ? 'Criar processo' : 'Editar processo'
  const saveLabel = isCreate ? 'Criar processo' : 'Salvar alterações'
  const saveContent = isSaving ? (
    <>
      <Spinner size={14} label="Salvando" /> Salvando...
    </>
  ) : (
    saveLabel
  )

  return (
    <Modal
      open
      bare
      onClose={onClose}
      ariaLabel={title}
      className="process-form-modal"
      closeOnBackdrop={false}
      initialFocusRef={initialFocusRef}
    >
      <ProcessFormContext.Provider value={contextValue}>
        <div className="process-form process-form--dialog">
          <header className="pfd-header">
            <div className="pfd-header__top">
              <div className="pfd-header__titles">
                <div className="pfd-header__title-row">
                  <h2 className="pfd-title">{title}</h2>
                  <span className="pfd-chip" title={draft.category || 'Sem categoria'}>
                    {draft.category || 'Sem categoria'}
                  </span>
                  <span className={getStatusTagClass(derivedProcessStatus)} title={displayedProcessStatus}>
                    {displayedProcessStatus}
                  </span>
                </div>
                <span className="pfd-subtitle">{getSubtitle({ viewMode, draft })}</span>
              </div>
              <button type="button" className="pfd-close" aria-label="Fechar" onClick={onClose}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <ol className="pfd-steps" aria-label="Etapas do cadastro">
              {steps.map((stepDef, index) => {
                const hasError = stepHasError(stepDef.key)
                const state = index < currentStep ? 'done' : index === currentStep ? 'current' : 'todo'
                return (
                  <li key={stepDef.key} className={`pfd-step pfd-step--${state}`}>
                    <button
                      type="button"
                      className="pfd-step__button"
                      aria-current={index === currentStep ? 'step' : undefined}
                      aria-label={hasError ? `${stepDef.label}, contém erro` : undefined}
                      onClick={() => onSelectStep(index)}
                    >
                      <span className="pfd-step__bar" aria-hidden="true" />
                      <span className="pfd-step__label">
                        <span className="pfd-step__num" aria-hidden="true">{index + 1}</span>
                        {stepDef.label}
                        {hasError ? <span className="wizard-step__error-dot" aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </header>

          <div className="pfd-body" ref={panelRef}>
            <div className="pfd-body__head">
              <span className="pfd-eyebrow">
                PASSO {currentStep + 1} DE {steps.length}
              </span>
              <h3 className="pfd-step-title">{steps[currentStep].label}</h3>
            </div>
            <div className="detail-stack wizard-panel pfd-panel" onClickCapture={onClickCapture}>
              {children}
            </div>
          </div>

          <footer className="pfd-footer">
            <button type="button" className="ghost-button pfd-footer__back" onClick={onBack} disabled={isFirstStep}>
              <Icon name="chevron-left" size={14} strokeWidth={2.2} /> Voltar
            </button>
            {errorCount > 0 ? (
              <p id="process-form-error-summary" className="field-error pfd-footer__errors" role="alert" tabIndex={-1}>
                {errorCount === 1
                  ? 'Corrija 1 campo destacado antes de salvar.'
                  : `Corrija ${errorCount} campos destacados antes de salvar.`}
              </p>
            ) : null}
            <div className="pfd-footer__actions">
              {isLastStep ? (
                <button type="button" className="primary-button" onClick={onSave} disabled={isSaving}>
                  {saveContent}
                </button>
              ) : (
                <>
                  <button type="button" className="secondary-button" onClick={onSave} disabled={isSaving}>
                    {saveContent}
                  </button>
                  <button type="button" className="primary-button" onClick={onNext}>
                    Avançar <Icon name="chevron-right" size={14} strokeWidth={2.2} />
                  </button>
                </>
              )}
            </div>
          </footer>
        </div>
      </ProcessFormContext.Provider>
    </Modal>
  )
}
