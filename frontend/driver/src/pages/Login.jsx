import { useState, useEffect } from 'react'
import { api } from '../api/client'
import PhoneInput from '../components/PhoneInput'

export default function Login({ onLogin, settings }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t) } }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await api.login({ phone, password })
      onLogin(res.access_token, res.name, res.password_changed)
      window.location.href = '/'
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative">
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 flex justify-center animate-[slideDown_0.3s_ease]">
          <div className="max-w-sm w-full bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm font-medium text-red-800 flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
      )}
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {settings.company_logo_url ? (
            <img src={settings.company_logo_url} alt="" className="w-14 h-14 object-contain rounded-2xl mx-auto mb-4" />
          ) : (
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{settings.company_name || 'RideFlow'}</h1>
          <p className="text-slate-400 text-sm mt-1">Driver Portal</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <PhoneInput value={phone} onChange={setPhone} availableCountries={settings.available_countries} placeholder="Phone number" />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter password" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-60">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
