export interface LatLon {
  lat: number
  lon: number
}

/**
 * Circumstances of greatest eclipse, sourced verbatim from NASA/GSFC
 * Fred Espenak Five Millennium Catalog of Solar Eclipses
 * (https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html).
 * `greatestEclipseTD` is Terrestrial Dynamical Time as published;
 * see solarPosition.ts `TD_MINUS_UTC_SECONDS` for the UTC conversion used.
 */
export interface EclipseRecord {
  id: string
  type: 'total' | 'hybrid'
  date: string // ISO calendar date, UTC, e.g. "2024-04-08"
  greatestEclipseTD: string // "HH:MM:SS" Terrestrial Dynamical Time
  greatestEclipsePoint: LatLon
  sunAltitudeAtGreatest: number // degrees, NASA catalog value
  pathWidthKm: number // NASA catalog value
  centralDurationSeconds: number // NASA catalog value, at point of greatest eclipse
  regionDescription: string // general public-knowledge path description, UI only
  source: string
}

export interface CandidatePoint extends LatLon {
  id: string
  elevationM: number | null
  distanceFromCenterlineKm: number
  distanceFromUserKm: number
  localDurationSeconds: number | null
  sunAzimuthAtTotality: number | null
  sunAltitudeAtTotality: number | null
  cloudHistoryPct: number | null
  nearestRoadKm: number | null
  horizonProfile: HorizonSample[] | null
  scores: ScoreBreakdown | null
}

export interface HorizonSample {
  bearingDeg: number
  elevationM: number | null
  clearanceDeg: number | null
}

export interface ScoreWeights {
  elevation: number
  horizon: number
  duration: number
  cloud: number
  accessibility: number
}

export interface ScoreBreakdown {
  elevation: number
  horizon: number
  duration: number
  cloud: number
  accessibility: number
  total: number
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  elevation: 0.2,
  horizon: 0.3,
  duration: 0.2,
  cloud: 0.2,
  accessibility: 0.1,
}
