"use strict";

// =====================================================================
// 地図の初期化
// =====================================================================
const map = L.map("map", L.extend({
  preferCanvas: true,
  zoomControl: false,
  zoom: 10,
  center: [35.6602488, 139.6831213],
}, L.Hash.parseHash(location.hash)));

L.control.scale({ maxWidth: 250, position: "bottomright", imperial: false }).addTo(map);
L.control.zoom({ position: "topright" }).addTo(map);

// =====================================================================
// ベースマップ
// maxNativeZoom は配信上限。地理院タイル一覧で要確認のうえ調整すること。
// =====================================================================
const GSI_ATTR =
  "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank' rel='noopener'>地理院タイル</a>";

const gsi = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
  { attribution: GSI_ATTR, maxZoom: 19, maxNativeZoom: 18 });
const gsipale = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  { attribution: GSI_ATTR, maxZoom: 19, maxNativeZoom: 18 });
const gsiblank = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png",
  { attribution: GSI_ATTR, maxZoom: 19, maxNativeZoom: 14 });
const gsiphoto = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
  { attribution: GSI_ATTR, maxZoom: 19, maxNativeZoom: 18 });
const gsiinei = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png",
  { attribution: GSI_ATTR, maxZoom: 19, maxNativeZoom: 16 });

const osmjp = L.tileLayer("https://tile.openstreetmap.jp/{z}/{x}/{y}.png", {
  attribution: "&copy; <a href='https://osm.org/copyright' target='_blank' rel='noopener'>OpenStreetMap</a> contributors",
  maxZoom: 19,
});

const opentopomap = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  subdomains: "abc",
  maxZoom: 17,
  attribution:
    "Kartendaten: &copy; <a href='https://openstreetmap.org/copyright' target='_blank' rel='noopener'>OpenStreetMap</a>-Mitwirkende, SRTM | " +
    "Kartendarstellung: &copy; <a href='https://opentopomap.org/' target='_blank' rel='noopener'>OpenTopoMap</a> " +
    "(<a href='https://creativecommons.org/licenses/by-sa/3.0/' target='_blank' rel='noopener'>CC-BY-SA</a>)",
});

const mierunemono = L.tileLayer("https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution:
    "Map tiles by <a href='https://mierune.co.jp' target='_blank' rel='noopener'>MIERUNE</a>, under " +
    "<a href='https://creativecommons.org/licenses/by/4.0/' target='_blank' rel='noopener'>CC BY 4.0</a> &mdash; " +
    "Map data &copy; <a href='https://openstreetmap.org' target='_blank' rel='noopener'>OpenStreetMap</a> contributors, under ODbL",
});

// 空のタイル URL はページ自身を取得しにいくため、空レイヤで代替する
const blankbase = L.layerGroup([]);

// =====================================================================
// 標準地域2次メッシュ（オーバーレイ追加時に遅延読込）
// 2-H で計算生成に置き換える予定。差し替えるのはこのローダのみ。
// =====================================================================
const meshLayer = L.geoJSON(null, {
  attribution:
    "<a href='https://www.geospatial.jp/ckan/dataset/biodic-mesh' target='_blank' rel='noopener'>環境省自然環境局生物多様性センター作成データ</a>" +
    "をもとに加工して作成。ライセンス：" +
    "<a href='https://www.digital.go.jp/resources/open_data/public_data_license_v1.0' target='_blank' rel='noopener'>政府標準利用規約</a>",
  style: { color: "#1e90ff", opacity: 0.5, fillColor: "#87cefa", fillOpacity: 0.2 },
  onEachFeature: (feature, layer) => {
    layer.bindPopup("メッシュ番号 " + feature.properties.Name);
  },
});

let meshLoaded = false;
meshLayer.on("add", async () => {
  if (meshLoaded) return;
  meshLoaded = true;
  try {
    const res = await fetch("./data/hyoujun_mesh.geojson");
    if (!res.ok) throw new Error("HTTP " + res.status);
    meshLayer.addData(await res.json());
  } catch (err) {
    meshLoaded = false;
    console.error("メッシュデータの読み込みに失敗しました:", err);
  }
});

// =====================================================================
// MS AI Road Detections
// =====================================================================
// 方位を巡回的な色に対応させる。周期が 90 度なのは、
// 直交する街路を同一の格子方位として扱うため。
const BEARING_COLORS = [
  "#ff0000", "#ff7f00", "#ffff00", "#7fff00",
  "#00ff00", "#00ff7f", "#00ffff", "#007fff",
  "#0000ff", "#7f00ff", "#ff00ff", "#ff007f",
];

function bearingColor(deg) {
  if (!Number.isFinite(deg)) return "#000000";
  return BEARING_COLORS[Math.floor((deg + 3.75) / 7.5) % BEARING_COLORS.length];
}

class BearingLineSymbolizer {
  draw(context, geom, z, feature) {
    context.beginPath();
    context.strokeStyle = bearingColor(feature.props["hougaku"]);
    for (const poly of geom) {
      poly.forEach((pt, i) => (i === 0 ? context.moveTo(pt.x, pt.y) : context.lineTo(pt.x, pt.y)));
    }
    context.stroke();
  }
}

const MSAIRD_URL = "https://tile.shayato.net/Road/{z}/{x}/{y}.mvt";
const MSAIRD_LAYER = "BingMapRoadDat_FeaturesToJSOV2";
const MSAIRD_ATTR =
  "Map tiles by Ginnannman, under " +
  "<a href='https://opendatacommons.org/licenses/odbl/' target='_blank' rel='noopener'>ODbL</a>. " +
  "Data by <a href='https://github.com/microsoft/RoadDetections' target='_blank' rel='noopener'>Microsoft</a>.";

const msRoadBearing = protomapsL.leafletLayer({
  url: MSAIRD_URL,
  maxDataZoom: 10,          // 配信タイルの最大ズーム。実際の値に合わせること
  devicePixelRatio: window.devicePixelRatio || 1,
  attribution: MSAIRD_ATTR,
  paintRules: [{ dataLayer: MSAIRD_LAYER, symbolizer: new BearingLineSymbolizer() }],
});

const msRoadPlain = protomapsL.leafletLayer({
  url: MSAIRD_URL,
  maxDataZoom: 10,
  devicePixelRatio: window.devicePixelRatio || 1,
  attribution: MSAIRD_ATTR,
  paintRules: [{
    dataLayer: MSAIRD_LAYER,
    symbolizer: new protomapsL.LineSymbolizer({ color: "steelblue" }),
  }],
});

// =====================================================================
// Wikidata レイヤ
// =====================================================================
class LRUCache {
  constructor(limit = 100) {
    this.limit = limit;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return null;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.limit) this.map.delete(this.map.keys().next().value);
    this.map.set(key, val);
  }
}

const queryCache = new LRUCache(100);
const wikidataGroup = L.layerGroup([], {
  attribution: "Powered by <a href='https://www.wikidata.org/' target='_blank' rel='noopener'>Wikidata</a>",
});

const searchBox = document.getElementById("wikidataSearchBox");
const filterInput = document.getElementById("wikidataFilterInput");
const suggestList = document.getElementById("wikidataSuggestList");

let filterQID = null;
let inflight = null;

function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

async function fetchSuggest(text) {
  const url = "https://www.wikidata.org/w/api.php"
    + "?action=wbsearchentities&search=" + encodeURIComponent(text)
    + "&language=ja&format=json&origin=*";
  try {
    const data = await (await fetch(url)).json();
    return (data.search || [])
      .filter((item) => /^Q[1-9][0-9]*$/.test(item.id))   // QID を検証
      .map((item) => ({ label: item.label, id: item.id }));
  } catch (err) {
    console.error("Wikidata 検索に失敗しました:", err);
    return [];
  }
}

function showSuggest(results) {
  suggestList.replaceChildren();
  if (!results.length) {
    suggestList.style.display = "none";
    return;
  }
  suggestList.style.display = "block";
  for (const item of results) {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.addEventListener("click", () => {
      filterInput.value = item.label;
      filterQID = item.id;
      suggestList.style.display = "none";
      fetchWikidata();
    });
    suggestList.appendChild(li);
  }
}

filterInput.addEventListener("input", debounce(async () => {
  const text = filterInput.value.trim();
  if (!text) {
    filterQID = null;
    suggestList.style.display = "none";
    fetchWikidata();
    return;
  }
  showSuggest(await fetchSuggest(text));
}, 300));

filterInput.addEventListener("blur", () => {
  setTimeout(() => (suggestList.style.display = "none"), 200);
});

const fetchWikidata = debounce(function () {
  if (!map.hasLayer(wikidataGroup)) return;

  const bounds = map.getBounds();
  const zoom = map.getZoom();
  let limit = 1000;
  if (zoom < 10) limit = 200;
  if (zoom < 7) limit = 50;

  // ズームと絞り込み条件をキーに含める。含めないと絞り込みが効かない
  const key = [
    zoom, filterQID || "-",
    bounds.getWest().toFixed(4), bounds.getSouth().toFixed(4),
    bounds.getEast().toFixed(4), bounds.getNorth().toFixed(4),
  ].join("|");

  const cached = queryCache.get(key);
  if (cached) {
    renderMarkers(cached);
    return;
  }

  const filterClause = filterQID ? `?place (wdt:P31/wdt:P279*) wd:${filterQID}.` : "";
  // 注意: ORDER BY を置いていないため、LIMIT で切られる集合は非決定的である
  const sparql = `
    SELECT ?place ?placeLabel ?location WHERE {
      SERVICE wikibase:box {
        ?place wdt:P625 ?location.
        bd:serviceParam wikibase:cornerWest "Point(${bounds.getWest()} ${bounds.getNorth()})"^^geo:wktLiteral.
        bd:serviceParam wikibase:cornerEast "Point(${bounds.getEast()} ${bounds.getSouth()})"^^geo:wktLiteral.
      }
      ${filterClause}
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "ja,en,fr,de,nl,ru,es,it,pt,zh,ko,id".
      }
    }
    LIMIT ${limit}
  `;

  if (inflight) inflight.abort();
  inflight = new AbortController();

  fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: {
      "Content-Type": "application/sparql-query",
      "Accept": "application/sparql-results+json",
    },
    body: sparql,
    signal: inflight.signal,
  })
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((json) => {
      queryCache.set(key, json);
      renderMarkers(json);
    })
    .catch((err) => {
      if (err.name !== "AbortError") console.error("Wikidata SPARQL エラー:", err);
    });
}, 400);

// ラベルは Wikidata 上で誰でも編集できる自由文字列なので、
// HTML を組み立てず DOM ノードとして渡す
function renderMarkers(json) {
  wikidataGroup.clearLayers();
  for (const x of json.results.bindings) {
    const m = /^Point\(([-\d.eE+]+) ([-\d.eE+]+)\)$/.exec(x.location.value);
    if (!m) continue;
    const lon = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    const box = document.createElement("div");
    box.className = "wikidata";

    const a = document.createElement("a");
    if (/^https?:\/\//.test(x.place.value)) a.href = x.place.value;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = x.placeLabel ? x.placeLabel.value : x.place.value;
    box.appendChild(a);

    L.marker([lat, lon], {
      icon: L.divIcon({ html: box, className: "wikidata", iconSize: [10, 10], iconAnchor: [5, 10] }),
      riseOnHover: true,
    }).addTo(wikidataGroup);
  }
}

// 購読は add / remove で対称に。二重登録と、非表示中の無駄なクエリを防ぐ
wikidataGroup.on("add", () => {
  searchBox.style.display = "block";
  map.on("moveend", fetchWikidata);
  fetchWikidata();
});

wikidataGroup.on("remove", () => {
  searchBox.style.display = "none";
  map.off("moveend", fetchWikidata);
  if (inflight) inflight.abort();
  wikidataGroup.clearLayers();
});

// =====================================================================
// レイヤコントロール
// =====================================================================
const baseMaps = {
  "地理院地図": gsi,
  "地理院 淡色地図": gsipale,
  "地理院 白地図": gsiblank,
  "地理院 写真": gsiphoto,
  "地理院 陰影起伏図": gsiinei,
  "オープンストリートマップ（日本）": osmjp,
  "オープントポマップ": opentopomap,
  "MIERUNE 白地図": mierunemono,
  "ベースマップなし": blankbase,
};

const overlays = {
  "wikidata": wikidataGroup,
  "標準地域2次メッシュ": meshLayer,
  "MS道路データ（単色）": msRoadPlain,
  "MS道路データ（方位別）": msRoadBearing,
};

L.control.layers(baseMaps, overlays, { collapsed: false, position: "topleft" }).addTo(map);
gsi.addTo(map);

L.control.mapCenterCoord({
  position: "bottomleft", onMove: true, latlngFormat: "DMS", latlngDesignators: true,
}).addTo(map);

L.hash(map);
