export {
  getDisplayedCollectionStatus,
  getDisplayedProcessStatus,
  getQuickReadProcessStatus,
  isCdEnRouteStatus,
  isCdUnloadingOrReceivedStatus,
  isCollectionScheduleRetainingStatus,
  isDtaTransitCompletedStatus,
  isMapaInspectionScheduledStatus,
  shouldHideProcessCardSchedule,
} from './processStatus'

import {
  getProcessStatusTone,
} from './processStatus'

export function getChannelToneClass(channel) {
  if (channel === 'Verde') return 'detail-card--success'
  if (channel === 'Amarelo') return 'detail-card--warning'
  if (channel === 'Vermelho') return 'detail-card--danger'
  if (channel === 'Cinza') return 'detail-card--neutral'
  return ''
}

export function getStatusTagClass(status) {
  return `status-tag status-tag--${getProcessStatusTone(status)}`
}