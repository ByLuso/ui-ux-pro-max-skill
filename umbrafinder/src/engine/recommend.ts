import {
  clusterByProximity,
  destinationPoint,
  generateGrid,
  haversineKm,
} from '../domain/geo'
import { getLocalCircumstances } from '../domain/eclipseGeometry'
import {
  HORIZON_SAMPLE_DISTANCES_KM,
  PROMINENCE_SAMPLE_BEARINGS,
  PROMINENCE_SAMPLE_DISTANCES_KM,
  buildHorizonSampleBearings,
} from '../domain/horizonSampling'
import { computeScore } from '../domain/scoring'
import { fetchElevations } from '../services/elevation'
import { fetchHistoricalCloudCoverPct } from '../services/cloudHistory'
import {
  fetchRoadNetwork,
  nearestRoadDistanceKm,
  type RoadNetwork,
} from '../services/roads'
import type {
  CandidatePoint,
  EclipseRecord,
  HorizonSample,
  LatLon,
  ScoreWeights,
} from '../domain/types'

export interface RecommendOptions {
  eclipse: EclipseRecord
  center: LatLon
  radiusKm: number
  gridSpacingKm?: number
  weights: ScoreWeights
  clusterRadiusKm?: number
  topN?: number
  onProgress?: (stage: string, fraction: number) => void
}

export interface RecommendResult {
  candidates: CandidatePoint[]
  center: LatLon
  radiusKm: number
}

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)

export async function computeRecommendations(
  opts: RecommendOptions,
): Promise<RecommendResult> {
  const {
    eclipse,
    center,
    radiusKm,
    gridSpacingKm = Math.max(2, Math.round(radiusKm / 9)),
    weights,
    clusterRadiusKm = Math.max(3, radiusKm / 8),
    topN = 18,
    onProgress,
  } = opts

  onProgress?.('grid', 0.02)
  const rawGrid = generateGrid(center, radiusKm, gridSpacingKm)

  const withCirc = rawGrid.map((p) => ({
    point: p,
    circ: getLocalCircumstances(eclipse, p),
  }))
  const halfWidth = eclipse.pathWidthKm / 2
  const inBand = withCirc.filter(
    (c) => Math.abs(c.circ.perpendicularDistanceKm) <= halfWidth,
  )
  const candidateBases = inBand.length > 0 ? inBand : withCirc

  onProgress?.('elevation', 0.1)

  // Build one big batched elevation request: point itself + prominence
  // ring + horizon rays (all offsets flattened, indices tracked per point).
  interface OffsetSpec {
    bearing: number
    distanceKm: number
    kind: 'prominence' | 'horizon'
  }
  const bearingsCacheBySunAz = new Map<number, number[]>()
  const offsetsPerPoint: OffsetSpec[][] = candidateBases.map(({ circ }) => {
    const sunAz = Math.round(circ.sunAzimuthDeg)
    let horizonBearings = bearingsCacheBySunAz.get(sunAz)
    if (!horizonBearings) {
      horizonBearings = buildHorizonSampleBearings(circ.sunAzimuthDeg)
      bearingsCacheBySunAz.set(sunAz, horizonBearings)
    }
    const prominence: OffsetSpec[] = PROMINENCE_SAMPLE_BEARINGS.flatMap((b) =>
      PROMINENCE_SAMPLE_DISTANCES_KM.map((d) => ({
        bearing: b,
        distanceKm: d,
        kind: 'prominence' as const,
      })),
    )
    const horizon: OffsetSpec[] = horizonBearings.flatMap((b) =>
      HORIZON_SAMPLE_DISTANCES_KM.map((d) => ({
        bearing: b,
        distanceKm: d,
        kind: 'horizon' as const,
      })),
    )
    return [...prominence, ...horizon]
  })

  const flatPoints: LatLon[] = []
  const flatIndexRanges: { start: number; end: number }[] = []
  candidateBases.forEach(({ point }, i) => {
    flatPoints.push(point) // self, index = start
    const start = flatPoints.length - 1
    for (const off of offsetsPerPoint[i]) {
      flatPoints.push(destinationPoint(point, off.bearing, off.distanceKm))
    }
    flatIndexRanges.push({ start, end: flatPoints.length })
  })

  const elevations = await fetchElevations(flatPoints)

  onProgress?.('cloud', 0.5)
  const cloudCover = await fetchHistoricalCloudCoverPct(
    candidateBases.map((c) => c.point),
    eclipse.date,
  )

  onProgress?.('roads', 0.7)
  let roadNetwork: RoadNetwork = { vertices: [] }
  try {
    roadNetwork = await fetchRoadNetwork(center, radiusKm + 5)
  } catch {
    // Overpass can be flaky/rate-limited; accessibility falls back to null.
  }

  onProgress?.('scoring', 0.85)
  const candidates: CandidatePoint[] = candidateBases.map(({ point, circ }, i) => {
    const range = flatIndexRanges[i]
    const selfElevation = elevations[range.start] ?? null
    const offsets = offsetsPerPoint[i]

    const prominenceElevations: number[] = []
    const horizonSamples: HorizonSample[] = []

    offsets.forEach((off, j) => {
      const elev = elevations[range.start + 1 + j] ?? null
      if (off.kind === 'prominence' && elev !== null) {
        prominenceElevations.push(elev)
      }
      if (off.kind === 'horizon') {
        let clearanceDeg: number | null = null
        if (elev !== null && selfElevation !== null) {
          const riseM = elev - selfElevation
          clearanceDeg =
            Math.atan2(riseM, off.distanceKm * 1000) * (180 / Math.PI)
        }
        horizonSamples.push({
          bearingDeg: off.bearing,
          elevationM: elev,
          clearanceDeg,
        })
      }
    })

    const surroundingMean =
      prominenceElevations.length > 0
        ? prominenceElevations.reduce((a, b) => a + b, 0) /
          prominenceElevations.length
        : (selfElevation ?? 0)

    const nearestRoad = nearestRoadDistanceKm(point, roadNetwork)
    const cloudPct = cloudCover[i] ?? 50

    const scores =
      selfElevation !== null
        ? computeScore(
            {
              pointElevationM: selfElevation,
              surroundingMeanElevationM: surroundingMean,
              horizonSamples,
              sunAzimuthDeg: circ.sunAzimuthDeg,
              sunAltitudeDeg: circ.sunAltitudeDeg,
              localDurationSeconds: circ.localDurationSeconds,
              maxDurationSeconds: eclipse.centralDurationSeconds,
              historicalCloudCoverPct: cloudPct,
              // No road found within the searched area (e.g. open ocean,
              // remote terrain) - score accessibility as 0 rather than
              // dropping the point entirely.
              nearestRoadKm: nearestRoad ?? Number.POSITIVE_INFINITY,
            },
            weights,
          )
        : null

    return {
      id: `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`,
      lat: point.lat,
      lon: point.lon,
      elevationM: selfElevation,
      distanceFromCenterlineKm: circ.perpendicularDistanceKm,
      distanceFromUserKm: haversineKm(center, point),
      localDurationSeconds: circ.localDurationSeconds,
      sunAzimuthAtTotality: circ.sunAzimuthDeg,
      sunAltitudeAtTotality: circ.sunAltitudeDeg,
      cloudHistoryPct: cloudPct,
      nearestRoadKm: nearestRoad,
      horizonProfile: horizonSamples,
      scores,
    }
  })

  onProgress?.('clustering', 0.95)
  const scored = candidates.filter((c) => c.scores !== null)
  const clustered = clusterByProximity(
    scored,
    (c) => c.scores!.total,
    clusterRadiusKm,
  )
  const top = clustered
    .sort((a, b) => b.scores!.total - a.scores!.total)
    .slice(0, topN)
    .filter((c): c is CandidatePoint => isNum(c.scores?.total))

  onProgress?.('done', 1)
  return { candidates: top, center, radiusKm }
}
