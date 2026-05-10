import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Atrium design tokens loaded globally — Metacron + Atrium + previews inherit
// the same :root custom properties. See SPEC: Company Docs/Metacron/SPEC - Metacron Atrium Rebrand.md (Pass 1).
import './atrium/styles/atrium-tokens.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
