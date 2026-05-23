import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from './api'

/* Fetch public settings once, expose brand helpers. */
export function useSettings() {
  const [settings, setSettings] = useState({})
  useEffect(() => {
    api.getSettings().then(s => {
      setSettings(s)
      if (s.company_logo_url) {
        let link = document.querySelector("link[rel~='icon']")
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
        link.href = s.company_logo_url
      }
    }).catch(() => {})
  }, [])
  return {
    settings,
    bookUrl: settings.client_base_url || '#',
    brandName: settings.company_name || 'GoBellMe',
  }
}

/* Per-page SEO title + meta description. */
export function useSEO(title, description) {
  useEffect(() => {
    if (title) document.title = title
    if (description) {
      let m = document.querySelector('meta[name="description"]')
      if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m) }
      m.content = description
    }
    window.scrollTo(0, 0)
  }, [title, description])
}

export function CarGlyph({ className }) {
  return (
    <svg viewBox="0 0 64 32" fill="currentColor" className={className} aria-hidden>
      <path d="M4,22 L10,15 Q14,12 19,12 L42,12 Q49,12 53,16 L60,22 Q62,24 60,26 L4,26 Q2,24 4,22 Z" />
      <circle cx="16" cy="26" r="4" fill="black" opacity="0.4" />
      <circle cx="46" cy="26" r="4" fill="black" opacity="0.4" />
    </svg>
  )
}

/* Header. `solid` = always-on emerald background (used on legal/contact pages
   that don't have a dark hero behind the bar). On the landing page it stays
   scroll-reactive. */
export function SiteHeader({ settings, bookUrl, brandName, solid = false }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (solid) return
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [solid])

  const opaque = solid || scrolled
  return (
    <header className={`fixed top-0 left-0 right-0 z-30 px-5 transition-all duration-300 ${
      opaque ? 'py-3 bg-[var(--emerald-deep)]/90 backdrop-blur-lg border-b border-white/10' : 'py-5'
    }`}>
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white">
          {settings.company_logo_url
            ? <img src={settings.company_logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-1" />
            : <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--gold)] to-[var(--gold-soft)] flex items-center justify-center text-[var(--emerald-deep)] font-display text-lg">
                {(brandName || 'G')[0]}
              </div>}
          <span className="font-display text-xl tracking-tight">{brandName}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-white/80">
          <a href="/#how" className="hover:text-white">How it works</a>
          <a href="/#fleet" className="hover:text-white">Fleet</a>
          <Link to="/contact" className="hover:text-white">Contact</Link>
        </nav>
        <a href={bookUrl} className="bg-white text-[var(--emerald)] font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-[var(--gold)] hover:text-white shadow-lg transition-colors">
          Book a Ride →
        </a>
      </div>
    </header>
  )
}

export function SiteFooter({ settings, bookUrl, brandName }) {
  return (
    <footer className="bg-[var(--emerald-deep)] text-white/70 px-5 py-10 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[var(--gold)]/5 blur-3xl"></div>
      <div className="relative max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-white mb-2">
              {settings.company_logo_url
                ? <img src={settings.company_logo_url} alt="" className="w-9 h-9 rounded-lg object-contain bg-white/10 p-1" />
                : <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--gold)] to-[var(--gold-soft)] flex items-center justify-center text-[var(--emerald-deep)] font-display text-lg">
                    {(brandName || 'G')[0]}
                  </div>}
              <span className="font-display text-xl">{brandName}</span>
            </div>
            <p className="text-xs text-white/50">Pre-booked private rides, on your schedule.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Company</p>
            <div className="space-y-1.5 text-sm">
              <a href="/#how" className="block hover:text-[var(--gold)] transition-colors">How it works</a>
              <a href="/#fleet" className="block hover:text-[var(--gold)] transition-colors">Our fleet</a>
              <Link to="/contact" className="block hover:text-[var(--gold)] transition-colors">Contact us</Link>
              <a href={bookUrl} className="block hover:text-[var(--gold)] transition-colors">Book a ride</a>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Legal</p>
            <div className="space-y-1.5 text-sm">
              <Link to="/privacy-policy" className="block hover:text-[var(--gold)] transition-colors">Privacy Policy</Link>
              <Link to="/terms-and-conditions" className="block hover:text-[var(--gold)] transition-colors">Terms &amp; Conditions</Link>
              <Link to="/sms-terms" className="block hover:text-[var(--gold)] transition-colors">SMS Terms</Link>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Reach us</p>
            <div className="space-y-1.5 text-sm">
              {settings.company_phone && <a href={`tel:${settings.company_phone}`} className="block hover:text-[var(--gold)]">{settings.company_phone}</a>}
              {settings.company_email && <a href={`mailto:${settings.company_email}`} className="block hover:text-[var(--gold)] break-all">{settings.company_email}</a>}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-5 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} {brandName}. All rights reserved.</span>
          <div className="flex items-center gap-4 text-white/40">
            <Link to="/privacy-policy" className="hover:text-[var(--gold)]">Privacy</Link>
            <Link to="/terms-and-conditions" className="hover:text-[var(--gold)]">Terms</Link>
            <Link to="/sms-terms" className="hover:text-[var(--gold)]">SMS Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* Shared layout for legal/text pages: solid header, prose container, footer. */
export function LegalLayout({ site, title, updated, children }) {
  const { settings, bookUrl, brandName } = site
  return (
    <div className="min-h-screen bg-[var(--cream)] flex flex-col">
      <SiteHeader settings={settings} bookUrl={bookUrl} brandName={brandName} solid />
      <main className="flex-1 pt-28 pb-20 px-5">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display text-4xl lg:text-5xl text-[var(--emerald-deep)]">{title}</h1>
            {updated && <p className="text-sm text-slate-500 mt-2">Last updated: {updated}</p>}
          </div>
          <div className="legal-prose">{children}</div>
        </div>
      </main>
      <SiteFooter settings={settings} bookUrl={bookUrl} brandName={brandName} />
    </div>
  )
}

/* Small prose helpers so every legal page looks consistent. */
export function H2({ children }) {
  return <h2 className="font-display text-2xl text-[var(--emerald-deep)] mt-10 mb-3">{children}</h2>
}
export function P({ children }) {
  return <p className="text-slate-700 leading-relaxed mb-4">{children}</p>
}
export function UL({ children }) {
  return <ul className="list-disc pl-6 space-y-2 text-slate-700 mb-4 marker:text-[var(--gold)]">{children}</ul>
}
