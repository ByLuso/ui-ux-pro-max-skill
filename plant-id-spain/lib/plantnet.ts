/**
 * Client for the PlantNet identification API (https://my.plantnet.org/).
 * Get a free personal API key at https://my.plantnet.org/ and set it from the
 * app's Settings screen — see lib/settings.ts.
 */
import { uploadAsync, FileSystemUploadType } from "expo-file-system/legacy";

export type PlantOrgan = "auto" | "leaf" | "flower" | "fruit" | "bark" | "habit" | "other";

export type PlantNetMatch = {
  score: number;
  scientificName: string;
  commonNames: string[];
  family: string | null;
};

export class PlantNetError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "PlantNetError";
  }
}

const PROJECT = "weurope"; // Western Europe flora — best fit for the Iberian Peninsula.

export async function identifyPlant(
  photoUri: string,
  apiKey: string,
  organ: PlantOrgan = "auto"
): Promise<PlantNetMatch[]> {
  if (!apiKey) {
    throw new PlantNetError("Falta la API key de PlantNet. Configúrala en Ajustes.");
  }

  const url = `https://my-api.plantnet.org/v2/identify/${PROJECT}?api-key=${encodeURIComponent(
    apiKey
  )}`;

  // Uses expo-file-system's native multipart upload instead of a hand-built
  // FormData: newer Expo/React Native fetch implementations no longer accept
  // the classic RN-specific `{ uri, name, type }` file descriptor shape,
  // which fails with "Unsupported FormDataPart implementation".
  let result: { status: number; body: string };
  try {
    result = await uploadAsync(url, photoUri, {
      httpMethod: "POST",
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: "images",
      mimeType: "image/jpeg",
      parameters: { organs: organ },
      headers: { Accept: "application/json" },
    });
  } catch (networkError) {
    const detail = networkError instanceof Error ? networkError.message : String(networkError);
    console.log("[PlantNet] network error:", detail);
    throw new PlantNetError(`No se pudo conectar con PlantNet: ${detail}`);
  }

  if (result.status < 200 || result.status >= 300) {
    if (result.status === 401 || result.status === 403) {
      throw new PlantNetError("API key de PlantNet inválida o caducada.", result.status);
    }
    if (result.status === 429) {
      throw new PlantNetError("Límite diario de identificaciones de PlantNet alcanzado.", result.status);
    }
    console.log("[PlantNet] HTTP error:", result.status, result.body);
    throw new PlantNetError(`Error de PlantNet (${result.status}): ${result.body}`, result.status);
  }

  let data: any;
  try {
    data = JSON.parse(result.body);
  } catch (parseError) {
    const detail = parseError instanceof Error ? parseError.message : String(parseError);
    console.log("[PlantNet] response parse error:", detail);
    throw new PlantNetError(`Respuesta inesperada de PlantNet: ${detail}`);
  }
  const results: any[] = data.results ?? [];

  return results.map((r) => ({
    score: r.score ?? 0,
    scientificName: r.species?.scientificNameWithoutAuthor ?? "Desconocida",
    commonNames: r.species?.commonNames ?? [],
    family: r.species?.family?.scientificNameWithoutAuthor ?? null,
  }));
}
