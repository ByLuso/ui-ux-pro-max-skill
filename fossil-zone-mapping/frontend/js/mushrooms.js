// Modo "Setas": buscador de especies + mapa de probabilidad de fructificación por especie y día.
// Se monta sobre el mismo mapa Leaflet que el modo fósiles (ver initMap en map.js): este archivo
// solo añade sus capas, su panel lateral y su manejador de clics.

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const FACTOR_LABELS = {
  host: "Árbol / hábitat",
  season: "Temporada",
  elevation: "Altitud",
  ph: "pH del suelo",
  rain: "Lluvia útil",
  temp: "Temperatura",
  water: "Cercanía a cauces",
};

const DANGER_LABELS = {
  mortal: "Mortal",
  toxica: "Tóxica",
  "no-comestible": "No comestible",
  comestible: "Comestible",
};

const mushroomState = {
  catalog: null,
  goldenRules: [],
  photos: {},
  speciesId: readStored("fzm-species"),
  day: 0,
  query: "",
  onlyInSeason: false,
};

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    /* sin almacenamiento: no se recuerda la especie, sin más */
  }
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dayLabel(offset, isoDate) {
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Mañana";
  const d = new Date(`${isoDate}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function edibilityClass(edibility) {
  if (edibility.startsWith("mortal")) return "is-deadly";
  if (edibility.startsWith("tóxica")) return "is-toxic";
  return "is-edible";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function initMushroomMode({ map, layersControl, legend, isStale, regionSlug }) {
  const panel = document.getElementById("mushroom-panel");
  panel.innerHTML = `
    <button type="button" class="panel-handle" aria-expanded="true" aria-controls="mushroom-panel-body">
      <span class="panel-handle-bar"></span><span class="sr-only">Mostrar u ocultar el panel</span>
    </button>
    <div id="mushroom-panel-body" class="panel-body">
      <section class="panel-section">
        <p class="eyebrow">Buscar setas</p>
        <div class="search-field">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input id="species-search" type="search" placeholder="Especie, nombre científico o hábitat…" autocomplete="off" />
        </div>
        <label class="toggle-row">
          <input id="species-in-season" type="checkbox" />
          <span>Solo especies en temporada</span>
        </label>
        <ul id="species-list" class="species-list" aria-label="Especies"><li class="muted">Cargando especies…</li></ul>
      </section>

      <section class="panel-section" id="species-detail"></section>

      <section class="panel-section">
        <div class="section-head">
          <p class="eyebrow">Cuándo ir</p>
          <span class="muted small" id="day-label"></span>
        </div>
        <div id="outlook" class="outlook" role="listbox" aria-label="Día de la previsión"></div>
        <p class="muted small">Mejor puntuación de la región para cada día. Toca un día para ver su mapa.</p>
      </section>

      <section class="panel-section layer-cards">
        <article class="layer-card">
          <p class="layer-index">Capa 01</p>
          <h3>Clima</h3>
          <div id="rain-chart" class="rain-chart" aria-hidden="true"></div>
          <p class="muted small" id="weather-summary">Lluvia diaria (media de la región): 30 días atrás y 16 de previsión.</p>
        </article>
        <article class="layer-card">
          <p class="layer-index">Capa 02</p>
          <h3>Arbolado</h3>
          <p class="muted small">Coníferas, frondosas, encinar, pastizal… (Corine Land Cover 2018). Actívala en el selector de capas.</p>
          <button type="button" class="ghost-button" id="toggle-forest">Mostrar arbolado</button>
        </article>
        <article class="layer-card">
          <p class="layer-index">Capa 03</p>
          <h3>Suelo y relieve</h3>
          <p class="muted small">pH a 0-5 cm (SoilGrids), altitud del MDT del IGN y cercanía a cauces para especies de ribera.</p>
        </article>
      </section>

      <details class="guide-block golden-rules">
        <summary>Reglas de oro del buen setero</summary>
        <ol id="golden-rules"></ol>
      </details>

      <p class="disclaimer">
        Previsión orientativa. <strong>Nunca consumas una seta sin identificación experta</strong>, y
        consulta la normativa de recolección de tu comunidad y del monte.
      </p>
    </div>
  `;

  const els = {
    search: panel.querySelector("#species-search"),
    inSeason: panel.querySelector("#species-in-season"),
    list: panel.querySelector("#species-list"),
    detail: panel.querySelector("#species-detail"),
    outlook: panel.querySelector("#outlook"),
    dayLabel: panel.querySelector("#day-label"),
    rainChart: panel.querySelector("#rain-chart"),
    weatherSummary: panel.querySelector("#weather-summary"),
    forestButton: panel.querySelector("#toggle-forest"),
    handle: panel.querySelector(".panel-handle"),
    goldenRules: panel.querySelector("#golden-rules"),
  };

  els.handle.addEventListener("click", () => {
    const collapsed = panel.classList.toggle("is-collapsed");
    els.handle.setAttribute("aria-expanded", String(!collapsed));
  });
  els.search.value = mushroomState.query;
  els.inSeason.checked = mushroomState.onlyInSeason;

  const loading = createLoadingTracker(2, isStale, "Preparando capas de setas");

  let meta;
  try {
    const [catalog, metaResponse] = await Promise.all([
      mushroomState.catalog
        ? Promise.resolve({ species: mushroomState.catalog, golden_rules: mushroomState.goldenRules })
        : Promise.all([
            fetchJson(`${API_BASE_URL}/mushrooms/species`),
            // Fotos (iNaturalist, licencias CC0/BY/BY-SA) con su crédito: si faltan, la ficha
            // sigue funcionando con el punto de color de siempre.
            fetchJson("img/setas/credits.json").catch(() => ({})),
          ])
            .then(([species, photos]) => {
              mushroomState.photos = photos;
              return species;
            })
            .finally(loading.done),
      fetchJson(`${API_BASE_URL}/mushrooms/meta?region=${regionSlug}`).finally(loading.done),
    ]);
    if (mushroomState.catalog) loading.done();
    mushroomState.catalog = catalog.species;
    mushroomState.goldenRules = catalog.golden_rules ?? [];
    meta = metaResponse;
  } catch (error) {
    console.error("No se pudo preparar el modo setas:", error);
    if (!isStale()) els.list.innerHTML = `<li class="muted">No se pudo conectar con el backend.</li>`;
    return;
  }
  if (isStale()) return;

  if (!mushroomState.catalog.some((s) => s.id === mushroomState.speciesId)) {
    const firstInSeason = mushroomState.catalog.find((s) => s.in_season && !s.edibility.startsWith("mortal"));
    mushroomState.speciesId = (firstInSeason ?? mushroomState.catalog[0]).id;
  }

  // --- Capas del mapa -------------------------------------------------------------------------
  const bounds = L.latLngBounds(meta.bounds[0], meta.bounds[1]);
  const heatmapUrl = () =>
    `${API_BASE_URL}/mushrooms/heatmap.png?region=${regionSlug}&species=${mushroomState.speciesId}&day=${mushroomState.day}`;
  const heatmapLayer = L.imageOverlay(heatmapUrl(), bounds, {
    opacity: 0.85,
    attribution: "Setas: Open-Meteo · Corine 2018 · SoilGrids · IGN",
  }).addTo(map);
  const HEATMAP_NAME = "Probabilidad de setas";
  layersControl.addOverlay(heatmapLayer, HEATMAP_NAME);
  legend.addSection(HEATMAP_NAME, true, buildMushroomGradientLegend(meta.gradient));

  const forestLayer = L.imageOverlay(`${API_BASE_URL}/mushrooms/forest.png?region=${regionSlug}`, bounds, {
    opacity: 0.75,
    attribution: "Arbolado: Corine Land Cover 2018 (EEA)",
  });
  const FOREST_NAME = "Arbolado (Corine)";
  layersControl.addOverlay(forestLayer, FOREST_NAME);
  fetchJson(`${API_BASE_URL}/mushrooms/forest?region=${regionSlug}`)
    .then((forest) => {
      if (isStale()) return;
      legend.addSection(
        FOREST_NAME,
        false,
        `<strong>${FOREST_NAME}</strong>${forest.legend
          .map((item) => `<div class="legend-row"><span class="legend-swatch" style="background:${item.color}"></span><span>${item.label}</span></div>`)
          .join("")}`
      );
    })
    .catch((error) => console.error("No se pudo cargar la leyenda de arbolado:", error));

  const syncForestButton = () => {
    els.forestButton.textContent = map.hasLayer(forestLayer) ? "Ocultar arbolado" : "Mostrar arbolado";
    els.forestButton.classList.toggle("is-active", map.hasLayer(forestLayer));
  };
  els.forestButton.addEventListener("click", () => {
    if (map.hasLayer(forestLayer)) map.removeLayer(forestLayer);
    else forestLayer.addTo(map);
  });
  map.on("overlayadd overlayremove layeradd layerremove", syncForestButton);

  const hotspotsGroup = L.layerGroup().addTo(map);
  layersControl.addOverlay(hotspotsGroup, "Mejores zonas (setas)");
  const popup = L.popup({ maxWidth: 300, className: "dark-popup" });

  let hotspotsToken = 0;
  async function refreshHotspots() {
    const token = ++hotspotsToken;
    let data;
    try {
      data = await fetchJson(
        `${API_BASE_URL}/mushrooms/hotspots?region=${regionSlug}&species=${mushroomState.speciesId}&day=${mushroomState.day}`
      );
    } catch (error) {
      console.error("No se pudieron cargar las mejores zonas:", error);
      return;
    }
    if (isStale() || token !== hotspotsToken) return;
    hotspotsGroup.clearLayers();
    const species = currentSpecies();
    for (const point of data.hotspots) {
      const marker = L.marker([point.lat, point.lon], { icon: makePinIcon(species.color, Math.round(point.score)) });
      marker.on("click", () => showBreakdown(point.lat, point.lon));
      hotspotsGroup.addLayer(marker);
    }
  }

  async function showBreakdown(lat, lon) {
    popup.setLatLng([lat, lon]).setContent(`<div class="breakdown-popup">Calculando…</div>`).openOn(map);
    try {
      const data = await fetchJson(
        `${API_BASE_URL}/mushrooms/breakdown?region=${regionSlug}&species=${mushroomState.speciesId}&day=${mushroomState.day}&lat=${lat}&lon=${lon}`
      );
      if (isStale()) return;
      popup.setContent(buildMushroomBreakdownHtml(data, currentSpecies()));
    } catch (error) {
      popup.setContent(`<div class="breakdown-popup">Este punto está fuera de la región analizada.</div>`);
    }
  }

  map.on("click", (event) => showBreakdown(event.latlng.lat, event.latlng.lng));

  // En el popup, el ranking "¿Qué más puede salir aquí?" permite saltar a otra especie.
  map.on("popupopen", (event) => {
    event.popup.getElement()?.querySelectorAll("[data-species]").forEach((button) => {
      button.addEventListener("click", () => {
        selectSpecies(button.dataset.species);
        const latLng = event.popup.getLatLng();
        showBreakdown(latLng.lat, latLng.lng);
      });
    });
  });

  // --- Panel ----------------------------------------------------------------------------------
  function currentSpecies() {
    return mushroomState.catalog.find((s) => s.id === mushroomState.speciesId);
  }

  function renderList() {
    const needle = mushroomState.query.trim().toLowerCase();
    const filtered = mushroomState.catalog.filter((s) => {
      if (mushroomState.onlyInSeason && !s.in_season) return false;
      if (!needle) return true;
      return [s.name, s.scientific, s.habitat, ...s.hosts.map((h) => h.label)].some((t) => t.toLowerCase().includes(needle));
    });
    if (filtered.length === 0) {
      els.list.innerHTML = `<li class="muted">Ninguna especie coincide con «${escapeHtml(mushroomState.query)}».</li>`;
      return;
    }
    els.list.innerHTML = filtered
      .map(
        (s) => `
        <li>
          <button type="button" class="species-item ${s.id === mushroomState.speciesId ? "is-selected" : ""}" data-id="${s.id}"
            aria-pressed="${s.id === mushroomState.speciesId}">
            ${speciesThumb(s)}
            <span class="species-names">
              <span class="species-name">${escapeHtml(s.name)}</span>
              <em class="species-sci">${escapeHtml(s.scientific)}</em>
            </span>
            ${s.edibility.startsWith("mortal") ? `<span class="badge is-deadly">Mortal</span>` : s.in_season ? `<span class="badge is-season">Temporada</span>` : ""}
          </button>
        </li>`
      )
      .join("");
    els.list.querySelectorAll(".species-item").forEach((button) => {
      button.addEventListener("click", () => selectSpecies(button.dataset.id));
    });
  }

  function renderDetail() {
    const s = currentSpecies();
    const photo = mushroomState.photos[s.id];
    const months = MONTH_INITIALS.map(
      (initial, index) => `<span class="${s.months.includes(index + 1) ? "on" : ""}" title="Mes ${index + 1}">${initial}</span>`
    ).join("");
    const deadly = s.edibility.startsWith("mortal");
    els.detail.innerHTML = `
      ${
        photo
          ? `<figure class="species-photo ${deadly ? "is-deadly" : ""}">
              <a href="${photo.file}" target="_blank" rel="noopener" aria-label="Ver la foto de ${escapeHtml(s.name)} a tamaño completo">
                <img src="${photo.file}" alt="${escapeHtml(s.name)} (${escapeHtml(s.scientific)})" loading="lazy" />
              </a>
              ${deadly ? `<span class="photo-flag">Mortal · para reconocerla</span>` : ""}
              <figcaption>Foto: ${escapeHtml(photo.attribution.replace(/^\(c\)\s*/, "").replace(/, some rights reserved.*$/, ""))} ·
                <a href="${photo.source}" target="_blank" rel="noopener">${escapeHtml(photo.license)}</a> · iNaturalist</figcaption>
            </figure>`
          : ""
      }
      <div class="detail-head" style="--accent-species:${s.color}">
        ${photo ? "" : `<span class="species-dot large" style="--dot:${s.color}"></span>`}
        <div>
          <p class="eyebrow ${edibilityClass(s.edibility)}">${escapeHtml(s.edibility)}</p>
          <h2>${escapeHtml(s.name)}</h2>
          <em class="species-sci">${escapeHtml(s.scientific)}</em>
        </div>
      </div>
      <div class="month-strip" aria-label="Meses de temporada">${months}</div>
      <p class="detail-text">${escapeHtml(s.habitat)}</p>
      <p class="detail-note">${escapeHtml(s.notes)}</p>
      ${buildGuideHtml(s)}
      <dl class="detail-facts">
        <div><dt>Altitud óptima</dt><dd>${s.elevation[1]}–${s.elevation[2]} m</dd></div>
        <div><dt>pH óptimo</dt><dd>${s.ph[1]}–${s.ph[2]}</dd></div>
        <div><dt>Lluvia</dt><dd>≥ ${s.rain_mm[1]} mm en 3 semanas</dd></div>
        <div><dt>Temperatura</dt><dd>${s.temp_c[1]}–${s.temp_c[2]} °C</dd></div>
      </dl>
      <div class="host-tags">${s.hosts
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .map((h) => `<span class="host-tag" style="--w:${h.weight}">${escapeHtml(h.label)}</span>`)
        .join("")}</div>
    `;
  }

  let outlookToken = 0;
  async function renderOutlook() {
    const token = ++outlookToken;
    els.outlook.innerHTML = Array.from({ length: meta.forecast_days }, () => `<span class="outlook-day is-loading"></span>`).join("");
    let data;
    try {
      data = await fetchJson(`${API_BASE_URL}/mushrooms/outlook?region=${regionSlug}&species=${mushroomState.speciesId}`);
    } catch (error) {
      console.error("No se pudo cargar la previsión por días:", error);
      return;
    }
    if (isStale() || token !== outlookToken) return;
    const color = currentSpecies().color;
    els.outlook.innerHTML = data.days
      .map(
        (d) => `
        <button type="button" role="option" class="outlook-day ${d.day === mushroomState.day ? "is-selected" : ""}"
          data-day="${d.day}" aria-selected="${d.day === mushroomState.day}"
          title="${dayLabel(d.day, d.date)}: ${Math.round(d.top_score)}/100">
          <span class="outlook-bar" style="--h:${Math.max(4, d.top_score)}%;--c:${color}"></span>
          <span class="outlook-label">${dayLabel(d.day, d.date).replace("Mañana", "Mñn")}</span>
        </button>`
      )
      .join("");
    els.outlook.querySelectorAll(".outlook-day").forEach((button) => {
      button.addEventListener("click", () => selectDay(Number(button.dataset.day)));
    });
    updateDayLabel(data.days);
  }

  function updateDayLabel(days) {
    const d = days?.[mushroomState.day];
    els.dayLabel.textContent = d ? `${dayLabel(d.day, d.date)} · mejor zona ${Math.round(d.top_score)}/100` : "";
  }

  function renderRainChart() {
    const weather = meta.weather;
    if (!weather) {
      els.rainChart.innerHTML = "";
      els.weatherSummary.textContent =
        "Sin datos meteorológicos ahora mismo (Open-Meteo no responde): el mapa usa hábitat y temporada, con lluvia y temperatura neutras.";
      els.weatherSummary.classList.add("warning");
      return;
    }
    const max = Math.max(5, ...weather.rain_mm);
    const target = weather.today_index + mushroomState.day;
    els.rainChart.innerHTML = weather.rain_mm
      .map((mm, i) => {
        const inWindow = i >= target - 21 && i <= target - 4;
        const classes = [i > weather.today_index ? "is-forecast" : "", inWindow ? "is-window" : "", i === target ? "is-target" : ""].join(" ");
        return `<span class="${classes}" style="--h:${(mm / max) * 100}%" title="${weather.dates[i]}: ${mm} mm"></span>`;
      })
      .join("");
    const windowRain = weather.rain_mm.slice(Math.max(0, target - 21), Math.max(0, target - 3)).reduce((a, b) => a + b, 0);
    const temps = weather.temp_c.slice(Math.max(0, target - 7), target + 1).filter((t) => t !== null);
    const meanTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    els.weatherSummary.classList.remove("warning");
    els.weatherSummary.innerHTML = `Lluvia útil para el día elegido: <strong>${windowRain.toFixed(0)} mm</strong>` +
      (meanTemp !== null ? ` · temperatura media <strong>${meanTemp.toFixed(1)} °C</strong>` : "") +
      `<br><span class="muted">Barras resaltadas = lluvia que cuenta (de 21 a 4 días antes). Más claras = previsión.</span>`;
  }

  function refreshMap() {
    heatmapLayer.setUrl(heatmapUrl());
    refreshHotspots();
  }

  function selectSpecies(id) {
    if (!mushroomState.catalog.some((s) => s.id === id)) return;
    mushroomState.speciesId = id;
    writeStored("fzm-species", id);
    renderList();
    renderDetail();
    renderOutlook();
    refreshMap();
  }

  function selectDay(day) {
    mushroomState.day = day;
    els.outlook.querySelectorAll(".outlook-day").forEach((button) => {
      const selected = Number(button.dataset.day) === day;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    const titles = [...els.outlook.querySelectorAll(".outlook-day")].map((b) => b.title);
    els.dayLabel.textContent = titles[day] ? titles[day].replace(":", " · mejor zona") : "";
    renderRainChart();
    refreshMap();
  }

  let searchTimer = null;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      mushroomState.query = els.search.value;
      renderList();
    }, 120);
  });
  els.search.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const first = els.list.querySelector(".species-item");
    if (first) selectSpecies(first.dataset.id);
  });
  els.inSeason.addEventListener("change", () => {
    mushroomState.onlyInSeason = els.inSeason.checked;
    renderList();
  });

  if (!meta.sources.weather) {
    showToast("Open-Meteo no responde: el mapa de setas se calcula sin lluvia ni temperatura por ahora.");
  }

  els.goldenRules.innerHTML = mushroomState.goldenRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  renderList();
  renderDetail();
  renderRainChart();
  renderOutlook();
  refreshHotspots();
}

function buildMushroomGradientLegend(gradientStops) {
  const cssStops = gradientStops.map((stop) => `${stop.color} ${stop.score}%`).join(", ");
  return `
    <strong>Probabilidad de setas</strong>
    <div class="gradient-bar" style="background: linear-gradient(to right, ${cssStops})"></div>
    <div class="gradient-labels"><span>Baja</span><span>Alta</span></div>
  `;
}

function buildMushroomBreakdownHtml(data, species) {
  const v = data.values;
  const fmt = (value, digits, unit) => (value === null || value === undefined ? "sin dato" : `${value.toFixed(digits)}${unit}`);
  const detail = {
    host: v.forest,
    elevation: fmt(v.elevation_m, 0, " m"),
    ph: fmt(v.ph, 1, ""),
    rain: `${fmt(v.rain_mm, 0, " mm")} (21-4 días antes)`,
    temp: `${fmt(v.temp_c, 1, " °C")} (media 7 días)`,
    water: fmt(v.water_distance_m, 0, " m al cauce"),
    season: "",
  };
  const factorRows = Object.entries(data.factors)
    .map(
      ([key, value]) => `
      <div class="factor-row">
        <span>${FACTOR_LABELS[key] ?? key}</span>
        <span class="factor-bar"><span style="width:${Math.round(value * 100)}%"></span></span>
      </div>
      ${detail[key] ? `<div class="breakdown-detail">${escapeHtml(detail[key])}</div>` : ""}`
    )
    .join("");
  const ranking = data.ranking
    .map(
      (r) => `<button type="button" class="rank-row ${r.id === data.species_id ? "is-current" : ""}" data-species="${r.id}">
        <span>${escapeHtml(r.name)}${r.edibility.startsWith("mortal") ? ' <span class="badge is-deadly">Mortal</span>' : ""}</span>
        <span>${Math.round(r.score)}</span></button>`
    )
    .join("");
  return `
    <div class="breakdown-popup mushroom">
      <p class="eyebrow">${escapeHtml(species.name)} · ${escapeHtml(data.date)}</p>
      <div class="score-big">${Math.round(data.score)}<small>/100</small></div>
      ${factorRows}
      <p class="eyebrow ranking-title">¿Qué más puede salir aquí?</p>
      ${ranking}
    </div>
  `;
}

function speciesThumb(species) {
  const photo = mushroomState.photos[species.id];
  if (!photo) return `<span class="species-dot" style="--dot:${species.color}"></span>`;
  return `<img class="species-thumb" src="${photo.file}" alt="" loading="lazy" style="--dot:${species.color}" />`;
}

// Mini guía de campo: secciones desplegables. "Cómo reconocerla" abierta por defecto; en la
// especie mortal se abren también los síntomas, que es lo que importa de ella.
function buildGuideHtml(species) {
  const guide = species.guide;
  if (!guide) return "";
  const deadly = species.edibility.startsWith("mortal");
  const lookalikes = guide.lookalikes
    .map(
      (l) => `
      <li class="lookalike danger-${l.danger}">
        <div class="lookalike-head"><strong>${escapeHtml(l.name)}</strong>
          <span class="badge danger-${l.danger}">${DANGER_LABELS[l.danger] ?? l.danger}</span></div>
        <p>${escapeHtml(l.how)}</p>
      </li>`
    )
    .join("");
  return `
    <div class="guide">
      <p class="eyebrow">Mini guía de campo</p>
      <details class="guide-block" open>
        <summary>Cómo reconocerla</summary>
        <ul class="guide-list">${guide.identify.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </details>
      <details class="guide-block">
        <summary>Con qué se confunde</summary>
        <ul class="lookalikes">${lookalikes}</ul>
      </details>
      <details class="guide-block">
        <summary>Recolección</summary>
        <p>${escapeHtml(guide.picking)}</p>
      </details>
      ${
        guide.kitchen
          ? `<details class="guide-block"><summary>En la cocina</summary><p>${escapeHtml(guide.kitchen)}</p></details>`
          : ""
      }
      ${
        guide.symptoms
          ? `<details class="guide-block is-alert" ${deadly ? "open" : ""}><summary>Síntomas y qué hacer</summary><p>${escapeHtml(guide.symptoms)}</p></details>`
          : ""
      }
    </div>
  `;
}
