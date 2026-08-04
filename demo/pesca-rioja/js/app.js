/* =========================================================================
   PESCA RIOJA — App logic (prototype, sin backend)
   ========================================================================= */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------
  const state = {
    lang: 'es',
    dark: false,
    contrast: false,
    filters: { tipo: new Set(), especie: new Set(), dificultad: new Set() },
    userLatLng: null,
    activeTramoId: null,
    speciesReturnTramo: null,
  };

  const DIFFICULTIES = ['Fácil', 'Muy fácil (paseo fluvial)', 'Media', 'Difícil'];
  const DIFFICULTY_GROUPS = ['Fácil', 'Media', 'Difícil'];

  function normalizeDifficulty(raw) {
    if (/dif[ií]cil/i.test(raw)) return 'Difícil';
    if (/media/i.test(raw)) return 'Media';
    return 'Fácil';
  }

  function t(key) {
    return (I18N[state.lang] && I18N[state.lang][key]) || I18N.es[key] || key;
  }

  // ---------------------------------------------------------------------
  // DOM SHORTCUTS
  // ---------------------------------------------------------------------
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const elMap = $('#map');
  const filtersPanel = $('#filtersPanel');
  const toolsPanel = $('#toolsPanel');
  const tramoSheet = $('#tramoSheet');
  const speciesSheet = $('#speciesSheet');
  const toastContainer = $('#toastContainer');

  // ---------------------------------------------------------------------
  // TOASTS
  // ---------------------------------------------------------------------
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  // ---------------------------------------------------------------------
  // BACKDROP (mobile slide-overs)
  // ---------------------------------------------------------------------
  let backdrop = document.createElement('div');
  backdrop.className = 'panel-backdrop';
  $('.app-main').appendChild(backdrop);
  backdrop.addEventListener('click', () => {
    closePanel(filtersPanel, 'btnFilters');
    closePanel(toolsPanel, 'btnTools');
  });

  function openPanel(panel, btnId) {
    panel.hidden = false;
    requestAnimationFrame(() => panel.setAttribute('data-open', ''));
    backdrop.classList.add('is-visible');
    const btn = document.getElementById(btnId);
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closePanel(panel, btnId) {
    panel.removeAttribute('data-open');
    backdrop.classList.remove('is-visible');
    const btn = document.getElementById(btnId);
    if (btn) btn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!panel.hasAttribute('data-open')) panel.hidden = true; }, 240);
  }

  $('#btnFilters').addEventListener('click', () => {
    closeSheet(tramoSheet); closeSheet(speciesSheet); closePanel(toolsPanel, 'btnTools');
    openPanel(filtersPanel, 'btnFilters');
  });
  $('#btnCloseFilters').addEventListener('click', () => closePanel(filtersPanel, 'btnFilters'));
  $('#btnTools').addEventListener('click', () => {
    closeSheet(tramoSheet); closeSheet(speciesSheet); closePanel(filtersPanel, 'btnFilters');
    openPanel(toolsPanel, 'btnTools');
  });
  $('#btnCloseTools').addEventListener('click', () => closePanel(toolsPanel, 'btnTools'));

  // ---------------------------------------------------------------------
  // SHEETS (tramo / especie)
  // ---------------------------------------------------------------------
  function openSheet(sheet) {
    closePanel(filtersPanel, 'btnFilters');
    closePanel(toolsPanel, 'btnTools');
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.setAttribute('data-open', ''));
  }
  function closeSheet(sheet) {
    sheet.removeAttribute('data-open');
    setTimeout(() => { if (!sheet.hasAttribute('data-open')) sheet.hidden = true; }, 240);
  }

  // Swipe-down-to-close on mobile
  function enableSwipeDismiss(sheet, handleSel) {
    const handle = sheet.querySelector(handleSel) || sheet;
    let startY = null;
    handle.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    handle.addEventListener('touchmove', (e) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 80) { closeSheet(sheet); startY = null; }
    }, { passive: true });
    handle.addEventListener('touchend', () => { startY = null; });
  }
  enableSwipeDismiss(tramoSheet, '.sheet__handle');
  enableSwipeDismiss(speciesSheet, '.sheet__handle');

  // ---------------------------------------------------------------------
  // MAP INIT
  // ---------------------------------------------------------------------
  let map, layerStandard, layerSatellite, layerTopo;
  const featureLayers = new Map(); // id -> { layer, data, isWaterbody }
  const poiMarkers = [];
  let userMarker = null;

  function initMap() {
    map = L.map(elMap, { zoomControl: false, minZoom: 8, maxZoom: 17 }).setView([42.32, -2.55], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    layerStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    layerSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri', maxZoom: 19,
    });
    layerTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap', maxZoom: 17,
    });

    renderTramos();
    renderWaterbodies();
    renderPois();
  }

  function tramoWeight(tipo) { return tipo === 'vedado' ? 6 : 5; }

  function renderTramos() {
    allTramos().forEach((tramo) => {
      const color = TRAMO_TYPES[tramo.tipo].color;
      const line = L.polyline(tramo.coords, {
        color, weight: tramoWeight(tramo.tipo), opacity: 0.9, lineCap: 'round',
        dashArray: tramo.tipo === 'vedado' ? '2 8' : null,
      }).addTo(map);

      line.bindTooltip(tramo.nombre, { className: 'tramo-tooltip', sticky: true });
      line.on('click', () => openTramoSheet(tramo.id));
      line.on('mouseover', () => line.setStyle({ weight: tramoWeight(tramo.tipo) + 2 }));
      line.on('mouseout', () => line.setStyle({ weight: tramoWeight(tramo.tipo) }));

      featureLayers.set(tramo.id, { layer: line, data: tramo, isWaterbody: false });
    });
  }

  function renderWaterbodies() {
    allWaterbodies().forEach((wb) => {
      const color = TRAMO_TYPES[wb.tipo].color;
      const poly = L.polygon(wb.coords, {
        color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.32,
        dashArray: wb.tipo === 'vedado' ? '2 8' : null,
      }).addTo(map);

      poly.bindTooltip(wb.nombre, { className: 'tramo-tooltip', sticky: true });
      poly.on('click', () => openTramoSheet(wb.id));
      poly.on('mouseover', () => poly.setStyle({ fillOpacity: 0.5 }));
      poly.on('mouseout', () => poly.setStyle({ fillOpacity: 0.32 }));

      featureLayers.set(wb.id, { layer: poly, data: wb, isWaterbody: true });
    });
  }

  const POI_ICONS = {
    parking: '<path d="M6 4h6a4 4 0 010 8H9v6H6V4zm3 3v3h3a1.5 1.5 0 000-3H9z"/>',
    acceso: '<path d="M12 3l7 7-1.4 1.4L13 6.8V21h-2V6.8l-4.6 4.6L5 10l7-7z"/>',
    guarda: '<path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-4z"/>',
    acampada: '<path d="M12 3l9 18h-6l-3-6-3 6H3L12 3z"/>',
    refugio: '<path d="M4 11L12 4l8 7v9h-5v-6H9v6H4v-9z"/>',
  };
  function poiDivIcon(tipo) {
    const path = POI_ICONS[tipo] || POI_ICONS.acceso;
    return L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<span class="poi-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${path}</svg></span>`,
    });
  }

  function renderPois() {
    POIS.forEach((poi) => {
      const marker = L.marker(poi.coords, { icon: poiDivIcon(poi.tipo) }).addTo(map);
      marker.bindTooltip(poi.nombre, { className: 'tramo-tooltip' });
      poiMarkers.push(marker);
    });
  }

  $$('.layer-switcher__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.layer-switcher__btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      [layerStandard, layerSatellite, layerTopo].forEach((l) => map.removeLayer(l));
      const which = btn.dataset.layer;
      (which === 'satellite' ? layerSatellite : which === 'topo' ? layerTopo : layerStandard).addTo(map);
    });
  });

  // ---------------------------------------------------------------------
  // LEGEND
  // ---------------------------------------------------------------------
  function renderLegend() {
    const body = $('#legendBody');
    body.innerHTML = '';
    Object.entries(TRAMO_TYPES).forEach(([key, def]) => {
      const row = document.createElement('div');
      row.className = 'legend-item';
      row.innerHTML = `<span class="legend-swatch" style="background:${def.color}"></span><span>${def.label[state.lang] || def.label.es}</span>`;
      body.appendChild(row);
    });
  }
  $('#legendToggle').addEventListener('click', () => {
    const legend = $('#legend');
    legend.classList.toggle('is-collapsed');
    $('#legendToggle').setAttribute('aria-expanded', String(!legend.classList.contains('is-collapsed')));
  });

  // ---------------------------------------------------------------------
  // FILTERS
  // ---------------------------------------------------------------------
  function renderFilters() {
    const tipoWrap = $('#filterTramoType');
    tipoWrap.innerHTML = '';
    Object.entries(TRAMO_TYPES).forEach(([key, def]) => {
      const chip = document.createElement('button');
      chip.className = 'chip'; chip.type = 'button';
      chip.setAttribute('aria-pressed', String(state.filters.tipo.has(key)));
      chip.innerHTML = `<span class="chip-dot" style="background:${def.color}"></span>${def.label[state.lang] || def.label.es}`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.filters.tipo, key);
        chip.setAttribute('aria-pressed', String(state.filters.tipo.has(key)));
        applyFilters();
      });
      tipoWrap.appendChild(chip);
    });

    const speciesWrap = $('#filterSpecies');
    speciesWrap.innerHTML = '';
    SPECIES.forEach((sp) => {
      const chip = document.createElement('button');
      chip.className = 'chip'; chip.type = 'button';
      chip.setAttribute('aria-pressed', String(state.filters.especie.has(sp.id)));
      chip.innerHTML = `<span class="chip-dot" style="background:${sp.color}"></span>${sp.nombre[state.lang] || sp.nombre.es}`;
      chip.addEventListener('click', () => {
        toggleSetValue(state.filters.especie, sp.id);
        chip.setAttribute('aria-pressed', String(state.filters.especie.has(sp.id)));
        applyFilters();
      });
      speciesWrap.appendChild(chip);
    });

    const diffWrap = $('#filterDifficulty');
    diffWrap.innerHTML = '';
    DIFFICULTY_GROUPS.forEach((d) => {
      const chip = document.createElement('button');
      chip.className = 'chip'; chip.type = 'button';
      chip.setAttribute('aria-pressed', String(state.filters.dificultad.has(d)));
      chip.textContent = d;
      chip.addEventListener('click', () => {
        toggleSetValue(state.filters.dificultad, d);
        chip.setAttribute('aria-pressed', String(state.filters.dificultad.has(d)));
        applyFilters();
      });
      diffWrap.appendChild(chip);
    });
  }

  function toggleSetValue(set, val) { set.has(val) ? set.delete(val) : set.add(val); }

  function applyFilters() {
    let visibleCount = 0;
    featureLayers.forEach(({ layer, data }) => {
      const matchTipo = state.filters.tipo.size === 0 || state.filters.tipo.has(data.tipo);
      const matchEspecie = state.filters.especie.size === 0 || data.especies.some((s) => state.filters.especie.has(s));
      const matchDif = state.filters.dificultad.size === 0 || state.filters.dificultad.has(normalizeDifficulty(data.accesoDificultad));
      const visible = matchTipo && matchEspecie && matchDif;
      if (visible) { if (!map.hasLayer(layer)) layer.addTo(map); visibleCount++; }
      else if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    toast(`${visibleCount} ${t('tramosVisible')}`);
  }

  $('#btnResetFilters').addEventListener('click', () => {
    state.filters.tipo.clear(); state.filters.especie.clear(); state.filters.dificultad.clear();
    renderFilters(); applyFilters();
  });

  // ---------------------------------------------------------------------
  // SEARCH
  // ---------------------------------------------------------------------
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');

  function foldAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  searchInput.addEventListener('input', () => {
    const q = foldAccents(searchInput.value.trim());
    if (!q) { searchResults.hidden = true; return; }
    const matches = allInteractables().filter((t) =>
      foldAccents(t.nombre).includes(q) || foldAccents(t.municipio).includes(q) || foldAccents(t.rioNombre || '').includes(q)
    ).slice(0, 8);
    searchResults.innerHTML = '';
    if (matches.length === 0) {
      searchResults.innerHTML = `<div class="search-result-item">${t('noResults')}</div>`;
    } else {
      matches.forEach((m) => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.tabIndex = 0;
        item.innerHTML = `${m.nombre}<small>${m.rioNombre ? m.rioNombre + ' · ' : ''}${m.municipio}</small>`;
        item.addEventListener('click', () => {
          searchResults.hidden = true; searchInput.value = m.nombre;
          flyToTramo(m.id); openTramoSheet(m.id);
        });
        searchResults.appendChild(item);
      });
    }
    searchResults.hidden = false;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.app-header__search')) searchResults.hidden = true;
  });

  function flyToTramo(id) {
    const entry = featureLayers.get(id);
    if (entry) map.fitBounds(entry.layer.getBounds(), { padding: [60, 60], maxZoom: 14 });
  }

  // ---------------------------------------------------------------------
  // GEOLOCATION
  // ---------------------------------------------------------------------
  function haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  $('#btnLocate').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocalización no disponible'); return; }
    toast(t('geolocating'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        state.userLatLng = latlng;
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker(latlng, {
          icon: L.divIcon({ className: '', html: '<span class="user-location-dot"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        }).addTo(map);
        const nearest = allInteractables()
          .map((tr) => ({ tr, d: Math.min(...tr.coords.map((c) => haversine(latlng, c))) }))
          .sort((a, b) => a.d - b.d)[0];
        map.setView(latlng, 12);
        if (nearest) toast(`${t('nearestStretch')}: ${nearest.tr.nombre} (${nearest.d.toFixed(1)} km)`);
      },
      () => {
        // Fallback for sandboxed/denied geolocation: center on La Rioja capital.
        const fallback = [42.4627, -2.4449];
        state.userLatLng = fallback;
        map.setView(fallback, 11);
        toast('No se pudo obtener tu ubicación exacta — mostrando Logroño como referencia');
      }
    );
  });

  // ---------------------------------------------------------------------
  // TRAMO SHEET
  // ---------------------------------------------------------------------
  function loadReviews(tramoId) {
    const raw = localStorage.getItem('pesca-rioja-reviews');
    const stored = raw ? JSON.parse(raw) : {};
    return stored[tramoId] || SEED_REVIEWS[tramoId] || [];
  }
  function saveReview(tramoId, review) {
    const raw = localStorage.getItem('pesca-rioja-reviews');
    const stored = raw ? JSON.parse(raw) : {};
    const base = stored[tramoId] || SEED_REVIEWS[tramoId] || [];
    stored[tramoId] = [...base, review];
    localStorage.setItem('pesca-rioja-reviews', JSON.stringify(stored));
  }

  function openTramoSheet(tramoId) {
    const tramo = tramoById(tramoId) || waterbodyById(tramoId);
    if (!tramo) return;
    state.activeTramoId = tramoId;
    const def = TRAMO_TYPES[tramo.tipo];
    const reviews = loadReviews(tramoId);
    const avgStars = reviews.length ? (reviews.reduce((s, r) => s + r.estrellas, 0) / reviews.length).toFixed(1) : '—';

    const statCards = [
      tramo.km != null ? { label: t('tramoSheetLength'), value: `${tramo.km} km` } : null,
      tramo.caudalM3s != null ? { label: t('flow'), value: `${tramo.caudalM3s} m³/s` } : null,
      { label: t('waterTemp'), value: `${tramo.tempAguaC} °C` },
      { label: t('clarity'), value: tramo.transparencia },
    ].filter(Boolean);

    $('#tramoSheetContent').innerHTML = `
      <div class="sheet-header">
        <div>
          <span class="tramo-badge" style="background:${def.color}">${def.label[state.lang] || def.label.es}</span>
          <h2 id="tramoSheetTitle">${tramo.nombre}</h2>
          <div class="sheet-meta">${tramo.rioNombre ? tramo.rioNombre + ' · ' : ''}${tramo.municipio}</div>
        </div>
        <button class="sheet-close" data-close-sheet aria-label="${t('close')}">×</button>
      </div>

      <div class="stat-grid">
        ${statCards.map((s) => `<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div></div>`).join('')}
      </div>
      <div class="sheet-meta" style="margin-top:-6px;">Datos de caudal/temperatura simulados (integración real: SAIH Ebro / CHE)</div>

      <div class="info-row"><span class="info-label">${t('tramoSheetModalidad')}</span><span class="info-value">${tramo.modalidad.join(', ')}</span></div>
      <div class="info-row"><span class="info-label">${t('tramoSheetCupo')}</span><span class="info-value">${tramo.cupo}</span></div>
      <div class="info-row"><span class="info-label">${t('tramoSheetTalla')}</span><span class="info-value">${tramo.tallaMinima}</span></div>
      <div class="info-row"><span class="info-label">${t('tramoSheetVeda')}</span><span class="info-value">${tramo.veda}</span></div>
      <div class="info-row"><span class="info-label">${t('tramoSheetPrecio')}</span><span class="info-value">${tramo.precio}</span></div>
      <div class="info-row"><span class="info-label">${t('tramoSheetAccess')}</span><span class="info-value">${tramo.accesoDificultad}${tramo.vadeable ? ` · ${t('wadeable')}` : ''}</span></div>

      <div class="section-title">${t('tramoSheetSpecies')}</div>
      <div class="species-chip-row" id="tramoSpeciesRow"></div>

      <div class="section-title">${t('tramoSheetGallery')}</div>
      <div class="gallery-row">
        <div class="gallery-placeholder">Foto comunidad</div>
        <div class="gallery-placeholder">Foto comunidad</div>
        <div class="gallery-placeholder">+ Añadir</div>
      </div>

      <div class="section-title">${t('tramoSheetReviews')} <span style="color:var(--color-accent)">★ ${avgStars}</span></div>
      <div id="reviewsList"></div>
      <form class="review-form" id="reviewForm">
        <input type="text" id="reviewName" placeholder="${t('reviewsName')}" required />
        <select id="reviewStars">
          <option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option>
        </select>
        <textarea id="reviewText" rows="2" placeholder="${t('reviewsText')}" required></textarea>
        <button type="submit" class="btn-secondary" data-i18n="reviewsSend">${t('reviewsSend')}</button>
      </form>

      <a class="btn-primary directions-btn" target="_blank" rel="noopener"
         href="https://www.google.com/maps/dir/?api=1&destination=${tramo.coords[0][0]},${tramo.coords[0][1]}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        ${t('tramoSheetDirections')}
      </a>
    `;

    const speciesRow = $('#tramoSpeciesRow');
    tramo.especies.forEach((spId) => {
      const sp = speciesById(spId);
      if (!sp) return;
      const chip = document.createElement('button');
      chip.className = 'species-chip'; chip.type = 'button';
      chip.innerHTML = `<span class="species-chip-icon" style="background:${sp.color}">${fishSvg()}</span>${sp.nombre[state.lang] || sp.nombre.es}`;
      chip.addEventListener('click', () => { state.speciesReturnTramo = tramoId; openSpeciesSheet(spId); });
      speciesRow.appendChild(chip);
    });

    renderReviews(reviews);
    $('#reviewForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const review = {
        autor: $('#reviewName').value.trim() || 'Anónimo',
        estrellas: Number($('#reviewStars').value),
        texto: $('#reviewText').value.trim(),
        fecha: new Date().toISOString().slice(0, 10),
      };
      saveReview(tramoId, review);
      toast(t('thanksReview'));
      openTramoSheet(tramoId);
    });

    $$('[data-close-sheet]', $('#tramoSheetContent')).forEach((b) => b.addEventListener('click', () => closeSheet(tramoSheet)));

    openSheet(tramoSheet);
    closeSheet(speciesSheet);
  }

  function renderReviews(reviews) {
    const list = $('#reviewsList');
    if (!list) return;
    if (reviews.length === 0) { list.innerHTML = `<p class="sheet-meta">Sé el primero en valorar este tramo.</p>`; return; }
    list.innerHTML = reviews.map((r) => `
      <div class="review-item">
        <div class="review-head"><span>${r.autor}</span><span class="review-stars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)}</span></div>
        <p>${r.texto}</p>
      </div>
    `).join('');
  }

  function fishSvg() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12c3-4 8-6 12-4 2 1 4 3 5 4-1 1-3 3-5 4-4 2-9 0-12-4z" fill="currentColor" opacity="0.9"/><circle cx="16" cy="10.6" r="0.9" fill="#0b1a12"/><path d="M19 10c1 .3 2 1 2.5 2-.5 1-1.5 1.7-2.5 2" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`;
  }

  // ---------------------------------------------------------------------
  // SPECIES SHEET
  // ---------------------------------------------------------------------
  function listBlock(title, items) {
    return `<div class="section-title">${title}</div><ul style="margin:0 0 4px;padding-left:20px;font-size:0.87rem;color:var(--color-foreground);">${items.map((i) => `<li style="margin-bottom:4px;">${i}</li>`).join('')}</ul>`;
  }

  function openSpeciesSheet(spId) {
    const sp = speciesById(spId);
    if (!sp) return;
    const nombre = sp.nombre[state.lang] || sp.nombre.es;
    $('#speciesSheetContent').innerHTML = `
      ${state.speciesReturnTramo ? `<button class="back-link" id="btnBackToTramo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('speciesBack')}</button>` : ''}
      <div class="sheet-header">
        <div class="species-hero">
          <span class="species-hero-icon" style="background:${sp.color}">${fishSvg()}</span>
          <div>
            <h2 id="speciesSheetTitle">${nombre}</h2>
            <div class="sci-name">${sp.cientifico}</div>
            <span class="origin-badge ${sp.origen}">${t(sp.origen === 'autoctona' ? 'autoctona' : 'introducida')}</span>
          </div>
        </div>
        <button class="sheet-close" id="btnCloseSpecies" aria-label="${t('close')}">×</button>
      </div>

      <div class="section-title">${t('identification')}</div>
      <p style="font-size:0.88rem;margin:0 0 10px;">${sp.descripcion}</p>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Talla media</div><div class="stat-value">${sp.tallaMedia}</div></div>
        <div class="stat-card"><div class="stat-label">Talla máxima</div><div class="stat-value">${sp.tallaMaxima}</div></div>
      </div>

      <div class="section-title">${t('habitatBehavior')}</div>
      <p style="font-size:0.88rem;margin:0 0 8px;">${sp.habitat}</p>
      <div class="info-row"><span class="info-label">${t('freza')}</span><span class="info-value">${sp.freza}</span></div>
      <div class="info-row"><span class="info-label">${t('conservation')}</span><span class="info-value">${sp.conservacion}</span></div>

      <div class="section-title" style="margin-top:26px;border-top:1px solid var(--color-border);padding-top:16px;">${t('fishingGuide')}</div>
      ${listBlock(t('techniques'), sp.tecnicas)}
      ${listBlock(t('lures'), sp.senuelos)}
      ${listBlock(t('hooks'), sp.anzuelos)}
      ${listBlock(t('naturalBaits'), sp.cebos)}

      <div class="info-row"><span class="info-label">${t('bestSeason')}</span><span class="info-value">${sp.mejorEpoca}</span></div>
      <div class="info-row"><span class="info-label">${t('bestTime')}</span><span class="info-value">${sp.mejorHora}</span></div>
      <div class="info-row"><span class="info-label">${t('idealConditions')}</span><span class="info-value">${sp.condicionesIdeales}</span></div>
      <div class="info-row"><span class="info-label">${t('legalLimits')}</span><span class="info-value">${sp.tallaMinimaLegal} · ${sp.cupo}</span></div>

      <div class="section-title">${t('handling')}</div>
      <p style="font-size:0.88rem;margin:0;">${sp.manejo}</p>
    `;

    const backBtn = $('#btnBackToTramo');
    if (backBtn) backBtn.addEventListener('click', () => { closeSheet(speciesSheet); if (state.speciesReturnTramo) openTramoSheet(state.speciesReturnTramo); });
    $('#btnCloseSpecies').addEventListener('click', () => closeSheet(speciesSheet));

    openSheet(speciesSheet);
  }

  // ---------------------------------------------------------------------
  // TOOLS: TABS
  // ---------------------------------------------------------------------
  $$('.tools-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      $$('.tools-tab').forEach((b) => { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
      tabBtn.classList.add('is-active'); tabBtn.setAttribute('aria-selected', 'true');
      $$('.tools-tabpanel').forEach((p) => { p.hidden = p.dataset.tabpanel !== tabBtn.dataset.tab; });
    });
  });

  // ---- VEDAS ----
  function renderVedas() {
    $('#vedasList').innerHTML = VEDAS.map((v) => {
      const sp = speciesById(v.especie);
      const nombre = sp ? (sp.nombre[state.lang] || sp.nombre.es) : v.especie;
      return `<div class="veda-item"><strong>${nombre}</strong>${v.apertura} → ${v.cierre}<div class="veda-meta">${v.notas}</div></div>`;
    }).join('');
  }

  // ---- PREDICTOR "buen día de pesca" ----
  function moonPhaseScore(date) {
    const synodic = 29.53058867;
    const known = new Date('2000-01-06T18:14:00Z').getTime();
    const diffDays = (date.getTime() - known) / 86400000;
    const phase = ((diffDays % synodic) + synodic) % synodic;
    const illum = Math.abs(Math.cos((phase / synodic) * Math.PI * 2)); // crude proxy 0..1
    return { phase, illum };
  }
  function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  function renderPredictor() {
    const today = new Date();
    const daySeed = today.getFullYear() * 400 + today.getMonth() * 31 + today.getDate();
    const { illum } = moonPhaseScore(today);
    const pressure = 995 + Math.round(seededRandom(daySeed) * 30); // hPa mock
    const flowTrend = seededRandom(daySeed + 1) > 0.5 ? 'Estable' : 'Bajando';
    const tempTrend = 8 + Math.round(seededRandom(daySeed + 2) * 14);

    let score = 50;
    score += (1 - illum) * 20; // luna nueva/creciente favorece más
    score += pressure < 1013 ? 15 : -5;
    score += flowTrend === 'Estable' ? 10 : -5;
    score += tempTrend >= 10 && tempTrend <= 16 ? 15 : 0;
    score = Math.max(5, Math.min(98, Math.round(score)));

    $('#predictorCard').innerHTML = `
      <div class="predictor-score">${score}<span style="font-size:1rem;color:var(--color-muted-foreground);"> / 100</span></div>
      <div class="sheet-meta">${today.toLocaleDateString(state.lang === 'es' ? 'es-ES' : state.lang)} — puntuación orientativa</div>
      <div class="predictor-factors">
        <div class="predictor-factor"><span>Fase lunar (iluminación)</span><span>${Math.round(illum * 100)}%</span></div>
        <div class="predictor-factor"><span>Presión atmosférica</span><span>${pressure} hPa</span></div>
        <div class="predictor-factor"><span>Tendencia de caudal</span><span>${flowTrend}</span></div>
        <div class="predictor-factor"><span>Temp. agua estimada</span><span>${tempTrend} °C</span></div>
      </div>
      <div class="sheet-meta" style="margin-top:10px;">Cálculo simulado combinando fase lunar, presión, caudal y temperatura. Integración real prevista con AEMET + SAIH Ebro.</div>
    `;
  }

  // ---- LOGBOOK ----
  function loadLogbook() { return JSON.parse(localStorage.getItem('pesca-rioja-logbook') || '[]'); }
  function saveLogbook(entries) { localStorage.setItem('pesca-rioja-logbook', JSON.stringify(entries)); }

  function renderLogbookSelects() {
    const tramoSel = $('#logbookTramo'); const spSel = $('#logbookSpecies');
    tramoSel.innerHTML = allInteractables().map((t2) => `<option value="${t2.id}">${t2.nombre}</option>`).join('');
    spSel.innerHTML = SPECIES.map((s) => `<option value="${s.id}">${s.nombre[state.lang] || s.nombre.es}</option>`).join('');
  }
  function renderLogbookEntries() {
    const entries = loadLogbook();
    const wrap = $('#logbookEntries');
    if (entries.length === 0) { wrap.innerHTML = `<p class="sheet-meta">Sin capturas registradas todavía.</p>`; return; }
    wrap.innerHTML = entries.slice().reverse().map((e) => {
      const tramo = tramoById(e.tramoId) || waterbodyById(e.tramoId); const sp = speciesById(e.speciesId);
      return `<div class="logbook-entry"><span>${sp ? (sp.nombre[state.lang] || sp.nombre.es) : '—'} · ${tramo ? tramo.nombre : '—'}</span><span>${e.weight ? e.weight + ' kg · ' : ''}${e.date}</span></div>`;
    }).join('');
  }
  $('#logbookForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const entries = loadLogbook();
    entries.push({
      tramoId: $('#logbookTramo').value,
      speciesId: $('#logbookSpecies').value,
      weight: $('#logbookWeight').value ? Number($('#logbookWeight').value) : null,
      date: $('#logbookDate').value,
    });
    saveLogbook(entries);
    renderLogbookEntries();
    toast(t('catchLogged'));
    e.target.reset();
  });
  $('#btnExportLogbook').addEventListener('click', () => {
    const entries = loadLogbook();
    if (entries.length === 0) { toast('No hay capturas que exportar'); return; }
    const win = window.open('', '_blank');
    const rows = entries.map((e) => {
      const tramo = tramoById(e.tramoId) || waterbodyById(e.tramoId); const sp = speciesById(e.speciesId);
      return `<tr><td>${e.date}</td><td>${sp ? (sp.nombre.es) : ''}</td><td>${tramo ? tramo.nombre : ''}</td><td>${e.weight || '—'}</td></tr>`;
    }).join('');
    win.document.write(`
      <html><head><title>Cuaderno de capturas — Pesca Rioja</title>
      <style>body{font-family:sans-serif;padding:24px;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #ccc;padding:8px;font-size:14px;text-align:left;}</style>
      </head><body><h1>Cuaderno de capturas — Pesca Rioja</h1>
      <table><thead><tr><th>Fecha</th><th>Especie</th><th>Tramo</th><th>Peso (kg)</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  });

  // ---- ACCESSIBILITY ----
  $('#toggleContrast').addEventListener('change', (e) => {
    document.body.classList.toggle('theme-contrast', e.target.checked);
  });
  $('#rangeFontSize').addEventListener('input', (e) => {
    const scale = [1, 1.125, 1.25][Number(e.target.value)];
    document.documentElement.style.setProperty('--font-scale', scale);
  });
  $('#toggleOffline').addEventListener('change', (e) => {
    if (e.target.checked && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => toast('Modo offline activado: app cacheada')).catch(() => toast('No se pudo activar el modo offline en este entorno'));
    } else {
      toast('Modo offline desactivado');
    }
  });

  // ---------------------------------------------------------------------
  // DARK MODE
  // ---------------------------------------------------------------------
  $('#btnDark').addEventListener('click', () => {
    state.dark = !state.dark;
    document.body.classList.toggle('theme-dark', state.dark);
    $('#btnDark').classList.toggle('is-active', state.dark);
  });

  // ---------------------------------------------------------------------
  // i18n
  // ---------------------------------------------------------------------
  function applyI18n() {
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    document.documentElement.lang = state.lang;
    renderLegend();
    renderFilters();
    renderVedas();
    renderLogbookSelects();
  }
  $('#langSelect').addEventListener('change', (e) => { state.lang = e.target.value; applyI18n(); });

  // ---------------------------------------------------------------------
  // ALERT BANNER (mock)
  // ---------------------------------------------------------------------
  function showAlert() {
    const banner = $('#alertBanner');
    $('#alertBannerText').textContent = 'Aviso: crecida moderada prevista en el Najerilla en las próximas 24h (dato simulado — integración SAIH Ebro).';
    banner.hidden = false;
  }
  $('#alertBannerClose').addEventListener('click', () => { $('#alertBanner').hidden = true; });

  // ---------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------
  function init() {
    initMap();
    applyI18n();
    renderPredictor();
    renderLogbookEntries();
    $('#logbookDate').value = new Date().toISOString().slice(0, 10);
    setTimeout(showAlert, 1500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
