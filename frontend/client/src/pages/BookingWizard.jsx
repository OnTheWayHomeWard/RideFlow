import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings.jsx'
import StepRoute from '../components/StepRoute'
import StepVehicle from '../components/StepVehicle'
import StepConfirm from '../components/StepConfirm'
import Toast from '../components/Toast'

export default function BookingWizard() {
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [cashierRef, setCashierRef] = useState(null)
  const [cashierInfo, setCashierInfo] = useState(null)
  const [toast, setToast] = useState(null)
  const [booking, setBooking] = useState({
    pickup: null,
    dropoff: null,
    vehicle: null,
    prices: [],
    date: '',
    time: '',
    extras: [],
    clientName: '',
    clientPhone: '',
    clientRoom: '',
  })

  const settings = useSettings()
  const isQREntry = searchParams.has('ref')

  const showToast = (message, type = 'error') => {
    setToast({ message, type })
  }

  // Parse QR cashier ref from URL
  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) {
      setCashierRef(ref)
      api.validateCashier(ref).then(info => {
        setCashierInfo(info)
        setBooking(prev => ({
          ...prev,
          pickup: {
            name: info.hotel_name || 'Hotel',
            address: info.hotel_address || '',
            lat: info.hotel_lat || 39.74,
            lng: info.hotel_lng || -104.99,
          }
        }))
      }).catch(() => {
        showToast('Invalid QR code. Please try again or enter your pickup manually.', 'warning')
      })
    }
  }, [searchParams])

  const handleRouteSelect = (pickup, dropoff) => {
    setBooking(prev => ({ ...prev, pickup, dropoff }))
    // Fetch prices for all vehicles
    api.calculateAllPrices({
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
    }).then(prices => {
      setBooking(prev => ({ ...prev, prices }))
      setStep(2)
    }).catch(err => showToast(err.message, 'error'))
  }

  const handleVehicleSelect = (vehicle) => {
    setBooking(prev => ({ ...prev, vehicle }))
    setStep(3)
  }

  const goBack = () => setStep(s => Math.max(1, s - 1))

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        {step > 1 && (
          <button onClick={goBack} className="p-1 -ml-1 text-slate-600 hover:text-slate-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex items-center gap-2">
          {settings.company_logo_url ? (
            <img src={settings.company_logo_url} alt="" className="w-8 h-8 object-contain rounded-lg" />
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
          )}
          <span className="font-bold text-lg text-slate-800">{settings.company_name || 'RideFlow'}</span>
        </div>
        {/* Step indicator */}
        <div className="ml-auto flex gap-1.5">
          {[1,2,3].map(s => (
            <div key={s} className={`h-1.5 rounded-full transition-all ${s === step ? 'w-6 bg-blue-600' : s < step ? 'w-4 bg-blue-300' : 'w-4 bg-slate-200'}`} />
          ))}
        </div>
      </header>

      {/* Steps */}
      <main className="flex-1">
        {step === 1 && (
          <StepRoute
            booking={booking}
            cashierInfo={cashierInfo}
            isQREntry={isQREntry}
            onSelect={handleRouteSelect}
            onError={(msg) => showToast(msg, 'error')}
          />
        )}
        {step === 2 && (
          <StepVehicle
            prices={booking.prices}
            pickup={booking.pickup}
            dropoff={booking.dropoff}
            onSelect={handleVehicleSelect}
          />
        )}
        {step === 3 && (
          <StepConfirm
            booking={booking}
            setBooking={setBooking}
            cashierRef={cashierRef}
            onBack={goBack}
          />
        )}
      </main>
    </div>
  )
}

