import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client'

const SettingsContext = createContext({ company_name: '', company_phone: '', company_logo_url: '' })

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({ company_name: '', company_phone: '', company_logo_url: '' })

  useEffect(() => {
    api.getPublicSettings().then(setSettings).catch(() => {})
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
