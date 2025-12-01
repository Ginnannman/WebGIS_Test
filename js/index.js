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
  var stamen = L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    {attribution: "Map tiles by <a href='http://stamen.com' target='_blank'>Stamen Design</a>, under <a href='http://creativecommons.org/licenses/by/3.0' target='_blank'>CC BY 3.0</a>. Data by <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a>, under <a href='http://www.openstreetmap.org/copyright' target='_blank'>ODbL</a>."})
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

  //wikidata
var group = L.layerGroup([],
  { attribution: "Powered by <a href='https://www.wikidata.org/' target='_blank'>Wikidata</a>" }
);

if (location.search.match(/^\?([a-zA-Z_]+)$/)) lang = RegExp.$1;

function OnLayerAdded() {

  // ---- debounce 関数 ----
  function debounce(func, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ==== Wikidata ロード処理（デバウンス付き） ====
  const fetchWikidata = debounce(function () {
    var bounds = map.getBounds();

    var sparql = `
      SELECT ?place ?placeLabel ?location WHERE {
        SERVICE wikibase:box {
          ?place wdt:P625 ?location.
          bd:serviceParam wikibase:cornerWest "Point(${bounds.getWest()} ${bounds.getNorth()})"^^geo:wktLiteral.
          bd:serviceParam wikibase:cornerEast "Point(${bounds.getEast()} ${bounds.getSouth()})"^^geo:wktLiteral.
        }
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "ja,en,de,fr,nl,ru,es,it,arz,pl,vi,war,ceb,sv,ar,uk,pt,zh,ko,id".
        }
      }
      LIMIT 1000
    `;

    // markers リセット
    group.clearLayers();

    fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        "Accept": "application/sparql-results+json"
      },
      body: sparql
    })
      .then(res => res.json())
      .then(data => {
        data.results.bindings.forEach(x => {
          if (x.location.value.match(/^Point\((.+) (.+)\)$/)) {
            var lon = parseFloat(RegExp.$1);
            var lat = parseFloat(RegExp.$2);

            var wikidataIcon = L.divIcon({
              html: "<div class='wikidata'><a href='" + x.place.value + "' target='_blank'>" + x.placeLabel.value + "</a></div>",
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
      })
      .catch(err => {
        console.error("Wikidata SPARQL Error:", err);
      });

  }, 300); // ← ここでデバウンス時間設定（300ms）


  // viewport 移動後にデータ読み込み
  map.on("moveend", fetchWikidata);

  // 初回ロード時も実行
  fetchWikidata();
}


// Wikidata レイヤー追加時に実行
group.on('add', function () {
  OnLayerAdded();
});

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
let PAINT_RULES = [
    {
        dataLayer:"BingMapRoadDat_FeaturesToJSOV2",
        symbolizer: new MyLineSymbolizer()
    }   
];

var group2 = L.layerGroup([],
    {MaxNativeZoom:10,attribution:"Map tiles by Ginnannman, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>. Data by <a href='https://github.com/microsoft/RoadDetections'>Microsoft</a>, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>."}
    ); 
group2.clearLayers();
var MSAIRD_l = protomapsL.leafletLayer({
        url: 'https://tile.shayato.net/Road/{z}/{x}/{y}.mvt',
        paint_rules:PAINT_RULES,
        }).addTo(group2);
   // layerControl.addOverlay(MSAIRD_l,"MS道路データ");

let PAINT_RULES2 = [
    {
        dataLayer:"BingMapRoadDat_FeaturesToJSOV2",
        symbolizer: new protomapsL.LineSymbolizer({fill:"steelblue"}),
    }   
];
var group3 = L.layerGroup([],
    {MaxNativeZoom:10,attribution:"Map tiles by Ginnannman, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>. Data by <a href='https://github.com/microsoft/RoadDetections'>Microsoft</a>, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>."}
    ); 
group3.clearLayers();
var MSAIRD_2 = protomapsL.leafletLayer({
        url: 'https://tile.shayato.net/Road/{z}/{x}/{y}.mvt',
        paint_rules:PAINT_RULES2,
        }).addTo(group3);


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
    "Stamen Toner（白黒地図）" : stamen,
    "ベースマップなし" : blankbase  
  };
  //OverLay
  var OverLays = {
      "wikidata": group,
      "MS道路データ（黒）": group3,
      "MS道路データ（カラー・試験中）": group2,
  };
  var LayerControl = L.control.layers(BaseMaps, OverLays, {collapsed:false, position:'topleft'}).addTo(map);
  gsi.addTo(map); 
  
  //中心十字・座標
  L.control.mapCenterCoord({position:'bottomleft', onMove:true, latlngFormat:'DMS', latlngDesignators:true}).addTo(map);

  //URLハッシュ
  L.hash(map);

 
