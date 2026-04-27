import { useState, useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings'

export default function Settings() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleSave = async (key, value) => {
    setSaving(key)
    try {
      let parsed = value
      if (value === 'true') parsed = true
      else if (value === 'false') parsed = false
      else if (!isNaN(value) && value !== '') parsed = Number(value)
      await api.updateSetting(key, parsed)
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: parsed } : s))
    } catch (err) { alert(err.message) }
    finally { setSaving(null) }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  // Separate logo from the rest
  const logoSetting = settings.find(s => s.key === 'company_logo_url')
  const otherSettings = settings.filter(s => s.key !== 'company_logo_url')

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-5">Settings</h1>

      {/* Logo card — special treatment */}
      {logoSetting && <LogoCard setting={logoSetting} saving={saving === logoSetting.key} onSave={handleSave} />}

      {/* Group settings by category */}
      <SettingsGroup title="Company" settings={otherSettings.filter(s => s.key.startsWith('company_'))} saving={saving} onSave={handleSave} />
      <SettingsGroup title="Payment & Commissions" settings={otherSettings.filter(s => ['default_driver_pay_pct','default_cashier_commission_pct','cashier_commission_enabled','driver_payout_schedule','late_cancel_refund_pct','max_active_runs_per_driver'].includes(s.key))} saving={saving} onSave={handleSave} />
      <SettingsGroup title="Booking" settings={otherSettings.filter(s => ['booking_window_days','cancellation_window_hours','unassigned_alert_minutes','review_expiry_days','min_advance_booking_hours'].includes(s.key))} saving={saving} onSave={handleSave} />
      <SettingsGroup title="Driver Priority" settings={otherSettings.filter(s => ['priority_delay_normal_minutes','priority_delay_low_minutes'].includes(s.key))} saving={saving} onSave={handleSave} />
      {/* Service Area — countries */}
      {(settings.find(s => s.key === 'service_areas') || settings.find(s => s.key === 'available_countries')) && (
        <ServiceAreasEditor
          setting={settings.find(s => s.key === 'service_areas') || { key: 'service_areas', value: [] }}
          crossCountrySetting={settings.find(s => s.key === 'allow_cross_country_booking')}
          saving={saving === 'service_areas'}
          onSave={handleSave}
        />
      )}

      <SettingsGroup title="Stripe Connect" settings={otherSettings.filter(s => ['stripe_connect_enabled', 'payout_currency'].includes(s.key))} saving={saving} onSave={handleSave} />
      <SettingsGroup title="Notifications" settings={otherSettings.filter(s => s.key === 'sms_enabled')} saving={saving} onSave={handleSave} />
      <SmsTemplates settings={otherSettings.filter(s => s.key.startsWith('sms_') && s.key !== 'sms_enabled')} saving={saving} onSave={handleSave} />
    </div>
  )
}

function LogoCard({ setting, saving, onSave }) {
  const [value, setValue] = useState(String(setting.value || ''))
  const changed = value !== String(setting.value || '')
  const hasImage = value && value.startsWith('http')

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="w-16 h-16 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
          {hasImage ? (
            <img src={value} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">Company Logo</p>
          <p className="text-xs text-slate-400 mb-2">Paste an image URL. Leave empty for default icon.</p>
          <div className="flex gap-2">
            <input value={value} onChange={e => setValue(e.target.value)} placeholder="https://..."
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {changed && (
              <button onClick={() => onSave(setting.key, value)} disabled={saving}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60 shrink-0">
                {saving ? '...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const FRIENDLY_NAMES = {
  company_name: 'Company Name',
  company_phone: 'Company Phone',
  default_driver_pay_pct: 'Driver Pay %',
  default_cashier_commission_pct: 'Cashier Commission %',
  cashier_commission_enabled: 'Cashier Commissions',
  max_active_runs_per_driver: 'Max Active Runs / Driver',
  booking_window_days: 'Booking Window (days)',
  cancellation_window_hours: 'Free Cancellation (hours)',
  late_cancel_refund_pct: 'Late Cancel Refund %',
  sms_enabled: 'SMS Notifications',
  unassigned_alert_minutes: 'Unassigned Alert (min)',
  driver_payout_schedule: 'Driver Payout Schedule',
  review_expiry_days: 'Review Expiry (days)',
  min_advance_booking_hours: 'Min Advance Booking (hours)',
  sms_cashier_referral: 'Cashier Referral SMS',
  sms_cashier_payout: 'Cashier Payout SMS',
  sms_client_booking: 'Client Booking Confirmation SMS',
  sms_client_ride_started: 'Client Ride Started SMS',
  sms_guest_payment_link: 'Guest Payment Link SMS',
  sms_driver_new_run: 'Driver New Run SMS',
  sms_driver_ride_completed: 'Driver Ride Completed SMS',
  sms_driver_payout_released: 'Driver Payout Released SMS',
  sms_driver_payout_flagged: 'Driver Payout Flagged SMS',
  sms_driver_payout_rejected: 'Driver Payout Rejected SMS',
  sms_driver_run_cancelled: 'Driver Run Reassigned SMS',
  sms_concierge_batch_link: 'Concierge Batch Receipt Link SMS',
  sms_client_refund: 'Client Refund SMS',
  priority_delay_normal_minutes: 'Normal Priority Delay (min)',
  priority_delay_low_minutes: 'Low Priority Delay (min)',
  stripe_connect_enabled: 'Stripe Connect Payouts',
  payout_currency: 'Payout Currency (usd, eur, gbp)',
  available_countries: 'Available Countries',
}

function SettingsGroup({ title, settings, saving, onSave }) {
  if (!settings || settings.length === 0) return null
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {settings.map((s, i) => (
          <SettingRow key={s.key} setting={s} saving={saving === s.key} onSave={onSave} border={i < settings.length - 1} />
        ))}
      </div>
    </div>
  )
}

const SMS_VARIABLES = {
  sms_cashier_referral: ['cashier_name', 'amount', 'client_name', 'route', 'total_earnings', 'booking_number'],
  sms_cashier_payout: ['cashier_name', 'amount', 'booking_number'],
  sms_client_booking: ['client_name', 'pickup_name', 'dropoff_name', 'pickup_date', 'booking_number', 'confirmation_url'],
  sms_client_ride_started: ['client_name', 'driver_name', 'pickup_name', 'dropoff_name', 'booking_number', 'confirmation_url'],
  sms_guest_payment_link: ['client_name', 'hotel_name', 'pickup_name', 'dropoff_name', 'pickup_date', 'pickup_time', 'total_amount', 'payment_url', 'booking_number'],
  sms_driver_new_run: ['driver_name', 'pickup_name', 'dropoff_name', 'pickup_date', 'pickup_time', 'client_name', 'driver_earnings', 'booking_number'],
  sms_driver_ride_completed: ['driver_name', 'pickup_name', 'dropoff_name', 'driver_earnings', 'booking_number'],
  sms_driver_payout_released: ['driver_name', 'amount', 'route', 'booking_number'],
  sms_driver_payout_flagged: ['driver_name', 'amount', 'route', 'booking_number'],
  sms_driver_payout_rejected: ['driver_name', 'amount', 'route', 'booking_number'],
  sms_driver_run_cancelled: ['driver_name', 'pickup_name', 'dropoff_name', 'pickup_date', 'pickup_time', 'reason', 'booking_number'],
  sms_concierge_batch_link: ['concierge_name', 'amount', 'date', 'url'],
  sms_client_refund: ['client_name', 'booking_number', 'amount', 'reason'],
}

function SmsTemplates({ settings, saving, onSave }) {
  if (!settings || settings.length === 0) return null
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">SMS Templates</h2>
      <div className="space-y-3">
        {settings.map(s => (
          <SmsTemplateCard key={s.key} setting={s} saving={saving === s.key} onSave={onSave} />
        ))}
      </div>
    </div>
  )
}

function SmsTemplateCard({ setting, saving, onSave }) {
  const [value, setValue] = useState(String(setting.value))
  const changed = value !== String(setting.value)
  const friendlyName = FRIENDLY_NAMES[setting.key] || setting.key
  const variables = SMS_VARIABLES[setting.key] || []

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-900">{friendlyName}</p>
        {changed && (
          <button onClick={() => onSave(setting.key, value)} disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      <textarea value={value} onChange={e => setValue(e.target.value)} rows={3}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-2" />
      {variables.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400">Variables:</span>
          {variables.map(v => (
            <button key={v} onClick={() => setValue(val => val + `{${v}}`)}
              className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer">
              {`{${v}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const ALL_COUNTRIES = [
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'ET', name: 'Ethiopia', dial: '+251', flag: '🇪🇹' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'AE', name: 'UAE', dial: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
]

function CountriesSelector({ setting, crossCountrySetting, saving, onSave }) {
  const [selected, setSelected] = useState(() => {
    const val = setting.value
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return ['US'] }
  })
  const [saved, setSaved] = useState(() => {
    const val = setting.value
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return ['US'] }
  })
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...saved].sort())

  const crossCountry = crossCountrySetting ? String(crossCountrySetting.value) === 'true' : false

  const toggle = (code) => {
    setSelected(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const handleSave = () => {
    onSave(setting.key, JSON.stringify(selected))
    setSaved([...selected])
  }

  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Service Area</h2>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-900 mb-1">Countries where your service operates</p>
        <p className="text-xs text-slate-500 mb-3">Clients can only search and select pickup/destination addresses within these countries. Address autocomplete results will be restricted to selected countries.</p>

        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-400">{selected.length} countries selected</p>
          {changed && (
            <button onClick={handleSave} disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60 shrink-0">
              {saving ? '...' : 'Save'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          {ALL_COUNTRIES.map(c => {
            const isSelected = selected.includes(c.code)
            return (
              <div key={c.code}
                onClick={() => toggle(c.code)}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                  isSelected ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                }`}>
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-base leading-none">{c.flag}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{c.name}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Cross-country booking toggle */}
        {crossCountrySetting && (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-start gap-3">
              <button type="button"
                onClick={() => onSave(crossCountrySetting.key, crossCountry ? 'false' : 'true')}
                className={`w-10 h-6 rounded-full shrink-0 mt-0.5 transition-colors ${crossCountry ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${crossCountry ? 'translate-x-5' : 'translate-x-1'}`}></div>
              </button>
              <div>
                <p className="text-sm font-medium text-slate-900">Allow cross-country bookings</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {crossCountry
                    ? 'Pickup and destination can be in different countries. E.g. a client can book from Ethiopia to Kenya.'
                    : 'Pickup and destination must be in the same country. E.g. a client booking from Addis Ababa can only go to destinations within Ethiopia.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ServiceAreasEditor({ setting, crossCountrySetting, saving, onSave }) {
  const settings = useSettings()
  const inputRef = useRef(null)
  const [areas, setAreas] = useState(() => {
    let v = setting.value
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = [] } }
    return Array.isArray(v) ? v : []
  })
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(areas))
  const changed = JSON.stringify(areas) !== savedJson
  const [loaded, setLoaded] = useState(false)
  const acRef = useRef(null)
  const crossCountry = crossCountrySetting ? String(crossCountrySetting.value) === 'true' : false

  // Load Google Maps once
  useEffect(() => {
    const key = settings.google_maps_api_key
    if (!key) return
    if (window.google?.maps?.places) { setLoaded(true); return }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) { existing.addEventListener('load', () => setLoaded(true)); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    s.async = true
    s.onload = () => setLoaded(true)
    document.head.appendChild(s)
  }, [settings.google_maps_api_key])

  // Init autocomplete
  useEffect(() => {
    if (!loaded || !inputRef.current || acRef.current) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, { types: ['(regions)'] })
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (!place || !place.geometry) return
      const types = place.types || []
      let cc = ''
      if (place.address_components) {
        const c = place.address_components.find(x => x.types.includes('country'))
        if (c) cc = c.short_name
      }
      let newArea = null
      if (types.includes('country')) {
        newArea = { type: 'country', name: place.name || place.formatted_address, country: cc, place_id: place.place_id }
      } else if (types.includes('locality') || types.includes('administrative_area_level_1') || types.includes('administrative_area_level_2')) {
        const v = place.geometry.viewport?.toJSON?.()
        const loc = place.geometry.location
        newArea = {
          type: 'city',
          name: place.name || place.formatted_address,
          country: cc,
          lat: loc.lat(),
          lng: loc.lng(),
          bounds: v ? { north: v.north, south: v.south, east: v.east, west: v.west } : null,
          place_id: place.place_id,
        }
      } else {
        // Fallback: treat as city if has bounds
        const v = place.geometry.viewport?.toJSON?.()
        const loc = place.geometry.location
        newArea = {
          type: 'city',
          name: place.name || place.formatted_address,
          country: cc,
          lat: loc.lat(),
          lng: loc.lng(),
          bounds: v ? { north: v.north, south: v.south, east: v.east, west: v.west } : null,
          place_id: place.place_id,
        }
      }
      if (!newArea.country) {
        alert('Could not determine country for this place')
        inputRef.current.value = ''
        return
      }
      // Cap at 5 distinct countries
      setAreas(prev => {
        const existingCountries = new Set(prev.map(a => (a.country || '').toUpperCase()))
        if (!existingCountries.has(newArea.country.toUpperCase()) && existingCountries.size >= 5) {
          alert('Cannot add more than 5 countries (Google Places limit)')
          return prev
        }
        // No duplicates by place_id
        if (prev.some(a => a.place_id === newArea.place_id)) return prev
        return [...prev, newArea]
      })
      inputRef.current.value = ''
    })
    acRef.current = ac
  }, [loaded])

  const removeArea = (idx) => setAreas(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    onSave(setting.key, areas)  // send as raw array — JSONB column stores it natively
    setSavedJson(JSON.stringify(areas))
  }

  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Service Area</h2>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-900 mb-1">Where your service operates</p>
        <p className="text-xs text-slate-500 mb-3">
          Add a country to operate everywhere in that country, or a specific city to operate only within that city's bounds.
          Address autocomplete is restricted to these areas. Up to 5 distinct countries.
        </p>

        {!settings.google_maps_api_key && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-amber-700">Google Maps API key not configured. Set <code>GOOGLE_MAPS_API_KEY</code> in <code>.env</code> and restart backend to enable service area search.</p>
          </div>
        )}

        <input ref={inputRef} type="text" placeholder="Search a country or city..."
          disabled={!loaded}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 disabled:bg-slate-50" />

        {areas.length === 0 ? (
          <p className="text-sm text-slate-400 italic mb-3">No service areas configured — bookings allowed worldwide.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {areas.map((a, idx) => (
              <span key={idx} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${a.type === 'city' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                <span>{a.type === 'city' ? '🏙️' : '🌍'}</span>
                <span>{a.name}{a.type === 'city' && a.country ? ` (${a.country})` : ''}</span>
                <button type="button" onClick={() => removeArea(idx)} className="ml-1 hover:opacity-70">×</button>
              </span>
            ))}
          </div>
        )}

        {changed && (
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save service areas'}
          </button>
        )}

        {/* Cross-country booking toggle */}
        {crossCountrySetting && (
          <div className="border-t border-slate-100 pt-3 mt-4">
            <div className="flex items-start gap-3">
              <button type="button"
                onClick={() => onSave(crossCountrySetting.key, crossCountry ? 'false' : 'true')}
                className={`w-10 h-6 rounded-full shrink-0 mt-0.5 transition-colors ${crossCountry ? 'bg-blue-600' : 'bg-slate-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${crossCountry ? 'translate-x-5' : 'translate-x-1'}`}></div>
              </button>
              <div>
                <p className="text-sm font-medium text-slate-900">Allow cross-country bookings</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {crossCountry
                    ? 'Pickup and destination can be in different countries.'
                    : 'Pickup and destination must be in the same country.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SettingRow({ setting, saving, onSave, border }) {
  const [value, setValue] = useState(String(setting.value))
  const changed = value !== String(setting.value)
  const friendlyName = FRIENDLY_NAMES[setting.key] || setting.key

  return (
    <div className={`px-4 lg:px-5 py-4 ${border ? 'border-b border-slate-200' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
        <div className="flex-1 min-w-0 lg:border-r lg:border-dashed lg:border-slate-200 lg:pr-4">
          <p className="text-sm font-medium text-slate-900">{friendlyName}</p>
          {setting.description && <p className="text-xs text-slate-400 mt-0.5">{setting.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {typeof setting.value === 'boolean' ? (
            <select value={value} onChange={e => { setValue(e.target.value); onSave(setting.key, e.target.value) }}
              className="w-full lg:w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          ) : (
            <div className="flex gap-2 w-full lg:w-auto">
              <input value={value} onChange={e => setValue(e.target.value)}
                className="flex-1 lg:w-48 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {changed && (
                <button onClick={() => onSave(setting.key, value)} disabled={saving}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-60 shrink-0">
                  {saving ? '...' : 'Save'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
