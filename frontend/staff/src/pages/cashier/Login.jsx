import { useState, useEffect } from 'react'
import { api } from '../../api/cashierClient'
import Logo from '../../components/cashier/Logo'
import PhoneInput from '../../components/cashier/PhoneInput'

export default function Login({ onLogin, companyName, logoUrl, countries }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.login({ phone, password })
      onLogin(res.access_token, res.name, res.password_changed)
      window.location.href = '/cashier'
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-purple-900 flex items-center justify-center p-4 relative">
      {/* Snackbar error — top of screen */}
      {error && (
        <div className="fixed top-4 left-4 right-4 z-50 flex justify-center animate-[slideDown_0.3s_ease]">
          <div className="max-w-sm w-full bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-red-800 flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4">
            <Logo url={logoUrl} size="lg" className="mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white">{companyName || 'RideFlow'}</h1>
          <p className="text-purple-300 text-sm mt-1">Cashier Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-xl">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <PhoneInput value={phone} onChange={setPhone} availableCountries={countries} placeholder="Phone number" />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Enter password" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-60 transition-all">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
