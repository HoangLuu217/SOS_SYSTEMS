import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const HERE_API_KEY = process.env.EXPO_PUBLIC_HERE_API_KEY ?? '';

interface Coords { latitude: number; longitude: number }
type AppMode = 'view' | 'routing';

interface RouteInfo {
  distanceM: number;
  durationS: number;
  destLat: number;
  destLng: number;
}

const MAP_STYLES = [
  { key: 'normal.map',     label: 'Đường phố',  icon: 'map-outline' as const,         hereStyle: 'normal',    hereScheme: 'map' },
  { key: 'normal.traffic', label: 'Giao thông', icon: 'car-outline' as const,          hereStyle: 'normal',    hereScheme: 'traffic.day' },
  { key: 'satellite.day',  label: 'Vệ tinh',    icon: 'globe-outline' as const,        hereStyle: 'satellite', hereScheme: 'map' },
  { key: 'terrain.day',    label: 'Địa hình',   icon: 'trail-sign-outline' as const,   hereStyle: 'terrain',   hereScheme: 'map' },
];

const DEFAULT: Coords = { latitude: 10.7769, longitude: 106.7009 };

/* ─── Build HERE tile URL for Leaflet ────────────────────────────────────── */
const hereTileUrl = (style: string, scheme: string, apiKey: string) =>
  `https://maps.hereapi.com/v3/base/mc/{z}/{x}/{y}/png8?style=${style}.day&apiKey=${apiKey}`;

const buildMapHTML = (coords: Coords, apiKey: string, styleIdx: number) => {
  const s = MAP_STYLES[styleIdx];
  const tileUrl = hereTileUrl(s.hereStyle, s.hereScheme, apiKey);

  return `<!DOCTYPE html><html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
* { margin:0;padding:0;box-sizing:border-box }
html,body,#map { width:100%;height:100%;overflow:hidden }
.leaflet-control-attribution a { font-size:9px }
/* User marker pulse */
.u-wrap { position:relative;width:40px;height:40px }
.u-ring {
  position:absolute;inset:0;border-radius:50%;
  background:rgba(0,102,255,0.15);border:2px solid rgba(0,102,255,0.3);
  animation:pu 2s ease-out infinite;
}
.u-dot {
  position:absolute;top:11px;left:11px;width:18px;height:18px;
  border-radius:50%;background:#0066FF;border:3px solid #fff;
  box-shadow:0 2px 8px rgba(0,102,255,.6)
}
/* Dest marker */
.d-wrap { position:relative;width:28px;height:36px }
.d-pin {
  width:26px;height:26px;border-radius:50% 50% 50% 0;
  background:#EF4444;border:3px solid #fff;
  box-shadow:0 2px 8px rgba(239,68,68,.6);
  transform:rotate(-45deg);
}
.d-shadow {
  position:absolute;bottom:0;left:4px;width:18px;height:4px;
  border-radius:50%;background:rgba(0,0,0,.2);
}
/* Route hint */
#hint {
  position:absolute;top:10px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,.7);color:#fff;padding:7px 16px;border-radius:20px;
  font:600 12px/1 sans-serif;pointer-events:none;display:none;white-space:nowrap;z-index:1000;
}
@keyframes pu{0%{transform:scale(.7);opacity:1}100%{transform:scale(1.8);opacity:0}}
</style>
</head>
<body>
<div id="map"></div>
<div id="hint">📍 Nhấn bản đồ để chọn điểm đến</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var API_KEY = '${apiKey}';
var routingMode = false;
var userMarker = null, destMarker = null, routeLine = null;
var userLat = ${coords.latitude}, userLng = ${coords.longitude};

/* ── Map init ── */
var map = L.map('map', {
  center: [userLat, userLng], zoom: 15,
  zoomControl: true, attributionControl: true,
});

var tileLayer = L.tileLayer('${tileUrl}', {
  maxZoom: 20,
  attribution: '© HERE Maps',
  crossOrigin: true,
}).addTo(map);

/* ── Icons ── */
var userIcon = L.divIcon({
  className:'',
  html:'<div class="u-wrap"><div class="u-ring"></div><div class="u-dot"></div></div>',
  iconSize:[40,40], iconAnchor:[20,20],
});
var destIcon = L.divIcon({
  className:'',
  html:'<div class="d-wrap"><div class="d-pin"></div><div class="d-shadow"></div></div>',
  iconSize:[28,36], iconAnchor:[14,36],
});

function addUserMarker(lat, lng) {
  userLat=lat; userLng=lng;
  if(userMarker) map.removeLayer(userMarker);
  userMarker = L.marker([lat,lng], {icon:userIcon, zIndexOffset:1000})
    .addTo(map)
    .bindPopup('<b>📍 Vị trí của bạn</b><br><small>'+lat.toFixed(5)+', '+lng.toFixed(5)+'</small>');
}
addUserMarker(userLat, userLng);

/* ── HERE Flexible Polyline Decoder ── */
(function(){
  var DT=[62,-1,-1,52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,-1,
    0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,
    -1,-1,-1,-1,63,-1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,
    43,44,45,46,47,48,49,50,51];
  function du(enc){var r=0,s=0,l=[];for(var i=0;i<enc.length;i++){var v=DT[enc.charCodeAt(i)-45];r|=(v&31)<<s;if((v&32)===0){l.push(r);r=0;s=0;}else s+=5;}return l;}
  function ds(enc){return du(enc).map(function(v){return v&1?~(v>>1):v>>1;});}
  window.decodeFlexPoly=function(enc){
    var h=du(enc.slice(0,3)); var f=Math.pow(10,h[2]&15);
    var v=ds(enc.slice(3)); var out=[],lat=0,lng=0;
    for(var i=0;i<v.length;i+=2){lat+=v[i];lng+=v[i+1];out.push([lat/f,lng/f]);}
    return out;
  };
})();

/* ── Routing ── */
function clearRoute(){
  if(destMarker){map.removeLayer(destMarker);destMarker=null;}
  if(routeLine){map.removeLayer(routeLine);routeLine=null;}
  notify({type:'ROUTE_CLEAR'});
}

function calcRoute(destLat, destLng){
  notify({type:'ROUTE_LOADING'});
  var url='https://router.hereapi.com/v8/routes'
    +'?transportMode=car'
    +'&origin='+userLat+','+userLng
    +'&destination='+destLat+','+destLng
    +'&return=polyline,summary'
    +'&apikey='+API_KEY;

  fetch(url)
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d.routes||!d.routes.length){
        notify({type:'ROUTE_ERROR',msg:'Không tìm thấy tuyến đường'}); return;
      }
      var sec=d.routes[0].sections[0];
      var coords=decodeFlexPoly(sec.polyline);
      var latlngs=coords.map(function(c){return [c[0],c[1]];});

      if(routeLine) map.removeLayer(routeLine);
      routeLine=L.polyline(latlngs,{
        color:'#0066FF', weight:6, opacity:.85,
        lineCap:'round', lineJoin:'round',
        dashArray: null,
      }).addTo(map);

      // Fit map to route
      map.fitBounds(routeLine.getBounds(), {padding:[40,40]});

      notify({
        type:'ROUTE_RESULT',
        distanceM: sec.summary.length,
        durationS: sec.summary.duration,
        destLat: destLat, destLng: destLng,
      });
    })
    .catch(function(e){
      notify({type:'ROUTE_ERROR',msg:'Lỗi: '+e.message});
    });
}

/* ── Map click for routing ── */
map.on('click', function(e){
  if(!routingMode) return;
  var lat=e.latlng.lat, lng=e.latlng.lng;
  if(destMarker) map.removeLayer(destMarker);
  destMarker=L.marker([lat,lng],{icon:destIcon,zIndexOffset:900}).addTo(map);
  calcRoute(lat, lng);
});

/* ── Map move notification ── */
map.on('moveend', function(){
  var c=map.getCenter();
  notify({type:'MAP_MOVE', lat:c.lat, lng:c.lng, zoom:Math.round(map.getZoom())});
});

/* ── Message bridge ── */
function notify(obj){
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(obj));
}
function onMsg(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.type==='GO_TO'){
      addUserMarker(msg.lat, msg.lng);
      map.flyTo([msg.lat,msg.lng], 16, {duration:0.8});
    } else if(msg.type==='CHANGE_STYLE'){
      map.removeLayer(tileLayer);
      tileLayer=L.tileLayer(msg.tileUrl,{maxZoom:20,attribution:'© HERE Maps',crossOrigin:true}).addTo(map);
    } else if(msg.type==='SET_ROUTING_MODE'){
      routingMode=msg.enabled;
      document.getElementById('hint').style.display=msg.enabled?'block':'none';
      if(!msg.enabled) clearRoute();
    } else if(msg.type==='CLEAR_ROUTE'){
      clearRoute();
    }
  }catch(err){}
}
document.addEventListener('message', onMsg);
window.addEventListener('message', onMsg);
</script>
</body>
</html>`;
};

/* ─── Component ──────────────────────────────────────────────────────────── */
export const MapScreen: React.FC = () => {
  const webViewRef = useRef<WebView>(null);
  const [userCoords, setUserCoords]   = useState<Coords | null>(null);
  const [zoom, setZoom]               = useState(15);
  const [permission, setPermission]   = useState<'granted'|'denied'|'loading'>('loading');
  const [styleIndex, setStyleIndex]   = useState(0);
  const [isLocating, setIsLocating]   = useState(false);
  const [mapReady, setMapReady]       = useState(false);
  const [appMode, setAppMode]         = useState<AppMode>('view');
  const [routeInfo, setRouteInfo]     = useState<RouteInfo | null>(null);
  const [isRouting, setIsRouting]     = useState(false);
  const pendingRef                    = useRef<Coords | null>(null);

  const noApiKey = !HERE_API_KEY || HERE_API_KEY === 'YOUR_HERE_API_KEY_HERE';

  useEffect(() => { requestAndLocate(); }, []);

  const requestAndLocate = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') { setPermission('granted'); await locateUser(true); }
      else setPermission('denied');
    } catch { setPermission('denied'); }
  };

  const locateUser = async (initial = false) => {
    setIsLocating(true);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const c: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserCoords(c);
      if (mapReady) sendToMap({ type: 'GO_TO', lat: c.latitude, lng: c.longitude });
      else pendingRef.current = c;
    } catch { if (!initial) Alert.alert('Lỗi', 'Không thể lấy vị trí.'); }
    finally { setIsLocating(false); }
  };

  const sendToMap = (msg: object) => {
    const safe = JSON.stringify(msg).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    webViewRef.current?.injectJavaScript(
      `(function(){var e=new MessageEvent('message',{data:'${safe}'});document.dispatchEvent(e);window.dispatchEvent(e);})();true;`
    );
  };

  const toggleMode = () => {
    const next: AppMode = appMode === 'view' ? 'routing' : 'view';
    setAppMode(next);
    setRouteInfo(null);
    setIsRouting(false);
    sendToMap({ type: 'SET_ROUTING_MODE', enabled: next === 'routing' });
  };

  const cycleStyle = () => {
    const next = (styleIndex + 1) % MAP_STYLES.length;
    setStyleIndex(next);
    const s = MAP_STYLES[next];
    sendToMap({ type: 'CHANGE_STYLE', tileUrl: hereTileUrl(s.hereStyle, s.hereScheme, HERE_API_KEY) });
  };

  const onWebViewMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'MAP_MOVE') { setZoom(msg.zoom ?? zoom); }
      else if (msg.type === 'ROUTE_LOADING') { setIsRouting(true); setRouteInfo(null); }
      else if (msg.type === 'ROUTE_RESULT') {
        setIsRouting(false);
        setRouteInfo({ distanceM: msg.distanceM, durationS: msg.durationS, destLat: msg.destLat, destLng: msg.destLng });
      }
      else if (msg.type === 'ROUTE_CLEAR') { setRouteInfo(null); setIsRouting(false); }
      else if (msg.type === 'ROUTE_ERROR') { setIsRouting(false); Alert.alert('Lỗi tuyến đường', msg.msg); }
    } catch {}
  };

  const onMapLoad = () => {
    setMapReady(true);
    if (pendingRef.current) {
      sendToMap({ type: 'GO_TO', lat: pendingRef.current.latitude, lng: pendingRef.current.longitude });
      pendingRef.current = null;
    }
  };

  const fmtDist = (m: number) => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
  const fmtTime = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}g ${m}p` : `${m} phút`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
          <Text style={styles.title}>Bản đồ</Text>
        </View>
        <View style={styles.coordBadge}>
          <Ionicons name="location" size={12} color={userCoords ? '#10B981' : '#94A3B8'} />
          <Text style={styles.coordText}>
            {userCoords ? `${userCoords.latitude.toFixed(4)}, ${userCoords.longitude.toFixed(4)}` : 'Chưa định vị'}
          </Text>
        </View>
      </View>

      {/* Mode bar */}
      <View style={styles.modeBar}>
        <TouchableOpacity
          style={[styles.modeBtn, appMode === 'view' && styles.modeBtnActive]}
          onPress={() => appMode !== 'view' && toggleMode()}
          activeOpacity={0.8}
        >
          <Ionicons name="map" size={14} color={appMode === 'view' ? '#0066FF' : '#94A3B8'} />
          <Text style={[styles.modeBtnText, appMode === 'view' && styles.modeBtnTextActive]}>Xem bản đồ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, appMode === 'routing' && styles.modeBtnActive]}
          onPress={() => appMode !== 'routing' && toggleMode()}
          activeOpacity={0.8}
        >
          <Ionicons name="navigate" size={14} color={appMode === 'routing' ? '#0066FF' : '#94A3B8'} />
          <Text style={[styles.modeBtnText, appMode === 'routing' && styles.modeBtnTextActive]}>Chỉ đường</Text>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          style={styles.map}
          source={{ html: buildMapHTML(userCoords ?? DEFAULT, HERE_API_KEY, styleIndex) }}
          onMessage={onWebViewMessage}
          onLoad={onMapLoad}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          mixedContentMode="always"
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          scrollEnabled={false}
        />

        {/* Pill overlays */}
        {(isLocating || isRouting) && (
          <View style={styles.pill}>
            <ActivityIndicator size="small" color="#0066FF" />
            <Text style={styles.pillText}>{isLocating ? 'Đang định vị...' : 'Đang tính đường...'}</Text>
          </View>
        )}

        {/* Route info card */}
        {routeInfo && (
          <View style={styles.routeCard}>
            <View style={styles.routeLeft}>
              <View style={styles.routeRow}>
                <Ionicons name="navigate" size={15} color="#0066FF" />
                <Text style={styles.routeDist}>{fmtDist(routeInfo.distanceM)}</Text>
                <View style={styles.sep} />
                <Ionicons name="time-outline" size={13} color="#64748B" />
                <Text style={styles.routeTime}>{fmtTime(routeInfo.durationS)}</Text>
              </View>
              <Text style={styles.routeDest}>
                📍 {routeInfo.destLat.toFixed(4)}, {routeInfo.destLng.toFixed(4)}
              </Text>
            </View>
            <TouchableOpacity style={styles.routeClose} onPress={() => { setRouteInfo(null); sendToMap({type:'CLEAR_ROUTE'}); }}>
              <Ionicons name="close" size={17} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={cycleStyle} activeOpacity={0.85}>
            <Ionicons name={MAP_STYLES[styleIndex].icon} size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.locateBtn]}
            onPress={() => permission === 'denied' ? requestAndLocate() : locateUser()}
            disabled={isLocating}
            activeOpacity={0.85}
          >
            {isLocating
              ? <ActivityIndicator size="small" color="#0066FF" />
              : <Ionicons name="locate" size={22} color={permission === 'granted' ? '#0066FF' : '#94A3B8'} />}
          </TouchableOpacity>
        </View>

        {/* Style chip */}
        <View style={styles.styleChip}>
          <Text style={styles.styleChipText}>{MAP_STYLES[styleIndex].label}</Text>
        </View>

        {/* Permission banner */}
        {permission === 'denied' && (
          <View style={styles.permBanner}>
            <Ionicons name="warning-outline" size={14} color="#F59E0B" />
            <Text style={styles.permText}>
              Chưa có quyền vị trí —{' '}
              <Text style={styles.permLink} onPress={requestAndLocate}>nhấn để cấp</Text>
            </Text>
          </View>
        )}
      </View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#0066FF' }]} />
          <Text style={styles.legendText}>Vị trí bạn</Text>
          <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Điểm đến</Text>
        </View>
        <Text style={styles.zoomText}>Zoom {zoom} · HERE Maps</Text>
      </View>
    </SafeAreaView>
  );
};

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  android: { elevation: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 16, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  appBadge: { fontSize: 11, color: '#0066FF', fontWeight: '700', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  coordBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  coordText: { fontSize: 11, color: '#065F46', fontWeight: '600' },
  modeBar: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#F1F5F9',
  },
  modeBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  modeBtnText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  modeBtnTextActive: { color: '#0066FF' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1, backgroundColor: '#E8EEF4' },
  pill: {
    position: 'absolute', top: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, ...shadow,
  },
  pillText: { fontSize: 13, color: '#0066FF', fontWeight: '600' },
  routeCard: {
    position: 'absolute', bottom: 14, left: 12, right: 64,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#BFDBFE',
    ...Platform.select({
      ios: { shadowColor: '#0066FF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  routeLeft: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  routeDist: { fontSize: 16, fontWeight: '800', color: '#0066FF' },
  sep: { width: 1, height: 14, backgroundColor: '#E2E8F0' },
  routeTime: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  routeDest: { fontSize: 11, color: '#94A3B8' },
  routeClose: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  controls: { position: 'absolute', right: 12, bottom: 80, gap: 8 },
  ctrlBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', ...shadow,
  },
  locateBtn: { borderWidth: 2, borderColor: '#EFF6FF' },
  styleChip: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  styleChipText: { fontSize: 11, color: '#334155', fontWeight: '600' },
  permBanner: {
    position: 'absolute', bottom: 12, left: 12, right: 64,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
  },
  permText: { fontSize: 12, color: '#92400E', flex: 1 },
  permLink: { color: '#0066FF', fontWeight: '700', textDecorationLine: 'underline' },
  bottomBar: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  zoomText: { fontSize: 11, color: '#94A3B8' },
});
