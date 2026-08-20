import * as Location from "expo-location";
import { findRegionByGeoName, Region } from "@/data/regions";

export type PlaceInfo = {
  latitude: number;
  longitude: number;
  region: Region | null;
  placeName: string | null;
};

export async function getCurrentPlace(): Promise<PlaceInfo | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;

  let region: Region | null = null;
  let placeName: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    region = findRegionByGeoName(place?.region);
    placeName = [place?.city ?? place?.subregion, place?.region].filter(Boolean).join(", ") || null;
  } catch {
    // Reverse geocoding can fail offline; the sighting is still saved with raw coordinates.
  }

  return { latitude, longitude, region, placeName };
}
