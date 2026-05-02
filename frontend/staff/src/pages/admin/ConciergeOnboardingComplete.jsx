export default function ConciergeOnboardingComplete() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">All Done!</h1>
        <p className="text-sm text-slate-500 mb-4">Your Stripe account is connected. You'll automatically receive payouts when the admin releases batches.</p>
        <p className="text-xs text-slate-400">You can close this window now.</p>
      </div>
    </div>
  )
}
