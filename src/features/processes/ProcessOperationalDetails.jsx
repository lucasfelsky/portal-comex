import { CONTAINER_TYPE_OPTIONS, getContainerSpecialBadges } from './containers'
import {
  getImoClassLabel,
  getItemDangerousGoodsLabel,
  hasDangerousGoods,
  isLegacyProcessDangerousGoods,
} from './operationalOptions'
import { canShowProcessName } from './processLabels'
import { getEffectiveLicenses, isLicenseDeferred, isLicenseRejected } from './licenses'
import { formatDateTime } from '../../utils/dateFormat'
import {
  isApproxDate,
  hasArrivalSignal,
  hasCargoPresenceSignal,
  hasDateValue,
  getFreeTimeStatus,
  CUSTOMS_INSPECTION_CHANNELS,
  isLegacyDuimpRegisteredWithoutDate,
  isLegacyParameterizedWithoutDate,
} from './arrivalCustoms'
import { isMaritimeCategory, isAirCategory } from './processCategories'
import { hasReceiptDivergence } from './receiptDivergence'

// F17.2a (D-11/D-7/D-8): leitura dos 22 campos novos no detalhe do
// processo. F17.2b (D-6): leitura de `licenses[]` (`ProcessLicensesDetails`).
// F17.3a (D-12): leitura de chegada com data/CE/terminal/free time
// (`ProcessArrivalDetails`/`ProcessFreeTimeDetails`).
// F17.3b (D-14): card "DUIMP" completo (`ProcessCustomsDetails`).
// F17.4b (B-4/B-7): card "Divergência no recebimento"
// (`ProcessReceiptDivergenceDetails`) + "Devolvido em dd/mm/aaaa" na
// tabela de contêineres.
// UX-6b-3 (D6/D7): blocos numerados 1-5 (`DetailBlock`/`DetailList`/
// `DetailRow`), tabela de contêineres (`ProcessCargoDetails`) e bloco
// "Embarque e trânsito" (`ProcessTransitDetails`) — substituem
// `ProcessCargoTransitDetails`.
// Regra de import (D-11/D-12/D-14/UX-6b-3): so' `./containers` (inclusive
// `CONTAINER_TYPE_OPTIONS`), `./operationalOptions`, `./processLabels`
// (so' `canShowProcessName`), `./licenses` (inclusive `isLicenseDeferred`/
// `isLicenseRejected`), `../../utils/dateFormat` (so' `formatDateTime`),
// `./arrivalCustoms`, `./processCategories`, `./receiptDivergence` (so'
// `hasReceiptDivergence`). A funcao de tom de canal de `./processStatusView`
// NAO e' mais importada aqui: a DUIMP virou neutra (canal e' badge, nao
// card colorido) — a funcao continua exportada la' pro Dashboard.
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

// UX-6b-3 (D6): primitivas presentacionais dos blocos numerados 1-5. Sem
// arquivo novo (D12) — vivem aqui porque `ProcessDetailView.jsx` tambem as
// usa (bloco 5 "Coleta", montado no pai).
export function DetailBlock({ step, title, badges, tone, wide, className, children }) {
  const classes = [
    'detail-card',
    'detail-block',
    wide ? 'detail-block--wide' : null,
    tone ? `detail-block--${tone}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={classes}>
      <div className="detail-block__head">
        {step ? (
          <span className="detail-block__step" aria-hidden="true">
            {step}
          </span>
        ) : null}
        <h3 className="detail-block__title">{title}</h3>
        {badges}
      </div>
      {children}
    </section>
  )
}

export function DetailList({ children }) {
  return <dl className="detail-dl">{children}</dl>
}

export function DetailRow({ label, children }) {
  return (
    <div className="detail-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// UX-6b-3 (D6): predicados puros de "tem conteudo" — extraidos dos proprios
// componentes de leitura, e reusados pelo pai (`ProcessDetailView.jsx`) pra
// decidir a numeracao (Chegada `step=3` OU Free time `step=3` se Chegada nao
// renderiza; Aduana `step=4` OU Anuências `step=4` se Aduana nao renderiza).
export function hasArrivalDetails(process) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return false

  const hasArrival = hasArrivalSignal(process)
  const hasDtaContent =
    isAir && (process?.dtaStatus || process?.dtaLoadingScheduledAt || process?.dtaArrivalAtItajai)

  return Boolean(hasArrival || process?.ceMercante || process?.ceHouse || process?.terminalName || hasDtaContent)
}

export function hasCustomsDetails(process) {
  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  if (!isMaritime && !isAir) return false

  return Boolean(
    process?.duimpStatus ||
      process?.duimpNumber ||
      process?.duimpRegisteredAt ||
      process?.parameterizedAt ||
      process?.clearanceCompletedAt
  )
}

// F17.2b (D-6): bloco "Anuências" - so' quando ha' anuencia efetiva (leitura
// visivel a todos os aprovados, anuencia nao identifica o processo).
export function ProcessLicensesDetails({ process, step }) {
  const licenses = getEffectiveLicenses(process)

  if (licenses.length === 0) return null

  const deferidasCount = licenses.filter((license) => isLicenseDeferred(license?.status)).length
  const hasRejected = licenses.some((license) => isLicenseRejected(license?.status))
  const allDeferred = licenses.every((license) => isLicenseDeferred(license?.status))
  const summaryTone = hasRejected ? 'inline-badge--danger' : allDeferred ? 'inline-badge--ok' : 'inline-badge--warn'
  const summaryBadge = (
    <span className={`inline-badge ${summaryTone}`}>{`${deferidasCount} de ${licenses.length} deferidas`}</span>
  )

  return (
    <DetailBlock step={step} title="Anuências" badges={summaryBadge}>
      <div className="detail-stack detail-stack--compact">
        {licenses.map((license) => {
          const statusTone = isLicenseRejected(license?.status)
            ? 'inline-badge--danger'
            : isLicenseDeferred(license?.status)
              ? 'inline-badge--ok'
              : ''
          return (
            <div className="detail-block__row" key={license.id}>
              <p>
                <strong>{license.agency}</strong>
                {license.lpcoNumber ? ` LPCO ${license.lpcoNumber}` : ''}{' '}
                <span className={`inline-badge ${statusTone}`.trim()}>{license.status}</span>
              </p>
              {license.inspectionScheduledAt ? (
                <p>Vistoria agendada: {formatDateTime(license.inspectionScheduledAt)}</p>
              ) : null}
              {license.deferredAt ? <p>Deferida em: {formatDeferredAt(license.deferredAt)}</p> : null}
              {license.notes ? <p>{license.notes}</p> : null}
            </div>
          )
        })}
      </div>
    </DetailBlock>
  )
}

export function ProcessIdentificationDetails({ process, canSeeName }) {
  const showSupplier =
    canShowProcessName(process, canSeeName) &&
    process?.category !== 'CONSOLIDADO' &&
    process?.supplierName
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

// UX-6b-3 (D7.1): bloco "Carga" (step 1, sempre renderiza — pallets sempre
// aparece hoje). Tabela de contêineres (Contêiner | Tipo | Lacre | Devolução
// do vazio) + pesos/cubagem/volumes/pallets + "Contêineres" (legado, so'
// quando `containers[]` esta vazio e a categoria mostra quantidade) + linha
// IMO por item perigoso (mais o legado do processo).
export function ProcessCargoDetails({ process, showContainerQuantity }) {
  const containers = Array.isArray(process?.containers) ? process.containers : []
  const specialBadges = getContainerSpecialBadges(containers)
  const isDangerous = hasDangerousGoods(process)

  const badges = (
    <>
      {specialBadges.map((badge) => (
        <span key={badge} className="inline-badge inline-badge--warn">
          {badge}
        </span>
      ))}
      {isDangerous ? <span className="inline-badge inline-badge--danger">Carga perigosa</span> : null}
    </>
  )

  const dangerousItems = (Array.isArray(process?.items) ? process.items : []).filter(
    (item) => item?.dangerousGoods === true
  )

  return (
    <DetailBlock step={1} title="Carga" wide badges={badges}>
      {containers.length > 0 ? (
        <div className="detail-table__scroll">
          <table className="detail-table" aria-label="Contêineres">
            <thead>
              <tr>
                <th scope="col">Contêiner</th>
                <th scope="col">Tipo</th>
                <th scope="col">Lacre</th>
                <th scope="col">Devolução do vazio</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr key={container.id}>
                  <td>{container.number || 'Sem número'}</td>
                  <td>
                    {CONTAINER_TYPE_OPTIONS.find((option) => option.value === container.type)?.label ??
                      container.type ??
                      '—'}
                  </td>
                  <td>{container.seal || '—'}</td>
                  <td>
                    {container.returnedAt ? (
                      <span className="inline-badge inline-badge--ok">{`Devolvido em ${formatDate(container.returnedAt)}`}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <DetailList>
        {process?.grossWeightKg > 0 ? <DetailRow label="Peso bruto">{`${process.grossWeightKg} kg`}</DetailRow> : null}
        {process?.volumeM3 > 0 ? <DetailRow label="Cubagem">{`${process.volumeM3} m³`}</DetailRow> : null}
        {process?.chargeableWeightKg > 0 ? (
          <DetailRow label="Peso taxado">{`${process.chargeableWeightKg} kg`}</DetailRow>
        ) : null}
        {process?.packagesQuantity > 0 ? <DetailRow label="Volumes">{process.packagesQuantity}</DetailRow> : null}
        <DetailRow label="Pallets">{formatCargoUnit(process?.palletQuantity, 'pallet', 'pallets')}</DetailRow>
        {containers.length === 0 && showContainerQuantity ? (
          <DetailRow label="Contêineres">{formatCargoUnit(process?.containerQuantity, 'container', 'containers')}</DetailRow>
        ) : null}
        {dangerousItems.map((item) => (
          <DetailRow key={item.id} label="IMO">
            {`${item.commercialName || 'Item sem nome'}: ${getItemDangerousGoodsLabel(item)}`}
          </DetailRow>
        ))}
        {isLegacyProcessDangerousGoods(process) ? (
          <DetailRow label="IMO">
            {`Cadastro antigo do processo: ${
              [
                process?.unNumber ? `ONU ${process.unNumber}` : null,
                process?.imoClass ? `Classe ${getImoClassLabel(process.imoClass)}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'sem número ONU/classe registrados'
            }`}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

function formatCargoUnit(quantity, singularLabel, pluralLabel) {
  return `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`
}

// UX-6b-3 (D7.2): bloco "Embarque e trânsito" (step 2, so' quando ha' sinal
// de embarque ou transbordo).
export function ProcessTransitDetails({ process }) {
  const hasTransit =
    process?.shippedAt ||
    process?.vesselName ||
    process?.voyage ||
    process?.flightNumber ||
    process?.masterBl ||
    process?.houseBl ||
    process?.mawb ||
    process?.hawb

  if (!hasTransit && !process?.transshipment) return null

  return (
    <DetailBlock step={2} title="Embarque e trânsito" wide>
      <DetailList>
        {process?.shippedAt ? <DetailRow label="Data de embarque">{formatDate(process.shippedAt)}</DetailRow> : null}
        {process?.vesselName ? <DetailRow label="Navio">{process.vesselName}</DetailRow> : null}
        {process?.voyage ? <DetailRow label="Viagem">{process.voyage}</DetailRow> : null}
        {process?.flightNumber ? <DetailRow label="Voo">{process.flightNumber}</DetailRow> : null}
        {process?.masterBl ? <DetailRow label="MBL">{process.masterBl}</DetailRow> : null}
        {process?.houseBl ? <DetailRow label="HBL">{process.houseBl}</DetailRow> : null}
        {process?.mawb ? <DetailRow label="MAWB">{process.mawb}</DetailRow> : null}
        {process?.hawb ? <DetailRow label="HAWB">{process.hawb}</DetailRow> : null}
        {process?.transshipment ? (
          <DetailRow label="Transbordo">
            {`${process?.transshipmentPort ? `Sim — ${process.transshipmentPort}` : 'Sim'}${process?.transshipmentEtd ? ` · ETD ${formatDate(process.transshipmentEtd)}` : ''}`}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// F17.3a (D-12): bloco "Chegada" - atracacao/chegada com data (aprox. quando
// migrada), CE/terminal, DTA (aereo) e presenca de carga com data. So'
// renderiza se ha algum dado (visivel a todos os aprovados).
export function ProcessArrivalDetails({ process, step }) {
  if (!hasArrivalDetails(process)) return null

  const isMaritime = isMaritimeCategory(process?.category)
  const isAir = isAirCategory(process?.category)
  const hasArrival = hasArrivalSignal(process)
  const hasPresence = hasCargoPresenceSignal(process)
  const arrivalField = isMaritime ? 'berthedAt' : 'arrivedAt'
  const arrivalValue = isMaritime ? process?.berthedAt : process?.arrivedAt
  const isApprox = isApproxDate(process, arrivalField)

  return (
    <DetailBlock step={step} title="Chegada">
      <DetailList>
        {hasArrival ? (
          <DetailRow label={isMaritime ? 'Atracação' : 'Chegada'}>
            {hasDateValue(arrivalValue)
              ? `${formatDateTime(arrivalValue)}${isApprox ? ' (aprox.)' : ''}`
              : 'Confirmada (sem data)'}
          </DetailRow>
        ) : null}
        {process?.ceMercante ? <DetailRow label="CE Mercante">{process.ceMercante}</DetailRow> : null}
        {process?.ceHouse ? <DetailRow label="CE house">{process.ceHouse}</DetailRow> : null}
        {process?.terminalName ? <DetailRow label="Terminal / armazém">{process.terminalName}</DetailRow> : null}
        {isAir && process?.dtaStatus ? <DetailRow label="DTA">{process.dtaStatus}</DetailRow> : null}
        {isAir && process?.dtaLoadingScheduledAt ? (
          <DetailRow label="Carregamento DTA">{formatDateTime(process.dtaLoadingScheduledAt)}</DetailRow>
        ) : null}
        {isAir && process?.dtaArrivalAtItajai ? (
          <DetailRow label="Chegada prevista em Itajaí">{formatDateTime(process.dtaArrivalAtItajai)}</DetailRow>
        ) : null}
        {hasArrival ? (
          <DetailRow label="Presença de carga">
            {hasPresence
              ? hasDateValue(process?.cargoPresenceInformedAt)
                ? formatDateTime(process.cargoPresenceInformedAt)
                : 'Informada (sem data)'
              : 'Pendente'}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// F17.3a (D-12): bloco "Free time" (FCL/CONSOLIDADO) - prazo de devolucao do
// vazio (A1: conta da presenca de carga). UX-6b-3 (F2): vencido e' o UNICO
// bloco que muda de cor (`tone="danger"`).
export function ProcessFreeTimeDetails({ process, step }) {
  const status = getFreeTimeStatus(process)
  if (!status || status.state === 'not-informed') return null

  function formatDeadline(value) {
    if (!value) return ''
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  let content = null
  let toneClass = ''

  if (status.state === 'waiting-presence') {
    content = `${process.freeTimeDays} dias · inicia na presença de carga`
  } else if (status.state === 'presence-without-date') {
    content = `${process.freeTimeDays} dias · informe a data da presença de carga para calcular o prazo`
  } else if (status.state === 'closed') {
    content = 'Vazios devolvidos'
  } else {
    const deadlineLabel = formatDeadline(status.deadlineKey)
    if (status.state === 'running') {
      content = `Devolução do vazio até ${deadlineLabel} · faltam ${status.daysRemaining} dia(s)`
      toneClass = status.daysRemaining <= 5 ? 'inline-badge--warn' : ''
    } else if (status.state === 'due-today') {
      content = `Devolução do vazio até ${deadlineLabel} · vence hoje`
      toneClass = 'inline-badge--warn'
    } else if (status.state === 'overdue') {
      content = `Devolução do vazio até ${deadlineLabel} · vencido há ${Math.abs(status.daysRemaining)} dia(s)`
      toneClass = 'inline-badge--danger'
    }
  }

  const badge = toneClass ? <span className={`inline-badge ${toneClass}`}>{content}</span> : null

  return (
    <DetailBlock step={step} title="Free time" badges={badge} tone={status.state === 'overdue' ? 'danger' : undefined}>
      <DetailList>
        {!badge ? <DetailRow label="Situação">{content}</DetailRow> : null}
        {process?.demurrageDailyRateUsd != null ? (
          <DetailRow label="Diária de demurrage">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' }).format(
              process.demurrageDailyRateUsd
            )}
          </DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

const CHANNEL_BADGE_TONE = {
  Verde: 'inline-badge--ok',
  Amarelo: 'inline-badge--warn',
  Vermelho: 'inline-badge--danger',
}

// F17.3b (D-14): bloco "Aduana (DUIMP)" (numero, registro, parametrizacao,
// conferencia, exigencia/procedimento especial, desembaraco). UX-6b-3 (D7.4):
// DUIMP NEUTRA — o canal vira badge no cabecalho (nao mais card colorido).
// So' renderiza se maritimo/aereo e ha algum dado preenchido. Visivel a
// todos os aprovados (nenhum campo identifica o processo; mascara de nome
// intocada).
export function ProcessCustomsDetails({ process, step }) {
  if (!hasCustomsDetails(process)) return null

  const channel = process?.parameterizationChannel
  const isCinza = channel === 'Cinza'
  const isInspectionChannel = CUSTOMS_INSPECTION_CHANNELS.includes(channel)
  const channelBadge = channel ? (
    <span className={`inline-badge ${CHANNEL_BADGE_TONE[channel] ?? ''}`.trim()}>{`Canal ${channel}`}</span>
  ) : null

  return (
    <DetailBlock step={step} title="Aduana (DUIMP)" badges={channelBadge}>
      <DetailList>
        {process?.duimpStatus ? <DetailRow label="Status">{process.duimpStatus}</DetailRow> : null}
        {process?.duimpNumber ? <DetailRow label="Nº da DUIMP">{process.duimpNumber}</DetailRow> : null}
        {isLegacyDuimpRegisteredWithoutDate(process) ? (
          <DetailRow label="Registro">sem data (registro antigo)</DetailRow>
        ) : process?.duimpRegisteredAt ? (
          <DetailRow label="Registro">{formatDateTime(process.duimpRegisteredAt)}</DetailRow>
        ) : null}
        {isLegacyParameterizedWithoutDate(process) ? (
          <DetailRow label="Parametrização">sem data (registro antigo)</DetailRow>
        ) : process?.parameterizedAt ? (
          <DetailRow label="Parametrização">{formatDateTime(process.parameterizedAt)}</DetailRow>
        ) : null}
        {isInspectionChannel && process?.customsInspectionScheduledAt ? (
          <DetailRow label="Conferência agendada para">
            {formatDateTime(process.customsInspectionScheduledAt)}
          </DetailRow>
        ) : null}
        {process?.customsRequirement && !isCinza ? (
          <DetailRow label="Exigência">{process?.customsRequirementNotes || 'Sim'}</DetailRow>
        ) : null}
        {isCinza && process?.customsRequirementNotes ? (
          <DetailRow label="Procedimento especial">{process.customsRequirementNotes}</DetailRow>
        ) : null}
        {process?.clearanceCompletedAt ? (
          <DetailRow label="Desembaraço concluído em">{formatDateTime(process.clearanceCompletedAt)}</DetailRow>
        ) : null}
      </DetailList>
    </DetailBlock>
  )
}

// F17.4b (B-4): bloco "Divergência no recebimento" - visivel a todo aprovado
// que ve o detalhe (mesma regra das observacoes pos-recebimento; nenhum
// campo identifica o processo).
export function ProcessReceiptDivergenceDetails({ process }) {
  if (!hasReceiptDivergence(process)) return null

  return (
    <DetailBlock title="Divergência no recebimento">
      <p>
        <span className="inline-badge inline-badge--danger">
          {process?.receiptDivergenceType || 'Tipo não informado'}
        </span>
      </p>
      {process?.receiptDivergenceNotes ? <p>{process.receiptDivergenceNotes}</p> : null}
    </DetailBlock>
  )
}
