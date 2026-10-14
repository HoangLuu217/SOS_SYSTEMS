import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Circle, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
    Crosshair, 
    Navigation, 
    AlertTriangle, 
    Hospital, 
    Map as MapIcon, 
    Satellite, 
    Search, 
    X, 
    CheckCircle2, 
    Siren,
    MapPin,
    GraduationCap,
    Landmark,
    Shield
} from 'lucide-react';

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

// Custom Icon cho xe cứu thương/SOS dạng Vector SVG kèm hiệu ứng radar nhấp nháy
const sosPulseIcon = L.divIcon({
    html: `
        <div class="sos-radar-container">
            <div class="sos-radar-wave"></div>
            <div class="sos-radar-core">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/>
                    <path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H5v-2Z"/>
                    <path d="M21 12h1"/>
                    <path d="M18.5 4.5 19 4"/>
                    <path d="M2 12h1"/>
                    <path d="M12 2v1"/>
                    <path d="M4.5 4.5 5 4"/>
                    <path d="M12 11v3"/>
                </svg>
            </div>
        </div>
    `,
    className: 'custom-sos-radar-wrapper',
    iconSize: [50, 50],
    iconAnchor: [25, 25],
});

// Icon điểm an toàn / Trạm y tế sơ tán dạng Vector SVG
const safeShelterIcon = L.divIcon({
    html: `
        <div class="safe-shelter-core">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 6v4"/>
                <path d="M14 14h-4"/>
                <path d="M14 18h-4"/>
                <path d="M14 8h-4"/>
                <path d="M18 12h.01"/>
                <path d="M6 12h.01"/>
                <rect width="16" height="20" x="4" y="2" rx="2"/>
            </svg>
        </div>
    `,
    className: 'custom-shelter-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});

// Component điều khiển tương tác trên Map (Bắt click & Trượt bản đồ)
interface MapControllerProps {
    position: [number, number] | null;
    setPosition: (pos: [number, number]) => void;
    isPinMode: boolean;
    setIsPinMode: (active: boolean) => void;
    flyToCoords: [number, number] | null;
}

const MapController: React.FC<MapControllerProps> = ({ 
    position, 
    setPosition, 
    isPinMode, 
    setIsPinMode, 
    flyToCoords 
}) => {
    const map = useMap();

    // Bắt sự kiện click: CHỈ KHI BẬT CHẾ ĐỘ THẢ GHIM MỚI NHẬN TỌA ĐỘ
    useMapEvents({
        click(e: L.LeafletMouseEvent) {
            if (!isPinMode) return; // Nếu đang ở chế độ xem bình thường -> Không làm gì cả!
            setPosition([e.latlng.lat, e.latlng.lng]);
            map.flyTo(e.latlng, 16);
            setIsPinMode(false); // Đặt ghim xong tự động thoát chế độ thả ghim
        },
    });

    // Khi có yêu cầu bay tới tọa độ (từ tìm kiếm hoặc GPS)
    useEffect(() => {
        if (flyToCoords) {
            map.flyTo(flyToCoords, 16);
        }
    }, [flyToCoords, map]);

    return (
        <>
            {position && (
                <>
                    <Marker position={position} icon={sosPulseIcon}>
                        <Popup>
                            <div style={{ textAlign: 'center', padding: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#DC2626', fontWeight: 'bold', fontSize: '15px' }}>
                                    <Siren size={18} color="#DC2626" />
                                    <span>TÍN HIỆU CỨU HỘ SOS</span>
                                </div>
                                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#475569' }}>
                                    Tọa độ: [{position[0].toFixed(5)}, {position[1].toFixed(5)}]<br />
                                    Bán kính khoanh vùng cứu nạn: 500m.
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                    
                    {/* Vòng tròn cảnh báo bán kính 500m */}
                    <Circle 
                        center={position} 
                        radius={500} 
                        pathOptions={{ 
                            color: '#E11D48', 
                            fillColor: '#EF4444', 
                            fillOpacity: 0.25, 
                            weight: 2, 
                            dashArray: '6, 6' 
                        }} 
                    />
                </>
            )}
        </>
    );
};

// Hàm chuẩn hóa tiếng Việt để tìm kiếm không dấu
const removeVietnameseTones = (str: string) => {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str.toLowerCase().trim();
};

// Danh bạ các địa điểm và từ khóa cứu hộ trọng điểm tại Đà Nẵng
interface LocationPOI {
    id: string;
    name: string;
    subtext: string;
    category: 'HOSPITAL' | 'FLOOD' | 'SHELTER' | 'LANDMARK' | 'STREET';
    coords: [number, number];
    tags: string[];
}

const EMERGENCY_LOCATIONS_DATABASE: LocationPOI[] = [
    // 1. Giáo dục & Khu vực FPT City
    {
        id: 'fpt-uni',
        name: 'Đại học FPT Đà Nẵng',
        subtext: 'Khu Đô thị FPT City, Phường Hòa Hải, Ngũ Hành Sơn',
        category: 'LANDMARK',
        coords: [15.9689, 108.2608],
        tags: ['fpt', 'dai hoc fpt', 'fpt city', 'fpt university', 'truong hoc', 'ngu hanh son', 'hoa hai']
    },
    {
        id: 'fpt-city',
        name: 'Khu Đô thị FPT City',
        subtext: 'Khu đô thị công nghệ cao FPT City, Hòa Hải, Ngũ Hành Sơn',
        category: 'LANDMARK',
        coords: [15.9698, 108.2625],
        tags: ['fpt', 'fpt city', 'khu do thi fpt', 'ngu hanh son', 'nam ky khoi nghia']
    },
    {
        id: 'tra-khe',
        name: 'Khu dân cư Trà Khê',
        subtext: 'Các tuyến đường Trà Khê 1, 2, 3, 4, 5, 6 - Liền kề FPT City',
        category: 'STREET',
        coords: [15.9720, 108.2540],
        tags: ['tra khe', 'tra khe 1', 'tra khe 2', 'fpt', 'ngu hanh son']
    },
    {
        id: 'nam-ky-khoi-nghia',
        name: 'Đường Nam Kỳ Khởi Nghĩa',
        subtext: 'Tuyến đường lớn trục chính đi qua FPT City',
        category: 'STREET',
        coords: [15.9765, 108.2570],
        tags: ['nam ky khoi nghia', 'duong nam ky', 'fpt', 'ngu hanh son']
    },

    // 2. Bệnh viện & Cấp cứu y tế
    {
        id: 'bv-san-nhi',
        name: 'Bệnh viện Phụ sản - Nhi Đà Nẵng (BV 600 giường)',
        subtext: '402 Lê Văn Hiến, Khuê Mỹ, Quận Ngũ Hành Sơn',
        category: 'HOSPITAL',
        coords: [16.0245, 108.2435],
        tags: ['benh vien', 'y te', 'cap cuu', 'san nhi', 'phu san nhi', '600 giuong', 'le van hien', 'ngu hanh son']
    },
    {
        id: 'bv-da-nang',
        name: 'Bệnh viện Đà Nẵng',
        subtext: '124 Hải Phòng, Phường Thạch Thang, Quận Hải Châu',
        category: 'HOSPITAL',
        coords: [16.0748, 108.2162],
        tags: ['benh vien', 'y te', 'cap cuu', 'benh vien da nang', 'hai chau', 'trung tam']
    },
    {
        id: 'bv-hoan-my',
        name: 'Bệnh viện Hoàn Mỹ Đà Nẵng',
        subtext: '291 Nguyễn Văn Linh, Quận Thanh Khê',
        category: 'HOSPITAL',
        coords: [16.0610, 108.2105],
        tags: ['benh vien', 'y te', 'hoan my', 'nguyen van linh', 'thanh khe']
    },
    {
        id: 'tt-115',
        name: 'Trung tâm Cấp cứu 115 Đà Nẵng',
        subtext: '522 Ông Ích Khiêm, Nam Dương, Quận Hải Châu',
        category: 'HOSPITAL',
        coords: [16.0601, 108.2155],
        tags: ['cap cuu', '115', 'y te', 'cuu ho', 'xe cap cuu', 'hai chau']
    },

    // 3. Vùng ngập lụt nguy hiểm
    {
        id: 'ngap-hoa-xuan',
        name: 'Vùng ngập lụt Hòa Xuân - Sông Cẩm Lệ',
        subtext: 'Khu vực trũng thấp ven sông, nguy cơ ngập sâu cấp 3',
        category: 'FLOOD',
        coords: [16.0280, 108.2250],
        tags: ['vung ngap', 'ngap lut', 'nguy hiem', 'hoa xuan', 'cam le', 'song cam le', 'lu lut', 'nuoc dang']
    },
    {
        id: 'ngap-me-suot',
        name: 'Vùng ngập lụt Mẹ Suốt (Liên Chiểu)',
        subtext: 'Đường Mẹ Suốt, Hòa Khánh Nam - Điểm nóng ngập lụt đô thị',
        category: 'FLOOD',
        coords: [16.0592, 108.1568],
        tags: ['vung ngap', 'ngap', 'me suot', 'lien chieu', 'hoa khanh', 'ngap nang', 'ngap sau']
    },
    {
        id: 'ngap-khe-can',
        name: 'Vùng trũng Khe Cạn (Thanh Khê)',
        subtext: 'Khu vực trũng ngập thường xuyên của quận Thanh Khê',
        category: 'FLOOD',
        coords: [16.0535, 108.1880],
        tags: ['ngap', 'khe can', 'thanh khe', 'vung ngap', 'ngap lut']
    },

    // 4. Trạm sơ tán & Điểm trú ẩn
    {
        id: 'so-tan-hoa-xuan',
        name: 'Trạm Sơ tán & Trú ẩn Trường TH Trần Văn Dư',
        subtext: 'Phường Hòa Xuân, Quận Cẩm Lệ (Sức chứa 400 người)',
        category: 'SHELTER',
        coords: [16.0195, 108.2185],
        tags: ['tram so tan', 'so tan', 'tru an', 'an toan', 'cam le', 'hoa xuan', 'truong hoc']
    },
    {
        id: 'so-tan-fpt',
        name: 'Điểm Trú ẩn Khẩn cấp Ký túc xá FPT',
        subtext: 'KTX ĐH FPT, Khu Đô thị FPT City (Sức chứa 800 người)',
        category: 'SHELTER',
        coords: [15.9695, 108.2615],
        tags: ['so tan', 'tru an', 'ktx fpt', 'fpt', 'an toan', 'cuu ho']
    },

    // 5. Cầu lớn & Địa danh trung tâm
    {
        id: 'cau-rong',
        name: 'Cầu Rồng Đà Nẵng',
        subtext: 'Cầu Rồng bắc qua Sông Hàn, Hải Châu / Sơn Trà',
        category: 'LANDMARK',
        coords: [16.0611, 108.2272],
        tags: ['cau rong', 'song han', 'trung tam', 'hai chau', 'son tra']
    },
    {
        id: 'cau-co-co',
        name: 'Cầu Cổ Cò',
        subtext: 'Bắc qua sông Cổ Cò, Phường Hòa Hải, Ngũ Hành Sơn',
        category: 'LANDMARK',
        coords: [15.9870, 108.2480],
        tags: ['cau co co', 'song co co', 'ngu hanh son', 'hoa hai']
    }
];

// COMPONENT CHÍNH
export interface SOSMapProps {
    height?: string;
    focusCoords?: [number, number] | null;
    onPinConfirm?: (coords: [number, number]) => void;
}

const SOSMap: React.FC<SOSMapProps> = ({
    height,
    focusCoords,
    onPinConfirm
}) => {
    const [position, setPosition] = useState<[number, number] | null>([16.0544, 108.2022]); // Mặc định ở Đà Nẵng
    const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null);

    // Đồng bộ focusCoords từ bên ngoài khi click chọn ca cứu nạn
    useEffect(() => {
        if (focusCoords) {
            setPosition(focusCoords);
            setFlyToCoords(focusCoords);
        }
    }, [focusCoords]);
    const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');
    
    // Trạng thái công cụ
    const [isPinMode, setIsPinMode] = useState(false); // Bật/Tắt chế độ click thả ghim
    const [showFloodZone, setShowFloodZone] = useState(true); // Ẩn/Hiện vùng ngập
    const [showShelters, setShowShelters] = useState(true); // Ẩn/Hiện điểm trú ẩn

    // Thanh tìm kiếm địa chỉ & từ khóa
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef<any>(null);

    // Xử lý tìm kiếm thông minh kết hợp cả POI cứu nạn địa phương và Geocoding API
    const performSearch = async (val: string) => {
        if (!val.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        const qClean = removeVietnameseTones(val);

        // 1. Tìm kiếm cục bộ trong danh bạ khẩn cấp Đà Nẵng (Khớp cả tên, địa chỉ và từ khóa tags)
        const localMatches = EMERGENCY_LOCATIONS_DATABASE.filter(item => {
            const nameClean = removeVietnameseTones(item.name);
            const subClean = removeVietnameseTones(item.subtext);
            const matchTag = item.tags.some(tag => tag.includes(qClean) || qClean.includes(tag));
            return nameClean.includes(qClean) || subClean.includes(qClean) || matchTag;
        }).map(item => ({
            id: item.id,
            name: item.name,
            subtext: item.subtext,
            category: item.category,
            coords: item.coords,
            isLocal: true
        }));

        // 2. Dự phòng tìm kiếm bằng Photon Geocoding API (Không bị chặn CORS ở localhost)
        let apiMatches: any[] = [];
        try {
            const res = await fetch(
                `https://photon.komoot.io/api/?q=${encodeURIComponent(val)}&lat=16.0544&lon=108.2022&limit=4`
            );
            const data = await res.json();
            if (data && data.features) {
                apiMatches = data.features.map((f: any, idx: number) => ({
                    id: `api-${idx}`,
                    name: f.properties.name || f.properties.street || val,
                    subtext: [f.properties.district, f.properties.city || 'Đà Nẵng', f.properties.country].filter(Boolean).join(', '),
                    category: 'LANDMARK',
                    coords: [f.geometry.coordinates[1], f.geometry.coordinates[0]], // GeoJSON lon, lat -> Leaflet lat, lon
                    isLocal: false
                }));
            }
        } catch {
            // Bỏ qua lỗi mạng từ API ngoài, dùng kết quả local
        }

        // Kết hợp và ưu tiên kết quả cứu hộ địa phương
        const combined = [...localMatches, ...apiMatches];
        setSearchResults(combined.slice(0, 7));
        setIsSearching(false);
    };

    const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchQuery(val);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!val.trim()) {
            setSearchResults([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(() => {
            performSearch(val);
        }, 300);
    };

    // Khi click chọn từ khóa nhanh (Chips)
    const handleQuickKeyword = (keyword: string) => {
        setSearchQuery(keyword);
        performSearch(keyword);
    };

    // Khi chọn 1 kết quả tìm kiếm
    const handleSelectLocation = (item: any) => {
        setPosition(item.coords);
        setFlyToCoords(item.coords);
        setSearchResults([]);
        setSearchQuery(item.name);
    };

    // Tự động lấy vị trí GPS từ thiết bị
    const handleAutoLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                    setPosition(coords);
                    setFlyToCoords(coords);
                },
                () => alert("Không thể lấy vị trí. Vui lòng cấp quyền GPS cho trình duyệt!")
            );
        }
    };

    // Google Maps Tile URLs
    const googleTilesUrl = mapType === 'streets' 
        ? 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
        : 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* CSS Animation & Vector Icon Styling */}
            <style>{`
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
                .safe-shelter-core {
                    background: #059669;
                    color: white;
                    width: 34px;
                    height: 34px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
                    border: 2px solid white;
                }
                .pin-active-map .leaflet-container {
                    cursor: crosshair !important;
                }
            `}</style>

            {/* 1. THANH TÌM KIẾM ĐỊA ĐIỂM & TỪ KHÓA THÔNG MINH */}
            <div style={{ position: 'relative', width: '100%', zIndex: 100 }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                        <Search size={18} color="#0284c7" style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder="🔍 Tìm theo từ khóa (ví dụ: FPT, Bệnh viện, Vùng ngập, Trạm sơ tán, Cầu Rồng...)"
                            value={searchQuery}
                            onChange={handleSearchInput}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') performSearch(searchQuery);
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 16px 12px 42px',
                                borderRadius: '8px',
                                border: '2px solid #0284c7',
                                fontSize: '14px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                            }}
                        />
                        {isSearching && (
                            <span style={{ position: 'absolute', right: '14px', fontSize: '13px', color: '#64748b' }}>
                                Đang tìm...
                            </span>
                        )}
                    </div>
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                            style={{ 
                                padding: '0 14px', 
                                border: '1px solid #cbd5e1', 
                                borderRadius: '8px', 
                                cursor: 'pointer', 
                                background: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <X size={16} color="#64748b" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => performSearch(searchQuery)}
                        style={{
                            padding: '0 18px',
                            backgroundColor: '#0284c7',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Tìm
                    </button>
                </div>

                {/* CÁC THẺ TỪ KHÓA GỢI Ý NHANH (QUICK KEYWORD CHIPS) */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>Từ khóa nhanh:</span>
                    {[
                        { label: 'Bệnh viện', query: 'bệnh viện', icon: <Hospital size={14} color="#059669" /> },
                        { label: 'Vùng ngập lụt', query: 'ngập lụt', icon: <AlertTriangle size={14} color="#dc2626" /> },
                        { label: 'Trạm sơ tán', query: 'sơ tán', icon: <Shield size={14} color="#0284c7" /> },
                        { label: 'FPT City', query: 'fpt', icon: <GraduationCap size={14} color="#7c3aed" /> },
                        { label: 'Cầu Rồng', query: 'cầu rồng', icon: <Landmark size={14} color="#d97706" /> },
                        { label: 'Trà Khê', query: 'trà khê', icon: <MapPin size={14} color="#e11d48" /> }
                    ].map((k, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => handleQuickKeyword(k.query)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 10px',
                                backgroundColor: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '14px',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: '#1e293b',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e0f2fe';
                                e.currentTarget.style.borderColor = '#0284c7';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#f1f5f9';
                                e.currentTarget.style.borderColor = '#cbd5e1';
                            }}
                        >
                            {k.icon}
                            <span>{k.label}</span>
                        </button>
                    ))}
                </div>

                {/* DANH SÁCH KẾT QUẢ GỢI Ý TÌM KIẾM */}
                {searchResults.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '6px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        border: '1px solid #cbd5e1',
                        maxHeight: '280px',
                        overflowY: 'auto',
                        zIndex: 1000
                    }}>
                        {searchResults.map((item, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleSelectLocation(item)}
                                style={{
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    borderBottom: idx < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    fontSize: '14px',
                                    color: '#1e293b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '10px'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    {item.category === 'HOSPITAL' && <Hospital size={18} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />}
                                    {item.category === 'FLOOD' && <AlertTriangle size={18} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />}
                                    {item.category === 'SHELTER' && <CheckCircle2 size={18} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />}
                                    {item.category !== 'HOSPITAL' && item.category !== 'FLOOD' && item.category !== 'SHELTER' && (
                                        <MapPin size={18} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />
                                    )}
                                    <div>
                                        <b>{item.name}</b>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                            {item.subtext}
                                        </div>
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '11px',
                                    padding: '3px 8px',
                                    borderRadius: '10px',
                                    fontWeight: '600',
                                    backgroundColor: item.category === 'FLOOD' ? '#fee2e2' : item.category === 'HOSPITAL' ? '#d1fae5' : '#e0f2fe',
                                    color: item.category === 'FLOOD' ? '#b91c1c' : item.category === 'HOSPITAL' ? '#047857' : '#0369a1'
                                }}>
                                    {item.category === 'FLOOD' ? 'Vùng ngập' : item.category === 'HOSPITAL' ? 'Bệnh viện' : item.category === 'SHELTER' ? 'Sơ tán' : 'Địa danh'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 2. THANH CÔNG CỤ (ACTION TOOLBAR) */}
            <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
            }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* NÚT BẬT CHẾ ĐỘ THẢ GHIM */}
                    <button
                        type="button"
                        onClick={() => setIsPinMode(!isPinMode)}
                        style={{
                            padding: '9px 15px',
                            backgroundColor: isPinMode ? '#b91c1c' : '#dc2626',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: isPinMode ? '2px solid #fca5a5' : 'none',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            boxShadow: isPinMode ? '0 0 10px rgba(220,38,38,0.5)' : 'none'
                        }}
                    >
                        <Crosshair size={16} />
                        <span>{isPinMode ? 'ĐANG CHỌN ĐIỂM (BẤM HỦY)' : 'BẬT CHẾ ĐỘ THẢ GHIM'}</span>
                    </button>

                    {/* NÚT GPS HIỆN TẠI */}
                    <button
                        type="button"
                        onClick={handleAutoLocation}
                        style={{
                            padding: '9px 14px',
                            backgroundColor: '#0284c7',
                            color: 'white',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: 'none',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Navigation size={15} />
                        <span>GPS của tôi</span>
                    </button>

                    {/* NÚT BẬT/TẮT LỚP VÙNG NGUY HIỂM */}
                    <button
                        type="button"
                        onClick={() => setShowFloodZone(!showFloodZone)}
                        style={{
                            padding: '9px 13px',
                            backgroundColor: showFloodZone ? '#fee2e2' : '#f1f5f9',
                            color: showFloodZone ? '#991b1b' : '#64748b',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: '1px solid #cbd5e1',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <AlertTriangle size={15} color={showFloodZone ? '#dc2626' : '#64748b'} />
                        <span>{showFloodZone ? 'Hiện vùng ngập' : 'Ẩn vùng ngập'}</span>
                    </button>

                    {/* NÚT BẬT/TẮT TRẠM SƠ TÁN */}
                    <button
                        type="button"
                        onClick={() => setShowShelters(!showShelters)}
                        style={{
                            padding: '9px 13px',
                            backgroundColor: showShelters ? '#d1fae5' : '#f1f5f9',
                            color: showShelters ? '#065f46' : '#64748b',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: '1px solid #cbd5e1',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Hospital size={15} color={showShelters ? '#059669' : '#64748b'} />
                        <span>{showShelters ? 'Hiện trạm y tế' : 'Ẩn trạm y tế'}</span>
                    </button>
                </div>

                {/* NÚT CHUYỂN ĐỔI BẢN ĐỒ / VỆ TINH */}
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: '6px' }}>
                    <button
                        type="button"
                        onClick={() => setMapType('streets')}
                        style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: mapType === 'streets' ? '#0f172a' : 'transparent',
                            color: mapType === 'streets' ? 'white' : '#475569'
                        }}
                    >
                        <MapIcon size={14} />
                        <span>Bản đồ</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setMapType('satellite')}
                        style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: mapType === 'satellite' ? '#0f172a' : 'transparent',
                            color: mapType === 'satellite' ? 'white' : '#475569'
                        }}
                    >
                        <Satellite size={14} />
                        <span>Vệ tinh</span>
                    </button>
                </div>
            </div>

            {/* BANNER THÔNG BÁO KHI BẬT CHẾ ĐỘ CHỌN ĐIỂM */}
            {isPinMode && (
                <div style={{
                    padding: '10px 16px',
                    backgroundColor: '#fef2f2',
                    border: '1px dashed #ef4444',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Crosshair size={18} color="#dc2626" />
                        <span><b>Đang kích hoạt chế độ chọn vị trí:</b> Click chuột vào đúng điểm cần cứu hộ trên bản đồ.</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsPinMode(false)}
                        style={{ padding: '4px 10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                        Hủy
                    </button>
                </div>
            )}

            {/* 3. VÙNG HIỂN THỊ BẢN ĐỒ GOOGLE MAPS */}
            <div className={isPinMode ? 'pin-active-map' : ''} style={{ position: 'relative' }}>
                <MapContainer
                    center={[16.0544, 108.2022]}
                    zoom={14}
                    preferCanvas={true}
                    style={{ height: height || '500px', width: '100%', borderRadius: '10px', zIndex: 1, border: '2px solid #cbd5e1' }}
                >
                    <TileLayer
                        key={mapType}
                        url={googleTilesUrl}
                        subdomains={['0', '1', '2', '3']}
                        attribution="&copy; Google Maps"
                        maxZoom={20}
                    />

                    {/* Controller điều phối việc click và di chuyển tâm */}
                    <MapController
                        position={position}
                        setPosition={setPosition}
                        isPinMode={isPinMode}
                        setIsPinMode={setIsPinMode}
                        flyToCoords={flyToCoords}
                    />

                    {/* Lớp hiển thị Vùng ngập lụt nguy hiểm */}
                    {showFloodZone && (
                        <Polygon
                            positions={[
                                [16.028, 108.215],
                                [16.035, 108.230],
                                [16.025, 108.238],
                                [16.018, 108.220]
                            ]}
                            pathOptions={{
                                color: '#B91C1C',
                                fillColor: '#EF4444',
                                fillOpacity: 0.35,
                                weight: 2,
                                dashArray: '8, 8'
                            }}
                        >
                            <Popup>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#DC2626', fontWeight: 'bold', marginBottom: '4px' }}>
                                    <AlertTriangle size={15} color="#DC2626" />
                                    <span>VÙNG NGẬP LỤT NGUY HIỂM CẤP ĐỘ 3</span>
                                </div>
                                Mực nước dâng cao trên 1.5m. Đang cô lập cục bộ.
                            </Popup>
                        </Polygon>
                    )}

                    {/* Lớp hiển thị Trạm sơ tán / Y tế */}
                    {showShelters && (
                        <Marker position={[16.068, 108.212]} icon={safeShelterIcon}>
                            <Popup>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 'bold', marginBottom: '4px' }}>
                                    <Hospital size={15} color="#059669" />
                                    <span>TRẠM SƠ TÁN &amp; Y TẾ AN TOÀN</span>
                                </div>
                                Sức chứa: 250 người. Có sẵn lương thực &amp; nước sạch.
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>
            </div>

            {/* 4. BẢNG THÔNG TIN TỌA ĐỘ VÀ NÚT XÁC NHẬN BÁO NẠN */}
            {position && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '14px 18px',
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 'bold', fontSize: '15px' }}>
                            <MapPin size={17} color="#dc2626" />
                            <span>Tọa độ điểm cứu hộ đã chọn:</span>
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '14px', color: '#334155' }}>
                            Kinh độ (Lng): <b style={{ color: '#0284c7' }}>{position[1].toFixed(6)}</b> &nbsp;|&nbsp; 
                            Vĩ độ (Lat): <b style={{ color: '#0284c7' }}>{position[0].toFixed(6)}</b>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            if (onPinConfirm && position) {
                                onPinConfirm(position);
                            } else {
                                alert(`Đã chốt tọa độ báo nạn: [${position[0]}, ${position[1]}]. Sẵn sàng gửi yêu cầu SOS!`);
                            }
                        }}
                        style={{
                            padding: '10px 22px',
                            backgroundColor: '#16a34a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 6px rgba(22,163,74,0.3)'
                        }}
                    >
                        <CheckCircle2 size={18} />
                        <span>XÁC NHẬN VỊ TRÍ NÀY</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default SOSMap;
