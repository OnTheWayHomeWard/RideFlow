import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.getMe().then(setProfile).catch(() => {}).finally(() => setLoading(false)) }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!profile) return <p className="text-center text-slate-400 py-16">Failed to load</p>

  return (
    <div className="p-4 pb-20">
      {/* Avatar + name */}
      <div className="text-center mb-5">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-2xl font-bold text-blue-700 mx-auto mb-2">
          {profile.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{profile.name}</h1>
        <p className="text-sm text-slate-500">{profile.vehicle_type?.toUpperCase()} Driver</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          {profile.rating_avg > 0 && (
            <>
              {[1,2,3,4,5].map(s => (
                <svg key={s} className={`w-4 h-4 ${s <= Math.round(profile.rating_avg) ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
              <span className="text-xs text-slate-500 ml-1">{profile.rating_avg}</span>
            </>
          )}
        </div>
      </div>

      {/* Personal info */}
      <Section title="Personal">
        <InfoGrid items={[
          { label: 'Phone', value: profile.phone },
          { label: 'Email', value: profile.email || '—' },
          { label: 'Total Rides', value: profile.total_rides },
          { label: 'Status', value: profile.status, capitalize: true },
        ]} />
      </Section>

      {/* Vehicle */}
      <Section title="Vehicle">
        <InfoGrid items={[
          { label: 'Type', value: profile.vehicle_type?.toUpperCase() },
          { label: 'Make', value: profile.vehicle_make || '—' },
          { label: 'Plate', value: profile.vehicle_plate || '—', mono: true },
          { label: 'Color', value: profile.vehicle_color || '—' },
        ]} />
      </Section>

      {/* Payout */}
      {profile.payout_method && (
        <Section title="Payout">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-slate-400">Method</p><p className="font-medium capitalize">{profile.payout_method}</p></div>
            {profile.payout_details && Object.entries(profile.payout_details).map(([k, v]) => (
              <div key={k}><p className="text-xs text-slate-400 capitalize">{k.replace(/_/g, ' ')}</p><p className="font-medium">{String(v)}</p></div>
            ))}
          </div>
        </Section>
      )}

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

      <p className="text-center text-xs text-slate-400 mt-6">Contact admin to update your personal or vehicle information.</p>
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

function InfoGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      {items.map((item, i) => (
        <div key={i}>
          <p className="text-xs text-slate-400">{item.label}</p>
          <p className={`font-medium text-slate-900 break-all ${item.mono ? 'font-mono text-xs' : ''} ${item.capitalize ? 'capitalize' : ''}`}>{item.value}</p>
        </div>
      ))}
    </div>
  )
}
