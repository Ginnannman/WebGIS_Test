"use strict";

/* =====================================================================
 * 標準地域メッシュ（JIS X 0410）の計算生成
 *
 * 緯度経度から決定的に算出するため、ポリゴンデータの配布は不要。
 * 測地系は JGD2011 / WGS84 を前提とする（旧日本測地系とは数百m ずれる）。
 * ===================================================================== */
const MeshGrid = (function () {

  // 次数ごとの「1度あたりのセル数」
  //   1次: 緯度 40分(2/3度) × 経度 1度
  //   2次: 1次を 8×8 分割      3次: 2次を 10×10 分割
  //   4〜6次: 直前の次数を 2×2 分割（1/2・1/4・1/8 地域メッシュ）
  const LAT_DIV = [null, 1.5, 12, 120, 240, 480, 960];
  const LON_DIV = [null, 1,    8,  80, 160, 320, 640];

  const LABELS = [
    null,
    "1次 ／ 約80km",
    "2次 ／ 約10km",
    "3次（基準地域メッシュ）／ 約1km",
    "4次（1/2地域メッシュ）／ 約500m",
    "5次（1/4地域メッシュ）／ 約250m",
    "6次（1/8地域メッシュ）／ 約125m",
  ];

  const MIN_CELL_PX = 28;    // これ未満の次数は使わない
  const MAX_CELLS   = 6000;  // 安全弁
  const DOMAIN = { south: 20, north: 46, west: 122, east: 154 }; // メッシュ定義域

  // ---- 緯度経度 → 格子番号 --------------------------------------------
  function indexOf(lat, lon, order) {
    return {
      y: Math.floor(lat * LAT_DIV[order]),
      x: Math.floor((lon - 100) * LON_DIV[order]),
    };
  }

  // ---- 格子番号 → メッシュコード --------------------------------------
  function codeOf(y, x, order) {
    const sub = [];
    for (let n = order; n >= 4; n--) {
      // 分割メッシュの番号は 1=南西 2=南東 3=北西 4=北東
      sub.unshift(String(2 * (y % 2) + (x % 2) + 1));
      y = Math.floor(y / 2);
      x = Math.floor(x / 2);
    }
    let third = "";
    if (order >= 3) {
      third = String(y % 10) + String(x % 10);
      y = Math.floor(y / 10);
      x = Math.floor(x / 10);
    }
    let second = "";
    if (order >= 2) {
      second = String(y % 8) + String(x % 8);
      y = Math.floor(y / 8);
      x = Math.floor(x / 8);
    }
    return String(y).padStart(2, "0") + String(x).padStart(2, "0") + second + third + sub.join("");
  }

  function codeAt(lat, lon, order) {
    const i = indexOf(lat, lon, order);
    return codeOf(i.y, i.x, order);
  }

  function inDomain(lat, lon) {
    return lat >= DOMAIN.south && lat < DOMAIN.north
        && lon >= DOMAIN.west  && lon < DOMAIN.east;
  }

  // ---- 表示範囲に対して実際に使う次数を決める --------------------------
  function effectiveOrder(map, selected) {
    const b = map.getBounds();
    let span = b.getEast() - b.getWest();
    if (span <= 0) span += 360;
    const pxPerDeg = map.getSize().x / span;
    for (let n = selected; n >= 1; n--) {
      if (pxPerDeg / LON_DIV[n] >= MIN_CELL_PX) return n;
    }
    return 1;
  }

  // ---- 表示範囲を定義域で切って格子番号の範囲に落とす ------------------
  function rangeFor(bounds, order) {
    const s = Math.max(bounds.getSouth(), DOMAIN.south);
    const n = Math.min(bounds.getNorth(), DOMAIN.north);
    const w = Math.max(bounds.getWest(),  DOMAIN.west);
    const e = Math.min(bounds.getEast(),  DOMAIN.east);
    if (s >= n || w >= e) return null;
    const r = {
      s: Math.floor(s * LAT_DIV[order]),
      n: Math.floor(n * LAT_DIV[order]),
      w: Math.floor((w - 100) * LON_DIV[order]),
      e: Math.floor((e - 100) * LON_DIV[order]),
    };
    r.rows = r.n - r.s + 1;
    r.cols = r.e - r.w + 1;
    return r;
  }

  // =====================================================================
  // レイヤ本体
  // =====================================================================
  const MeshLayer = L.LayerGroup.extend({
    options: { order: 2, color: "#1e90ff", weight: 1, opacity: 0.6 },

    initialize(options) {
      L.LayerGroup.prototype.initialize.call(this, [], options);
      this._redraw = this._redraw.bind(this);
      this._onClick = this._onClick.bind(this);
      this._sig = null;
      this._effective = this.options.order;
    },

    onAdd(map) {
      L.LayerGroup.prototype.onAdd.call(this, map);
      map.on("moveend zoomend resize", this._redraw);
      map.on("click", this._onClick);
      this._control = new MeshControl(this).addTo(map);
      this._sig = null;
      this._redraw();
    },

    onRemove(map) {
      map.off("moveend zoomend resize", this._redraw);
      map.off("click", this._onClick);
      if (this._control) { map.removeControl(this._control); this._control = null; }
      L.LayerGroup.prototype.onRemove.call(this, map);
    },

    setOrder(order) {
      this.options.order = order;
      this._sig = null;
      this._redraw();
    },

    _redraw() {
      const map = this._map;
      if (!map) return;

      const order = effectiveOrder(map, this.options.order);
      const r = rangeFor(map.getBounds(), order);
      const sig = r ? [order, r.s, r.n, r.w, r.e].join(":") : "empty";
      if (sig === this._sig) return;      // 格子番号の範囲が変わらなければ何もしない
      this._sig = sig;
      this._effective = order;

      this.clearLayers();
      this.fire("orderchange", { order: order, selected: this.options.order });
      if (!r) return;

      if (r.rows * r.cols > MAX_CELLS) {
        console.warn("メッシュ数が上限を超えたため描画を省略しました:", r.rows * r.cols);
        return;
      }

      const latDiv = LAT_DIV[order], lonDiv = LON_DIV[order];
      const south = r.s / latDiv,          north = (r.n + 1) / latDiv;
      const west  = r.w / lonDiv + 100,    east  = (r.e + 1) / lonDiv + 100;
      const style = {
        color: this.options.color,
        weight: this.options.weight,
        opacity: this.options.opacity,
        interactive: false,               // クリックは地図側で拾う
      };

      for (let x = r.w; x <= r.e + 1; x++) {
        const lon = x / lonDiv + 100;
        L.polyline([[south, lon], [north, lon]], style).addTo(this);
      }
      for (let y = r.s; y <= r.n + 1; y++) {
        const lat = y / latDiv;
        L.polyline([[lat, west], [lat, east]], style).addTo(this);
      }
    },

    _onClick(e) {
      const { lat, lng } = e.latlng;
      if (!inDomain(lat, lng)) return;

      const box = document.createElement("div");
      const dl = document.createElement("dl");
      dl.className = "mesh-popup";
      for (let n = 1; n <= this._effective; n++) {
        const dt = document.createElement("dt");
        dt.textContent = LABELS[n].split(" ／ ")[0];
        const dd = document.createElement("dd");
        dd.textContent = codeAt(lat, lng, n);
        dl.append(dt, dd);
      }
      box.appendChild(dl);
      L.popup().setLatLng(e.latlng).setContent(box).openOn(this._map);
    },
  });

  // =====================================================================
  // 次数選択コントロール
  // =====================================================================
  const MeshControl = L.Control.extend({
    options: { position: "topright" },

    initialize(layer, options) {
      L.Util.setOptions(this, options);
      this._layer = layer;
    },

    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar mesh-control");
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);

      const select = L.DomUtil.create("select", "", div);
      select.setAttribute("aria-label", "地域メッシュの次数");
      for (let n = 1; n <= 6; n++) {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = LABELS[n];
        select.appendChild(opt);
      }
      select.value = String(this._layer.options.order);
      select.addEventListener("change", () => this._layer.setOrder(Number(select.value)));
      this._select = select;

      this._note = L.DomUtil.create("div", "mesh-note", div);
      this._layer.on("orderchange", (e) => this._update(e.order, e.selected));
      this._update(this._layer._effective, this._layer.options.order);
      return div;
    },

    _update(order, selected) {
      this._note.textContent = order < selected
        ? `表示中: ${LABELS[order]}（ズーム不足のため降格）`
        : "";
    },
  });

  return {
    codeAt,
    inDomain,
    LABELS,
    createLayer: (options) => new MeshLayer(options),
  };
})();
