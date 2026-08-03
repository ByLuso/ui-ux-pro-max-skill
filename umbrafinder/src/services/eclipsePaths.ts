import { julianDay } from '../domain/solarPosition'
import { tdToUtcDate } from '../domain/eclipseCatalog'
import {
  buildApproximateCorridor,
  getLocalCircumstances,
} from '../domain/eclipseGeometry'
import type { EclipseRecord, LatLon } from '../domain/types'

/**
 * Radiant Drift Eclipse Paths API — real GeoJSON totality-band geometry.
 * https://docs.radiantdrift.com/solar-eclipses/eclipse-paths
 *
 * Endpoint: GET https://api.radiantdrift.com/solar-eclipse/path/{julianDay}?apiKey=...
 * This endpoint is gated behind Radiant Drift's paid "Pro" plan (verified
 * against their docs; there is no free/keyless tier). Supply your own key
 * via VITE_RADIANTDRIFT_API_KEY to enable precise polygons; without one,
 * we fall back to a locally-approximated corridor built from the real
 * NASA/GSFC point-of-greatest-eclipse + path-width figures (see
 * domain/eclipseGeometry.ts) and clearly flag it as approximate in the UI.
 */
const RADIANTDRIFT_API_KEY = import.meta.env?.VITE_RADIANTDRIFT_API_KEY as
  | string
  | undefined
const RADIANTDRIFT_BASE =
  import.meta.env?.VITE_RADIANTDRIFT_API_URL ??
  'https://api.radiantdrift.com/solar-eclipse/path'

export interface EclipsePathResult {
  corridor: LatLon[]
  centerlineBearingDeg: number
  source: 'radiantdrift' | 'approximate'
}

export async function fetchEclipsePath(
  eclipse: EclipseRecord,
): Promise<EclipsePathResult> {
  const t0 = tdToUtcDate(eclipse.date, eclipse.greatestEclipseTD)
  const circ = getLocalCircumstances(eclipse, eclipse.greatestEclipsePoint)

  if (RADIANTDRIFT_API_KEY) {
    try {
      const jd = Math.floor(julianDay(t0))
      const url = `${RADIANTDRIFT_BASE}/${jd}?apiKey=${encodeURIComponent(RADIANTDRIFT_API_KEY)}&paths=c,tn,ts&minAlt=0`
      const res = await fetch(url)
      if (res.ok) {
        const geojson = (await res.json()) as GeoJSON.FeatureCollection
        const corridor = geojsonToCorridorPolygon(geojson)
        if (corridor.length >= 3) {
          return {
            corridor,
            centerlineBearingDeg: circ.centerlineBearingDeg,
            source: 'radiantdrift',
          }
        }
      }
    } catch {
      // fall through to local approximation
    }
  }

  return {
    corridor: buildApproximateCorridor(eclipse, circ.centerlineBearingDeg),
    centerlineBearingDeg: circ.centerlineBearingDeg,
    source: 'approximate',
  }
}

function geojsonToCorridorPolygon(
  geojson: GeoJSON.FeatureCollection,
): LatLon[] {
  const points: LatLon[] = []
  for (const feature of geojson.features ?? []) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === 'LineString') {
      for (const [lon, lat] of geom.coordinates) points.push({ lat, lon })
    } else if (geom.type === 'Polygon') {
      for (const ring of geom.coordinates) {
        for (const [lon, lat] of ring) points.push({ lat, lon })
      }
    }
  }
  return points
}
