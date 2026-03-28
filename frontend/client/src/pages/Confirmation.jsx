import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'

export default function Confirmation() {
  const { bookingNumber } = useParams()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = () => {
      api.getBookingStatus(bookingNumber)
        .then(data => {
          setBooking(data)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
    fetchStatus()
    // Poll every 15s for driver assignment updates
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [bookingNumber])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20 10 10 0 010-20z" />
            </svg>
          </div>
          <p className="text-slate-500 font-medium">Booking not found</p>
          <p className="text-sm text-slate-400 mt-1">This link may have expired or the booking doesn't exist.</p>
          <Link to="/" className="inline-block mt-4 text-blue-600 font-medium text-sm">Book a new ride</Link>
        </div>
      </div>
    )
  }

  const hasDriver = !!booking.driver_name

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-white">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-4 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <span className="font-bold text-lg">RideFlow</span>
        <span className="ml-auto text-xs bg-white/20 px-2.5 py-1 rounded-full">Confirmation</span>
      </header>

      {/* Success banner */}
      <div className="bg-green-50 border-b border-green-100 px-4 py-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0 animate-[bounceIn_0.5s_ease]">
          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-green-900">Ride Booked!</p>
          <p className="text-xs text-green-700">Your confirmation receipt</p>
        </div>
      </div>

      <div className="p-4">
        {/* Booking number */}
        <div className="text-center mb-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Booking Reference</p>
          <p className="text-lg font-mono font-bold text-slate-900 mt-0.5">{bookingNumber}</p>
        </div>

        {/* Route card */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 mt-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <div className="w-px h-10 bg-slate-300"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="flex-1">
              <div className="mb-3">
                <p className="text-xs text-slate-400">Pickup</p>
                <p className="font-semibold text-sm text-slate-900">{booking.pickup_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Destination</p>
                <p className="font-semibold text-sm text-slate-900">{booking.dropoff_name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <DetailCard label="Date" value={formatDate(booking.pickup_date)} icon="📅" />
          <DetailCard label="Time" value={formatTime(booking.pickup_time)} icon="🕐" />
          <DetailCard label="Vehicle" value={booking.vehicle_type?.toUpperCase()} icon="🚐" />
          <DetailCard label="Total Paid" value={`$${booking.total_amount}`} icon="💳" />
        </div>

        {/* Driver section */}
        {hasDriver ? (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-5">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-3">Your Driver</p>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-blue-200 rounded-full flex items-center justify-center text-xl font-bold text-blue-700">
                {booking.driver_name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-900">{booking.driver_name}</p>
                <p className="text-sm text-slate-500">
                  {booking.driver_vehicle} {booking.driver_color && `• ${booking.driver_color}`}
                </p>
                {booking.driver_plate && (
                  <p className="text-sm font-mono bg-blue-100 inline-block px-2 py-0.5 rounded mt-1 font-semibold">{booking.driver_plate}</p>
                )}
              </div>
              {booking.driver_phone && (
                <a
                  href={`tel:${booking.driver_phone}`}
                  className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shrink-0"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-green-800">Booking confirmed!</p>
            </div>
            <p className="text-xs text-green-700 mt-1 ml-7">Your driver will contact you before the pickup time.</p>
            <p className="text-xs text-green-600 mt-1 ml-7">This page will update automatically when a driver is assigned.</p>
          </div>
        )}

        {/* Helpful info section */}
        <div className="border-t border-slate-100 pt-5 mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Need help?</p>
          <div className="space-y-2">
            <a
              href="tel:5550000000"
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Call us</p>
                <p className="text-xs text-slate-500">(555) 000-0000</p>
              </div>
            </a>
            <a
              href="mailto:support@rideflow.com"
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Email support</p>
                <p className="text-xs text-slate-500">support@rideflow.com</p>
              </div>
            </a>
          </div>
        </div>

        {/* Tip */}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 flex items-start gap-2">
          <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-slate-500">Save this page as your ride confirmation. You can come back to it anytime using the link we sent you.</p>
        </div>

        {/* spacer for fixed bottom button */}
        <div className="h-20"></div>
      </div>

      {/* Sticky bottom button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20">
        <div className="max-w-lg mx-auto">
          <Link
            to="/"
            className="block w-full text-center bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            Book Another Ride
          </Link>
        </div>
      </div>
    </div>
  )
}

function DetailCard({ label, value, icon }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  )
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}
