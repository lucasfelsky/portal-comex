import { getContainerSpecialBadges } from './containers'
import { getImoClassLabel } from './operationalOptions'
import { canShowProcessName } from './processLabels'
import { getEffectiveLicenses } from './licenses'
import { formatDateTime } from '../../utils/dateFormat'

// F17.2a (D-11/D-7/D-8): leitura dos 22 campos novos no detalhe do
// processo. F17.2b (D-6): leitura de `licenses[]` (`ProcessLicensesDetails`).
// Regra de import (D-11): so' `./containers`, `./operationalOptions`,
// `./processLabels` (so' `canShowProcessName`), `./licenses`,
// `../../utils/dateFormat` (so' `formatDateTime`).
//
// D-3: `shippedAt` e' data pura (`YYYY-MM-DD`) - formatador local, NUNCA
// `toISOString()`/`new Date(value)` direto num `Intl.DateTimeFormat` (bug de
// fuso: meia-noite UTC vira o dia anterior em BRT).
function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

// F17.2b (D-6): mesmo padrao de `formatDate`, mas pra `deferredAt`
// (`YYYY-MM-DD` puro) - NUNCA `new Date(value)` direto (fuso).
function formatDeferredAt(value) {
  return formatDate(value)
}

// F17.2b (D-6): card "Anuências" - so' quando ha' anuencia efetiva (leitura
// visivel a todos os aprovados, anuencia nao identifica o processo).
export function ProcessLicensesDetails({ process }) {
  const licenses = getEffectiveLicenses(process)

  if (licenses.length === 0) return null

  return (
    <div className="detail-card">
      <span className="detail-label">Anuências</span>
      <ul className="detail-stack detail-stack--compact">
        {licenses.map((license) => (
          <li key={license.id}>
            <p>
              {[license.agency, license.lpcoNumber ? `LPCO ${license.lpcoNumber}` : null, license.status]
                .filter(Boolean)
                .join(' · ')}
              {license.status === 'Indeferida' ? (
                <>
                  {' '}
                  <span className="inline-badge inline-badge--danger">Indeferida</span>
                </>
              ) : null}
            </p>
            {license.inspectionScheduledAt ? (
              <p>Vistoria agendada: {formatDateTime(license.inspectionScheduledAt)}</p>
            ) : null}
            {license.deferredAt ? <p>Deferida em: {formatDeferredAt(license.deferredAt)}</p> : null}
            {license.notes ? <p>{license.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProcessIdentificationDetails({ process, canSeeName }) {
  const showSupplier = canShowProcessName(process, canSeeName) && process?.supplierName
  const hasContent =
    showSupplier || process?.originLocation || process?.incoterm || process?.forwarderName

  if (!hasContent) return null

  return (
    <div className="detail-card">
      <span className="detail-label">Identificação</span>
      <div className="detail-stack detail-stack--compact">
        {showSupplier ? <p>Fornecedor: {process.supplierName}</p> : null}
        {process?.originLocation ? <p>Origem: {process.originLocation}</p> : null}
        {process?.incoterm ? <p>Incoterm: {process.incoterm}</p> : null}
        {process?.forwarderName ? <p>Agente de carga: {process.forwarderName}</p> : null}
      </div>
    </div>
  )
}

export function ProcessCargoTransitDetails({ process }) {
  const containers = Array.isArray(process?.containers) ? process.containers : []
  const specialBadges = getContainerSpecialBadges(containers)
  const hasWeights =
    process?.grossWeightKg > 0 ||
    process?.volumeM3 > 0 ||
    process?.chargeableWeightKg > 0 ||
    process?.packagesQuantity > 0
  const hasTransit =
    process?.shippedAt ||
    process?.vesselName ||
    process?.voyage ||
    process?.flightNumber ||
    process?.masterBl ||
    process?.houseBl ||
    process?.mawb ||
    process?.hawb

  return (
    <>
      {containers.length > 0 ? (
        <div className="detail-card">
          <div className="card-heading process-detail-card-heading">
            <span className="detail-label">Contêineres</span>
            {specialBadges.map((badge) => (
              <span key={badge} className="inline-badge inline-badge--warn">
                {badge}
              </span>
            ))}
          </div>
          <ul className="detail-stack detail-stack--compact">
            {containers.map((container) => (
              <li key={container.id}>
                {[container.number || 'Sem número', container.seal || 'sem lacre', container.type || 'sem tipo']
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasWeights ? (
        <div className="detail-card detail-card--split">
          {process?.grossWeightKg > 0 ? (
            <div>
              <span className="detail-label">Peso bruto</span>
              <p>{process.grossWeightKg} kg</p>
            </div>
          ) : null}
          {process?.volumeM3 > 0 ? (
            <div>
              <span className="detail-label">Cubagem</span>
              <p>{process.volumeM3} m³</p>
            </div>
          ) : null}
          {process?.chargeableWeightKg > 0 ? (
            <div>
              <span className="detail-label">Peso taxado</span>
              <p>{process.chargeableWeightKg} kg</p>
            </div>
          ) : null}
          {process?.packagesQuantity > 0 ? (
            <div>
              <span className="detail-label">Volumes</span>
              <p>{process.packagesQuantity}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {process?.dangerousGoods ? (
        <div className="detail-card">
          <span className="detail-label">Carga perigosa</span>
          <div className="detail-stack detail-stack--compact">
            {process?.unNumber ? <p>Número ONU: {process.unNumber}</p> : null}
            {process?.imoClass ? <p>Classe IMO: {getImoClassLabel(process.imoClass)}</p> : null}
          </div>
        </div>
      ) : null}

      {hasTransit ? (
        <div className="detail-card">
          <span className="detail-label">Embarque e trânsito</span>
          <div className="detail-stack detail-stack--compact">
            {process?.shippedAt ? <p>Data de embarque: {formatDate(process.shippedAt)}</p> : null}
            {process?.vesselName ? <p>Navio: {process.vesselName}</p> : null}
            {process?.voyage ? <p>Viagem: {process.voyage}</p> : null}
            {process?.flightNumber ? <p>Voo: {process.flightNumber}</p> : null}
            {process?.masterBl ? <p>MBL: {process.masterBl}</p> : null}
            {process?.houseBl ? <p>HBL: {process.houseBl}</p> : null}
            {process?.mawb ? <p>MAWB: {process.mawb}</p> : null}
            {process?.hawb ? <p>HAWB: {process.hawb}</p> : null}
          </div>
        </div>
      ) : null}

      {process?.transshipment ? (
        <div className="detail-card">
          <span className="detail-label">Transbordo</span>
          <p>{process?.transshipmentPort ? `Sim — ${process.transshipmentPort}` : 'Sim'}</p>
        </div>
      ) : null}
    </>
  )
}
