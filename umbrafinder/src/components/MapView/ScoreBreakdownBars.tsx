import type { ScoreBreakdown } from '../../domain/types'

export function ScoreBreakdownBars({
  scores,
  labels,
}: {
  scores: ScoreBreakdown
  labels: Record<'elevation' | 'horizon' | 'duration' | 'cloud' | 'accessibility', string>
}) {
  const rows: { key: keyof typeof labels; value: number }[] = [
    { key: 'elevation', value: scores.elevation },
    { key: 'horizon', value: scores.horizon },
    { key: 'duration', value: scores.duration },
    { key: 'cloud', value: scores.cloud },
    { key: 'accessibility', value: scores.accessibility },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(({ key, value }) => (
        <div key={key} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{labels[key]}</span>
            <span className="font-mono text-[var(--color-fg-muted)]">{Math.round(value)}</span>
          </div>
          <div
            className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(value)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={labels[key]}
          >
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
