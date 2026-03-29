import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { api } from './api/client'
import Logo from './components/Logo'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import QRCode from './pages/QRCode'
import Referrals from './pages/Referrals'
import ChangePassword from './pages/ChangePassword'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('cashier_token'))
  const [passwordChanged, setPasswordChanged] = useState(localStorage.getItem('cashier_pw_changed') === 'true')
  const [settings, setSettings] = useState({ company_name: '', available_countries: ['US'] })

  useEffect(() => {
    api.getPublicSettings().then(setSettings).catch(() => {})
  }, [])

  const login = (accessToken, name, pwChanged) => {
    localStorage.setItem('cashier_token', accessToken)
    localStorage.setItem('cashier_name', name)
    localStorage.setItem('cashier_pw_changed', pwChanged ? 'true' : 'false')
    setToken(accessToken)
    setPasswordChanged(pwChanged)
  }
  const logout = () => {
    localStorage.removeItem('cashier_token')
    localStorage.removeItem('cashier_name')
    localStorage.removeItem('cashier_pw_changed')
    setToken(null)
  }

  if (!token) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login onLogin={login} companyName={settings.company_name} logoUrl={settings.company_logo_url} countries={settings.available_countries} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Logo url={settings.company_logo_url} size="sm" />
            <span className="font-bold text-sm text-slate-800">{settings.company_name || 'RideFlow'}</span>
          </div>
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 font-medium">Sign out</button>
        </header>

        {/* Password change reminder */}
        {!passwordChanged && (
          <NavLink to="/change-password" className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 hover:bg-amber-100 transition-colors">
            <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm text-amber-800 font-medium">Please change your default password</p>
            <svg className="w-4 h-4 text-amber-400 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </NavLink>
        )}

        {/* Content */}
        <main className="flex-1 max-w-lg mx-auto w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/qr" element={<QRCode />} />
            <Route path="/referrals" element={<Referrals />} />
            <Route path="/change-password" element={<ChangePassword onChanged={() => { setPasswordChanged(true); localStorage.setItem('cashier_pw_changed', 'true') }} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        {/* Bottom nav */}
        <nav className="bg-white border-t border-slate-200 px-4 py-2 flex justify-around sticky bottom-0">
          <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            Home
          </NavLink>
          <NavLink to="/qr" className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
            QR Code
          </NavLink>
          <NavLink to="/referrals" className={({ isActive }) => `flex flex-col items-center gap-0.5 text-xs font-medium ${isActive ? 'text-purple-600' : 'text-slate-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Referrals
          </NavLink>
        </nav>
      </div>
    </BrowserRouter>
  )
}
