import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Atrium design tokens loaded globally — Metacron + Atrium + previews inherit
// the same :root custom properties. See SPEC: Company Docs/Metacron/SPEC - Metacron Atrium Rebrand.md (Pass 1).
import './atrium/styles/atrium-tokens.css'
// Voice surface styles. Scoped under .atrium-v3 — Voice views wrap their root
// render in <div className="atrium-v3"> to opt into the scope. No leakage into
// other Atrium tabs.
import './atrium/styles/voice-v3.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
