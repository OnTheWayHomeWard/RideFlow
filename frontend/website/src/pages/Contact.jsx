import { useState } from 'react'
import { SiteHeader, SiteFooter, useSEO } from '../lib'
import { api } from '../api'

export default function Contact({ site }) {
  const { settings, bookUrl, brandName } = site
  useSEO(
    `Contact Us — ${brandName}`,
    `Get in touch with ${brandName}. Booking questions, special trip requests, or support — reach us by email, phone, or message.`
  )

  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.email && !form.phone) { setError('Please give us either an email or a phone so we can reach you.'); return }
    setBusy(true)
    try {
      await api.submitContact(form)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] flex flex-col">
      <SiteHeader settings={settings} bookUrl={bookUrl} brandName={brandName} solid />

      <main className="flex-1 pt-28 pb-20 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h1 className="font-display text-4xl lg:text-5xl text-[var(--emerald-deep)] mb-3">Contact us</h1>
            <p className="text-slate-600">
              Booking question? Special trip request? Anything else? Send us a message and we'll get back to you the same day.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch">
            {/* Info card */}
            <div className="relative bg-gradient-to-br from-[var(--emerald-deep)] via-[var(--emerald-dark)] to-[var(--emerald)] rounded-[2rem] p-8 lg:p-10 text-white overflow-hidden">
              <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[var(--gold)]/15 blur-3xl"></div>
              <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[var(--emerald-2)]/30 blur-3xl"></div>
              <h2 className="relative font-display text-3xl mb-4">Reach us directly</h2>
              <p className="relative text-white/80 leading-relaxed mb-8">
                Prefer to call or email? We're happy to help with bookings, group trips, and anything else.
              </p>
              <div className="relative space-y-3">
                {settings.company_phone && (
                  <a href={`tel:${settings.company_phone}`} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/15 hover:border-[var(--gold)]/50 transition-colors">
                    <div className="w-11 h-11 rounded-xl bg-[var(--gold)]/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-[var(--gold-soft)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-white/60">Call us</p>
                      <p className="font-semibold truncate">{settings.company_phone}</p>
                    </div>
                  </a>
                )}
                {settings.company_email && (
                  <a href={`mailto:${settings.company_email}`} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/15 hover:border-[var(--gold)]/50 transition-colors">
                    <div className="w-11 h-11 rounded-xl bg-[var(--gold)]/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-[var(--gold-soft)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-white/60">Email us</p>
                      <p className="font-semibold truncate">{settings.company_email}</p>
                    </div>
                  </a>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="bg-white rounded-[2rem] p-7 lg:p-9 shadow-sm border border-slate-100">
              {done ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald-2)] mx-auto flex items-center justify-center mb-5 shadow-lg">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="font-display text-3xl text-[var(--emerald-deep)] mb-2">Thanks for reaching out!</h3>
                  <p className="text-slate-600">We'll get back to you shortly.</p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Your name</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required minLength={2}
                      className="w-full mt-1.5 px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-[var(--emerald)] text-sm" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Email</label>
                      <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        placeholder="you@example.com"
                        className="w-full mt-1.5 px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-[var(--emerald)] text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Phone</label>
                      <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                        placeholder="+251…"
                        className="w-full mt-1.5 px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-[var(--emerald)] text-sm" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 -mt-2">Provide at least one — email or phone.</p>
                  <div>
                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Message</label>
                    <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required minLength={5} rows={5}
                      placeholder="Tell us how we can help…"
                      className="w-full mt-1.5 px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-[var(--emerald)] text-sm resize-none" />
                  </div>
                  <input type="text" name="website" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                    tabIndex="-1" autoComplete="off" aria-hidden="true"
                    className="absolute opacity-0 -left-[9999px] w-0 h-0" />
                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}
                  <button type="submit" disabled={busy}
                    className="w-full bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-2)] hover:from-[var(--emerald-dark)] hover:to-[var(--emerald)] text-white font-bold py-4 rounded-xl text-sm transition-colors disabled:opacity-60 shadow-lg shadow-[var(--emerald)]/20">
                    {busy ? 'Sending…' : 'Send message'}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                    By submitting, you agree to be contacted by {brandName} regarding your inquiry. We never sell or share your contact details for third-party marketing.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <SiteFooter settings={settings} bookUrl={bookUrl} brandName={brandName} />
    </div>
  )
}
