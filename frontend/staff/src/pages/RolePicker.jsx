import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ROLES = [
  {
    role: 'admin',
    label: 'Admin',
    blurb: 'Manage runs, drivers, payouts and settings.',
    color: 'bg-blue-600 hover:bg-blue-700',
    iconBg: 'bg-blue-100 text-blue-600',
    icon: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    role: 'driver',
    label: 'Driver',
    blurb: 'See available runs, start rides, and track earnings.',
    color: 'bg-emerald-600 hover:bg-emerald-700',
    iconBg: 'bg-emerald-100 text-emerald-600',
    icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  },
  {
    role: 'cashier',
    label: 'Cashier',
    blurb: 'Book for guests, share QR, view referrals.',
    color: 'bg-purple-600 hover:bg-purple-700',
    iconBg: 'bg-purple-100 text-purple-600',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
]

const TOKEN_KEY = { admin: 'admin_token', driver: 'driver_token', cashier: 'cashier_token' }

export default function RolePicker() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({ company_name: '', company_logo_url: '', client_base_url: '' })

  // Fetch public settings (logo, name, client URL). Endpoint is public — no auth needed.
  useEffect(() => {
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(s => {
        setSettings(s)
        if (s.company_name) document.title = `${s.company_name} — Staff`
        if (s.company_logo_url) {
          let link = document.querySelector("link[rel~='icon']")
          if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
          link.href = s.company_logo_url
        }
      })
      .catch(() => {})
  }, [])

  // If already logged in to a role, jump straight there. Prefer the most recently used.
  useEffect(() => {
    const last = localStorage.getItem('last_staff_role')
    const order = last ? [last, ...ROLES.map(r => r.role).filter(r => r !== last)] : ROLES.map(r => r.role)
    for (const role of order) {
      if (localStorage.getItem(TOKEN_KEY[role])) {
        navigate(`/${role}`, { replace: true })
        return
      }
    }
  }, [navigate])

  const pick = (role) => {
    localStorage.setItem('last_staff_role', role)
    navigate(`/${role}/login`)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {settings.company_logo_url ? (
            <img src={settings.company_logo_url} alt="" className="w-14 h-14 object-contain rounded-2xl mx-auto mb-4 bg-white/10 p-1" />
          ) : (
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{settings.company_name || 'RideFlow'} Staff</h1>
          <p className="text-slate-400 text-sm mt-1">Choose how you'd like to sign in</p>
        </div>

        <div className="space-y-3">
          {ROLES.map(r => (
            <button
              key={r.role}
              onClick={() => pick(r.role)}
              className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all text-left"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${r.iconBg}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={r.icon} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{r.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{r.blurb}</p>
              </div>
              <svg className="w-5 h-5 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>

        {settings.client_base_url && (
          <p className="text-center text-xs text-slate-500 mt-6">
            Looking to book a ride? <a href={settings.client_base_url} className="text-blue-400 hover:underline">Open the booking app</a>
          </p>
        )}
      </div>
    </div>
  )
}
