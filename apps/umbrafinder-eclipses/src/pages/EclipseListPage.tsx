import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock, Ruler } from 'lucide-react'
import { ECLIPSE_CATALOG } from '../domain/eclipseCatalog'
import { useTranslation } from '../i18n'
import type { EclipseRecord } from '../domain/types'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function EclipseCard({ eclipse }: { eclipse: EclipseRecord }) {
  const navigate = useNavigate()
  const t = useTranslation()
  const date = new Date(`${eclipse.date}T00:00:00Z`)

  return (
    <button
      type="button"
      onClick={() => navigate(`/eclipse/${eclipse.id}`)}
      className="w-full text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex flex-col gap-3 hover:border-[var(--color-primary)] transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-fg-muted)] font-mono">
            {eclipse.type === 'hybrid' ? 'Hybrid' : 'Total'}
          </div>
          <div className="text-lg font-semibold">
            {date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </div>
        </div>
        <ArrowRight
          className="text-[var(--color-fg-muted)] mt-1 shrink-0"
          size={20}
          aria-hidden
        />
      </div>

      <p className="text-sm text-[var(--color-fg-muted)]">
        {eclipse.regionDescription}
      </p>

      <div className="flex flex-wrap gap-4 text-sm font-mono">
        <span className="flex items-center gap-1.5">
          <Clock size={14} className="text-[var(--color-accent)]" aria-hidden />
          {t.eclipseList.duration}: {formatDuration(eclipse.centralDurationSeconds)}
        </span>
        <span className="flex items-center gap-1.5">
          <Ruler size={14} className="text-[var(--color-accent)]" aria-hidden />
          {t.eclipseList.pathWidth}: {eclipse.pathWidthKm} km
        </span>
      </div>
    </button>
  )
}

export function EclipseListPage() {
  const t = useTranslation()
  const now = useMemo(() => new Date(), [])

  const upcoming = ECLIPSE_CATALOG.filter(
    (e) => new Date(`${e.date}T00:00:00Z`) >= now,
  )
  const past = ECLIPSE_CATALOG.filter(
    (e) => new Date(`${e.date}T00:00:00Z`) < now,
  ).reverse()

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">{t.eclipseList.title}</h1>
        <p className="text-[var(--color-fg-muted)]">{t.tagline}</p>
      </div>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <h2
          id="upcoming-heading"
          className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]"
        >
          {t.eclipseList.upcoming}
        </h2>
        <div className="flex flex-col gap-3">
          {upcoming.map((e) => (
            <EclipseCard key={e.id} eclipse={e} />
          ))}
        </div>
      </section>

      <section aria-labelledby="past-heading" className="flex flex-col gap-3">
        <h2
          id="past-heading"
          className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]"
        >
          {t.eclipseList.past}
        </h2>
        <div className="flex flex-col gap-3">
          {past.map((e) => (
            <EclipseCard key={e.id} eclipse={e} />
          ))}
        </div>
      </section>

      <p className="text-xs text-[var(--color-fg-muted)] font-mono">
        {t.eclipseList.source}: NASA/GSFC Five Millennium Catalog of Solar
        Eclipses (eclipse.gsfc.nasa.gov)
      </p>
    </div>
  )
}
