import { Route, Routes } from 'react-router-dom'
import { SettingsProvider } from './store/settings'
import { AppShell } from './components/Layout/AppShell'
import { EclipseListPage } from './pages/EclipseListPage'
import { MapPage } from './pages/MapPage'
import { LocationDetailPage } from './pages/LocationDetailPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  return (
    <SettingsProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<EclipseListPage />} />
          <Route path="/eclipse/:eclipseId" element={<MapPage />} />
          <Route
            path="/eclipse/:eclipseId/location/:pointId"
            element={<LocationDetailPage />}
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </SettingsProvider>
  )
}

export default App
