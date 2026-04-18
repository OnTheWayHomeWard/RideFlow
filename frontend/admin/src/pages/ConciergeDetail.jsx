import { useState, useEffect } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'

export default function ConciergeDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [concierge, setConcierge] = useState(null)
  const [preview, setPreview] = useState(null)
  const [stripe, setStripe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.getConciergeDetail(id),
      api.getConciergePayoutPreview(id),
      api.conciergeStripeStatus(id).catch(() => null),
    ]).then(([c, p, s]) => { setConcierge(c); setPreview(p); setStripe(s) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [id])

  const handleGenerateLink = async () => {
    try {
      const res = await api.generateConciergeOnboardingLink(id)
      await navigator.clipboard.writeText(res.link).catch(() => {})
      const msg = `Onboarding link copied to clipboard!\n\nExpires in ${res.expires_in_days} days.\n\nSend this to the concierge:\n${res.link}`
      alert(msg)
    } catch (e) { alert(e.message) }
  }

  const handleRelease = async () => {
    if (!confirm(`Release $${preview.total.toFixed(2)} to ${concierge.name}? This will pay out ${preview.split_count} commissions across ${preview.by_cashier.length} cashiers.`)) return
    setReleasing(true)
    try {
      const res = await api.executeConciergePayout(id, { release_all: true })
      if (res.status === "released") {
        alert(`Payout released! Stripe transfer ID: ${res.stripe_transfer_id || 'N/A'}`)
      } else if (res.status === "transfer_failed") {
        alert(`Transfer failed: ${res.failure_reason}`)
      } else {
        alert(`Status: ${res.status}`)
      }
      load()
    } catch (err) { alert(err.message) }
    finally { setReleasing(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!concierge) return <div className="p-6 text-center text-slate-400">Concierge not found</div>

  return (
    <div className="p-4 lg:p-6 pb-24">
      <Link to="/concierges" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Concierges
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{concierge.name}</h1>
            <p className="text-sm text-slate-500">{concierge.phone}{concierge.email ? ` • ${concierge.email}` : ''}</p>
          </div>
          <div className="flex gap-2">
            {concierge.stripe_connect_id ? (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">Stripe Connected</span>
            ) : (
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">No Stripe</span>
            )}
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${concierge.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{concierge.status}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 text-sm">
          <div>
            <p className="text-xs text-slate-400">Total Paid Out</p>
            <p className="font-bold text-green-700">${concierge.total_paid_out?.toFixed(2) || '0.00'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Hotels</p>
            <p className="font-bold">{concierge.hotels.length}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Cashiers</p>
            <p className="font-bold">{concierge.cashiers.length}</p>
          </div>
        </div>
      </div>

      {/* Stripe Connect */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <h2 className="font-bold text-slate-900 mb-3">Stripe Connect</h2>
        {stripe?.connected && stripe?.charges_enabled ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-green-700">Connected & Active</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {stripe.name && <div><p className="text-xs text-slate-400">Account</p><p className="font-medium">{stripe.name}</p></div>}
              {stripe.email && <div><p className="text-xs text-slate-400">Email</p><p className="font-medium break-all">{stripe.email}</p></div>}
              {stripe.bank_name && <div><p className="text-xs text-slate-400">Bank</p><p className="font-medium">{stripe.bank_name}</p></div>}
              {stripe.bank_last4 && <div><p className="text-xs text-slate-400">Last 4</p><p className="font-mono font-medium">****{stripe.bank_last4}</p></div>}
            </div>
          </div>
        ) : stripe?.connected && !stripe?.charges_enabled ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span className="text-sm font-medium text-amber-700">Setup Incomplete</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Concierge's Stripe account needs additional info. Send them the onboarding link so they can complete setup themselves.</p>
            <button onClick={handleGenerateLink}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold">
              Generate Onboarding Link
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500 mb-3">Generate a secure onboarding link to send the concierge via SMS, email, or chat. They'll set up their Stripe account directly — you never see their banking info.</p>
            <button onClick={handleGenerateLink}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
              Generate Onboarding Link
            </button>
            <p className="text-xs text-slate-400 mt-2">Link is valid for 7 days.</p>
          </div>
        )}
      </div>

      {/* Payout preview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <h2 className="font-bold text-slate-900 mb-3">Pending Payout</h2>
        {preview.total === 0 ? (
          <p className="text-slate-400 text-sm">No pending commissions to pay out.</p>
        ) : (
          <>
            <div className="mb-3">
              <p className="text-xs text-slate-400">Total Owed</p>
              <p className="text-3xl font-bold text-amber-600">${preview.total.toFixed(2)}</p>
              <p className="text-xs text-slate-500">{preview.split_count} commissions across {preview.by_cashier.length} cashiers</p>
            </div>

            {/* By hotel */}
            {preview.by_hotel.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 uppercase font-medium mb-1">By Hotel</p>
                {preview.by_hotel.map(h => (
                  <div key={h.hotel_id} className="flex items-center justify-between py-1 text-sm">
                    <span>{h.hotel_name}</span>
                    <span className="font-medium">${h.total.toFixed(2)} <span className="text-xs text-slate-400">({h.count})</span></span>
                  </div>
                ))}
              </div>
            )}

            {/* By cashier */}
            {preview.by_cashier.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 uppercase font-medium mb-1">By Cashier</p>
                {preview.by_cashier.map(c => (
                  <div key={c.cashier_id} className="flex items-center justify-between py-1 text-sm">
                    <span>{c.cashier_name}</span>
                    <span className="font-medium">${c.total.toFixed(2)} <span className="text-xs text-slate-400">({c.count})</span></span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleRelease} disabled={releasing}
              className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-60">
              {releasing ? 'Releasing...' : `Release $${preview.total.toFixed(2)}`}
            </button>
            {!concierge.stripe_connect_id && (
              <p className="text-xs text-amber-600 mt-2 text-center">No Stripe connected — will be marked as manual settlement</p>
            )}
          </>
        )}
      </div>

      {/* Hotels + Cashiers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs text-slate-400 uppercase font-medium mb-2">Hotels</h3>
          {concierge.hotels.length === 0 ? <p className="text-sm text-slate-400">No hotels assigned</p> : (
            <div className="space-y-1">
              {concierge.hotels.map(h => (
                <div key={h.id} className="text-sm">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-slate-500">{h.address}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-xs text-slate-400 uppercase font-medium mb-2">Cashiers</h3>
          {concierge.cashiers.length === 0 ? <p className="text-sm text-slate-400">No cashiers yet</p> : (
            <div className="space-y-1">
              {concierge.cashiers.map(c => (
                <div key={c.id} className="text-sm flex items-center justify-between">
                  <span>{c.name}</span>
                  <span className="text-xs text-slate-400">{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
