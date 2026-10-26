import { getSolarPosition } from './solarPosition'
import {
  alongLineDistanceKm,
  destinationPoint,
  perpendicularDistanceKm,
} from './geo'
import { tdToUtcDate } from './eclipseCatalog'
import type { EclipseRecord, LatLon } from './types'

/**
 * Everything in this file is a *local approximation* built on top of the
 * real NASA-catalog numbers (point of greatest eclipse, path width, central
 * duration). It fills the gap left by not having the precise per-eclipse
 * GeoJSON path (that requires a paid Radiant Drift Pro API key — see
 * services/eclipsePaths.ts). Values here are clearly surfaced in the UI as
 * approximate/estimated, never presented as official circumstances.
 */

/** Mean angular rate at which the Moon's umbra sweeps across space,
 * relative to the Sun-Earth line (synodic lunar motion projected at the
 * Earth-Moon distance). This is a standard figure used in simplified
 * eclipse-path speed estimates (see e.g. Espenak, "Fifty Year Canon of
 * Solar Eclipses", ground-speed discussion): roughly 3400 km/h at the
 * sub-solar point before subtracting Earth's own rotation. */
const SHADOW_SPACE_SPEED_KMH = 3400
/** Earth's equatorial rotation speed. */
const EARTH_ROTATION_EQUATOR_KMH = 1670
/** Typical interval between 2nd contact and 1st contact (partial eclipse
 * begins) for a total eclipse. Varies per eclipse; this is a commonly
 * cited rule-of-thumb, not this eclipse's specific value. */
const TYPICAL_PARTIAL_PHASE_SECONDS = 75 * 60

export interface LocalCircumstances {
  centerlineBearingDeg: number
  perpendicularDistanceKm: number
  alongTrackKm: number
  withinModeledCorridor: boolean
  localDurationSeconds: number
  groundSpeedKmh: number
  totalityMidpointUTC: Date
  secondContactUTC: Date
  thirdContactUTC: Date
  firstContactApproxUTC: Date
  fourthContactApproxUTC: Date
  sunAzimuthDeg: number
  sunAltitudeDeg: number
}

/** The corridor is only modeled up to this distance from the published
 * point of greatest eclipse (see file-level note above). */
export const MAX_MODELED_ALONG_TRACK_KM = 300

function estimateForwardBearing(azimuthDeg: number): number {
  const perpA = (azimuthDeg + 90 + 360) % 360
  const perpB = (azimuthDeg - 90 + 360) % 360
  // Prefer whichever perpendicular has an eastward component, since the
  // umbra's ground track is predominantly eastward.
  const eastwardness = (b: number) => Math.cos(((b - 90) * Math.PI) / 180)
  return eastwardness(perpA) >= eastwardness(perpB) ? perpA : perpB
}

function estimateGroundSpeedKmh(lat: number, forwardBearingDeg: number): number {
  const rotationComponent =
    EARTH_ROTATION_EQUATOR_KMH *
    Math.cos((lat * Math.PI) / 180) *
    Math.cos((forwardBearingDeg * Math.PI) / 180)
  const speed = SHADOW_SPACE_SPEED_KMH - rotationComponent
  return Math.max(500, speed)
}

/** Elliptical falloff from full duration at the centerline to zero at the
 * path edge — the standard analytic shape used to approximate how
 * totality duration shrinks away from the path's centerline. */
export function localDurationFromOffset(
  perpDistKm: number,
  halfWidthKm: number,
  maxDurationSeconds: number,
): number {
  const ratio = Math.min(1, Math.abs(perpDistKm) / halfWidthKm)
  return maxDurationSeconds * Math.sqrt(Math.max(0, 1 - ratio * ratio))
}

export function getLocalCircumstances(
  eclipse: EclipseRecord,
  point: LatLon,
): LocalCircumstances {
  const t0 = tdToUtcDate(eclipse.date, eclipse.greatestEclipseTD)
  const sunAtGreatest = getSolarPosition(t0, eclipse.greatestEclipsePoint)
  const forwardBearing = estimateForwardBearing(sunAtGreatest.azimuthDeg)

  const perpDist = perpendicularDistanceKm(
    point,
    eclipse.greatestEclipsePoint,
    forwardBearing,
  )
  const alongTrack = alongLineDistanceKm(
    point,
    eclipse.greatestEclipsePoint,
    forwardBearing,
  )

  const groundSpeed = estimateGroundSpeedKmh(
    eclipse.greatestEclipsePoint.lat,
    forwardBearing,
  )
  const travelSeconds = (alongTrack / groundSpeed) * 3600
  const totalityMidpoint = new Date(t0.getTime() + travelSeconds * 1000)

  const halfWidth = eclipse.pathWidthKm / 2
  const localDuration = localDurationFromOffset(
    perpDist,
    halfWidth,
    eclipse.centralDurationSeconds,
  )

  const secondContact = new Date(
    totalityMidpoint.getTime() - (localDuration / 2) * 1000,
  )
  const thirdContact = new Date(
    totalityMidpoint.getTime() + (localDuration / 2) * 1000,
  )
  const firstContact = new Date(
    secondContact.getTime() - TYPICAL_PARTIAL_PHASE_SECONDS * 1000,
  )
  const fourthContact = new Date(
    thirdContact.getTime() + TYPICAL_PARTIAL_PHASE_SECONDS * 1000,
  )

  const sunAtPoint = getSolarPosition(totalityMidpoint, point)

  return {
    centerlineBearingDeg: forwardBearing,
    perpendicularDistanceKm: perpDist,
    alongTrackKm: alongTrack,
    withinModeledCorridor:
      Math.abs(alongTrack) <= MAX_MODELED_ALONG_TRACK_KM &&
      Math.abs(perpDist) <= halfWidth,
    localDurationSeconds: localDuration,
    groundSpeedKmh: groundSpeed,
    totalityMidpointUTC: totalityMidpoint,
    secondContactUTC: secondContact,
    thirdContactUTC: thirdContact,
    firstContactApproxUTC: firstContact,
    fourthContactApproxUTC: fourthContact,
    sunAzimuthDeg: sunAtPoint.azimuthDeg,
    sunAltitudeDeg: sunAtPoint.altitudeDeg,
  }
}

/** Corridor polygon (simple rectangle) around the centerline, for map
 * rendering when no Radiant Drift GeoJSON is available. */
export function buildApproximateCorridor(
  eclipse: EclipseRecord,
  forwardBearingDeg: number,
  lengthKm = MAX_MODELED_ALONG_TRACK_KM,
): LatLon[] {
  const halfWidth = eclipse.pathWidthKm / 2
  const g = eclipse.greatestEclipsePoint
  const back = destinationPoint(g, (forwardBearingDeg + 180) % 360, lengthKm)
  const fwd = destinationPoint(g, forwardBearingDeg, lengthKm)
  const leftBearing = (forwardBearingDeg - 90 + 360) % 360
  const rightBearing = (forwardBearingDeg + 90) % 360

  const corners = [
    destinationPoint(back, leftBearing, halfWidth),
    destinationPoint(fwd, leftBearing, halfWidth),
    destinationPoint(fwd, rightBearing, halfWidth),
    destinationPoint(back, rightBearing, halfWidth),
  ]
  return corners
}
