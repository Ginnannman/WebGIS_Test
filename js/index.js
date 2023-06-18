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
  var gisphoto = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    {attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"});
  var osmjp = L.tileLayer('https://tile.openstreetmap.jp/{z}/{x}/{y}.png',
    {  attribution: "<a href='https://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors" });
  var opentopomap = L.tileLayer('https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    {attribution: "Kartendaten: ©<a href='https://openstreetmap.org/copyright' OpenStreetMap</a> -Mitwirkende, SRTM | Kartendarstellung: © <a href='http://opentopomap.org/'>OpenTopoMap</a> ( <a href='https://creativecommons.org/licenses/by-sa/3.0/'> CC-BY-SA</a>)"})
  var mierunemono = L.tileLayer('https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',
    {attribution:  "Map tiles by <a href='http://mierune.co.jp' target='_blank'>MIERUNE</a>,under <a href='https://creativecommons.org/licenses/by/4.0/' target='_blank'>CC BY 4.0</a> &mdash; Mapdata: &copy; <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a>contributors, under ODbL</a>"});
  var stamen = L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    {attribution: "Map tiles by <a href='http://stamen.com' target='_blank'>Stamen Design</a>, under <a href='http://creativecommons.org/licenses/by/3.0' target='_blank'>CC BY 3.0</a>. Data by <a href='http://openstreetmap.org' target='_blank'>OpenStreetMap</a>, under <a href='http://www.openstreetmap.org/copyright' target='_blank'>ODbL</a>."})
  
  

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
    {attribution: "Powered by<a href= 'https://www.wikidata.org/' target='_blank'>Wikidata</a>"}
    );
    if (location.search.match(/^\?([a-zA-Z_]+)$/)) lang = RegExp.$1;

  function OnLayerAdded() {
  map.on("moveend", function() {
    var bounds = map.getBounds();
    var sparql =
              `SELECT ?place ?placeLabel ?location WHERE {
      SERVICE wikibase:box {
      ?place wdt:P625 ?location.
      bd:serviceParam wikibase:cornerWest "Point(${bounds.getWest()} ${bounds.getNorth()})"^^geo:wktLiteral.
      bd:serviceParam wikibase:cornerEast "Point(${bounds.getEast()} ${bounds.getSouth()})"^^geo:wktLiteral.
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en,de,fr,nl,ru,es,it,arz,pl,vi,war,ceb,sv,ar,uk,pt,zh,ko,id". }
      } limit 1000`;
    group.clearLayers();
    fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparql), {
      "headers": {
        "accept": "application/sparql-results+json"
      },
      "method": "GET",
      "mode": "cors"
    }).then(a => a.json()).then(a => {
      a.results.bindings.forEach(x => {
        if (x.location.value.match(/^Point\((.+) (.+)\)$/)) {
          var lon = parseFloat(RegExp.$1);
          var lat = parseFloat(RegExp.$2);
          var linkURL = x.place.value;
          var wikidataIcon = L.divIcon({
            html:"<div class='wikidata'><a href="+x.place.value+" target='_blank'>"+ x.placeLabel.value +"</a></div>",
            className: 'div.wikidata',
            iconSize:[10,10],
            iconAnchor:[5,10]
          })
          var marker = L.marker([lat, lon], {
            icon: wikidataIcon,
            riseOnHover: true,
          }).addTo(group); 
        }
      });
    });
  }).fire("moveend");
  };
group.on('add', function(){
    OnLayerAdded();
});
  //MSAIRoadDetections
class MyLineSymbolizer{
    draw(context,geom,z,feature){
        
        var colorInt= parseInt(feature.props["hougaku"]*93206.75);
        var color16= '#' + colorInt.toString(16);
        context.strokeStyle = color16;
        context.beginPath();
        for (var poly of geom) {
            for (var p = 0; p < poly.length-1; p++) {
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
        dataLayer:"MSAIRoadDetectionsJP",
        symbolizer: new MyLineSymbolizer()
    }   
];

var group2 = L.layerGroup([],
    {attribution:"Map tiles by Ginnannman, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>. Data by <a href='https://github.com/microsoft/RoadDetections'>Microsoft</a>, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>."}
    ); 
group2.clearLayers();
var MSAIRD_l = protomaps.leafletLayer({
        url: 'https://tile.shayato.net/Road/{z}/{x}/{y}.mvt',
        paint_rules:PAINT_RULES,
        }).addTo(group2);
   // layerControl.addOverlay(MSAIRD_l,"MS道路データ");

let PAINT_RULES2 = [
    {
        dataLayer:"MSAIRoadDetectionsJP",
        symbolizer: new protomaps.LineSymbolizer({fill:"steelblue"}),
    }   
];
var group3 = L.layerGroup([],
    {attribution:"Map tiles by Ginnannman, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>. Data by <a href='https://github.com/microsoft/RoadDetections'>Microsoft</a>, under <a href='https://opendatacommons.org/licenses/odbl/'>ODbL</a>."}
    ); 
group3.clearLayers();
var MSAIRD_2 = protomaps.leafletLayer({
        url: 'https://tile.shayato.net/Road/{z}/{x}/{y}.mvt',
        paint_rules:PAINT_RULES2,
        }).addTo(group3);


  //BaseMap
  var BaseMaps = {
    "地理院地図" : gsi,
    "地理院 淡色地図" : gsipale,
    "地理院 白地図" : gsiblank,
    "地理院 写真" : gisphoto,
    "オープンストリートマップ（日本）" : osmjp,
    "オープントポマップ": opentopomap,
    "MIERUNE 白地図" : mierunemono,
    "Stamen Toner（白黒地図）" : stamen
  };
  //OverLay
  var OverLays = {
      "wikidata": group,
      "MS道路データ": group2,
      "MS道路データ2": group3,
  };
  var LayerControl = L.control.layers(BaseMaps, OverLays, {collapsed:false, position:'topleft'}).addTo(map);
  gsi.addTo(map); 
  
  //中心十字・座標
  L.control.mapCenterCoord({position:'bottomleft', onMove:true, latlngFormat:'DMS', latlngDesignators:true}).addTo(map);

  //URLハッシュ
  L.hash(map);

 
