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
import Pricing from './pages/Pricing'
import Upsales from './pages/Upsales'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'

export default function App() {
  const auth = useAuth()

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
          <Route path="/payouts" element={<Payouts />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/drivers/:driverId" element={<DriverDetail />} />
          <Route path="/cashiers" element={<Cashiers />} />
          <Route path="/cashiers/:cashierId" element={<CashierDetail />} />
          <Route path="/hotels" element={<Hotels />} />
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
