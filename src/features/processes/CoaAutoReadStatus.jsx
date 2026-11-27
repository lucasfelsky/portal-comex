// S11-E: linha discreta da leitura automática do COA no card/célula (sem modal, sem toast, sem travar o envio):
// "Lendo os COAs: 1 de 3. Cada arquivo pode levar até 2 minutos." enquanto a fila trabalha. O resultado de cada
// arquivo aparece no selo da lista (D-20), recarregado a cada arquivo.
//
// S11-J: o aviso (fila interrompida, leitura não iniciada, relatório fechado) é um botão-ícone com pop-up
// (`CoaAutoReadNotice`), com o mesmo texto de antes; a linha de andamento continua texto.

import CoaAutoReadNotice from './CoaAutoReadNotice'

export default function CoaAutoReadStatus({ autoRead }) {
  if (!autoRead?.status && !autoRead?.notice) return null
  return (
    <>
      {autoRead.status ? (
        <small className="field-hint coa-auto-read" role="status" aria-live="polite">
          {autoRead.status}
        </small>
      ) : null}
      {autoRead.notice ? <CoaAutoReadNotice text={autoRead.notice} /> : null}
    </>
  )
}
