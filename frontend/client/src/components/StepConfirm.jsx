import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings.jsx'
import Toast from './Toast'
import PhoneInput from './PhoneInput'
import TimeSelect from './TimeSelect'

export default function StepConfirm({ booking, setBooking, cashierRef, onBack }) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [extrasList, setExtrasList] = useState([])
  const [smsConsent, setSmsConsent] = useState(false)
  // Forced extras from a matching pickup-group (e.g. airports auto-add Extra Luggage)
  const [forcedExtras, setForcedExtras] = useState([])  // list of slugs
  const [forcedGroupNames, setForcedGroupNames] = useState([])

  useEffect(() => {
    api.getExtras().then(setExtrasList).catch(() => {})
  }, [])

  // Match pickup against pickup-groups whenever pickup changes
  useEffect(() => {
    const lat = booking?.pickup?.lat
    const lng = booking?.pickup?.lng
    if (!lat || !lng) { setForcedExtras([]); setForcedGroupNames([]); return }
    api.matchPickupGroup(lat, lng).then(matches => {
      const slugs = []
      const names = []
      for (const m of matches || []) {
        if (m.group_name && !names.includes(m.group_name)) names.push(m.group_name)
        for (const s of (m.forced_extra_slugs || [])) if (!slugs.includes(s)) slugs.push(s)
      }
      setForcedExtras(slugs)
      setForcedGroupNames(names)
      // Make sure each forced slug is selected
      if (slugs.length) {
        setBooking(prev => {
          const merged = [...prev.extras]
          for (const s of slugs) if (!merged.includes(s)) merged.push(s)
          return merged.length === prev.extras.length ? prev : { ...prev, extras: merged }
        })
      }
    }).catch(() => { setForcedExtras([]); setForcedGroupNames([]) })
  }, [booking?.pickup?.lat, booking?.pickup?.lng])

  const vehicle = booking.vehicle
  const extrasTotal = booking.extras.reduce((sum, slug) => {
    const e = extrasList.find(x => x.slug === slug)
    return sum + (e ? e.price : 0)
  }, 0)
  const total = (vehicle?.total_amount || 0) + extrasTotal

  const minAdvanceHours = settings.min_advance_booking_hours || 0.5
  const earliestPickup = new Date(Date.now() + minAdvanceHours * 60 * 60 * 1000)
  // Use LOCAL date (not UTC) — toISOString() shifts by timezone
  const localDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const today = localDateStr(earliestPickup)
  const maxDate = localDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
  // For min time, only enforce if selected date == today's earliest date
  const minTimeOnEarliestDate = booking.date === today
    ? `${String(earliestPickup.getHours()).padStart(2,'0')}:${String(earliestPickup.getMinutes()).padStart(2,'0')}`
    : '00:00'

  const formatAdvance = (h) => {
    if (h < 1) {
      const m = Math.round(h * 60)
      return `${m} minute${m === 1 ? '' : 's'}`
    }
    const hrs = Math.floor(h)
    const mins = Math.round((h - hrs) * 60)
    if (mins) return `${hrs}h ${mins}m`
    return `${hrs} hour${hrs === 1 ? '' : 's'}`
  }

  const hasRoomPickup = booking.extras.includes('room_pickup')

  const toggleExtra = (slug) => {
    if (forcedExtras.includes(slug)) return  // can't uncheck a forced extra
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
    // Enforce minimum advance booking time
    const pickupDateTime = new Date(`${booking.date}T${booking.time}`)
    if (pickupDateTime < earliestPickup) {
      setToast({ message: `Pickup must be at least ${formatAdvance(minAdvanceHours)} from now`, type: 'error' })
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
    // SMS consent is OPTIONAL (Twilio A2P 10DLC 30923 — consent cannot be a
    // condition of service use). The rider can complete the booking with or
    // without the SMS checkbox.

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
        pickup_country: booking.pickup.country || null,
        dropoff_name: booking.dropoff.name,
        dropoff_address: booking.dropoff.address,
        dropoff_lat: booking.dropoff.lat,
        dropoff_lng: booking.dropoff.lng,
        dropoff_country: booking.dropoff.country || null,
        pickup_date: booking.date,
        pickup_time: booking.time + ':00',
        // Browser's offset for the SELECTED date (handles DST correctly).
        // Server uses this to convert local pickup -> UTC before storing.
        pickup_tz_offset_minutes: new Date(`${booking.date}T${booking.time}:00`).getTimezoneOffset(),
        passengers: 1,
        luggage: 'none',
        vehicle_type: vehicle.vehicle_type,
        extras: booking.extras,
        cashier_ref_code: cashierRef || null,
        sms_consent: !!smsConsent,
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
          <div className="flex-1">
            <TimeSelect
              value={booking.time}
              minTime={minTimeOnEarliestDate}
              onChange={t => setBooking(prev => ({ ...prev, time: t }))}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">Pickup must be at least {formatAdvance(minAdvanceHours)} from now.</p>
      </Section>

      {/* Your info — placed before add-ons so it's always visible */}
      <Section title="Your info">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="What should we call you?"
            value={booking.clientName}
            onChange={e => setBooking(prev => ({ ...prev, clientName: e.target.value }))}
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
          <PhoneInput
            value={booking.clientPhone}
            onChange={v => setBooking(prev => ({ ...prev, clientPhone: v }))}
            placeholder="Phone number"
          />
        </div>
      </Section>

      {/* Add-ons */}
      {extrasList.length > 0 && (
        <Section title="Add-ons">
          {forcedGroupNames.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex items-start gap-2">
              <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-blue-800">
                Pickup detected at <b>{forcedGroupNames.join(', ')}</b>.
                {' '}Required add-ons have been included automatically.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {extrasList.map(extra => {
              const isForced = forcedExtras.includes(extra.slug)
              const isChecked = booking.extras.includes(extra.slug) || isForced
              return (
              <label
                key={extra.slug}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isForced
                    ? 'bg-blue-50 border-blue-300 cursor-not-allowed'
                    : isChecked
                      ? 'bg-blue-50 border-blue-300 cursor-pointer'
                      : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isForced}
                  onChange={() => toggleExtra(extra.slug)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  isChecked
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-slate-300'
                }`}>
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="flex-1 text-sm text-slate-700">
                  {extra.name}
                  {isForced && <span className="ml-2 text-xs text-blue-600 font-medium">(required)</span>}
                </span>
                <span className="text-sm font-semibold text-slate-900">+${extra.price}</span>
              </label>
              )
            })}
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

      {/* SMS consent — OPTIONAL (Twilio A2P 10DLC 30923 compliance) */}
      <div className="mb-5">
        <label className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer">
          <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-blue-600" />
          <span className="text-xs text-slate-500 leading-relaxed">
            <b className="text-slate-700">(Optional)</b> Send me booking confirmations, ride reminders, and status updates
            by text message from {settings.company_name || 'us'} at the number provided. Message frequency varies.
            Message &amp; data rates may apply. Reply STOP to opt out, HELP for help.
            <span className="block mt-1 text-slate-400">Booking does not require text-message consent — you can leave this unchecked.</span>
            {(() => {
              const w = (settings.website_base_url || '').replace(/\/$/, '')
              if (!w) return null
              return (
                <span className="block mt-1">See our{' '}
                  <a href={`${w}/sms-terms`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">SMS Terms</a>{' '}and{' '}
                  <a href={`${w}/privacy-policy`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Privacy Policy</a>.</span>
              )
            })()}
          </span>
        </label>
      </div>

      {/* Spacer so content isn't hidden behind the fixed pay bar */}
      <div className="h-4"></div>

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
