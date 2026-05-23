import { useEffect, useState } from 'react'
import { api } from '../api'
import { SiteHeader, SiteFooter, CarGlyph, useSEO } from '../lib'

const D = {
  hero_badge: 'Pre-booked private rides',
  hero_title: 'Reserve your ride.',
  hero_title_accent: 'Anywhere. Anytime.',
  hero_subtitle: "Pre-book a private vehicle from A to B and we'll take it from there. Transparent pricing, professional drivers, zero surprises.",
  stat_rides: '10,000+',
  stat_rating: '4.9★',
  stat_uptime: '24/7',
  how_title: 'How it works',
  how_subtitle: "Three steps. Designed for travelers who don't want to gamble on a curbside ride.",
  why_title: 'Why ride with us',
  why_subtitle: 'The little things that make pre-booking better than the alternative.',
  fleet_title: 'Our fleet',
  fleet_subtitle: 'Pick the size that fits your group. Every vehicle is regularly inspected and clean.',
  testimonials_title: 'What our riders say',
  testimonials_subtitle: 'Real reviews from real rides.',
  service_title: 'Where we operate',
  service_subtitle: 'Currently serving these cities.',
  contact_title: "Let's talk",
  contact_subtitle: "Booking question? Special trip request? Anything else? Send us a message — we'll get back to you the same day.",
}
const T = (s, k) => (s?.[`website_${k}`] && String(s[`website_${k}`]).trim()) || D[k]


export default function Landing({ site }) {
  const { settings, bookUrl, brandName } = site
  const [vehicles, setVehicles] = useState([])
  const [testimonials, setTestimonials] = useState([])

  useSEO(
    `${brandName} — Reserve Your Ride`,
    'Pre-book a private ride from anywhere to anywhere. Transparent pricing, professional drivers, no surge. Reserve your ride with ' + brandName + '.'
  )

  useEffect(() => {
    api.getVehicles().then(vs => setVehicles((vs || []).filter(v => v.is_active))).catch(() => {})
    api.getTestimonials().then(setTestimonials).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <SiteHeader settings={settings} bookUrl={bookUrl} brandName={brandName} />
      <Hero settings={settings} bookUrl={bookUrl} brandName={brandName} />
      <HowItWorks settings={settings} />
      <WhyUs settings={settings} />
      <Fleet vehicles={vehicles} bookUrl={bookUrl} settings={settings} />
      <Testimonials items={testimonials} settings={settings} />
      <ServiceArea areas={settings.service_areas} settings={settings} />
      <ContactForm settings={settings} />
      <SiteFooter settings={settings} bookUrl={bookUrl} brandName={brandName} />
    </div>
  )
}


/* ────────────────  HEADER  ──────────────── */


/* ────────────────  HERO  ──────────────── */

function Hero({ settings, bookUrl, brandName }) {
  return (
    <section id="top" className="relative overflow-hidden text-white isolate">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--emerald-deep)] via-[var(--emerald-dark)] to-[var(--emerald)]" />
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[var(--gold)]/15 blur-3xl blob" />
      <div className="absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full bg-[var(--emerald-2)]/40 blur-3xl blob" style={{ animationDelay: '5s' }} />
      <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-white/5 blur-3xl blob" style={{ animationDelay: '10s' }} />

      <svg className="absolute inset-0 w-full h-full opacity-15" preserveAspectRatio="none" viewBox="0 0 1440 800" aria-hidden>
        <path d="M0 600 Q 300 400 600 500 T 1200 480 L 1440 520" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 10" />
        <path d="M0 700 Q 250 600 500 650 T 1000 620 T 1440 660" fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 10" />
      </svg>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[58%] drift-x opacity-20"><CarGlyph className="w-20 h-20 text-white" /></div>
        <div className="absolute top-[78%] drift-x opacity-10" style={{ animationDelay: '-15s', animationDuration: '50s' }}>
          <CarGlyph className="w-14 h-14 text-white" />
        </div>
      </div>

      <div className="relative max-w-6xl mx-auto px-5 pt-36 pb-20 lg:pt-44 lg:pb-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="fade-up">
            <span className="inline-block bg-white/10 backdrop-blur-sm text-xs font-semibold tracking-wide uppercase px-4 py-1.5 rounded-full mb-7 border border-white/15">
              {T(settings, 'hero_badge')}
            </span>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-5 max-w-[18ch]" style={{ textWrap: 'balance' }}>
              {T(settings, 'hero_title')}{' '}
              <span className="text-[var(--gold-soft)]">{T(settings, 'hero_title_accent')}</span>
            </h1>
            <p className="text-base lg:text-lg text-white/80 max-w-lg mb-8 leading-relaxed" style={{ textWrap: 'pretty' }}>
              {T(settings, 'hero_subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href={bookUrl}
                className="shimmer text-white font-bold text-base px-8 py-4 rounded-full shadow-2xl shadow-[var(--gold)]/30 hover:scale-[1.03] active:scale-100 transition-transform inline-flex items-center justify-center gap-2">
                Book a Ride
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </a>
              <a href="#fleet" className="bg-white/10 hover:bg-white/15 backdrop-blur-sm text-white font-semibold text-base px-8 py-4 rounded-full border border-white/20 transition-colors text-center">
                See our fleet
              </a>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Stat value={T(settings, 'stat_rides')} label="Rides delivered" />
              <Stat value={T(settings, 'stat_rating')} label="Avg rating" />
              <Stat value={T(settings, 'stat_uptime')} label="Available" />
            </div>
          </div>

          <div className="relative fade-up" style={{ animationDelay: '.15s' }}>
            <HeroVisual imageUrl={settings.website_hero_image_url} brandName={brandName} />
          </div>
        </div>
      </div>

      {/* Wave divider into the cream background */}
      <svg className="block w-full h-12 md:h-20" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden>
        <path fill="var(--cream)" d="M0,32 C240,80 480,80 720,48 C960,16 1200,16 1440,48 L1440,80 L0,80 Z" />
      </svg>
    </section>
  )
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="font-display text-2xl lg:text-3xl text-[var(--gold-soft)]">{value}</p>
      <p className="text-xs text-white/60 mt-0.5">{label}</p>
    </div>
  )
}

function HeroVisual({ imageUrl, brandName }) {
  if (imageUrl) {
    return (
      <div className="relative">
        <div className="absolute -inset-4 bg-gradient-to-br from-[var(--gold)]/25 to-transparent rounded-3xl blur-2xl" />
        <img src={imageUrl} alt="" className="relative w-full h-auto rounded-3xl shadow-2xl border border-white/10" />
      </div>
    )
  }
  return (
    <div className="relative float-slow">
      <div className="absolute -inset-6 bg-gradient-to-br from-[var(--gold)]/30 via-transparent to-[var(--emerald-2)]/30 rounded-[2rem] blur-2xl" />
      <div className="relative bg-white/5 backdrop-blur-md border border-white/15 rounded-[2rem] p-8 shadow-2xl">
        <svg viewBox="0 0 400 220" className="w-full h-auto drop-shadow-2xl">
          <defs>
            <linearGradient id="bodyGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fef9f0" />
              <stop offset="100%" stopColor="#d4a017" />
            </linearGradient>
            <linearGradient id="windowGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0a7c5e" />
              <stop offset="100%" stopColor="#022c22" />
            </linearGradient>
          </defs>
          <ellipse cx="200" cy="195" rx="160" ry="8" fill="#000" opacity="0.25" />
          <path d="M40,160 L70,120 Q90,95 130,90 L260,90 Q300,95 320,120 L360,160 Q365,168 360,175 L40,175 Q35,168 40,160 Z" fill="url(#bodyGrad)" />
          <path d="M105,123 L125,103 Q135,98 150,98 L240,98 Q260,98 275,108 L295,128 Q298,135 290,135 L115,135 Q102,135 105,123 Z" fill="url(#windowGrad)" />
          <line x1="200" y1="98" x2="200" y2="135" stroke="#fef9f0" strokeWidth="2" opacity="0.3" />
          <line x1="200" y1="135" x2="200" y2="170" stroke="#022c22" strokeWidth="1.5" opacity="0.4" />
          <circle cx="345" cy="135" r="6" fill="#fef9f0" />
          <circle cx="115" cy="175" r="22" fill="#1a1a1a" />
          <circle cx="115" cy="175" r="11" fill="#444" />
          <circle cx="115" cy="175" r="4" fill="#fef9f0" />
          <circle cx="290" cy="175" r="22" fill="#1a1a1a" />
          <circle cx="290" cy="175" r="11" fill="#444" />
          <circle cx="290" cy="175" r="4" fill="#fef9f0" />
        </svg>
        <div className="flex items-center justify-center gap-2 mt-5">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400"></span>
          </span>
          <p className="text-sm text-white/85 font-medium">Drivers available right now</p>
        </div>
      </div>
    </div>
  )
}


/* ────────────────  HOW IT WORKS  ──────────────── */

function HowItWorks({ settings }) {
  const steps = [
    { n: '1', title: 'Pick where & when', desc: "Set your pickup, drop-off, and the time you want to ride. No live calls, no waiting.",
      icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
    { n: '2', title: 'Choose your vehicle', desc: 'Sedan, SUV, van — see the price up-front for each. No surge, no hidden fees.',
      icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
    { n: '3', title: 'Confirm & ride', desc: "Pay online and get a confirmation. We'll send reminders and notify you when your driver is on the way.",
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  ]
  return (
    <Section id="how" className="relative">
      <SectionHead title={T(settings, 'how_title')} subtitle={T(settings, 'how_subtitle')} />
      <div className="relative">
        <div className="hidden md:block absolute top-8 left-[16%] right-[16%] h-px border-t-2 border-dashed border-[var(--emerald)]/20"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative">
          {steps.map((s) => (
            <div key={s.n} className="relative bg-white rounded-3xl p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all border border-slate-100 group">
              <div className="flex items-center justify-between mb-5">
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald-2)] text-white flex items-center justify-center font-display text-3xl shadow-lg">
                  {s.n}
                  <span className="absolute inset-0 rounded-2xl border-2 border-[var(--gold)] pulse-ring opacity-0 group-hover:opacity-60"></span>
                </div>
                <svg className="w-7 h-7 text-[var(--emerald)]/30 group-hover:text-[var(--gold)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={s.icon} />
                </svg>
              </div>
              <h3 className="font-display text-2xl text-[var(--emerald-deep)] mb-2">{s.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}


/* ────────────────  WHY US  ──────────────── */

function WhyUs({ settings }) {
  const features = [
    { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: 'On time, every time', desc: 'Reservations built around your schedule, not ours. Track ETA from your phone.' },
    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Vetted drivers', desc: 'Every driver is interviewed, background-checked, and rated by riders.' },
    { icon: 'M5 13l4 4L19 7', title: 'Transparent pricing', desc: 'See the full fare before you book. No surge multipliers, no hidden fees.' },
    { icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z', title: 'Real human support', desc: "Real people on the phone. Reach us anytime if something needs attention." },
  ]
  return (
    <Section className="relative bg-white">
      <SectionHead title={T(settings, 'why_title')} subtitle={T(settings, 'why_subtitle')} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map((f) => (
          <div key={f.title} className="group relative rounded-3xl p-6 bg-gradient-to-br from-[var(--cream)] to-white border border-slate-100 hover:border-[var(--gold)]/40 hover:shadow-xl transition-all">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald-2)] text-white flex items-center justify-center mb-5 shadow-md group-hover:rotate-6 transition-transform">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
              </svg>
            </div>
            <h3 className="font-display text-xl text-[var(--emerald-deep)] mb-1.5">{f.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}


/* ────────────────  FLEET  ──────────────── */

function Fleet({ vehicles, bookUrl, settings }) {
  if (!vehicles.length) return null
  return (
    <Section id="fleet" className="relative">
      <div className="absolute top-20 right-8 w-32 h-32 rounded-full bg-[var(--gold)]/10 blur-3xl"></div>
      <div className="absolute bottom-20 left-8 w-40 h-40 rounded-full bg-[var(--emerald)]/10 blur-3xl"></div>

      <SectionHead title={T(settings, 'fleet_title')} subtitle={T(settings, 'fleet_subtitle')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {vehicles.map((v, i) => <VehicleCard key={v.id} v={v} bookUrl={bookUrl} delay={i * 0.05} />)}
      </div>

      <div className="text-center mt-12">
        <a href={bookUrl} className="inline-flex items-center gap-2 text-[var(--emerald)] font-semibold hover:text-[var(--gold)] transition-colors">
          Ready to ride? See full pricing →
        </a>
      </div>
    </Section>
  )
}

function bestForLabel(v) {
  // Friendly use-case suggestion based on capacity. Marketing copy, not exact.
  const p = Number(v.max_passengers || 0)
  if (p <= 3) return 'Solo trips & couples'
  if (p <= 5) return 'Small groups & families'
  if (p <= 8) return 'Group of friends'
  return 'Large groups & events'
}

function VehicleCard({ v, bookUrl, delay }) {
  return (
    <a href={bookUrl}
      className="group relative bg-white rounded-3xl overflow-hidden border border-slate-100 hover:border-[var(--gold)]/50 hover:shadow-2xl hover:-translate-y-2 transition-all fade-up flex flex-col"
      style={{ animationDelay: `${delay}s` }}>
      <div className="relative aspect-[4/3] bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald-deep)] overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-10" preserveAspectRatio="none" viewBox="0 0 200 150" aria-hidden>
          <pattern id={`dots-${v.id}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="white" />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#dots-${v.id})`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
          {v.image_url ? (
            <img src={v.image_url} alt={v.display_name} className="max-w-[85%] max-h-[80%] object-contain drop-shadow-2xl"
              onError={e => { e.target.style.display = 'none' }} />
          ) : (
            <CarGlyph className="w-32 h-32 text-white/80" />
          )}
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-display text-2xl text-[var(--emerald-deep)] leading-tight">{v.display_name}</h3>
        <p className="text-xs uppercase tracking-wider text-[var(--gold)] font-bold mt-1">{bestForLabel(v)}</p>
        {v.description && <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-3">{v.description}</p>}

        {/* Capacity row — visual icons with labels */}
        <div className="flex items-center gap-4 mt-4 text-slate-700">
          <div className="flex items-center gap-1.5">
            <svg className="w-5 h-5 text-[var(--emerald)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-sm"><b className="font-display text-base">{v.max_passengers}</b> seat{v.max_passengers !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-5 h-5 text-[var(--emerald)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5h6v2h2a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h2V5zM10 7v0M14 7v0" /></svg>
            <span className="text-sm"><b className="font-display text-base">{v.max_luggage}</b> bag{v.max_luggage !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="mt-auto pt-5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-sm text-[var(--emerald)] group-hover:text-[var(--gold)] transition-colors font-semibold">
            Book this
            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </span>
          <span className="bg-[var(--cream-warm)] text-[var(--emerald-deep)] text-xs font-bold px-2.5 py-1 rounded-full border border-[var(--gold)]/20">
            from ${Number(v.base_fare).toFixed(0)}
          </span>
        </div>
      </div>
    </a>
  )
}


/* ────────────────  TESTIMONIALS  ──────────────── */

function Stars({ n, gold = false }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= n ? (gold ? 'text-[var(--gold)]' : 'text-amber-400') : (gold ? 'text-white/20' : 'text-slate-200')}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

function avatarColor(name) {
  let h = 0
  for (const c of (name || '?')) h = (h * 31 + c.charCodeAt(0)) | 0
  const palette = [
    ['#0a7c5e', '#065f46'],
    ['#d4a017', '#a37e0d'],
    ['#1e40af', '#1e3a8a'],
    ['#7c2d12', '#9a3412'],
    ['#4c1d95', '#5b21b6'],
    ['#155e63', '#0f4c47'],
  ]
  return palette[Math.abs(h) % palette.length]
}

function Testimonials({ items, settings }) {
  if (!items?.length) return null
  return (
    <section className="relative bg-[var(--emerald-deep)] text-white py-20 lg:py-28 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[60rem] h-[60rem] rounded-full bg-[var(--emerald-2)]/20 blur-3xl"></div>

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="inline-block bg-white/10 text-xs font-semibold tracking-wide uppercase px-4 py-1.5 rounded-full border border-white/15 mb-4">
            ★★★★★ Trusted by riders
          </span>
          <h2 className="font-display text-4xl lg:text-5xl mb-3">{T(settings, 'testimonials_title')}</h2>
          <p className="text-white/70">{T(settings, 'testimonials_subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.slice(0, 9).map((t, i) => {
            const [c1, c2] = avatarColor(t.name)
            const initial = (t.name || '?')[0].toUpperCase()
            return (
              <div key={i} className="group relative bg-white/5 backdrop-blur-sm rounded-3xl p-6 border border-white/10 hover:border-[var(--gold)]/40 transition-colors fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}>
                <svg className="absolute top-5 right-5 w-12 h-12 text-white/5 group-hover:text-[var(--gold)]/30 transition-colors" fill="currentColor" viewBox="0 0 32 32" aria-hidden>
                  <path d="M9.4 8C5 8 2 11.4 2 16.4 2 22.4 5.6 25 9.4 25c3 0 5.4-2.4 5.4-5.4 0-2.6-2-4.6-4.4-4.6-.2 0-.4 0-.6.2C10.4 13 12 11.4 14.4 11l-1-3H9.4zm12 0C17 8 14 11.4 14 16.4c0 6 3.6 8.6 7.4 8.6 3 0 5.4-2.4 5.4-5.4 0-2.6-2-4.6-4.4-4.6-.2 0-.4 0-.6.2.6-2.2 2.2-3.8 4.6-4.2l-1-3h-4z" />
                </svg>
                <Stars n={t.stars} gold />
                <p className="text-white/95 mt-4 leading-relaxed text-sm relative z-10">"{t.comment}"</p>
                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/10">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-display text-lg shadow-lg shrink-0 text-white"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    {t.route && <p className="text-xs text-white/50 truncate">{t.route}</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}


/* ────────────────  SERVICE AREA  ──────────────── */

function ServiceArea({ areas, settings }) {
  if (!areas?.length) return null
  const cities = areas.filter(a => a.type === 'city')
  const slot = (i, total) => {
    const angle = (i / Math.max(total, 1)) * Math.PI * 2 + 0.4
    const r = 28 + (i % 3) * 6
    return { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r * 0.55 }
  }

  return (
    <Section className="relative bg-gradient-to-b from-white to-[var(--cream-warm)] overflow-hidden">
      <SectionHead title={T(settings, 'service_title')} subtitle={T(settings, 'service_subtitle')} />

      <div className="relative max-w-5xl mx-auto">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-[var(--emerald)]/5 to-[var(--gold)]/5 rounded-[2rem] border border-slate-200 overflow-hidden">
          <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
            <defs>
              <pattern id="grid" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="var(--emerald)" strokeWidth="0.15" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            <path d="M 10 25 Q 25 18 35 24 T 55 28 Q 60 35 50 40 T 25 38 Q 12 35 10 25 Z" fill="var(--emerald)" opacity="0.12" />
            <path d="M 60 18 Q 75 14 85 22 Q 90 30 80 32 Q 70 30 65 25 Z" fill="var(--emerald)" opacity="0.12" />
            <path d="M 30 45 Q 45 42 55 48 Q 50 53 38 52 Q 32 50 30 45 Z" fill="var(--emerald)" opacity="0.10" />
          </svg>

          {(cities.length ? cities : areas).map((c, i, arr) => {
            const { x, y } = slot(i, arr.length)
            return (
              <div key={(c.country || '') + c.name} className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
                <div className="relative">
                  <div className="absolute inset-0 -m-2 rounded-full bg-[var(--gold)]/40 pulse-ring"></div>
                  <div className="relative w-3 h-3 rounded-full bg-[var(--gold)] ring-4 ring-white shadow-lg"></div>
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap bg-white px-3 py-1 rounded-full shadow-md text-xs font-semibold text-[var(--emerald-deep)] border border-slate-100">
                    {c.name}{c.country && c.type === 'city' ? `, ${c.country}` : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2 justify-center mt-8">
          {areas.map((a, i) => (
            <span key={i} className="bg-white px-4 py-2 rounded-full text-sm font-semibold text-[var(--emerald-deep)] border border-slate-200 shadow-sm">
              📍 {a.type === 'city' ? `${a.name}, ${a.country}` : (a.name || a.country)}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}


/* ────────────────  CONTACT  ──────────────── */

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
        <div className="relative bg-gradient-to-br from-[var(--emerald-deep)] via-[var(--emerald-dark)] to-[var(--emerald)] rounded-[2rem] p-8 lg:p-10 text-white overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[var(--gold)]/15 blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[var(--emerald-2)]/30 blur-3xl"></div>

          <span className="relative inline-block bg-white/10 backdrop-blur-sm text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full border border-white/15 mb-6">
            Get in touch
          </span>
          <h2 className="relative font-display text-4xl lg:text-5xl mb-4">{T(settings, 'contact_title')}</h2>
          <p className="relative text-white/80 leading-relaxed mb-8">{T(settings, 'contact_subtitle')}</p>

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
                <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required minLength={5} rows={4}
                  placeholder="Tell us how we can help…"
                  className="w-full mt-1.5 px-4 py-3 rounded-xl border-2 border-slate-100 focus:outline-none focus:border-[var(--emerald)] text-sm resize-none" />
              </div>
              <input type="text" name="website" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))}
                tabIndex="-1" autoComplete="off" aria-hidden="true"
                className="absolute opacity-0 -left-[9999px] w-0 h-0" />
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-2)] hover:from-[var(--emerald-dark)] hover:to-[var(--emerald)] text-white font-bold py-4 rounded-xl text-sm transition-colors disabled:opacity-60 shadow-lg shadow-[var(--emerald)]/20 inline-flex items-center justify-center gap-2">
                {busy ? 'Sending…' : (
                  <>Send message <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </Section>
  )
}


/* ────────────────  FOOTER  ──────────────── */


/* ────────────────  HELPERS  ──────────────── */

function Section({ children, className = '', id }) {
  return (
    <section id={id} className={`px-5 py-20 lg:py-28 ${className}`}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  )
}

function SectionHead({ title, subtitle }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-14">
      <h2 className="font-display text-4xl lg:text-5xl mb-3 text-[var(--emerald-deep)]">{title}</h2>
      <p className="text-slate-600">{subtitle}</p>
    </div>
  )
}
