import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import StatusBadge from '../components/StatusBadge'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
}

export default function CashierDetail() {
  const { cashierId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [qrData, setQrData] = useState(null)

  const load = () => { api.getCashierDetail(cashierId).then(setData).catch(() => {}).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [cashierId])

  const startEdit = () => {
    const c = data.cashier
    setEditForm({
      name: c.name, phone: c.phone, email: c.email || '',
      hotel_id: c.hotel_id || '',
      commission_pct: c.commission_pct ?? '',
      payout_method: c.payout_method || 'bank',
      bank_name: c.payout_details?.bank_name || '',
      routing: c.payout_details?.routing || '',
      account: c.payout_details?.account || '',
      zelle_email: c.payout_details?.zelle_email || '',
      stripe_connect_id: c.stripe_connect_id || '',
    })
    setEditing(true)
  }

  const handleHotelChange = (hotelId) => {
    setEditForm(p => {
      const hotel = data.hotels?.find(h => h.id === hotelId)
      return {
        ...p,
        hotel_id: hotelId,
        // Auto-fill hotel's default commission (admin can still override)
        commission_pct: hotel ? hotel.commission_pct : p.commission_pct,
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { bank_name, routing, account, zelle_email, stripe_connect_id, ...rest } = editForm
      const params = { ...rest }

      if (rest.payout_method === 'bank') {
        params.payout_details = JSON.stringify({ bank_name, routing, account })
        params.stripe_connect_id = ''
      } else if (rest.payout_method === 'zelle') {
        params.payout_details = JSON.stringify({ zelle_email })
        params.stripe_connect_id = ''
      } else if (rest.payout_method === 'stripe_connect') {
        params.payout_details = JSON.stringify({})
        params.stripe_connect_id = stripe_connect_id
      }

      // Remove empty values
      Object.keys(params).forEach(k => { if (params[k] === '') delete params[k] })

      await api.updateCashier(cashierId, params)
      setEditing(false)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Change status to "${newStatus}"?`)) return
    try {
      if (newStatus === 'active') await api.approveCashier(cashierId)
      else await api.toggleCashier(cashierId)
      load()
    } catch (e) { alert(e.message) }
  }

  const handleQR = async () => {
    try { setQrData(await api.getCashierQR(cashierId)) } catch (e) { alert(e.message) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!data) return <div className="p-6 text-center text-slate-400">Cashier not found</div>

  const { cashier: c, stats, referrals, global_default_commission_pct } = data

  return (
    <div className="p-4 lg:p-6">
      <Link to="/cashiers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Cashiers
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 lg:p-5 mb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-xl font-bold text-purple-700 shrink-0">
            {initials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg lg:text-xl font-bold text-slate-900">{c.name}</h1>
            <p className="text-sm text-slate-500">{c.phone} {c.email && `• ${c.email}`}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                c.status === 'active' ? 'bg-green-100 text-green-700' : c.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
              }`}>{c.status}</span>
              {c.hotel_name && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c.hotel_name}</span>}
              <span className="text-xs font-mono text-slate-400">REF: {c.ref_code}</span>
            </div>
          </div>
          {/* Actions — top right */}
          <div className="flex gap-2 shrink-0">
            {c.status === 'active' && (
              <>
                <button onClick={handleQR} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">QR Code</button>
                <button onClick={() => handleStatusChange('inactive')} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Deactivate</button>
              </>
            )}
            {c.status === 'pending' && (
              <>
                <button onClick={() => handleStatusChange('active')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Approve</button>
                <button onClick={() => handleStatusChange('inactive')} className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200">Reject</button>
              </>
            )}
            {c.status === 'inactive' && (
              <button onClick={() => handleStatusChange('active')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">Activate</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Referrals" value={stats.total_referrals} />
          <MiniStat label="Earned" value={`$${stats.total_earned.toFixed(0)}`} color="green" />
          <MiniStat label="Commission" value={`${c.commission_pct ?? global_default_commission_pct}%`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        {[
          { key: 'info', label: 'Details' },
          { key: 'referrals', label: `Referrals (${referrals.length})` },
          { key: 'payout', label: 'Payout' },
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
                <h3 className="font-semibold text-slate-900">Cashier Details</h3>
                <button onClick={startEdit} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Edit</button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Name" value={c.name} />
                <Field label="Phone" value={c.phone} />
                <Field label="Email" value={c.email || '—'} />
                <Field label="Hotel" value={c.hotel_name || '—'} />
                <Field label="QR Code" value={c.ref_code} mono />
                <div>
                  <p className="text-xs text-slate-400">Commission %</p>
                  <p className="font-bold text-lg text-slate-900">{c.commission_pct ?? global_default_commission_pct}%</p>
                  {c.commission_pct && c.commission_pct !== global_default_commission_pct ? (
                    <p className="text-xs text-blue-600">Custom (default: {global_default_commission_pct}%)</p>
                  ) : (
                    <p className="text-xs text-slate-400">Using global default</p>
                  )}
                </div>
                <Field label="Registered" value={c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'} />
                <Field label="Approved" value={c.approved_at ? new Date(c.approved_at).toLocaleDateString() : '—'} />
              </div>

              {/* Password section */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-900">Password</h4>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{c.password_changed ? 'Password was changed by cashier' : 'Using default password'}</p>
                    {!c.password_changed && (
                      <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">{c.default_password}</p>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm(`Reset password back to default (${c.default_password})?`)) return
                      try {
                        await api.resetCashierPassword(cashierId)
                        alert(`Password reset to: ${c.default_password}`)
                        load()
                      } catch (e) { alert(e.message) }
                    }}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-300 shrink-0"
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Edit Cashier</h3>
                <button onClick={() => setEditing(false)} className="text-xs text-slate-500">Cancel</button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <EditField label="Name" value={editForm.name} onChange={v => setEditForm(p => ({ ...p, name: v }))} />
                <EditField label="Phone" value={editForm.phone} onChange={v => setEditForm(p => ({ ...p, phone: v }))} />
                <EditField label="Email" value={editForm.email} onChange={v => setEditForm(p => ({ ...p, email: v }))} />
                <div>
                  <label className="text-xs text-slate-500">Hotel</label>
                  <select value={editForm.hotel_id || ''} onChange={e => handleHotelChange(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">No hotel</option>
                    {data.hotels?.map(h => (
                      <option key={h.id} value={h.id}>{h.name} ({h.commission_pct}%)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Commission %</label>
                  <input type="number" step="0.5" value={editForm.commission_pct} placeholder={`${global_default_commission_pct} (default)`}
                    onChange={e => setEditForm(p => ({ ...p, commission_pct: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-slate-400 mt-1">
                    {editForm.hotel_id
                      ? `Hotel default: ${data.hotels?.find(h => h.id === editForm.hotel_id)?.commission_pct ?? global_default_commission_pct}%. Override here if needed.`
                      : `Global default: ${global_default_commission_pct}%`
                    }
                  </p>
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Payout Method</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-slate-500">Method</label>
                  <select value={editForm.payout_method} onChange={e => setEditForm(p => ({ ...p, payout_method: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="bank">Bank Account</option><option value="zelle">Zelle</option><option value="stripe_connect">Stripe Connect</option>
                  </select>
                </div>
              </div>

              {editForm.payout_method === 'bank' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                  <EditField label="Bank Name" value={editForm.bank_name} onChange={v => setEditForm(p => ({ ...p, bank_name: v }))} />
                  <EditField label="Routing Number" value={editForm.routing} onChange={v => setEditForm(p => ({ ...p, routing: v }))} />
                  <EditField label="Account Number" value={editForm.account} onChange={v => setEditForm(p => ({ ...p, account: v }))} />
                </div>
              )}
              {editForm.payout_method === 'zelle' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  <EditField label="Zelle Email or Phone" value={editForm.zelle_email} onChange={v => setEditForm(p => ({ ...p, zelle_email: v }))} />
                </div>
              )}
              {editForm.payout_method === 'stripe_connect' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  <EditField label="Stripe Connect ID" value={editForm.stripe_connect_id} onChange={v => setEditForm(p => ({ ...p, stripe_connect_id: v }))} />
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditing(false)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ REFERRALS TAB ═══ */}
      {tab === 'referrals' && (
        <div className="space-y-2">
          {referrals.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-slate-400">No referrals yet</p>
            </div>
          ) : referrals.map((r, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 lg:p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs text-slate-400">{r.booking_number}</span>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-slate-700">{r.pickup_name} → {r.dropoff_name}</p>
                <p className="text-xs text-slate-400">{r.pickup_date} • {r.client_name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-green-700">${r.commission.toFixed(2)}</p>
                <p className="text-xs text-slate-400">of ${r.total_amount}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PAYOUT TAB ═══ */}
      {tab === 'payout' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Earnings</h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">Total Earned</p>
                <p className="text-xl font-bold text-green-700">${stats.total_earned.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-slate-400">Total Referrals</p>
                <p className="text-xl font-bold text-blue-700">{stats.total_referrals}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Payout Method</h3>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <Field label="Method" value={c.payout_method?.toUpperCase() || 'BANK'} />
              <Field label="Commission" value={`${c.commission_pct ?? global_default_commission_pct}%`} />
            </div>

            {c.payout_details && Object.keys(c.payout_details).length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3 mt-2">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Account Details</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(c.payout_details).map(([k, v]) => (
                    <Field key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
                  ))}
                </div>
              </div>
            )}

            {c.stripe_connect_id && (
              <div className="bg-slate-50 rounded-xl p-3 mt-2">
                <p className="text-xs text-slate-400 font-medium">Stripe Connect</p>
                <p className="font-mono text-xs text-slate-600">{c.stripe_connect_id}</p>
              </div>
            )}

            {!c.payout_details && !c.stripe_connect_id && (
              <p className="text-xs text-slate-400 mt-2">No banking details configured. Click Edit on the Details tab to add.</p>
            )}
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrData && <QRModal data={qrData} onClose={() => setQrData(null)} />}
    </div>
  )
}

function MiniStat({ label, value, color }) {
  const colors = { green: 'text-green-700' }
  return (
    <div className="bg-slate-50 rounded-lg p-2 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm font-bold ${color ? colors[color] : 'text-slate-900'}`}>{value}</p>
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

function EditField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

function QRModal({ data, onClose }) {
  const handlePrint = () => {
    const win = window.open('', '_blank')
    win.document.write(`<html><head><title>QR - ${data.cashier_name}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh}.card{width:350px;border:2px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center}.logo{font-size:24px;font-weight:800;color:#1e40af;margin-bottom:4px}.tag{font-size:12px;color:#64748b;margin-bottom:24px}.qr img{width:200px;height:200px}.name{font-size:14px;font-weight:600;margin-top:16px}.hotel{font-size:13px;color:#64748b;margin-bottom:16px}.hr{height:1px;background:#e2e8f0;margin:16px 0}.inst{font-size:13px;color:#334155;font-weight:500}.sub{font-size:11px;color:#94a3b8}.ref{font-family:monospace;font-size:11px;color:#94a3b8;margin-top:12px}@media print{.card{border:none}}</style></head><body><div class="card"><div class="logo">${data.company_name}</div><div class="tag">Book your ride instantly</div><div class="qr"><img src="data:image/png;base64,${data.qr_image}"/></div><div class="name">${data.cashier_name}</div><div class="hotel">${data.hotel_name}</div><div class="hr"></div><div class="inst">Scan to book your ride</div><div class="sub">Point your phone camera at the QR code</div><div class="ref">REF: ${data.ref_code}</div></div><script>window.onload=function(){window.print()}</script></body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <p className="text-2xl font-extrabold text-blue-700 mb-0.5">{data.company_name}</p>
          <p className="text-xs text-slate-500 mb-5">Book your ride instantly</p>
          <div className="flex justify-center mb-4">
            <div className="bg-white p-3 rounded-2xl border-2 border-slate-100 inline-block">
              <img src={`data:image/png;base64,${data.qr_image}`} alt="QR" className="w-48 h-48" />
            </div>
          </div>
          <p className="font-semibold text-slate-900">{data.cashier_name}</p>
          <p className="text-sm text-slate-500">{data.hotel_name}</p>
          <div className="h-px bg-slate-200 my-4"></div>
          <p className="text-sm font-medium text-slate-700 mb-1">Scan to book your ride</p>
          <p className="text-xs text-slate-400">Point your phone camera at the QR code</p>
          <p className="font-mono text-xs text-slate-300 mt-3">REF: {data.ref_code}</p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handlePrint} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print
          </button>
          <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200">Close</button>
        </div>
      </div>
    </div>
  )
}
