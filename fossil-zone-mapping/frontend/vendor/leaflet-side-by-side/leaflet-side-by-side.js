/*!
 * Reimplementación propia del control de comparación "swipe" de leaflet-side-by-side
 * v2.2.0 (https://github.com/digidem/leaflet-side-by-side, MIT, Gregor MacLennan).
 * La API pública (L.control.sideBySide(leftLayers, rightLayers)) y la lógica de recorte
 * (_updateClip, basada en containerPointToLayerPoint) son las mismas que el original.
 *
 * Lo que SÍ cambia por completo es cómo se arrastra el divisor: el original usaba un
 * <input type="range"> nativo invisible (con trucos de altura 0 y pointer-events en el
 * pseudo-elemento del thumb) para que el navegador gestionase el arrastre. Eso funciona
 * razonablemente en Chrome de escritorio, pero en Chrome de Android el control de rango
 * nativo se renderiza con el widget Material del sistema (de ahí el círculo azul en vez
 * de nuestro círculo oscuro con borde blanco) y su hit-test táctil no coincide con el
 * área CSS del elemento, así que el arrastre real con el dedo fallaba o se enganchaba
 * con controles vecinos (ver commits anteriores de este mismo archivo).
 *
 * Aquí el "thumb" es un <div> normal que gestionamos nosotros con la Pointer Events API
 * (pointerdown/pointermove/pointerup + setPointerCapture), que funciona igual en ratón,
 * touch y stylus y no depende de cómo cada navegador/SO pinte un input nativo.
 */
(function (L) {
  function asArray(arg) {
    return arg === undefined ? [] : Array.isArray(arg) ? arg : [arg];
  }

  L.Control.SideBySide = L.Control.extend({
    options: { thumbSize: 44, padding: 0 },

    initialize: function (leftLayers, rightLayers, options) {
      this._value = 0.5;
      this.setLeftLayers(leftLayers);
      this.setRightLayers(rightLayers);
      L.setOptions(this, options);
    },

    getPosition: function () {
      var offset = (0.5 - this._value) * (2 * this.options.padding + this.options.thumbSize);
      return this._map.getSize().x * this._value + offset;
    },

    includes: L.Evented.prototype || L.Mixin.Events,

    addTo: function (map) {
      this.remove();
      this._map = map;
      var container = (this._container = L.DomUtil.create("div", "leaflet-sbs", map._controlContainer));
      this._divider = L.DomUtil.create("div", "leaflet-sbs-divider", container);
      this._handle = L.DomUtil.create("div", "leaflet-sbs-handle", container);
      this._addEvents();
      this._updateLayers();
      return this;
    },

    remove: function () {
      if (!this._map) return this;
      if (this._leftLayer) this._leftLayer.getContainer().style.clip = "";
      if (this._rightLayer) this._rightLayer.getContainer().style.clip = "";
      this._removeEvents();
      L.DomUtil.remove(this._container);
      this._map = null;
      return this;
    },

    setLeftLayers: function (leftLayers) {
      this._leftLayers = asArray(leftLayers);
      this._updateLayers();
      return this;
    },

    setRightLayers: function (rightLayers) {
      this._rightLayers = asArray(rightLayers);
      this._updateLayers();
      return this;
    },

    _updateClip: function () {
      var map = this._map;
      var nw = map.containerPointToLayerPoint([0, 0]);
      var se = map.containerPointToLayerPoint(map.getSize());
      var clipX = nw.x + this.getPosition();
      var dividerX = this.getPosition();

      this._divider.style.left = dividerX + "px";
      this._handle.style.left = dividerX + "px";
      this.fire("dividermove", { x: dividerX });
      var clipLeft = "rect(" + [nw.y, clipX, se.y, nw.x].join("px,") + "px)";
      var clipRight = "rect(" + [nw.y, se.x, se.y, clipX].join("px,") + "px)";
      if (this._leftLayer) this._leftLayer.getContainer().style.clip = clipLeft;
      if (this._rightLayer) this._rightLayer.getContainer().style.clip = clipRight;
    },

    _updateLayers: function () {
      if (!this._map) return this;
      var prevLeft = this._leftLayer;
      var prevRight = this._rightLayer;
      this._leftLayer = this._rightLayer = null;
      this._leftLayers.forEach(function (layer) {
        if (this._map.hasLayer(layer)) this._leftLayer = layer;
      }, this);
      this._rightLayers.forEach(function (layer) {
        if (this._map.hasLayer(layer)) this._rightLayer = layer;
      }, this);
      if (prevLeft !== this._leftLayer) {
        prevLeft && this.fire("leftlayerremove", { layer: prevLeft });
        this._leftLayer && this.fire("leftlayeradd", { layer: this._leftLayer });
      }
      if (prevRight !== this._rightLayer) {
        prevRight && this.fire("rightlayerremove", { layer: prevRight });
        this._rightLayer && this.fire("rightlayeradd", { layer: this._rightLayer });
      }
      this._updateClip();
    },

    _setValueFromClientX: function (clientX) {
      var rect = this._map.getContainer().getBoundingClientRect();
      var size = this._map.getSize().x;
      this._value = Math.min(1, Math.max(0, (clientX - rect.left) / size));
      this._updateClip();
    },

    _onPointerDown: function (e) {
      e.preventDefault();
      this._dragging = true;
      if (this._handle.setPointerCapture) {
        try {
          this._handle.setPointerCapture(e.pointerId);
        } catch (err) {
          // Puede fallar si el navegador ya soltó el puntero; no es crítico, el listener
          // en window sigue funcionando de respaldo.
        }
      }
      this._mapWasDragEnabled = this._map.dragging.enabled();
      this._mapWasTapEnabled = this._map.tap && this._map.tap.enabled();
      this._map.dragging.disable();
      this._map.tap && this._map.tap.disable();
    },

    _onPointerMove: function (e) {
      if (!this._dragging) return;
      this._setValueFromClientX(e.clientX);
    },

    _onPointerUp: function () {
      if (!this._dragging) return;
      this._dragging = false;
      if (this._mapWasDragEnabled) this._map.dragging.enable();
      if (this._mapWasTapEnabled) this._map.tap.enable();
    },

    _addEvents: function () {
      var map = this._map;
      if (!map) return;
      map.on("move", this._updateClip, this);
      map.on("layeradd layerremove", this._updateLayers, this);
      L.DomEvent.on(this._handle, "pointerdown", this._onPointerDown, this);
      L.DomEvent.on(window, "pointermove", this._onPointerMove, this);
      L.DomEvent.on(window, "pointerup pointercancel", this._onPointerUp, this);
      L.DomEvent.disableClickPropagation(this._handle);
    },

    _removeEvents: function () {
      var map = this._map;
      L.DomEvent.off(this._handle, "pointerdown", this._onPointerDown, this);
      L.DomEvent.off(window, "pointermove", this._onPointerMove, this);
      L.DomEvent.off(window, "pointerup pointercancel", this._onPointerUp, this);
      if (map) {
        map.off("layeradd layerremove", this._updateLayers, this);
        map.off("move", this._updateClip, this);
      }
    },
  });

  L.control.sideBySide = function (leftLayers, rightLayers, options) {
    return new L.Control.SideBySide(leftLayers, rightLayers, options);
  };
})(L);
