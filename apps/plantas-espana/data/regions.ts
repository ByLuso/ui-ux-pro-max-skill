export type Region = {
  id: string;
  name: string;
  /** Matches the `region` field returned by expo-location reverse geocoding for Spain. */
  geoNames: string[];
  emoji: string;
};

export const REGIONS: Region[] = [
  { id: "andalucia", name: "Andalucía", geoNames: ["Andalucía", "Andalusia", "Andalucia"], emoji: "🫒" },
  { id: "aragon", name: "Aragón", geoNames: ["Aragón", "Aragon"], emoji: "🏔️" },
  { id: "asturias", name: "Asturias", geoNames: ["Asturias", "Principado de Asturias"], emoji: "🌲" },
  { id: "baleares", name: "Islas Baleares", geoNames: ["Illes Balears", "Islas Baleares", "Balearic Islands"], emoji: "🏝️" },
  { id: "canarias", name: "Canarias", geoNames: ["Canarias", "Canary Islands", "Islas Canarias"], emoji: "🌋" },
  { id: "cantabria", name: "Cantabria", geoNames: ["Cantabria"], emoji: "⛰️" },
  { id: "castilla-la-mancha", name: "Castilla-La Mancha", geoNames: ["Castilla-La Mancha", "Castilla La Mancha"], emoji: "🌾" },
  { id: "castilla-y-leon", name: "Castilla y León", geoNames: ["Castilla y León", "Castille and León", "Castilla y Leon"], emoji: "🏰" },
  { id: "cataluna", name: "Cataluña", geoNames: ["Cataluña", "Catalunya", "Catalonia"], emoji: "⛵" },
  { id: "extremadura", name: "Extremadura", geoNames: ["Extremadura"], emoji: "🐷" },
  { id: "galicia", name: "Galicia", geoNames: ["Galicia"], emoji: "🌧️" },
  { id: "la-rioja", name: "La Rioja", geoNames: ["La Rioja"], emoji: "🍇" },
  { id: "madrid", name: "Comunidad de Madrid", geoNames: ["Madrid", "Comunidad de Madrid"], emoji: "🏙️" },
  { id: "murcia", name: "Región de Murcia", geoNames: ["Murcia", "Región de Murcia"], emoji: "🍑" },
  { id: "navarra", name: "Navarra", geoNames: ["Navarra", "Nafarroa", "Comunidad Foral de Navarra"], emoji: "🦌" },
  { id: "pais-vasco", name: "País Vasco", geoNames: ["País Vasco", "Euskadi", "Basque Country"], emoji: "🐑" },
  { id: "comunidad-valenciana", name: "Comunidad Valenciana", geoNames: ["Comunidad Valenciana", "Comunitat Valenciana", "Valencian Community"], emoji: "🍊" },
  { id: "ceuta", name: "Ceuta", geoNames: ["Ceuta"], emoji: "🌊" },
  { id: "melilla", name: "Melilla", geoNames: ["Melilla"], emoji: "🌅" },
];

export function findRegionByGeoName(geoName: string | null | undefined): Region | null {
  if (!geoName) return null;
  const normalized = geoName.trim().toLowerCase();
  return (
    REGIONS.find((region) => region.geoNames.some((name) => name.toLowerCase() === normalized)) ??
    null
  );
}
