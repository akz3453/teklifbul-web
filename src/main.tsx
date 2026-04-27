import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { app } from './lib/firebase.ts'

// eslint-disable-next-line no-console -- bootstrap aşaması, logger henüz yüklenmemis olabilir
console.info("[BOOT] main entry loaded", { appInitialized: Boolean(app) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
