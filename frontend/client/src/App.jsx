import { BrowserRouter, Routes, Route } from 'react-router-dom'
import BookingWizard from './pages/BookingWizard'
import Confirmation from './pages/Confirmation'
import Rating from './pages/Rating'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <Routes>
          <Route path="/" element={<BookingWizard />} />
          <Route path="/book" element={<BookingWizard />} />
          <Route path="/confirmation/:bookingNumber" element={<Confirmation />} />
          <Route path="/rate/:bookingNumber" element={<Rating />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
