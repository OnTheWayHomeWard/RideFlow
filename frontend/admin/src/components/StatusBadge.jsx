const STATUS_MAP = {
  pending: { label: 'Awaiting Payment', style: 'bg-slate-100 text-slate-700' },
  paid: { label: 'Unassigned', style: 'bg-orange-100 text-orange-700' },
  assigned: { label: 'Driver Assigned', style: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', style: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', style: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', style: 'bg-red-100 text-red-700' },
}

export default function StatusBadge({ status }) {
  const mapped = STATUS_MAP[status] || { label: status, style: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${mapped.style}`}>
      {mapped.label}
    </span>
  )
}

// Also export the label map for filter buttons
export const STATUS_LABELS = {
  '': 'All',
  pending: 'Awaiting Payment',
  paid: 'Unassigned',
  assigned: 'Driver Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
