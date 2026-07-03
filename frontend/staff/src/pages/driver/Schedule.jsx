import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/driverClient'

export default function Schedule() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.getSchedule().then(setRuns).catch(() => {}).finally(() => setLoading(false)) }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  // Group by date
  const groups = []
  let lastDate = null
  for (const r of runs) {
    if (r.pickup_date !== lastDate) { groups.push({ date: r.pickup_date, items: [] }); lastDate = r.pickup_date }
    groups[groups.length - 1].items.push(r)
  }

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-slate-900 mb-1">My Schedule</h1>
      <p className="text-sm text-slate-500 mb-4">
        {runs.filter(r => r.status === 'assigned' || r.status === 'in_progress').length} upcoming
        {runs.filter(r => r.status === 'cancelled' || r.status === 'refunded').length > 0 &&
          ` · ${runs.filter(r => r.status === 'cancelled' || r.status === 'refunded').length} cancelled`}
      </p>

      {runs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-400">No scheduled rides</p>
          <p className="text-xs text-slate-300 mt-1">Accept runs from the dashboard to fill your schedule</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <div key={gi}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{fmtGroupDate(g.date)}</p>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>
              <div className="space-y-2">
                {g.items.map(r => <ScheduleRunCard key={r.id} r={r} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtGroupDate(d) {
  const today = new Date().toISOString().split('T')[0]
  const tmrw = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (d === today) return 'Today'
  if (d === tmrw) return 'Tomorrow'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Same itinerary layout as the dashboard's RunCard so the driver reads one
// consistent visual across screens. Time is the primary label at the top;
// status badge sits next to it. Cancelled cards get the red-frame + struck-
// through earnings treatment.
function ScheduleRunCard({ r }) {
  const isCancelled = r.status === 'cancelled' || r.status === 'refunded'
  const isInProgress = r.status === 'in_progress'
  const frame = isCancelled
    ? 'bg-red-50 border-red-200 hover:border-red-300'
    : 'bg-white border-slate-200 hover:border-blue-300'
  const badge = isCancelled ? { label: 'Cancelled', style: 'bg-red-600 text-white' }
    : isInProgress ? { label: 'In Progress', style: 'bg-amber-100 text-amber-700' }
    : { label: 'Upcoming', style: 'bg-blue-100 text-blue-700' }
  return (
    <Link to={`/driver/ride/${r.id}`} className={`block border rounded-xl p-4 transition-all ${frame}`}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-bold text-slate-900">{r.pickup_time?.slice(0, 5)}</p>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${badge.style}`}>{badge.label}</span>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-[5px] shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-100" />
          <span className="flex-1 my-1 border-l-2 border-dotted border-slate-300 min-h-[16px]" />
          <span className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="truncate">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">From</span>
            <span className="text-sm text-slate-900">{r.pickup_name}</span>
          </div>
          <div className="truncate">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">To</span>
            <span className="text-sm text-slate-900">{r.dropoff_name}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500 truncate">{r.client_name}</span>
        <div className="text-right shrink-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${isCancelled ? 'text-red-500' : 'text-slate-400'}`}>Earn</p>
          {isCancelled ? (
            <p className="text-base font-bold text-red-500 leading-tight line-through decoration-2">${r.driver_earnings?.toFixed(2)}</p>
          ) : (
            <p className="text-base font-bold text-green-700 leading-tight">${r.driver_earnings?.toFixed(2)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
