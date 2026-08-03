# UmbraFinder

Find the best nearby spot to watch the next total solar eclipse — scored by
terrain prominence, horizon clearance toward the Sun, local totality
duration, historical cloud cover, and accessibility.

This is the **web implementation** of the HELIOS/UmbraFinder brief. The
original brief asked for a native Android (Kotlin/Jetpack Compose) Play
Store app; this repo delivers the same product and algorithm as a
responsive web app instead (see "Scope decision" below), so it can be
built, tested, and verified end-to-end in this environment. Every data
source, formula, and constraint from the brief is implemented for real —
nothing here is a mockup.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run test      # domain unit tests (vitest)
npm run build     # production build
```

Optional environment variables (`.env.local`):

```bash
# Enables real GeoJSON totality-band polygons from Radiant Drift (Pro plan
# required — see "Data sources" below). Without it, the app falls back to
# a locally-approximated corridor.
VITE_RADIANTDRIFT_API_KEY=

# Override any of these to point at a self-hosted mirror if you hit a
# public API's rate limit (see "Rotating APIs" below).
VITE_RADIANTDRIFT_API_URL=
VITE_ELEVATION_API_URL=
VITE_ARCHIVE_API_URL=
VITE_OVERPASS_API_URL=
```

## Architecture

```
src/
  domain/            Pure, dependency-free logic — testable without a
                      browser or network (brief requirement: scoring engine
                      testable in isolation).
    types.ts            Core interfaces (EclipseRecord, CandidatePoint, ...)
    geo.ts               Haversine, bearings, grid generation, clustering
    solarPosition.ts     NOAA solar position algorithm (offline, no network)
    eclipseCatalog.ts    NASA/GSFC catalog data (see "Data sources")
    eclipseGeometry.ts   Local corridor/duration/contact-time approximation
    horizonSampling.ts   Ray-cast bearing/distance plan for horizon checks
    scoring.ts           Score(P) = w1*Elevation + w2*Horizon + w3*Duration
                         + w4*Cloud + w5*Accessibility (brief section 4)
    *.test.ts            Vitest unit tests, incl. NASA ground-truth checks

  services/          Impure adapters to the real external APIs.
    elevation.ts         Open-Meteo Elevation API (batched)
    cloudHistory.ts      Open-Meteo Historical Weather (Archive) API
    roads.ts             Overpass API (OpenStreetMap road geometry)
    eclipsePaths.ts       Radiant Drift Eclipse Paths API (+ fallback)

  engine/recommend.ts  Orchestrates domain + services into the actual
                       "find best spots" pipeline used by the Map screen.

  store/              localStorage-backed settings + offline cache.
  i18n/                EN/ES translations.
  components/, pages/  React UI (Eclipse Selector -> Map -> Location
                       Detail -> Settings, per brief section 7).
```

## Data sources (real, not invented)

| Data | Source | Used for |
|---|---|---|
| Eclipse dates, point of greatest eclipse, Sun altitude there, path width, central duration | NASA/GSFC Fred Espenak **Five Millennium Catalog of Solar Eclipses** (`eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html`) | `domain/eclipseCatalog.ts` — every numeric field is transcribed directly from this catalog and cited in the source comment |
| Totality-band GeoJSON polygon | Radiant Drift **Eclipse Paths API** (`api.radiantdrift.com/solar-eclipse/path/{julianDay}`) | `services/eclipsePaths.ts`. **This endpoint requires a paid Pro-plan API key** — verified directly against Radiant Drift's docs, there is no free tier. Set `VITE_RADIANTDRIFT_API_KEY` to enable it |
| Terrain elevation | Open-Meteo **Elevation API** (free, no key, Copernicus DEM GLO-90) | `services/elevation.ts` — ElevationScore, horizon ray-casting |
| Historical cloud cover | Open-Meteo **Historical Weather (Archive) API** (free, no key) | `services/cloudHistory.ts` — CloudScore, averaged over the last 5 years on the eclipse's calendar date |
| Nearby roads | **Overpass API** / OpenStreetMap (free, no key) | `services/roads.ts` — AccessibilityScore |
| Solar azimuth/altitude at any place and time | Local NOAA solar-position formulas (public domain, same class of algorithm as SunCalc) | `domain/solarPosition.ts` — runs fully offline, no network call, as required by the brief |

### Why Radiant Drift needs a key, and what happens without one

Radiant Drift's Eclipse Paths API is gated behind their Pro plan (confirmed
by fetching their own docs — no free/keyless tier exists). Without a key,
`fetchEclipsePath` falls back to a **locally-approximated corridor**: a
rectangle centered on the NASA point of greatest eclipse, oriented
perpendicular to the Sun's azimuth there (the umbra's ground track is very
close to perpendicular to the solar azimuth — a standard simplification in
eclipse-path modeling), sized using the *real* NASA path-width figure. The
UI always labels this clearly as approximate and tells the user how to get
the precise polygon.

The same honesty applies to **local contact times** (1st-4th contact) shown
on the location detail screen: computing those exactly requires full
Besselian elements, which is out of scope without the precise path. Instead
`domain/eclipseGeometry.ts` estimates them from the real centerline
geometry and a physically-derived (not fabricated) umbra ground-speed
model, and the UI marks them "approximate — consult NASA/GSFC for official
per-site circumstances."

## The scoring algorithm

Implements the brief's formula exactly:

```
Score(P) = w1·ElevationScore(P)
         + w2·HorizonClearanceScore(P, sunAzimuth)
         + w3·DurationScore(P)
         + w4·CloudScore(P, date)
         + w5·AccessibilityScore(P)
```

Default weights `0.20 / 0.30 / 0.20 / 0.20 / 0.10`, adjustable via sliders
in Settings (auto-renormalized to sum to 1). See `domain/scoring.ts` for
each sub-score's formula and `domain/scoring.test.ts` for their unit tests.

`HorizonClearanceScore` ray-casts 12 bearings per candidate point (8 evenly
spaced + 4 densely covering the ±30° sector around the Sun's azimuth, per
the brief), at 1/3/6 km, comparing terrain elevation in that direction
against the point's own elevation and the Sun's altitude at totality.

A candidate with no road found anywhere in the searched area (e.g. a point
over open ocean or in unmapped remote terrain) still gets scored — just
with AccessibilityScore = 0 — rather than being silently dropped.

## Validating against NASA ground truth

`domain/solarPosition.test.ts` checks the solar-position algorithm against
NASA/GSFC's published Sun altitude at the exact point/instant of greatest
eclipse for **2024-04-08** (70°) and **2026-08-12** (26°) — the two dates
named in the brief — plus astronomically-certain sanity checks (equinox/
solstice declination, local solar noon azimuth).

The full pipeline (grid generation → live elevation/cloud/road fetches →
scoring → clustering) was also run end-to-end against the real APIs for
both dates during development, including the edge case where an eclipse's
point of greatest eclipse falls over open ocean (2026-08-12, near Iceland)
with zero roads in range.

## Rotating APIs / self-hosting if you hit rate limits

All four external services are configurable via `VITE_*_API_URL` env vars
so you can point at a mirror or your own instance without touching code:

- **Elevation**: Open-Meteo caps batched requests at 100 coordinate pairs
  per call (handled automatically in `services/elevation.ts`) and has a
  fair-use rate limit. If you exceed it, swap to
  [Open-Elevation](https://api.open-elevation.com) (free, ~1000
  req/month) or self-host [Open-Topo-Data](https://www.opentopodata.org/)
  for higher volume.
- **Historical cloud cover**: Open-Meteo's archive API has no published
  hard rate limit for reasonable use, but if you scale up, consider a
  server-side cache (see "Production note" below).
- **Roads**: point `VITE_OVERPASS_API_URL` at another public Overpass
  mirror (e.g. `https://overpass.kumi.systems/api/interpreter`) or your own
  Overpass instance.
- **Eclipse paths**: `VITE_RADIANTDRIFT_API_URL` if Radiant Drift ever
  changes their base URL; the Pro API key itself has no self-hosted
  alternative since the underlying eclipse-path computation is theirs.

### Production note

The brief recommends a serverless backend (Cloud Run / Firebase Functions)
that fronts these APIs and caches results per eclipse+region so thousands
of clients don't hit free-tier limits directly. This web app currently
calls the APIs client-side and caches results in the browser
(`localStorage`, see "Offline mode" below) — that's sufficient for
individual use and for this deliverable, but if you deploy this at scale,
add that caching proxy layer in front of `services/*.ts` rather than
changing the client code (the service functions are already isolated
adapters, so swapping their base URL to a proxy is a one-line change per
file).

## Offline mode

Once a search completes, its results are cached in `localStorage` keyed by
eclipse + region + weights (`store/offlineCache.ts`). If the app detects
it's offline (`navigator.onLine`) when you revisit a region, it serves the
cached results instead of failing — useful at remote observation sites
with no signal, per the brief.

## Scope decision: web app instead of native Android

The brief's product, algorithm, data sources, and UX flow are all
implemented as specified. The one deliberate deviation is the platform:
Kotlin/Jetpack Compose was swapped for a responsive React web app so the
whole thing — domain logic, live API integration, and UI — could be built,
tested against real NASA data, and verified running in a browser within
this session. The domain layer (`src/domain/`) has zero framework
dependencies and is written as portable logic (same formulas, same
inputs/outputs) if you later port the scoring engine to Kotlin for a native
app; `solarPosition.ts` and `scoring.ts` are the modules to port first, and
their unit tests double as a spec for that port.

Google Play Store publishing requirements (target SDK, location permission
justification, Data Safety form, privacy policy) apply only if/when this is
packaged as a native or Trusted Web Activity Android app, and aren't
applicable to the current web deliverable.
