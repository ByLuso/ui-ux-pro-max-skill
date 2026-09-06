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

  const overlays = { "Litología (IGME)": lithologyLayer };
  const legendSections = {
    "Litología (IGME)": {
      visible: true,
      html: `
        <strong>Litología (IGME)</strong>
        <img
          src="${IGME_WMS_URL}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${IGME_LITHOLOGY_LAYER}&format=image/png"
          alt="Leyenda de litología"
        />
      `,
    },
  };

  const slopeMeta = await fetchSlopeMeta();
  if (slopeMeta) {
    const slopeBounds = L.latLngBounds(slopeMeta.bounds[0], slopeMeta.bounds[1]);
    const slopeLayer = L.imageOverlay(`${API_BASE_URL}/terrain/slope.png`, slopeBounds, {
      opacity: 0.85,
      attribution: slopeMeta.source,
    });
    overlays["Pendiente (MDT-IGN)"] = slopeLayer;
    legendSections["Pendiente (MDT-IGN)"] = {
      visible: false,
      html: `<strong>Pendiente (MDT-IGN)</strong>${slopeMeta.legend
        .map(
          (item) => `
            <div class="legend-row">
              <span class="legend-swatch" style="background:${item.color}"></span>
              <span>${item.label}</span>
            </div>`
        )
        .join("")}`,
    };
  }

  L.control.layers({ "Mapa base (OSM)": baseLayer }, overlays).addTo(map);

  addLegendControl(map, legendSections);

  // NDVI, hidrografía y el heatmap de scoring se añadirán en las fases 4-6.
}

async function fetchSlopeMeta() {
  try {
    const response = await fetch(`${API_BASE_URL}/terrain/slope`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("No se pudo cargar la capa de pendiente:", error);
    return null;
  }
}

function addLegendControl(map, sections) {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const container = L.DomUtil.create("div", "legend-control");
    for (const [name, section] of Object.entries(sections)) {
      const sectionEl = L.DomUtil.create("div", "legend-section", container);
      sectionEl.dataset.layerName = name;
      sectionEl.style.display = section.visible ? "block" : "none";
      sectionEl.innerHTML = section.html;
    }
    return container;
  };
  legend.addTo(map);

  const toggleSection = (name, visible) => {
    const sectionEl = legend.getContainer().querySelector(`[data-layer-name="${CSS.escape(name)}"]`);
    if (sectionEl) sectionEl.style.display = visible ? "block" : "none";
  };
  map.on("overlayadd", (e) => toggleSection(e.name, true));
  map.on("overlayremove", (e) => toggleSection(e.name, false));
}

initMap();
