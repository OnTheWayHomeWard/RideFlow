import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Dashboard() {
  const [profile, setProfile] = useState(null)
  const [earnings, setEarnings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getMe(), api.getEarnings()])
      .then(([p, e]) => { setProfile(p); setEarnings(e) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!profile) return <p className="text-center text-slate-400 py-16">Failed to load</p>

  return (
    <div className="p-4">
      {/* Welcome */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Hi, {profile.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">{profile.hotel_name || 'Cashier'}</p>
      </div>

      {/* Earnings cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <EarnCard label="All Time" amount={earnings?.total?.amount} referrals={earnings?.total?.referrals} accent />
        <EarnCard label="Today" amount={earnings?.today?.amount} referrals={earnings?.today?.referrals} />
        <EarnCard label="This Week" amount={earnings?.this_week?.amount} referrals={earnings?.this_week?.referrals} />
        <EarnCard label="This Month" amount={earnings?.this_month?.amount} referrals={earnings?.this_month?.referrals} />
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <Link to="/book-for-guest" className="block bg-purple-600 text-white rounded-xl p-4 hover:bg-purple-700 transition-all">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <div>
              <p className="font-semibold">Book for Guest</p>
              <p className="text-sm text-purple-200">Create reservation & send payment link</p>
            </div>
          </div>
        </Link>

        <Link to="/qr" className="block bg-white border border-purple-200 text-purple-700 rounded-xl p-4 hover:bg-purple-50 transition-all">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <div>
              <p className="font-semibold">View Your QR Code</p>
              <p className="text-sm text-purple-400">Show to guests to book themselves</p>
            </div>
          </div>
        </Link>

        <Link to="/referrals" className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-purple-300 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-900">View Referrals</p>
              <p className="text-sm text-slate-500">{profile.total_referrals} bookings through your QR</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Profile info — read only */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Your Info</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">Name</p><p className="font-medium">{profile.name}</p></div>
          <div><p className="text-xs text-slate-400">Phone</p><p className="font-medium">{profile.phone}</p></div>
          <div><p className="text-xs text-slate-400">Hotel</p><p className="font-medium">{profile.hotel_name || '—'}</p></div>
          <div><p className="text-xs text-slate-400">QR Code</p><p className="font-mono font-medium">{profile.ref_code}</p></div>
          <div><p className="text-xs text-slate-400">Commission</p><p className="font-medium">{profile.commission_pct}%</p></div>
          <div><p className="text-xs text-slate-400">Status</p><p className="font-medium capitalize">{profile.status}</p></div>
        </div>

        {/* Payout info — paid through concierge */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">Your commissions are settled through your concierge.</p>
        </div>

        <Link to="/change-password" className="mt-3 flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-sm text-slate-600">Change Password</span>
          </div>
          <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

function EarnCard({ label, amount, referrals, accent }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-purple-50 border border-purple-200' : 'bg-white border border-slate-200'}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-purple-700' : 'text-slate-900'}`}>${(amount || 0).toFixed(2)}</p>
      <p className="text-xs text-slate-400">{referrals || 0} referrals</p>
    </div>
  )
}
