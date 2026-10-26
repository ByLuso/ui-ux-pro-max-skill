import type { LatLon } from '../domain/types'

/**
 * Open-Meteo Elevation API — free, no API key, worldwide coverage
 * (Copernicus DEM GLO-90, ~90m resolution).
 * Docs: https://open-meteo.com/en/docs/elevation-api
 *
 * If you exceed Open-Meteo's fair-use limits, the documented alternatives
 * are Open-Elevation (api.open-elevation.com, ~1000 req/month free) or a
 * self-hosted Open-Topo-Data instance — see README "Rotating APIs".
 */
const ELEVATION_ENDPOINT =
  import.meta.env?.VITE_ELEVATION_API_URL ?? 'https://api.open-meteo.com/v1/elevation'

// Open-Meteo rejects requests with >100 coordinate pairs.
const BATCH_SIZE = 100

export async function fetchElevations(points: LatLon[]): Promise<number[]> {
  if (points.length === 0) return []
  const results: number[] = []

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const chunk = points.slice(i, i + BATCH_SIZE)
    const lat = chunk.map((p) => p.lat.toFixed(5)).join(',')
    const lon = chunk.map((p) => p.lon.toFixed(5)).join(',')
    const url = `${ELEVATION_ENDPOINT}?latitude=${lat}&longitude=${lon}`

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Open-Meteo elevation request failed: ${res.status}`)
    }
    const data = (await res.json()) as { elevation: number[] }
    results.push(...data.elevation)
  }

  return results
}
