import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useSettings } from '../hooks/useSettings.jsx'
import Pagination from '../components/Pagination'
import PhoneInput from '../components/PhoneInput'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

export default function Drivers() {
  const settings = useSettings()
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', vehicle_type: 'sedan', vehicle_make: '', vehicle_plate: '', vehicle_color: '', license_number: '', has_insurance: false })
  const [creating, setCreating] = useState(false)

  const load = (p, f) => {
    setLoading(true)
    api.getDrivers(f || undefined, p, 10).then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { setPage(1); load(1, filter) }, [filter])
  useEffect(() => { load(page, filter) }, [page])

  const drivers = data.items || []

  const handleApprove = async (id) => {
    try { await api.approveDriver(id); load(page, filter) } catch (e) { alert(e.message) }
  }
  const handleReject = async (id) => {
    const reason = prompt('Rejection reason:')
    if (reason === null) return
    try { await api.rejectDriver(id, reason); load(page, filter) } catch (e) { alert(e.message) }
  }
  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    if (!confirm(`${newStatus === 'inactive' ? 'Deactivate' : 'Activate'} this driver?`)) return
    try { await api.updateDriver(id, { status: newStatus }); load(page, filter) } catch (e) { alert(e.message) }
  }
  const handleDelete = async (id, name) => {
    if (!confirm(`Deactivate driver "${name}"? This will prevent them from accepting runs.`)) return
    try { await api.deleteDriver(id); load(page, filter) } catch (e) { alert(e.message) }
  }
  const handlePermanentDelete = async (id, name) => {
    if (!confirm(`Permanently delete driver "${name}"? This cannot be undone.`)) return
    try { await api.deleteDriver(id, true); load(page, filter) } catch (e) { alert(e.message) }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Drivers</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Driver'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={async (e) => {
          e.preventDefault(); setCreating(true)
          try {
            const res = await api.createDriver(form)
            alert(`Driver created!\nDefault password: ${res.default_password} (last 4 digits of phone)`)
            setShowForm(false); setForm({ name: '', phone: '', email: '', vehicle_type: 'sedan', vehicle_make: '', vehicle_plate: '', vehicle_color: '', license_number: '', has_insurance: false })
            load(1, filter)
          } catch (err) { alert(err.message) }
          finally { setCreating(false) }
        }} className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 mb-5">
          <h3 className="font-semibold text-sm text-slate-900 mb-3">New Driver</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Full name" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Phone</label>
              <div className="mt-1">
                <PhoneInput value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} availableCountries={settings.available_countries} placeholder="Phone number" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">Email (optional)</label>
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Vehicle Type</label>
              <select value={form.vehicle_type} onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm">
                <option value="sedan">Sedan</option><option value="suv">SUV</option>
                <option value="van">Van</option><option value="large_van">Large Van</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Vehicle Make</label>
              <input value={form.vehicle_make} onChange={e => setForm(p => ({ ...p, vehicle_make: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Toyota Camry 2023" />
            </div>
            <div>
              <label className="text-xs text-slate-500">License Plate</label>
              <input value={form.vehicle_plate} onChange={e => setForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. ABC-1234" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Vehicle Color</label>
              <input value={form.vehicle_color} onChange={e => setForm(p => ({ ...p, vehicle_color: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. White" />
            </div>
            <div>
              <label className="text-xs text-slate-500">License Number</label>
              <input value={form.license_number} onChange={e => setForm(p => ({ ...p, license_number: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. DL-123456" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" checked={form.has_insurance} onChange={e => setForm(p => ({ ...p, has_insurance: e.target.checked }))} />
              <label className="text-sm text-slate-700">Has commercial transport insurance</label>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">Default password will be the last 4 digits of the phone number. Driver will be prompted to change it on first login.</p>
          <button type="submit" disabled={creating}
            className="w-full lg:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {creating ? 'Creating...' : 'Create Driver'}
          </button>
        </form>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0">
        {['', 'pending', 'active', 'inactive'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium capitalize whitespace-nowrap shrink-0 transition-all ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>{s || 'All'}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="space-y-3">
          {drivers.map(d => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <Link to={`/drivers/${d.id}`} className="block p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-base font-bold text-slate-600">
                      {initials(d.name)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 items-start">
                    <PriorityBadge level={d.priority_level || 2} />
                    <StatusBadge status={d.status} />
                  </div>
                </div>

                <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                  <Info label="Vehicle" value={d.vehicle_type?.toUpperCase()} />
                  <Info label="Plate" value={d.vehicle_plate || '—'} />
                  <Info label="Rides" value={d.total_rides} />
                  <Info label="Earnings" value={`$${d.total_earnings}`} />
                  <div>
                    <p className="text-slate-400">Rating</p>
                    {d.rating_avg > 0 ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="inline-flex gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <svg key={s} className={`w-3 h-3 ${s <= Math.round(d.rating_avg) ? 'text-amber-400' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          ))}
                        </span>
                        <span className="font-medium text-slate-700">{d.rating_avg}</span>
                        {d.rating_count > 0 && <span className="text-slate-400">({d.rating_count})</span>}
                      </div>
                    ) : (
                      <p className="font-medium text-slate-400 mt-0.5">No ratings</p>
                    )}
                  </div>
                </div>
              </Link>

            </div>
          ))}
          {drivers.length === 0 && <p className="text-center text-slate-400 py-8">No drivers found</p>}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = { active: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', inactive: 'bg-slate-100 text-slate-600', suspended: 'bg-red-100 text-red-700' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap capitalize ${styles[status] || 'bg-slate-100'}`}>{status}</span>
}

function PriorityBadge({ level }) {
  const map = {
    1: { label: 'High', style: 'bg-red-100 text-red-700' },
    2: { label: 'Normal', style: 'bg-slate-100 text-slate-600' },
    3: { label: 'Low', style: 'bg-blue-100 text-blue-700' },
  }
  const m = map[level] || map[2]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${m.style}`}>{m.label}</span>
}
