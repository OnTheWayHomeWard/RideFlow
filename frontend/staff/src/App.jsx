import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { SettingsProvider } from './hooks/useSettings.jsx'
import { useAuth } from './hooks/useAuth'
import RequireRole from './components/RequireRole'
import RolePicker from './pages/RolePicker'

import AdminApp from './AdminApp'
import DriverApp from './DriverApp'
import CashierApp from './CashierApp'

import AdminLogin from './pages/admin/Login'
import DriverLogin from './pages/driver/Login'
import CashierLogin from './pages/cashier/Login'

// Public (unauthenticated) admin pages — kept at top level since they have no role.
import ConciergeOnboarding from './pages/admin/ConciergeOnboarding'
import ConciergeOnboardingComplete from './pages/admin/ConciergeOnboardingComplete'
import ConciergeBatchView from './pages/admin/ConciergeBatchView'

import { api as driverApi } from './api/driverClient'

function AdminLoginRoute() {
  const auth = useAuth()
  return (
    <SettingsProvider>
      <AdminLogin auth={auth} />
    </SettingsProvider>
  )
}

function useStaffPublicSettings() {
  const [s, setS] = useState({ company_name: '', company_logo_url: '', available_countries: ['US'] })
  useEffect(() => { driverApi.getPublicSettings().then(setS).catch(() => {}) }, [])
  return s
}

function DriverLoginRoute() {
  const settings = useStaffPublicSettings()
  const onLogin = (token, name, pwChanged) => {
    localStorage.setItem('driver_token', token)
    localStorage.setItem('driver_name', name)
    localStorage.setItem('driver_pw_changed', pwChanged ? 'true' : 'false')
    localStorage.setItem('last_staff_role', 'driver')
  }
  return <DriverLogin onLogin={onLogin} settings={settings} />
}

function CashierLoginRoute() {
  const settings = useStaffPublicSettings()
  const onLogin = (token, name, pwChanged) => {
    localStorage.setItem('cashier_token', token)
    localStorage.setItem('cashier_name', name)
    localStorage.setItem('cashier_pw_changed', pwChanged ? 'true' : 'false')
    localStorage.setItem('last_staff_role', 'cashier')
  }
  return (
    <CashierLogin
      onLogin={onLogin}
      companyName={settings.company_name}
      logoUrl={settings.company_logo_url}
      countries={settings.available_countries}
    />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public concierge links — token in URL, no auth needed */}
        <Route path="/concierge-onboarding" element={<ConciergeOnboarding />} />
        <Route path="/concierge-onboarding/complete" element={<ConciergeOnboardingComplete />} />
        <Route path="/concierge-onboarding/refresh" element={<ConciergeOnboarding />} />
        <Route path="/concierge-batch" element={<ConciergeBatchView />} />

        {/* Role picker landing */}
        <Route path="/" element={<RolePicker />} />
        <Route path="/login" element={<RolePicker />} />

        {/* Per-role login pages */}
        <Route path="/admin/login"   element={<AdminLoginRoute />} />
        <Route path="/driver/login"  element={<DriverLoginRoute />} />
        <Route path="/cashier/login" element={<CashierLoginRoute />} />

        {/* Per-role app shells (auth-gated) */}
        <Route path="/admin/*"   element={<RequireRole role="admin"><AdminApp /></RequireRole>} />
        <Route path="/driver/*"  element={<RequireRole role="driver"><DriverApp /></RequireRole>} />
        <Route path="/cashier/*" element={<RequireRole role="cashier"><CashierApp /></RequireRole>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
