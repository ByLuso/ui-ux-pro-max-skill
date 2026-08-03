import type { RecommendResult } from '../engine/recommend'
import type { ScoreWeights } from '../domain/types'

/**
 * Offline mode (brief requirement #7): once a region's recommendations are
 * computed, they're cached in localStorage keyed by eclipse+region+weights
 * so the map and location detail screens keep working without connectivity
 * at the observation site.
 */
const PREFIX = 'umbrafinder.cache.v1.'

function cacheKey(
  eclipseId: string,
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  weights: ScoreWeights,
): string {
  const roundedCenter = `${centerLat.toFixed(2)},${centerLon.toFixed(2)}`
  const w = Object.values(weights).map((v) => v.toFixed(2)).join('-')
  return `${PREFIX}${eclipseId}.${roundedCenter}.${radiusKm}.${w}`
}

export function saveRecommendations(
  eclipseId: string,
  weights: ScoreWeights,
  result: RecommendResult,
): void {
  try {
    const key = cacheKey(
      eclipseId,
      result.center.lat,
      result.center.lon,
      result.radiusKm,
      weights,
    )
    localStorage.setItem(
      key,
      JSON.stringify({ ...result, cachedAt: Date.now() }),
    )
  } catch {
    // Storage full or unavailable (private browsing) — degrade silently,
    // the app still works online.
  }
}

export function loadRecommendations(
  eclipseId: string,
  center: { lat: number; lon: number },
  radiusKm: number,
  weights: ScoreWeights,
): (RecommendResult & { cachedAt: number }) | null {
  try {
    const key = cacheKey(eclipseId, center.lat, center.lon, radiusKm, weights)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function listCachedRegions(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k)
  }
  return keys
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}
