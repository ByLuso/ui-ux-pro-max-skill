import { useSettings } from '../store/settings'
import { translations } from './translations'

export function useTranslation() {
  const { language } = useSettings()
  return translations[language]
}

export function useUnitFormatter() {
  const { units } = useSettings()
  return {
    distance: (km: number): string =>
      units === 'metric'
        ? `${km.toFixed(1)} km`
        : `${(km * 0.621371).toFixed(1)} mi`,
    elevation: (m: number): string =>
      units === 'metric'
        ? `${Math.round(m)} m`
        : `${Math.round(m * 3.28084)} ft`,
  }
}
