import { useState, useEffect } from 'react'
import { api } from '../api/client'

const EMPTY = {
  name: '', type: 'flat', amount: '',
  start_date: '', end_date: '',
  daily_start_time: '', daily_end_time: '',
  driver_gets_upsale: false, cashier_gets_upsale: true,
  vehicle_types: null,
}

const fmtTime12 = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : ''

function describeWindow(u) {
  const hasDate = u.start_date || u.end_date
  const hasTime = u.daily_start_time || u.daily_end_time
  const parts = []
  if (hasDate) {
    parts.push(`${fmtDate(u.start_date) || '…'} → ${fmtDate(u.end_date) || '…'}`)
  } else {
    parts.push('Any date')
  }
  if (hasTime) {
    parts.push(`${fmtTime12(u.daily_start_time) || '…'} – ${fmtTime12(u.daily_end_time) || '…'} daily`)
  } else {
    parts.push('All day')
  }
  return parts.join(' • ')
}

function isLive(u) {
  if (!u.is_active) return false
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (u.start_date && today < u.start_date) return false
  if (u.end_date && today > u.end_date) return false
  if (u.daily_start_time || u.daily_end_time) {
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const s = u.daily_start_time, e = u.daily_end_time
    if (s && e) {
      if (s <= e) { if (cur < s || cur > e) return false }
      else { if (cur < s && cur > e) return false }
    } else if (s && cur < s) return false
    else if (e && cur > e) return false
  }
  return true
}

export default function Upsales() {
  const [upsales, setUpsales] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [editId, setEditId] = useState(null)
  const [allVehicles, setAllVehicles] = useState(true)
  const [hasDateRange, setHasDateRange] = useState(false)
  const [hasTimeWindow, setHasTimeWindow] = useState(false)

  const load = () => {
    Promise.all([api.getUpsales(), api.getVehicleRates()])
      .then(([u, r]) => { setUpsales(u); setRates(r.filter(rt => rt.is_active)) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setForm({ ...EMPTY })
    setEditId(null); setShowForm(false)
    setAllVehicles(true); setHasDateRange(false); setHasTimeWindow(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = {
        ...form,
        amount: parseFloat(form.amount),
        vehicle_types: allVehicles ? null : form.vehicle_types,
        start_date: hasDateRange ? (form.start_date || null) : null,
        end_date: hasDateRange ? (form.end_date || null) : null,
        daily_start_time: hasTimeWindow ? (form.daily_start_time || null) : null,
        daily_end_time: hasTimeWindow ? (form.daily_end_time || null) : null,
      }
      if (editId) await api.updateUpsale(editId, data)
      else await api.createUpsale(data)
      resetForm()
      load()
    } catch (err) { alert(err.message) }
  }

  const startEdit = (u) => {
    const isAll = !u.vehicle_types || u.vehicle_types.length === 0
    setAllVehicles(isAll)
    setHasDateRange(!!(u.start_date || u.end_date))
    setHasTimeWindow(!!(u.daily_start_time || u.daily_end_time))
    setForm({
      name: u.name, type: u.type, amount: u.amount,
      start_date: u.start_date || '',
      end_date: u.end_date || '',
      daily_start_time: u.daily_start_time ? u.daily_start_time.slice(0, 5) : '',
      daily_end_time: u.daily_end_time ? u.daily_end_time.slice(0, 5) : '',
      driver_gets_upsale: u.driver_gets_upsale,
      cashier_gets_upsale: u.cashier_gets_upsale,
      vehicle_types: u.vehicle_types || rates.map(r => r.vehicle_type),
    })
    setEditId(u.id); setShowForm(true)
  }

  const handleToggle = async (id) => {
    try { await api.toggleUpsale(id); load() } catch (e) { alert(e.message) }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete upsale "${name}"? This cannot be undone.`)) return
    try { await api.deleteUpsale(id); load() } catch (e) { alert(e.message) }
  }

  const toggleVehicleType = (vt) => {
    setForm(p => {
      const current = p.vehicle_types || rates.map(r => r.vehicle_type)
      const updated = current.includes(vt) ? current.filter(v => v !== vt) : [...current, vt]
      return { ...p, vehicle_types: updated }
    })
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Upsales</h1>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true) }}
          className="px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Create'}
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-700">
        Multiple upsales can be active and stack. Leave date range and daily time empty for "always". Set only the daily time (e.g. 04:00–06:00) to apply every day in that window — useful for early-morning or late-night surcharges.
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 mb-5">
          <h3 className="font-semibold text-sm mb-3">{editId ? 'Edit Upsale' : 'New Upsale'}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500">Name (internal)</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-slate-500">Type</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm">
                  <option value="flat">Flat ($)</option>
                  <option value="percentage">Percent (%)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500">Amount</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required
                  className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Date range */}
          <div className="mb-4 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={hasDateRange} onChange={e => setHasDateRange(e.target.checked)} />
              <span className="font-medium">Limit to a date range</span>
              <span className="text-xs text-slate-400">(unchecked = always applies)</span>
            </label>
            {hasDateRange && (
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div>
                  <label className="text-xs text-slate-500">Start date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">End date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Daily time-of-day */}
          <div className="mb-4 border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={hasTimeWindow} onChange={e => setHasTimeWindow(e.target.checked)} />
              <span className="font-medium">Apply only during a daily time window</span>
              <span className="text-xs text-slate-400">(e.g. 04:00–06:00 every day)</span>
            </label>
            {hasTimeWindow && (
              <div className="grid grid-cols-2 gap-2 ml-6">
                <div>
                  <label className="text-xs text-slate-500">From</label>
                  <input type="time" value={form.daily_start_time} onChange={e => setForm(p => ({ ...p, daily_start_time: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">To</label>
                  <input type="time" value={form.daily_end_time} onChange={e => setForm(p => ({ ...p, daily_end_time: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
                <p className="col-span-2 text-xs text-slate-500 ml-1">If "To" is earlier than "From" (e.g. 22:00 → 04:00), the window wraps over midnight.</p>
              </div>
            )}
          </div>

          {/* Vehicle types */}
          <div className="mb-4">
            <label className="text-xs text-slate-500 block mb-2">Apply to vehicle types</label>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={allVehicles} onChange={e => {
                setAllVehicles(e.target.checked)
                if (e.target.checked) setForm(p => ({ ...p, vehicle_types: null }))
                else setForm(p => ({ ...p, vehicle_types: rates.map(r => r.vehicle_type) }))
              }} />
              <span className="font-medium">All vehicle types</span>
            </label>
            {!allVehicles && (
              <div className="flex gap-3 flex-wrap ml-6">
                {rates.map(r => (
                  <label key={r.vehicle_type} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                    (form.vehicle_types || []).includes(r.vehicle_type) ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'
                  }`}>
                    <input type="checkbox" checked={(form.vehicle_types || []).includes(r.vehicle_type)}
                      onChange={() => toggleVehicleType(r.vehicle_type)} className="sr-only" />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                      (form.vehicle_types || []).includes(r.vehicle_type) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                    }`}>
                      {(form.vehicle_types || []).includes(r.vehicle_type) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {r.display_name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Pay toggles */}
          <div className="flex flex-col lg:flex-row gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.driver_gets_upsale} onChange={e => setForm(p => ({ ...p, driver_gets_upsale: e.target.checked }))} />
              Driver gets upsale
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.cashier_gets_upsale} onChange={e => setForm(p => ({ ...p, cashier_gets_upsale: e.target.checked }))} />
              Cashier gets upsale
            </label>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{editId ? 'Save Changes' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="space-y-3">
          {upsales.map(u => {
            const live = isLive(u)
            return (
              <div key={u.id} className={`bg-white border rounded-xl overflow-hidden ${live ? 'border-green-300 bg-green-50/30' : 'border-slate-200'}`}>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-slate-900">{u.name}</p>
                    <div className="flex items-center gap-1.5">
                      {live && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium animate-pulse">Live</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{u.is_active ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span><b className="text-slate-700">{u.type === 'flat' ? `+$${u.amount}` : `+${u.amount}%`}</b></span>
                    <span>{describeWindow(u)}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {u.vehicle_types ? u.vehicle_types.map(vt => (
                      <span key={vt} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full capitalize">{vt.replace('_', ' ')}</span>
                    )) : (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">All vehicles</span>
                    )}
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-2 lg:justify-end">
                  <button onClick={() => startEdit(u)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Edit</button>
                  <button onClick={() => handleToggle(u.id)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${u.is_active ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => handleDelete(u.id, u.name)} className="px-2.5 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Delete</button>
                </div>
              </div>
            )
          })}
          {upsales.length === 0 && <p className="text-center text-slate-400 py-8">No upsales yet</p>}
        </div>
      )}
    </div>
  )
}
