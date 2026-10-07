// Runtime branding — recolours the app from admin settings, per instance.
//
// The UI is styled with Tailwind's `blue-*` scale (and the website with
// `--emerald` / `--gold` vars). Tailwind v4 utilities read their colours from
// CSS variables, so overriding those variables on <html> rebrands every
// button/link/badge without touching component code.
//
// Settings (from /api/settings/public):
//   brand_primary_color    hex, e.g. #0f766e   — empty = default theme
//   brand_secondary_color  hex                 — website highlight (gold)
//   brand_font             Google Fonts family — empty = Inter
//
// NOTE: identical copy lives in client/, staff/ and website/ src folders.

const CACHE_KEY = 'rf_brand_v1'
const HEX = /^#[0-9a-fA-F]{6}$/

// How far each shade sits from the base colour (treated as the 600 shade).
const LIGHTER = { 50: 7, 100: 14, 200: 26, 300: 42, 400: 66, 500: 85 }
const DARKER = { 700: 82, 800: 66, 900: 52, 950: 36 }

const tint = (c, pct) => `color-mix(in oklab, ${c} ${pct}%, white)`
const shade = (c, pct) => `color-mix(in oklab, ${c} ${pct}%, black)`

function themeVars({ brand_primary_color: p, brand_secondary_color: s }) {
  const vars = {}
  if (HEX.test(p || '')) {
    for (const [k, pct] of Object.entries(LIGHTER)) vars[`--color-blue-${k}`] = tint(p, pct)
    vars['--color-blue-600'] = p
    for (const [k, pct] of Object.entries(DARKER)) vars[`--color-blue-${k}`] = shade(p, pct)
    vars['--color-primary'] = p
    vars['--color-primary-light'] = tint(p, 70)
    vars['--color-primary-dark'] = shade(p, 75)
    // Marketing website palette
    vars['--emerald'] = p
    vars['--emerald-2'] = tint(p, 85)
    vars['--emerald-dark'] = shade(p, 85)
    vars['--emerald-deep'] = shade(p, 45)
  }
  if (HEX.test(s || '')) {
    vars['--gold'] = s
    vars['--gold-soft'] = tint(s, 65)
  }
  return vars
}

let appliedKeys = []

export function applyTheme(settings = {}) {
  const root = document.documentElement
  appliedKeys.forEach(k => root.style.removeProperty(k))
  const vars = themeVars(settings)
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  appliedKeys = Object.keys(vars)

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && vars['--color-blue-600']) meta.content = vars['--color-blue-600']

  const font = (settings.brand_font || '').trim()
  if (font && /^[\w\s-]{2,40}$/.test(font)) {
    const id = 'brand-font'
    let link = document.getElementById(id)
    const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.href !== href) link.href = href
    root.style.setProperty('--brand-font', `'${font}'`)
    document.body && (document.body.style.fontFamily = `'${font}', 'Inter', system-ui, sans-serif`)
  } else if (document.body) {
    document.body.style.fontFamily = ''
  }

  if (settings.company_logo_url) {
    let icon = document.querySelector("link[rel~='icon']")
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.href = settings.company_logo_url
  }
}

function pick(s) {
  return {
    brand_primary_color: s.brand_primary_color || '',
    brand_secondary_color: s.brand_secondary_color || '',
    brand_font: s.brand_font || '',
    company_logo_url: s.company_logo_url || '',
  }
}

// Call once at startup: applies the last-known theme instantly (no flash of
// the default colours), then refreshes it from the server.
export function initBranding() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (cached) applyTheme(cached)
  } catch { /* storage unavailable — fine */ }

  fetch('/api/settings/public')
    .then(r => (r.ok ? r.json() : null))
    .then(s => {
      if (!s) return
      const theme = pick(s)
      applyTheme(theme)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(theme)) } catch { /* ignore */ }
    })
    .catch(() => {})
}
