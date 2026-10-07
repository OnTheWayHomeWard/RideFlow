import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initBranding } from './branding'
import App from './App.jsx'

initBranding()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
