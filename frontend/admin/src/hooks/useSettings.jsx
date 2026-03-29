import { createContext, useContext, useState, useEffect } from 'react'

const BASE = '/api'

const SettingsContext = createContext({ company_name: '', company_phone: '', company_logo_url: '' })

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ company_name: '', company_phone: '', company_logo_url: '' })

  useEffect(() => {
    fetch(`${BASE}/settings/public`).then(r => r.json()).then(setSettings).catch(() => {})
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
