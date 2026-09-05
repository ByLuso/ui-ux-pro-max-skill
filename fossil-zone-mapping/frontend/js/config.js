// URL base del backend FastAPI. Ajustar si se sirve en otro host/puerto.
const API_BASE_URL = window.location.origin;

// Servicio WMS del IGME: Mapa Litológico de España a escala 1:1.000.000.
// Cobertura nacional completa (a diferencia del Geológico 1:200.000, que
// tiene huecos de digitalización por hoja). Servicio público, sin API key.
const IGME_WMS_URL =
  "https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_Litologias_1M/MapServer/WMSServer";
const IGME_LITHOLOGY_LAYER = "0";
