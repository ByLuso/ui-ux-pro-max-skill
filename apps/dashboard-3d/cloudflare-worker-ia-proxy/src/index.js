/**
 * Proxy mínimo para la API de Anthropic.
 *
 * El dashboard de Taller 3D llama a este Worker en vez de llamar directo a
 * api.anthropic.com, porque desde un navegador normal (fuera de la vista
 * previa de artefactos de Claude) no hay forma de adjuntar la API key sin
 * exponerla en el código cliente. Este Worker guarda la key como secreto de
 * Cloudflare y reenvía la petición tal cual.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY no está configurada en el Worker" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    let cuerpoPeticion;
    try {
      cuerpoPeticion = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: "No se pudo leer el cuerpo de la petición" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    try {
      const respuestaAnthropic = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: cuerpoPeticion,
      });

      const textoRespuesta = await respuestaAnthropic.text();
      return new Response(textoRespuesta, {
        status: respuestaAnthropic.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `Error al contactar la API de Anthropic: ${error.message}` }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  },
};
