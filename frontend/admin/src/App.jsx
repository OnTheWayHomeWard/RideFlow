import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SettingsProvider } from './hooks/useSettings.jsx'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Runs from './pages/Runs'
import Payouts from './pages/Payouts'
import Drivers from './pages/Drivers'
import DriverDetail from './pages/DriverDetail'
import Cashiers from './pages/Cashiers'
import CashierDetail from './pages/CashierDetail'
import Hotels from './pages/Hotels'
import Concierges from './pages/Concierges'
import ConciergeDetail from './pages/ConciergeDetail'
import Pricing from './pages/Pricing'
import Upsales from './pages/Upsales'
import RunDetail from './pages/RunDetail'
import Reviews from './pages/Reviews'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import ConciergeOnboarding from './pages/ConciergeOnboarding'
import ConciergeOnboardingComplete from './pages/ConciergeOnboardingComplete'
import ConciergeBatchView from './pages/ConciergeBatchView'

export default function App() {
  const auth = useAuth()

  // Public routes — accessible without login
  const path = window.location.pathname
  if (path.startsWith('/concierge-onboarding')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/concierge-onboarding" element={<ConciergeOnboarding />} />
          <Route path="/concierge-onboarding/complete" element={<ConciergeOnboardingComplete />} />
          <Route path="/concierge-onboarding/refresh" element={<ConciergeOnboarding />} />
        </Routes>
      </BrowserRouter>
    )
  }
  if (path.startsWith('/concierge-batch')) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/concierge-batch" element={<ConciergeBatchView />} />
        </Routes>
      </BrowserRouter>
    )
  }

  if (!auth.isLoggedIn) {
    return (
      <SettingsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login auth={auth} />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    )
  }

  return (
    <SettingsProvider>
      <BrowserRouter>
        <Layout auth={auth}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/runs/:bookingId" element={<RunDetail />} />
          <Route path="/payouts" element={<Payouts />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/drivers/:driverId" element={<DriverDetail />} />
          <Route path="/cashiers" element={<Cashiers />} />
          <Route path="/cashiers/:cashierId" element={<CashierDetail />} />
          <Route path="/hotels" element={<Hotels />} />
          <Route path="/concierges" element={<Concierges />} />
          <Route path="/concierges/:id" element={<ConciergeDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/upsales" element={<Upsales />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
      </BrowserRouter>
    </SettingsProvider>
  )
}
