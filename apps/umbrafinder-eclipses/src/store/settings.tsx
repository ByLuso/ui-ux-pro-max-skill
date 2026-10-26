import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_WEIGHTS } from '../domain/types'
import type { ScoreWeights } from '../domain/types'

export type Language = 'en' | 'es'
export type UnitSystem = 'metric' | 'imperial'

interface Settings {
  language: Language
  units: UnitSystem
  weights: ScoreWeights
  theme: 'dark' | 'light' | 'system'
}

const STORAGE_KEY = 'umbrafinder.settings.v1'

const DEFAULT_SETTINGS: Settings = {
  language: (navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'),
  units: 'metric',
  weights: DEFAULT_WEIGHTS,
  theme: 'system',
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsContextValue extends Settings {
  setLanguage: (l: Language) => void
  setUnits: (u: UnitSystem) => void
  setWeights: (w: ScoreWeights) => void
  setTheme: (t: Settings['theme']) => void
  resetWeights: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', settings.theme)
    }
  }, [settings.theme])

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      setLanguage: (language) => setSettings((s) => ({ ...s, language })),
      setUnits: (units) => setSettings((s) => ({ ...s, units })),
      setWeights: (weights) => setSettings((s) => ({ ...s, weights })),
      setTheme: (theme) => setSettings((s) => ({ ...s, theme })),
      resetWeights: () =>
        setSettings((s) => ({ ...s, weights: DEFAULT_WEIGHTS })),
    }),
    [settings],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
