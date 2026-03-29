import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings.jsx'
import StatusBadge from '../components/StatusBadge'
import PhoneInput from '../components/PhoneInput'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

function Stars({ rating, size = 'sm' }) {
  const s = size === 'lg' ? 'w-5 h-5' : 'w-3 h-3'
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`${s} ${i <= rating ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

export default function DriverDetail() {
  const { driverId } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.getDriverDetail(driverId).then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [driverId])

  const startEdit = () => {
    const d = data.driver
    setEditForm({
      name: d.name, phone: d.phone, email: d.email || '',
      vehicle_type: d.vehicle_type, vehicle_make: d.vehicle_make || '',
      vehicle_plate: d.vehicle_plate || '', vehicle_color: d.vehicle_color || '',
      license_number: d.license_number || '', license_expiry: d.license_expiry || '',
      has_insurance: d.has_insurance,
      pay_percentage: d.pay_percentage, payout_method: d.payout_method || 'bank',
      bank_name: d.payout_details?.bank_name || '',
      routing: d.payout_details?.routing || '',
      account: d.payout_details?.account || '',
      zelle_email: d.payout_details?.zelle_email || '',
      stripe_connect_id: d.stripe_connect_id || '',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Build payout — only keep the selected method, clear everything else
      const { bank_name, routing, account, zelle_email, stripe_connect_id, ...rest } = editForm
      const payload = { ...rest }

      if (rest.payout_method === 'bank') {
        payload.payout_details = { bank_name, routing, account }
        payload.stripe_connect_id = ''
      } else if (rest.payout_method === 'zelle') {
        payload.payout_details = { zelle_email }
        payload.stripe_connect_id = ''
      } else if (rest.payout_method === 'stripe_connect') {
        payload.payout_details = {}
        payload.stripe_connect_id = stripe_connect_id
      }

      await api.updateDriver(driverId, payload)
      setEditing(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Change status to "${newStatus}"?`)) return
    try { await api.updateDriver(driverId, { status: newStatus }); load() } catch (e) { alert(e.message) }
  }

  const handleDelete = async () => {
    if (!confirm(`Deactivate "${data.driver.name}"? They won't be able to accept runs.`)) return
    try { await api.deleteDriver(driverId); load() } catch (e) { alert(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!data) return <div className="p-6 text-center text-slate-400">Driver not found</div>

  const { driver: d, stats, runs, global_default_pay_pct } = data

  return (
    <div className="p-4 lg:p-6">
      <Link to="/drivers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Drivers
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-5 mb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 lg:w-14 lg:h-14 bg-blue-100 rounded-full flex items-center justify-center text-xl font-bold text-blue-700 shrink-0">
            {initials(d.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-xl font-bold text-slate-900">{d.name}</h1>
            <p className="text-sm text-slate-500">{d.phone} {d.email && `• ${d.email}`}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                d.status === 'active' ? 'bg-green-100 text-green-700' : d.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>{d.status}</span>
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">{d.vehicle_type}</span>
              {stats.avg_rating > 0 && (
                <span className="flex items-center gap-1">
                  <Stars rating={Math.round(stats.avg_rating)} />
                  <span className="text-xs text-slate-500">{stats.avg_rating} ({stats.total_ratings})</span>
                </span>
              )}
            </div>
          </div>
          {/* Actions — top right */}
          <div className="flex gap-2 shrink-0">
            {d.status === 'pending' && (
              <button onClick={() => handleStatusChange('active')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Approve</button>
            )}
            {d.status === 'active' && (
              <button onClick={handleDelete} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300">Deactivate</button>
            )}
            {d.status === 'inactive' && (
              <button onClick={() => handleStatusChange('active')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Activate</button>
            )}
            <button onClick={async () => {
              if (!confirm(`Permanently delete "${d.name}"? This cannot be undone.`)) return
              try { await api.deleteDriver(driverId, true); navigate('/drivers') } catch (e) { alert(e.message) }
            }} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Delete</button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
          <MiniStat label="Completed" value={stats.total_rides} />
          <MiniStat label="Assigned" value={stats.assigned_rides} />
          <MiniStat label="Earned" value={`$${stats.total_earned.toFixed(0)}`} color="blue" />
          <MiniStat label="Released" value={`$${stats.total_released.toFixed(0)}`} color="green" />
          <MiniStat label="Pending" value={`$${stats.total_pending.toFixed(0)}`} color="amber" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {[
          { key: 'info', label: 'Details' },
          { key: 'runs', label: `Rides (${runs.length})` },
          { key: 'payment', label: 'Payout' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ═══ DETAILS TAB ═══ */}
      {tab === 'info' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5">
          {!editing ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Driver Details</h3>
                <button onClick={startEdit} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Edit</button>
              </div>

              {/* Personal */}
              <SectionLabel text="Personal" />
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <Field label="Name" value={d.name} />
                <PhoneDisplay phone={d.phone} />
                <Field label="Email" value={d.email || '—'} />
                <Field label="Registered" value={d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'} />
                <Field label="Approved" value={d.approved_at ? new Date(d.approved_at).toLocaleDateString() : '—'} />
              </div>

              {/* Vehicle */}
              <SectionLabel text="Vehicle" />
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <Field label="Type" value={d.vehicle_type?.toUpperCase()} />
                <Field label="Make & Model" value={d.vehicle_make || '—'} />
                <Field label="Plate" value={d.vehicle_plate || '—'} mono />
                <Field label="Color" value={d.vehicle_color || '—'} />
              </div>

              {/* License */}
              <SectionLabel text="License & Insurance" />
              <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                <Field label="License #" value={d.license_number || '—'} mono />
                <Field label="License Expiry" value={d.license_expiry || '—'} />
                <Field label="Insurance" value={d.has_insurance ? 'Yes' : 'No'} />
              </div>

              {/* Pay */}
              <SectionLabel text="Compensation" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Pay Percentage</p>
                  <p className="font-bold text-lg text-slate-900">{d.pay_percentage}%</p>
                  {d.pay_percentage !== global_default_pay_pct && (
                    <p className="text-xs text-blue-600">Custom (default is {global_default_pay_pct}%)</p>
                  )}
                  {d.pay_percentage === global_default_pay_pct && (
                    <p className="text-xs text-slate-400">Using global default</p>
                  )}
                </div>
                <Field label="Payout Method" value={d.payout_method?.toUpperCase() || '—'} />
              </div>

              {d.rejection_reason && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-600 font-medium">Rejection reason</p>
                  <p className="text-sm text-red-800">{d.rejection_reason}</p>
                </div>
              )}

              {/* Password section */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{d.password_changed ? 'Password was changed by driver' : 'Using default password'}</p>
                    {!d.password_changed && <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">{d.default_password}</p>}
                  </div>
                  <button onClick={async () => {
                    if (!confirm(`Reset password to default (${d.default_password})?`)) return
                    try { await api.resetDriverPassword(driverId); alert(`Password reset to: ${d.default_password}`); load() } catch (e) { alert(e.message) }
                  }} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 shrink-0">
                    Reset to Default
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ═══ EDIT MODE ═══ */
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Edit Driver</h3>
                <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
              </div>

              <SectionLabel text="Personal" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
                <EditField label="Name" value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
                <div>
                  <label className="text-xs text-slate-500">Phone</label>
                  <div className="mt-1"><PhoneInput value={editForm.phone} onChange={v => setEditForm(p => ({ ...p, phone: v }))} availableCountries={settings.available_countries} /></div>
                </div>
                <EditField label="Email" value={editForm.email} onChange={v => setEditForm(p => ({ ...p, email: v }))} />
              </div>

              <SectionLabel text="Vehicle" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="text-xs text-slate-500">Type</label>
                  <select value={editForm.vehicle_type} onChange={e => setEditForm(p => ({ ...p, vehicle_type: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="sedan">Sedan</option><option value="suv">SUV</option>
                    <option value="van">Van</option><option value="large_van">Large Van</option>
                  </select>
                </div>
                <EditField label="Make & Model" value={editForm.vehicle_make} onChange={v => setEditForm(p => ({ ...p, vehicle_make: v }))} />
                <EditField label="Plate" value={editForm.vehicle_plate} onChange={v => setEditForm(p => ({ ...p, vehicle_plate: v }))} />
                <EditField label="Color" value={editForm.vehicle_color} onChange={v => setEditForm(p => ({ ...p, vehicle_color: v }))} />
              </div>

              <SectionLabel text="License & Insurance" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
                <EditField label="License #" value={editForm.license_number} onChange={v => setEditForm(p => ({ ...p, license_number: v }))} />
                <div>
                  <label className="text-xs text-slate-500">License Expiry</label>
                  <input type="date" value={editForm.license_expiry} onChange={e => setEditForm(p => ({ ...p, license_expiry: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Insurance</label>
                  <select value={editForm.has_insurance ? 'true' : 'false'} onChange={e => setEditForm(p => ({ ...p, has_insurance: e.target.value === 'true' }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="true">Yes</option><option value="false">No</option>
                  </select>
                </div>
              </div>

              <SectionLabel text="Compensation" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-slate-500">Pay Percentage</label>
                  <input type="number" step="0.5" min="0" max="100" value={editForm.pay_percentage}
                    onChange={e => setEditForm(p => ({ ...p, pay_percentage: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-slate-400 mt-1">Global default: {global_default_pay_pct}%. Change here to override for this driver only.</p>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Payout Method</label>
                  <select value={editForm.payout_method} onChange={e => setEditForm(p => ({ ...p, payout_method: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="bank">Bank Account</option><option value="zelle">Zelle</option><option value="stripe_connect">Stripe Connect</option>
                  </select>
                </div>
              </div>

              {/* Banking details — conditional on payout method */}
              <SectionLabel text="Banking Details" />
              {editForm.payout_method === 'bank' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
                  <EditField label="Bank Name" value={editForm.bank_name} onChange={v => setEditForm(p => ({ ...p, bank_name: v }))} />
                  <EditField label="Routing Number" value={editForm.routing} onChange={v => setEditForm(p => ({ ...p, routing: v }))} />
                  <EditField label="Account Number" value={editForm.account} onChange={v => setEditForm(p => ({ ...p, account: v }))} />
                </div>
              )}
              {editForm.payout_method === 'zelle' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
                  <EditField label="Zelle Email or Phone" value={editForm.zelle_email} onChange={v => setEditForm(p => ({ ...p, zelle_email: v }))} />
                </div>
              )}
              {editForm.payout_method === 'stripe_connect' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
                  <EditField label="Stripe Connect ID" value={editForm.stripe_connect_id} onChange={v => setEditForm(p => ({ ...p, stripe_connect_id: v }))} />
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ RIDES TAB ═══ */}
      {tab === 'runs' && (
        <div className="space-y-2">
          {runs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-slate-400">No rides yet</p>
            </div>
          ) : runs.map((r, i) => (
            <div key={i} className={`bg-white border rounded-xl overflow-hidden ${r.rating && r.rating <= 2 ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="p-3 lg:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-slate-400">{r.booking_number}</span>
                  <div className="flex items-center gap-1.5">
                    {r.payout_status && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        r.payout_status === 'released' ? 'bg-green-100 text-green-700' :
                        r.payout_status === 'pending_review' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{r.payout_status === 'pending_review' ? 'pending' : r.payout_status}</span>
                    )}
                    <StatusBadge status={r.status} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700">{r.pickup_name} → {r.dropoff_name}</p>
                    <p className="text-xs text-slate-400">{r.pickup_date} • {r.client_name}</p>
                  </div>
                  <p className="font-bold text-green-700">${r.driver_earnings.toFixed(2)}</p>
                </div>
              </div>
              {(r.rating || r.comment) && (
                <div className={`px-3 lg:px-4 py-2 border-t flex items-center gap-2 ${r.rating <= 2 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                  {r.rating && <Stars rating={r.rating} />}
                  {r.rating && r.rating <= 2 && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Low</span>}
                  {r.comment && <p className="text-xs text-slate-600 italic truncate flex-1">"{r.comment}"</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ═══ PAYOUT TAB ═══ */}
      {tab === 'payment' && (
        <div className="space-y-4">
          {/* Earnings breakdown */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Earnings</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">Total Earned</p>
                <p className="text-xl font-bold text-blue-700">${stats.total_earned.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">Released</p>
                <p className="text-xl font-bold text-green-700">${stats.total_released.toFixed(2)}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">Pending</p>
                <p className="text-xl font-bold text-amber-600">${stats.total_pending.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Pay config */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Pay Configuration</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">This Driver's Rate</p>
                <p className="text-2xl font-bold text-slate-900">{d.pay_percentage}%</p>
                {d.pay_percentage !== global_default_pay_pct ? (
                  <p className="text-xs text-blue-600 mt-0.5">Custom override (default: {global_default_pay_pct}%)</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">Using global default</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-400">Payout Method</p>
                <p className="text-lg font-semibold text-slate-900 capitalize">{d.payout_method}</p>
              </div>
            </div>
          </div>

          {/* Bank details */}
          {d.payout_details && Object.keys(d.payout_details).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Bank Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(d.payout_details).map(([k, v]) => (
                  <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
                ))}
              </div>
            </div>
          )}

          {d.stripe_connect_id && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Stripe Connect</h3>
              <p className="font-mono text-xs text-slate-600 bg-slate-50 p-2 rounded">{d.stripe_connect_id}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  const colors = { blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-600' }
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${color ? colors[color] : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function SectionLabel({ text }) {
  return <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 mt-1">{text}</p>
}

function PhoneDisplay({ phone }) {
  const ALL = [
    { code: 'US', dial: '+1', flag: '🇺🇸' }, { code: 'ET', dial: '+251', flag: '🇪🇹' },
    { code: 'GB', dial: '+44', flag: '🇬🇧' }, { code: 'CA', dial: '+1', flag: '🇨🇦' },
    { code: 'AU', dial: '+61', flag: '🇦🇺' }, { code: 'DE', dial: '+49', flag: '🇩🇪' },
    { code: 'FR', dial: '+33', flag: '🇫🇷' }, { code: 'IN', dial: '+91', flag: '🇮🇳' },
    { code: 'KE', dial: '+254', flag: '🇰🇪' }, { code: 'NG', dial: '+234', flag: '🇳🇬' },
    { code: 'AE', dial: '+971', flag: '🇦🇪' }, { code: 'SA', dial: '+966', flag: '🇸🇦' },
  ].sort((a, b) => b.dial.length - a.dial.length)
  let flag = '📞', display = phone || '—'
  for (const c of ALL) {
    if (phone?.startsWith(c.dial)) { flag = c.flag; display = `${c.dial} ${phone.slice(c.dial.length)}`; break }
  }
  return (
    <div>
      <p className="text-xs text-slate-400">Phone</p>
      <p className="font-medium text-slate-900 flex items-center gap-1.5"><span className="text-base">{flag}</span> {display}</p>
    </div>
  )
}

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-xs text-slate-400 capitalize">{label}</p>
      <p className={`font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}
