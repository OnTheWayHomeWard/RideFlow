import { useState, useEffect } from 'react'
import { api } from '../../api/driverClient'

export default function Earnings() {
  const [earnings, setEarnings] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch completed + cancelled in parallel so the driver sees BOTH in the
    // history strip. Cancelled rides don't contribute to the summary numbers
    // (backend earnings query already filters to completed), but showing them
    // here is how a driver reconciles "wait, where did that Wednesday run
    // go?" without pinging admin.
    Promise.all([
      api.getEarnings(),
      api.getMyRuns('completed'),
      api.getMyRuns('cancelled').catch(() => []),
    ])
      .then(([e, done, cancelled]) => {
        setEarnings(e)
        // Merge and sort newest first by pickup_date (completed_at exists on
        // completed rides but not always on cancelled — pickup_date is the
        // common key).
        const all = [...(done || []), ...(cancelled || [])].sort((a, b) =>
          (b.pickup_date || '').localeCompare(a.pickup_date || '')
        )
        setHistory(all)
      })
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

      {/* Ride history — completed + cancelled together, so the driver has one
          honest ledger. Cancelled rows are visually voided (red frame + struck
          amount) and their payout pill is swapped for a Cancelled tag. */}
      <h2 className="text-sm font-semibold text-slate-900 mb-2">Ride History</h2>
      {history.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-8">No rides yet</p>
      ) : (
        <div className="space-y-2">
          {history.map(r => {
            const isCancelled = r.status === 'cancelled' || r.status === 'refunded'
            return (
              <div key={r.id} className={`rounded-xl p-3 border ${isCancelled ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-[5px] shrink-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-100" />
                    <span className="flex-1 my-1 border-l-2 border-dotted border-slate-300 min-h-[14px]" />
                    <span className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-100" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="truncate">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">From</span>
                      <span className="text-sm text-slate-900">{r.pickup_name}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mr-1">To</span>
                      <span className="text-sm text-slate-900">{r.dropoff_name}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isCancelled ? (
                      <p className="text-sm font-bold text-red-500 line-through decoration-2">${r.driver_earnings.toFixed(2)}</p>
                    ) : (
                      <p className="text-sm font-bold text-green-700">${r.driver_earnings.toFixed(2)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 gap-2">
                  <span className="truncate">{r.pickup_date} · {r.client_name}</span>
                  {isCancelled ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-2 py-0.5 rounded">Cancelled</span>
                  ) : (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                      r.payout_status === 'released' ? 'bg-green-100 text-green-700' :
                      r.payout_status === 'pending_review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>{r.payout_status?.replace('_', ' ') || 'pending'}</span>
                  )}
                </div>
              </div>
            )
          })}
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
