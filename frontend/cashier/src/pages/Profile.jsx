import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'

export default function Profile() {
  const [searchParams] = useSearchParams()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stripe, setStripe] = useState(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeMsg, setStripeMsg] = useState('')

  useEffect(() => { api.getMe().then(setProfile).catch(() => {}).finally(() => setLoading(false)) }, [])

  useEffect(() => {
    api.stripeStatus().then(setStripe).catch(() => {})
    if (searchParams.get('stripe') === 'complete') {
      setStripeMsg('Stripe account connected successfully!')
      setTimeout(() => setStripeMsg(''), 5000)
      api.stripeStatus().then(setStripe).catch(() => {})
    }
  }, [])

  const handleStripeConnect = async () => {
    setStripeLoading(true)
    try {
      const res = await api.stripeConnect()
      if (res.already_connected) {
        setStripe({ connected: true, ...res.details })
      } else if (res.onboarding_url) {
        window.location.href = res.onboarding_url
      }
    } catch (e) { alert(e.message) }
    finally { setStripeLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!profile) return <p className="text-center text-slate-400 py-16">Failed to load</p>

  return (
    <div className="p-4 pb-20">
      {/* Header */}
      <div className="text-center mb-5">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-2xl font-bold text-purple-700 mx-auto mb-2">
          {profile.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
        <p className="text-sm text-slate-500">{profile.hotel_name} • {profile.commission_pct}% commission</p>
      </div>

      {/* Personal */}
      <Section title="Personal">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">Phone</p><p className="font-medium">{profile.phone}</p></div>
          <div><p className="text-xs text-slate-400">Email</p><p className="font-medium break-all">{profile.email || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Ref Code</p><p className="font-mono font-medium">{profile.ref_code}</p></div>
          <div><p className="text-xs text-slate-400">Status</p><p className="font-medium capitalize">{profile.status}</p></div>
        </div>
      </Section>

      {/* Stripe Connect */}
      <Section title="Payout Account">
        {stripeMsg && (
          <div className="mb-3 bg-green-50 border border-green-200 rounded-lg p-2.5 text-sm text-green-700 font-medium">{stripeMsg}</div>
        )}
        {stripe?.connected && stripe?.charges_enabled ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-green-700">Stripe Connected</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {stripe.name && <div><p className="text-xs text-slate-400">Account Name</p><p className="font-medium">{stripe.name}</p></div>}
              {stripe.email && <div><p className="text-xs text-slate-400">Email</p><p className="font-medium break-all">{stripe.email}</p></div>}
              {stripe.bank_name && <div><p className="text-xs text-slate-400">Bank</p><p className="font-medium">{stripe.bank_name}</p></div>}
              {stripe.bank_last4 && <div><p className="text-xs text-slate-400">Account</p><p className="font-mono font-medium">****{stripe.bank_last4}</p></div>}
            </div>
          </div>
        ) : stripe?.connected && !stripe?.charges_enabled ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span className="text-sm font-medium text-amber-700">Setup Incomplete</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Complete your Stripe setup to receive commission payouts automatically.</p>
            <button onClick={handleStripeConnect} disabled={stripeLoading}
              className="w-full py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-60">
              {stripeLoading ? 'Loading...' : 'Complete Setup'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-slate-500 mb-3">Connect your Stripe account to receive commission payouts automatically when clients pay for rides.</p>
            <button onClick={handleStripeConnect} disabled={stripeLoading}
              className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-60">
              {stripeLoading ? 'Connecting...' : 'Connect with Stripe'}
            </button>
          </div>
        )}
      </Section>

      {/* Actions */}
      <div className="space-y-2 mt-4">
        <Link to="/change-password" className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            <span className="text-sm text-slate-700">Change Password</span>
          </div>
          <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </Link>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-xl p-4">{children}</div>
    </div>
  )
}
