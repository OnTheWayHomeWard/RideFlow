import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { api } from './api/cashierClient'
import Logo from './components/cashier/Logo'
import Dashboard from './pages/cashier/Dashboard'
import QRCode from './pages/cashier/QRCode'
import BookForGuest from './pages/cashier/BookForGuest'
import Reservations from './pages/cashier/Reservations'
import Referrals from './pages/cashier/Referrals'
import Profile from './pages/cashier/Profile'
import ChangePassword from './pages/cashier/ChangePassword'

export default function CashierApp() {
  const [passwordChanged, setPasswordChanged] = useState(localStorage.getItem('cashier_pw_changed') === 'true')
  const [settings, setSettings] = useState({ company_name: '', available_countries: ['US'] })

  useEffect(() => {
    api.getPublicSettings().then(s => {
      setSettings(s)
      const name = s.company_name || 'RideFlow'
      document.title = `${name} — Cashier`
      if (s.company_logo_url) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = s.company_logo_url
      }
    }).catch(() => {})
  }, [])

  const logout = () => {
    localStorage.removeItem('cashier_token')
    localStorage.removeItem('cashier_name')
    localStorage.removeItem('cashier_pw_changed')
    window.location.href = '/cashier/login'
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Logo url={settings.company_logo_url} size="sm" />
          <span className="font-bold text-sm text-slate-800">{settings.company_name || 'RideFlow'}</span>
        </div>
        <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 font-medium">Sign out</button>
      </header>

      {!passwordChanged && (
        <NavLink to="/cashier/change-password" className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 hover:bg-amber-100 transition-colors">
          <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm text-amber-800 font-medium">Please change your default password</p>
          <svg className="w-4 h-4 text-amber-400 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </NavLink>
      )}

      <main className="flex-1 max-w-lg mx-auto w-full">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="book-for-guest" element={<BookForGuest />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="qr" element={<QRCode />} />
          <Route path="referrals" element={<Referrals />} />
          <Route path="profile" element={<Profile />} />
          <Route path="change-password" element={<ChangePassword onChanged={() => { setPasswordChanged(true); localStorage.setItem('cashier_pw_changed', 'true') }} />} />
          <Route path="*" element={<Navigate to="/cashier" replace />} />
        </Routes>
      </main>

      <nav className="bg-white border-t border-slate-200 px-2 py-2 flex justify-around sticky bottom-0">
        <NavLink to="/cashier" end className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          Home
        </NavLink>
        <NavLink to="/cashier/book-for-guest" className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Book
        </NavLink>
        <NavLink to="/cashier/reservations" className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          Reservations
        </NavLink>
        <NavLink to="/cashier/profile" className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          Profile
        </NavLink>
      </nav>
    </div>
  )
}
