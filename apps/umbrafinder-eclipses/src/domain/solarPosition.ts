import type { LatLon } from './types'

/**
 * Solar position algorithm (topocentric-ish altitude/azimuth), implemented
 * locally so it runs fully offline with no network dependency, as required
 * by the product brief.
 *
 * This is the standard NOAA Solar Calculator formulation (public domain,
 * https://gml.noaa.gov/grad/solcalc/), itself based on Jean Meeus,
 * "Astronomical Algorithms" (low-precision solar position, ~0.01deg
 * accuracy) — the same class of algorithm used by libraries such as
 * SunCalc. All angles in degrees unless noted; internal trig uses radians.
 */

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI
const norm360 = (deg: number) => ((deg % 360) + 360) % 360

export interface SolarPosition {
  altitudeDeg: number
  azimuthDeg: number
  declinationDeg: number
  equationOfTimeMin: number
}

export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

export function julianCentury(jd: number): number {
  return (jd - 2451545) / 36525
}

function geomMeanLongSun(t: number): number {
  return norm360(280.46646 + t * (36000.76983 + t * 0.0003032))
}

function geomMeanAnomalySun(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t)
}

function eccentricityEarthOrbit(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
}

function sunEqOfCenter(t: number, m: number): number {
  const mRad = toRad(m)
  return (
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289
  )
}

function sunTrueLong(t: number): number {
  return geomMeanLongSun(t) + sunEqOfCenter(t, geomMeanAnomalySun(t))
}

function sunAppLong(t: number): number {
  const o = sunTrueLong(t)
  return o - 0.00569 - 0.00478 * Math.sin(toRad(125.04 - 1934.136 * t))
}

function meanObliquityEcliptic(t: number): number {
  const seconds =
    21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
  return 23 + (26 + seconds / 60) / 60
}

function obliquityCorrection(t: number): number {
  const e0 = meanObliquityEcliptic(t)
  return e0 + 0.00256 * Math.cos(toRad(125.04 - 1934.136 * t))
}

function sunDeclination(t: number): number {
  const e = toRad(obliquityCorrection(t))
  const lambda = toRad(sunAppLong(t))
  return toDeg(Math.asin(Math.sin(e) * Math.sin(lambda)))
}

function equationOfTimeMinutes(t: number): number {
  const epsilon = toRad(obliquityCorrection(t))
  const l0 = toRad(geomMeanLongSun(t))
  const e = eccentricityEarthOrbit(t)
  const m = toRad(geomMeanAnomalySun(t))
  const y = Math.tan(epsilon / 2) ** 2

  const eTime =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m)

  return 4 * toDeg(eTime)
}

/**
 * Computes true solar altitude/azimuth for a location at a given instant
 * (UTC). Azimuth is measured clockwise from true north (0-360).
 */
export function getSolarPosition(date: Date, location: LatLon): SolarPosition {
  const jd = julianDay(date)
  const t = julianCentury(jd)

  const declination = sunDeclination(t)
  const eqOfTime = equationOfTimeMinutes(t)

  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60
  // Standard NOAA formulation: true solar time in minutes-of-day, then
  // converted to a +/-180deg hour angle (4 minutes of time per degree).
  const trueSolarTimeMinutes =
    ((utcMinutes + eqOfTime + 4 * location.lon) % 1440 + 1440) % 1440
  const hourAngle = trueSolarTimeMinutes / 4 - 180

  const latRad = toRad(location.lat)
  const decRad = toRad(declination)
  const haRad = toRad(hourAngle)

  const zenithCos =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad)
  const zenith = Math.acos(Math.min(1, Math.max(-1, zenithCos)))
  const altitude = 90 - toDeg(zenith)

  let azimuthCos =
    (Math.sin(latRad) * Math.cos(zenith) - Math.sin(decRad)) /
    (Math.cos(latRad) * Math.sin(zenith))
  azimuthCos = Math.min(1, Math.max(-1, azimuthCos))
  const azimuthBase = toDeg(Math.acos(azimuthCos))
  // NOAA formulation: base angle (0-180) is mirrored differently before vs
  // after solar noon so azimuth increases monotonically 0->360 clockwise.
  const azimuth =
    hourAngle > 0 ? norm360(azimuthBase + 180) : norm360(540 - azimuthBase)

  return {
    altitudeDeg: altitude,
    azimuthDeg: azimuth,
    declinationDeg: declination,
    equationOfTimeMin: eqOfTime,
  }
}
