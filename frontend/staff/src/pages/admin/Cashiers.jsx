import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/adminClient'
import { useSettings } from '../../hooks/useSettings.jsx'
import Pagination from '../../components/admin/Pagination'
import PhoneInput from '../../components/admin/PhoneInput'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

export default function Cashiers() {
  const settings = useSettings()
  const [data, setData] = useState({ items: [], total: 0, page: 1, total_pages: 0 })
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [qrData, setQrData] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [hotels, setHotels] = useState([])
  const [form, setForm] = useState({ name: '', phone: '', email: '', hotel_id: '' })
  const [creating, setCreating] = useState(false)

  const load = (p, f) => {
    setLoading(true)
    api.getCashiers(f || undefined, p, 10).then(setData).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { setPage(1); load(1, filter) }, [filter])
  useEffect(() => { load(page, filter) }, [page])
  useEffect(() => { api.getHotels(1, 100).then(d => setHotels(d.items || [])).catch(() => {}) }, [])

  const cashiers = data.items || []

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await api.createCashier(form)
      alert(`Cashier created!\nDefault password: last 4 digits of phone\nQR Code: ${res.ref_code}`)
      setShowForm(false)
      setForm({ name: '', phone: '', email: '', hotel_id: '' })
      load(1, filter)
    } catch (err) { alert(err.message) }
    finally { setCreating(false) }
  }

  const handleToggle = async (id) => { try { await api.toggleCashier(id); load(page, filter) } catch (e) { alert(e.message) } }
  const handlePermanentDelete = async (id, name) => {
    if (!confirm(`Permanently delete cashier "${name}"? This cannot be undone.`)) return
    try { await api.deleteCashier(id, true); load(page, filter) } catch (e) { alert(e.message) }
  }
  const handleQR = async (id) => {
    try { const data = await api.getCashierQR(id); setQrData(data) } catch (e) { alert(e.message) }
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Cashiers</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="px-3 lg:px-4 py-2 bg-blue-600 text-white rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-700">
          {showForm ? 'Cancel' : '+ Add Cashier'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 mb-5">
          <h3 className="font-semibold text-sm text-slate-900 mb-3">New Cashier</h3>
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
              <label className="text-xs text-slate-500">Hotel</label>
              <select value={form.hotel_id} onChange={e => setForm(p => ({ ...p, hotel_id: e.target.value }))}
                className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">No hotel</option>
                {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">Default password will be the last 4 digits of the phone number. Cashier will be prompted to change it on first login.</p>
          <button type="submit" disabled={creating}
            className="w-full lg:w-auto px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {creating ? 'Creating...' : 'Create Cashier'}
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
          {cashiers.map(c => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Card body — clickable, navigates to detail */}
              <Link to={`/admin/cashiers/${c.id}`} className="block p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-base font-bold text-purple-700">
                      {initials(c.name)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.phone}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                    c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>{c.status}</span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-400">Hotel</span><p className="font-medium">{c.hotel_name || '—'}</p></div>
                  <div><span className="text-slate-400">QR Code</span><p className="font-mono font-medium">{c.ref_code}</p></div>
                  <div><span className="text-slate-400">Referrals</span><p className="font-bold">{c.total_referrals}</p></div>
                  <div><span className="text-slate-400">Earnings</span><p className="font-bold text-green-700">${c.total_earnings}</p></div>
                </div>
              </Link>

              {/* QR button only — other actions in detail page */}
              {c.status === 'active' && (
                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
                  <button onClick={() => handleQR(c.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                    QR Code
                  </button>
                </div>
              )}
            </div>
          ))}
          {cashiers.length === 0 && <p className="text-center text-slate-400 py-8">No cashiers found</p>}
        </div>
      )}

      <div className="h-16"></div>
      <Pagination page={data.page} totalPages={data.total_pages} total={data.total} onPageChange={setPage} />

      {/* QR Code Modal */}
      {qrData && <QRModal data={qrData} onClose={() => setQrData(null)} />}
    </div>
  )
}


function QRModal({ data, onClose }) {
  const printRef = useRef(null)

  const handlePrint = () => {
    const content = printRef.current
    const win = window.open('', '_blank')
    win.document.write(`
      <html>
      <head>
        <title>QR Code - ${data.cashier_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: white; }
          .card { width: 350px; border: 2px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; color: #1e40af; margin-bottom: 4px; }
          .tagline { font-size: 12px; color: #64748b; margin-bottom: 24px; }
          .qr { margin: 0 auto 20px; }
          .qr img { width: 200px; height: 200px; }
          .cashier { font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 2px; }
          .hotel { font-size: 13px; color: #64748b; margin-bottom: 16px; }
          .divider { height: 1px; background: #e2e8f0; margin: 16px 0; }
          .instruction { font-size: 13px; color: #334155; font-weight: 500; margin-bottom: 4px; }
          .sub { font-size: 11px; color: #94a3b8; }
          .ref { font-family: monospace; font-size: 11px; color: #94a3b8; margin-top: 12px; }
          .phone { font-size: 12px; color: #64748b; margin-top: 8px; }
          @media print { body { margin: 0; } .card { border: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">${data.company_name}</div>
          <div class="tagline">Book your ride instantly</div>
          <div class="qr"><img src="data:image/png;base64,${data.qr_image}" /></div>
          <div class="cashier">${data.cashier_name}</div>
          <div class="hotel">${data.hotel_name}</div>
          <div class="divider"></div>
          <div class="instruction">Scan to book your ride</div>
          <div class="sub">Point your phone camera at the QR code</div>
          ${data.company_phone ? `<div class="phone">Questions? Call ${data.company_phone}</div>` : ''}
          <div class="ref">REF: ${data.ref_code}</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* QR Card */}
        <div ref={printRef} className="p-6 text-center">
          {/* Company branding */}
          <p className="text-2xl font-extrabold text-blue-700 mb-0.5">{data.company_name}</p>
          <p className="text-xs text-slate-500 mb-5">Book your ride instantly</p>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-2xl border-2 border-slate-100 inline-block">
              <img
                src={`data:image/png;base64,${data.qr_image}`}
                alt="QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Cashier info */}
          <p className="font-semibold text-slate-900">{data.cashier_name}</p>
          <p className="text-sm text-slate-500">{data.hotel_name}</p>

          <div className="h-px bg-slate-200 my-4"></div>

          <p className="text-sm font-medium text-slate-700 mb-1">Scan to book your ride</p>
          <p className="text-xs text-slate-400">Point your phone camera at the QR code</p>

          {data.company_phone && (
            <p className="text-xs text-slate-400 mt-3">Questions? Call {data.company_phone}</p>
          )}

          <p className="font-mono text-xs text-slate-300 mt-3">REF: {data.ref_code}</p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
