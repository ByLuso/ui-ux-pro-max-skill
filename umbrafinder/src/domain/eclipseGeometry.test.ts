import { describe, expect, it } from 'vitest'
import {
  getLocalCircumstances,
  localDurationFromOffset,
} from './eclipseGeometry'
import { getEclipseById } from './eclipseCatalog'

describe('localDurationFromOffset', () => {
  it('equals max duration at the centerline', () => {
    expect(localDurationFromOffset(0, 100, 268)).toBeCloseTo(268, 5)
  })
  it('is ~0 at the path edge', () => {
    expect(localDurationFromOffset(100, 100, 268)).toBeCloseTo(0, 5)
  })
  it('is 0 beyond the path edge', () => {
    expect(localDurationFromOffset(150, 100, 268)).toBe(0)
  })
})

describe('getLocalCircumstances', () => {
  it('gives the full central duration at the exact point of greatest eclipse', () => {
    const eclipse = getEclipseById('2024-04-08')!
    const circ = getLocalCircumstances(eclipse, eclipse.greatestEclipsePoint)
    expect(circ.perpendicularDistanceKm).toBeCloseTo(0, 0)
    expect(circ.localDurationSeconds).toBeCloseTo(
      eclipse.centralDurationSeconds,
      0,
    )
    expect(circ.withinModeledCorridor).toBe(true)
  })

  it('orders contact times sensibly (1st < 2nd < mid < 3rd < 4th)', () => {
    const eclipse = getEclipseById('2026-08-12')!
    const circ = getLocalCircumstances(eclipse, eclipse.greatestEclipsePoint)
    expect(circ.firstContactApproxUTC.getTime()).toBeLessThan(
      circ.secondContactUTC.getTime(),
    )
    expect(circ.secondContactUTC.getTime()).toBeLessThan(
      circ.totalityMidpointUTC.getTime(),
    )
    expect(circ.totalityMidpointUTC.getTime()).toBeLessThan(
      circ.thirdContactUTC.getTime(),
    )
    expect(circ.thirdContactUTC.getTime()).toBeLessThan(
      circ.fourthContactApproxUTC.getTime(),
    )
  })

  it('flags points far outside the path as outside the modeled corridor', () => {
    const eclipse = getEclipseById('2024-04-08')!
    const farAway = { lat: eclipse.greatestEclipsePoint.lat + 20, lon: eclipse.greatestEclipsePoint.lon }
    const circ = getLocalCircumstances(eclipse, farAway)
    expect(circ.withinModeledCorridor).toBe(false)
  })
})
