"use strict";

/* URL ハッシュに地図の状態を保存する（leaflet-hash の置き換え）。
 * 形式: #zoom/lat/lon/表示中レイヤのキー/メッシュ次数        */
const UrlState = (function () {

  let map = null, overlays = {}, meshLayer = null;

  function read() {
    const p = location.hash.replace(/^#/, "").split("/");
    const zoom = parseFloat(p[0]), lat = parseFloat(p[1]), lon = parseFloat(p[2]);
    if (![zoom, lat, lon].every(Number.isFinite)) return null;
    return {
      zoom, center: [lat, lon],
      on: (p[3] || "").split(",").filter(Boolean),
      meshOrder: Number(p[4]) || null,
    };
  }

  function apply(s) {
    map.setView(s.center, s.zoom);
    for (const [key, layer] of Object.entries(overlays)) {
      const want = s.on.includes(key);
      if (want && !map.hasLayer(layer)) map.addLayer(layer);
      if (!want && map.hasLayer(layer)) map.removeLayer(layer);
    }
    if (s.meshOrder && meshLayer) meshLayer.setOrder(s.meshOrder);
  }

  function write() {
    const c = map.getCenter(), z = map.getZoom();
    const digits = Math.max(2, Math.ceil(z / 2));
    const on = Object.entries(overlays)
      .filter(([, l]) => map.hasLayer(l))
      .map(([k]) => k);
    let hash = `#${z}/${c.lat.toFixed(digits)}/${c.lng.toFixed(digits)}/${on.join(",")}`;
    if (meshLayer && map.hasLayer(meshLayer)) hash += `/${meshLayer.options.order}`;
    // replaceState は hashchange を発火しないので、書き戻しの循環は起きない
    history.replaceState(null, "", hash);
  }

  function init(m, overlayMap, mesh) {
    map = m; overlays = overlayMap; meshLayer = mesh || null;
    const s = read();
    if (s) apply(s);
    map.on("moveend overlayadd overlayremove", write);
    if (meshLayer) meshLayer.on("orderchange", write);
    window.addEventListener("hashchange", () => { const t = read(); if (t) apply(t); });
    write();
  }

  return { init };
})();
