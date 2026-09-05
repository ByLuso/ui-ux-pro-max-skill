async function initMap() {
  let regionConfig;
  try {
    const response = await fetch(`${API_BASE_URL}/config`);
    regionConfig = await response.json();
  } catch (error) {
    console.error("No se pudo cargar la configuración de región desde el backend:", error);
    regionConfig = {
      region_name: "La Rioja",
      region_center: [42.28, -2.45],
      region_default_zoom: 9,
      region_bbox: [-3.15, 41.95, -1.7, 42.65],
    };
  }

  document.getElementById("region-label").textContent =
    `Región: ${regionConfig.region_name}`;

  const map = L.map("map").setView(regionConfig.region_center, regionConfig.region_default_zoom);

  const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const [minLon, minLat, maxLon, maxLat] = regionConfig.region_bbox;
  const bounds = L.latLngBounds([minLat, minLon], [maxLat, maxLon]);
  L.rectangle(bounds, {
    color: "#f97316",
    weight: 2,
    fillOpacity: 0.05,
  }).addTo(map);

  const lithologyLayer = L.tileLayer.wms(IGME_WMS_URL, {
    layers: IGME_LITHOLOGY_LAYER,
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    opacity: 0.65,
    attribution: "Litología: IGME (Mapa Litológico 1:1.000.000)",
  }).addTo(map);

  L.control
    .layers({ "Mapa base (OSM)": baseLayer }, { "Litología (IGME)": lithologyLayer })
    .addTo(map);

  addLithologyLegend(map);

  // El cálculo de pendiente, NDVI, hidrografía y el heatmap de scoring se
  // añadirán en las fases 3-6.
}

function addLithologyLegend(map) {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const container = L.DomUtil.create("div", "legend-control");
    container.innerHTML = `
      <strong>Litología (IGME)</strong>
      <img
        src="${IGME_WMS_URL}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${IGME_LITHOLOGY_LAYER}&format=image/png"
        alt="Leyenda de litología"
      />
    `;
    return container;
  };

  legend.addTo(map);
}

initMap();
