import type { LatLon } from '../domain/types'

/**
 * Open-Meteo Historical Weather (Archive) API — free, no API key.
 * Docs: https://open-meteo.com/en/docs/historical-weather-api
 *
 * We estimate historical cloudiness for the eclipse's calendar date by
 * averaging `cloudcover_mean` over the same month/day across the last
 * `yearsBack` years, batched per point per year (one HTTP request per
 * year covers every point in the chunk in a single call).
 */
const ARCHIVE_ENDPOINT =
  import.meta.env?.VITE_ARCHIVE_API_URL ??
  'https://archive-api.open-meteo.com/v1/archive'

const BATCH_SIZE = 150
const DEFAULT_YEARS_BACK = 5

interface ArchiveDayResult {
  daily?: { cloudcover_mean?: (number | null)[] }
}

export async function fetchHistoricalCloudCoverPct(
  points: LatLon[],
  eclipseIsoDate: string,
  yearsBack = DEFAULT_YEARS_BACK,
): Promise<number[]> {
  if (points.length === 0) return []

  const [y, m, d] = eclipseIsoDate.split('-').map(Number)
  const eclipseYear = y
  const candidateYears: number[] = []
  for (let i = 1; i <= yearsBack; i++) {
    const year = eclipseYear - i
    // Skip Feb 29 on non-leap reference years.
    if (m === 2 && d === 29 && !isLeapYear(year)) continue
    candidateYears.push(year)
  }

  const sums = new Array(points.length).fill(0)
  const counts = new Array(points.length).fill(0)

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const chunk = points.slice(i, i + BATCH_SIZE)
    const lat = chunk.map((p) => p.lat.toFixed(4)).join(',')
    const lon = chunk.map((p) => p.lon.toFixed(4)).join(',')

    for (const year of candidateYears) {
      const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const url = `${ARCHIVE_ENDPOINT}?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=cloudcover_mean&timezone=UTC`

      const res = await fetch(url)
      if (!res.ok) continue

      const raw = await res.json()
      const perLocation: ArchiveDayResult[] = Array.isArray(raw) ? raw : [raw]

      perLocation.forEach((loc, idx) => {
        const val = loc.daily?.cloudcover_mean?.[0]
        if (typeof val === 'number') {
          sums[i + idx] += val
          counts[i + idx] += 1
        }
      })
    }
  }

  return sums.map((sum, idx) => (counts[idx] > 0 ? sum / counts[idx] : 50))
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}
