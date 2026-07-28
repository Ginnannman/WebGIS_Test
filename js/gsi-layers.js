"use strict";

const GsiVector = (function () {

  const URL = "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles";
  const MAX_DATA_ZOOM = 16;
  const ATTR = "<a href='https://github.com/gsi-cyberjapan/optimal_bvmap' " +
               "target='_blank' rel='noopener'>国土地理院最適化ベクトルタイル</a>";

  /* 建築物レイヤは levelDiff: 0 で読むため、ジオメトリの正規化幅は
   * 256 << 0 = 256 になる。道路レイヤ（既定の levelDiff: 1）は 512。
   * クリップ辺の判定はポリゴンでしか要らないので、建物側の値だけ持つ。 */
  const BLD_TILE_SPAN = 256;
  const GRID = 4;
  const CELL = BLD_TILE_SPAN / GRID;

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

  // ---- 道路中心線：方位塗り分け（線分単位）------------------------------
  // 線を切断しても各線分の向きは変わらないので、クリップ辺の考慮は不要
  class SegmentBearingSymbolizer {
    draw(context, geom) {
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

  // ---- 建築物：長軸方位塗り分け（ズーム 16 以上）-------------------------
  class FootprintBearingSymbolizer {
    draw(context, geom) {
      context.beginPath();
      for (const ring of geom) {
        ring.forEach((pt, i) => (i === 0 ? context.moveTo(pt.x, pt.y) : context.lineTo(pt.x, pt.y)));
        context.closePath();
      }
      context.fillStyle = Bearing.color(Bearing.axialMean(geom, BLD_TILE_SPAN));
      context.fill("evenodd");
    }
  }

  // ---- 建築物：ズーム 15 以下の集計表示 ----------------------------------
  // タイル 1 枚を GRID×GRID に区切り、卓越方位を色、集中度を不透明度で示す
  class OrientationAccumulator {
    constructor() { this.cells = new Map(); }
    before() { this.cells.clear(); }
    draw(context, geom, z, feature) {
      const b = feature.bbox;
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      if (cx < 0 || cy < 0 || cx >= BLD_TILE_SPAN || cy >= BLD_TILE_SPAN) return;
      const key = Math.floor(cy / CELL) * GRID + Math.floor(cx / CELL);
      let c = this.cells.get(key);
      if (!c) { c = { sx: 0, sy: 0, w: 0, n: 0 }; this.cells.set(key, c); }
      Bearing.accumulate(geom, c, BLD_TILE_SPAN);
      c.n++;
    }
  }

  class OrientationGrid {
    constructor(acc) { this.acc = acc; }
    before(context) {
      for (const [key, c] of this.acc.cells) {
        if (c.n < 5 || c.w === 0) continue;
        const R = Math.hypot(c.sx, c.sy) / c.w;     // 集中度 0–1
        context.globalAlpha = 0.20 + 0.70 * R;
        context.fillStyle = Bearing.color(Bearing.fromSums(c.sx, c.sy));
        context.fillRect((key % GRID) * CELL, Math.floor(key / GRID) * CELL, CELL, CELL);
      }
      context.globalAlpha = 1;
    }
    draw() {}
  }

  // ---- レイヤ生成 --------------------------------------------------------
  function roadLayer(symbolizer) {
    return protomapsL.leafletLayer({
      url: URL,
      maxDataZoom: MAX_DATA_ZOOM,
      devicePixelRatio: window.devicePixelRatio || 1,
      attribution: ATTR,
      paintRules: [{ dataLayer: "RdCL", symbolizer: symbolizer }],
    });
  }

  return {
    roadsByCategory: () => roadLayer(new CategorySymbolizer()),

    roadsByBearing: () =>
      Bearing.attachAttribution(roadLayer(new SegmentBearingSymbolizer())),

    buildingsByBearing: () => {
      const acc = new OrientationAccumulator();
      return Bearing.attachAttribution(protomapsL.leafletLayer({
        url: URL,
        maxDataZoom: MAX_DATA_ZOOM,
        levelDiff: 0,                     // 地理院デモと同じデータズームを要求する
        devicePixelRatio: window.devicePixelRatio || 1,
        attribution: ATTR,
        paintRules: [
          { dataLayer: "BldA", symbolizer: acc,                              maxzoom: 15 },
          { dataLayer: "BldA", symbolizer: new OrientationGrid(acc),         maxzoom: 15 },
          { dataLayer: "BldA", symbolizer: new FootprintBearingSymbolizer(), minzoom: 16 },
        ],
      }));
    },

    CATEGORY,
  };
})();
