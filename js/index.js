var map = L.map('map', L.extend({
    preferCanvas:true,
    zoomControl:false,
    zoom: 10,
    center: [35.6602488,139.6831213],
  }, L.Hash.parseHash(location.hash)));

  L.control.scale({ maxWidth:250, position:'bottomright', imperial:false }).addTo(map);
  L.control.zoom({position:'topright'}).addTo(map);

  //地図タイル
  var gsi =L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', 
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var gsipale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var gsiblank = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png',
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var gsiphoto = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var gsiinei = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var osmjp = L.tileLayer('https://tile.openstreetmap.jp/{z}/{x}/{y}.png',
    {  attribution: "<a href='https://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors" });
  var opentopomap = L.tileLayer('https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    {attribution: "Kartendaten: ©<a href='https://openstreetmap.org/copyright' OpenStreetMap</a> -Mitwirkende, SRTM | Kartendarstellung: © <a href='http://opentopomap.org/'>OpenTopoMap</a> ( <a href='https://creativecommons.org/licenses/by-sa/3.0/'> CC-BY-SA</a>)"})
  var mierunemono = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',
    {attribution:  "Map tiles by <a href='http://mierune.co.jp' target='_blank'>MIERUNE</a>,under <a href='https://creativecommons.org/licenses/by/4.0/' target='_blank'>CC BY 4.0</a> &mdash; Mapdata: &copy; <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a>contributors, under ODbL</a>"});
  // var stamen = L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
  //   {attribution: "Map tiles by <a href='http://stamen.com' target='_blank'>Stamen Design</a>, under <a href='http://creativecommons.org/licenses/by/3.0' target='_blank'>CC BY 3.0</a>. Data by <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a>, under <a href='http://www.openstreetmap.org/copyright' target='_blank'>ODbL</a>."})
  var blankbase = L.tileLayer('');
  

  //標準地域二次メッシュ
  $.getJSON("./data/hyoujun_mesh.geojson", function(data){
    hyoujun_mesh2 = L.geoJson(data,{
      onEachFeature: function(feature,layer){
        layer.bindPopup("メッシュ番号"+feature.properties.Name);
      },
      attribution: "<a href='https://www.geospatial.jp/ckan/dataset/biodic-mesh/resource/d9e78516-6ba5-4863-bfcd-31326f8984db?inner_span=True'>環境省自然環境局生物多様性センター作成データ</a>をもとに加工して作成。ライセンス：<a href='https://www.env.go.jp/mail.html'>政府標準利用規約</a>",
      style: {
        "color":'#1e90ff',
        "opacity": 0.5,
        "fillColor": '#87cefa',
        "fillOpacity": 0.2
      }
    });
    LayerControl.addOverlay(hyoujun_mesh2,"標準地域2次メッシュ");
    
  });

  // --------------------------------------
// Wikidata LRU キャッシュ（最大100件）
// --------------------------------------
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
    else if (this.map.size >= this.limit) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, val);
  }
}
const queryCache = new LRUCache(100);

// Wikidata レイヤー
var group = L.layerGroup([],
  { attribution: "Powered by <a href='https://www.wikidata.org/' target='_blank'>Wikidata</a>" }
);

if (location.search.match(/^\?([a-zA-Z_]+)$/)) lang = RegExp.$1;

function OnLayerAdded() {
let wikidataFilterQID = null;

const filterInput = document.getElementById("wikidataFilterInput");
const suggestList = document.getElementById("wikidataSuggestList");

  // debounce 関数
  function debounce(func, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), wait);
    };
  }
async function fetchSuggest(text) {
  if (!text) return [];

  const url =
    `https://www.wikidata.org/w/api.php` +
    `?action=wbsearchentities&search=${encodeURIComponent(text)}` +
    `&language=ja&format=json&origin=*`;

  const data = await fetch(url).then(r => r.json()).catch(() => null);

  if (!data || !data.search) return [];
  return data.search.map(item => ({ label: item.label, id: item.id }));
}


// ------------------------------
// 2. サジェスト描画
// ------------------------------
function showSuggest(results) {
  suggestList.innerHTML = "";
  if (!results.length) {
    suggestList.style.display = "none";
    return;
  }

  suggestList.style.display = "block";

  results.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.label;

    li.addEventListener("click", () => {
      filterInput.value = item.label;
      wikidataFilterQID = item.id;
      suggestList.style.display = "none";

      // フィルタ変更 → 再取得
      if (group._map) group._map.fire("moveend");
    });

    suggestList.appendChild(li);
  });
}


// ------------------------------
// 3. 入力イベント（候補表示）
// ------------------------------
filterInput.addEventListener(
  "input",
  debounce(async () => {
    const text = filterInput.value.trim();

    // 入力が空 → フィルタ解除
    if (!text) {
      wikidataFilterQID = null;
      suggestList.style.display = "none";
      if (group._map) group._map.fire("moveend");
      return;
    }

    const results = await fetchSuggest(text);
    showSuggest(results);
  }, 300)
);

filterInput.addEventListener("blur", () => {
  setTimeout(() => (suggestList.style.display = "none"), 200);
});

    function buildFilterClause() {
  if (!wikidataFilterQID) return "";
  return `
    ?place (wdt:P31/wdt:P279*) wd:${wikidataFilterQID}.
  `;
}
  // ==== Wikidata取得処理 ====
  const fetchWikidata = debounce(function () {
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // ---- ズームレベルに応じて LIMIT を自動調整 ----
    let limit = 1000;
    if (zoom < 10) limit = 200;   // 広域 → 負荷軽減
    if (zoom < 7) limit = 50;     // さらに広域 → もっと減らす

    // キャッシュキー（bounds + limit）
    const key = `${bounds.getWest().toFixed(3)},${bounds.getSouth().toFixed(3)},${bounds.getEast().toFixed(3)},${bounds.getNorth().toFixed(3)},L=${limit}`;

    // ---- キャッシュチェック ----
    const cacheResult = queryCache.get(key);
    if (cacheResult) {
      renderMarkers(cacheResult);
      return;
    }

    var sparql = `
      SELECT ?place ?placeLabel ?location WHERE {
        SERVICE wikibase:box {
          ?place wdt:P625 ?location.
          bd:serviceParam wikibase:cornerWest "Point(${bounds.getWest()} ${bounds.getNorth()})"^^geo:wktLiteral.
          bd:serviceParam wikibase:cornerEast "Point(${bounds.getEast()} ${bounds.getSouth()})"^^geo:wktLiteral.
        }
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "ja,en,fr,de,nl,ru,es,it,pt,zh,ko,id".
        }
        ${buildFilterClause()}
      }
      LIMIT ${limit}
    `;

    // ---- Fetch ----
    fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json"
      },
      body: sparql
    })
      .then(r => r.json())
      .then(json => {
        queryCache.set(key, json);
        renderMarkers(json);
      })
      .catch(err => console.error("Wikidata SPARQL Error:", err));

  }, 400); // デバウンス 400ms

  // ---- マーカーを描画する関数 ----
  function renderMarkers(json) {
    group.clearLayers();
    json.results.bindings.forEach(x => {
      if (x.location.value.match(/^Point\((.+) (.+)\)$/)) {
        const lon = parseFloat(RegExp.$1);
        const lat = parseFloat(RegExp.$2);

        const wikidataIcon = L.divIcon({
          html: `<div class='wikidata'><a href='${x.place.value}' target='_blank'>${x.placeLabel.value}</a></div>`,
          className: 'wikidata',
          iconSize: [10, 10],
          iconAnchor: [5, 10]
        });

        L.marker([lat, lon], {
          icon: wikidataIcon,
          riseOnHover: true,
        }).addTo(group);
      }
    });
  }

  map.on("moveend", fetchWikidata);
  fetchWikidata();   // 初回ロード
}

// Wikidata レイヤー追加時
group.on("add", OnLayerAdded);


//MSAIRoadDetections
class ColorConverter {
  static getColorFromKakudo(kakudo) {
    let resultColor = "#000000";
    if ((kakudo >= 0 && kakudo < 3.75) || (kakudo >= 90 && kakudo < 93.75)) {
      resultColor = "#ff0000";
    } else if ((kakudo >= 3.75 && kakudo < 11.25) || (kakudo >= 93.75 && kakudo < 101.25)) {
      resultColor = "#ff7f00";
    } else if ((kakudo >= 11.25 && kakudo < 18.75) || (kakudo >= 101.25 && kakudo < 108.75)) {
      resultColor = "#ffff00";
    } else if ((kakudo >= 18.75 && kakudo < 26.25) || (kakudo >= 108.75 && kakudo < 116.25)) {
      resultColor = "#7fff00";
    } else if ((kakudo >= 26.25 && kakudo < 33.75) || (kakudo >= 116.25 && kakudo < 123.75)) {
      resultColor = "#00ff00";
    } else if ((kakudo >= 33.75 && kakudo < 41.25) || (kakudo >= 123.75 && kakudo < 131.25)) {
      resultColor = "#00ff7f";
    } else if ((kakudo >= 41.25 && kakudo < 48.75) || (kakudo >= 131.25 && kakudo < 138.75)) {
      resultColor = "#00ffff";
    } else if ((kakudo >= 48.75 && kakudo < 56.25) || (kakudo >= 138.75 && kakudo < 146.25)) {
      resultColor = "#007fff";
    } else if ((kakudo >= 56.25 && kakudo < 63.75) || (kakudo >= 146.25 && kakudo < 153.75)) {
      resultColor = "#0000ff";
    } else if ((kakudo >= 63.75 && kakudo < 71.25) || (kakudo >= 153.75 && kakudo < 161.25)) {
      resultColor = "#7f00ff";
    } else if ((kakudo >= 71.25 && kakudo < 78.75) || (kakudo >= 161.25 && kakudo < 168.75)) {
      resultColor = "#ff00ff";
    } else if ((kakudo >= 78.75 && kakudo < 86.25) || (kakudo >= 168.75 && kakudo < 176.25)) {
      resultColor = "#ff007f";
    } else if ((kakudo >= 86.25 && kakudo < 90) || (kakudo >= 176.25 && kakudo <= 180)) {
      resultColor = "#ff0000";
    }

    return resultColor;
  }
}

class MyLineSymbolizer{
    draw(context,geom,z,feature){
        var kakudo = feature.props["hougaku"];
         context.beginPath();
         context.strokeStyle = ColorConverter.getColorFromKakudo(kakudo);
            for (var poly of geom) {
            for (var p = 0; p < poly.length; p++) {
                let pt = poly[p];
                if (p == 0) context.moveTo(pt.x,pt.y);
                else context.lineTo(pt.x,pt.y);
            } 
        }
         context.stroke();
    }
}
const PAINT_RULES_COLOR = [
    {
        dataLayer:"BingMapRoadDat_FeaturesToJSOV2",
        symbolizer: new MyLineSymbolizer()
    }   
];

const PAINT_RULES_BLACK = [
    {
        dataLayer:"BingMapRoadDat_FeaturesToJSOV2",
        symbolizer: new protomapsL.LineSymbolizer({fill:"steelblue"}),
    }   
];
const PMTILES_URL = 'https://tile.shayato.net/Road/{z}/{x}/{y}.mvt';

const groupColor = L.layerGroup([], {
  MaxNativeZoom: 10,
  attribution: "Map tiles by Ginnannman, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>. Data by <a href='https://github.com/microsoft/RoadDetections'>Microsoft</a>."
});

const groupBlack = L.layerGroup([], {
  MaxNativeZoom: 10,
  attribution: groupColor.options.attribution
});

const MSAIRD_Color = protomapsL.leafletLayer({
  url: PMTILES_URL,
  paint_rules: PAINT_RULES_COLOR
}).addTo(groupColor);

const MSAIRD_Black = protomapsL.leafletLayer({
  url: PMTILES_URL,
  paint_rules: PAINT_RULES_BLACK
}).addTo(groupBlack);

  //BaseMap
  var BaseMaps = {
    "地理院地図" : gsi,
    "地理院 淡色地図" : gsipale,
    "地理院 白地図" : gsiblank,
    "地理院 写真" : gsiphoto,
    "地理院 陰影起伏図": gsiinei,
    "オープンストリートマップ（日本）" : osmjp,
    "オープントポマップ": opentopomap,
    "MIERUNE 白地図" : mierunemono,
    //"Stamen Toner（白黒地図）" : stamen,
    "ベースマップなし" : blankbase  
  };
  //OverLay
  var OverLays = {
      "wikidata": group,
      "MS道路データ（黒）": groupBlack,
      "MS道路データ（カラー・試験中）": groupColor,
  };
  var LayerControl = L.control.layers(BaseMaps, OverLays, {collapsed:false, position:'topleft'}).addTo(map);
  gsi.addTo(map); 
const wikidataSearchBox = document.getElementById("wikidataSearchBox");

// wikidataレイヤー追加時
map.on("overlayadd", function (e) {
  if (e.name === "wikidata") {
    wikidataSearchBox.style.display = "block"; // 表示
  }
});

// レイヤー削除時
map.on("overlayremove", function (e) {
  if (e.name === "wikidata") {
    wikidataSearchBox.style.display = "none";  // 非表示
  }
});
  
  //中心十字・座標
  L.control.mapCenterCoord({position:'bottomleft', onMove:true, latlngFormat:'DMS', latlngDesignators:true}).addTo(map);

  //URLハッシュ
  L.hash(map);

 
