import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

export const MapScreen: React.FC = () => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Đang tìm vị trí của bạn...');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingMsg('Chưa cấp quyền GPS');
        return;
      }
      try {
        const currentLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(currentLoc);
      } catch (err) {
        setLoadingMsg('Không thể lấy được GPS');
      }
    })();
  }, []);

  const mapHtml = location ? `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; }
        html, body, #map { height: 100%; width: 100%; }
        @keyframes pulseWave {
          0% { transform: scale(0.6); opacity: 0.95; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .sos-radar-container {
          position: relative;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sos-radar-wave {
          position: absolute;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background-color: rgba(220, 38, 38, 0.45);
          border: 2px solid #DC2626;
          animation: pulseWave 1.6s ease-out infinite;
        }
        .sos-radar-core {
          position: relative;
          width: 36px;
          height: 36px;
          background: #DC2626;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 0 14px rgba(220, 38, 38, 0.8), 0 3px 6px rgba(0,0,0,0.3);
          border: 2px solid white;
          z-index: 2;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);
        
        L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          maxZoom: 20
        }).addTo(map);

        var myIcon = L.divIcon({
          html: '<div class="sos-radar-container"><div class="sos-radar-wave"></div><div class="sos-radar-core"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/><path d="M21 12h1"/><path d="M18.5 4.5 19 4"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="M4.5 4.5 5 4"/><path d="M12 11v3"/></svg></div></div>',
          className: 'custom-sos-radar-wrapper',
          iconSize: [50, 50],
          iconAnchor: [25, 25]
        });

        L.marker([${location.coords.latitude}, ${location.coords.longitude}], { icon: myIcon }).addTo(map);
        
        L.circle([${location.coords.latitude}, ${location.coords.longitude}], {
          color: '#DC2626',
          fillColor: '#EF4444',
          fillOpacity: 0.2,
          radius: 500,
          weight: 2,
          dashArray: '6, 6'
        }).addTo(map);
      </script>
    </body>
    </html>
  ` : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
        <Text style={styles.title}>Bản đồ cứu hộ</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {!location ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={{ marginTop: 15, color: '#64748B' }}>{loadingMsg}</Text>
          </View>
        ) : (
          <WebView 
            source={{ html: mapHtml }} 
            style={{ flex: 1, width: '100%' }} 
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    zIndex: 10,
  },
  appBadge: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  body: {
    flex: 1,
    backgroundColor: '#F1F5F9'
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
