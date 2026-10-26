import type { HorizonSample, ScoreBreakdown, ScoreWeights } from './types'

const clamp01to100 = (v: number) => Math.min(100, Math.max(0, v))

/** Rescales user-adjusted weight sliders so they always sum to 1. */
export function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const sum =
    weights.elevation +
    weights.horizon +
    weights.duration +
    weights.cloud +
    weights.accessibility
  if (sum <= 0) return weights
  return {
    elevation: weights.elevation / sum,
    horizon: weights.horizon / sum,
    duration: weights.duration / sum,
    cloud: weights.cloud / sum,
    accessibility: weights.accessibility / sum,
  }
}

/**
 * Prominence-based elevation score: how much higher (or lower) the point
 * sits compared to the mean elevation of its ~2km surroundings. A knoll or
 * viewpoint scores higher than a valley floor, per the product brief.
 */
export function elevationScore(
  pointElevationM: number,
  surroundingMeanElevationM: number,
): number {
  const prominence = pointElevationM - surroundingMeanElevationM
  // +/-100m of prominence maps to the full 0-100 range around a neutral 50.
  return clamp01to100(50 + prominence / 2)
}

/**
 * Horizon clearance toward the Sun's position during totality. `samples`
 * should be horizon-ray elevation-angle samples covering the full compass,
 * with denser sampling in the +/-30deg sector around `sunAzimuthDeg` (see
 * grid.ts `buildHorizonSampleBearings`). Positive `clearanceDeg` on a
 * sample means terrain rises above the point at that angle (obstruction).
 */
export function horizonClearanceScore(
  samples: HorizonSample[],
  sunAzimuthDeg: number,
  sunAltitudeDeg: number,
  sectorHalfWidthDeg = 30,
): number {
  const angularDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360
    return d > 180 ? 360 - d : d
  }
  const relevant = samples.filter(
    (s) => angularDiff(s.bearingDeg, sunAzimuthDeg) <= sectorHalfWidthDeg,
  )
  const candidates = relevant.length > 0 ? relevant : samples
  const maxObstructionDeg = candidates.reduce((max, s) => {
    if (s.clearanceDeg === null) return max
    return Math.max(max, s.clearanceDeg)
  }, -90)

  const marginDeg = sunAltitudeDeg - maxObstructionDeg
  // 10 points per degree of clear margin above the horizon, centered at 50.
  return clamp01to100(50 + marginDeg * 10)
}

/** Ratio of local totality duration to the eclipse's maximum (central)
 * duration for that path. */
export function durationScore(
  localDurationSeconds: number,
  maxDurationSeconds: number,
): number {
  if (maxDurationSeconds <= 0) return 0
  return clamp01to100((localDurationSeconds / maxDurationSeconds) * 100)
}

/** Inverse of historical mean cloud cover (%) for the eclipse's calendar
 * date at this location. */
export function cloudScore(historicalCloudCoverPct: number): number {
  return clamp01to100(100 - historicalCloudCoverPct)
}

/** Closer to a public road = more accessible. Falls off linearly over
 * `maxUsefulKm` (default 5km, beyond which accessibility is scored 0). */
export function accessibilityScore(
  nearestRoadKm: number,
  maxUsefulKm = 5,
): number {
  return clamp01to100(100 - (nearestRoadKm / maxUsefulKm) * 100)
}

export interface ScoreInputs {
  pointElevationM: number
  surroundingMeanElevationM: number
  horizonSamples: HorizonSample[]
  sunAzimuthDeg: number
  sunAltitudeDeg: number
  localDurationSeconds: number
  maxDurationSeconds: number
  historicalCloudCoverPct: number
  nearestRoadKm: number
}

export function computeScore(
  inputs: ScoreInputs,
  weights: ScoreWeights,
): ScoreBreakdown {
  const elevation = elevationScore(
    inputs.pointElevationM,
    inputs.surroundingMeanElevationM,
  )
  const horizon = horizonClearanceScore(
    inputs.horizonSamples,
    inputs.sunAzimuthDeg,
    inputs.sunAltitudeDeg,
  )
  const duration = durationScore(
    inputs.localDurationSeconds,
    inputs.maxDurationSeconds,
  )
  const cloud = cloudScore(inputs.historicalCloudCoverPct)
  const accessibility = accessibilityScore(inputs.nearestRoadKm)

  const total =
    elevation * weights.elevation +
    horizon * weights.horizon +
    duration * weights.duration +
    cloud * weights.cloud +
    accessibility * weights.accessibility

  return { elevation, horizon, duration, cloud, accessibility, total }
}
