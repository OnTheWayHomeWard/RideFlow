import { useState, useEffect } from 'react'
import { api } from '../../api/cashierClient'

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  pending: 'Awaiting Payment',
  paid: 'Paid',
  assigned: 'Driver Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function Reservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchReservations = () => {
    api.getReservations().then(setReservations).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchReservations()
    const interval = setInterval(fetchReservations, 15000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-slate-900">My Reservations</h1>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Auto-updating
        </div>
      </div>

      {reservations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-400">No reservations yet</p>
          <p className="text-xs text-slate-300 mt-1">Book for a guest to see reservations here</p>
          <a href="/book-for-guest" className="inline-block mt-4 text-purple-600 font-medium text-sm">Book for Guest</a>
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map(r => (
            <div key={r.id} className={`bg-white border rounded-xl p-4 ${r.status === 'pending' ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <p className="font-mono text-xs text-slate-400">{r.booking_number}</p>
                  <p className="text-sm font-medium text-slate-900">{r.client_name}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_LABELS[r.status] || r.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">{r.pickup_name} → {r.dropoff_name}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-400">{r.pickup_date} at {r.pickup_time?.slice(0, 5)}</p>
                <div className="text-right">
                  <p className="font-bold text-sm text-slate-900">${r.total_amount.toFixed(2)}</p>
                  {r.commission > 0 && <p className="text-xs text-green-600">+${r.commission.toFixed(2)} earned</p>}
                </div>
              </div>
              {r.status === 'pending' && (
                <p className="text-xs text-amber-600 mt-2">Waiting for guest to pay...</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
