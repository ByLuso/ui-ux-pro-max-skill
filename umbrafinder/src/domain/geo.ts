import type { LatLon } from './types'

export const EARTH_RADIUS_KM = 6371.0088

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial bearing from a to b, in degrees, 0=N, 90=E. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Destination point given start, bearing (deg) and distance (km). */
export function destinationPoint(
  start: LatLon,
  bearing: number,
  distanceKm: number,
): LatLon {
  const angDist = distanceKm / EARTH_RADIUS_KM
  const brng = toRad(bearing)
  const lat1 = toRad(start.lat)
  const lon1 = toRad(start.lon)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    )

  return { lat: toDeg(lat2), lon: (((toDeg(lon2) + 540) % 360) - 180) }
}

/**
 * Perpendicular distance (km) from a point to the infinite line passing
 * through `linePoint` with heading `lineBearingDeg`. Positive = one side,
 * negative = the other; magnitude is what matters for scoring.
 * Uses a flat-earth approximation valid at the ~50km scale of this app.
 */
export function perpendicularDistanceKm(
  point: LatLon,
  linePoint: LatLon,
  lineBearingDeg: number,
): number {
  const distToPoint = haversineKm(linePoint, point)
  if (distToPoint < 1e-6) return 0
  const bearingToPoint = bearingDeg(linePoint, point)
  const angleDiff = toRad(bearingToPoint - lineBearingDeg)
  return distToPoint * Math.sin(angleDiff)
}

/**
 * Signed progress (km) of a point projected onto the line through
 * `linePoint` with heading `lineBearingDeg`.
 */
export function alongLineDistanceKm(
  point: LatLon,
  linePoint: LatLon,
  lineBearingDeg: number,
): number {
  const distToPoint = haversineKm(linePoint, point)
  if (distToPoint < 1e-6) return 0
  const bearingToPoint = bearingDeg(linePoint, point)
  const angleDiff = toRad(bearingToPoint - lineBearingDeg)
  return distToPoint * Math.cos(angleDiff)
}

/**
 * Generates a roughly-uniform hexagonal-ish grid of candidate points within
 * `radiusKm` of `center`, spaced `spacingKm` apart.
 */
export function generateGrid(
  center: LatLon,
  radiusKm: number,
  spacingKm: number,
): LatLon[] {
  const points: LatLon[] = []
  const latStepDeg = (spacingKm / EARTH_RADIUS_KM) * (180 / Math.PI)
  const rows = Math.ceil(radiusKm / spacingKm)

  for (let row = -rows; row <= rows; row++) {
    const y = row * spacingKm
    const rowOffsetKm = Math.abs(row) % 2 === 1 ? spacingKm / 2 : 0
    const latHere = center.lat + latStepDeg * row
    const lonStepKm =
      spacingKm / (Math.cos(toRad(latHere)) * EARTH_RADIUS_KM * (Math.PI / 180))
    const maxX = Math.sqrt(Math.max(0, radiusKm ** 2 - y ** 2))
    const cols = Math.ceil(maxX / spacingKm)
    for (let col = -cols; col <= cols; col++) {
      const x = col * spacingKm + rowOffsetKm
      const dist = Math.sqrt(x * x + y * y)
      if (dist > radiusKm) continue
      const lat = center.lat + latStepDeg * row
      const lon = center.lon + (x / spacingKm) * lonStepKm
      points.push({ lat, lon })
    }
  }
  return points
}

/**
 * Greedy clustering by proximity so top results aren't 10 near-identical
 * points. Keeps the best-scoring representative per cluster.
 */
export function clusterByProximity<T extends LatLon>(
  items: T[],
  getScore: (item: T) => number,
  clusterRadiusKm: number,
): T[] {
  const sorted = [...items].sort((a, b) => getScore(b) - getScore(a))
  const clusters: T[] = []
  for (const item of sorted) {
    const tooClose = clusters.some(
      (c) => haversineKm(c, item) < clusterRadiusKm,
    )
    if (!tooClose) clusters.push(item)
  }
  return clusters
}
