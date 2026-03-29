import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

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
      <p className="text-sm text-slate-500 mb-4">{runs.length} upcoming rides</p>

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
                {g.items.map(r => (
                  <Link key={r.id} to={`/ride/${r.id}`} className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-slate-900">{r.pickup_time?.slice(0, 5)}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.status === 'in_progress' ? 'In Progress' : 'Upcoming'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{r.pickup_name} → {r.dropoff_name}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                      <span>{r.client_name}</span>
                      <span className="font-bold text-green-700 text-sm">${r.driver_earnings.toFixed(0)}</span>
                    </div>
                  </Link>
                ))}
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
