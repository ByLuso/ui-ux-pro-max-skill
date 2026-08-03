import { useEffect } from 'react'
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import type { CandidatePoint, LatLon } from '../../domain/types'

function scoreColor(score: number): string {
  if (score >= 80) return '#f5b942'
  if (score >= 60) return '#2563eb'
  if (score >= 40) return '#94a3b8'
  return '#64748b'
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px rgba(37,99,235,0.4)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function ClickToPick({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng })
    },
  })
  return null
}

function RecenterOnChange({ center }: { center: LatLon }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lon], map.getZoom(), { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon])
  return null
}

export interface EclipseMapProps {
  center: LatLon
  corridor: LatLon[]
  candidates: CandidatePoint[]
  onPickCenter: (p: LatLon) => void
  onSelectCandidate: (c: CandidatePoint) => void
  onOpenDetail?: (c: CandidatePoint) => void
  selectedId?: string | null
  scoreLabel: string
  detailLabel?: string
}

export function EclipseMap({
  center,
  corridor,
  candidates,
  onPickCenter,
  onSelectCandidate,
  onOpenDetail,
  selectedId,
  scoreLabel,
  detailLabel = 'View details',
}: EclipseMapProps) {
  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={9}
      scrollWheelZoom
      className="h-full w-full"
      attributionControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {corridor.length >= 3 && (
        <Polygon
          positions={corridor.map((p) => [p.lat, p.lon])}
          pathOptions={{
            color: '#f5b942',
            weight: 1.5,
            fillColor: '#f5b942',
            fillOpacity: 0.08,
          }}
        />
      )}

      {candidates.map((c) => (
        <CircleMarker
          key={c.id}
          center={[c.lat, c.lon]}
          radius={c.id === selectedId ? 11 : 8}
          pathOptions={{
            color: c.id === selectedId ? '#ffffff' : scoreColor(c.scores?.total ?? 0),
            weight: c.id === selectedId ? 3 : 1.5,
            fillColor: scoreColor(c.scores?.total ?? 0),
            fillOpacity: 0.85,
          }}
          eventHandlers={{ click: () => onSelectCandidate(c) }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {scoreLabel}: {Math.round(c.scores?.total ?? 0)}
          </Tooltip>
          <Popup>
            <div className="flex flex-col gap-1.5">
              <strong>{scoreLabel}: {Math.round(c.scores?.total ?? 0)}</strong>
              {onOpenDetail && (
                <button
                  type="button"
                  onClick={() => onOpenDetail(c)}
                  className="text-sm underline text-[var(--color-primary)] cursor-pointer text-left"
                >
                  {detailLabel}
                </button>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <Marker position={[center.lat, center.lon]} icon={userIcon} />

      <ClickToPick onPick={onPickCenter} />
      <RecenterOnChange center={center} />
    </MapContainer>
  )
}
