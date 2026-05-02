import { useState, useEffect } from 'react'
import { api } from '../../api/adminClient'
import { useSettings } from '../../hooks/useSettings'
import AddressInput from '../../components/admin/AddressInput'

export default function Pricing() {
  const settings = useSettings()
  const [rates, setRates] = useState([])
  const [extras, setExtras] = useState([])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('rates')

  const load = () => {
    Promise.all([api.getVehicleRates(), api.getExtras(), api.getRoutes()])
      .then(([r, e, rt]) => { setRates(r); setExtras(e); setRoutes(rt) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  return (
    <div className="p-4 lg:p-6">
      <h1 className="text-xl lg:text-2xl font-bold text-slate-900 mb-4">Pricing</h1>

      <div className="flex gap-2 mb-5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {[
          { key: 'rates', label: `Vehicle Rates (${rates.length})` },
          { key: 'extras', label: `Add-ons (${extras.length})` },
          { key: 'routes', label: `Common Routes (${routes.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'rates' && <VehicleRatesTab rates={rates} reload={load} />}
      {tab === 'extras' && <ExtrasTab extras={extras} reload={load} />}
      {tab === 'routes' && <RoutesTab routes={routes} rates={rates} reload={load} googleApiKey={settings.google_maps_api_key} />}
    </div>
  )
}

// ═══ VEHICLE RATES ═══
function VehicleRatesTab({ rates, reload }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ display_name: '', vehicle_type: '', base_fare: '', per_mile_rate: '', max_passengers: '', max_luggage: '2', sort_order: '0', image_url: '', description: '' })
  const [editId, setEditId] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editId) { await api.updateRate(editId, form); setEditId(null) }
      else await api.createRate(form)
      setShowForm(false); setForm({ display_name: '', vehicle_type: '', base_fare: '', per_mile_rate: '', max_passengers: '', max_luggage: '2', sort_order: '0', image_url: '', description: '' })
      reload()
    } catch (err) { alert(err.message) }
  }

  const startEdit = (r) => {
    setForm({ display_name: r.display_name, vehicle_type: r.vehicle_type, base_fare: r.base_fare, per_mile_rate: r.per_mile_rate, max_passengers: r.max_passengers, max_luggage: r.max_luggage, sort_order: r.sort_order, image_url: r.image_url || '', description: r.description || '' })
    setEditId(r.id); setShowForm(true)
  }

  const toggleActive = async (r) => {
    try { await api.updateRate(r.id, { is_active: !r.is_active }); reload() } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ display_name: '', vehicle_type: '', base_fare: '', per_mile_rate: '', max_passengers: '', max_luggage: '2', sort_order: '0', image_url: '', description: '' }) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">{showForm ? 'Cancel' : '+ Add Vehicle'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3">{editId ? 'Edit Vehicle' : 'New Vehicle Type'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Inp label="Display Name" value={form.display_name} onChange={v => setForm(p => ({ ...p, display_name: v }))} required placeholder="e.g. Sedan" />
            {!editId && <Inp label="Type Key" value={form.vehicle_type} onChange={v => setForm(p => ({ ...p, vehicle_type: v }))} required placeholder="e.g. sedan" />}
            <Inp label="Base Fare ($)" type="number" value={form.base_fare} onChange={v => setForm(p => ({ ...p, base_fare: v }))} required />
            <Inp label="Per Mile ($)" type="number" value={form.per_mile_rate} onChange={v => setForm(p => ({ ...p, per_mile_rate: v }))} required />
            <Inp label="Max Passengers" type="number" value={form.max_passengers} onChange={v => setForm(p => ({ ...p, max_passengers: v }))} required />
            <Inp label="Max Luggage" type="number" value={form.max_luggage} onChange={v => setForm(p => ({ ...p, max_luggage: v }))} />
            <Inp label="Sort Order" type="number" value={form.sort_order} onChange={v => setForm(p => ({ ...p, sort_order: v }))} />
          </div>
          <div className="mb-3">
            <label className="text-xs text-slate-500">Image URL</label>
            <div className="flex gap-2 mt-1">
              <input type="url" value={form.image_url} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))}
                placeholder="https://example.com/car.png"
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {form.image_url && (
                <div className="w-20 h-16 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={form.image_url} alt="preview" className="max-w-full max-h-full object-contain" onError={e => { e.target.style.display = 'none' }} />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">Direct URL to a car image (PNG preferred). Shown to clients when choosing a vehicle.</p>
          </div>
          <div className="mb-3">
            <label className="text-xs text-slate-500">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="e.g. Comfortable 4-door sedan. Ideal for 1-3 passengers with standard luggage."
              className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <p className="text-xs text-slate-400 mt-1">Shown to clients when they expand the vehicle details.</p>
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{editId ? 'Save' : 'Create'}</button>
        </form>
      )}

      <div className="space-y-2">
        {rates.map(r => (
          <div key={r.id} className={`bg-white border rounded-xl overflow-hidden ${r.is_active ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}>
            <div className="p-3 lg:p-4 flex items-center gap-3">
              {r.image_url && (
                <div className="w-12 h-12 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={r.image_url} alt="" className="max-w-full max-h-full object-contain" onError={e => { e.target.style.display = 'none' }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-sm text-slate-900">{r.display_name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? 'Active' : 'Off'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                  <span><b className="text-slate-700">${r.base_fare}</b> base</span>
                  <span><b className="text-slate-700">${r.per_mile_rate}</b>/mi</span>
                  <span><b className="text-slate-700">{r.max_passengers}</b> passengers</span>
                  <span><b className="text-slate-700">{r.max_luggage}</b> bags</span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => startEdit(r)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Edit</button>
                <button onClick={() => toggleActive(r)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${r.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                  {r.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ EXTRAS ═══
function ExtrasTab({ extras, reload }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', price: '', description: '' })
  const [editId, setEditId] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editId) await api.updateExtra(editId, { name: form.name, price: form.price, description: form.description })
      else await api.createExtra(form)
      setShowForm(false); setEditId(null); setForm({ name: '', slug: '', price: '', description: '' })
      reload()
    } catch (err) { alert(err.message) }
  }

  const startEdit = (e) => {
    setForm({ name: e.name, slug: e.slug, price: e.price, description: e.description || '' })
    setEditId(e.id); setShowForm(true)
  }

  const toggleActive = async (e) => {
    try { await api.updateExtra(e.id, { is_active: !e.is_active }); reload() } catch (err) { alert(err.message) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', slug: '', price: '', description: '' }) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">{showForm ? 'Cancel' : '+ Add Add-on'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3">{editId ? 'Edit Add-on' : 'New Add-on'}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Inp label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} required placeholder="e.g. Child Seat" />
            {!editId && <Inp label="Slug" value={form.slug} onChange={v => setForm(p => ({ ...p, slug: v }))} required placeholder="e.g. child_seat" />}
            <Inp label="Price ($)" type="number" value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} required />
            <Inp label="Description" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Optional" />
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{editId ? 'Save' : 'Create'}</button>
        </form>
      )}

      <div className="space-y-2">
        {extras.map(e => (
          <div key={e.id} className={`bg-white border rounded-xl overflow-hidden ${e.is_active ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}>
            <div className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm text-slate-900">{e.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{e.is_active ? 'Active' : 'Off'}</span>
                </div>
                <p className="text-xs text-slate-500">{e.description || '—'}</p>
              </div>
              <p className="font-bold text-sm shrink-0">${e.price}</p>
            </div>
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button onClick={() => startEdit(e)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">Edit</button>
              <button onClick={() => toggleActive(e)} className={`px-3 py-1 rounded text-xs font-medium ${e.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {e.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ COMMON ROUTES ═══
function RoutesTab({ routes, rates, reload, googleApiKey }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', from_name: '', from_address: '', from_lat: '', from_lng: '', to_name: '', to_address: '', to_lat: '', to_lng: '', distance_miles: '', base_amount: '' })
  const [editId, setEditId] = useState(null)

  // Extract base amount from prices — take the lowest value as the route base
  const getBaseAmount = (prices) => {
    if (!prices || typeof prices !== 'object') return 0
    // If it has a _base key, use that; otherwise take min value
    if (prices._base !== undefined) return prices._base
    const vals = Object.values(prices).filter(v => typeof v === 'number')
    return vals.length ? Math.min(...vals) : 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const baseAmt = parseFloat(form.base_amount) || 0
      const data = {
        name: form.name, from_name: form.from_name, from_address: form.from_address,
        from_lat: parseFloat(form.from_lat) || null, from_lng: parseFloat(form.from_lng) || null,
        to_name: form.to_name, to_address: form.to_address,
        to_lat: parseFloat(form.to_lat) || null, to_lng: parseFloat(form.to_lng) || null,
        distance_miles: form.distance_miles ? parseFloat(form.distance_miles) : null,
        // Store base amount — pricing engine will add vehicle base fare on top
        prices: { _base: baseAmt },
      }
      if (editId) await api.updateRoute(editId, data)
      else await api.createRoute(data)
      setShowForm(false); setEditId(null); setForm({ name: '', from_name: '', from_address: '', from_lat: '', from_lng: '', to_name: '', to_address: '', to_lat: '', to_lng: '', distance_miles: '', base_amount: '' })
      reload()
    } catch (err) { alert(err.message) }
  }

  const startEdit = (r) => {
    setForm({
      name: r.name, from_name: r.from_name, from_address: r.from_address,
      from_lat: r.from_lat || '', from_lng: r.from_lng || '',
      to_name: r.to_name, to_address: r.to_address,
      to_lat: r.to_lat || '', to_lng: r.to_lng || '',
      distance_miles: r.distance_miles || '',
      base_amount: getBaseAmount(r.prices),
    })
    setEditId(r.id); setShowForm(true)
  }

  const handleToggle = async (r) => {
    try {
      if (r.is_active) await api.deleteRoute(r.id)
      else await api.activateRoute(r.id)
      reload()
    } catch (err) { alert(err.message) }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', from_name: '', from_address: '', from_lat: '', from_lng: '', to_name: '', to_address: '', to_lat: '', to_lng: '', distance_miles: '', base_amount: '' }) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">{showForm ? 'Cancel' : '+ Add Route'}</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3">{editId ? 'Edit Route' : 'New Common Route'}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <Inp label="Route Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} required placeholder="e.g. Airport to Downtown" />
            <Inp label="Distance (miles)" type="number" value={form.distance_miles} onChange={v => setForm(p => ({ ...p, distance_miles: v }))} placeholder="Optional" />
            <div>
              <label className="text-xs text-slate-500 mb-1 block">From Location</label>
              <AddressInput
                value={form.from_name || form.from_address}
                onChange={(loc) => setForm(p => ({ ...p, from_name: loc.name, from_address: loc.address, from_lat: loc.lat, from_lng: loc.lng }))}
                placeholder="Search start location..."
                googleApiKey={settings.google_maps_api_key}
                countries={settings.available_countries}
                serviceAreas={settings.service_areas}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">To Location</label>
              <AddressInput
                value={form.to_name || form.to_address}
                onChange={(loc) => setForm(p => ({ ...p, to_name: loc.name, to_address: loc.address, to_lat: loc.lat, to_lng: loc.lng }))}
                placeholder="Search destination..."
                googleApiKey={settings.google_maps_api_key}
                countries={settings.available_countries}
                serviceAreas={settings.service_areas}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-slate-500">Route Base Amount ($)</label>
              <input type="number" step="any" value={form.base_amount} onChange={e => setForm(p => ({ ...p, base_amount: e.target.value }))} required
                placeholder="e.g. 100"
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-slate-400 mt-1">Client pays: this amount + vehicle base fare. E.g. $100 route + $15 sedan base = $115 for sedan.</p>
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">{editId ? 'Save' : 'Create'}</button>
        </form>
      )}

      <div className="space-y-2">
        {routes.map(r => (
          <div key={r.id} className={`bg-white border rounded-xl overflow-hidden ${r.is_active ? 'border-slate-200' : 'border-slate-200 opacity-50'}`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-slate-900">{r.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? 'Active' : 'Off'}</span>
                </div>
                {r.distance_miles && <span className="text-xs text-slate-400">{r.distance_miles} mi</span>}
              </div>
              <p className="text-xs text-slate-500 mb-2">{r.from_name} → {r.to_name}</p>
              {(() => {
                const routeBase = r.prices?._base ?? (r.prices ? Math.min(...Object.values(r.prices).filter(v => typeof v === 'number')) : 0)
                const activeRates = rates.filter(rt => rt.is_active)
                return (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Route base: <b className="text-blue-700">${routeBase}</b></p>
                    <div className="flex gap-2 flex-wrap">
                      {activeRates.map(rt => (
                        <span key={rt.vehicle_type} className="text-xs bg-slate-100 px-2 py-1 rounded font-medium">
                          {rt.display_name}: <b>${(routeBase + rt.base_fare).toFixed(0)}</b>
                          <span className="text-slate-400 font-normal ml-0.5">({routeBase}+{rt.base_fare})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button onClick={() => startEdit(r)} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">Edit</button>
              <button onClick={() => handleToggle(r)} className={`px-3 py-1 rounded text-xs font-medium ${r.is_active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                {r.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Shared input component
function Inp({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={e => onChange(e.target.value)}
        required={required} placeholder={placeholder}
        className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}
