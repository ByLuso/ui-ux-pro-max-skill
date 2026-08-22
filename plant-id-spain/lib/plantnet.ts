/**
 * Client for the PlantNet identification API (https://my.plantnet.org/).
 * Get a free personal API key at https://my.plantnet.org/ and set it from the
 * app's Settings screen — see lib/settings.ts.
 */

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

  const form = new FormData();
  form.append("organs", organ);
  // React Native's FormData accepts this file-descriptor shape for local URIs.
  form.append("images", {
    uri: photoUri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  const url = `https://my-api.plantnet.org/v2/identify/${PROJECT}?api-key=${encodeURIComponent(
    apiKey
  )}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body: form,
      headers: { Accept: "application/json" },
    });
  } catch (networkError) {
    const detail = networkError instanceof Error ? networkError.message : String(networkError);
    console.log("[PlantNet] network error:", detail);
    throw new PlantNetError(`No se pudo conectar con PlantNet: ${detail}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PlantNetError("API key de PlantNet inválida o caducada.", response.status);
    }
    if (response.status === 429) {
      throw new PlantNetError("Límite diario de identificaciones de PlantNet alcanzado.", response.status);
    }
    const body = await response.text().catch(() => "");
    console.log("[PlantNet] HTTP error:", response.status, body);
    throw new PlantNetError(`Error de PlantNet (${response.status}): ${body}`, response.status);
  }

  let data: any;
  try {
    data = await response.json();
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
