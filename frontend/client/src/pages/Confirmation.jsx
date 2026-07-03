import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings.jsx'

export default function Confirmation() {
  const { bookingNumber } = useParams()
  const settings = useSettings()
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [submittingRating, setSubmittingRating] = useState(false)

  const handleSubmitRating = async () => {
    if (rating === 0) return
    setSubmittingRating(true)
    try {
      await api.submitRating(bookingNumber, { rating, comment })
      setRatingSubmitted(true)
    } catch (e) { /* already rated or error */ setRatingSubmitted(true) }
    finally { setSubmittingRating(false) }
  }

  const [cancelEligibility, setCancelEligibility] = useState(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState(null)

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

  // Fetch cancellation eligibility once we have the booking (low-frequency,
  // just to decide whether to show the Cancel button).
  useEffect(() => {
    if (!booking || booking.status === 'cancelled') return
    api.getCancellationEligibility(bookingNumber)
      .then(setCancelEligibility)
      .catch(() => setCancelEligibility(null))
  }, [booking, bookingNumber])

  const handleCancel = async () => {
    if (cancelling) return
    setCancelling(true)
    try {
      const res = await api.cancelBooking(bookingNumber)
      setCancelResult(res)
      // Refresh booking state so the page redraws as cancelled
      const fresh = await api.getBookingStatus(bookingNumber).catch(() => null)
      if (fresh) setBooking(fresh)
      setCancelOpen(false)
    } catch (e) {
      alert(e.message || 'Could not cancel the booking. Please try again or contact support.')
    } finally {
      setCancelling(false)
    }
  }

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
        {settings.company_logo_url ? (
          <img src={settings.company_logo_url} alt="" className="w-8 h-8 object-contain rounded-lg" />
        ) : (
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
        )}
        <span className="font-bold text-lg">{settings.company_name || 'RideFlow'}</span>
        <span className="ml-auto text-xs bg-white/20 px-2.5 py-1 rounded-full">Confirmation</span>
      </header>

      {/* Dynamic status banner — cancelled/refunded switch the whole strip to
          red so the state is obvious the moment the rider lands. Previously
          cancelled fell through to the green "Ride Booked" fallback. */}
      <div className={`border-b px-4 py-3 flex items-center gap-3 ${
        booking.status === 'cancelled' || booking.status === 'refunded' ? 'bg-red-50 border-red-100' :
        booking.status === 'in_progress' ? 'bg-amber-50 border-amber-100' :
        booking.status === 'completed' ? 'bg-green-50 border-green-100' :
        booking.status === 'assigned' ? 'bg-blue-50 border-blue-100' :
        'bg-green-50 border-green-100'
      }`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          booking.status === 'cancelled' || booking.status === 'refunded' ? 'bg-red-100' :
          booking.status === 'in_progress' ? 'bg-amber-100' :
          booking.status === 'completed' ? 'bg-green-100' :
          booking.status === 'assigned' ? 'bg-blue-100' :
          'bg-green-100'
        }`}>
          {booking.status === 'cancelled' || booking.status === 'refunded' ? '✕' :
           booking.status === 'in_progress' ? '🚗' :
           booking.status === 'completed' ? '✓' :
           booking.status === 'assigned' ? '👤' : '✓'}
        </div>
        <div>
          <p className={`font-bold text-sm ${
            booking.status === 'cancelled' || booking.status === 'refunded' ? 'text-red-900' :
            booking.status === 'in_progress' ? 'text-amber-900' :
            booking.status === 'completed' ? 'text-green-900' :
            booking.status === 'assigned' ? 'text-blue-900' :
            'text-green-900'
          }`}>
            {booking.status === 'cancelled' ? 'Ride Cancelled' :
             booking.status === 'refunded' ? 'Ride Refunded' :
             booking.status === 'in_progress' ? 'Ride in Progress' :
             booking.status === 'completed' ? 'Ride Completed' :
             booking.status === 'assigned' ? 'Driver Assigned' :
             'Ride Booked'}
          </p>
          <p className="text-xs text-slate-500">Booking #{bookingNumber}</p>
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
        <div className="grid grid-cols-2 gap-3 mb-1">
          <DetailCard label="Date" value={formatDate(booking.pickup_date)} icon="📅" />
          <DetailCard label="Time" value={formatTime(booking.pickup_time)} icon="🕐" />
          <DetailCard label="Vehicle" value={booking.vehicle_type?.toUpperCase()} icon="🚐" />
          <DetailCard label="Total Paid" value={`$${booking.total_amount}`} icon="💳" />
        </div>
        <p className="text-[11px] text-slate-400 mb-5 text-center">All pickup times shown in {tzShortLabel(settings.business_timezone)}</p>

        {/* Cancelled state — replaces the driver block. Rendered in red so
            it's obvious this ride isn't happening; a green "confirmed" strip
            here would give riders the wrong impression at a glance. */}
        {booking.status === 'cancelled' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-red-900 mb-0.5">This booking has been cancelled</p>
                {cancelResult?.refund_amount > 0 ? (
                  <p className="text-xs text-red-700">
                    A refund of <b>${cancelResult.refund_amount.toFixed(2)}</b> has been issued to your card right away.
                  </p>
                ) : (
                  <p className="text-xs text-red-700">Your ride was cancelled and any refund owed has been issued to your original payment method.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cancel button — only when the eligibility check says yes */}
        {booking.status !== 'cancelled' && cancelEligibility?.cancellable && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
            <p className="text-sm font-semibold text-amber-900 mb-1">Need to cancel?</p>
            <p className="text-xs text-amber-700 mb-3">
              {cancelEligibility.refund_percent >= 100
                ? `Free cancellation up to ${Math.round(cancelEligibility.window_hours)}h before pickup. Cancel now for a full refund.`
                : `Cancel up to ${Math.round(cancelEligibility.window_hours)}h before pickup and get ${(+cancelEligibility.refund_percent).toFixed(0)}% back ($${(+cancelEligibility.estimated_refund).toFixed(2)}).`}
            </p>
            <button onClick={() => setCancelOpen(true)} disabled={cancelling}
              className="w-full bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-60 rounded-xl py-2.5 text-sm font-semibold transition-colors">
              {cancelling ? 'Cancelling…' : 'Cancel ride'}
            </button>
          </div>
        )}

        {/* Cancel confirmation modal */}
        {cancelOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
            onClick={() => !cancelling && setCancelOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Cancel this ride?</h2>
              <p className="text-sm text-slate-500 mb-4">
                {cancelEligibility?.refund_percent >= 100 ? (
                  <>You'll receive a full refund of <b className="text-slate-900">${(+booking.total_amount).toFixed(2)}</b>.</>
                ) : (
                  <>You'll receive a <b className="text-slate-900">{(+cancelEligibility?.refund_percent || 0).toFixed(0)}%</b> refund of <b className="text-slate-900">${(+(cancelEligibility?.estimated_refund ?? 0)).toFixed(2)}</b>.</>
                )}{' '}
                It usually appears on your statement within 5–10 business days. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setCancelOpen(false)} disabled={cancelling}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold">
                  Keep ride
                </button>
                <button onClick={handleCancel} disabled={cancelling}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Driver section — hidden for cancelled bookings; the red cancel
            card above already tells the whole story and a green "Booking
            confirmed!" strip underneath would contradict it. */}
        {booking.status === 'cancelled' ? null : hasDriver ? (
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

        {/* Rating form — shows when ride is in_progress or completed and not yet rated */}
        {(booking.status === 'in_progress' || booking.status === 'completed') && !booking.has_rated && !ratingSubmitted && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
            <h3 className="font-semibold text-sm text-amber-900 mb-3">How was your ride?</h3>
            <div className="flex justify-center gap-2 mb-3">
              {[1,2,3,4,5].map(s => (
                <button key={s} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setRating(s)} className="transition-transform hover:scale-110 active:scale-95">
                  <svg className={`w-10 h-10 ${(hover || rating) >= s ? 'text-amber-400' : 'text-slate-200'} transition-colors`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
            {rating > 0 && (
              <>
                <textarea value={comment}
                  onChange={e => { setComment(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  rows={1}
                  placeholder="Any comments? (optional)"
                  className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-3 placeholder:text-slate-400 overflow-hidden" />
                <button onClick={handleSubmitRating} disabled={submittingRating}
                  className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-60">
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Rating thank you */}
        {(ratingSubmitted || booking.has_rated) && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5 text-center">
            <p className="text-green-700 font-medium text-sm">Thank you for your feedback!</p>
          </div>
        )}

        {/* Helpful info section — hidden entirely if neither phone nor email is set */}
        {(settings.company_phone || settings.company_email) && (
          <div className="border-t border-slate-100 pt-5 mb-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Need help?</p>
            <div className="space-y-2">
              {settings.company_phone && (
                <a
                  href={`tel:${settings.company_phone}`}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Call us</p>
                    <p className="text-xs text-slate-500">{settings.company_phone}</p>
                  </div>
                </a>
              )}
              {settings.company_email && (
                <a
                  href={`mailto:${settings.company_email}`}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Email support</p>
                    <p className="text-xs text-slate-500">{settings.company_email}</p>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}

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

// Friendly short label for the business timezone shown next to pickup times.
// Falls back to "ET" since that's our default operating region.
function tzShortLabel(tzName) {
  const map = {
    'America/New_York': 'Eastern Time (ET)',
    'America/Chicago': 'Central Time (CT)',
    'America/Denver': 'Mountain Time (MT)',
    'America/Phoenix': 'Mountain Time (MT, no DST)',
    'America/Los_Angeles': 'Pacific Time (PT)',
    'America/Anchorage': 'Alaska Time (AKT)',
    'Pacific/Honolulu': 'Hawaii Time (HT)',
  }
  if (tzName && map[tzName]) return map[tzName]
  if (tzName) return tzName.split('/').pop().replace(/_/g, ' ')
  return 'Eastern Time (ET)'
}
