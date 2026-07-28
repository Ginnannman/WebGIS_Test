"use strict";

/* 方位を扱う共通モジュール。
 * 街路・建物の方位は 90 度周期の軸データ（axial data）として扱う。
 * 直交する要素を同一の格子方位とみなすため。          */
const Bearing = (function () {

  const COLORS = [
    "#ff0000", "#ff7f00", "#ffff00", "#7fff00",
    "#00ff00", "#00ff7f", "#00ffff", "#007fff",
    "#0000ff", "#7f00ff", "#ff00ff", "#ff007f",
  ];
  const STEP = 90 / COLORS.length;   // 7.5 度

  function color(deg) {
    if (!Number.isFinite(deg)) return "#888888";
    return COLORS[Math.floor((deg + STEP / 2) / STEP) % COLORS.length];
  }

  // タイル座標は y が下向き。真北基準に直したうえで 0–90 度に畳む
  function ofSegment(a, b) {
    const deg = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;
    return ((deg % 90) + 90) % 90;
  }

  /* 環（リング）群の辺長重み付き円周平均。
   * 周期 90 度なので角度を 4 倍して単位円上に写し、平均後に 4 で割る。 */
  function axialMean(rings) {
    let sx = 0, sy = 0;
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const w = Math.hypot(dx, dy);
        if (w === 0) continue;
        const phi = 4 * ofSegment(a, b) * Math.PI / 180;
        sx += w * Math.cos(phi);
        sy += w * Math.sin(phi);
      }
    }
    if (sx === 0 && sy === 0) return NaN;
    let deg = Math.atan2(sy, sx) * 180 / Math.PI / 4;
    return ((deg % 90) + 90) % 90;
  }

  // 凡例用の色相環（0–90 度を扇形で表示）
  function wheel(size = 74) {
    const r = size / 2, ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    for (let i = 0; i < COLORS.length; i++) {
      for (const turn of [0, 90, 180, 270]) {   // 90 度周期を 4 回繰り返す
        const a0 = (i * STEP + turn - 90) * Math.PI / 180;
        const a1 = ((i + 1) * STEP + turn - 90) * Math.PI / 180;
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d",
          `M${r},${r} L${r + r * Math.cos(a0)},${r + r * Math.sin(a0)} ` +
          `A${r},${r} 0 0 1 ${r + r * Math.cos(a1)},${r + r * Math.sin(a1)} Z`);
        p.setAttribute("fill", COLORS[i]);
        svg.appendChild(p);
      }
    }
    return svg;
  }

  return { color, ofSegment, axialMean, wheel, COLORS };
})();
