import type { HorizonSample } from '../../domain/types'

/**
 * Simple polar "simulated horizon" plot: bearing around the circle, radial
 * distance encodes the blocking angle at that bearing (small radius = flat
 * horizon, large radius = obstruction), with a marker for the Sun's
 * azimuth/altitude at totality.
 */
export function HorizonProfileChart({
  samples,
  sunAzimuthDeg,
  sunAltitudeDeg,
}: {
  samples: HorizonSample[]
  sunAzimuthDeg: number
  sunAltitudeDeg: number
}) {
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - 20

  const angleToXY = (bearingDeg: number, radius: number) => {
    const rad = ((bearingDeg - 90) * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }

  const radiusForClearance = (deg: number | null) => {
    const clamped = Math.max(-10, Math.min(45, deg ?? 0))
    return ((clamped + 10) / 55) * maxR
  }

  const sorted = [...samples].sort((a, b) => a.bearingDeg - b.bearingDeg)
  const points = sorted.map((s) => angleToXY(s.bearingDeg, radiusForClearance(s.clearanceDeg)))
  const pathD =
    points.length > 0
      ? `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`
      : ''

  const sunPos = angleToXY(sunAzimuthDeg, ((45 - sunAltitudeDeg + 10) / 55) * maxR)

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[260px] mx-auto"
      role="img"
      aria-label="Simulated horizon profile with Sun position at totality"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle
          key={f}
          cx={cx}
          cy={cy}
          r={maxR * f}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
      ))}
      {['N', 'E', 'S', 'W'].map((label, i) => {
        const p = angleToXY(i * 90, maxR + 12)
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            fontSize={11}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--color-fg-muted)"
          >
            {label}
          </text>
        )
      })}
      {pathD && (
        <path
          d={pathD}
          fill="rgba(37, 99, 235, 0.18)"
          stroke="#2563eb"
          strokeWidth={1.5}
        />
      )}
      <circle cx={sunPos.x} cy={sunPos.y} r={7} fill="#f5b942" />
      <circle cx={sunPos.x} cy={sunPos.y} r={7} fill="none" stroke="#1a1200" strokeWidth={1} />
    </svg>
  )
}
