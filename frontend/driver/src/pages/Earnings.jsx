import { useState, useEffect } from 'react'
import { api } from '../api/client'

export default function Earnings() {
  const [earnings, setEarnings] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getEarnings(), api.getMyRuns('completed')])
      .then(([e, h]) => { setEarnings(e); setHistory(h) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-slate-900 mb-4">My Earnings</h1>

      {/* Period cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <EarnCard label="Today" amount={earnings?.today} rides={earnings?.today_rides} />
        <EarnCard label="This Week" amount={earnings?.this_week} rides={earnings?.this_week_rides} />
        <EarnCard label="This Month" amount={earnings?.this_month} rides={earnings?.this_month_rides} accent />
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-xs text-slate-400">Total Rides</p>
          <p className="text-lg font-bold text-slate-900">{earnings?.today_rides + earnings?.this_week_rides || 0}</p>
        </div>
      </div>

      {/* Completed rides */}
      <h2 className="text-sm font-semibold text-slate-900 mb-2">Completed Rides</h2>
      {history.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">No completed rides yet</p>
      ) : (
        <div className="space-y-2">
          {history.map(r => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-900">{r.pickup_name} → {r.dropoff_name}</p>
                <p className="text-sm font-bold text-green-700">${r.driver_earnings.toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{r.pickup_date} • {r.client_name}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  r.payout_status === 'released' ? 'bg-green-100 text-green-700' :
                  r.payout_status === 'pending_review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                }`}>{r.payout_status?.replace('_', ' ') || 'pending'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EarnCard({ label, amount, rides, accent }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-slate-200'}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-blue-700' : 'text-slate-900'}`}>${(amount || 0).toFixed(0)}</p>
      <p className="text-xs text-slate-400">{rides || 0} rides</p>
    </div>
  )
}
