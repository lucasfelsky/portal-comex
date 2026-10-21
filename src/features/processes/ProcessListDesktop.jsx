import { useId } from 'react'
import Skeleton from '../../components/Skeleton'
import SelectField from '../../components/SelectField'
import FilterChip from '../../components/FilterChip'
import Icon from '../../components/Icon'
import Spinner from '../../components/Spinner'
import Stagger from '../../components/Stagger'
import useActivationPop from '../../hooks/useActivationPop'
import { getProcessTitle, getProcessSubtitle } from './processLabels'
import { getStatusTagClass } from './processStatusView'
import { shouldHideProcessCardSchedule, shouldHideProcessStatusBadge } from './processStatus'
import { shouldShowContainerQuantity } from './processCategories'
import { formatContainerCount, formatPalletCount } from '../../utils/cargoUnits'
import { formatShortDate } from './WeeklyArrivalsCard'
import {
  buildProcessAlerts,
  formatDate,
  getDestinationLabel,
  getEstimatedDeliveryKey,
  hasUpdatedEta,
} from './processListShared'

// Refino visual F4b — "Central de chegadas" (Chegadas.dc.html), arvore DESKTOP
// (>= 1041px). Escolhida pelo ProcessListView por matchMedia; tablet e mobile
// seguem na arvore legada (swipe, segmented, secoes), que nao passa por aqui.
// Presentacional, igual ao ProcessListView: todo o estado (filtros, selecao,
// carregamento) e os handlers continuam na pagina; "Arquivados" e' o unico
// estado de tela e vem do ProcessListView.

// Icones do mock (traços exatos do .dc.html; viewBox 24, stroke arredondado).
const MOCK_ICONS = {
  'archive-box': { d: 'M3 7h18M5 7v12h14V7M9 11h6', strokeWidth: 1.9 },
  download: { d: 'M12 4v11M7 10l5 5 5-5M4 20h16', strokeWidth: 1.9 },
  plus: { d: 'M12 5v14M5 12h14', strokeWidth: 2.2 },
  'archive-in': { d: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4', strokeWidth: 1.9 },
  search: { d: 'm20 20-3.5-3.5', circle: { cx: 11, cy: 11, r: 7 }, strokeWidth: 1.9 },
}

function MockIcon({ name, size = 16 }) {
  const icon = MOCK_ICONS[name]
  return (
    <svg
      className="chg-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icon.circle ? <circle cx={icon.circle.cx} cy={icon.circle.cy} r={icon.circle.r} /> : null}
      <path d={icon.d} />
    </svg>
  )
}

// "ETA: 19/10 até 31/10" — datas curtas (dd/mm; com ano so quando difere do atual).
function formatEtaRangeLabel(start, end) {
  const from = start ? formatShortDate(start) : 'início'
  const to = end ? formatShortDate(end) : 'fim'
  return `ETA: ${from} até ${to}`
}

function ArrivalRow({
  item,
  isAdmin,
  canSeeName,
  isSelected,
  isFavorite,
  onSelectProcess,
  onToggleFavorite,
  onArchiveProcess,
  isArchivedRow = false,
  className = '',
  style,
}) {
  // Arquivado automatico (recebido ha 7+ dias) nao tem "Restaurar": a leitura o arquivaria de novo.
  const canArchive = isAdmin && typeof onArchiveProcess === 'function' && !item.autoArchived
  // Estrela de favorito: entra com mola (scale 0 -> 1) so ao ativar.
  const favoriteStarPop = useActivationPop(Boolean(isFavorite))
  const hideSchedule = shouldHideProcessCardSchedule(item)
  const alerts = buildProcessAlerts(item, isAdmin)
  const visibleAlerts = alerts.slice(0, 2)
  const hiddenAlerts = alerts.slice(2)
  const etaUpdated = hasUpdatedEta(item)
  const deliveryKey = getEstimatedDeliveryKey(item)

  const title = getProcessTitle(item, canSeeName)
  // "PO: 4500128734 · FCL": o subtitulo some quando o nome esta mascarado
  // (o titulo ja e' "PO: …") e a categoria fica sozinha.
  const poLine = [getProcessSubtitle(item, canSeeName), item.category].filter(Boolean).join(' · ')

  const showContainers = shouldShowContainerQuantity(item.category) && item.containerQuantity > 0
  const showPallets = item.palletQuantity > 0

  const rowClass = `chg-row${isSelected ? ' chg-row--selected' : ''}${className ? ` ${className}` : ''}`

  return (
    <article
      className={rowClass}
      style={style}
      aria-current={isSelected ? 'true' : undefined}
      onClick={() => onSelectProcess(item.id)}
    >
      <button type="button" className="chg-row__main">
        <span className="chg-row__title">
          <span className="chg-row__name">{title}</span>
          {poLine ? <span className="chg-row__po">{poLine}</span> : null}
        </span>
        <span className="chg-row__dest">
          {getDestinationLabel(item.category)}: <strong>{item.destination || '-'}</strong>
        </span>
        <span className="chg-row__chips">
          {shouldHideProcessStatusBadge(item) ? null : (
            <span className={getStatusTagClass(item.processStatus)}>{item.processStatus}</span>
          )}
          {showContainers ? (
            <span className="inline-badge">{formatContainerCount(item.containerQuantity)}</span>
          ) : null}
          {showPallets ? <span className="inline-badge">{formatPalletCount(item.palletQuantity)}</span> : null}
          {visibleAlerts.map((alert, index) => (
            <span key={`${alert.label}-${index}`} className={`inline-badge inline-badge--${alert.tone}`}>
              {alert.label}
            </span>
          ))}
          {hiddenAlerts.length > 0 ? (
            <span
              className="inline-badge inline-badge--more"
              tabIndex={0}
              aria-label={`${hiddenAlerts.length} alerta(s) a mais: ${hiddenAlerts.map((alert) => alert.label).join(', ')}`}
              title={`${hiddenAlerts.length} alerta(s) a mais: ${hiddenAlerts.map((alert) => alert.label).join(', ')}`}
            >
              +{hiddenAlerts.length}
            </span>
          ) : null}
        </span>
      </button>

      {!hideSchedule ? (
        <div className="chg-row__dates">
          <span className="chg-date">
            <span className="chg-date__label">ETD</span>
            <span className="chg-date__value" title={formatDate(item.etd)}>
              {formatShortDate(item.etd)}
            </span>
          </span>
          <span
            className={`chg-date chg-date--eta${etaUpdated ? ' chg-date--updated' : ''}`}
            title={etaUpdated ? `ETA anterior: ${formatDate(item.etaOriginal)}` : undefined}
          >
            <span className="chg-date__label">{etaUpdated ? 'ETA atualizada' : 'ETA'}</span>
            <span className="chg-date__value" title={formatDate(item.eta)}>
              {formatShortDate(item.eta)}
            </span>
          </span>
          <span className="chg-date" title="Previsão de entrega no armazém">
            <span className="chg-date__label">Entrega prev.</span>
            <span className="chg-date__value" title={formatDate(deliveryKey)}>
              {formatShortDate(deliveryKey)}
            </span>
          </span>
        </div>
      ) : null}

      <div className="chg-row__actions" onClick={(event) => event.stopPropagation()}>
        {onToggleFavorite ? (
          <button
            type="button"
            className={`chg-icon-button chg-icon-button--favorite${isFavorite ? ' chg-icon-button--on' : ''}`}
            aria-label={isFavorite ? 'Desfavoritar processo' : 'Favoritar processo'}
            title={isFavorite ? 'Desfavoritar' : 'Favoritar'}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(item.id)
            }}
          >
            <svg
              className={`chg-star${favoriteStarPop ? ' favorite-star--pop' : ''}`}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
            </svg>
          </button>
        ) : null}
        {canArchive ? (
          <button
            type="button"
            className="chg-icon-button"
            aria-label={isArchivedRow ? 'Restaurar processo' : 'Arquivar processo'}
            title={isArchivedRow ? 'Restaurar' : 'Arquivar'}
            onClick={(event) => {
              event.stopPropagation()
              onArchiveProcess(item.id, !isArchivedRow)
            }}
          >
            {isArchivedRow ? <Icon name="restore" size={18} strokeWidth={1.9} /> : <MockIcon name="archive-in" size={18} />}
          </button>
        ) : null}
      </div>
    </article>
  )
}

export default function ProcessListDesktop({
  rootClassName = '',
  filteredProcesses,
  totalCount,
  isLoading,
  isExporting,
  selectedProcessId,
  isAdmin,
  canSeeName,
  searchTerm,
  categoryFilter,
  etaStartDate,
  etaEndDate,
  operationFilter,
  hasActiveFilters,
  processCategoryOptions,
  onSearchTermChange,
  onCategoryFilterChange,
  onEtaStartDateChange,
  onEtaEndDateChange,
  onOperationFilterChange,
  onClearAllFilters,
  onSelectProcess,
  onExport,
  onReconcileErp,
  favoriteProcessIds,
  onToggleFavorite,
  archivedProcesses = [],
  onArchiveProcess,
  onNewProcess,
  canViewArchived,
  isShowingArchived,
  onToggleArchived,
}) {
  const uid = useId()
  const ids = {
    search: `${uid}-search`,
    category: `${uid}-category`,
    etaLabel: `${uid}-eta`,
    operation: `${uid}-operation`,
  }

  const total = typeof totalCount === 'number' ? totalCount : filteredProcesses.length
  const archivedCount = archivedProcesses.length
  // A contagem do botao de exportar e' o que realmente sai na planilha: com "Arquivados" aberto
  // exporta as linhas arquivadas; fora dele, as linhas filtradas.
  const exportRows = isShowingArchived ? archivedProcesses : filteredProcesses

  let eyebrow
  if (isLoading) eyebrow = 'Carregando fila · ordem por ETA'
  else if (isShowingArchived) eyebrow = `${archivedCount} ${archivedCount === 1 ? 'processo arquivado' : 'processos arquivados'}`
  else eyebrow = `${total} ${total === 1 ? 'processo ativo' : 'processos ativos'} · ordem por ETA`

  const renderRow = (item, archivedRow = false) => (
    <ArrivalRow
      key={item.id}
      item={item}
      isAdmin={isAdmin}
      canSeeName={canSeeName}
      isSelected={selectedProcessId === item.id}
      isFavorite={archivedRow ? false : Boolean(favoriteProcessIds?.includes(item.id))}
      onSelectProcess={onSelectProcess}
      onToggleFavorite={archivedRow ? undefined : onToggleFavorite}
      onArchiveProcess={onArchiveProcess}
      isArchivedRow={archivedRow}
    />
  )

  let results
  if (isLoading) {
    results = (
      <div className="process-list-skeletons process-list-skeletons--card chg-skeletons" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="process-card-skeleton">
            <Skeleton.ProcessCard />
          </div>
        ))}
      </div>
    )
  } else if (isShowingArchived) {
    results = (
      <>
        <div className="chg-section-label">Arquivados</div>
        <Stagger className="chg-list">{archivedProcesses.map((item) => renderRow(item, true))}</Stagger>
      </>
    )
  } else if (filteredProcesses.length === 0) {
    results = (
      <div className="empty-state" role="status">
        <Icon name="nav-arrivals" size={40} strokeWidth={1.5} className="empty-state__glyph" />
        <strong>Nenhum processo encontrado</strong>
        <p>
          {isAdmin
            ? 'Ajuste a busca ou cadastre um novo processo.'
            : 'Ajuste a busca ou os filtros aplicados.'}
        </p>
      </div>
    )
  } else {
    results = <Stagger className="chg-list">{filteredProcesses.map((item) => renderRow(item))}</Stagger>
  }

  return (
    <section
      className={`process-list-card process-list-card--desktop${rootClassName ? ` ${rootClassName}` : ''}`}
      aria-busy={isLoading ? 'true' : undefined}
    >
      <header className="chg-head">
        <div className="chg-head__titles">
          <span className="chg-head__eyebrow">{eyebrow}</span>
          <h2>Fila de chegadas</h2>
        </div>
        <div className="chg-head__actions">
          {canViewArchived && archivedCount > 0 ? (
            <button
              type="button"
              className="ghost-button chg-btn chg-btn--archived process-list__archived-toggle"
              aria-pressed={Boolean(isShowingArchived)}
              onClick={onToggleArchived}
            >
              <MockIcon name="archive-box" />
              Arquivados ({archivedCount})
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button chg-btn chg-btn--export"
            disabled={exportRows.length === 0 || isExporting}
            title={
              isShowingArchived
                ? 'Baixar os processos arquivados em Excel'
                : 'Baixar as linhas visíveis (filtros aplicados) em Excel'
            }
            onClick={() => onExport(exportRows)}
          >
            {isExporting ? <Spinner size={14} /> : <MockIcon name="download" />}
            Exportar ({exportRows.length})
          </button>
          {isAdmin && onReconcileErp ? (
            <button
              type="button"
              className="secondary-button chg-btn chg-btn--import erp-reconcile-trigger"
              disabled={isLoading}
              title="Anexar a planilha do DBCorp: concilia com os processos e salva como referência do ERP"
              onClick={onReconcileErp}
            >
              Importar do DBCorp
            </button>
          ) : null}
          {isAdmin && onNewProcess ? (
            <button
              type="button"
              className="primary-button chg-btn chg-btn--new"
              title="Cadastrar um novo processo"
              onClick={onNewProcess}
            >
              <MockIcon name="plus" />
              Novo processo
            </button>
          ) : null}
        </div>
      </header>

      <section className="chg-filters" aria-label="Filtros">
        <div className="chg-field chg-field--search">
          <label htmlFor={ids.search}>Buscar processo</label>
          <div className="chg-search">
            <MockIcon name="search" />
            <input
              id={ids.search}
              type="text"
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Nome, item, contêiner, PO, ETA ou status"
              title="Busca em nome, item, contêiner, destino, categoria, PO, ETA, ETD, status e ID"
            />
          </div>
        </div>
        <div className="chg-field">
          <label htmlFor={ids.category}>Categoria</label>
          <SelectField
            id={ids.category}
            className="text-input chg-select"
            value={categoryFilter}
            onChange={(event) => onCategoryFilterChange(event.target.value)}
          >
            <option value="Todos">Todas</option>
            {processCategoryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="chg-field chg-field--eta" role="group" aria-labelledby={ids.etaLabel}>
          <span id={ids.etaLabel} className="chg-field__label">
            Período de ETA
          </span>
          <div className="chg-range">
            <input
              className="chg-range__input"
              type="date"
              value={etaStartDate}
              onChange={(event) => onEtaStartDateChange(event.target.value)}
              aria-label="ETA de"
            />
            <span className="chg-range__sep" aria-hidden="true">
              –
            </span>
            <input
              className="chg-range__input"
              type="date"
              value={etaEndDate}
              min={etaStartDate || undefined}
              onChange={(event) => onEtaEndDateChange(event.target.value)}
              aria-label="ETA até"
            />
          </div>
        </div>
        <div className="chg-field">
          <label htmlFor={ids.operation}>Etapa operacional</label>
          <SelectField
            id={ids.operation}
            className="text-input chg-select"
            value={operationFilter}
            onChange={(event) => onOperationFilterChange(event.target.value)}
          >
            <option value="Todos">Todas</option>
            <option value="Pós-chegada pendente">Pós-chegada pendente</option>
            <option value="Aguardando presença de carga">Aguardando presença de carga</option>
            <option value="DTA em andamento">DTA em andamento</option>
            <option value="DUIMP pendente">DUIMP pendente</option>
            <option value="Coleta pendente">Coleta pendente</option>
            <option value="Coleta agendada">Coleta agendada</option>
            {isAdmin ? <option value="Dados pendentes">Dados pendentes</option> : null}
          </SelectField>
        </div>
      </section>

      {hasActiveFilters ? (
        <div className="filter-chips-row chg-chips" role="list" aria-label="Filtros ativos">
          <span className="filter-chips-row__label">Filtros:</span>
          {searchTerm ? (
            <FilterChip
              label={`Busca: "${searchTerm}"`}
              onRemove={() => onSearchTermChange('')}
              variant="primary"
            />
          ) : null}
          {categoryFilter !== 'Todos' ? (
            <FilterChip
              label={`Categoria: ${categoryFilter}`}
              onRemove={() => onCategoryFilterChange('Todos')}
            />
          ) : null}
          {etaStartDate || etaEndDate ? (
            <FilterChip
              label={formatEtaRangeLabel(etaStartDate, etaEndDate)}
              onRemove={() => {
                onEtaStartDateChange('')
                onEtaEndDateChange('')
              }}
              variant="info"
            />
          ) : null}
          {operationFilter !== 'Todos' ? (
            <FilterChip
              label={`Etapa: ${operationFilter}`}
              onRemove={() => onOperationFilterChange('Todos')}
              variant="info"
            />
          ) : null}
          <button type="button" className="filter-chips-row__clear" onClick={onClearAllFilters}>
            Limpar todos
          </button>
          <span className="chg-chips__count" aria-live="polite">
            {filteredProcesses.length} de {total}
          </span>
        </div>
      ) : null}

      {/* Quando o carregamento termina o conteudo entra por fade de 200 ms
          (skeleton-reveal; troca skeleton -> conteudo sem pulo). */}
      <section aria-label="Chegadas" className={`chg-results${isLoading ? '' : ' skeleton-reveal'}`}>
        {results}
      </section>
    </section>
  )
}
