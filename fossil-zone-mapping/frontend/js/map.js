let activeMap = null;
let currentGeneration = 0;

async function bootstrap() {
  let regions;
  try {
    const response = await fetch(`${API_BASE_URL}/regions`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    regions = (await response.json()).regions;
  } catch (error) {
    console.error("No se pudieron cargar las regiones disponibles:", error);
    regions = [{ slug: "la-rioja", name: "La Rioja" }];
  }

  const select = document.getElementById("region-select");
  select.innerHTML = regions.map((r) => `<option value="${r.slug}">${r.name}</option>`).join("");
  select.addEventListener("change", () => initMap(select.value));

  initMap(select.value || regions[0].slug);
}

async function initMap(regionSlug) {
  // Al cambiar de región mientras la anterior aún tenía capas cargándose en
  // segundo plano, esas peticiones pendientes no deben tocar los controles
  // del mapa nuevo (ni del viejo, ya eliminado). Cada tanda de carga lleva
  // su número de generación y se descarta si ya no es la vigente.
  const generation = ++currentGeneration;

  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }

  let regionConfig;
  try {
    const response = await fetch(`${API_BASE_URL}/config?region=${regionSlug}`);
    regionConfig = await response.json();
  } catch (error) {
    console.error("No se pudo cargar la configuración de región desde el backend:", error);
    regionConfig = {
      region_name: regionSlug,
      region_center: [42.28, -2.45],
      region_default_zoom: 9,
      region_bbox: [-3.15, 41.95, -1.7, 42.65],
    };
  }

  document.getElementById("region-label").textContent =
    `Región: ${regionConfig.region_name}`;

  const map = L.map("map").setView(regionConfig.region_center, regionConfig.region_default_zoom);
  activeMap = map;

  // Tres capas base mutuamente excluyentes (Leaflet las agrupa como radio buttons en el
  // selector): OSM para orientarse, ortofoto PNOA para ver el terreno real, y el relieve
  // nacional del IGN como referencia de MDT en cualquier punto de España — a diferencia de la
  // capa LIDAR propia (más abajo), que solo existe en las zonas concretas ya procesadas.
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const ortofotoLayer = L.tileLayer.wms(IGN_ORTOFOTO_WMS_URL, {
    layers: IGN_ORTOFOTO_LAYER,
    format: "image/jpeg",
    version: "1.1.1",
    maxZoom: 20,
    attribution: "Ortofoto PNOA: © IGN / CNIG",
  });

  const relieveWmsLayer = L.tileLayer.wms(IGN_RELIEVE_WMS_URL, {
    layers: IGN_RELIEVE_LAYER,
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    maxZoom: 18,
    attribution: "Relieve (MDT PNOA-LiDAR): © IGN / CNIG",
  });

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
    .layers(
      {
        "Mapa base (OSM)": osmLayer,
        "Ortofoto PNOA (IGN)": ortofotoLayer,
        "Relieve MDT (IGN, toda España)": relieveWmsLayer,
      },
      { "Litología (IGME)": lithologyLayer }
    )
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

  const isStale = () => generation !== currentGeneration;
  const loading = createLoadingTracker(6, isStale);

  addPmtilesLidarLayers(map, layersControl, isStale).finally(loading.done);

  addRasterOverlay(map, layersControl, legend, isStale, {
    name: "Pendiente (MDT-IGN)",
    metaUrl: `${API_BASE_URL}/terrain/slope?region=${regionSlug}`,
    pngUrl: `${API_BASE_URL}/terrain/slope.png?region=${regionSlug}`,
  }).finally(loading.done);

  addRasterOverlay(map, layersControl, legend, isStale, {
    name: "NDVI (Sentinel-2)",
    metaUrl: `${API_BASE_URL}/vegetation/ndvi?region=${regionSlug}`,
    pngUrl: `${API_BASE_URL}/vegetation/ndvi.png?region=${regionSlug}`,
  }).finally(loading.done);

  addRasterOverlay(map, layersControl, legend, isStale, {
    name: "Distancia a cauces",
    metaUrl: `${API_BASE_URL}/hydrography/distance?region=${regionSlug}`,
    pngUrl: `${API_BASE_URL}/hydrography/distance.png?region=${regionSlug}`,
  }).finally(loading.done);

  const hillshadeTool = addHillshadeTool(map);

  addScoringLayer(map, layersControl, legend, isStale, regionSlug)
    .then((weights) => {
      if (weights) addScoringClickHandler(map, () => weights, regionSlug, hillshadeTool.isEnabled);
    })
    .finally(loading.done);

  addKnownSitesLayer(map, layersControl, legend, isStale, regionSlug).finally(loading.done);
}

// Zonas con relieve LiDAR propio (generadas por ./pipeline/, ver pipeline/README.md): cada una
// se sirve como .pmtiles (un solo archivo, sin servidor de teselas aparte) y se recorta a su
// propia bbox — fuera de ella no se piden tiles (Leaflet ni lo intenta, ver `bounds` más abajo),
// así que la capa "Relieve MDT (IGN, toda España)" sigue siendo el respaldo para el resto del mapa.
async function addPmtilesLidarLayers(map, layersControl, isStale) {
  let zones;
  try {
    const response = await fetch(`${API_BASE_URL}/pmtiles/zones`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    zones = (await response.json()).zones;
  } catch (error) {
    console.error("No se pudieron cargar las zonas de relieve LiDAR propio:", error);
    return;
  }
  if (isStale() || zones.length === 0) return;

  const lidarLayers = [];
  for (const zone of zones) {
    const [minLon, minLat, maxLon, maxLat] = zone.bbox;
    const bounds = L.latLngBounds([minLat, minLon], [maxLat, maxLon]);
    const source = new pmtiles.PMTiles(`${API_BASE_URL}${zone.url}`);
    const layer = pmtiles.leafletRasterLayer(source, {
      bounds,
      minZoom: zone.min_zoom,
      maxZoom: 20,
      maxNativeZoom: zone.max_zoom,
      opacity: DEFAULT_LIDAR_OPACITY,
      attribution: zone.attribution,
    });
    layersControl.addOverlay(layer, `Relieve LiDAR de alta resolución (${zone.name})`);
    lidarLayers.push(layer);
  }

  addLidarOpacityControl(map, lidarLayers);
}

const DEFAULT_LIDAR_OPACITY = 0.85;

function addLidarOpacityControl(map, lidarLayers) {
  const control = L.control({ position: "topleft" });
  control.onAdd = function () {
    const container = L.DomUtil.create("div", "lidar-opacity-control");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    const initialPercent = Math.round(DEFAULT_LIDAR_OPACITY * 100);
    container.innerHTML = `
      <label>Opacidad relieve LiDAR <span class="lidar-opacity-value">${initialPercent}%</span></label>
      <input type="range" min="0" max="100" value="${initialPercent}" />
    `;
    const input = container.querySelector("input");
    const valueLabel = container.querySelector(".lidar-opacity-value");
    input.addEventListener("input", () => {
      const opacity = Number(input.value) / 100;
      lidarLayers.forEach((layer) => layer.setOpacity(opacity));
      valueLabel.textContent = `${input.value}%`;
    });
    return container;
  };
  control.addTo(map);
}

function addHillshadeTool(map) {
  // Medio lado del recorte pedido al backend, en metros: 500 -> un cuadrado de 1 km de
  // lado centrado en el punto tocado. Fijo (no depende del zoom del mapa), así el área
  // consultada es siempre la misma sin importar cómo esté encuadrado el mapa al tocar.
  const HALF_SIDE_M = 500;
  const METERS_PER_DEG_LAT = 111320;

  let enabled = false;
  let hillshadeLayer = null;
  let closeButtonEl = null;
  let currentObjectUrl = null;
  let fetchToken = 0;
  let repositionCloseButton = null;

  const control = L.control({ position: "topleft" });
  const container = L.DomUtil.create("div");
  let button, hint;

  control.onAdd = function () {
    L.DomUtil.addClass(container, "hillshade-control");
    L.DomEvent.disableClickPropagation(container);
    container.innerHTML = `
      <button type="button" class="hillshade-toggle">🔍 Revelar relieve oculto (LiDAR)</button>
      <p class="hillshade-hint" hidden></p>
    `;
    button = container.querySelector(".hillshade-toggle");
    hint = container.querySelector(".hillshade-hint");
    button.addEventListener("click", toggle);
    return container;
  };
  control.addTo(map);

  map.on("click", (event) => {
    if (!enabled) return;
    showHillshadeAt(event.latlng.lat, event.latlng.lng);
  });

  function toggle() {
    enabled = !enabled;
    button.classList.toggle("active", enabled);
    hint.hidden = !enabled;
    if (enabled) {
      hint.textContent = "Toca un punto del mapa para revelar el relieve LiDAR de esa zona.";
    } else {
      clearOverlay();
    }
  }

  async function showHillshadeAt(lat, lon) {
    const token = ++fetchToken;
    const dLat = HALF_SIDE_M / METERS_PER_DEG_LAT;
    const dLon = HALF_SIDE_M / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    const params = new URLSearchParams({
      min_lat: lat - dLat,
      min_lon: lon - dLon,
      max_lat: lat + dLat,
      max_lon: lon + dLon,
    });

    hint.hidden = false;
    hint.textContent = "Cargando relieve LiDAR…";
    try {
      const response = await fetch(`${API_BASE_URL}/terrain/hillshade.png?${params}`);
      if (token !== fetchToken) return; // el usuario ya tocó otro punto mientras cargaba

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        hint.textContent = body?.detail ?? "No se pudo cargar el relieve LiDAR de esa zona.";
        return;
      }

      const bboxHeader = JSON.parse(response.headers.get("X-Bounds"));
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const bounds = L.latLngBounds(bboxHeader[0], bboxHeader[1]);

      clearOverlay();
      hillshadeLayer = L.imageOverlay(objectUrl, bounds, {
        opacity: 0.95,
        attribution: "Hillshade LiDAR: IGN (MDT05)",
      }).addTo(map);
      currentObjectUrl = objectUrl;
      map.fitBounds(bounds, { maxZoom: 18 });
      addCloseButton(bounds);
      hint.textContent = "Pulsa la ✕ sobre la imagen para quitarla, o toca otro punto para ver esa zona.";
    } catch (error) {
      if (token !== fetchToken) return;
      console.error("No se pudo cargar el hillshade LiDAR:", error);
      hint.textContent = "No se pudo cargar el relieve LiDAR.";
    }
  }

  function addCloseButton(bounds) {
    closeButtonEl = L.DomUtil.create("button", "hillshade-close-btn", map.getContainer());
    closeButtonEl.type = "button";
    closeButtonEl.setAttribute("aria-label", "Quitar el relieve LiDAR de esta zona");
    closeButtonEl.textContent = "✕";
    L.DomEvent.disableClickPropagation(closeButtonEl);
    L.DomEvent.on(closeButtonEl, "click", clearOverlay);

    repositionCloseButton = () => {
      if (!closeButtonEl) return;
      const point = map.latLngToContainerPoint(bounds.getNorthEast());
      closeButtonEl.style.left = `${point.x}px`;
      closeButtonEl.style.top = `${point.y}px`;
    };
    repositionCloseButton();
    map.on("move zoom", repositionCloseButton);
  }

  function clearOverlay() {
    if (hillshadeLayer) {
      map.removeLayer(hillshadeLayer);
      hillshadeLayer = null;
    }
    if (closeButtonEl) {
      map.off("move zoom", repositionCloseButton);
      repositionCloseButton = null;
      L.DomUtil.remove(closeButtonEl);
      closeButtonEl = null;
    }
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    if (enabled) hint.textContent = "Toca un punto del mapa para revelar el relieve LiDAR de esa zona.";
  }

  return { isEnabled: () => enabled };
}

function createLoadingTracker(totalTasks, isStale) {
  let remaining = totalTasks;
  const statusEl = document.getElementById("loading-status");
  const render = () => {
    if (!statusEl || isStale()) return;
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

async function addKnownSitesLayer(map, layersControl, legend, isStale, regionSlug) {
  let geojson;
  try {
    const response = await fetch(`${API_BASE_URL}/known-sites/sites.geojson?region=${regionSlug}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    geojson = await response.json();
  } catch (error) {
    console.error("No se pudo cargar la capa de yacimientos conocidos:", error);
    return;
  }
  if (isStale()) return;

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

async function addScoringLayer(map, layersControl, legend, isStale, regionSlug) {
  const meta = await fetchLayerMeta(`${API_BASE_URL}/scoring/meta?region=${regionSlug}`);
  if (!meta || isStale()) return null;

  const weights = { ...meta.default_weights };
  const bounds = L.latLngBounds(meta.bounds[0], meta.bounds[1]);
  const buildHeatmapUrl = () =>
    `${API_BASE_URL}/scoring/heatmap.png?region=${regionSlug}&${weightsQueryString(weights)}`;

  const heatmapLayer = L.imageOverlay(buildHeatmapUrl(), bounds, {
    opacity: 0.8,
    attribution: "Score combinado (calculado en el backend)",
  }).addTo(map);

  layersControl.addOverlay(heatmapLayer, "Score combinado (heatmap)");
  legend.addSection("Score combinado (heatmap)", true, buildGradientLegendHtml(meta.gradient));

  const hotspots = await addHotspotsLayer(map, layersControl, legend, isStale, regionSlug, () => weights);

  addWeightsControl(map, weights, () => {
    heatmapLayer.setUrl(buildHeatmapUrl());
    if (hotspots) hotspots.refresh();
  });

  return weights;
}

const HOTSPOT_ICON = L.icon({
  iconUrl: "vendor/leaflet/images/marker-icon.png",
  iconRetinaUrl: "vendor/leaflet/images/marker-icon-2x.png",
  shadowUrl: "vendor/leaflet/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Chinchetas en las zonas de mayor interés (máximos locales del score combinado): así el
// usuario no tiene que rastrear el heatmap a ojo para encontrar dónde merece la pena mirar.
// Se recalculan junto con el heatmap cada vez que cambian los pesos (mismo onChange).
async function addHotspotsLayer(map, layersControl, legend, isStale, regionSlug, getWeights) {
  const hotspotsGroup = L.layerGroup();
  const popup = L.popup();

  async function refresh() {
    let data;
    try {
      const url = `${API_BASE_URL}/scoring/hotspots?region=${regionSlug}&${weightsQueryString(getWeights())}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (error) {
      console.error("No se pudieron cargar las zonas de mayor interés:", error);
      return;
    }
    if (isStale()) return;

    hotspotsGroup.clearLayers();
    for (const point of data.hotspots) {
      const marker = L.marker([point.lat, point.lon], { icon: HOTSPOT_ICON });
      marker.on("click", () => showHotspotBreakdown(map, popup, point, regionSlug, getWeights()));
      hotspotsGroup.addLayer(marker);
    }
  }

  await refresh();
  if (isStale()) return null;

  hotspotsGroup.addTo(map);
  layersControl.addOverlay(hotspotsGroup, "Zonas de mayor interés (chinchetas)");
  legend.addSection(
    "Zonas de mayor interés (chinchetas)",
    true,
    `
      <strong>Zonas de mayor interés</strong>
      <div class="legend-row">
        <span class="legend-pin"></span>
        <span>Máximo local del score combinado (toca la chincheta para ver el desglose)</span>
      </div>
    `
  );

  return { refresh };
}

async function showHotspotBreakdown(map, popup, point, regionSlug, weights) {
  popup.setLatLng([point.lat, point.lon]).setContent("Calculando…").openOn(map);
  try {
    const url =
      `${API_BASE_URL}/scoring/breakdown?lat=${point.lat}&lon=${point.lon}&region=${regionSlug}&${weightsQueryString(weights)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const breakdown = await response.json();
    popup.setContent(buildBreakdownHtml(breakdown));
  } catch (error) {
    popup.setContent("No se pudo calcular el desglose de esta zona.");
  }
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

function addScoringClickHandler(map, getWeights, regionSlug, isHillshadeModeEnabled) {
  const popup = L.popup();
  map.on("click", async (event) => {
    if (isHillshadeModeEnabled()) return;

    const { lat, lng } = event.latlng;
    popup.setLatLng(event.latlng).setContent("Calculando…").openOn(map);

    const weights = getWeights();
    const url =
      `${API_BASE_URL}/scoring/breakdown?lat=${lat}&lon=${lng}&region=${regionSlug}&${weightsQueryString(weights)}`;

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

async function addRasterOverlay(map, layersControl, legend, isStale, { name, metaUrl, pngUrl }) {
  const meta = await fetchLayerMeta(metaUrl);
  if (!meta || isStale()) return;

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

bootstrap();
