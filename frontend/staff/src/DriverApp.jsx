import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { api } from './api/driverClient'
import Dashboard from './pages/driver/Dashboard'
import ActiveRide from './pages/driver/ActiveRide'
import Schedule from './pages/driver/Schedule'
import Earnings from './pages/driver/Earnings'
import Profile from './pages/driver/Profile'
import RunDetail from './pages/driver/RunDetail'
import ChangePassword from './pages/driver/ChangePassword'

const NAV = [
  { to: '/driver', end: true, label: 'Runs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { to: '/driver/schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to: '/driver/earnings', label: 'Earnings', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { to: '/driver/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
]

export default function DriverApp() {
  const [pwChanged, setPwChanged] = useState(localStorage.getItem('driver_pw_changed') === 'true')
  const [settings, setSettings] = useState({ company_name: '', company_logo_url: '', available_countries: ['US'] })

  useEffect(() => {
    api.getPublicSettings().then(s => {
      setSettings(s)
      const name = s.company_name || 'RideFlow'
      document.title = `${name} — Driver`
      if (s.company_logo_url) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = s.company_logo_url
      }
    }).catch(() => {})
  }, [])

  const logout = () => {
    localStorage.removeItem('driver_token')
    localStorage.removeItem('driver_name')
    localStorage.removeItem('driver_pw_changed')
    window.location.href = '/driver/login'
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {settings.company_logo_url ? (
            <img src={settings.company_logo_url} alt="" className="w-8 h-8 object-contain rounded-lg" />
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          )}
          <span className="font-bold text-sm text-slate-800">{settings.company_name || 'RideFlow'}</span>
        </div>
        <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 font-medium">Sign out</button>
      </header>

      {!pwChanged && (
        <NavLink to="/driver/change-password" className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 hover:bg-amber-100">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-amber-800 font-medium">Please change your default password</p>
        </NavLink>
      )}

      <main className="flex-1 max-w-lg mx-auto w-full">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="ride/:bookingId" element={<ActiveRide settings={settings} />} />
          <Route path="run-detail/:runId" element={<RunDetail />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="profile" element={<Profile />} />
          <Route path="change-password" element={<ChangePassword onChanged={() => { setPwChanged(true); localStorage.setItem('driver_pw_changed', 'true') }} />} />
          <Route path="*" element={<Navigate to="/driver" replace />} />
        </Routes>
      </main>

      <nav className="bg-white border-t border-slate-200 px-2 py-2 flex justify-around sticky bottom-0">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={n.icon} /></svg>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
