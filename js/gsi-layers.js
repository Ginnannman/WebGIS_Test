"use strict";

const GsiVector = (function () {

  const URL = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
  const MAX_DATA_ZOOM = 16;
  const ATTR = "<a href='https://github.com/gsi-cyberjapan/optimal_bvmap' " +
               "target='_blank' rel='noopener'>国土地理院最適化ベクトルタイル</a>";

  // vt_rdctg の全値（style/std.json より）
  const CATEGORY = {
    "高速自動車国道等": { color: "#2e7d32", width: 2.4 },
    "国道":             { color: "#c62828", width: 2.0 },
    "都道府県道":       { color: "#ef6c00", width: 1.6 },
    "主要道路":         { color: "#6a1b9a", width: 1.4 },
    "市区町村道等":     { color: "#546e7a", width: 1.0 },
    "その他":           { color: "#90a4ae", width: 0.8 },
    "不明":             { color: "#bdbdbd", width: 0.8 },
  };
  const CATEGORY_FALLBACK = { color: "#bdbdbd", width: 0.8 };

  function strokePath(context, geom) {
    for (const ring of geom) {
      ring.forEach((pt, i) => (i === 0 ? context.moveTo(pt.x, pt.y) : context.lineTo(pt.x, pt.y)));
    }
  }

  // ---- 道路中心線：種別塗り分け ----------------------------------------
  class CategorySymbolizer {
    draw(context, geom, z, feature) {
      const c = CATEGORY[feature.props["vt_rdctg"]] || CATEGORY_FALLBACK;
      context.beginPath();
      context.strokeStyle = c.color;
      context.lineWidth = c.width;
      context.lineCap = "round";
      strokePath(context, geom);
      context.stroke();
    }
  }

  // ---- 道路中心線：方位塗り分け（線分単位） ------------------------------
  class SegmentBearingSymbolizer {
    draw(context, geom, z, feature) {
      context.lineWidth = 2.0;
      context.lineCap = "round";
      for (const ring of geom) {
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1], b = ring[i];
          context.beginPath();
          context.strokeStyle = Bearing.color(Bearing.ofSegment(a, b));
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
    }
  }

  // ---- 建築物：長軸方位塗り分け ------------------------------------------
  class FootprintBearingSymbolizer {
    draw(context, geom) {
      context.beginPath();
      for (const ring of geom) {
        ring.forEach((pt, i) => (i === 0 ? context.moveTo(pt.x, pt.y) : context.lineTo(pt.x, pt.y)));
        context.closePath();
      }
      context.fillStyle = Bearing.color(Bearing.axialMean(geom));
      context.fill("evenodd");
    }
  }

  function layer(dataLayer, symbolizer) {
    return protomapsL.leafletLayer({
      url: URL,
      maxDataZoom: MAX_DATA_ZOOM,
      devicePixelRatio: window.devicePixelRatio || 1,
      attribution: ATTR,
      paintRules: [{ dataLayer: dataLayer, symbolizer: symbolizer }],
    });
  }

  return {
    roadsByCategory: () => layer("RdCL", new CategorySymbolizer()),
    roadsByBearing:  () => Bearing.attachAttribution(layer("RdCL", new SegmentBearingSymbolizer())),
    buildingsByBearing: () => Bearing.attachAttribution(layer("BldA", new FootprintBearingSymbolizer())),
    CATEGORY,
  };
})();

// =====================================================================
// 凡例（対象レイヤの表示に連動）
// =====================================================================
const MapLegend = L.Control.extend({
  options: { position: "bottomright" },

  onAdd(map) {
    this._div = L.DomUtil.create("div", "map-legend");
    L.DomEvent.disableClickPropagation(this._div);
    this._entries = new Map();
    map.on("overlayadd overlayremove", () => this._render());
    this._map = map;
    this._render();
    return this._div;
  },

  register(layer, kind, title) {
    this._entries.set(layer, { kind, title });
    return this;
  },

  _render() {
    this._div.replaceChildren();
    for (const [layer, meta] of this._entries) {
      if (!this._map.hasLayer(layer)) continue;
      const sec = document.createElement("section");
      const h = document.createElement("h4");
      h.textContent = meta.title;
      sec.appendChild(h);

      if (meta.kind === "bearing") {
        sec.appendChild(Bearing.wheel(74));
        const p = document.createElement("p");
        p.textContent = "方位（90度周期）";
        sec.appendChild(p);
      } else if (meta.kind === "category") {
        for (const [name, c] of Object.entries(GsiVector.CATEGORY)) {
          const row = document.createElement("div");
          row.className = "legend-row";
          const sw = document.createElement("span");
          sw.className = "legend-swatch";
          sw.style.background = c.color;
          row.append(sw, document.createTextNode(name));
          sec.appendChild(row);
        }
      }
      this._div.appendChild(sec);
    }
    this._div.style.display = this._div.childElementCount ? "block" : "none";
  },
});
