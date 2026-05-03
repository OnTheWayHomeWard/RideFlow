import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/adminClient'
import { useSettings } from '../../hooks/useSettings'

export default function Settings() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [me, setMe] = useState(null)

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {}).finally(() => setLoading(false))
    api.getMe().then(setMe).catch(() => {})
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
      {me?.is_super_admin && (
        <SettingsGroup title="Public URLs (super-admin only)" settings={otherSettings.filter(s => ['client_base_url', 'staff_base_url'].includes(s.key))} saving={saving} onSave={handleSave} />
      )}
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
      <AdminUsersCard />
      <ChangePasswordCard />
    </div>
  )
}

function AdminUsersCard() {
  const [me, setMe] = useState(null)
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [resettingId, setResettingId] = useState(null)
  const [resetPwd, setResetPwd] = useState('')
  const [msg, setMsg] = useState(null)

  const load = () => {
    api.getMe().then(m => {
      setMe(m)
      if (m?.is_super_admin) {
        api.listAdmins().then(setAdmins).catch(() => {}).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return null
  if (!me?.is_super_admin) return null  // hidden from regular admins

  const handleCreate = async (e) => {
    e.preventDefault()
    setMsg(null); setSaving(true)
    try {
      await api.createAdmin(form)
      setForm({ name: '', email: '', password: '' })
      setShowAdd(false)
      setMsg({ type: 'ok', text: 'Admin created. They will be asked to change their password on first login.' })
      load()
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally { setSaving(false) }
  }

  const handleReset = async (id) => {
    if (resetPwd.length < 6) { setMsg({ type: 'err', text: 'Password must be at least 6 characters' }); return }
    try {
      await api.resetAdminPassword(id, resetPwd)
      setResettingId(null); setResetPwd('')
      setMsg({ type: 'ok', text: 'Password reset. They will be asked to change it on next login.' })
      load()
    } catch (err) { setMsg({ type: 'err', text: err.message }) }
  }

  const handleDelete = async (a) => {
    if (!confirm(`Delete admin "${a.email}"? This cannot be undone.`)) return
    try {
      await api.deleteAdmin(a.id)
      setMsg({ type: 'ok', text: 'Admin deleted.' })
      load()
    } catch (err) { setMsg({ type: 'err', text: err.message }) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Admin Users</h2>
          <p className="text-xs text-slate-500 mt-0.5">Only the super admin can add, remove, or reset other admins.</p>
        </div>
        <button onClick={() => { setShowAdd(s => !s); setMsg(null) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
          {showAdd ? 'Cancel' : '+ Add admin'}
        </button>
      </div>

      {msg && (
        <div className={`mx-4 mt-3 text-sm rounded-lg p-2.5 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleCreate} className="px-4 py-3 border-b border-slate-100 grid grid-cols-1 lg:grid-cols-3 gap-2 items-end bg-blue-50/30">
          <div>
            <label className="text-xs text-slate-500">Name</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Initial password</label>
            <div className="flex gap-2">
              <input type="text" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={6}
                placeholder="≥ 6 chars"
                className="flex-1 mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
              <button type="submit" disabled={saving}
                className="mt-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {saving ? '...' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100">
        {admins.map(a => (
          <div key={a.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm text-slate-900 truncate">{a.email}</p>
                {a.is_super_admin && <span className="text-[10px] uppercase tracking-wide font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Super</span>}
                {!a.password_changed && <span className="text-[10px] uppercase tracking-wide font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Default pw</span>}
              </div>
              <p className="text-xs text-slate-500">{a.name}</p>
            </div>

            {resettingId === a.id ? (
              <div className="flex gap-1">
                <input type="text" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="new password ≥6"
                  className="px-2 py-1 border border-slate-200 rounded text-xs font-mono w-40" />
                <button onClick={() => handleReset(a.id)} className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-medium">Set</button>
                <button onClick={() => { setResettingId(null); setResetPwd('') }} className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs">Cancel</button>
              </div>
            ) : (
              <>
                <button onClick={() => { setResettingId(a.id); setResetPwd(''); setMsg(null) }} disabled={a.is_super_admin && a.id !== me.id}
                  title={a.is_super_admin && a.id !== me.id ? 'Cannot reset another super admin' : 'Reset password'}
                  className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed">
                  Reset password
                </button>
                <button onClick={() => handleDelete(a)} disabled={a.is_super_admin || a.id === me.id}
                  title={a.is_super_admin ? 'The super admin cannot be deleted' : (a.id === me.id ? 'You cannot delete yourself' : 'Delete admin')}
                  className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed">
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
        {admins.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No admins yet</p>}
      </div>
    </div>
  )
}

function ChangePasswordCard() {
  const [me, setMe] = useState(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // {type:'ok'|'err', text}

  useEffect(() => { api.getMe().then(setMe).catch(() => {}) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (next.length < 6) { setMsg({ type: 'err', text: 'New password must be at least 6 characters' }); return }
    if (next !== confirm) { setMsg({ type: 'err', text: 'New password and confirmation do not match' }); return }
    setSaving(true)
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setMsg({ type: 'ok', text: 'Password changed successfully.' })
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setMsg({ type: 'err', text: err.message })
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-5 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="text-sm font-bold text-slate-900">Account & Password</h2>
        {me && <p className="text-xs text-slate-500 mt-0.5">Signed in as <span className="font-medium text-slate-700">{me.email}</span></p>}
      </div>
      <form onSubmit={handleSubmit} className="p-4 space-y-3 max-w-md">
        {msg && (
          <div className={`text-sm rounded-lg p-2.5 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}
        <div>
          <label className="text-xs text-slate-500">Current password</label>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500">New password</label>
          <input type="password" value={next} onChange={e => setNext(e.target.value)} required minLength={6}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs text-slate-500">Confirm new password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6}
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Saving...' : 'Change Password'}
        </button>
      </form>
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
