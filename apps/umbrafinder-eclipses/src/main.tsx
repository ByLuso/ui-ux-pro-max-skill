import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'

// HashRouter (not BrowserRouter) so deep links and page refreshes work on
// static hosts with no server-side rewrite rules, like GitHub Pages.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
