import { useId, useState } from 'react'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatCargoNumber } from './cargoReportFormModel'
import { formatCargoKgText } from './cargoReportGroups'
import { CargoInfoIcon } from './CargoReportRefreshPanel'

// S11-C do Relatório de Carga: prévia do "Ler COAs". Fica DENTRO do card Itens (nada de camada flutuante), com o mesmo
// visual da prévia do "Atualizar". Só PROPÕE: a caixa de cada item vem marcada só quando é seguro e nada vai para o
// formulário antes de "Aplicar selecionadas". Todo texto vindo do COA (produto, lote, PO, avisos) é DADO: é
// renderizado como texto (React), nunca como HTML, link ou instrução.

const CONFIDENCE_LABELS = { high: 'alta', medium: 'média', low: 'baixa' }

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function describeSum(proposal) {
  const { sumState, sumKg, itemKg, lots } = proposal
  if (sumState === 'ok') return `Soma dos lotes: ${formatCargoKgText(sumKg)} de ${formatCargoKgText(itemKg)}. Fecha certinho.`
  if (sumState === 'short' || sumState === 'over') {
    const difference = formatCargoKgText(Math.round(Math.abs(sumKg - itemKg) * 1000) / 1000)
    return `Soma dos lotes: ${formatCargoKgText(sumKg)} de ${formatCargoKgText(itemKg)}. ${
      sumState === 'short' ? 'Falta' : 'Sobra'
    } ${difference}. Se você marcar, entram as quantidades do COA.`
  }
  if (sumState === 'incomplete') {
    const missing = lots.filter((lot) => lot.quantityKg === null).length
    return missing === 1
      ? '1 lote sem quantidade no COA: a linha fica para você preencher.'
      : `${missing} lotes sem quantidade no COA: as linhas ficam para você preencher.`
  }
  if (sumState === 'unknown') return 'O item não tem quantidade no relatório; as quantidades do COA entram como estão.'
  return ''
}

function LotsTable({ lots }) {
  return (
    <div className="crf-coa__lots-wrap">
      <table className="crf-coa__lots">
        <thead>
          <tr>
            <th scope="col">Lote</th>
            <th scope="col">Qtd (kg)</th>
            <th scope="col">Arquivo · pág.</th>
            <th scope="col">Confiança</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot, index) => (
            <tr key={`${lot.supplierLot}-${index}`}>
              <td>{lot.supplierLot}</td>
              <td>{lot.quantityKg === null ? 'sem quantidade' : formatCargoNumber(lot.quantityKg, { maxDecimals: 3 })}</td>
              <td>{`${lot.documentName}${lot.page ? ` · pág. ${lot.page}` : ''}`}</td>
              <td>
                <span className={`crf-coa__conf crf-coa__conf--${lot.confidence}`}>{CONFIDENCE_LABELS[lot.confidence] ?? 'baixa'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CargoReportCoaPanel({ coa }) {
  const { state, progress, panel, error, busy, toggle, link, apply, dismiss, rereadAll } = coa
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const baseId = useId()

  if (state === 'idle') return null

  if (state === 'reading') {
    const current = Math.min(progress.done + 1, Math.max(progress.total, 1))
    return (
      <div className="crf-note crf-note--info crf-refresh crf-coa" role="status" aria-live="polite">
        <CargoInfoIcon />
        <div className="crf-refresh__body">
          {progress.total > 0
            ? `Lendo os COAs: ${current} de ${plural(progress.total, 'arquivo', 'arquivos')}. Cada arquivo pode levar até 2 minutos.`
            : 'Procurando os COAs do processo…'}
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="error-banner error-banner--retry crf-coa__fail" role="alert">
        <span>{error}</span>
        <button type="button" className="secondary-button" onClick={dismiss}>
          Fechar
        </button>
      </div>
    )
  }

  if (!panel) return null
  const { proposals, selected, manualLinks, documentNotes, certificateCount, fileCount, pdfCount, docCount } = panel
  const selectedSet = new Set(selected)

  if (docCount === 0) {
    return (
      <div className="crf-note crf-note--info crf-refresh crf-coa" role="region" aria-label="Leitura dos COAs">
        <CargoInfoIcon />
        <div className="crf-refresh__body">
          Nenhum COA anexado a este processo. Envie os COAs na aba Documentos (COA Original).
        </div>
        <button type="button" className="secondary-button crf-refresh__close" onClick={dismiss}>
          Fechar
        </button>
      </div>
    )
  }

  const isUpToDate = certificateCount > 0 && proposals.length === 0
  const headline =
    certificateCount === 0
      ? 'Nenhum certificado foi lido nos COAs.'
      : `Leitura dos COAs: ${plural(certificateCount, 'certificado', 'certificados')} em ${plural(fileCount, 'arquivo', 'arquivos')}.`

  return (
    <div
      className={`crf-note ${isUpToDate ? 'crf-note--ok' : 'crf-note--warn'} crf-refresh crf-coa`}
      role="region"
      aria-label="Leitura dos COAs"
    >
      <CargoInfoIcon />
      <div className="crf-refresh__body">
        {isUpToDate ? (
          <p>
            <b>Tudo em dia.</b> Os lotes do relatório já batem com os COAs.
          </p>
        ) : (
          <p>
            <b>{headline}</b>{' '}
            {proposals.length > 0
              ? 'Escolha o que aplicar; o que você editou à mão nunca é sobrescrito sem aparecer aqui.'
              : ''}
          </p>
        )}
        {error ? (
          <p className="crf-coa__error" role="alert">
            {`Leitura interrompida: ${error}`}
          </p>
        ) : null}
        {documentNotes.length > 0 ? (
          <ul className="crf-coa__docnotes" aria-label="Avisos por arquivo">
            {documentNotes.map((note, index) => (
              <li key={`${note.documentId}-${note.kind}-${index}`} className={`crf-coa__docnote crf-coa__docnote--${note.kind}`}>
                {note.message}
              </li>
            ))}
          </ul>
        ) : null}

        {proposals.length > 0 ? (
          <div className="crf-diff">
            {proposals.map((proposal, position) => {
              const titleId = `${baseId}-${position}`
              const sumText = describeSum(proposal)
              return (
                <div key={proposal.id} className={`crf-diffrow crf-coa__item${proposal.applicable ? '' : ' is-info'}`}>
                  {proposal.applicable ? (
                    <label className="crf-coa__check">
                      <input
                        type="checkbox"
                        aria-labelledby={titleId}
                        checked={selectedSet.has(proposal.id)}
                        onChange={() => toggle(proposal.id)}
                      />
                    </label>
                  ) : (
                    <span className="crf-coa__check" aria-hidden="true" />
                  )}
                  <span className="crf-diffrow__text">
                    <b id={titleId}>{proposal.title}</b>
                    {proposal.lots.length > 0 ? <LotsTable lots={proposal.lots} /> : null}
                    {sumText ? <small className="crf-coa__sum">{sumText}</small> : null}
                    {proposal.notes.map((note, index) => (
                      <small key={`${proposal.id}-note-${index}`} className="crf-coa__note">
                        {note}
                      </small>
                    ))}
                    {proposal.linkOptions ? (
                      <label className="crf-coa__link">
                        Ligar ao item
                        <select
                          value={manualLinks[proposal.certId] ?? ''}
                          onChange={(event) => link(proposal.certId, event.target.value)}
                        >
                          <option value="">Não ligar</option>
                          {proposal.linkOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </span>
                  <span className="crf-diffrow__kind">{proposal.kind}</span>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="crf-refresh__actions crf-coa__actions">
          {proposals.some((proposal) => proposal.applicable) ? (
            <button type="button" className="primary-button" disabled={selected.length === 0 || busy} onClick={apply}>
              Aplicar selecionadas
            </button>
          ) : null}
          <button type="button" className="secondary-button" onClick={dismiss}>
            {proposals.length > 0 && !isUpToDate ? 'Agora não' : 'Fechar'}
          </button>
          {pdfCount > 0 ? (
            <button type="button" className="secondary-button" disabled={busy} onClick={() => setIsConfirmOpen(true)}>
              Ler de novo…
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmOpen}
        title="Ler os COAs de novo?"
        message={`${
          pdfCount === 1 ? 'O arquivo será enviado' : `Os ${pdfCount} arquivos serão enviados`
        } de novo para a leitura automática, um por vez. Cada arquivo tem até 3 leituras. Se a nova leitura falhar, o resultado anterior de cada arquivo se perde até ler de novo.`}
        confirmLabel="Ler de novo"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setIsConfirmOpen(false)
          rereadAll()
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  )
}
