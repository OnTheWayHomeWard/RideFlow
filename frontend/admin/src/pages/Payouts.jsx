import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const TABS = ['pending', 'batches']
const TAB_LABELS = { pending: 'Pending by Driver', batches: 'All Batches' }

export default function Payouts() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [drivers, setDrivers] = useState([])
  const [batches, setBatches] = useState([])
  const [selectedDriverId, setSelectedDriverId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState(false)

  const loadPending = () => {
    setLoading(true)
    api.getDriversWithPending().then(setDrivers).catch(() => {}).finally(() => setLoading(false))
  }
  const loadBatches = () => {
    setLoading(true)
    api.getPayoutBatches().then(setBatches).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'pending') loadPending()
    else loadBatches()
  }, [tab])

  useEffect(() => {
    if (selectedDriverId) {
      api.getDriverPayoutPreview(selectedDriverId).then(setPreview).catch(() => {})
    } else {
      setPreview(null)
    }
  }, [selectedDriverId])

  const handleRelease = async () => {
    if (!preview || !selectedDriverId) return
    if (!confirm(`Release $${preview.total.toFixed(2)} for ${preview.split_count} rides?`)) return
    setReleasing(true)
    try {
      const res = await api.executeDriverPayout(selectedDriverId, { release_all: true })
      if (res.status === "released") {
        alert(`Payout released! Stripe transfer: ${res.stripe_transfer_id || 'dev mode'}`)
      } else {
        alert(`Status: ${res.status}${res.failure_reason ? ` — ${res.failure_reason}` : ''}`)
      }
      setSelectedDriverId(null)
      loadPending()
    } catch (err) { alert(err.message) }
    finally { setReleasing(false) }
  }

  const handleRetry = async (batchId) => {
    try {
      const res = await api.retryBatch(batchId)
      if (res.status === 'released') {
        alert(`Transfer succeeded!\n\nStripe transfer ID: ${res.stripe_transfer_id}`)
      } else if (res.status === 'transfer_failed') {
        const msg = `Transfer failed again.\n\nError details:\n${res.failure_reason || 'No details'}`
        // Also copy to clipboard for easy sharing
        try { await navigator.clipboard.writeText(res.failure_reason || '') } catch {}
        alert(msg + '\n\n(Error copied to clipboard)')
      } else {
        alert(`Status: ${res.status}`)
      }
      loadBatches()
    } catch (err) { alert(err.message) }
  }

  const handleManual = async (batchId) => {
    const note = prompt('Reference/note for manual settlement:')
    if (note === null) return
    try {
      await api.markBatchManual(batchId, note)
      loadBatches()
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-4">Driver Payouts</h1>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : tab === 'pending' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Driver list */}
          <div className="space-y-2">
            {drivers.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                No drivers with pending payouts
              </div>
            ) : drivers.map(d => (
              <div key={d.driver_id} onClick={() => setSelectedDriverId(d.driver_id)}
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${selectedDriverId === d.driver_id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{d.name}</p>
                      {d.stripe_connected && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Stripe</span>}
                    </div>
                    <p className="text-xs text-slate-500">{d.phone}</p>
                    <p className="text-xs text-slate-500 mt-1">{d.ride_count} rides</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Owed</p>
                    <p className="font-bold text-amber-600 text-lg">${d.total_owed.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Preview panel */}
          <div>
            {!selectedDriverId ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                Select a driver to view pending rides
              </div>
            ) : !preview ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-4">
                <h3 className="font-bold mb-3">Pending Rides</h3>
                <div className="mb-3">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-2xl font-bold text-amber-600">${preview.total.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{preview.split_count} rides</p>
                </div>

                <div className="space-y-1.5 max-h-80 overflow-y-auto mb-4">
                  {preview.rides.map(r => (
                    <button key={r.split_id} onClick={() => r.booking_id && navigate(`/runs/${r.booking_id}`)}
                      className={`w-full text-left text-xs border-l-2 pl-2 py-1 rounded-r ${r.rating && r.rating <= 2 ? 'border-red-300 bg-red-50 hover:bg-red-100' : 'border-slate-200 hover:bg-slate-50'} transition-colors`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-400">{r.booking_number}</span>
                        <span className="font-bold">${r.amount.toFixed(2)}</span>
                      </div>
                      <p className="text-slate-600 truncate">{r.route}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-slate-400">{r.pickup_date}</p>
                        {r.rating && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            {[1,2,3,4,5].map(s => (
                              <svg key={s} className={`w-3 h-3 ${s <= r.rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            ))}
                          </div>
                        )}
                      </div>
                      {r.comment && (
                        <p className="text-xs text-slate-500 italic truncate mt-0.5" title={r.comment}>"{r.comment}"</p>
                      )}
                    </button>
                  ))}
                </div>

                <button onClick={handleRelease} disabled={releasing}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-60">
                  {releasing ? 'Releasing...' : `Release $${preview.total.toFixed(2)} for ${preview.split_count} rides`}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Batches tab */
        <div className="space-y-2">
          {batches.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No payout batches yet</div>
          ) : batches.map(b => (
            <div key={b.id} className={`bg-white border rounded-xl p-4 ${b.status === 'transfer_failed' ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-mono text-xs text-slate-400">{b.id.slice(0, 8)}</p>
                  <p className="font-semibold">{b.recipient_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{b.recipient_type} • {b.split_count} items</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">${b.total_amount.toFixed(2)}</p>
                  <StatusBadge status={b.status} />
                </div>
              </div>
              {b.stripe_transfer_id && <p className="text-xs text-slate-400 font-mono">Stripe: {b.stripe_transfer_id}</p>}
              {b.failure_reason && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-red-700 break-all flex-1">{b.failure_reason}</p>
                    <button onClick={() => navigator.clipboard.writeText(b.failure_reason).then(() => alert('Copied!'))}
                      className="text-xs text-red-600 hover:text-red-800 shrink-0 px-1.5 py-0.5 bg-red-100 rounded">Copy</button>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">{b.created_at ? new Date(b.created_at).toLocaleString() : ''}</p>

              {b.status === 'transfer_failed' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => handleRetry(b.id)} className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">Retry</button>
                  <button onClick={() => handleManual(b.id)} className="flex-1 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">Mark Manual</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
    released: { bg: 'bg-green-100', text: 'text-green-700', label: 'Released' },
    transfer_failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
    manual: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Manual' },
  }[status] || { bg: 'bg-slate-100', text: 'text-slate-700', label: status }
  return <span className={`text-xs ${cfg.bg} ${cfg.text} px-2 py-0.5 rounded-full font-medium`}>{cfg.label}</span>
}
