import { Routes, Route, Navigate } from 'react-router-dom'
import { SettingsProvider } from './hooks/useSettings.jsx'
import { useAuth } from './hooks/useAuth'
import Layout from './components/admin/Layout'
import Dashboard from './pages/admin/Dashboard'
import Runs from './pages/admin/Runs'
import Payouts from './pages/admin/Payouts'
import Drivers from './pages/admin/Drivers'
import DriverDetail from './pages/admin/DriverDetail'
import Cashiers from './pages/admin/Cashiers'
import CashierDetail from './pages/admin/CashierDetail'
import Hotels from './pages/admin/Hotels'
import Concierges from './pages/admin/Concierges'
import ConciergeDetail from './pages/admin/ConciergeDetail'
import Pricing from './pages/admin/Pricing'
import PickupGroups from './pages/admin/PickupGroups'
import Upsales from './pages/admin/Upsales'
import RunDetail from './pages/admin/RunDetail'
import Reviews from './pages/admin/Reviews'
import Notifications from './pages/admin/Notifications'
import Settings from './pages/admin/Settings'

export default function AdminApp() {
  const auth = useAuth()
  return (
    <SettingsProvider>
      <Layout auth={auth}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="runs" element={<Runs />} />
          <Route path="runs/:bookingId" element={<RunDetail />} />
          <Route path="payouts" element={<Payouts />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="drivers/:driverId" element={<DriverDetail />} />
          <Route path="cashiers" element={<Cashiers />} />
          <Route path="cashiers/:cashierId" element={<CashierDetail />} />
          <Route path="hotels" element={<Hotels />} />
          <Route path="concierges" element={<Concierges />} />
          <Route path="concierges/:id" element={<ConciergeDetail />} />
          <Route path="pricing" element={<Pricing />} />
          <Route path="pickup-groups" element={<PickupGroups />} />
          <Route path="upsales" element={<Upsales />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Layout>
    </SettingsProvider>
  )
}
