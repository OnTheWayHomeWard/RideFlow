import { useState, useEffect } from 'react'
import { api } from '../../api/cashierClient'

function formatGroupDate(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function getDateKey(isoStr) {
  return new Date(isoStr).toDateString()
}

export default function Referrals() {
  const [referrals, setReferrals] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getReferrals(), api.getEarnings()])
      .then(([r, e]) => { setReferrals(r); setEarnings(e) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>

  // Group by date
  const groups = []
  let lastKey = null
  for (const r of referrals) {
    const key = getDateKey(r.paid_at || r.pickup_date)
    if (key !== lastKey) {
      groups.push({ date: r.paid_at || r.pickup_date, items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(r)
  }

  const totalEarned = referrals.reduce((s, r) => s + r.commission, 0)

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Referrals</h1>
      <p className="text-sm text-slate-500 mb-4">{referrals.length} bookings</p>

      {referrals.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">No referrals yet</p>
          <p className="text-xs text-slate-400 mt-1">Show your QR code to guests to start earning</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{formatGroupDate(group.date)}</p>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              {/* Items — border, amount colour, and pills all react to the
                  booking status so the cashier can eyeball their day. Cancelled
                  rides get a red frame and a struck-through amount so it's
                  obvious the commission was reversed. */}
              <div className="space-y-2">
                {group.items.map((r, i) => {
                  const tone = statusTone(r.status)
                  const isCancelled = r.status === 'cancelled' || r.status === 'refunded'
                  return (
                    <div key={i} className={`rounded-xl p-3 border ${tone.card}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-900">{r.client_name}</p>
                        {isCancelled ? (
                          <span className="text-sm font-bold text-red-700 line-through decoration-2">+${r.commission.toFixed(2)}</span>
                        ) : (
                          <span className={`text-sm font-bold ${tone.amount}`}>+${r.commission.toFixed(2)}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{r.pickup_name} → {r.dropoff_name}</p>
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-xs text-slate-400 shrink-0">{r.pickup_date}</span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          <StatusPill status={r.status} />
                          {!isCancelled && <PayoutPill status={r.payout_status} />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating total bar */}
      {referrals.length > 0 && (
        <>
          <div className="h-20"></div>
          <div className="fixed bottom-14 left-0 right-0 z-10">
            <div className="max-w-lg mx-auto px-4">
              <div className="bg-purple-600 text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg">
                <div>
                  <p className="text-xs text-purple-200">{earnings?.today?.referrals || 0} referrals today</p>
                  <p className="text-sm font-medium">Today's Earnings</p>
                </div>
                <p className="text-2xl font-bold">${(earnings?.today?.amount || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PayoutPill({ status }) {
  const map = {
    pending: { label: 'Pending', style: 'bg-amber-100 text-amber-700' },
    released: { label: 'Settled', style: 'bg-green-100 text-green-700' },
    transfer_failed: { label: 'Failed', style: 'bg-red-100 text-red-700' },
  }
  const m = map[status] || { label: status || 'pending', style: 'bg-slate-100 text-slate-600' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.style}`}>{m.label}</span>
}

// Booking-status → card frame + amount colour. Cancelled/refunded lean red so
// a cashier scanning the list can spot voided commissions at a glance; in-flight
// bookings (paid/assigned/in_progress) get calmer tones so completed rides
// (green) still pop as the win.
function statusTone(status) {
  switch (status) {
    case 'cancelled':
    case 'refunded':
      return { card: 'bg-red-50 border-red-200', amount: 'text-red-700' }
    case 'completed':
      return { card: 'bg-green-50 border-green-200', amount: 'text-green-700' }
    case 'in_progress':
      return { card: 'bg-amber-50 border-amber-200', amount: 'text-amber-700' }
    case 'assigned':
      return { card: 'bg-blue-50 border-blue-200', amount: 'text-blue-700' }
    case 'paid':
      return { card: 'bg-white border-slate-200', amount: 'text-purple-700' }
    default:
      return { card: 'bg-white border-slate-200', amount: 'text-slate-700' }
  }
}

function StatusPill({ status }) {
  const map = {
    paid: { label: 'Awaiting driver', style: 'bg-slate-100 text-slate-600' },
    assigned: { label: 'Driver assigned', style: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'In progress', style: 'bg-amber-100 text-amber-800' },
    completed: { label: 'Completed', style: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Cancelled', style: 'bg-red-100 text-red-700' },
    refunded: { label: 'Refunded', style: 'bg-red-100 text-red-700' },
  }
  const m = map[status] || { label: status || '—', style: 'bg-slate-100 text-slate-600' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.style}`}>{m.label}</span>
}
