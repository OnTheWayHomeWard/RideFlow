import { useState, useEffect } from 'react'
import { api } from '../api/client'

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
      <SettingsGroup title="Booking" settings={otherSettings.filter(s => ['booking_window_days','cancellation_window_hours','unassigned_alert_minutes','review_expiry_days'].includes(s.key))} saving={saving} onSave={handleSave} />
      <SettingsGroup title="Driver Priority" settings={otherSettings.filter(s => ['priority_delay_normal_minutes','priority_delay_low_minutes'].includes(s.key))} saving={saving} onSave={handleSave} />
      {/* Service Area — countries */}
      {settings.find(s => s.key === 'available_countries') && (
        <CountriesSelector
          setting={settings.find(s => s.key === 'available_countries')}
          crossCountrySetting={settings.find(s => s.key === 'allow_cross_country_booking')}
          saving={saving === 'available_countries'}
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

function SettingRow({ setting, saving, onSave, border }) {
  const [value, setValue] = useState(String(setting.value))
  const changed = value !== String(setting.value)
  const friendlyName = FRIENDLY_NAMES[setting.key] || setting.key

  return (
    <div className={`px-4 lg:px-5 py-3 lg:py-4 ${border ? 'border-b border-slate-100' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900">{friendlyName}</p>
          {setting.description && <p className="text-xs text-slate-400">{setting.description}</p>}
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
