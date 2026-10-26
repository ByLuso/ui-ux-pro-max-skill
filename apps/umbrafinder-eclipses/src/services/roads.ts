import { haversineKm } from '../domain/geo'
import type { LatLon } from '../domain/types'

/**
 * Overpass API (OpenStreetMap) — free, no API key.
 * Docs: https://wiki.openstreetmap.org/wiki/Overpass_API
 *
 * One query fetches every driveable road's geometry inside the search
 * radius; nearest-road distance for each candidate point is then computed
 * locally against that geometry (avoids one Overpass call per point).
 *
 * Self-hosting note: if the public overpass-api.de instance rate-limits
 * you, point VITE_OVERPASS_API_URL at another public mirror (e.g.
 * https://overpass.kumi.systems/api/interpreter) or your own instance.
 */
const OVERPASS_ENDPOINT =
  import.meta.env?.VITE_OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter'

const ROAD_FILTER =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|track|service|living_street'

interface OverpassWay {
  type: 'way'
  geometry?: { lat: number; lon: number }[]
}

export interface RoadNetwork {
  vertices: LatLon[]
}

export async function fetchRoadNetwork(
  center: LatLon,
  radiusKm: number,
): Promise<RoadNetwork> {
  const radiusM = Math.round(radiusKm * 1000)
  const query = `[out:json][timeout:25];way["highway"~"^(${ROAD_FILTER})$"](around:${radiusM},${center.lat},${center.lon});out geom;`

  const res = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) {
    throw new Error(`Overpass request failed: ${res.status}`)
  }
  const data = (await res.json()) as { elements: OverpassWay[] }

  const vertices: LatLon[] = []
  for (const el of data.elements) {
    if (el.type === 'way' && el.geometry) {
      for (const g of el.geometry) vertices.push({ lat: g.lat, lon: g.lon })
    }
  }
  return { vertices }
}

/** Nearest-vertex distance approximation (OSM way vertices are dense
 * enough on real road geometry for this app's ~40-50km search scale). */
export function nearestRoadDistanceKm(
  point: LatLon,
  network: RoadNetwork,
): number | null {
  if (network.vertices.length === 0) return null
  let min = Infinity
  for (const v of network.vertices) {
    const d = haversineKm(point, v)
    if (d < min) min = d
  }
  return min
}
