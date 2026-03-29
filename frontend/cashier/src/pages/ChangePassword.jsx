import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function ChangePassword({ onChanged }) {
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPw.length < 4) { setError('New password must be at least 4 characters'); return }
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)

    try {
      await api.changePassword({ current_password: current, new_password: newPw })
      setSuccess(true)
      onChanged()
      setTimeout(() => navigate('/'), 2000)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (success) {
    return (
      <div className="p-4 flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-900">Password Changed!</h2>
        <p className="text-sm text-slate-500 mt-1">Redirecting to home...</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Change Password</h1>
      <p className="text-sm text-slate-500 mb-5">Update your default password to keep your account secure.</p>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-4">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required
            placeholder="Enter your current password"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <p className="text-xs text-slate-400 mt-1">If you haven't changed it, this is the last 4 digits of your phone number</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required
            placeholder="Choose a new password"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
            placeholder="Type it again"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-purple-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-purple-700 disabled:opacity-60 transition-all">
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
