import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Compass, Mountain, Navigation, TriangleAlert } from 'lucide-react'
import { getEclipseById } from '../domain/eclipseCatalog'
import { getLocalCircumstances } from '../domain/eclipseGeometry'
import { useTranslation, useUnitFormatter } from '../i18n'
import { HorizonProfileChart } from '../components/MapView/HorizonProfileChart'
import { ScoreBreakdownBars } from '../components/MapView/ScoreBreakdownBars'
import type { CandidatePoint } from '../domain/types'

function formatClockUTC(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC'
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function LocationDetailPage() {
  const { eclipseId } = useParams<{ eclipseId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const t = useTranslation()
  const fmt = useUnitFormatter()

  const eclipse = eclipseId ? getEclipseById(eclipseId) : undefined
  const candidate = (location.state as { candidate?: CandidatePoint } | null)?.candidate

  if (!eclipse || !candidate) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 flex flex-col items-center gap-4 text-center">
        <TriangleAlert size={32} className="text-[var(--color-accent)]" aria-hidden />
        <p className="text-[var(--color-fg-muted)]">
          No location data available — go back to the map and pick a spot again.
        </p>
        <button
          type="button"
          onClick={() => navigate(eclipseId ? `/eclipse/${eclipseId}` : '/')}
          className="rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] px-4 py-2 min-h-[44px] cursor-pointer"
        >
          {t.common.retry}
        </button>
      </div>
    )
  }

  const circ = getLocalCircumstances(eclipse, { lat: candidate.lat, lon: candidate.lon })

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${candidate.lat},${candidate.lon}`
  const geoUri = `geo:${candidate.lat},${candidate.lon}?q=${candidate.lat},${candidate.lon}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] cursor-pointer w-fit"
      >
        <ArrowLeft size={16} aria-hidden />
        {t.map.top}
      </button>

      <div>
        <h1 className="text-xl font-semibold">{t.detail.title}</h1>
        <p className="font-mono text-sm text-[var(--color-fg-muted)]">
          {candidate.lat.toFixed(5)}, {candidate.lon.toFixed(5)}
        </p>
      </div>

      {candidate.scores && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{t.detail.breakdown}</h2>
            <span className="text-2xl font-bold font-mono text-[var(--color-accent)]">
              {Math.round(candidate.scores.total)}
            </span>
          </div>
          <ScoreBreakdownBars scores={candidate.scores} labels={t.scoreLabels} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <InfoTile
          icon={<Mountain size={16} aria-hidden />}
          label={t.detail.altitude}
          value={candidate.elevationM !== null ? fmt.elevation(candidate.elevationM) : '—'}
        />
        <InfoTile
          icon={<Compass size={16} aria-hidden />}
          label={t.detail.sunAzimuth}
          value={
            candidate.sunAzimuthAtTotality !== null
              ? `${Math.round(candidate.sunAzimuthAtTotality)}°`
              : '—'
          }
        />
        <InfoTile
          label={t.detail.sunAltitude}
          value={
            candidate.sunAltitudeAtTotality !== null
              ? `${Math.round(candidate.sunAltitudeAtTotality)}°`
              : '—'
          }
        />
        <InfoTile
          label={t.detail.duration}
          value={
            candidate.localDurationSeconds !== null
              ? formatDuration(candidate.localDurationSeconds)
              : '—'
          }
        />
        <InfoTile
          label={t.detail.cloudHistory}
          value={
            candidate.cloudHistoryPct !== null ? `${Math.round(candidate.cloudHistoryPct)}%` : '—'
          }
        />
        <InfoTile
          label={t.detail.nearestRoad}
          value={candidate.nearestRoadKm !== null ? fmt.distance(candidate.nearestRoadKm) : '—'}
        />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-1.5">
          <Clock size={16} aria-hidden />
          {t.detail.title}
        </h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ContactRow label={t.detail.firstContact} time={circ.firstContactApproxUTC} />
          <ContactRow label={t.detail.secondContact} time={circ.secondContactUTC} />
          <ContactRow label={t.detail.thirdContact} time={circ.thirdContactUTC} />
          <ContactRow label={t.detail.fourthContact} time={circ.fourthContactApproxUTC} />
        </div>
      </div>

      {candidate.horizonProfile && candidate.sunAzimuthAtTotality !== null && candidate.sunAltitudeAtTotality !== null && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="font-semibold mb-2">{t.detail.horizonProfile}</h2>
          <HorizonProfileChart
            samples={candidate.horizonProfile}
            sunAzimuthDeg={candidate.sunAzimuthAtTotality}
            sunAltitudeDeg={candidate.sunAltitudeAtTotality}
          />
        </div>
      )}

      <div className="flex gap-2 text-xs text-[var(--color-fg-muted)] bg-[var(--color-surface-2)] rounded-lg p-3">
        <TriangleAlert size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
        <span>{t.detail.approxContactNotice}</span>
      </div>

      <a
        href={directionsUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
            e.preventDefault()
            window.location.href = geoUri
          }
        }}
        className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-fg)] font-medium py-3 px-4 min-h-[44px] hover:opacity-90 transition-opacity cursor-pointer"
      >
        <Navigation size={18} aria-hidden />
        {t.detail.directions}
      </a>
    </div>
  )
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon?: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
        {icon}
        {label}
      </span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  )
}

function ContactRow({ label, time }: { label: string; time: Date }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-mono">{formatClockUTC(time)}</span>
    </div>
  )
}
