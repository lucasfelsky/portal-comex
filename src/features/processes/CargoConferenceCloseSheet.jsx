import { useRef } from 'react'
import Icon from '../../components/Icon'
import Modal from '../../components/Modal'

// S9-F do Relatório de Carga: folha "Salvar e fechar conferência" do celular (mock aprovado). Mostra o que o fechamento
// faz e as pendências (não bloqueiam: "Dá para fechar assim."). Enquanto `busy`, Esc, fundo e "x" não fecham: o Excel e o
// aviso já podem estar a caminho. O foco inicial vai para "Cancelar" (o gesto seguro).

export default function CargoConferenceCloseSheet({ open, pendings = [], busy = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      title="Salvar e fechar conferência"
      closeOnBackdrop={!busy}
      initialFocusRef={cancelRef}
    >
      <div className="ccf-sheet">
        <p className="ccf-sub">
          Isso gera o Excel da conferência, anexa ao processo como nova versão e avisa os destinatários do Relatório de
          Carga. Os campos ficam travados até o COMEX reabrir.
        </p>
        {pendings.length > 0 ? (
          <>
            <ul className="ccf-pend" aria-label="Pendências">
              {pendings.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p className="ccf-sub">Dá para fechar assim.</p>
          </>
        ) : (
          <ul className="ccf-pend" aria-label="Pendências">
            <li className="ccf-pend__ok">
              <Icon name="check" size={16} strokeWidth={2.4} />
              Nada pendente.
            </li>
          </ul>
        )}
        <div className="ccf-sheet__actions">
          <button type="button" className="secondary-button" ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Fechando…' : 'Fechar conferência'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
