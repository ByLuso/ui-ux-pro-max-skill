import { describe, expect, it } from 'vitest'
import { getSolarPosition } from './solarPosition'
import { tdToUtcDate } from './eclipseCatalog'
import { getEclipseById } from './eclipseCatalog'

/**
 * Ground truth: NASA/GSFC Fred Espenak Five Millennium Catalog of Solar
 * Eclipses (https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html),
 * "Sun Altitude" at the published point/instant of greatest eclipse.
 * These two dates are the ones named in the product brief for validation.
 */
describe('getSolarPosition vs NASA/GSFC catalog ground truth', () => {
  it('matches the published Sun altitude for the 2024-04-08 total eclipse', () => {
    const eclipse = getEclipseById('2024-04-08')!
    const t0 = tdToUtcDate(eclipse.date, eclipse.greatestEclipseTD)
    const pos = getSolarPosition(t0, eclipse.greatestEclipsePoint)

    expect(pos.altitudeDeg).toBeGreaterThan(eclipse.sunAltitudeAtGreatest - 2)
    expect(pos.altitudeDeg).toBeLessThan(eclipse.sunAltitudeAtGreatest + 2)
  })

  it('matches the published Sun altitude for the 2026-08-12 total eclipse', () => {
    const eclipse = getEclipseById('2026-08-12')!
    const t0 = tdToUtcDate(eclipse.date, eclipse.greatestEclipseTD)
    const pos = getSolarPosition(t0, eclipse.greatestEclipsePoint)

    expect(pos.altitudeDeg).toBeGreaterThan(eclipse.sunAltitudeAtGreatest - 2)
    expect(pos.altitudeDeg).toBeLessThan(eclipse.sunAltitudeAtGreatest + 2)
  })

  // Astronomically certain sanity checks, independent of any eclipse data.
  it('declination is ~0 at the March/September equinox', () => {
    const springEquinox = new Date('2024-03-20T12:00:00Z')
    const pos = getSolarPosition(springEquinox, { lat: 0, lon: 0 })
    expect(Math.abs(pos.declinationDeg)).toBeLessThan(0.6)
  })

  it('declination is ~+23.44 at the June solstice', () => {
    const juneSolstice = new Date('2024-06-20T20:51:00Z')
    const pos = getSolarPosition(juneSolstice, { lat: 0, lon: 0 })
    expect(pos.declinationDeg).toBeGreaterThan(23.2)
    expect(pos.declinationDeg).toBeLessThan(23.6)
  })

  it('places the Sun near due south (~180deg) at local solar noon in the northern hemisphere summer', () => {
    // Longitude 0, so UTC noon ~= local solar noon (equation of time is a
    // few minutes at most).
    const date = new Date('2024-06-20T12:00:00Z')
    const pos = getSolarPosition(date, { lat: 40, lon: 0 })
    expect(pos.azimuthDeg).toBeGreaterThan(170)
    expect(pos.azimuthDeg).toBeLessThan(190)
    expect(pos.altitudeDeg).toBeGreaterThan(70)
  })
})
