import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LocateFixed, TriangleAlert } from 'lucide-react'
import { getEclipseById } from '../domain/eclipseCatalog'
import { getLocalCircumstances } from '../domain/eclipseGeometry'
import { normalizeWeights } from '../domain/scoring'
import { computeRecommendations } from '../engine/recommend'
import { fetchEclipsePath } from '../services/eclipsePaths'
import { loadRecommendations, saveRecommendations, isOnline } from '../store/offlineCache'
import { useSettings } from '../store/settings'
import { useTranslation, useUnitFormatter } from '../i18n'
import { EclipseMap } from '../components/MapView/EclipseMap'
import type { CandidatePoint, LatLon } from '../domain/types'

const MIN_RADIUS_KM = 20
const MAX_RADIUS_KM = 60
const DEFAULT_RADIUS_KM = 45

export function MapPage() {
  const { eclipseId } = useParams<{ eclipseId: string }>()
  const navigate = useNavigate()
  const t = useTranslation()
  const fmt = useUnitFormatter()
  const { weights } = useSettings()

  const eclipse = eclipseId ? getEclipseById(eclipseId) : undefined

  const [center, setCenter] = useState<LatLon | null>(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [candidates, setCandidates] = useState<CandidatePoint[]>([])
  const [corridor, setCorridor] = useState<LatLon[]>([])
  const [corridorSource, setCorridorSource] = useState<'radiantdrift' | 'approximate'>('approximate')
  const [status, setStatus] = useState<'idle' | 'locating' | 'loading' | 'ready' | 'error'>('idle')
  const [progress, setProgress] = useState<{ stage: string; fraction: number } | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!eclipse) return
    setCenter(eclipse.greatestEclipsePoint)
    runSearch(eclipse.greatestEclipsePoint)
    // Only re-run when the eclipse itself changes; runSearch is stable
    // enough in practice and re-running on every weight/radius tweak here
    // would fight the explicit "use my location" / slider-release triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eclipse?.id])

  const runSearch = useCallback(
    async (searchCenter: LatLon) => {
      if (!eclipse) return
      const normalizedWeights = normalizeWeights(weights)

      if (!isOnline()) {
        const cached = loadRecommendations(eclipse.id, searchCenter, radiusKm, normalizedWeights)
        if (cached) {
          setCandidates(cached.candidates)
          setFromCache(true)
          setStatus('ready')
          return
        }
      }

      setStatus('loading')
      setFromCache(false)
      try {
        const path = await fetchEclipsePath(eclipse)
        setCorridor(path.corridor)
        setCorridorSource(path.source)

        const result = await computeRecommendations({
          eclipse,
          center: searchCenter,
          radiusKm,
          weights: normalizedWeights,
          onProgress: (stage, fraction) => setProgress({ stage, fraction }),
        })
        setCandidates(result.candidates)
        saveRecommendations(eclipse.id, normalizedWeights, result)
        setStatus('ready')
      } catch {
        const cached = loadRecommendations(eclipse.id, searchCenter, radiusKm, normalizedWeights)
        if (cached) {
          setCandidates(cached.candidates)
          setFromCache(true)
          setStatus('ready')
        } else {
          setStatus('error')
        }
      } finally {
        setProgress(null)
      }
    },
    [eclipse, radiusKm, weights],
  )

  const handleUseMyLocation = () => {
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        setCenter(p)
        runSearch(p)
      },
      () => setStatus('error'),
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const handlePickCenter = (p: LatLon) => {
    setCenter(p)
    runSearch(p)
  }

  if (!eclipse) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-center text-[var(--color-fg-muted)]">
        Eclipse not found.
      </div>
    )
  }

  const localCirc = center ? getLocalCircumstances(eclipse, center) : null

  return (
    <div className="flex flex-col md:flex-row h-[calc(100dvh-57px)] md:h-[calc(100dvh-65px)]">
      <div className="relative h-[45vh] md:h-full md:flex-1 md:order-2">
        {center && (
          <EclipseMap
            center={center}
            corridor={corridor}
            candidates={candidates}
            onPickCenter={handlePickCenter}
            onSelectCandidate={(c) => setSelectedId(c.id)}
            onOpenDetail={(c) =>
              navigate(`/eclipse/${eclipse.id}/location/${encodeURIComponent(c.id)}`, {
                state: { candidate: c },
              })
            }
            selectedId={selectedId}
            scoreLabel={t.map.score}
            detailLabel={t.detail.title}
          />
        )}
      </div>

      <div className="flex flex-col gap-4 p-4 md:w-96 md:order-1 md:h-full md:overflow-y-auto border-r border-[var(--color-border)]">
        <div>
          <h1 className="text-lg font-semibold">
            {new Date(`${eclipse.date}T00:00:00Z`).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">{eclipse.regionDescription}</p>
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-medium py-3 px-4 min-h-[44px] hover:opacity-90 transition-opacity cursor-pointer"
        >
          <LocateFixed size={18} aria-hidden />
          {t.map.useMyLocation}
        </button>
        <p className="text-xs text-[var(--color-fg-muted)] -mt-2">{t.map.pickOnMap}</p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex justify-between font-medium">
            <span>{t.map.radius}</span>
            <span className="font-mono">{fmt.distance(radiusKm)}</span>
          </span>
          <input
            type="range"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            step={5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            onPointerUp={() => center && runSearch(center)}
            className="w-full accent-[var(--color-primary)] min-h-[44px]"
          />
        </label>

        {corridorSource === 'approximate' && (
          <div className="flex gap-2 text-xs text-[var(--color-fg-muted)] bg-[var(--color-surface-2)] rounded-lg p-3">
            <TriangleAlert size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
            <span>{t.map.approxCorridorNotice}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col gap-2 text-sm bg-[var(--color-surface-2)] rounded-lg p-3">
            <span className="flex gap-2 text-[var(--color-fg-muted)]">
              <TriangleAlert size={16} className="shrink-0 text-[var(--color-danger)]" aria-hidden />
              {t.common.error}
            </span>
            <button
              type="button"
              onClick={() => center && runSearch(center)}
              className="self-start rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] text-sm font-medium py-2 px-3 min-h-[44px] cursor-pointer"
            >
              {t.common.retry}
            </button>
          </div>
        )}

        {localCirc && !localCirc.withinModeledCorridor && status === 'ready' && candidates.length === 0 && (
          <div className="flex gap-2 text-sm text-[var(--color-fg-muted)] bg-[var(--color-surface-2)] rounded-lg p-3">
            <TriangleAlert size={16} className="shrink-0 text-[var(--color-danger)]" aria-hidden />
            <span>{t.map.noResults}</span>
          </div>
        )}

        {status === 'loading' && progress && (
          <div className="flex flex-col gap-2">
            <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-primary)] transition-all"
                style={{ width: `${progress.fraction * 100}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-fg-muted)]">
              {t.map.stage[progress.stage as keyof typeof t.map.stage] ?? t.map.searching}
            </p>
          </div>
        )}

        {fromCache && (
          <p className="text-xs text-[var(--color-fg-muted)]">{t.map.offline}</p>
        )}

        {candidates.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
              {t.map.top}
            </h2>
            <ol className="flex flex-col gap-2">
              {candidates.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id)
                      navigate(`/eclipse/${eclipse.id}/location/${encodeURIComponent(c.id)}`, {
                        state: { candidate: c },
                      })
                    }}
                    className={`w-full text-left rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      selectedId === c.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-[var(--color-fg-muted)]">#{i + 1}</span>
                      <span className="font-mono">
                        {c.lat.toFixed(3)}, {c.lon.toFixed(3)}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-[var(--color-accent)]">
                      {Math.round(c.scores?.total ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
