import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client'

const SettingsContext = createContext({ company_name: '', company_phone: '', company_logo_url: '', available_countries: ['US'] })

// Swap favicon + tab title from DB settings
export function applyBranding(settings, pageSuffix = '') {
  const name = settings.company_name || 'RideFlow'
  document.title = pageSuffix ? `${name} — ${pageSuffix}` : name

  if (settings.company_logo_url) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = settings.company_logo_url
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ company_name: '', company_phone: '', company_logo_url: '', available_countries: ['US'] })

  useEffect(() => {
    api.getPublicSettings().then(s => {
      setSettings(s)
      applyBranding(s, 'Book a Ride')
    }).catch(() => {})
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
