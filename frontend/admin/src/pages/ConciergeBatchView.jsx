import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function ConciergeBatchView() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!token) { setError('No token provided'); setLoading(false); return }
    fetch(`/api/public/concierge-batch?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Invalid Link</h1>
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    </div>
  )

  const batch = data.batch
  const isManual = batch.status === 'manual' || !batch.stripe_transfer_id
  const paidDate = batch.released_at ? new Date(batch.released_at).toLocaleDateString() : '—'

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Payment Receipt</p>
          <h1 className="text-xl font-bold text-slate-900">{batch.recipient_name}</h1>
          <div className="mt-4 pb-4 border-b border-slate-100">
            <p className="text-xs text-slate-400">Total Paid</p>
            <p className="text-4xl font-bold text-green-700">${batch.total_amount.toFixed(2)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">Date</p>
              <p className="font-medium">{paidDate}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Payment Method</p>
              {isManual ? (
                <span className="inline-block text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">Manual</span>
              ) : (
                <div>
                  <span className="inline-block text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Stripe</span>
                  <p className="font-mono text-xs text-slate-500 mt-0.5 break-all">{batch.stripe_transfer_id}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-400">Commissions</p>
              <p className="font-medium">{batch.split_count}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Period</p>
              <p className="font-medium text-xs">{batch.period_start?.slice(0, 10)} — {batch.period_end?.slice(0, 10)}</p>
            </div>
          </div>
        </div>

        {/* By Cashier */}
        {data.by_cashier && data.by_cashier.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Breakdown by Cashier</h2>
            <div className="divide-y divide-slate-100">
              {data.by_cashier.map(c => {
                const isOpen = expanded === c.cashier_id
                return (
                  <div key={c.cashier_id}>
                    <button onClick={() => setExpanded(isOpen ? null : c.cashier_id)}
                      className="w-full flex items-center justify-between py-3 hover:bg-slate-50 text-left px-2 -mx-2 rounded-lg">
                      <span className="flex items-center gap-2">
                        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="font-medium text-sm">{c.cashier_name}</span>
                      </span>
                      <span className="font-bold text-sm">${c.total.toFixed(2)} <span className="text-xs text-slate-400 font-normal">({c.count})</span></span>
                    </button>
                    {isOpen && (
                      <div className="bg-slate-50/60 rounded-lg p-3 mb-2 space-y-1.5">
                        {c.rides.map(r => (
                          <div key={r.split_id} className="flex items-center justify-between text-xs">
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-slate-400">{r.booking_number}</p>
                              <p className="text-slate-700 truncate">{r.route}</p>
                              <p className="text-slate-400">{r.pickup_date}</p>
                            </div>
                            <p className="font-bold shrink-0 ml-2">${r.amount.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-4">
          Questions about this payment? Contact the admin.
        </p>
      </div>
    </div>
  )
}
