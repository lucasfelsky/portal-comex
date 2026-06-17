import { getDerivedStatusToneClass, getProcessDerivedStatus } from './processDerivedStatus'

export default function ProcessDerivedStatusBadge({ process, className = '' }) {
  const derived = getProcessDerivedStatus(process)
  return (
    <span
      className={[
        'process-derived-status-badge',
        getDerivedStatusToneClass(derived),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title="Status interno calculado a partir do estado operacional"
    >
      {derived.label}
    </span>
  )
}