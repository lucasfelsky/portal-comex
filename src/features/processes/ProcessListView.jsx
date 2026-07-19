import { useEffect, useState } from 'react'
import Skeleton from '../../components/Skeleton'
import SelectField from '../../components/SelectField'
import FilterChip from '../../components/FilterChip'
import Icon from '../../components/Icon'
import { getProcessTitle, getProcessSubtitle } from './processLabels'
import { getStatusTagClass } from './processStatusView'
import {
  isProcessStatusFinalized,
  shouldHideProcessCardSchedule,
  shouldHideProcessStatusBadge,
} from './processStatus'
import { isAirCategory, isMaritimeCategory, shouldShowContainerQuantity } from './processCategories'
import { getEstimatedDeliveryDate } from '../../utils/deliveryForecast'

// F10.6 (backlog 2026-07-12): tela de listagem de processos (viewMode
// 'list'), extraída do ProcessesPage. Presentacional — recebe a lista
// filtrada + os filtros + flags de loading/erro por props, e chama
// callbacks (`onSelectProcess`, `onSearchTermChange`, etc.). Todo o
// estado (filtros, selectedProcessId, isLoading) e os handlers continuam
// na página. É a tela de entrada do módulo de Chegadas. Zero mudança
// visual/comportamental.
export default function ProcessListView({
  rootClassName = '',
  filteredProcesses,
  isLoading,
  selectedProcessId,
  isAdmin,
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
  onImport,
}) {
  const getDestinationLabel = (category) =>
    category === 'AEREO' ? 'Aeroporto de Destino' : 'Porto de Atracação'

  const formatCargoUnit = (quantity, singularLabel, pluralLabel) =>
    `${quantity} ${quantity < 2 ? singularLabel : pluralLabel}`

  const formatDate = (value) => {
    if (!value) return '-'
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  }

  // Previsão de entrega = data manual (override) OU cálculo automático
  // (ETA + dias úteis por categoria / coleta / rolling customs) via
  // getEstimatedDeliveryDate — não repetir só o ETA (regressão do F10.6).
  const getEstimatedDeliveryLabel = (process) => formatDate(getEstimatedDeliveryDate(process))

  const hasUpdatedEta = (process) =>
    Boolean(process?.eta && process?.etaOriginal && process.etaOriginal !== process.eta)

  // F16.4: no mobile (≤720px) a tela de Chegadas ganha a linguagem do
  // protótipo — busca em pill, segmented Todos/Marítimo/Aéreo (filtro de
  // exibição client-side, além dos filtros do painel) e seções Em
  // andamento/Concluídos. No desktop o painel de filtros e a lista plana
  // ordenada por ETA seguem intocados.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
  )
  const [mobileCategory, setMobileCategory] = useState('all')
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const shownProcesses =
    mobileCategory === 'all'
      ? filteredProcesses
      : filteredProcesses.filter((process) =>
          mobileCategory === 'air'
            ? isAirCategory(process.category)
            : isMaritimeCategory(process.category)
        )
  const activeProcesses = shownProcesses.filter(
    (process) => !isProcessStatusFinalized(process.processStatus)
  )
  const doneProcesses = shownProcesses.filter((process) =>
    isProcessStatusFinalized(process.processStatus)
  )

  const renderProcessRow = (item) => {
    const hideSchedule = shouldHideProcessCardSchedule(item)
    return (
      <button
        key={item.id}
        type="button"
        className={`process-item process-item--button${selectedProcessId === item.id ? ' process-item--selected' : ''}`}
        onClick={() => onSelectProcess(item.id)}
      >
        {/* F15.2: leading icon por categoria + resumo condensado +
            chevron — só aparecem no mobile (≤720px); no desktop o
            CSS os esconde e o layout atual permanece intacto. */}
        <span className="process-item__leading" aria-hidden="true">
          <Icon name={isAirCategory(item.category) ? 'plane' : 'ship'} size={20} />
        </span>
        <div className="process-item__main">
          <strong>{getProcessTitle(item, isAdmin)}</strong>
          {getProcessSubtitle(item, isAdmin) ? <p>{getProcessSubtitle(item, isAdmin)}</p> : null}
          <div className="process-item__line">{item.category}</div>
          <div className="process-item__line">
            {getDestinationLabel(item.category)}: {item.destination || '-'}
          </div>
          <div
            className={`process-item__summary${hasUpdatedEta(item) ? ' process-item__summary--eta-updated' : ''}`}
          >
            {[
              // dd/mm basta no resumo — o ano é ruído numa linha condensada
              hideSchedule || !item.eta ? null : `ETA ${formatDate(item.eta).slice(0, 5)}`,
              item.destination || null,
              shouldShowContainerQuantity(item.category) && item.containerQuantity > 0
                ? formatCargoUnit(item.containerQuantity, 'container', 'containers')
                : item.palletQuantity > 0
                  ? formatCargoUnit(item.palletQuantity, 'pallet', 'pallets')
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="process-item__chips">
            {shouldHideProcessStatusBadge(item) ? null : (
              <span className={getStatusTagClass(item.processStatus)}>
                {item.processStatus}
              </span>
            )}
            {shouldShowContainerQuantity(item.category) ? (
              <span className="inline-badge">
                {formatCargoUnit(item.containerQuantity, 'container', 'containers')}
              </span>
            ) : null}
            <span className="inline-badge">
              {formatCargoUnit(item.palletQuantity, 'pallet', 'pallets')}
            </span>
          </div>
        </div>
        {!hideSchedule ? (
          <div className="process-item__meta">
            <span>ETD: {formatDate(item.etd)}</span>
            <span className={hasUpdatedEta(item) ? 'eta-meta-highlight' : ''}>
              ETA: {formatDate(item.eta)}
            </span>
            <span>Previsão de entrega: {getEstimatedDeliveryLabel(item)}</span>
          </div>
        ) : null}
        <span className="process-item__chevron" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
      </button>
    )
  }

  return (
    <article
      className={`list-card process-list-card${rootClassName ? ` ${rootClassName}` : ''}`}
      style={{ marginTop: '16px' }}
    >
      <div className="card-heading">
        <div>
          <h3>Chegadas</h3>
        </div>
        <div className="admin-toolbar">
          <span className="inline-badge">{filteredProcesses.length} visíveis</span>
          {isAdmin && onImport ? (
            <button
              type="button"
              className="ghost-button"
              title="Criar processos em lote a partir de uma planilha"
              onClick={onImport}
            >
              Importar
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            disabled={filteredProcesses.length === 0}
            title="Baixar as linhas visíveis (filtros aplicados) em Excel"
            onClick={onExport}
          >
            Exportar ({filteredProcesses.length})
          </button>
        </div>
      </div>

      {/* F16.4: busca pill + segmented — mobile-only (CSS). No desktop segue
          o painel de filtros completo abaixo. */}
      <div className="chegadas-mobilebar">
        <label className="chegadas-search">
          <Icon name="search" size={16} aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Buscar processo, PO, produto…"
            aria-label="Buscar processo"
          />
        </label>
        <div className="chegadas-segmented" role="tablist" aria-label="Filtrar por modal">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'sea', label: 'Marítimo' },
            { key: 'air', label: 'Aéreo' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={mobileCategory === option.key}
              className={`chegadas-segmented__item${mobileCategory === option.key ? ' chegadas-segmented__item--on' : ''}`}
              onClick={() => setMobileCategory(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="process-filters process-filters--panel">
        <label className="field">
          <span>Buscar processo</span>
          <input
            className="text-input"
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Nome, item, destino, categoria, PO, ETA, ETD, status ou ID"
          />
        </label>
        <label className="field field--compact">
          <span>Categoria</span>
          <SelectField
            className="text-input"
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
        </label>
        <div className="field">
          <span>Período de ETA</span>
          <div className="process-date-range">
            <input
              className="text-input"
              type="date"
              value={etaStartDate}
              onChange={(event) => onEtaStartDateChange(event.target.value)}
            />
            <input
              className="text-input"
              type="date"
              value={etaEndDate}
              min={etaStartDate || undefined}
              onChange={(event) => onEtaEndDateChange(event.target.value)}
            />
          </div>
        </div>
        <label className="field">
          <span>Etapa operacional</span>
          <SelectField
            className="text-input"
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
          </SelectField>
        </label>
      </div>

      {hasActiveFilters ? (
        <div className="filter-chips-row" role="list" aria-label="Filtros ativos">
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
              label={`ETA: ${etaStartDate || 'inicio'} ate ${etaEndDate || 'fim'}`}
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
              variant="warning"
            />
          ) : null}
          <button
            type="button"
            className="filter-chips-row__clear"
            onClick={onClearAllFilters}
          >
            Limpar todos
          </button>
        </div>
      ) : null}

      <div className="process-list process-list--scroll">
        {isLoading ? (
          <div className="process-list-skeletons">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="process-item process-item--skeleton">
                <div className="process-item__main">
                  <Skeleton variant="title" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </div>
                <div className="process-item__meta">
                  <Skeleton variant="text" width="80px" height="22px" radius="999px" />
                  <Skeleton variant="text" width="100px" height="22px" radius="999px" />
                </div>
              </div>
            ))}
          </div>
        ) : shownProcesses.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum processo encontrado</strong>
            <p>Ajuste a busca ou cadastre um novo processo.</p>
          </div>
        ) : isMobile ? (
          // Mobile: seções Em andamento / Concluídos (protótipo iOS).
          <>
            {activeProcesses.length > 0 ? (
              <>
                <div className="process-list__section-label">Em andamento</div>
                {activeProcesses.map(renderProcessRow)}
              </>
            ) : null}
            {doneProcesses.length > 0 ? (
              <>
                <div className="process-list__section-label">Concluídos</div>
                {doneProcesses.map(renderProcessRow)}
              </>
            ) : null}
          </>
        ) : (
          // Desktop: lista plana ordenada por ETA (inalterada).
          shownProcesses.map(renderProcessRow)
        )}
      </div>
    </article>
  )
}