import { useState, useEffect } from 'react'
import { api } from '../api/client'

export default function QRCode() {
  const [profile, setProfile] = useState(null)
  const [settings, setSettings] = useState({ company_name: '', company_phone: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getMe(), api.getPublicSettings()])
      .then(([p, s]) => { setProfile(p); setSettings(s) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>
  if (!profile) return <p className="text-center text-slate-400 py-16">Failed to load</p>

  const bookingUrl = `${window.location.origin.replace(/:\d+$/, ':5173')}/book?ref=${profile.ref_code}`
  const companyName = settings.company_name || 'RideFlow'
  const companyPhone = settings.company_phone || ''

  const handlePrint = () => {
    const win = window.open('', '_blank')
    win.document.write(`<html><head><title>QR - ${profile.name}</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:white}
      .card{width:350px;border:2px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center}
      .logo{font-size:24px;font-weight:800;color:#7c3aed;margin-bottom:4px}
      .tag{font-size:12px;color:#64748b;margin-bottom:24px}
      .qr img{width:200px;height:200px}
      .name{font-size:16px;font-weight:600;color:#0f172a;margin-top:16px}
      .hotel{font-size:13px;color:#64748b;margin-bottom:16px}
      .hr{height:1px;background:#e2e8f0;margin:16px 0}
      .inst{font-size:14px;color:#334155;font-weight:500}
      .sub{font-size:11px;color:#94a3b8;margin-top:4px}
      .phone{font-size:12px;color:#64748b;margin-top:12px}
      .ref{font-family:monospace;font-size:11px;color:#cbd5e1;margin-top:12px}
      @media print{.card{border:none}}
    </style></head><body><div class="card">
      <div class="logo">${companyName}</div>
      <div class="tag">Book your ride instantly</div>
      <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}&color=7c3aed"/></div>
      <div class="name">${profile.name}</div>
      <div class="hotel">${profile.hotel_name || ''}</div>
      <div class="hr"></div>
      <div class="inst">Scan to book your ride</div>
      <div class="sub">Point your phone camera at the QR code</div>
      ${companyPhone ? `<div class="phone">Questions? Call ${companyPhone}</div>` : ''}
      <div class="ref">REF: ${profile.ref_code}</div>
    </div><script>window.onload=function(){window.print()}</script></body></html>`)
    win.document.close()
  }

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Your QR Code</h1>

      {/* QR Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center mb-4">
        <p className="text-2xl font-extrabold text-purple-700 mb-0.5">{companyName}</p>
        <p className="text-xs text-slate-500 mb-5">Book your ride instantly</p>

        <div className="flex justify-center mb-4">
          <div className="bg-white p-3 rounded-2xl border-2 border-slate-100 inline-block">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}&color=7c3aed`}
              alt="QR Code"
              className="w-48 h-48"
            />
          </div>
        </div>

        <p className="font-semibold text-slate-900">{profile.name}</p>
        <p className="text-sm text-slate-500">{profile.hotel_name}</p>

        <div className="h-px bg-slate-200 my-4"></div>

        <p className="text-sm font-medium text-slate-700 mb-1">Show this to guests</p>
        <p className="text-xs text-slate-400">They scan with their phone camera to book a ride</p>

        {companyPhone && <p className="text-xs text-slate-400 mt-3">Questions? Call {companyPhone}</p>}

        <p className="font-mono text-xs text-slate-300 mt-3">REF: {profile.ref_code}</p>
      </div>

      {/* Print */}
      <button onClick={handlePrint}
        className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 flex items-center justify-center gap-2 mb-3">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print QR Code
      </button>

      {/* Share link */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-medium text-slate-900 mb-2">Booking Link</p>
        <div className="flex gap-2">
          <input type="text" readOnly value={bookingUrl}
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600" />
          <button onClick={() => navigator.clipboard.writeText(bookingUrl)}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 shrink-0">
            Copy
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Share this link with guests who can't scan QR codes</p>
      </div>
    </div>
  )
}
