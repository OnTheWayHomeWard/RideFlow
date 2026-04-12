import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Pagination from '../components/Pagination'

const TABS = ['pending_review', 'released', 'transfer_failed', 'flagged', 'rejected']
const TAB_LABELS = { pending_review: 'Pending', released: 'Released', transfer_failed: 'Failed Transfers', flagged: 'Flagged', rejected: 'Rejected' }

export default function Payouts() {
  const [tab, setTab] = useState('pending_review')
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = (p, t) => {
    setLoading(true)
    api.getPayouts(t, p, 10).then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { setPage(1); load(1, tab) }, [tab])
  useEffect(() => { load(page, tab) }, [page])

  const payouts = data.items || []

  const handleAction = async (id, action) => {
    const note = action !== 'release' ? prompt(`Reason for ${action}:`) : ''
    if (note === null) return
    try {
      if (action === 'release') await api.releasePayout(id, note || 'Verified')
      if (action === 'flag') await api.flagPayout(id, note)
      if (action === 'reject') await api.rejectPayout(id, note)
      if (action === 'retry') await api.retryTransfer(id)
      if (action === 'manual') {
        const manualNote = prompt('Enter transfer reference or note:')
        if (manualNote === null) return
        await api.markManualPayout(id, manualNote)
      }
      load(page, tab)
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-4">Completed Runs</h1>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : payouts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-400">No {TAB_LABELS[tab]?.toLowerCase()} payouts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map(p => (
            <div key={p.split_id} className={`bg-white border rounded-xl overflow-hidden ${p.client_rating && p.client_rating <= 2 ? 'border-red-200' : 'border-slate-200'}`}>
              {/* Top row: route + badge + money */}
              <div className="p-3 lg:p-4">
                {/* Row 1: Booking info + amounts */}
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-slate-400">{p.booking_number}</span>
                      <PayoutBadge status={p.payout_status} />
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{p.pickup_name} → {p.dropoff_name}</p>
                  </div>
                  {/* Money — always visible, right side */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-green-700">${p.company_profit}</p>
                    <p className="text-xs text-slate-400">profit</p>
                  </div>
                </div>

                {/* Row 2: People + money split — compact inline */}
                <div className="flex items-center gap-4 text-xs text-slate-500 mb-2 flex-wrap">
                  <span>Driver: <b className="text-slate-700">{p.driver_name}</b> <a href={`tel:${p.driver_phone}`} className="text-blue-600">call</a></span>
                  <span>Client: <b className="text-slate-700">{p.client_name}</b> <a href={`tel:${p.client_phone}`} className="text-blue-600">call</a></span>
                </div>

                {/* Row 3: Compact money + dates */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="bg-slate-100 px-2 py-1 rounded-md">Paid <b>${p.total_fare}</b></span>
                  <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">Driver <b>${p.driver_amount}</b></span>
                  <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md">Profit <b>${p.company_profit}</b></span>
                  {p.cashier_amount > 0 && <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md">Cashier <b>${p.cashier_amount}</b></span>}
                  <span className="text-slate-400 ml-auto">{p.pickup_date}</span>
                  {p.completed_at && <span className="text-slate-400">{fmtShort(p.completed_at)}</span>}
                </div>
              </div>

              {/* Feedback strip — compact, only if exists */}
              {(p.client_rating || p.client_comment) && (
                <div className={`px-3 lg:px-4 py-2 border-t flex items-center gap-2 ${p.client_rating && p.client_rating <= 2 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                  {p.client_rating && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      {[1,2,3,4,5].map(s => (
                        <svg key={s} className={`w-3 h-3 ${s <= p.client_rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      ))}
                    </span>
                  )}
                  {p.client_rating && p.client_rating <= 2 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Low</span>}
                  {p.client_comment && <p className="text-xs text-slate-600 italic truncate flex-1">"{p.client_comment}"</p>}
                </div>
              )}

              {/* Stripe transfer badge */}
              {tab === 'released' && (
                <div className="px-3 lg:px-4 py-1.5 border-t border-slate-100 bg-slate-50 flex items-center gap-2 text-xs">
                  {p.stripe_transfer_id ? (
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Stripe Transferred</span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Manual Payout</span>
                  )}
                  {p.stripe_transfer_id && <span className="text-slate-400 font-mono">{p.stripe_transfer_id}</span>}
                </div>
              )}

              {/* Actions — Pending */}
              {tab === 'pending_review' && (
                <div className="px-3 lg:px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-2 lg:justify-end">
                  {!p.driver_stripe_connected && (
                    <span className="text-xs text-amber-600 flex items-center gap-1 mr-auto">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      No Stripe — manual payout
                    </span>
                  )}
                  <button onClick={() => handleAction(p.split_id, 'release')}
                    className="flex-1 lg:flex-none px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                    Release ${p.driver_amount}
                  </button>
                  <button onClick={() => handleAction(p.split_id, 'flag')}
                    className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200">
                    Flag
                  </button>
                  <button onClick={() => handleAction(p.split_id, 'reject')}
                    className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">
                    Reject
                  </button>
                </div>
              )}

              {/* Actions — Failed Transfers */}
              {tab === 'transfer_failed' && (
                <div className="px-3 lg:px-4 py-2 border-t border-red-100 bg-red-50 flex gap-2 lg:justify-end">
                  <span className="text-xs text-red-600 mr-auto">Stripe transfer failed</span>
                  <button onClick={() => handleAction(p.split_id, 'retry')}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                    Retry Transfer
                  </button>
                  <button onClick={() => handleAction(p.split_id, 'manual')}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300">
                    Mark as Manual
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}

function fmtShort(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function PayoutBadge({ status }) {
  const styles = {
    pending_review: 'bg-amber-100 text-amber-800',
    released: 'bg-green-100 text-green-800',
    flagged: 'bg-red-100 text-red-800',
    rejected: 'bg-slate-100 text-slate-800',
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status] || 'bg-slate-100'}`}>{status?.replace('_', ' ')}</span>
}
