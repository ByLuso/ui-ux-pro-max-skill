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

  // El control de capas y la leyenda se crean YA, antes de pedir nada al
  // backend: así el mapa es interactivo desde el primer segundo aunque las
  // capas calculadas (pendiente, NDVI, hidrografía, score...) tarden en
  // llegar. Cada una se añade sola en cuanto está lista, en vez de bloquear
  // el resto de la interfaz mientras se calcula.
  const layersControl = L.control
    .layers({ "Mapa base (OSM)": baseLayer }, { "Litología (IGME)": lithologyLayer })
    .addTo(map);

  const legend = createLegendControl(map);
  legend.addSection(
    "Litología (IGME)",
    true,
    `
      <strong>Litología (IGME)</strong>
      <img
        src="${IGME_WMS_URL}?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=${IGME_LITHOLOGY_LAYER}&format=image/png"
        alt="Leyenda de litología"
      />
    `
  );

  const hydrographyLayer = L.tileLayer.wms(IGN_HYDROGRAPHY_WMS_URL, {
    layers: IGN_HYDROGRAPHY_LAYER,
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    attribution: "Hidrografía: IGN (WMS INSPIRE)",
  });
  layersControl.addOverlay(hydrographyLayer, "Ríos y arroyos (IGN)");

  const loading = createLoadingTracker(5);

  addRasterOverlay(map, layersControl, legend, {
    name: "Pendiente (MDT-IGN)",
    metaUrl: `${API_BASE_URL}/terrain/slope`,
    pngUrl: `${API_BASE_URL}/terrain/slope.png`,
  }).finally(loading.done);

  addRasterOverlay(map, layersControl, legend, {
    name: "NDVI (Sentinel-2)",
    metaUrl: `${API_BASE_URL}/vegetation/ndvi`,
    pngUrl: `${API_BASE_URL}/vegetation/ndvi.png`,
  }).finally(loading.done);

  addRasterOverlay(map, layersControl, legend, {
    name: "Distancia a cauces",
    metaUrl: `${API_BASE_URL}/hydrography/distance`,
    pngUrl: `${API_BASE_URL}/hydrography/distance.png`,
  }).finally(loading.done);

  addScoringLayer(map, layersControl, legend)
    .then((weights) => {
      if (weights) addScoringClickHandler(map, () => weights);
    })
    .finally(loading.done);

  addKnownSitesLayer(map, layersControl, legend).finally(loading.done);
}

function createLoadingTracker(totalTasks) {
  let remaining = totalTasks;
  const statusEl = document.getElementById("loading-status");
  const render = () => {
    if (!statusEl) return;
    statusEl.textContent =
      remaining > 0 ? `Calculando capas de análisis… (${remaining} pendientes, puede tardar unos minutos la primera vez)` : "";
  };
  render();
  return {
    done() {
      remaining = Math.max(0, remaining - 1);
      render();
    },
  };
}

async function addKnownSitesLayer(map, layersControl, legend) {
  let geojson;
  try {
    const response = await fetch(`${API_BASE_URL}/known-sites/sites.geojson`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    geojson = await response.json();
  } catch (error) {
    console.error("No se pudo cargar la capa de yacimientos conocidos:", error);
    return;
  }

  const sitesLayer = L.geoJSON(geojson, {
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 6,
        color: "#1f2937",
        weight: 1.5,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }),
    onEachFeature: (feature, layer) => {
      layer.bindPopup(`<strong>${feature.properties.name}</strong><br>Yacimiento catalogado (IELIG)`);
    },
  }).addTo(map);

  layersControl.addOverlay(sitesLayer, "Yacimientos conocidos (IELIG)");
  legend.addSection(
    "Yacimientos conocidos (IELIG)",
    true,
    `
      <strong>Yacimientos conocidos (IELIG)</strong>
      <div class="legend-row">
        <span class="legend-dot"></span>
        <span>Yacimiento paleontológico catalogado</span>
      </div>
    `
  );
}

async function addScoringLayer(map, layersControl, legend) {
  const meta = await fetchLayerMeta(`${API_BASE_URL}/scoring/meta`);
  if (!meta) return null;

  const weights = { ...meta.default_weights };
  const bounds = L.latLngBounds(meta.bounds[0], meta.bounds[1]);
  const buildHeatmapUrl = () => `${API_BASE_URL}/scoring/heatmap.png?${weightsQueryString(weights)}`;

  const heatmapLayer = L.imageOverlay(buildHeatmapUrl(), bounds, {
    opacity: 0.8,
    attribution: "Score combinado (calculado en el backend)",
  }).addTo(map);

  layersControl.addOverlay(heatmapLayer, "Score combinado (heatmap)");
  legend.addSection("Score combinado (heatmap)", true, buildGradientLegendHtml(meta.gradient));

  addWeightsControl(map, weights, () => heatmapLayer.setUrl(buildHeatmapUrl()));

  return weights;
}

function weightsQueryString(weights) {
  return `w_lithology=${weights.lithology}&w_slope=${weights.slope}&w_vegetation=${weights.vegetation}` +
    `&w_water=${weights.water}&w_known_sites=${weights.known_sites}`;
}

function buildGradientLegendHtml(gradientStops) {
  const cssStops = gradientStops.map((stop) => `${stop.color} ${stop.score}%`).join(", ");
  return `
    <strong>Score combinado</strong>
    <div class="gradient-bar" style="background: linear-gradient(to right, ${cssStops})"></div>
    <div class="gradient-labels"><span>0 (bajo)</span><span>100 (alto)</span></div>
  `;
}

function addWeightsControl(map, weights, onChange) {
  const labels = {
    lithology: "Litología",
    slope: "Pendiente",
    vegetation: "Vegetación (NDVI)",
    water: "Cercanía a agua",
    known_sites: "Yacimientos conocidos",
  };

  const control = L.control({ position: "topleft" });
  control.onAdd = function () {
    const container = L.DomUtil.create("div", "weights-control");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    container.innerHTML = "<strong>Pesos del score</strong>";

    let debounceTimer = null;
    for (const [key, label] of Object.entries(labels)) {
      const initialPercent = Math.round(weights[key] * 100);
      const row = L.DomUtil.create("div", "weight-row", container);
      row.innerHTML = `
        <label>${label} <span class="weight-value">${initialPercent}%</span></label>
        <input type="range" min="0" max="100" value="${initialPercent}" />
      `;
      const input = row.querySelector("input");
      const valueLabel = row.querySelector(".weight-value");
      input.addEventListener("input", () => {
        weights[key] = Number(input.value) / 100;
        valueLabel.textContent = `${input.value}%`;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(onChange, 300);
      });
    }

    return container;
  };
  control.addTo(map);
}

function addScoringClickHandler(map, getWeights) {
  const popup = L.popup();
  map.on("click", async (event) => {
    const { lat, lng } = event.latlng;
    popup.setLatLng(event.latlng).setContent("Calculando…").openOn(map);

    const weights = getWeights();
    const url = `${API_BASE_URL}/scoring/breakdown?lat=${lat}&lon=${lng}&${weightsQueryString(weights)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      popup.setContent(buildBreakdownHtml(data));
    } catch (error) {
      popup.setContent("Este punto está fuera de la región analizada.");
    }
  });
}

function buildBreakdownHtml(data) {
  const c = data.components;
  return `
    <div class="breakdown-popup">
      <strong>Score: ${data.score.toFixed(0)} / 100</strong>
      <div class="breakdown-row"><span>Litología</span><span>${c.lithology.score.toFixed(0)}</span></div>
      <div class="breakdown-detail">${c.lithology.description ?? "sin dato en este punto"}</div>
      <div class="breakdown-row"><span>Pendiente</span><span>${c.slope.score.toFixed(0)}</span></div>
      <div class="breakdown-detail">${c.slope.degrees.toFixed(1)}°</div>
      <div class="breakdown-row"><span>Vegetación (NDVI)</span><span>${c.vegetation.score.toFixed(0)}</span></div>
      <div class="breakdown-detail">NDVI ${c.vegetation.ndvi.toFixed(2)}</div>
      <div class="breakdown-row"><span>Cercanía a agua</span><span>${c.water.score.toFixed(0)}</span></div>
      <div class="breakdown-detail">${c.water.distance_m.toFixed(0)} m al cauce más cercano</div>
      <div class="breakdown-row"><span>Yacimientos conocidos</span><span>${c.known_sites.score.toFixed(0)}</span></div>
      <div class="breakdown-detail">
        ${c.known_sites.distance_m.toFixed(0)} m de "${c.known_sites.nearest_name ?? "yacimiento más cercano"}"
      </div>
    </div>
  `;
}

async function fetchLayerMeta(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`No se pudo cargar la capa (${url}):`, error);
    return null;
  }
}

async function addRasterOverlay(map, layersControl, legend, { name, metaUrl, pngUrl }) {
  const meta = await fetchLayerMeta(metaUrl);
  if (!meta) return;

  const bounds = L.latLngBounds(meta.bounds[0], meta.bounds[1]);
  const layer = L.imageOverlay(pngUrl, bounds, {
    opacity: 0.85,
    attribution: meta.source,
  });
  layersControl.addOverlay(layer, name);

  legend.addSection(
    name,
    false,
    `<strong>${name}</strong>${meta.legend
      .map(
        (item) => `
          <div class="legend-row">
            <span class="legend-swatch" style="background:${item.color}"></span>
            <span>${item.label}</span>
          </div>`
      )
      .join("")}`
  );
}

function createLegendControl(map) {
  const legend = L.control({ position: "bottomright" });
  let container;
  legend.onAdd = function () {
    container = L.DomUtil.create("div", "legend-control");
    return container;
  };
  legend.addTo(map);

  const toggleSection = (name, visible) => {
    const sectionEl = container.querySelector(`[data-layer-name="${CSS.escape(name)}"]`);
    if (sectionEl) sectionEl.style.display = visible ? "block" : "none";
  };
  map.on("overlayadd", (e) => toggleSection(e.name, true));
  map.on("overlayremove", (e) => toggleSection(e.name, false));

  return {
    addSection(name, visible, html) {
      const sectionEl = L.DomUtil.create("div", "legend-section", container);
      sectionEl.dataset.layerName = name;
      sectionEl.style.display = visible ? "block" : "none";
      sectionEl.innerHTML = html;
    },
  };
}

initMap();
