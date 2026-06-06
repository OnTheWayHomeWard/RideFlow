// Shared editor used by both Pickup Groups and Dropoff Groups admin pages.
// Each group can:
//   - force one or more add-ons on the booking (rider sees them ticked & locked)
//   - silently surcharge the booking total (rider never sees a line item)
// when the matching coord (pickup OR dropoff, depending on `mode`) falls
// inside any of the group's radius-defined locations.
//
// Props:
//   mode     "pickup" | "dropoff" — drives copy + which coord is matched
//   api      { list, create, update, delete, addLocation, deleteLocation }
import { useState, useEffect } from 'react'
import { api as adminApi } from '../../api/adminClient'
import { useSettings } from '../../hooks/useSettings'
import AddressInput from './AddressInput'

const emptyForm = () => ({ name: '', forced_extra_slugs: [], surcharge_amount: '', is_active: true })

export default function LocationGroupsEditor({ mode, api }) {
  const isPickup = mode === 'pickup'
  const settings = useSettings()
  const [groups, setGroups] = useState([])
  const [extras, setExtras] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())

  const load = () => {
    Promise.all([
      api.list().catch(() => []),
      adminApi.getExtras().catch(() => []),
    ]).then(([gs, es]) => {
      setGroups(gs || [])
      setExtras((es || []).filter(e => e.is_active))
    }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const resetForm = () => { setForm(emptyForm()); setEditId(null); setShowForm(false) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: form.name,
        forced_extra_slugs: form.forced_extra_slugs,
        surcharge_amount: form.surcharge_amount === '' ? 0 : parseFloat(form.surcharge_amount) || 0,
        is_active: form.is_active,
      }
      if (editId) await api.update(editId, payload)
      else await api.create(payload)
      resetForm(); load()
    } catch (err) { alert(err.message) }
  }

  const startEdit = (g) => {
    setForm({
      name: g.name,
      forced_extra_slugs: g.forced_extra_slugs || [],
      surcharge_amount: g.surcharge_amount != null ? String(g.surcharge_amount) : '',
      is_active: g.is_active,
    })
    setEditId(g.id); setShowForm(true)
  }

  const handleDelete = async (g) => {
    if (!confirm(`Delete group "${g.name}" and all its locations?`)) return
    try { await api.delete(g.id); load() } catch (e) { alert(e.message) }
  }

  const toggleSlug = (slug) => {
    setForm(p => ({
      ...p,
      forced_extra_slugs: p.forced_extra_slugs.includes(slug)
        ? p.forced_extra_slugs.filter(s => s !== slug)
        : [...p.forced_extra_slugs, slug],
    }))
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>

  const title = isPickup ? 'Pickup Groups' : 'Dropoff Groups'
  const subtitle = isPickup
    ? "Auto-apply add-ons and/or silently surcharge the total when a booking's PICKUP falls inside one of these locations."
    : "Auto-apply add-ons and/or silently surcharge the total when a booking's DESTINATION falls inside one of these locations."
  const placeholderName = isPickup ? 'e.g. Airports' : 'e.g. Cruise Ports'

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={() => { if (showForm) resetForm(); else setShowForm(true) }}
          className="px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ New Group'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
          <h3 className="font-semibold text-sm mb-3">{editId ? 'Edit Group' : `New ${isPickup ? 'Pickup' : 'Dropoff'} Group`}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-500">Group name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
                placeholder={placeholderName}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-500">Silent surcharge ($)</label>
              <input type="number" step="any" min="0" value={form.surcharge_amount}
                onChange={e => setForm(p => ({ ...p, surcharge_amount: e.target.value }))}
                placeholder="0 = none"
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-slate-400 mt-1">Added to the total silently — rider sees a higher sum, no line item.</p>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" id={`grp-active-${mode}`} checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
              <label htmlFor={`grp-active-${mode}`} className="text-sm text-slate-700">Active</label>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">Force these add-ons (client can't uncheck them when the {isPickup ? 'pickup' : 'destination'} matches this group):</p>
            <div className="flex flex-wrap gap-2">
              {extras.length === 0 && <p className="text-xs text-amber-600">No active add-ons. Add some in Pricing → Add-ons first.</p>}
              {extras.map(e => {
                const on = form.forced_extra_slugs.includes(e.slug)
                return (
                  <button type="button" key={e.slug} onClick={() => toggleSlug(e.slug)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                    {on ? '✓ ' : ''}{e.name} {e.price ? <span className="opacity-70">${e.price}</span> : null}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Tip: You can leave forced add-ons empty and only use the surcharge above, or vice versa, or both.
            </p>
          </div>
          <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            {editId ? 'Save Changes' : 'Create Group'}
          </button>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          No groups yet. Click "New Group" to create one (e.g. {isPickup ? 'Airports, Cruise Ports' : 'Cruise Ports, Stadiums'}).
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <GroupCard key={g.id} group={g} extras={extras} settings={settings} api={api} mode={mode}
              onEdit={() => startEdit(g)} onDelete={() => handleDelete(g)}
              onChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}


function GroupCard({ group, extras, settings, api, mode, onEdit, onDelete, onChange }) {
  const [showAddLoc, setShowAddLoc] = useState(false)
  const [locForm, setLocForm] = useState({ name: '', address: '', lat: '', lng: '', radius_meters: 500 })
  const [saving, setSaving] = useState(false)
  const isPickup = mode === 'pickup'

  const labelFor = (slug) => extras.find(e => e.slug === slug)?.name || slug

  const handleAddLocation = async (e) => {
    e.preventDefault()
    if (!locForm.lat || !locForm.lng) { alert('Pick a location from the autocomplete.'); return }
    setSaving(true)
    try {
      await api.addLocation(group.id, {
        name: locForm.name,
        address: locForm.address || null,
        lat: parseFloat(locForm.lat),
        lng: parseFloat(locForm.lng),
        radius_meters: parseInt(locForm.radius_meters) || 500,
      })
      setLocForm({ name: '', address: '', lat: '', lng: '', radius_meters: 500 })
      setShowAddLoc(false)
      onChange()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  const handleRemoveLocation = async (loc) => {
    if (!confirm(`Remove "${loc.name}" from ${group.name}?`)) return
    try { await api.deleteLocation(group.id, loc.id); onChange() } catch (e) { alert(e.message) }
  }

  const surcharge = Number(group.surcharge_amount || 0)

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${group.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900">{group.name}</h3>
              <span className={`text-xs px-1.5 py-0.5 rounded ${group.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {group.is_active ? 'Active' : 'Off'}
              </span>
              {surcharge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold" title="Silent surcharge added to the total">
                  +${surcharge.toFixed(2)} silent
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Forced add-ons:{' '}
              {group.forced_extra_slugs.length === 0
                ? <span className="italic text-slate-400">none</span>
                : group.forced_extra_slugs.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <span className="font-medium text-slate-700">{labelFor(s)}</span>
                    </span>
                  ))}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={onEdit} className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">Edit</button>
            <button onClick={onDelete} className="px-2.5 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200">Delete</button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Locations ({group.locations.length})</p>
            <button onClick={() => setShowAddLoc(s => !s)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              {showAddLoc ? 'Cancel' : '+ Add location'}
            </button>
          </div>
          {group.locations.length === 0 && !showAddLoc && (
            <p className="text-xs text-slate-400 italic">No locations yet — add at least one for matching to work.</p>
          )}
          <div className="space-y-1.5">
            {group.locations.map(loc => (
              <div key={loc.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-700 flex-1 truncate">{loc.name}</span>
                <span className="text-xs text-slate-400 shrink-0">{loc.radius_meters}m</span>
                <button onClick={() => handleRemoveLocation(loc)} className="text-xs text-red-600 hover:text-red-700">×</button>
              </div>
            ))}
          </div>

          {showAddLoc && (
            <form onSubmit={handleAddLocation} className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2 items-end">
              <div className="lg:col-span-2">
                <label className="text-xs text-slate-500">Search location</label>
                <AddressInput
                  value={locForm.address || locForm.name}
                  onChange={(loc) => setLocForm(p => ({
                    ...p,
                    name: loc.name || p.name,
                    address: loc.address || '',
                    lat: loc.lat || '',
                    lng: loc.lng || '',
                  }))}
                  placeholder={isPickup ? 'e.g. Orlando International Airport' : 'e.g. Port Canaveral'}
                  googleApiKey={settings.google_maps_api_key}
                  countries={settings.available_countries}
                  serviceAreas={settings.service_areas}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Radius (meters)</label>
                <div className="flex gap-2 mt-1">
                  <input type="number" min="50" step="50" value={locForm.radius_meters}
                    onChange={e => setLocForm(p => ({ ...p, radius_meters: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <button type="submit" disabled={saving}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                    {saving ? '…' : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
