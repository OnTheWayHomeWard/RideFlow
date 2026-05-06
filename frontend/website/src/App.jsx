import { useEffect, useState } from 'react'
import { api } from './api'

export default function App() {
  const [settings, setSettings] = useState({
    company_name: '', company_logo_url: '', company_phone: '', company_email: '',
    client_base_url: '', service_areas: [],
  })
  const [vehicles, setVehicles] = useState([])
  const [testimonials, setTestimonials] = useState([])

  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s)
      if (s.company_name) document.title = `${s.company_name} — Reserve Your Ride`
      if (s.company_logo_url) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = s.company_logo_url
      }
    }).catch(() => {})
    api.getVehicles().then(vs => setVehicles((vs || []).filter(v => v.is_active))).catch(() => {})
    api.getTestimonials().then(setTestimonials).catch(() => {})
  }, [])

  const bookUrl = settings.client_base_url || '#'
  const brandName = settings.company_name || 'GoBellMe'

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <Header settings={settings} bookUrl={bookUrl} brandName={brandName} />
      <Hero settings={settings} bookUrl={bookUrl} brandName={brandName} />
      <HowItWorks />
      <WhyUs />
      <Fleet vehicles={vehicles} bookUrl={bookUrl} />
      <Testimonials items={testimonials} />
      <ServiceArea areas={settings.service_areas} />
      <ContactForm settings={settings} />
      <Footer settings={settings} bookUrl={bookUrl} brandName={brandName} />
    </div>
  )
}


function Section({ children, className = '', id }) {
  return (
    <section id={id} className={`px-5 py-16 lg:py-24 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  )
}


function Header({ settings, bookUrl, brandName }) {
  return (
    <header className="absolute top-0 left-0 right-0 z-30 px-5 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 text-white">
          {settings.company_logo_url
            ? <img src={settings.company_logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-1" />
            : <div className="w-9 h-9 bg-white/10 rounded-lg" />}
          <span className="font-display text-xl tracking-tight">{brandName}</span>
        </a>
        <a href={bookUrl} className="bg-white text-[var(--emerald)] font-semibold text-sm px-4 py-2 rounded-full hover:bg-[var(--gold)] hover:text-white transition-colors">
          Book a Ride
        </a>
      </div>
    </header>
  )
}


function Hero({ settings, bookUrl, brandName }) {
  return (
    <section id="top" className="relative overflow-hidden text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--emerald)] via-[var(--emerald-dark)] to-[var(--emerald-deep)]" />
      {/* Subtle map-line pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-10" preserveAspectRatio="none" viewBox="0 0 1440 800">
        <path d="M0 600 Q 300 400 600 500 T 1200 480 L 1440 520" fill="none" stroke="white" strokeWidth="2" />
        <path d="M0 700 Q 250 600 500 650 T 1000 620 T 1440 660" fill="none" stroke="white" strokeWidth="2" />
        <path d="M0 300 Q 350 200 700 280 T 1440 260" fill="none" stroke="white" strokeWidth="2" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />

      <div className="relative max-w-6xl mx-auto px-5 pt-32 pb-24 lg:pt-40 lg:pb-32 text-center fade-up">
        <span className="inline-block bg-white/15 backdrop-blur-sm text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full mb-6">
          Pre-booked private rides
        </span>
        <h1 className="font-display text-5xl lg:text-7xl leading-tight mb-5">
          Reserve your ride.<br />
          <span className="text-[var(--gold)]">Anywhere. Anytime.</span>
        </h1>
        <p className="text-lg lg:text-xl text-white/80 max-w-2xl mx-auto mb-9">
          Pre-book a private vehicle from A to B and we'll take it from there.
          Transparent pricing, professional drivers, zero surprises.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href={bookUrl} className="bg-[var(--gold)] text-white font-bold text-lg px-8 py-4 rounded-full shadow-2xl hover:scale-105 active:scale-100 transition-transform">
            Book a Ride →
          </a>
          <a href="#fleet" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold text-lg px-8 py-4 rounded-full border border-white/20 transition-colors">
            See our fleet
          </a>
        </div>
      </div>
    </section>
  )
}


function HowItWorks() {
  const steps = [
    { n: '1', title: 'Pick where & when', desc: 'Set your pickup, drop-off, and the time you want to ride. No live calls, no waiting.' },
    { n: '2', title: 'Choose your vehicle', desc: 'Sedan, SUV, van — see the price up-front for each. No surge, no hidden fees.' },
    { n: '3', title: 'Confirm & ride', desc: 'Pay online and get a confirmation. We\'ll send reminders and notify you when your driver is on the way.' },
  ]
  return (
    <Section id="how">
      <h2 className="font-display text-4xl lg:text-5xl text-center text-[var(--emerald-deep)] mb-3">How it works</h2>
      <p className="text-center text-slate-600 mb-14 max-w-xl mx-auto">Three steps — designed for travelers who don't want to gamble on a curbside ride.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {steps.map(s => (
          <div key={s.n} className="bg-white rounded-3xl p-7 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[var(--emerald)] text-white font-bold text-xl flex items-center justify-center mb-4 font-display">{s.n}</div>
            <h3 className="font-bold text-xl text-slate-900 mb-2">{s.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}


function WhyUs() {
  const features = [
    { icon: 'M5 13l4 4L19 7', title: 'Transparent pricing', desc: 'See the full fare before you book. No surge, no surprises.' },
    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Vetted drivers', desc: 'Every driver is interviewed and approved by our operations team.' },
    { icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', title: 'SMS reminders', desc: 'You\'ll get a heads-up before pickup and a notification when your driver is on the way.' },
    { icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', title: 'Real human support', desc: 'Real people answering the phone. Reach us anytime if something needs attention.' },
  ]
  return (
    <Section className="bg-white">
      <h2 className="font-display text-4xl lg:text-5xl text-center text-[var(--emerald-deep)] mb-3">Why ride with us</h2>
      <p className="text-center text-slate-600 mb-14 max-w-xl mx-auto">The little things that make pre-booking better than the alternative.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map(f => (
          <div key={f.title} className="rounded-3xl p-6 border border-slate-100 hover:border-[var(--gold)]/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-[var(--emerald)]/10 text-[var(--emerald)] flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
              </svg>
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1.5">{f.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}


function Fleet({ vehicles, bookUrl }) {
  if (!vehicles.length) return null
  return (
    <Section id="fleet">
      <h2 className="font-display text-4xl lg:text-5xl text-center text-[var(--emerald-deep)] mb-3">Our fleet</h2>
      <p className="text-center text-slate-600 mb-12 max-w-xl mx-auto">Pick the size that fits your group. Every vehicle is regularly inspected and clean.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {vehicles.map(v => (
          <a key={v.id} href={bookUrl} className="block bg-white rounded-3xl overflow-hidden border border-slate-100 hover:shadow-2xl hover:-translate-y-1 transition-all">
            <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
              {v.image_url ? (
                <img src={v.image_url} alt={v.display_name} className="max-w-full max-h-full object-contain p-4"
                  onError={e => { e.target.style.display = 'none' }} />
              ) : (
                <div className="text-6xl">🚙</div>
              )}
            </div>
            <div className="p-5">
              <h3 className="font-display text-2xl text-[var(--emerald-deep)]">{v.display_name}</h3>
              {v.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{v.description}</p>}
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-3">
                <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>{v.max_passengers}</span>
                <span className="flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /></svg>{v.max_luggage}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500">Starts from</p>
                <p className="font-display text-2xl text-[var(--emerald-deep)]">${Number(v.base_fare).toFixed(0)} <span className="text-xs text-slate-400 font-sans">+ ${Number(v.per_mile_rate).toFixed(2)}/mi</span></p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </Section>
  )
}


function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= n ? 'text-[var(--gold)]' : 'text-slate-200'}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}


function Testimonials({ items }) {
  if (!items?.length) return null
  return (
    <Section className="bg-[var(--emerald)] text-white">
      <h2 className="font-display text-4xl lg:text-5xl text-center mb-3">What our riders say</h2>
      <p className="text-center text-white/70 mb-12 max-w-xl mx-auto">Real reviews from real rides.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.slice(0, 9).map((t, i) => (
          <div key={i} className="bg-white/10 backdrop-blur-sm rounded-3xl p-6 border border-white/10">
            <Stars n={t.stars} />
            <p className="text-white/95 mt-3 leading-relaxed">"{t.comment}"</p>
            <div className="mt-4 pt-4 border-t border-white/15">
              <p className="font-semibold">{t.name}</p>
              {t.route && <p className="text-xs text-white/60 truncate">{t.route}</p>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}


function ServiceArea({ areas }) {
  if (!areas?.length) return null
  const display = areas.map(a =>
    a.type === 'city' ? `${a.name}, ${a.country}` : (a.name || a.country)
  )
  return (
    <Section className="bg-white">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-display text-3xl lg:text-4xl text-[var(--emerald-deep)] mb-3">Where we operate</h2>
        <p className="text-slate-600 mb-6">Currently serving:</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {display.map((d, i) => (
            <span key={i} className="bg-[var(--emerald)]/5 text-[var(--emerald)] px-4 py-2 rounded-full text-sm font-semibold border border-[var(--emerald)]/15">
              📍 {d}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}


function ContactForm({ settings }) {
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
    <Section id="contact" className="bg-[var(--cream)]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div>
          <h2 className="font-display text-4xl lg:text-5xl text-[var(--emerald-deep)] mb-4">Get in touch</h2>
          <p className="text-slate-600 mb-6 leading-relaxed">
            Booking question? Special trip request? Anything else? Send us a message — we'll get back to you the same day.
          </p>
          <div className="space-y-3">
            {settings.company_phone && (
              <a href={`tel:${settings.company_phone}`} className="flex items-center gap-3 text-slate-700 hover:text-[var(--emerald)]">
                <div className="w-10 h-10 rounded-full bg-[var(--emerald)]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[var(--emerald)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Call us</p>
                  <p className="font-semibold">{settings.company_phone}</p>
                </div>
              </a>
            )}
            {settings.company_email && (
              <a href={`mailto:${settings.company_email}`} className="flex items-center gap-3 text-slate-700 hover:text-[var(--emerald)]">
                <div className="w-10 h-10 rounded-full bg-[var(--emerald)]/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[var(--emerald)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Email</p>
                  <p className="font-semibold">{settings.company_email}</p>
                </div>
              </a>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-sm border border-slate-100">
          {done ? (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--emerald)]/10 mx-auto flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-[var(--emerald)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="font-display text-2xl text-[var(--emerald-deep)] mb-2">Thanks for reaching out!</h3>
              <p className="text-slate-600 text-sm">We'll get back to you shortly.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-medium">Your name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required minLength={2}
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--emerald)] focus:border-transparent text-sm" />
              </div>
              <p className="text-xs text-slate-500 -mb-1">Provide at least one of email or phone:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--emerald)] focus:border-transparent text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+251…"
                    className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--emerald)] focus:border-transparent text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium">Message</label>
                <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required minLength={5} rows={4}
                  placeholder="Tell us how we can help…"
                  className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--emerald)] focus:border-transparent text-sm resize-none" />
              </div>
              {/* Honeypot — invisible to humans, visible-and-tempting to bots */}
              <input type="text" name="website" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                tabIndex="-1" autoComplete="off" aria-hidden="true"
                className="absolute opacity-0 -left-[9999px] w-0 h-0" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full bg-[var(--emerald)] hover:bg-[var(--emerald-dark)] text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-60">
                {busy ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </Section>
  )
}


function Footer({ settings, bookUrl, brandName }) {
  return (
    <footer className="bg-[var(--emerald-deep)] text-white/70 px-5 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-white">
            {settings.company_logo_url
              ? <img src={settings.company_logo_url} alt="" className="w-7 h-7 rounded-lg object-contain bg-white/10 p-0.5" />
              : <div className="w-7 h-7 bg-white/10 rounded-lg" />}
            <span className="font-display text-lg">{brandName}</span>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <a href={bookUrl} className="hover:text-[var(--gold)]">Book a ride</a>
            <a href="#contact" className="hover:text-[var(--gold)]">Contact</a>
          </div>
        </div>
        <div className="border-t border-white/10 mt-6 pt-5 text-xs text-center">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
