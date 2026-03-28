import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import Toast from './Toast'

export default function StepConfirm({ booking, setBooking, cashierRef, onBack }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [extrasList, setExtrasList] = useState([])

  useEffect(() => {
    api.getExtras().then(setExtrasList).catch(() => {})
  }, [])

  const vehicle = booking.vehicle
  const extrasTotal = booking.extras.reduce((sum, slug) => {
    const e = extrasList.find(x => x.slug === slug)
    return sum + (e ? e.price : 0)
  }, 0)
  const total = (vehicle?.total_amount || 0) + extrasTotal

  const today = new Date().toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const hasRoomPickup = booking.extras.includes('room_pickup')

  const toggleExtra = (slug) => {
    setBooking(prev => {
      const newExtras = prev.extras.includes(slug)
        ? prev.extras.filter(s => s !== slug)
        : [...prev.extras, slug]
      // Clear room number if room_pickup is unchecked
      if (slug === 'room_pickup' && prev.extras.includes(slug)) {
        return { ...prev, extras: newExtras, clientRoom: '' }
      }
      return { ...prev, extras: newExtras }
    })
  }

  const handlePay = async () => {
    if (!booking.date) {
      setToast({ message: 'Please select a pickup date', type: 'warning' })
      return
    }
    if (!booking.time) {
      setToast({ message: 'Please select a pickup time', type: 'warning' })
      return
    }
    if (booking.date < today) {
      setToast({ message: 'The pickup date cannot be in the past', type: 'error' })
      return
    }
    if (!booking.clientName.trim()) {
      setToast({ message: 'Please tell us what to call you', type: 'warning' })
      return
    }
    if (!booking.clientPhone.trim()) {
      setToast({ message: 'We need your phone number to send you the confirmation', type: 'warning' })
      return
    }
    if (hasRoomPickup && !booking.clientRoom.trim()) {
      setToast({ message: 'Please enter your room number for room pickup', type: 'warning' })
      return
    }

    setLoading(true)

    try {
      const result = await api.createBooking({
        client_name: booking.clientName,
        client_phone: booking.clientPhone,
        client_room: booking.clientRoom || null,
        pickup_name: booking.pickup.name,
        pickup_address: booking.pickup.address,
        pickup_lat: booking.pickup.lat,
        pickup_lng: booking.pickup.lng,
        dropoff_name: booking.dropoff.name,
        dropoff_address: booking.dropoff.address,
        dropoff_lat: booking.dropoff.lat,
        dropoff_lng: booking.dropoff.lng,
        pickup_date: booking.date,
        pickup_time: booking.time + ':00',
        passengers: 1,
        luggage: 'none',
        vehicle_type: vehicle.vehicle_type,
        extras: booking.extras,
        cashier_ref_code: cashierRef || null,
      })

      const checkout = await api.createCheckout(result.booking_number)

      if (checkout.mode === 'dev_simulation') {
        await fetch(checkout.checkout_url)
        navigate(`/confirmation/${result.booking_number}`)
      } else {
        window.location.href = checkout.checkout_url
      }
    } catch (err) {
      setToast({ message: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 pb-36 animate-[fadeIn_0.3s_ease]">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <h2 className="text-xl font-bold text-slate-900 mb-4">Confirm your ride</h2>

      {/* Route + Vehicle summary — tappable to go back */}
      <button
        onClick={onBack}
        className="w-full bg-white border border-slate-200 rounded-xl p-3 mb-5 flex items-center gap-3 hover:border-blue-300 transition-all text-left"
      >
        <div className="w-16 h-12 bg-slate-50 rounded-lg flex items-center justify-center">
          <img
            src={vehicle?.image_url || `https://img.icons8.com/fluency/100/${vehicle?.vehicle_type === 'van' ? 'shuttle-bus' : vehicle?.vehicle_type === 'large_van' ? 'bus2' : vehicle?.vehicle_type || 'sedan'}.png`}
            alt="" className="w-12 h-12 object-contain"
          />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-slate-900">{vehicle?.display_name}</p>
          <p className="text-xs text-slate-500">{booking.pickup?.name} → {booking.dropoff?.name}</p>
        </div>
        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>

      {/* When */}
      <Section title="When">
        <div className="flex gap-3">
          <input
            type="date"
            value={booking.date}
            min={today}
            max={maxDate}
            onChange={e => setBooking(prev => ({ ...prev, date: e.target.value }))}
            className="flex-1 px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="time"
            value={booking.time}
            onChange={e => setBooking(prev => ({ ...prev, time: e.target.value }))}
            className="flex-1 px-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Section>

      {/* Add-ons */}
      {extrasList.length > 0 && (
        <Section title="Add-ons">
          <div className="space-y-2">
            {extrasList.map(extra => (
              <label
                key={extra.slug}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  booking.extras.includes(extra.slug)
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={booking.extras.includes(extra.slug)}
                  onChange={() => toggleExtra(extra.slug)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  booking.extras.includes(extra.slug)
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-slate-300'
                }`}>
                  {booking.extras.includes(extra.slug) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="flex-1 text-sm text-slate-700">{extra.name}</span>
                <span className="text-sm font-semibold text-slate-900">+${extra.price}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      {/* Room number — only when room pickup is selected */}
      {hasRoomPickup && (
        <Section title="Room details">
          <input
            type="text"
            placeholder="Room number"
            value={booking.clientRoom}
            onChange={e => setBooking(prev => ({ ...prev, clientRoom: e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
        </Section>
      )}

      {/* Your info */}
      <Section title="Your info">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="What should we call you?"
            value={booking.clientName}
            onChange={e => setBooking(prev => ({ ...prev, clientName: e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={booking.clientPhone}
            onChange={e => setBooking(prev => ({ ...prev, clientPhone: e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
        </div>
      </Section>

      {/* Fixed bottom pay bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-slate-500">{vehicle?.display_name}</p>
              {extrasTotal > 0 && (
                <p className="text-xs text-slate-400">+ ${extrasTotal} add-ons</p>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</p>
          </div>
          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Pay ${total.toFixed(2)}
              </>
            )}
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">Secure payment via Stripe</p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">{title}</h3>
      {children}
    </div>
  )
}
