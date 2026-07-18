import Skeleton from '../../components/Skeleton'
import SelectField from '../../components/SelectField'
import FilterChip from '../../components/FilterChip'
import { getProcessTitle, getProcessSubtitle } from './processLabels'
import { getStatusTagClass } from './processStatusView'
import {
  shouldHideProcessCardSchedule,
  shouldHideProcessStatusBadge,
} from './processStatus'
import { shouldShowContainerQuantity } from './processCategories'
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
        ) : filteredProcesses.length > 0 ? (
          filteredProcesses.map((item) => {
            const hideSchedule = shouldHideProcessCardSchedule(item)

            return (
              <button
                key={item.id}
                type="button"
                className={`process-item process-item--button${selectedProcessId === item.id ? ' process-item--selected' : ''}`}
                onClick={() => onSelectProcess(item.id)}
              >
                <div className="process-item__main">
                  <strong>{getProcessTitle(item, isAdmin)}</strong>
                  {getProcessSubtitle(item, isAdmin) ? <p>{getProcessSubtitle(item, isAdmin)}</p> : null}
                  <div className="process-item__line">{item.category}</div>
                  <div className="process-item__line">
                    {getDestinationLabel(item.category)}: {item.destination || '-'}
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
              </button>
            )
          })
        ) : (
          <div className="empty-state">
            <strong>Nenhum processo encontrado</strong>
            <p>Ajuste a busca ou cadastre um novo processo.</p>
          </div>
        )}
      </div>
    </article>
  )
}