import { RotateCcw } from 'lucide-react'
import { useSettings } from '../store/settings'
import { useTranslation } from '../i18n'
import { listCachedRegions } from '../store/offlineCache'
import type { ScoreWeights } from '../domain/types'

const WEIGHT_KEYS: (keyof ScoreWeights)[] = [
  'elevation',
  'horizon',
  'duration',
  'cloud',
  'accessibility',
]

export function SettingsPage() {
  const { language, setLanguage, units, setUnits, theme, setTheme, weights, setWeights, resetWeights } =
    useSettings()
  const t = useTranslation()
  const cachedCount = listCachedRegions().length

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-8">
      <h1 className="text-xl font-semibold">{t.settings.title}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {t.settings.language}
        </h2>
        <div className="flex gap-2">
          {(['en', 'es'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              className={`px-4 py-2 min-h-[44px] rounded-lg border cursor-pointer font-medium ${
                language === l
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
              }`}
            >
              {l === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {t.settings.units}
        </h2>
        <div className="flex gap-2">
          {(['metric', 'imperial'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnits(u)}
              className={`px-4 py-2 min-h-[44px] rounded-lg border cursor-pointer font-medium ${
                units === u
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
              }`}
            >
              {u === 'metric' ? t.settings.metric : t.settings.imperial}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {t.settings.theme}
        </h2>
        <div className="flex gap-2">
          {(['system', 'dark', 'light'] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setTheme(th)}
              className={`px-4 py-2 min-h-[44px] rounded-lg border cursor-pointer font-medium ${
                theme === th
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)] border-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)]'
              }`}
            >
              {th === 'system' ? t.settings.themeSystem : th === 'dark' ? t.settings.themeDark : t.settings.themeLight}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
            {t.settings.weights}
          </h2>
          <button
            type="button"
            onClick={resetWeights}
            className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] cursor-pointer"
          >
            <RotateCcw size={14} aria-hidden />
            {t.settings.resetWeights}
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {WEIGHT_KEYS.map((key) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm">
              <span className="flex justify-between">
                <span>{t.scoreLabels[key]}</span>
                <span className="font-mono">{weights[key].toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={weights[key]}
                onChange={(e) =>
                  setWeights({ ...weights, [key]: Number(e.target.value) })
                }
                className="w-full accent-[var(--color-primary)] min-h-[44px]"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {t.settings.offlineData}
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {cachedCount} {t.settings.cachedRegions}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          {t.settings.dataSources}
        </h2>
        <ul className="text-sm text-[var(--color-fg-muted)] list-disc list-inside space-y-1">
          <li>NASA/GSFC Five Millennium Catalog of Solar Eclipses</li>
          <li>Radiant Drift Eclipse Paths API (Pro key optional)</li>
          <li>Open-Meteo Elevation API</li>
          <li>Open-Meteo Historical Weather (Archive) API</li>
          <li>OpenStreetMap via Overpass API</li>
        </ul>
      </section>
    </div>
  )
}
