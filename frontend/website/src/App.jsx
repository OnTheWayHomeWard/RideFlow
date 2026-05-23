import { Routes, Route, Navigate } from 'react-router-dom'
import { useSettings } from './lib'
import Landing from './pages/Landing'
import PrivacyPolicy from './pages/PrivacyPolicy'
import Terms from './pages/Terms'
import SmsTerms from './pages/SmsTerms'
import Contact from './pages/Contact'

export default function App() {
  const site = useSettings()  // { settings, bookUrl, brandName } — fetched once, shared
  return (
    <Routes>
      <Route path="/" element={<Landing site={site} />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy site={site} />} />
      <Route path="/terms-and-conditions" element={<Terms site={site} />} />
      <Route path="/sms-terms" element={<SmsTerms site={site} />} />
      <Route path="/contact" element={<Contact site={site} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
