// URL base del backend FastAPI. Ajustar si se sirve en otro host/puerto.
const API_BASE_URL = window.location.origin;

// Servicio WMS del IGME: Mapa Litológico de España a escala 1:1.000.000.
// Cobertura nacional completa (a diferencia del Geológico 1:200.000, que
// tiene huecos de digitalización por hoja). Servicio público, sin API key.
const IGME_WMS_URL =
  "https://mapas.igme.es/gis/services/Cartografia_Geologica/IGME_Litologias_1M/MapServer/WMSServer";
const IGME_LITHOLOGY_LAYER = "0";

// Servicio WMS INSPIRE del IGN: red hidrográfica (ríos, arroyos), con
// nombres. Servicio público, sin API key.
const IGN_HYDROGRAPHY_WMS_URL = "https://servicios.idee.es/wms-inspire/hidrografia";
const IGN_HYDROGRAPHY_LAYER = "HY.Network";

// Ortofoto PNOA (IGN), cobertura nacional. Servicio público, sin API key.
const IGN_ORTOFOTO_WMS_URL = "https://www.ign.es/wms-inspire/pnoa-ma";
const IGN_ORTOFOTO_LAYER = "OI.OrthoimageCoverage";

// Relieve WMS del IGN (Modelo Digital del Terreno, PNOA-LiDAR), cobertura nacional — capa de
// respaldo fuera de las zonas con relieve LiDAR propio (PMTiles) generadas por ./pipeline/.
// Nota: este servicio pinta el MDT como rampa de color de elevación, no como sombreado gris;
// no encontré un WMS de sombreado/hillshade dedicado del IGN con cobertura nacional accesible
// desde aquí — si conoces uno mejor, es cuestión de cambiar estas dos constantes.
const IGN_RELIEVE_WMS_URL = "https://servicios.idee.es/wms-inspire/mdt";
const IGN_RELIEVE_LAYER = "EL.ElevationGridCoverage";
