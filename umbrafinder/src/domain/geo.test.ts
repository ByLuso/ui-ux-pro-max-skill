import { describe, expect, it } from 'vitest'
import {
  alongLineDistanceKm,
  bearingDeg,
  clusterByProximity,
  destinationPoint,
  generateGrid,
  haversineKm,
  perpendicularDistanceKm,
} from './geo'

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm({ lat: 40, lon: -3 }, { lat: 40, lon: -3 })).toBeCloseTo(
      0,
      6,
    )
  })
  it('matches a known distance (Madrid-Barcelona ~505km)', () => {
    const madrid = { lat: 40.4168, lon: -3.7038 }
    const barcelona = { lat: 41.3874, lon: 2.1686 }
    const d = haversineKm(madrid, barcelona)
    expect(d).toBeGreaterThan(490)
    expect(d).toBeLessThan(520)
  })
})

describe('destinationPoint + bearingDeg round-trip', () => {
  it('recovers the original bearing after projecting a destination', () => {
    const start = { lat: 40, lon: -3 }
    const dest = destinationPoint(start, 45, 20)
    const recoveredBearing = bearingDeg(start, dest)
    expect(recoveredBearing).toBeCloseTo(45, 0)
    expect(haversineKm(start, dest)).toBeCloseTo(20, 0)
  })
})

describe('perpendicularDistanceKm / alongLineDistanceKm', () => {
  const line = { lat: 40, lon: -3 }
  it('is ~0 for a point directly ahead on the line', () => {
    const ahead = destinationPoint(line, 90, 30)
    expect(Math.abs(perpendicularDistanceKm(ahead, line, 90))).toBeLessThan(
      0.5,
    )
    expect(alongLineDistanceKm(ahead, line, 90)).toBeCloseTo(30, 0)
  })
  it('is nonzero and sensible for a point off to one side', () => {
    const north = destinationPoint(line, 0, 10)
    const perp = perpendicularDistanceKm(north, line, 90)
    expect(Math.abs(Math.abs(perp) - 10)).toBeLessThan(0.5)
  })
})

describe('generateGrid', () => {
  it('only produces points within the requested radius', () => {
    const center = { lat: 40, lon: -3 }
    const grid = generateGrid(center, 40, 10)
    expect(grid.length).toBeGreaterThan(10)
    for (const p of grid) {
      expect(haversineKm(center, p)).toBeLessThanOrEqual(41)
    }
  })
})

describe('clusterByProximity', () => {
  it('keeps only the best-scoring point within each cluster radius', () => {
    const items = [
      { lat: 40, lon: -3, score: 90 },
      { lat: 40.001, lon: -3.001, score: 95 },
      { lat: 41, lon: -3, score: 80 },
    ]
    const clustered = clusterByProximity(items, (i) => i.score, 5)
    expect(clustered).toHaveLength(2)
    expect(clustered[0].score).toBe(95)
  })
})
