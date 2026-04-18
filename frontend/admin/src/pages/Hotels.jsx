import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Pagination from '../components/Pagination'

const EMPTY_FORM = { name: '', address: '', contact_name: '', contact_phone: '', default_commission_pct: 10, lat: '', lng: '', concierge_id: '' }

export default function Hotels() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState(null)
  const [concierges, setConcierges] = useState([])

  const load = (p) => { api.getHotels(p || page, 10).then(setData).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load(page) }, [page])
  useEffect(() => { api.getConcierges().then(setConcierges).catch(() => {}) }, [])

  const hotels = data.items || []

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditingId(null); setShowForm(false) }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form, default_commission_pct: parseFloat(form.default_commission_pct) || 10 }
      if (payload.lat) payload.lat = parseFloat(payload.lat)
      else delete payload.lat
      if (payload.lng) payload.lng = parseFloat(payload.lng)
      else delete payload.lng
      if (!payload.concierge_id) payload.concierge_id = null
      await api.createHotel(payload)
      resetForm()
      load(page)
    } catch (err) { alert(err.message) }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form, default_commission_pct: parseFloat(form.default_commission_pct) || 10 }
      if (payload.lat) payload.lat = parseFloat(payload.lat)
      else delete payload.lat
      if (payload.lng) payload.lng = parseFloat(payload.lng)
      else delete payload.lng
      if (!payload.concierge_id) payload.concierge_id = null
      await api.updateHotel(editingId, payload)
      resetForm()
      load(page)
    } catch (err) { alert(err.message) }
  }

  const startEdit = (h) => {
    setForm({
      name: h.name, address: h.address,
      contact_name: h.contact_name || '', contact_phone: h.contact_phone || '',
      default_commission_pct: h.default_commission_pct,
      lat: h.lat || '', lng: h.lng || '',
      concierge_id: h.concierge_id || '',
    })
    setEditingId(h.id)
    setShowForm(true)
  }

  const handleDeactivate = async (id, name) => {
    if (!confirm(`Deactivate "${name}"? It will be hidden from cashier assignments.`)) return
    try {
      // Use the existing delete endpoint (soft delete)
      await fetch(`/api/admin/hotels/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('admin_token')}` },
      })
      load(page)
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Hotels</h1>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true) }}
          className="px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Hotel'}
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form onSubmit={editingId ? handleUpdate : handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 mb-5">
          <h3 className="font-semibold text-sm text-slate-900 mb-3">{editingId ? 'Edit Hotel' : 'New Hotel'}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500">Hotel Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Address</label>
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} required
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Contact Name</label>
              <input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Contact Phone</label>
              <input value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Default Commission %</label>
              <input type="number" step="0.5" value={form.default_commission_pct} onChange={e => setForm(p => ({ ...p, default_commission_pct: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-slate-400 mt-1">Cashiers assigned to this hotel will use this as their default commission</p>
            </div>
            <div>
              <label className="text-xs text-slate-500">Concierge</label>
              <select value={form.concierge_id} onChange={e => setForm(p => ({ ...p, concierge_id: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">No concierge</option>
                {concierges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Cashier commissions will be paid out through this concierge</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Latitude</label>
                <input type="number" step="any" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} placeholder="Optional"
                  className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Longitude</label>
                <input type="number" step="any" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} placeholder="Optional"
                  className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editingId ? 'Save Changes' : 'Create Hotel'}
            </button>
            <button type="button" onClick={resetForm} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="space-y-3">
          {hotels.map(h => (
            <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl shrink-0">🏨</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-slate-900">{h.name}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${h.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {h.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{h.address}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                    <span>Contact: {h.contact_name || '—'}</span>
                    <span>Commission: {h.default_commission_pct}%</span>
                    {h.concierge_id && <span className="text-blue-600">Concierge: {concierges.find(c => c.id === h.concierge_id)?.name || '—'}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => startEdit(h)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Edit</button>
                  {h.is_active ? (
                    <button onClick={() => handleDeactivate(h.id, h.name)} className="px-2.5 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Deactivate</button>
                  ) : (
                    <button onClick={() => { api.activateHotel(h.id).then(() => load(page)) }} className="px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Activate</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {hotels.length === 0 && <p className="text-center text-slate-400 py-8">No hotels yet</p>}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />
    </div>
  )
}
