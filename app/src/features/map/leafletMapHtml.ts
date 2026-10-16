export interface GenerateMapHtmlParams {
  location: {
    coords: {
      latitude: number;
      longitude: number;
    };
  } | null;
  mapType: 'standard' | 'satellite';
  hazards: any[];
  safeLocations: any[];
  reliefLocations: any[];
  activeFilter: string;
  streamUrl: string;
}

export function generateMapHtml(params: GenerateMapHtmlParams): string {
  const { location, mapType, hazards, safeLocations, reliefLocations, activeFilter, streamUrl } = params;
  if (!location) return '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body { padding: 0; margin: 0; }
        html, body, #map {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: #f1f5f9;
        }
        .leaflet-container {
          background-color: #f1f5f9;
        }
        .leaflet-tile {
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }
        @keyframes userLocationPulse {
          0% { transform: scale(0.9); opacity: 0.75; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .user-location-container {
          position: relative;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-location-pulse {
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: rgba(0, 102, 255, 0.35);
          animation: userLocationPulse 2s ease-out infinite;
        }
        .user-location-dot {
          position: relative;
          width: 16px;
          height: 16px;
          background-color: #0066FF;
          border-radius: 50%;
          border: 3px solid #FFFFFF;
          box-shadow: 0 2px 6px rgba(0, 102, 255, 0.45), 0 1px 3px rgba(0, 0, 0, 0.25);
          z-index: 2;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: false,
          preferCanvas: true
        }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);

        L.control.zoom({ position: 'bottomleft' }).addTo(map);

        var currentMapType = '${mapType}';
        var userCoords = { lat: ${location.coords.latitude}, lng: ${location.coords.longitude} };

        // 1. Chế độ thu nhỏ / Tổng quan (Zoom <= 15):
        // Ẩn toàn bộ quán cà phê / cửa hàng (s.t:33|p.v:off)
        // và ẩn toàn bộ tên đường / biển số quốc lộ QL1A... (s.t:21|s.e:l|p.v:off)
        var overviewLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:21|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          minZoom: 1,
          maxZoom: 15,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        });

        // 2. Chế độ phóng to gần (Zoom >= 16):
        // Hiển thị tên các tuyến đường phố nội đô, ngõ hẻm; ẩn quán cà phê (s.t:33|p.v:off) và ẩn biển quốc lộ (s.t:22|s.e:l|p.v:off)
        var detailLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off%2Cs.t:22|s.e:l|p.v:off&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps',
          minZoom: 16,
          maxZoom: 20,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        });

        // 3. Chế độ bản đồ Vệ tinh Hybrid (Ảnh vệ tinh sắc nét + Tên đường xá & địa danh):
        var satelliteLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          subdomains: ['0', '1', '2', '3'],
          attribution: '© Google Maps Satellite',
          minZoom: 1,
          maxZoom: 20,
          keepBuffer: 6,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false
        });

        if (currentMapType === 'satellite') {
          satelliteLayer.addTo(map);
        } else {
          overviewLayer.addTo(map);
          detailLayer.addTo(map);
        }

        // Chuyển đổi qua lại giữa bản đồ chuẩn và vệ tinh
        window.setMapType = function(type) {
          currentMapType = type;
          if (type === 'satellite') {
            if (map.hasLayer(overviewLayer)) map.removeLayer(overviewLayer);
            if (map.hasLayer(detailLayer)) map.removeLayer(detailLayer);
            if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
          } else {
            if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
            if (!map.hasLayer(overviewLayer)) overviewLayer.addTo(map);
            if (!map.hasLayer(detailLayer)) detailLayer.addTo(map);
          }
        };

        // Bay tới vị trí một quận / huyện bất kỳ
        window.flyToZone = function(lat, lng, zoom) {
          if (map) {
            map.flyTo([lat, lng], zoom, {
              animate: true,
              duration: 1.2
            });
          }
        };

        // Bay về vị trí GPS hiện tại của người dùng
        window.flyToMyLocation = function() {
          if (map && userCoords) {
            map.flyTo([userCoords.lat, userCoords.lng], 16, {
              animate: true,
              duration: 1.0
            });
          }
        };

        // Ghim vị trí hiện tại của tôi (Dấu chấm tròn xanh nước biển GPS)
        var myIcon = L.divIcon({
          html: '<div class="user-location-container"><div class="user-location-pulse"></div><div class="user-location-dot"></div></div>',
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        L.marker([${location.coords.latitude}, ${location.coords.longitude}], { icon: myIcon }).addTo(map);

        // Cấu hình Icon ghim nhỏ gọn (Compact 26px x 30px) chuẩn theo đúng 6 icon trong tab loại nguy hiểm
        function getHazardMarkerHtml(type) {
          var config = {
            FLOOD: {
              bg: '#0284c7',
              label: 'Ngập lụt',
              // Giọt nước có dấu chấm than bên trong
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2.5C12 2.5 6 9.5 6 14.5a6 6 0 0 0 12 0c0-5-6-12-6-12z" fill="#ffffff"/><path d="M12 8.5v4" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="15.5" r="1.1" fill="#0284c7"/></svg>'
            },
            LANDSLIDE: {
              bg: '#b45309',
              label: 'Sạt lở đất',
              // Hai ngọn núi
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M14 6l-3.75 5-2.25-3L3 18h18l-7-12z"/></svg>'
            },
            FALLEN_TREE: {
              bg: '#16a34a',
              label: 'Cây đổ / Cản trở',
              // Cây thân đứng tán lá tròn
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M13 19h3.5a4.5 4.5 0 0 0 0-9 5.5 5.5 0 0 0-10.5 1.5A4.5 4.5 0 0 0 7.5 19H11v3h2v-3z"/></svg>'
            },
            ELECTRICAL: {
              bg: '#ca8a04',
              label: 'Sự cố điện',
              // Tia sét bên trái + Dấu chấm than bên phải
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polygon points="5 2 5 13 8 13 7 22 14 11 10 11 12 2" fill="#ffffff"/><line x1="18.5" y1="7" x2="18.5" y2="13" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><circle cx="18.5" cy="17" r="1.2" fill="#ffffff"/></svg>'
            },
            ROAD_DAMAGE: {
              bg: '#ea580c',
              label: 'Hư hỏng đường',
              // Hình con đường phối cảnh có vạch kẻ đứt đoạn ở giữa
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M18.11 2H5.89l-2.78 20h17.78L18.11 2zM11 4h2v3h-2V4zm0 6h2v3h-2v-3zm0 6h2v3h-2v-3z"/></svg>'
            },
            OTHER: {
              bg: '#dc2626',
              label: 'Nguy hiểm khác',
              // Hình tròn có dấu chấm than ở giữa
              svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#ffffff"/><path d="M12 7v6" stroke="#dc2626" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="#dc2626"/></svg>'
            }
          };

          var c = config[type] || config.OTHER;
          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + c.bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.32);">' +
              c.svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + c.bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Cấu hình Icon ghim điểm an toàn (Compact 26px x 30px)
        function getSafeMarkerHtml(type) {
          var isHospital = type === 'HOSPITAL';
          var svg = isHospital
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
          var bg = isHospital ? '#059669' : '#10b981';

          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' +
              svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Cấu hình Icon ghim điểm cứu trợ (Compact 26px x 30px)
        function getReliefMarkerHtml(type) {
          var isRescue = type === 'RESCUE_STATION';
          var svg = isRescue
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>';
          var bg = isRescue ? '#2563eb' : '#ea580c';

          return '<div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">' +
            '<div style="background:' + bg + ';width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">' +
              svg +
            '</div>' +
            '<div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ' + bg + ';margin-top:-1px;"></div>' +
          '</div>';
        }

        // Tạo 3 nhóm layer độc lập phục vụ bộ lọc
        var hazardLayer = L.layerGroup();
        var safeLayer = L.layerGroup();
        var reliefLayer = L.layerGroup();

        // Hàm render ghim điểm nguy hiểm
        function renderHazardMarkers(hazardList) {
          hazardLayer.clearLayers();
          if (!Array.isArray(hazardList)) return;

          hazardList.forEach(function(h) {
            if (h.location && h.location.coordinates && h.location.coordinates.length === 2) {
              var lng = h.location.coordinates[0];
              var lat = h.location.coordinates[1];
              var hType = h.hazardType || 'OTHER';
              var dangerPin = L.divIcon({
                html: getHazardMarkerHtml(hType),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: dangerPin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'HAZARD',
                    data: h
                  }));
                }
              });
              hazardLayer.addLayer(marker);
            }
          });
        }

        // Hàm render ghim điểm an toàn
        function renderSafeMarkers(safeList) {
          safeLayer.clearLayers();
          if (!Array.isArray(safeList)) return;

          safeList.forEach(function(s) {
            if (s.location && s.location.coordinates && s.location.coordinates.length === 2) {
              var lng = s.location.coordinates[0];
              var lat = s.location.coordinates[1];
              var safePin = L.divIcon({
                html: getSafeMarkerHtml(s.type),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: safePin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'SAFE',
                    data: s
                  }));
                }
              });
              safeLayer.addLayer(marker);
            }
          });
        }

        // Hàm render ghim điểm cứu trợ
        function renderReliefMarkers(reliefList) {
          reliefLayer.clearLayers();
          if (!Array.isArray(reliefList)) return;

          reliefList.forEach(function(r) {
            if (r.location && r.location.coordinates && r.location.coordinates.length === 2) {
              var lng = r.location.coordinates[0];
              var lat = r.location.coordinates[1];
              var reliefPin = L.divIcon({
                html: getReliefMarkerHtml(r.type),
                className: '',
                iconSize: [26, 30],
                iconAnchor: [13, 30],
                popupAnchor: [0, -30]
              });
              var marker = L.marker([lat, lng], { icon: reliefPin });
              marker.on('click', function() {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'SELECT_PIN',
                    category: 'RELIEF',
                    data: r
                  }));
                }
              });
              reliefLayer.addLayer(marker);
            }
          });
        }

        // Khởi tạo các điểm ban đầu
        renderHazardMarkers(${JSON.stringify(hazards)});
        renderSafeMarkers(${JSON.stringify(safeLocations)});
        renderReliefMarkers(${JSON.stringify(reliefLocations)});

        // Đưa các layer vào bản đồ theo bộ lọc ban đầu
        var initialFilter = '${activeFilter}';
        if (initialFilter === 'HAZARD') {
          hazardLayer.addTo(map);
        } else if (initialFilter === 'SAFE') {
          safeLayer.addTo(map);
        } else if (initialFilter === 'RELIEF') {
          reliefLayer.addTo(map);
        } else {
          hazardLayer.addTo(map);
          safeLayer.addTo(map);
          reliefLayer.addTo(map);
        }

        // Hàm điều khiển lọc tầng dữ liệu cực nhanh không cần reload trang
        window.setMapFilter = function(filter) {
          if (filter === 'ALL') {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          } else if (filter === 'HAZARD') {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          } else if (filter === 'SAFE') {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          } else if (filter === 'RELIEF') {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          }
        };

        var allHazards = ${JSON.stringify(hazards)};
        var allSafe = ${JSON.stringify(safeLocations)};
        var allRelief = ${JSON.stringify(reliefLocations)};

        // Hàm lọc chi tiết từng danh mục theo Popup Card
        window.applyDetailedFilter = function(st) {
          if (!st) return;
          if (st.all) {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
            return;
          }

          if (st.hazards) {
            if (!map.hasLayer(hazardLayer)) map.addLayer(hazardLayer);
          } else {
            if (map.hasLayer(hazardLayer)) map.removeLayer(hazardLayer);
          }

          if (st.safeShelter || st.hospital) {
            if (!map.hasLayer(safeLayer)) map.addLayer(safeLayer);
          } else {
            if (map.hasLayer(safeLayer)) map.removeLayer(safeLayer);
          }

          if (st.supplies || st.medical) {
            if (!map.hasLayer(reliefLayer)) map.addLayer(reliefLayer);
          } else {
            if (map.hasLayer(reliefLayer)) map.removeLayer(reliefLayer);
          }
        };

        // Hàm tìm kiếm theo số điện thoại hoặc từ khóa
        window.searchPins = function(keyword) {
          var kw = (keyword || '').toLowerCase().trim();
          if (!kw) {
            renderHazardMarkers(allHazards);
            renderSafeMarkers(allSafe);
            renderReliefMarkers(allRelief);
            return;
          }
          var matchedH = allHazards.filter(function(h) {
            var str = ((h.title || '') + ' ' + (h.address || '') + ' ' + (h.description || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderHazardMarkers(matchedH);

          var matchedS = allSafe.filter(function(s) {
            var str = ((s.name || '') + ' ' + (s.address || '') + ' ' + (s.contactPhone || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderSafeMarkers(matchedS);

          var matchedR = allRelief.filter(function(r) {
            var str = ((r.name || '') + ' ' + (r.address || '') + ' ' + (r.contactPhone || '')).toLowerCase();
            return str.indexOf(kw) !== -1;
          });
          renderReliefMarkers(matchedR);
        };

        // Hàm cập nhật dữ liệu Realtime động từ React Native
        window.updateHazardsData = function(newHazards) {
          allHazards = newHazards;
          renderHazardMarkers(newHazards);
        };

        // Kết nối SSE Realtime trực tiếp từ trình duyệt WebView
        var streamUrl = '${streamUrl}';
        if (window.EventSource && streamUrl) {
          try {
            var es = new EventSource(streamUrl);
            es.onmessage = function(e) {
              try {
                var payload = JSON.parse(e.data);
                if (payload && payload.action) {
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'HAZARD_EVENT',
                      payload: payload
                    }));
                  }
                }
              } catch(err) {}
            };
          } catch(err) {}
        }

        // Khắc phục triệt để lỗi ô xám / bể khung trên WebView:
        function fixMapSize() {
          if (map) {
            map.invalidateSize();
          }
        }
        window.addEventListener('load', function() {
          setTimeout(fixMapSize, 100);
          setTimeout(fixMapSize, 350);
          setTimeout(fixMapSize, 800);
        });
        window.addEventListener('resize', fixMapSize);
        setTimeout(fixMapSize, 150);
        setTimeout(fixMapSize, 500);
      </script>
    </body>
    </html>
  `;
}
