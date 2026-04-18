import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

export default function ConciergeOnboarding() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('No onboarding token provided')
      setLoading(false)
      return
    }
    fetch(`/api/public/concierge-info?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setInfo(d)
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [token])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const res = await fetch(`/api/public/concierge-onboarding?token=${token}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      if (data.already_connected) {
        setInfo(prev => ({ ...prev, connected: true, charges_enabled: true }))
        return
      }
      if (data.onboarding_url) {
        window.location.href = data.onboarding_url
      }
    } catch (e) { setError(e.message) }
    finally { setConnecting(false) }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Invalid Link</h1>
        <p className="text-sm text-slate-500">{error}</p>
        <p className="text-xs text-slate-400 mt-3">Please contact the admin for a new onboarding link.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Welcome, {info.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Set up your payout account to receive commissions</p>
        </div>

        {info.connected && info.charges_enabled ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-green-700 mb-1">All set!</p>
            <p className="text-sm text-slate-500">Your Stripe account is connected and ready to receive payouts.</p>
          </div>
        ) : info.connected ? (
          <div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-amber-700 font-medium">Setup incomplete</p>
              <p className="text-xs text-amber-600 mt-1">Your Stripe account needs additional information. Click below to continue.</p>
            </div>
            <button onClick={handleConnect} disabled={connecting}
              className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-60">
              {connecting ? 'Loading...' : 'Continue Setup'}
            </button>
          </div>
        ) : (
          <div>
            <div className="space-y-2 mb-5 text-sm text-slate-600">
              <p>• We use Stripe to securely process your payouts</p>
              <p>• You'll provide your bank or debit card details to Stripe</p>
              <p>• We never see or store your banking info</p>
              <p>• Takes about 2 minutes</p>
            </div>
            <button onClick={handleConnect} disabled={connecting}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-60">
              {connecting ? 'Loading...' : 'Set Up Payouts with Stripe'}
            </button>
            <p className="text-xs text-slate-400 text-center mt-3">Powered by Stripe</p>
          </div>
        )}
      </div>
    </div>
  )
}
