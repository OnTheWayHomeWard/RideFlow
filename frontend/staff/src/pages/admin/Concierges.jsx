import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/adminClient'

export default function Concierges() {
  const [concierges, setConcierges] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [editing, setEditing] = useState(null)

  const load = () => {
    setLoading(true)
    api.getConcierges().then(setConcierges).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await api.updateConcierge(editing, form)
      } else {
        const res = await api.createConcierge(form)
        alert(`Concierge created. Default password: ${res.default_password}`)
      }
      setShowForm(false); setEditing(null); setForm({ name: '', phone: '', email: '' })
      load()
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="p-4 lg:p-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Concierges</h1>
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', phone: '', email: '' }) }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ New Concierge'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <input required placeholder="Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input required placeholder="Phone" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <input placeholder="Email (optional)" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button type="submit" className="lg:col-span-3 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
            {editing ? 'Save' : 'Create'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : concierges.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No concierges yet</div>
      ) : (
        <div className="space-y-2">
          {concierges.map(c => (
            <Link key={c.id} to={`/admin/concierges/${c.id}`} className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    {c.stripe_connect_id && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Stripe</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                  </div>
                  <p className="text-xs text-slate-500">{c.phone}{c.email ? ` • ${c.email}` : ''}</p>
                  <p className="text-xs text-slate-500 mt-1">{c.hotel_count} hotels • {c.cashier_count} cashiers</p>
                </div>
                <div className="text-right">
                  {c.total_owed > 0 && (
                    <>
                      <p className="text-xs text-slate-400">Pending</p>
                      <p className="font-bold text-amber-600 text-lg">${c.total_owed.toFixed(2)}</p>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
