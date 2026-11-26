import {
  CARGO_PHOTOS_PER_CONFERENCE,
  cargoRowPallets,
  formatCargoPalletsSummary,
  hasAnyCargoIssue,
  hasCargoRowIssue,
  readCargoRowIssue,
} from './cargoConferenceIssues'
import { countCargoPhotos } from './cargoConferencePhotos'
import { describeCargoRow } from './cargoConferenceModel'
import CargoConferencePhotoBlock from './CargoConferencePhotoBlock'
import CargoConferenceIssueFields from './CargoConferenceIssueFields'
import { isCargoReportRowEmpty } from './cargoReportFormModel'

// S10-I do Relatório de Carga: cartão "Pallets e avarias" do computador, entre "Itens" e "Responsáveis e recebimento"
// (mock aprovado). Faixa "Pallets da carga: X contados de Y informados pelo COMEX." (divergente / confere / sem total) e
// a tabela por item: Pallets contados (com selo) e a observação da avaria (campo para a logística que pode salvar; texto
// para os demais). S10-J1b: coluna "Fotos" (miniaturas; "Anexar foto" para a logística que pode salvar; só leitura para
// o resto) e a contagem de fotos da conferência. Só aparece quando há o que mostrar (logística conferindo, ou contagem/avaria já registrada).
// Fora do computador (`isDesktop` falso) a tabela vira uma lista de cartões, sem rolagem horizontal.

const NOTE_CLASS = {
  divergente: 'crf-note crf-note--warn',
  confere: 'crf-note crf-note--ok',
  semTotal: 'crf-note crf-note--info',
}

function PalletsCell({ count, legacyOk }) {
  if (count === null && legacyOk) return <span className="inline-badge inline-badge--ok">OK (registro antigo)</span>
  if (count === null || count === 0) {
    return (
      <>
        <b>{count ?? '—'}</b> <span className="inline-badge documents-badge--neutral">sem contagem</span>
      </>
    )
  }
  return (
    <>
      <b>{count}</b> <span className="inline-badge inline-badge--ok">ok</span>
    </>
  )
}

function AvariaBadge({ show }) {
  return show ? <span className="inline-badge inline-badge--danger">Avaria registrada</span> : null
}

export default function CargoConferenceIssuesCard({
  rows,
  conference,
  summary,
  canEdit,
  isDesktop = true,
  photoTools = null,
  onIssueChange,
}) {
  const filled = (Array.isArray(rows) ? rows : []).filter((row) => !isCargoReportRowEmpty(row))
  const hasCounts = filled.some((row) => {
    const { count, legacyOk } = cargoRowPallets(conference, row.id)
    return legacyOk || count !== null
  })
  if (filled.length === 0 || !(canEdit || hasCounts || hasAnyCargoIssue(conference))) return null

  function renderNote(row, number) {
    if (!canEdit) return readCargoRowIssue(conference, row.id).note.trim() || '—'
    return (
      <CargoConferenceIssueFields
        variant="desktop"
        issue={readCargoRowIssue(conference, row.id)}
        editable
        itemLabel={`item ${number}`}
        onChange={(patch) => onIssueChange(row.id, patch)}
      />
    )
  }

  function renderPhotos(row, number) {
    const photos = readCargoRowIssue(conference, row.id).photos
    if (!photoTools || (!canEdit && photos.length === 0)) return '—'
    return (
      <CargoConferencePhotoBlock
        variant="desktop"
        tools={photoTools}
        rowId={row.id}
        number={number}
        title={describeCargoRow(row, number)}
        photos={photos}
        editable={canEdit}
      />
    )
  }

  const photoCount = countCargoPhotos(conference)

  return (
    <section className="crf-card crf-issues" aria-label="Pallets e avarias">
      <h3>Pallets e avarias</h3>
      <p className="sub">Contagem de pallets e observações de avaria ou ressalva de cada item, preenchidas pela logística.</p>
      <div className={NOTE_CLASS[summary.state]} role="status">
        {formatCargoPalletsSummary(summary)}
      </div>
      {photoTools && (canEdit || photoCount > 0) ? (
        <p className="crf-issues__photos">{`Fotos de avaria: ${photoCount} de ${CARGO_PHOTOS_PER_CONFERENCE} na conferência (até 5 por item).`}</p>
      ) : null}
      {isDesktop ? (
        <div className="crf-issues__scroll">
          <table className="crf-issues__table" aria-label="Pallets e avarias por item">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Item</th>
                <th scope="col">Cód.</th>
                <th scope="col">Pallets</th>
                {photoTools ? <th scope="col">Fotos</th> : null}
                <th scope="col">Observação da avaria</th>
              </tr>
            </thead>
            <tbody>
              {filled.map((row) => {
                const number = rows.indexOf(row) + 1
                return (
                  <tr key={row.id}>
                    <td>{number}</td>
                    <td>
                      {describeCargoRow(row, number)}
                      <AvariaBadge show={hasCargoRowIssue(conference, row.id)} />
                    </td>
                    <td>{row.dbcorpCode || '—'}</td>
                    <td>
                      <PalletsCell {...cargoRowPallets(conference, row.id)} />
                    </td>
                    {photoTools ? <td className="crf-issues__photocell">{renderPhotos(row, number)}</td> : null}
                    <td className="crf-issues__notecell">{renderNote(row, number)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="crf-issues__list">
          {filled.map((row) => {
            const number = rows.indexOf(row) + 1
            return (
              <li key={row.id} className="crf-issues__item">
                <div className="crf-issues__head">
                  <b>{`${number} · ${describeCargoRow(row, number)}`}</b>
                  <AvariaBadge show={hasCargoRowIssue(conference, row.id)} />
                </div>
                <div className="crf-issues__pallets">
                  <span>Pallets</span> <PalletsCell {...cargoRowPallets(conference, row.id)} />
                </div>
                {photoTools ? renderPhotos(row, number) : null}
                {renderNote(row, number)}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
