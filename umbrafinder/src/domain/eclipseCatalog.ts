import type { EclipseRecord } from './types'

/**
 * Approximate offset between Terrestrial Dynamical Time (TD, as published
 * by NASA/GSFC) and UTC for the 2017-2035 range covered by this catalog.
 * NASA's Five Millennium Catalog gives TD; real ΔT (TT-UT1) drifts slowly
 * (roughly 69-73s across this window per IERS/Espenak predictions). A
 * single representative constant is within ~1 arcminute of solar position
 * for this app's purposes (horizon-clearance scoring works in degrees).
 * Replace with per-year ΔT from https://eclipse.gsfc.nasa.gov/SEhelp/deltat.html
 * if second-level timing precision is ever required.
 */
export const TD_MINUS_UTC_SECONDS = 69

export function tdToUtcDate(isoDate: string, td: string): Date {
  const [h, m, s] = td.split(':').map(Number)
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCHours(h, m, s, 0)
  d.setUTCSeconds(d.getUTCSeconds() - TD_MINUS_UTC_SECONDS)
  return d
}

function hmsToSeconds(hms: string): number {
  const [m, s] = hms.replace('m', ':').replace('s', '').split(':').map(Number)
  return m * 60 + s
}

/**
 * Source: NASA/GSFC Fred Espenak "Five Millennium Catalog of Solar
 * Eclipses: 2001 to 2100" — https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html
 * Fields greatestEclipseTD / greatestEclipsePoint / sunAltitudeAtGreatest /
 * pathWidthKm / centralDurationSeconds are transcribed directly from that
 * catalog. `regionDescription` is general public-knowledge context for the
 * UI only and is not used by the scoring engine.
 */
export const ECLIPSE_CATALOG: EclipseRecord[] = [
  {
    id: '2017-08-21',
    type: 'total',
    date: '2017-08-21',
    greatestEclipseTD: '18:26:40',
    greatestEclipsePoint: { lat: 37, lon: -88 },
    sunAltitudeAtGreatest: 64,
    pathWidthKm: 115,
    centralDurationSeconds: hmsToSeconds('2m40s'),
    regionDescription: 'United States — Oregon to South Carolina ("Great American Eclipse")',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2017 Aug 21',
  },
  {
    id: '2019-07-02',
    type: 'total',
    date: '2019-07-02',
    greatestEclipseTD: '19:24:07',
    greatestEclipsePoint: { lat: -17, lon: -109 },
    sunAltitudeAtGreatest: 50,
    pathWidthKm: 201,
    centralDurationSeconds: hmsToSeconds('4m33s'),
    regionDescription: 'South Pacific, landfall in Chile and Argentina',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2019 Jul 02',
  },
  {
    id: '2020-12-14',
    type: 'total',
    date: '2020-12-14',
    greatestEclipseTD: '16:14:39',
    greatestEclipsePoint: { lat: -40, lon: -68 },
    sunAltitudeAtGreatest: 73,
    pathWidthKm: 90,
    centralDurationSeconds: hmsToSeconds('2m10s'),
    regionDescription: 'Chile and Argentina (Patagonia)',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2020 Dec 14',
  },
  {
    id: '2021-12-04',
    type: 'total',
    date: '2021-12-04',
    greatestEclipseTD: '07:34:38',
    greatestEclipsePoint: { lat: -77, lon: -46 },
    sunAltitudeAtGreatest: 17,
    pathWidthKm: 419,
    centralDurationSeconds: hmsToSeconds('1m54s'),
    regionDescription: 'Antarctica',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2021 Dec 04',
  },
  {
    id: '2023-04-20',
    type: 'hybrid',
    date: '2023-04-20',
    greatestEclipseTD: '04:17:56',
    greatestEclipsePoint: { lat: -10, lon: 126 },
    sunAltitudeAtGreatest: 67,
    pathWidthKm: 49,
    centralDurationSeconds: hmsToSeconds('1m16s'),
    regionDescription: 'Indian Ocean, Western Australia (Exmouth), Timor-Leste, West Papua',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2023 Apr 20 (Hybrid)',
  },
  {
    id: '2024-04-08',
    type: 'total',
    date: '2024-04-08',
    greatestEclipseTD: '18:18:29',
    greatestEclipsePoint: { lat: 25, lon: -104 },
    sunAltitudeAtGreatest: 70,
    pathWidthKm: 198,
    centralDurationSeconds: hmsToSeconds('4m28s'),
    regionDescription: 'Mexico, United States, and Canada',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2024 Apr 08',
  },
  {
    id: '2026-08-12',
    type: 'total',
    date: '2026-08-12',
    greatestEclipseTD: '17:47:06',
    greatestEclipsePoint: { lat: 65, lon: -25 },
    sunAltitudeAtGreatest: 26,
    pathWidthKm: 294,
    centralDurationSeconds: hmsToSeconds('2m18s'),
    regionDescription: 'Arctic, Greenland, Iceland, and Spain',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2026 Aug 12',
  },
  {
    id: '2027-08-02',
    type: 'total',
    date: '2027-08-02',
    greatestEclipseTD: '10:07:50',
    greatestEclipsePoint: { lat: 26, lon: 33 },
    sunAltitudeAtGreatest: 82,
    pathWidthKm: 258,
    centralDurationSeconds: hmsToSeconds('6m23s'),
    regionDescription: 'Spain, Morocco, Algeria, Libya, Egypt, Saudi Arabia, Yemen',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2027 Aug 02',
  },
  {
    id: '2028-07-22',
    type: 'total',
    date: '2028-07-22',
    greatestEclipseTD: '02:56:40',
    greatestEclipsePoint: { lat: -16, lon: 127 },
    sunAltitudeAtGreatest: 53,
    pathWidthKm: 230,
    centralDurationSeconds: hmsToSeconds('5m10s'),
    regionDescription: 'Australia and New Zealand',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2028 Jul 22',
  },
  {
    id: '2030-11-25',
    type: 'total',
    date: '2030-11-25',
    greatestEclipseTD: '06:51:37',
    greatestEclipsePoint: { lat: -44, lon: 71 },
    sunAltitudeAtGreatest: 67,
    pathWidthKm: 169,
    centralDurationSeconds: hmsToSeconds('3m44s'),
    regionDescription: 'Botswana, South Africa, and Australia',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2030 Nov 25',
  },
  {
    id: '2033-03-30',
    type: 'total',
    date: '2033-03-30',
    greatestEclipseTD: '18:02:36',
    greatestEclipsePoint: { lat: 71, lon: -156 },
    sunAltitudeAtGreatest: 11,
    pathWidthKm: 781,
    centralDurationSeconds: hmsToSeconds('2m37s'),
    regionDescription: 'Alaska and the Arctic',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2033 Mar 30',
  },
  {
    id: '2034-03-20',
    type: 'total',
    date: '2034-03-20',
    greatestEclipseTD: '10:18:45',
    greatestEclipsePoint: { lat: 16, lon: 22 },
    sunAltitudeAtGreatest: 73,
    pathWidthKm: 159,
    centralDurationSeconds: hmsToSeconds('4m09s'),
    regionDescription: 'Central Africa and the Middle East',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2034 Mar 20',
  },
  {
    id: '2035-09-02',
    type: 'total',
    date: '2035-09-02',
    greatestEclipseTD: '01:56:46',
    greatestEclipsePoint: { lat: 29, lon: 158 },
    sunAltitudeAtGreatest: 68,
    pathWidthKm: 116,
    centralDurationSeconds: hmsToSeconds('2m54s'),
    regionDescription: 'China, Korea, and Japan',
    source: 'NASA/GSFC Five Millennium Catalog, entry for 2035 Sep 02',
  },
]

export function getEclipseById(id: string): EclipseRecord | undefined {
  return ECLIPSE_CATALOG.find((e) => e.id === id)
}

export function getUpcomingEclipses(from: Date = new Date()): EclipseRecord[] {
  return ECLIPSE_CATALOG.filter((e) => new Date(`${e.date}T00:00:00Z`) >= from)
}

export function getPastEclipses(from: Date = new Date()): EclipseRecord[] {
  return ECLIPSE_CATALOG.filter((e) => new Date(`${e.date}T00:00:00Z`) < from)
}
