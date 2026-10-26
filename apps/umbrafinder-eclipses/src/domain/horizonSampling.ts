/**
 * Builds the set of compass bearings to ray-cast for a horizon profile:
 * 8 evenly-spaced bearings for a full-circle silhouette, plus 4 extra
 * bearings densely covering the +/-30deg sector around the Sun's azimuth
 * during totality — this is the sector that actually matters for
 * HorizonClearanceScore, per the product brief (8-16 rays total,
 * prioritizing +/-30deg around solar azimuth).
 */
export function buildHorizonSampleBearings(sunAzimuthDeg: number): number[] {
  const base = [0, 45, 90, 135, 180, 225, 270, 315]
  const sector = [-30, -15, 15, 30].map(
    (offset) => (((sunAzimuthDeg + offset) % 360) + 360) % 360,
  )
  const all = [...base, ...sector]
  return Array.from(new Set(all.map((b) => Math.round(b * 100) / 100))).sort(
    (a, b) => a - b,
  )
}

/** Sampling distances (km) along each bearing used to estimate the
 * blocking angle of distant terrain. */
export const HORIZON_SAMPLE_DISTANCES_KM = [1, 3, 6]

/** Sampling radius/count used for the 2km-neighborhood prominence check
 * feeding ElevationScore. */
export const PROMINENCE_SAMPLE_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315]
export const PROMINENCE_SAMPLE_DISTANCES_KM = [1, 2]
