"use strict";

/* 方位を扱う共通モジュール。
 * 街路・建物の方位は 90 度周期の軸データ（axial data）として扱う。
 * 直交する要素を同一の格子方位とみなすため。                        */
const Bearing = (function () {

  /* CET 巡回カラーマップ（Peter Kovesi）を 12 区分のビン中心で標本化。
   * colorcet 3.2.1 より取得。CC BY 4.0。
   * 既定の C10 は等輝度（L*=67）で、特定の方位帯だけが目立つことがない。 */
  const PALETTES = {
    C10: [   // circle_mgbm_67_c31
      "#d3947a", "#be9d6e", "#a4a66d", "#85ad7c",
      "#66b197", "#48b2b4", "#49afcb", "#71a8d6",
      "#989fd7", "#bb96c8", "#d190ae", "#da8e92",
    ],
    C6s: [   // cyclic_rygcbmr_50_90_c64_s25。高彩度が要るとき
      "#d8b7ff", "#ffa2b4", "#ff5045", "#f95906",
      "#ffb300", "#cccc00", "#68a506", "#2ca751",
      "#2fdbbb", "#2dd7fd", "#2894ff", "#7a89ff",
    ],
  };

  const COLORS = PALETTES.C10;      // ここ一箇所で全レイヤの配色が決まる
  const STEP = 90 / COLORS.length;  // 7.5 度
  const EDGE_EPS = 0.01;

  const ATTRIBUTION =
    "配色: <a href='https://colorcet.com/' target='_blank' rel='noopener'>" +
    "CET perceptually uniform colour maps</a> (Kovesi 2015, CC BY 4.0)";

  function color(deg) {
    if (!Number.isFinite(deg)) return "#555555";
    return COLORS[Math.floor((deg + STEP / 2) / STEP) % COLORS.length];
  }

  // タイル座標は y が下向き。真北基準に直したうえで 0–90 度に畳む
  function ofSegment(a, b) {
    const deg = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI;
    return ((deg % 90) + 90) % 90;
  }

  /* MVT のクリップで生じた辺はタイル矩形の境界上か外側にあり、
   * x か y が一定になる。実在する壁がこの座標に厳密に一致することは
   * まずないので、除外して差し支えない。span は正規化幅
   * （protomaps-leaflet では 256 << levelDiff）。                  */
  function isClipEdge(a, b, span) {
    if (a.x === b.x && (a.x <= EDGE_EPS || a.x >= span - EDGE_EPS)) return true;
    if (a.y === b.y && (a.y <= EDGE_EPS || a.y >= span - EDGE_EPS)) return true;
    return false;
  }

  // rings の辺を acc（{sx, sy, w}）に加算する
  function accumulate(rings, acc, span) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        if (isClipEdge(a, b, span)) continue;
        const w = Math.hypot(b.x - a.x, b.y - a.y);
        if (w === 0) continue;
        const phi = 4 * ofSegment(a, b) * Math.PI / 180;
        acc.sx += w * Math.cos(phi);
        acc.sy += w * Math.sin(phi);
        acc.w += w;
        acc.n = (acc.n || 0) + 0;   // n は呼び出し側で数える
      }
    }
  }

  // 周期 90 度なので角度を 4 倍して単位円上に写し、平均後に 4 で割る
  function fromSums(sx, sy) {
    if (sx === 0 && sy === 0) return NaN;
    const deg = Math.atan2(sy, sx) * 180 / Math.PI / 4;
    return ((deg % 90) + 90) % 90;
  }

  function axialMean(rings, span) {
    const acc = { sx: 0, sy: 0, w: 0 };
    accumulate(rings, acc, span);
    if (acc.w === 0) return NaN;
    return fromSums(acc.sx, acc.sy);
  }

  // 凡例用の色相環（90 度周期を 4 回繰り返して一周させる）
  function wheel(size = 74) {
    const r = size / 2, ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    for (let i = 0; i < COLORS.length; i++) {
      for (const turn of [0, 90, 180, 270]) {
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

  /* 方位配色を使うレイヤに出典表示を結び付ける。
   * 表示中だけ出典が出て、複数レイヤで重複しない。 */
  function attachAttribution(layer) {
    let bound = null;
    layer.on("add", (e) => {
      bound = e.target._map;
      if (bound && bound.attributionControl) {
        bound.attributionControl.addAttribution(ATTRIBUTION);
      }
    });
    layer.on("remove", () => {
      if (bound && bound.attributionControl) {
        bound.attributionControl.removeAttribution(ATTRIBUTION);
      }
      bound = null;
    });
    return layer;
  }

  return { color, ofSegment, accumulate, fromSums, axialMean,
           wheel, attachAttribution, ATTRIBUTION, COLORS, PALETTES };
})();
