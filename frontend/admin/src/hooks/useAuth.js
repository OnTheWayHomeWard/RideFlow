import { useState, useEffect } from 'react'

export function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'))
  const [name, setName] = useState(localStorage.getItem('admin_name') || '')

  const login = (accessToken, adminName) => {
    localStorage.setItem('admin_token', accessToken)
    localStorage.setItem('admin_name', adminName)
    setToken(accessToken)
    setName(adminName)
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_name')
    setToken(null)
    setName('')
  }

  return { token, name, isLoggedIn: !!token, login, logout }
}
