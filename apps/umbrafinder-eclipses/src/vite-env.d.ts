/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RADIANTDRIFT_API_KEY?: string
  readonly VITE_RADIANTDRIFT_API_URL?: string
  readonly VITE_ELEVATION_API_URL?: string
  readonly VITE_ARCHIVE_API_URL?: string
  readonly VITE_OVERPASS_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
