import { describe, expect, it } from 'vitest'
import {
  accessibilityScore,
  cloudScore,
  computeScore,
  durationScore,
  elevationScore,
  horizonClearanceScore,
  normalizeWeights,
} from './scoring'
import { DEFAULT_WEIGHTS } from './types'
import type { HorizonSample } from './types'

describe('elevationScore', () => {
  it('scores neutral (50) with no prominence', () => {
    expect(elevationScore(500, 500)).toBe(50)
  })
  it('rewards a knoll above its surroundings', () => {
    expect(elevationScore(600, 500)).toBeGreaterThan(50)
  })
  it('penalizes a valley floor below its surroundings', () => {
    expect(elevationScore(400, 500)).toBeLessThan(50)
  })
  it('clamps to [0, 100]', () => {
    expect(elevationScore(10000, 0)).toBe(100)
    expect(elevationScore(-10000, 0)).toBe(0)
  })
})

describe('horizonClearanceScore', () => {
  const flatSamples: HorizonSample[] = [
    { bearingDeg: 150, elevationM: 500, clearanceDeg: 0 },
    { bearingDeg: 165, elevationM: 500, clearanceDeg: 0 },
    { bearingDeg: 180, elevationM: 500, clearanceDeg: 0 },
    { bearingDeg: 195, elevationM: 500, clearanceDeg: 0 },
    { bearingDeg: 210, elevationM: 500, clearanceDeg: 0 },
  ]
  it('scores high when the sun is well above a flat horizon toward the sun', () => {
    const score = horizonClearanceScore(flatSamples, 180, 40)
    expect(score).toBe(100)
  })
  it('scores low when a mountain blocks the sun direction', () => {
    const blocked: HorizonSample[] = flatSamples.map((s) =>
      s.bearingDeg === 180 ? { ...s, clearanceDeg: 55 } : s,
    )
    const score = horizonClearanceScore(blocked, 180, 40)
    expect(score).toBeLessThan(60)
  })
  it('ignores obstructions well outside the +/-30deg solar sector', () => {
    const behindObstruction: HorizonSample[] = [
      ...flatSamples,
      { bearingDeg: 0, elevationM: 2000, clearanceDeg: 60 },
    ]
    const score = horizonClearanceScore(behindObstruction, 180, 40)
    expect(score).toBe(100)
  })
})

describe('durationScore', () => {
  it('is 100 at the centerline (local == max duration)', () => {
    expect(durationScore(268, 268)).toBe(100)
  })
  it('is 0 with no local totality', () => {
    expect(durationScore(0, 268)).toBe(0)
  })
  it('scales linearly with the ratio', () => {
    expect(durationScore(134, 268)).toBeCloseTo(50, 5)
  })
})

describe('cloudScore', () => {
  it('inverts historical cloud cover percentage', () => {
    expect(cloudScore(20)).toBe(80)
    expect(cloudScore(100)).toBe(0)
    expect(cloudScore(0)).toBe(100)
  })
})

describe('accessibilityScore', () => {
  it('is 100 right next to a road and falls off with distance', () => {
    expect(accessibilityScore(0)).toBe(100)
    expect(accessibilityScore(5)).toBe(0)
    expect(accessibilityScore(2.5)).toBeCloseTo(50, 5)
  })
})

describe('normalizeWeights', () => {
  it('rescales arbitrary slider values to sum to 1', () => {
    const normalized = normalizeWeights({
      elevation: 2,
      horizon: 2,
      duration: 2,
      cloud: 2,
      accessibility: 2,
    })
    const sum = Object.values(normalized).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
    expect(normalized.elevation).toBeCloseTo(0.2, 10)
  })
})

describe('computeScore', () => {
  it('weights the five sub-scores per the brief default weights (0.20/0.30/0.20/0.20/0.10)', () => {
    const result = computeScore(
      {
        pointElevationM: 500,
        surroundingMeanElevationM: 500,
        horizonSamples: [
          { bearingDeg: 90, elevationM: 500, clearanceDeg: 0 },
        ],
        sunAzimuthDeg: 90,
        sunAltitudeDeg: 40,
        localDurationSeconds: 268,
        maxDurationSeconds: 268,
        historicalCloudCoverPct: 0,
        nearestRoadKm: 0,
      },
      DEFAULT_WEIGHTS,
    )
    // elevation=50, horizon=100, duration=100, cloud=100, accessibility=100
    // total = 50*0.2 + 100*0.3 + 100*0.2 + 100*0.2 + 100*0.1 = 90
    expect(result.total).toBeCloseTo(90, 5)
  })
})
