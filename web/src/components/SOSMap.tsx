import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix lỗi tàng hình Icon mặc định của Leaflet khi build bằng React/Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icon cho xe cứu thương/SOS
const sosIcon = L.divIcon({
    html: '<div style="font-size: 26px; background: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid #e74c3c;">🚑</div>',
    className: 'custom-sos-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

// Component phụ trợ: Bắt sự kiện Click vào bản đồ để thả ghim
const LocationMarker = ({ position, setPosition }: any) => {
    const map = useMap();

    useMapEvents({
        click(e) {
            setPosition([e.latlng.lat, e.latlng.lng]);
            map.flyTo(e.latlng, map.getZoom()); // Click xong tự động trượt bản đồ tới đó
        },
    });

    // Nếu map nhận được tọa độ từ GPS, nó cũng tự động bay tới đó
    useEffect(() => {
        if (position) {
            map.flyTo(position, 16);
        }
    }, [position, map]);

    return position === null ? null : (
        <>
            <Marker position={position} icon={sosIcon}>
                <Popup><b>🚨 Vị trí báo nạn SOS!</b><br/>Đang khoanh vùng tìm kiếm bán kính 500m...</Popup>
            </Marker>
            
            {/* Vẽ vòng tròn cảnh báo bán kính 500m */}
            <Circle 
                center={position} 
                radius={500} 
                pathOptions={{ color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.15, weight: 2 }} 
            />
        </>
    );
};

// COMPONENT CHÍNH
const SOSMap = () => {
    // Lưu trữ tọa độ dạng [vĩ độ (lat), kinh độ (lng)]
    const [position, setPosition] = useState<[number, number] | null>(null);

    const handleAutoLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
                (err) => alert("Không thể lấy vị trí. Vui lòng cấp quyền GPS!")
            );
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <button
                type="button"
                onClick={handleAutoLocation}
                style={{ padding: '10px', backgroundColor: '#e74c3c', color: 'white', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
            >
                📍 Tự động lấy vị trí hiện tại
            </button>

            {/* Vùng chứa bản đồ */}
            <MapContainer
                center={[16.0668, 108.2235]} // Mặc định mở lên ở Đà Nẵng
                zoom={14}
                style={{ height: '400px', width: '100%', borderRadius: '8px', zIndex: 1 }}
            >
                <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                    attribution="&copy; Esri & Contributors"
                />
                <LocationMarker position={position} setPosition={setPosition} />
            </MapContainer>

            {/* Hiển thị tọa độ ra để bạn dễ hình dung (Có thể ẩn đi sau này) */}
            {position && (
                <div style={{ padding: '15px', backgroundColor: '#ecf0f1', color: '#2c3e50', borderRadius: '8px', fontSize: '16px', borderLeft: '5px solid #e74c3c' }}>
                    <strong style={{ fontSize: '18px', color: '#c0392b' }}>📍 Tọa độ thu được:</strong>
                    <div style={{ marginTop: '10px', lineHeight: '1.6' }}>
                        Kinh độ (Longitude): <b style={{ color: '#2980b9' }}>{position[1].toFixed(6)}</b><br />
                        Vĩ độ (Latitude): <b style={{ color: '#2980b9' }}>{position[0].toFixed(6)}</b>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SOSMap;
