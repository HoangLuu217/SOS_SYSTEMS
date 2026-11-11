import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Truck,
  LifeBuoy,
  RefreshCw,
  Search,
  X,
  AlertTriangle,
  Eye,
  Check,
  CheckCircle2,
  MapPin,
  PlusCircle,
  Trash2,
  LogOut,
  ArrowRightLeft,
  Bike,
  Wrench,
  Pencil,
  Minus,
  Plus,
  Calendar,
  Package,
  Send,
  PackageCheck,
  Building2,
  Info,
  Phone,
  History,
  Plane,
  FilterX,
  RotateCcw,
} from 'lucide-react';
import type { VehicleItem, VehicleType, RescueTeamItem, AdministrativeAreaItem } from '@/types/dashboard';
import type { User } from '@/types/auth';
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchRescueTeams,
  fetchAdministrativeAreas,
  fetchEquipments,
  createEquipment,
  updateEquipment,
  transferEquipment,
  consumeEquipment,
  batchConsumeEquipments,
  updateEquipmentStatus,
  deleteEquipment,
  type EquipmentItem,
} from '@/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchSafeLocations } from '@/api/shelter.api';
import { getAreaCoordinates } from '@/features/authorities/AreaPreviewMap';
import { domainDService } from '@/services/domainDService';
import { useAdministrativeFilter } from '@/hooks/useAdministrativeFilter';
import { toast } from '@/components/common/toast';
import '@/features/sos/SosRequestsView.css';
import '@/features/rescuers/RescuerApprovalView.css';
import '@/features/rescuers/RescuersView.css';
import './ResourcesView.css';

export interface ResourcesViewProps {
  vehicles?: VehicleItem[];
  rescueTeams?: RescueTeamItem[];
  onOpenMap?: (sosId?: any) => void;
  user?: User;
}

export const STANDARD_EQUIPMENT_CATALOG = [
  { name: 'Áo phao cứu sinh', category: 'LIFE_VEST', unit: 'chiếc' },
  { name: 'Bộ đàm vô tuyến dã chiến', category: 'COMMUNICATION', unit: 'cái' },
  { name: 'Túi sơ cứu y tế dã chiến', category: 'MEDICAL_KIT', unit: 'túi' },
  { name: 'Đèn pin cứu hộ siêu sáng', category: 'LIGHTING', unit: 'cái' },
  { name: 'Dây thừng cứu hộ 50m', category: 'ROPE_TOOL', unit: 'cuộn' },
  { name: 'Máy cưa xích cứu hộ', category: 'TOOL', unit: 'chiếc' },
];

export const STANDARD_CONSUMABLE_CATALOG = [
  { name: 'Lương khô quân đội 702', category: 'FOOD_WATER', unit: 'thùng', minThreshold: 30 },
  { name: 'Nước suối đóng chai 500ml', category: 'FOOD_WATER', unit: 'thùng (24 chai)', minThreshold: 50 },
  { name: 'Bình nước tinh khiết 20L', category: 'FOOD_WATER', unit: 'bình', minThreshold: 20 },
  { name: 'Viên khử khuẩn lọc nước Aquatabs', category: 'WATER_PURIFICATION', unit: 'hộp', minThreshold: 25 },
  { name: 'Bông băng gạc tiệt trùng', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 40 },
  { name: 'Thuốc sát trùng Povidone Iodine', category: 'MEDICAL_SUPPLY', unit: 'chai', minThreshold: 30 },
  { name: 'Thuốc hạ sốt Paracetamol 500mg', category: 'MEDICAL_SUPPLY', unit: 'hộp', minThreshold: 30 },
  { name: 'Xăng RON 95 (ca-nô & máy nổ)', category: 'FUEL', unit: 'can 20L', minThreshold: 20 },
  { name: 'Áo mưa tiện lợi dã chiến', category: 'HYGIENE', unit: 'gói', minThreshold: 50 },
  { name: 'Pin đại D/AA dã chiến', category: 'HYGIENE', unit: 'vỉ', minThreshold: 30 },
];

export const generateRandomEquipmentSerial = (category?: string) => {
  const prefixMap: Record<string, string> = {
    LIFE_VEST: 'AP',
    COMMUNICATION: 'BD',
    MEDICAL_KIT: 'YT',
    LIGHTING: 'DP',
    ROPE_TOOL: 'DT',
    TOOL: 'CX',
  };
  const prefix = (category && prefixMap[category]) || 'KT';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `LÔ-${prefix}-${randomNum}`;
};

export const getEquipmentCategoryName = (category?: string) => {
  const map: Record<string, string> = {
    LIFE_VEST: 'Áo phao cứu sinh',
    COMMUNICATION: 'Bộ đàm vô tuyến',
    MEDICAL_KIT: 'Túi sơ cứu y tế',
    LIGHTING: 'Đèn pin cứu hộ',
    ROPE_TOOL: 'Dây thừng cứu hộ',
    TOOL: 'Máy cưa & Công cụ',
    FOOD_WATER: 'Lương thực & Nước uống',
    WATER_PURIFICATION: 'Xử lý & Lọc nước sạch',
    MEDICAL_SUPPLY: 'Dược phẩm & Y tế',
    FUEL: 'Xăng dầu & Nhiên liệu',
    HYGIENE: 'Nhu yếu phẩm & Vệ sinh',
  };
  return (category && map[category]) || category || 'Thiết bị cứu hộ';
};

export const getVehicleStatusMeta = (status?: string) => {
  const s = (status || 'AVAILABLE').toUpperCase();
  switch (s) {
    case 'IN_USE':
    case 'ON_MISSION':
    case 'ASSIGNED':
      return {
        label: 'Đang làm nhiệm vụ',
        bg: '#eff6ff',
        color: '#1d4ed8',
        border: '#bfdbfe',
        dot: '#3b82f6',
      };
    case 'MAINTENANCE':
      return {
        label: 'Bảo dưỡng / Hỏng hóc',
        bg: '#fee2e2',
        color: '#b91c1c',
        border: '#fecaca',
        dot: '#dc2626',
      };
    case 'INACTIVE':
      return {
        label: 'Tạm ngưng hoạt động',
        bg: '#f1f5f9',
        color: '#475569',
        border: '#cbd5e1',
        dot: '#94a3b8',
      };
    case 'AVAILABLE':
    case 'READY':
    default:
      return {
        label: 'Sẵn sàng xuất kích',
        bg: '#ecfdf5',
        color: '#047857',
        border: '#a7f3d0',
        dot: '#10b981',
      };
  }
};

export interface VehicleTypeOption {
  value: string;
  label: string;
  group: string;
  defaultCapacity: number;
  subLabel?: string;
}

export const STANDARD_VEHICLE_TYPES: VehicleTypeOption[] = [
  { value: 'BOAT', label: 'Xuồng máy', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 8, subLabel: 'Động cơ gắn ngoài' },
  { value: 'COMPOSITE_BOAT', label: 'Xuồng composite gắn máy', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 6, subLabel: 'Vỏ composite gia cường' },
  { value: 'RUBBER_BOAT', label: 'Xuồng cao su cứu hộ', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 6, subLabel: 'Bơm hơi đa khoang' },
  { value: 'ROWBOAT', label: 'Thuyền chèo', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 4, subLabel: 'Chèo tay tiếp cận ngõ sâu' },
  { value: 'LIFE_RAFT', label: 'Phao bè cứu sinh', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 10, subLabel: 'Bè cứu sinh tự bung' },
  { value: 'JET_SKI', label: 'Mô tô nước', group: 'Phương tiện thủy cứu nạn', defaultCapacity: 2, subLabel: 'Cơ động siêu tốc vượt dòng xiết' },
  { value: 'PICKUP_4X4', label: 'Xe bán tải 4x4', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 5, subLabel: 'Gầm nhấc dẫn động 2 cầu' },
  { value: 'TRUCK', label: 'Xe tải gầm cao', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 12, subLabel: 'Xe tải tác chiến vượt lũ' },
  { value: 'AMBULANCE', label: 'Xe cứu thương', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 4, subLabel: 'Cấp cứu y tế tiền phương' },
  { value: 'AMPHIBIOUS_VEHICLE', label: 'Xe bọc thép lội nước', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 16, subLabel: 'Thiết giáp lội nước sâu' },
  { value: 'DRONE', label: 'Drone vận chuyển', group: 'Thiết bị bay chuyên dụng', defaultCapacity: 1, subLabel: 'Tiếp tế hàng & thả phao từ trên cao' },
  { value: 'MOTORBIKE', label: 'Xe máy cơ động', group: 'Xe cơ giới đường bộ & lội nước', defaultCapacity: 2, subLabel: 'Luồn lách ngõ hẻm đô thị' },
  { value: 'OTHER', label: 'Phương tiện đặc chủng khác', group: 'Đặc chủng khác', defaultCapacity: 6, subLabel: 'Phương tiện cơ động chuyên dụng' },
];

export const getVehicleTypeLabel = (type?: string): string => {
  if (!type) return 'Phương tiện đặc chủng';
  const found = STANDARD_VEHICLE_TYPES.find((v) => v.value === type);
  if (found) return found.label;

  switch (type.toUpperCase()) {
    case 'MOTORBOAT':
      return 'Xuồng máy';
    case 'INFLATABLE_BOAT':
      return 'Xuồng cao su cứu hộ';
    case 'PICKUP':
    case 'PICKUP_TRUCK':
      return 'Xe bán tải 4x4';
    case 'HIGH_CLEARANCE_TRUCK':
      return 'Xe tải gầm cao';
    case 'ARMORED_CAR':
      return 'Xe bọc thép lội nước';
    case 'DELIVERY_DRONE':
      return 'Drone vận chuyển';
    default:
      return 'Phương tiện đặc chủng khác';
  }
};

export const getVehicleIcon = (type?: string, size = 15) => {
  const t = (type || '').toUpperCase();
  if (['BOAT', 'MOTORBOAT', 'COMPOSITE_BOAT', 'RUBBER_BOAT', 'INFLATABLE_BOAT', 'ROWBOAT', 'LIFE_RAFT', 'JET_SKI'].includes(t)) {
    return <LifeBuoy size={size} />;
  }
  if (['DRONE', 'DELIVERY_DRONE'].includes(t)) {
    return <Plane size={size} />;
  }
  if (t === 'MOTORBIKE') {
    return <Bike size={size} />;
  }
  if (t === 'OTHER') {
    return <Wrench size={size} />;
  }
  return <Truck size={size} />;
};

export const VIETNAM_PROVINCE_PLATE_CODES: Record<string, string[]> = {
  'Hà Nội': ['29', '30', '31', '32', '33', '40', 'HN'],
  'Hồ Chí Minh': ['50', '51', '52', '53', '54', '55', '56', '57', '58', '59', 'SG', 'HCM'],
  'Đà Nẵng': ['43', 'ĐN', 'DN'],
  'Hải Phòng': ['15', '16', 'HP'],
  'Cần Thơ': ['65', 'CT'],
  'An Giang': ['67'],
  'Bà Rịa - Vũng Tàu': ['72', 'BRVT', 'VT'],
  'Bắc Giang': ['98'],
  'Bắc Kạn': ['97'],
  'Bạc Liêu': ['94'],
  'Bắc Ninh': ['99', 'BN'],
  'Bến Tre': ['71'],
  'Bình Định': ['77'],
  'Bình Dương': ['61', 'BD'],
  'Bình Phước': ['93'],
  'Bình Thuận': ['86'],
  'Cà Mau': ['69'],
  'Cao Bằng': ['11'],
  'Đắk Lắk': ['47'],
  'Đắk Nông': ['48'],
  'Điện Biên': ['27'],
  'Đồng Nai': ['60', '39'],
  'Đồng Tháp': ['66'],
  'Gia Lai': ['81'],
  'Hà Giang': ['23'],
  'Hà Nam': ['90'],
  'Hà Tĩnh': ['38'],
  'Hải Dương': ['34'],
  'Hậu Giang': ['95'],
  'Hòa Bình': ['28'],
  'Hưng Yên': ['89'],
  'Khánh Hòa': ['79', 'KH'],
  'Kiên Giang': ['68'],
  'Kon Tum': ['82'],
  'Lai Châu': ['25'],
  'Lâm Đồng': ['49'],
  'Lạng Sơn': ['12'],
  'Lào Cai': ['24'],
  'Long An': ['62'],
  'Nam Định': ['18'],
  'Nghệ An': ['37', 'NA'],
  'Ninh Bình': ['35'],
  'Ninh Thuận': ['85'],
  'Phú Thọ': ['19'],
  'Phú Yên': ['78'],
  'Quảng Bình': ['73', 'QB'],
  'Quảng Nam': ['92', 'QNA'],
  'Quảng Ngãi': ['76', 'QNG'],
  'Quảng Ninh': ['14', 'QN'],
  'Quảng Trị': ['74', 'QT'],
  'Sóc Trăng': ['83'],
  'Sơn La': ['26'],
  'Tây Ninh': ['70'],
  'Thái Bình': ['17'],
  'Thái Nguyên': ['20'],
  'Thanh Hóa': ['36', 'TH'],
  'Thừa Thiên Huế': ['75', 'TTH', 'HUE'],
  'Tiền Giang': ['63'],
  'Trà Vinh': ['84'],
  'Tuyên Quang': ['22'],
  'Vĩnh Long': ['64'],
  'Vĩnh Phúc': ['88'],
  'Yên Bái': ['21'],
};

export function isVehicleMatchingProvince(v: VehicleItem, provName: string): boolean {
  if (!v || !provName || provName === 'ALL') return true;

  const cleanProv = provName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '')
    .trim();

  // 1. Kiểm tra biển số / mô tả có chứa tên tỉnh
  const text = `${v.plateNumber || ''} ${v.description || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (cleanProv && text.includes(cleanProv)) return true;

  // 2. Kiểm tra đầu biển số theo quy chuẩn mã vùng Việt Nam
  const plateClean = (v.plateNumber || '').toUpperCase().trim();
  for (const [pKey, codes] of Object.entries(VIETNAM_PROVINCE_PLATE_CODES)) {
    const normKey = pKey
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (normKey === cleanProv || cleanProv.includes(normKey) || normKey.includes(cleanProv)) {
      return codes.some((code) => plateClean.startsWith(code));
    }
  }

  return false;
}

// Component Modal Ghim Vị Trí Trên Bản Đồ (Google Maps Tiles qua Leaflet, click chọn tọa độ chuẩn xác)
const LocationMapPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialCoords?: [number, number] | null; // [lng, lat]
  areaName?: string;
  onConfirm: (coords: [number, number] | null, address?: string) => void;
}> = ({ isOpen, onClose, initialCoords, areaName, onConfirm }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [picked, setPicked] = useState<[number, number] | null>(initialCoords || null);
  const [addressPreview, setAddressPreview] = useState<string>('');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setPicked(initialCoords || null);
    setAddressPreview('');

    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const defaultCenter = initialCoords
        ? [initialCoords[1], initialCoords[0]]
        : [getAreaCoordinates(areaName || 'Đà Nẵng').lat, getAreaCoordinates(areaName || 'Đà Nẵng').lng];

      const map = L.map(containerRef.current, {
        center: defaultCenter as [number, number],
        zoom: initialCoords ? 15 : 13,
        zoomControl: true,
        attributionControl: false,
      });

      // Lớp bản đồ Google Maps Tiles qua Leaflet (đầy đủ chi tiết đường sá, hoàn toàn miễn phí)
      L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&apistyle=s.t:33|p.v:off&x={x}&y={y}&z={z}', {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      const redPinIcon = L.divIcon({
        className: 'sos-picker-red-pin',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50% 50% 50% 0;
            background: #dc2626;
            transform: rotate(-45deg);
            border: 2px solid #ffffff;
            box-shadow: 0 3px 8px rgba(220, 38, 38, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <div style="width: 10px; height: 10px; background: #ffffff; border-radius: 50%; transform: rotate(45deg);"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      if (initialCoords) {
        markerRef.current = L.marker([initialCoords[1], initialCoords[0]], { icon: redPinIcon }).addTo(map);
      }

      // Lắng nghe click chuột trên bản đồ để ghim tọa độ
      map.on('click', async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setPicked([lng, lat]);

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: redPinIcon }).addTo(map);
        }

        // Tự động tìm địa chỉ qua OpenStreetMap reverse geocoding
        try {
          setIsGeocoding(true);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'vi' } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.display_name) {
              setAddressPreview(data.display_name);
            }
          }
        } catch (_) {
        } finally {
          setIsGeocoding(false);
        }
      });
    }, 120);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, initialCoords, areaName]);

  if (!isOpen) return null;

  return (
    <div className="executive-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="executive-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: '92vw', padding: 0, overflow: 'hidden' }}
      >
        <div className="executive-modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color="#0284c7" />
              <span>Ghim vị trí điểm tiếp tế / vùng ngập lụt</span>
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#64748b' }}>
              Click chuột trực tiếp lên bản đồ để đánh dấu tọa độ GPS chính xác cho Đội cứu hộ
            </p>
          </div>
          <button type="button" onClick={onClose} className="executive-modal-close">
            <X size={18} />
          </button>
        </div>

        <div style={{ height: 380, width: '100%', position: 'relative' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {!picked && (
            <div style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 500,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}>
              👆 Click lên bản đồ để ghim điểm cứu trợ
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {picked ? (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#16a34a' }}>●</span>
                  <span>Tọa độ GPS: [{picked[1].toFixed(5)}, {picked[0].toFixed(5)}]</span>
                </div>
                {addressPreview && (
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isGeocoding ? 'Đang tìm tên địa điểm...' : addressPreview}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Chưa có điểm nào được ghim trên bản đồ
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {picked && (
              <button
                type="button"
                onClick={() => {
                  onConfirm(null, '');
                  onClose();
                }}
                className="executive-btn-secondary"
                style={{
                  padding: '7px 12px',
                  fontSize: 12.5,
                  borderRadius: 8,
                  color: '#dc2626',
                  borderColor: '#fca5a5',
                  background: '#fef2f2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
                title="Bỏ ghim tọa độ này"
              >
                <Trash2 size={13} />
                <span>Bỏ ghim</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="executive-btn-secondary"
              style={{ padding: '7px 14px', fontSize: 12.5, borderRadius: 8 }}
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!picked}
              onClick={() => {
                if (picked) {
                  onConfirm(picked, addressPreview);
                  onClose();
                }
              }}
              className="executive-btn-primary"
              style={{
                padding: '7px 16px',
                fontSize: 12.5,
                borderRadius: 8,
                background: picked ? '#0284c7' : '#94a3b8',
                cursor: picked ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Check size={15} />
              <span>Xác nhận vị trí này</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const parseEquipmentNote = (rawNote?: string | null) => {
  if (!rawNote) {
    return {
      specs: 'Trang thiết bị / vật tư đạt tiêu chuẩn kiểm định cơ quan phòng chống thiên tai, bảo quản nơi khô ráo, sẵn sàng phân phối khi có lệnh.',
      logs: [] as string[],
    };
  }

  const parts = rawNote.split(' | ').map((p) => p.trim()).filter(Boolean);
  const logs: string[] = [];
  const specsParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith('[') && part.endsWith(']')) {
      logs.push(part.slice(1, -1));
    } else {
      specsParts.push(part);
    }
  }

  return {
    specs:
      specsParts.length > 0
        ? specsParts.join(' | ')
        : 'Trang thiết bị / vật tư đạt tiêu chuẩn kiểm định cơ quan phòng chống thiên tai, bảo quản nơi khô ráo, sẵn sàng phân phối khi có lệnh.',
    logs: logs.reverse(), // Gần nhất xếp lên đầu
  };
};

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  vehicles: propVehicles = [],
  rescueTeams: propTeams = [],
  onOpenMap,
  user,
}) => {
  const [vehicles, setVehicles] = useState<VehicleItem[]>(propVehicles);
  const [rescueTeams, setRescueTeams] = useState<RescueTeamItem[]>(propTeams);
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [equipmentsLoading, setEquipmentsLoading] = useState(false);
  const [resourceTab, setResourceTab] = useState<'VEHICLES' | 'SUPPLIES' | 'CONSUMABLES'>('VEHICLES');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Phân quyền: Cán bộ địa phương (Local) chỉ xem phương tiện/vật tư của địa bàn mình quản lý, Admin xem tất cả
  const activeOfficer = domainDService.getActiveOfficer();
  const isAdmin = user?.roles?.includes('ADMIN') || (user as any)?.role === 'ADMIN' || activeOfficer?.role === 'ADMIN';

  const userAreaId =
    user?.authority?.areaId ||
    (user?.authority as any)?.administrativeAreaId ||
    (user?.authority as any)?.jurisdictionAreaId ||
    activeOfficer?.jurisdictionAreaId;

  const userAreaName =
    user?.authority?.areaName ||
    (user?.authority as any)?.jurisdictionAreaName ||
    activeOfficer?.jurisdictionAreaName ||
    '';

  const {
    provinces,
    provincesLoading,
    selectedProvince,
    setSelectedProvince,
    wards,
    wardsLoading,
    selectedAreaId,
    setSelectedAreaId,
    dbAreas: areas,
    managedArea,
    isTeamInTargetArea,
  } = useAdministrativeFilter({
    isAdmin,
    userAreaId,
    userAreaName,
  });

  const effectiveAreaId = !isAdmin
    ? (managedArea?._id || userAreaId || (userAreaName ? userAreaName : 'ALL'))
    : selectedAreaId;

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [vehicleTeamFilter, setVehicleTeamFilter] = useState<string>('ALL');
  const [supplyTypeFilter, setSupplyTypeFilter] = useState<'ALL' | 'DURABLE' | 'CONSUMABLE'>('ALL');
  const [supplyCategoryFilter, setSupplyCategoryFilter] = useState<string>('ALL');
  const [supplyTeamFilter, setSupplyTeamFilter] = useState<string>('DEPOT');
  const [consumableCategoryFilter, setConsumableCategoryFilter] = useState<string>('ALL');
  const [consumableTeamFilter, setConsumableTeamFilter] = useState<string>('DEPOT');

  // Tự động nhận diện bộ lọc từ URL (khi được điều hướng từ Sidebar hoặc Quản lý Đội Cứu Hộ)
  useEffect(() => {
    const applyUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      const teamParam = params.get('teamId') || params.get('team');
      const tabParam = params.get('tab');
      const queryParam = params.get('q') || params.get('search');
      const path = window.location.pathname.toLowerCase();

      if (teamParam) {
        setVehicleTeamFilter(teamParam);
        setSupplyTeamFilter(teamParam);
        setConsumableTeamFilter(teamParam);
      }
      if (tabParam === 'SUPPLIES' || tabParam === 'supplies' || path.includes('/supplies')) {
        setResourceTab('SUPPLIES');
      } else if (tabParam === 'CONSUMABLES' || tabParam === 'consumables' || path.includes('/consumables')) {
        setResourceTab('SUPPLIES');
        setSupplyTypeFilter('CONSUMABLE');
      } else if (tabParam === 'VEHICLES' || tabParam === 'vehicles' || path.includes('/vehicles')) {
        setResourceTab('VEHICLES');
      }
      if (queryParam) {
        setSearchQuery(queryParam);
      }
    };

    const handleTabEvent = (e: any) => {
      const tab = e?.detail?.tab;
      if (tab === 'VEHICLES' || tab === 'SUPPLIES') {
        setResourceTab(tab);
        setSearchQuery('');
        setCurrentPage(1);
      } else if (tab === 'CONSUMABLES') {
        setResourceTab('SUPPLIES');
        setSupplyTypeFilter('CONSUMABLE');
        setSearchQuery('');
        setCurrentPage(1);
      }
    };

    applyUrlParams();
    window.addEventListener('popstate', applyUrlParams);
    window.addEventListener('sos_switch_resource_tab', handleTabEvent);
    return () => {
      window.removeEventListener('popstate', applyUrlParams);
      window.removeEventListener('sos_switch_resource_tab', handleTabEvent);
    };
  }, []);

  // Modals / Slide-over Drawers
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleItem | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentItem | null>(null);
  const [isCreateVehicleOpen, setIsCreateVehicleOpen] = useState(false);

  // New vehicle form state
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState<VehicleType>('BOAT');
  const [newCapacity, setNewCapacity] = useState<number>(8);
  const [newTeamId, setNewTeamId] = useState<string>('');
  const [newDescription, setNewDescription] = useState('');
  const [isSubmittingVehicle, setIsSubmittingVehicle] = useState(false);

  // Edit vehicle form state
  const [editVehicleTarget, setEditVehicleTarget] = useState<VehicleItem | null>(null);
  const [editVehiclePlate, setEditVehiclePlate] = useState('');
  const [editVehicleType, setEditVehicleType] = useState<VehicleType>('BOAT');
  const [editVehicleCapacity, setEditVehicleCapacity] = useState<number>(6);
  const [editVehicleStatus, setEditVehicleStatus] = useState<'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE'>('AVAILABLE');
  const [editVehicleTeamId, setEditVehicleTeamId] = useState<string>('');
  const [editVehicleDescription, setEditVehicleDescription] = useState('');
  const [isUpdatingVehicle, setIsUpdatingVehicle] = useState(false);

  // Batch Assign Vehicles to Team Modal State
  const [isAssignVehicleModalOpen, setIsAssignVehicleModalOpen] = useState(false);
  const [assignTargetTeamId, setAssignTargetTeamId] = useState<string>('');
  const [selectedVehiclesToAssign, setSelectedVehiclesToAssign] = useState<string[]>([]);
  const [assignVehicleNote, setAssignVehicleNote] = useState<string>('');
  const [isAssigningVehicles, setIsAssigningVehicles] = useState(false);

  // Batch Assign Equipment to Team Modal State
  const [isAssignEquipmentModalOpen, setIsAssignEquipmentModalOpen] = useState(false);
  const [assignEquipTargetTeamId, setAssignEquipTargetTeamId] = useState<string>('');
  const [selectedEquipmentsToAssign, setSelectedEquipmentsToAssign] = useState<Record<string, number>>({});
  const [assignEquipNote, setAssignEquipNote] = useState<string>('');
  const [isAssigningEquipment, setIsAssigningEquipment] = useState(false);
  const [assignEquipSupplyType, setAssignEquipSupplyType] = useState<'ALL' | 'DURABLE' | 'CONSUMABLE'>('ALL');

  // Equipment dispatch / create form state
  const [isCreateEquipmentOpen, setIsCreateEquipmentOpen] = useState(false);
  const [eqTeamId, setEqTeamId] = useState<string>('');
  const [eqName, setEqName] = useState<string>('');
  const [customEqName, setCustomEqName] = useState<string>('');
  const [eqCategory, setEqCategory] = useState<string>('LIFE_VEST');
  const [eqSupplyType, setEqSupplyType] = useState<'DURABLE' | 'CONSUMABLE'>('DURABLE');
  const [eqSerialNumber, setEqSerialNumber] = useState<string>('');
  const [eqQuantity, setEqQuantity] = useState<number>(1);
  const [eqUnit, setEqUnit] = useState<string>('chiếc');
  const [eqReceivedAt, setEqReceivedAt] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [eqMinThreshold, setEqMinThreshold] = useState<number>(20);
  const [eqNote, setEqNote] = useState<string>('');
  const [isSubmittingEquipment, setIsSubmittingEquipment] = useState(false);

  // Consume / Dispatch Relief Supply Modal State
  const [consumeTarget, setConsumeTarget] = useState<EquipmentItem | null>(null);
  const [consumeQuantity, setConsumeQuantity] = useState<number>(1);
  const [consumeDestination, setConsumeDestination] = useState<string>('');
  const [consumeNote, setConsumeNote] = useState<string>('');
  const [isConsuming, setIsConsuming] = useState<boolean>(false);

  // Batch Consume Relief Supplies Modal State (Phiếu xuất cấp cứu trợ tổng hợp)
  interface BatchConsumeItem {
    equipmentId: string;
    quantity: number;
  }
  const [isBatchConsumeOpen, setIsBatchConsumeOpen] = useState<boolean>(false);
  const [batchDestination, setBatchDestination] = useState<string>('');
  const [batchRecipientName, setBatchRecipientName] = useState<string>('');
  const [batchNote, setBatchNote] = useState<string>('');
  const [batchItems, setBatchItems] = useState<BatchConsumeItem[]>([]);
  const [batchDispatchMode, setBatchDispatchMode] = useState<'ASSIGN_TEAM' | 'DIRECT'>('ASSIGN_TEAM');
  const [batchTeamId, setBatchTeamId] = useState<string>('');
  const [batchPriority, setBatchPriority] = useState<string>('HIGH');
  const [batchCoordinates, setBatchCoordinates] = useState<[number, number] | null>(null);
  const [isMapPickerOpen, setIsMapPickerOpen] = useState<boolean>(false);
  const [safeLocations, setSafeLocations] = useState<any[]>([]);
  const [isSubmittingBatchConsume, setIsSubmittingBatchConsume] = useState<boolean>(false);

  // Multi-select mặt hàng từ Bảng kho chính (để tạo phiếu xuất kho nhanh)
  const [selectedTableItemIds, setSelectedTableItemIds] = useState<string[]>([]);

  // Custom Action / Delete Confirmation Modal State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'UNASSIGN_VEHICLE' | 'DELETE_VEHICLE' | 'EQUIPMENT' | 'UNASSIGN_EQUIPMENT';
    id: string;
    name: string;
    teamName?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State đóng Drawer chi tiết mượt mà (Slide-out animation)
  const [isVehicleDrawerClosing, setIsVehicleDrawerClosing] = useState(false);
  const handleCloseVehicleDetail = useCallback(() => {
    if (isVehicleDrawerClosing) return;
    setIsVehicleDrawerClosing(true);
    setTimeout(() => {
      setSelectedVehicle(null);
      setIsVehicleDrawerClosing(false);
    }, 260);
  }, [isVehicleDrawerClosing]);

  const [isEquipmentDrawerClosing, setIsEquipmentDrawerClosing] = useState(false);
  const handleCloseEquipmentDetail = useCallback(() => {
    if (isEquipmentDrawerClosing) return;
    setIsEquipmentDrawerClosing(true);
    setTimeout(() => {
      setSelectedEquipment(null);
      setIsEquipmentDrawerClosing(false);
    }, 260);
  }, [isEquipmentDrawerClosing]);

  // Hỗ trợ phím ESC để đóng Drawer mượt mà
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedVehicle && !isVehicleDrawerClosing) {
          handleCloseVehicleDetail();
        } else if (selectedEquipment && !isEquipmentDrawerClosing) {
          handleCloseEquipmentDetail();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVehicle, isVehicleDrawerClosing, handleCloseVehicleDetail, selectedEquipment, isEquipmentDrawerClosing, handleCloseEquipmentDetail]);

  // Transfer / Assign Vehicle Modal State
  const [transferVehicleTarget, setTransferVehicleTarget] = useState<VehicleItem | null>(null);
  const [transferNewTeamId, setTransferNewTeamId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferVehicleError, setTransferVehicleError] = useState<string>('');

  // Transfer / Reassign Equipment Modal State
  const [transferEquipmentTarget, setTransferEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [transferEquipmentTeamId, setTransferEquipmentTeamId] = useState<string>('');
  const [transferEquipmentQuantity, setTransferEquipmentQuantity] = useState<number>(1);
  const [transferEquipmentNote, setTransferEquipmentNote] = useState<string>('');
  const [isTransferringEquipment, setIsTransferringEquipment] = useState<boolean>(false);
  const [transferEquipmentErrors, setTransferEquipmentErrors] = useState<{ team?: string; quantity?: string }>({});

  // Edit Equipment Modal State
  const [editEquipmentTarget, setEditEquipmentTarget] = useState<EquipmentItem | null>(null);
  const [editEqQuantity, setEditEqQuantity] = useState<number>(1);
  const [editEqStatus, setEditEqStatus] = useState<string>('AVAILABLE');
  const [editEqSerialNumber, setEditEqSerialNumber] = useState<string>('');
  const [editEqReceivedAt, setEditEqReceivedAt] = useState<string>('');
  const [editEqNote, setEditEqNote] = useState<string>('');
  const [isUpdatingEquipment, setIsUpdatingEquipment] = useState<boolean>(false);

  // Restock Equipment Modal State
  const [restockTarget, setRestockTarget] = useState<EquipmentItem | null>(null);
  const [restockSourceType, setRestockSourceType] = useState<'DONATION' | 'DEPOT'>('DONATION');
  const [restockQuantity, setRestockQuantity] = useState<number>(10);
  const [restockSource, setRestockSource] = useState<string>('');
  const [isRestocking, setIsRestocking] = useState<boolean>(false);

  const refreshData = () => setRefreshIndex((p) => p + 1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const [vehRes, teamRes, areasRes] = await Promise.allSettled([
        fetchVehicles({ areaId: areaParam, limit: 100 }),
        fetchRescueTeams({ areaId: areaParam, limit: 100 }),
        fetchAdministrativeAreas(),
      ]);

      // Khu vực hành chính đã được nạp và quản lý tập trung trong useAdministrativeFilter
      if (vehRes.status === 'fulfilled' && vehRes.value.success && Array.isArray(vehRes.value.data)) {
        setVehicles(vehRes.value.data);
      } else {
        setVehicles([]);
      }
      if (teamRes.status === 'fulfilled' && teamRes.value.success && Array.isArray(teamRes.value.data)) {
        setRescueTeams(teamRes.value.data);
      } else {
        setRescueTeams([]);
      }
    } catch (e) {
      console.warn('Loi tai tai nguyen:', e);
      setVehicles([]);
    } finally {
      setLoading(false);
    }

    // Load equipment rieng biet (khong block vehicles)
    try {
      setEquipmentsLoading(true);
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const eqRes = await fetchEquipments(areaParam ? { areaId: areaParam, limit: '200' } : { limit: '200' });
      if (eqRes.success && Array.isArray(eqRes.data)) {
        setEquipments(eqRes.data);
      } else {
        setEquipments([]);
      }
    } catch (e) {
      console.warn('Loi tai vat tu:', e);
      setEquipments([]);
    } finally {
      setEquipmentsLoading(false);
    }
  }, [effectiveAreaId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshIndex]);

  const rawVehicles = vehicles;

  // Resolve each vehicle strictly by team (yêu cầu: phương tiện phải get theo thằng team)
  const vehiclesWithTeam = useMemo(() => {
    return rawVehicles.map((v) => {
      let matchedTeam: RescueTeamItem | undefined = undefined;

      if (typeof v.teamId === 'object' && v.teamId) {
        matchedTeam = v.teamId as any;
      } else if (typeof v.teamId === 'string' && v.teamId) {
        matchedTeam = rescueTeams.find((t) => t._id === v.teamId);
      }

      if (!matchedTeam && v.teamId) {
        matchedTeam = rescueTeams.find((t) =>
          t.vehicles?.some((tv: any) => tv._id === v._id || tv.plateNumber === v.plateNumber)
        );
      }

      return {
        ...v,
        assignedTeam: matchedTeam,
      };
    });
  }, [rawVehicles, rescueTeams]);

  // Danh sách phương tiện tại Kho Tổng / Chưa phân công cho đội nào
  const unassignedVehicles = useMemo(() => {
    return vehiclesWithTeam.filter((v) => !v.assignedTeam && !v.teamId);
  }, [vehiclesWithTeam]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesWithTeam.filter((v) => {
      // 1. Phân quyền địa phương: Nếu không phải Admin, chỉ hiển thị phương tiện thuộc đội của địa bàn quản lý hoặc phương tiện kho tổng dự trữ
      if (!isAdmin && (managedArea || userAreaName || userAreaId)) {
        const team = v.assignedTeam;
        const hasTeam = Boolean(team || v.teamId);
        // Nếu phương tiện đã được biên chế vào một đội cứu hộ, kiểm tra xem đội đó có thuộc địa bàn quản lý không
        if (hasTeam) {
          const targetAreaId = managedArea?._id || userAreaId;
          const targetAreaName = (userAreaName || managedArea?.name || '')
            .toLowerCase()
            .replace(/^(phường|xã|quận|huyện)\s+/i, '')
            .trim();

          const teamAreaObj = typeof team?.areaId === 'object' && team?.areaId !== null ? team.areaId : null;
          const teamAreaId = teamAreaObj?._id || team?.areaId;
          const teamAreaName = (teamAreaObj?.name || (team as any)?.areaName || '').toLowerCase();
          const teamNameLower = (team?.name || '').toLowerCase();

          const matchId = targetAreaId && (teamAreaId === targetAreaId || teamAreaId === managedArea?.code);
          const matchParentChild = Boolean(
            ((teamAreaObj as any)?.parentId && ((teamAreaObj as any).parentId === targetAreaId || (teamAreaObj as any).parentId === managedArea?._id)) ||
            (managedArea?.parentId && (managedArea.parentId === teamAreaId || managedArea.parentId === (teamAreaObj as any)?._id))
          );
          const matchName = Boolean(
            targetAreaName &&
            (teamAreaName.includes(targetAreaName) ||
              targetAreaName.includes(teamAreaName) ||
              teamNameLower.includes(targetAreaName))
          );

          if (!matchId && !matchParentChild && !matchName) return false;
        }
        // Nếu không có đội (Kho tổng dự trữ / Chưa biên chế), luôn cho phép hiển thị để cán bộ địa phương thấy và điều chuyển
      }

      // 1B. Lọc theo địa bàn khi là Admin và đang chọn Tỉnh/TP hoặc 1 địa bàn cụ thể
      if (isAdmin && (selectedAreaId !== 'ALL' || selectedProvince !== 'ALL')) {
        const team = v.assignedTeam;
        const hasTeam = Boolean(team || v.teamId);
        if (hasTeam) {
          const t = team || { _id: typeof v.teamId === 'object' ? (v.teamId as any)?._id : v.teamId };
          if (!isTeamInTargetArea(t)) return false;
        } else {
          // Phương tiện chưa phân công (Kho Tổng / Kho dự trữ)
          // 1) Nếu chọn Xã/Phường cụ thể: Xe kho tổng không thuộc riêng xã/phường này -> Loại bỏ
          if (selectedAreaId !== 'ALL') {
            return false;
          }
          // 2) Nếu chọn Tỉnh/TP cụ thể: Chỉ hiển thị xe có đầu biển số hoặc địa bàn thuộc Tỉnh/TP đó
          if (selectedProvince !== 'ALL') {
            if (!isVehicleMatchingProvince(v, selectedProvince)) {
              return false;
            }
          }
        }
      }

      // 2. Lọc theo loại phương tiện
      if (vehicleTypeFilter !== 'ALL') {
        if (vehicleTypeFilter === 'BOAT') {
          const isBoat = v.type === 'BOAT' || v.type === 'MOTORBOAT' || Boolean(v.plateNumber && (v.plateNumber.includes('SEA') || v.plateNumber.includes('CL')));
          if (!isBoat) return false;
        } else if (vehicleTypeFilter === 'PICKUP_4X4') {
          if (v.type !== 'PICKUP_4X4' && v.type !== 'PICKUP_TRUCK' && v.type !== 'PICKUP') return false;
        } else if (vehicleTypeFilter === 'TRUCK') {
          if (v.type !== 'TRUCK' && v.type !== 'HIGH_CLEARANCE_TRUCK') return false;
        } else if (vehicleTypeFilter === 'OTHER') {
          const isStandard = STANDARD_VEHICLE_TYPES.some((st) => st.value === v.type && st.value !== 'OTHER');
          if (isStandard) return false;
        } else if (v.type !== vehicleTypeFilter) {
          return false;
        }
      }

      if (vehicleTeamFilter !== 'ALL') {
        if (vehicleTeamFilter === 'UNASSIGNED') {
          if (v.assignedTeam || v.teamId) return false;
        } else {
          const teamId = v.assignedTeam?._id || (typeof v.teamId === 'object' && v.teamId ? (v.teamId as any)._id : v.teamId);
          if (teamId !== vehicleTeamFilter) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (v.assignedTeam?.name || '').toLowerCase();
        const leaderObj = typeof v.assignedTeam?.leaderId === 'object' ? v.assignedTeam?.leaderId : null;
        const leaderName = (leaderObj?.fullName || '').toLowerCase();
        const plate = (v.plateNumber || '').toLowerCase();
        const desc = (v.description || '').toLowerCase();
        return plate.includes(q) || teamName.includes(q) || leaderName.includes(q) || desc.includes(q);
      }
      return true;
    });
  }, [vehiclesWithTeam, vehicleTypeFilter, vehicleTeamFilter, searchQuery, isAdmin, selectedAreaId, selectedProvince, managedArea, userAreaId, userAreaName, isTeamInTargetArea]);


  // Durable equipments (Khí tài tác chiến tái sử dụng)
  const durableEquipments = useMemo(() => {
    return equipments.filter((eq) => eq.supplyType !== 'CONSUMABLE');
  }, [equipments]);

  // Durable equipments in Kho Tổng (chưa giao cho đội nào và còn số lượng > 0)
  const depotDurableEquipments = useMemo(() => {
    return durableEquipments.filter((eq) => {
      const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
      return !tId && eq.quantity > 0;
    });
  }, [durableEquipments]);

  // Consumable supplies (Vật tư tiêu hao / Cứu trợ)
  const consumableEquipments = useMemo(() => {
    return equipments.filter((eq) => eq.supplyType === 'CONSUMABLE');
  }, [equipments]);

  // Consumable supplies in Kho Tổng (chưa giao cho đội nào và còn số lượng > 0)
  const depotConsumableEquipments = useMemo(() => {
    return consumableEquipments.filter((eq) => {
      const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
      return !tId && eq.quantity > 0;
    });
  }, [consumableEquipments]);

  // All items in Kho Tổng (cả Thiết bị cứu hộ & Nhu yếu phẩm)
  const depotAllEquipments = useMemo(() => {
    return equipments.filter((eq) => {
      const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
      return !tId && eq.quantity > 0;
    });
  }, [equipments]);

  // Filtered equipments (Gộp chung Khí tài tác chiến & Vật tư cứu trợ tổng hợp)
  const filteredEquipments = useMemo(() => {
    return equipments.filter((eq) => {
      // 0. Lọc theo Phân loại: Dùng bền (Khí tài) vs Tiêu hao (Nhu yếu phẩm)
      if (supplyTypeFilter === 'DURABLE' && eq.supplyType === 'CONSUMABLE') return false;
      if (supplyTypeFilter === 'CONSUMABLE' && eq.supplyType !== 'CONSUMABLE') return false;

      // 0B. Lọc theo địa bàn khi là Admin và đang chọn Tỉnh/TP hoặc 1 địa bàn cụ thể
      if (isAdmin && (selectedAreaId !== 'ALL' || selectedProvince !== 'ALL')) {
        const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
        if (tId) {
          const team = rescueTeams.find((t) => t._id === tId) || eq.teamId;
          if (!isTeamInTargetArea(team)) return false;
        } else {
          // Hàng cứu trợ / Thiết bị tại Kho Tổng
          // Nếu người dùng chủ động chọn xem "Kho Tổng / Dự Trữ" (supplyTeamFilter === 'DEPOT') thì luôn hiển thị
          if (supplyTeamFilter !== 'DEPOT') {
            if (selectedAreaId !== 'ALL') {
              return false;
            }
            if (selectedProvince !== 'ALL') {
              const cleanProv = selectedProvince.toLowerCase().replace(/^(tỉnh|thành phố|tp\.?)\s+/i, '').trim();
              if (!cleanProv.includes('da nang') && !cleanProv.includes('đà nẵng')) {
                return false;
              }
            }
          }
        }
      }

      // 1. Lọc theo đơn vị biên chế (Kho tổng dự trữ hoặc theo đội)
      if (supplyTeamFilter !== 'ALL') {
        const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
        if (supplyTeamFilter === 'DEPOT') {
          if (tId) return false;
        } else {
          if (String(tId) !== String(supplyTeamFilter)) return false;
        }
      }

      // 2. Lọc theo đúng 1 danh mục chuẩn
      if (supplyCategoryFilter !== 'ALL') {
        if (eq.category !== supplyCategoryFilter) return false;
      }

      // 3. Tìm kiếm từ khóa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (typeof eq.teamId === 'object' && eq.teamId ? eq.teamId.name || '' : '').toLowerCase();
        return (
          (eq.name || '').toLowerCase().includes(q) ||
          teamName.includes(q) ||
          (eq.serialNumber || '').toLowerCase().includes(q) ||
          (eq.note || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [equipments, supplyTypeFilter, supplyTeamFilter, supplyCategoryFilter, searchQuery, isAdmin, selectedAreaId, selectedProvince, rescueTeams, isTeamInTargetArea]);

  // Filtered consumable supplies
  const filteredConsumables = useMemo(() => {
    return consumableEquipments.filter((eq) => {
      // 1. Lọc theo kho / đơn vị
      if (consumableTeamFilter !== 'ALL') {
        const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
        if (consumableTeamFilter === 'DEPOT') {
          if (tId) return false;
        } else {
          if (String(tId) !== String(consumableTeamFilter)) return false;
        }
      }

      // 2. Lọc theo danh mục vật tư tiêu hao
      if (consumableCategoryFilter !== 'ALL') {
        if (eq.category !== consumableCategoryFilter) return false;
      }

      // 3. Tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const teamName = (typeof eq.teamId === 'object' && eq.teamId ? eq.teamId.name || '' : '').toLowerCase();
        return (
          (eq.name || '').toLowerCase().includes(q) ||
          teamName.includes(q) ||
          (eq.serialNumber || '').toLowerCase().includes(q) ||
          (eq.note || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [consumableEquipments, consumableTeamFilter, consumableCategoryFilter, searchQuery]);

  // Danh sách các Đội cứu hộ đang Hoạt động / Sẵn sàng (ACTIVE) VÀ thuộc khu vực quản lý
  const activeRescueTeams = useMemo(() => {
    return rescueTeams.filter((t) => {
      const isActive = t.status === 'ACTIVE' || (!t.status && t.status !== 'INACTIVE' && t.status !== 'SUSPENDED');
      if (!isActive) return false;
      return isTeamInTargetArea(t);
    });
  }, [rescueTeams, isTeamInTargetArea]);

  // Danh sách các Đội cứu hộ thuộc phạm vi địa bàn đang lọc
  const scopedRescueTeams = useMemo(() => {
    if (isAdmin && (selectedAreaId !== 'ALL' || selectedProvince !== 'ALL')) {
      return rescueTeams.filter((t) => isTeamInTargetArea(t));
    }
    if (!isAdmin) {
      return rescueTeams.filter((t) => isTeamInTargetArea(t));
    }
    return rescueTeams;
  }, [rescueTeams, isAdmin, selectedAreaId, selectedProvince, isTeamInTargetArea]);

  // Trạng thái và hàm xóa lọc cho Tab Phương tiện (VEHICLES)
  const hasActiveVehicleFilters = Boolean(
    (isAdmin && (selectedProvince !== 'ALL' || selectedAreaId !== 'ALL')) ||
    (!isAdmin && selectedAreaId !== 'ALL') ||
    vehicleTeamFilter !== 'ALL' ||
    vehicleTypeFilter !== 'ALL' ||
    searchQuery.trim() !== ''
  );

  const handleClearVehicleFilters = useCallback(() => {
    if (isAdmin) {
      setSelectedProvince('ALL');
    }
    setSelectedAreaId('ALL');
    setVehicleTeamFilter('ALL');
    setVehicleTypeFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  }, [isAdmin, setSelectedProvince, setSelectedAreaId]);

  // Trạng thái và hàm xóa lọc cho Tab Thiết bị & Hàng cứu trợ (SUPPLIES)
  const hasActiveSupplyFilters = Boolean(
    (isAdmin && (selectedProvince !== 'ALL' || selectedAreaId !== 'ALL')) ||
    (!isAdmin && selectedAreaId !== 'ALL') ||
    supplyTeamFilter !== 'DEPOT' ||
    supplyTypeFilter !== 'ALL' ||
    supplyCategoryFilter !== 'ALL' ||
    searchQuery.trim() !== ''
  );

  const handleClearSupplyFilters = useCallback(() => {
    if (isAdmin) {
      setSelectedProvince('ALL');
    }
    setSelectedAreaId('ALL');
    setSupplyTeamFilter('DEPOT');
    setSupplyTypeFilter('ALL');
    setSupplyCategoryFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  }, [isAdmin, setSelectedProvince, setSelectedAreaId]);

  // Tự động chuyển batchTeamId sang đội ACTIVE hợp lệ nếu đội hiện tại không còn active hoặc không thuộc khu vực
  useEffect(() => {
    if (batchTeamId && activeRescueTeams.length > 0) {
      const isSelectedActive = activeRescueTeams.some((t) => t._id === batchTeamId);
      if (!isSelectedActive) {
        setBatchTeamId(activeRescueTeams[0]._id);
      }
    } else if (batchTeamId && activeRescueTeams.length === 0) {
      setBatchTeamId('');
    }
  }, [activeRescueTeams, batchTeamId]);

  // Gợi ý nhanh các điểm an toàn / điểm sơ tán thuộc khu vực quản lý
  const suggestedSafeLocations = useMemo(() => {
    if (!safeLocations.length) return [];
    if (managedArea?._id || userAreaId) {
      const targetId = String(managedArea?._id || userAreaId);
      const targetName = (userAreaName || managedArea?.name || '')
        .toLowerCase()
        .replace(/^(phường|xã|quận|huyện)\s+/i, '')
        .trim();
      const matched = safeLocations.filter((l) => {
        const aId = typeof l.areaId === 'object' ? l.areaId?._id : l.areaId;
        const matchId = aId && String(aId) === targetId;
        const matchName =
          targetName &&
          ((l.address || '').toLowerCase().includes(targetName) ||
            (l.name || '').toLowerCase().includes(targetName));
        return matchId || matchName;
      });
      if (matched.length > 0) return matched;
    }
    return safeLocations;
  }, [safeLocations, managedArea, userAreaId, userAreaName]);



  // Handle Add Vehicle
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) {
      toast.warning('Vui lòng nhập biển số / định danh phương tiện');
      return;
    }

    const matchedTeam = rescueTeams.find((t) => t._id === newTeamId);

    try {
      setIsSubmittingVehicle(true);
      const res = await createVehicle({
        teamId: matchedTeam ? matchedTeam._id : undefined,
        type: newType,
        plateNumber: newPlate.toUpperCase().trim(),
        capacity: Number(newCapacity) || 4,
        description: newDescription.trim() || 'Phương tiện cứu nạn biên chế mới',
        status: 'AVAILABLE',
      });

      if (res.success && res.data) {
        setVehicles((prev) => [res.data, ...prev]);
      } else {
        const created: VehicleItem = {
          _id: `veh-${Date.now()}`,
          plateNumber: newPlate.toUpperCase().trim(),
          type: newType,
          capacity: Number(newCapacity) || 4,
          status: 'AVAILABLE',
          description: newDescription.trim() || 'Phương tiện cứu nạn biên chế mới',
          teamId: matchedTeam ? ({
            _id: matchedTeam._id,
            name: matchedTeam.name,
            leaderId: matchedTeam.leaderId,
          } as any) : undefined,
        };
        setVehicles((prev) => [created, ...prev]);
      }

      setIsCreateVehicleOpen(false);
      setNewPlate('');
      setNewDescription('');
      refreshData();
      toast.success(
        matchedTeam
          ? `Đã thêm phương tiện vào biên chế đội "${matchedTeam.name}" thành công!`
          : 'Đã thêm phương tiện vào Kho tổng dự trữ thành công!',
        'Biên chế thành công'
      );
    } catch (err: any) {
      toast.error(err?.message || 'Không thể tạo phương tiện mới');
    } finally {
      setIsSubmittingVehicle(false);
    }
  };

  // Open Edit Vehicle Modal
  const handleOpenEditVehicle = (v: VehicleItem) => {
    setEditVehicleTarget(v);
    setEditVehiclePlate(v.plateNumber);
    setEditVehicleType(v.type);
    setEditVehicleCapacity(v.capacity);
    setEditVehicleStatus(v.status || 'AVAILABLE');
    setEditVehicleTeamId(
      v.assignedTeam?._id ||
      (typeof v.teamId === 'string' ? v.teamId : (v.teamId as any)?._id) ||
      ''
    );
    setEditVehicleDescription(v.description || '');
  };

  // Submit Edit Vehicle
  const handleSaveEditVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVehicleTarget) return;
    if (!editVehiclePlate.trim()) {
      toast.warning('Vui lòng nhập biển số / định danh phương tiện');
      return;
    }

    try {
      setIsUpdatingVehicle(true);
      const cleanPlate = editVehiclePlate.trim().toUpperCase();
      const targetTeamId = editVehicleTeamId === 'NONE' || !editVehicleTeamId ? null : editVehicleTeamId;
      const res = await updateVehicle(editVehicleTarget._id, {
        plateNumber: cleanPlate,
        type: editVehicleType,
        capacity: Number(editVehicleCapacity) || 1,
        status: editVehicleStatus,
        teamId: targetTeamId,
        description: editVehicleDescription.trim(),
      });

      if (res.success && res.data) {
        toast.success(`Đã cập nhật phương tiện "${cleanPlate}" thành công!`);
        const updatedVehicle = res.data;
        const matchedTeam = rescueTeams.find((t) => t._id === targetTeamId);
        setVehicles((prev) =>
          prev.map((v) =>
            v._id === editVehicleTarget._id
              ? { ...v, ...updatedVehicle, assignedTeam: matchedTeam || undefined }
              : v
          )
        );
        if (selectedVehicle && selectedVehicle._id === editVehicleTarget._id) {
          setSelectedVehicle({
            ...selectedVehicle,
            ...updatedVehicle,
            assignedTeam: matchedTeam || undefined,
          });
        }
        setEditVehicleTarget(null);
      } else {
        toast.error(res.message || 'Không thể cập nhật phương tiện');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi cập nhật phương tiện');
    } finally {
      setIsUpdatingVehicle(false);
    }
  };

  // Quick switch vehicle status directly from drawer
  const handleQuickChangeVehicleStatus = async (newStatus: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'INACTIVE') => {
    if (!selectedVehicle) return;
    try {
      const res = await updateVehicle(selectedVehicle._id, { status: newStatus });
      if (res.success) {
        const statusLabel =
          newStatus === 'AVAILABLE'
            ? 'Sẵn sàng xuất kích'
            : newStatus === 'IN_USE'
              ? 'Đang làm nhiệm vụ'
              : newStatus === 'MAINTENANCE'
                ? 'Bảo dưỡng / Hỏng hóc'
                : 'Tạm ngưng hoạt động';
        toast.success(`Đã chuyển trạng thái xe sang "${statusLabel}"!`);
        setVehicles((prev) =>
          prev.map((v) => (v._id === selectedVehicle._id ? { ...v, status: newStatus } : v))
        );
        setSelectedVehicle((prev) => (prev ? { ...prev, status: newStatus } : null));
      } else {
        toast.error(res.message || 'Không thể đổi trạng thái xe');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi đổi trạng thái phương tiện');
    }
  };

  // Xử lý biên chế một hoặc nhiều phương tiện từ Kho Tổng cho Đội cứu hộ
  const handleConfirmAssignVehicles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTargetTeamId) {
      toast.warning('Vui lòng chọn Đội cứu hộ tiếp nhận phương tiện');
      return;
    }
    if (selectedVehiclesToAssign.length === 0) {
      toast.warning('Vui lòng tích chọn ít nhất 1 phương tiện từ kho để biên chế');
      return;
    }

    const targetTeamObj = rescueTeams.find((t) => t._id === assignTargetTeamId);

    try {
      setIsAssigningVehicles(true);
      const updatePromises = selectedVehiclesToAssign.map((vId) =>
        updateVehicle(vId, {
          teamId: assignTargetTeamId,
          description: assignVehicleNote.trim() || undefined,
        })
      );

      const results = await Promise.all(updatePromises);
      const updatedList = results.filter((r) => r.success && r.data).map((r) => r.data);

      setVehicles((prev) =>
        prev.map((v) => {
          const updated = updatedList.find((u) => u._id === v._id);
          if (updated) {
            return {
              ...updated,
              assignedTeam: targetTeamObj,
            };
          }
          if (selectedVehiclesToAssign.includes(v._id)) {
            return {
              ...v,
              teamId: assignTargetTeamId,
              assignedTeam: targetTeamObj,
            };
          }
          return v;
        })
      );

      toast.success(
        `Đã biên chế thành công ${selectedVehiclesToAssign.length} phương tiện cho "${targetTeamObj?.name || 'Đội cứu hộ'}"!`
      );
      setIsAssignVehicleModalOpen(false);
      setSelectedVehiclesToAssign([]);
      setAssignVehicleNote('');
    } catch (err: any) {
      console.error('Lỗi khi biên chế phương tiện cho đội:', err);
      toast.error('Có lỗi xảy ra khi biên chế phương tiện. Vui lòng thử lại!');
    } finally {
      setIsAssigningVehicles(false);
    }
  };

  // Xử lý cấp một hoặc nhiều thiết bị / nhu yếu phẩm từ Kho Tổng cho Đội cứu hộ
  const handleConfirmAssignEquipments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignEquipTargetTeamId) {
      toast.warning('Vui lòng chọn Đội cứu hộ tiếp nhận bàn giao');
      return;
    }
    const selectedIds = Object.keys(selectedEquipmentsToAssign).filter(
      (id) => (selectedEquipmentsToAssign[id] || 0) > 0
    );
    if (selectedIds.length === 0) {
      toast.warning('Vui lòng chọn số lượng ít nhất 1 mặt hàng từ kho để bàn giao');
      return;
    }

    const targetTeamObj = rescueTeams.find((t) => t._id === assignEquipTargetTeamId);

    try {
      setIsAssigningEquipment(true);
      await Promise.all(
        selectedIds.map((eqId) =>
          transferEquipment(eqId, {
            targetTeamId: assignEquipTargetTeamId,
            quantity: selectedEquipmentsToAssign[eqId],
            note: assignEquipNote.trim() || undefined,
          })
        )
      );

      await loadData();
      toast.success(
        `Đã bàn giao thành công ${selectedIds.length} mặt hàng cho "${targetTeamObj?.name || 'Đội cứu hộ'}"!`
      );
      setIsAssignEquipmentModalOpen(false);
      setSelectedEquipmentsToAssign({});
      setAssignEquipNote('');
    } catch (err: any) {
      console.error('Lỗi khi bàn giao mặt hàng cho đội:', err);
      toast.error('Có lỗi xảy ra khi bàn giao mặt hàng. Vui lòng thử lại!');
    } finally {
      setIsAssigningEquipment(false);
    }
  };

  // Handle Transfer / Reassign Vehicle
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferVehicleTarget) return;

    if (!transferNewTeamId || transferNewTeamId.trim() === '') {
      setTransferVehicleError('Vui lòng chọn đội cứu hộ hoặc kho tổng tiếp nhận xe');
      toast.warning('Vui lòng chọn đội cứu hộ hoặc kho tổng tiếp nhận xe', 'Chưa chọn đơn vị tiếp nhận');
      return;
    }
    setTransferVehicleError('');

    try {
      setIsTransferring(true);
      const targetTeamId = transferNewTeamId === 'NONE' || !transferNewTeamId ? null : transferNewTeamId;
      const res = await updateVehicle(transferVehicleTarget._id, { teamId: targetTeamId });
      if (res.success) {
        setVehicles((prev) =>
          prev.map((v) =>
            v._id === transferVehicleTarget._id
              ? { ...v, teamId: targetTeamId ? (targetTeamId as any) : undefined }
              : v
          )
        );
        if (selectedVehicle?._id === transferVehicleTarget._id) {
          setSelectedVehicle((prev) =>
            prev ? { ...prev, teamId: targetTeamId ? (targetTeamId as any) : undefined } : null
          );
        }
        const assignedTeam = rescueTeams.find((t) => t._id === targetTeamId);
        toast.success(
          targetTeamId && assignedTeam
            ? `Đã điều chuyển phương tiện "${transferVehicleTarget.plateNumber}" sang đội "${assignedTeam.name}"!`
            : `Đã chuyển phương tiện "${transferVehicleTarget.plateNumber}" về Kho tổng dự trữ!`,
          'Điều chuyển thành công'
        );
        setTransferVehicleTarget(null);
        setTransferNewTeamId('');
        setTransferVehicleError('');
      } else {
        toast.error(res.message || 'Không thể điều chuyển phương tiện');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi điều chuyển phương tiện');
    } finally {
      setIsTransferring(false);
    }
  };

  // Handle Create / Dispatch Equipment
  const handleCreateEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = eqName === 'CUSTOM' ? customEqName.trim() : eqName.trim();
    if (!finalName) {
      toast.warning('Vui lòng chọn hoặc nhập tên trang thiết bị');
      return;
    }

    const matchedTeam = rescueTeams.find((t) => t._id === eqTeamId);

    try {
      setIsSubmittingEquipment(true);
      const res = await createEquipment({
        teamId: matchedTeam ? matchedTeam._id : ('' as any),
        name: finalName,
        category: eqCategory,
        supplyType: eqSupplyType,
        minThreshold: eqSupplyType === 'CONSUMABLE' ? Number(eqMinThreshold) || 20 : undefined,
        serialNumber: eqSerialNumber.trim() ? eqSerialNumber.trim().toUpperCase() : undefined,
        quantity: Number(eqQuantity) || 1,
        unit: eqUnit.trim() || 'chiếc',
        status: 'AVAILABLE',
        receivedAt: eqReceivedAt ? new Date(eqReceivedAt).toISOString() : new Date().toISOString(),
        note: eqNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) => [res.data, ...prev]);
        refreshData();
        toast.success(
          matchedTeam
            ? `Đã thêm "${finalName}" vào biên chế đội "${matchedTeam.name}" thành công!`
            : `Đã nhập "${finalName}" vào Kho tổng dự trữ thành công!`,
          'Nhập kho thành công'
        );
        setIsCreateEquipmentOpen(false);
        setEqName('');
        setCustomEqName('');
        setEqSerialNumber('');
        setEqNote('');
        setEqReceivedAt(new Date().toISOString().split('T')[0]);
        setEqQuantity(1);
      } else {
        toast.error(res.message || 'Không thể thêm trang thiết bị mới');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi thêm trang thiết bị mới');
    } finally {
      setIsSubmittingEquipment(false);
    }
  };

  // Handle Consume / Dispatch Relief Supply (Xuất cấp cứu trợ)
  const handleConfirmConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeTarget) return;

    const qty = Number(consumeQuantity);
    if (!qty || qty <= 0 || qty > consumeTarget.quantity) {
      toast.warning(`Số lượng xuất phải từ 1 đến ${consumeTarget.quantity} ${consumeTarget.unit}`);
      return;
    }

    try {
      setIsConsuming(true);
      const res = await consumeEquipment(consumeTarget._id, {
        quantity: qty,
        destination: consumeDestination.trim() || undefined,
        note: consumeNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === consumeTarget._id ? res.data : eq))
        );
        toast.success(
          `Đã xuất cấp ${qty} ${consumeTarget.unit} "${consumeTarget.name}" cứu trợ thành công!`,
          'Xuất cấp hoàn tất'
        );
        setConsumeTarget(null);
        setConsumeDestination('');
        setConsumeNote('');
      } else {
        toast.error(res.message || 'Không thể xuất cấp vật tư cứu trợ');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi xuất cấp vật tư');
    } finally {
      setIsConsuming(false);
    }
  };

  // Mở modal Phiếu xuất cứu trợ tổng hợp (nhiều mặt hàng)
  const handleOpenBatchConsumeModal = async (preset?: { targetTeamId?: string } | any) => {
    // Sẵn sàng xuất tất cả mặt hàng còn hàng trong Kho Tổng (cả Khí tài bền & Vật tư cứu trợ)
    const available = equipments.filter((e) => {
      const tId = typeof e.teamId === 'object' && e.teamId ? (e.teamId as any)._id : e.teamId;
      return !tId && e.quantity > 0;
    });
    const pool = available.length > 0 ? available : equipments.filter((e) => e.quantity > 0);
    if (pool.length === 0) {
      toast.warning('Hiện không có mặt hàng nào còn tồn kho để lập phiếu xuất điều phối');
      return;
    }
    setBatchDestination('');
    setBatchCoordinates(null);
    setBatchRecipientName('');
    setBatchNote('');
    setBatchDispatchMode('ASSIGN_TEAM');
    setBatchPriority('HIGH');

    // Đồng bộ lại danh sách đội cứu hộ và các điểm sơ tán mới nhất từ server
    let currentTeams = rescueTeams;
    try {
      const areaParam = effectiveAreaId !== 'ALL' ? effectiveAreaId : undefined;
      const [teamRes, safeRes] = await Promise.allSettled([
        fetchRescueTeams({ areaId: areaParam, limit: 100 }),
        fetchSafeLocations({ limit: '50' }),
      ]);
      if (teamRes.status === 'fulfilled' && teamRes.value.success && Array.isArray(teamRes.value.data)) {
        currentTeams = teamRes.value.data;
        setRescueTeams(teamRes.value.data);
      }
      if (safeRes.status === 'fulfilled' && safeRes.value.success && Array.isArray(safeRes.value.data)) {
        setSafeLocations(safeRes.value.data);
      }
    } catch (_) { }

    const targetId = preset && typeof preset === 'object' && 'targetTeamId' in preset ? preset.targetTeamId : null;

    if (targetId) {
      setBatchTeamId(targetId);
      setBatchDispatchMode('ASSIGN_TEAM');
    } else {
      const activeTeams = currentTeams.filter((t) => {
        const isActive = t.status === 'ACTIVE' || (!t.status && t.status !== 'INACTIVE' && t.status !== 'SUSPENDED');
        if (!isActive) return false;
        return isTeamInTargetArea(t);
      });
      if (activeTeams.length > 0) {
        setBatchTeamId(activeTeams[0]._id);
      } else {
        setBatchTeamId('');
      }
    }

    // Khởi tạo danh sách mặt hàng đưa vào phiếu xuất (Chỉ lấy hàng tồn từ Kho Tổng / Dự Trữ):
    if (selectedTableItemIds.length > 0) {
      const chosenEquipments = equipments.filter((e) => {
        const tId = typeof e.teamId === 'object' && e.teamId ? (e.teamId as any)._id : e.teamId;
        return !tId && selectedTableItemIds.includes(e._id) && e.quantity > 0;
      });
      if (chosenEquipments.length > 0) {
        setBatchItems(
          chosenEquipments.map((eq) => ({
            equipmentId: eq._id,
            quantity: Math.min(10, eq.quantity),
          }))
        );
      } else {
        setBatchItems([]);
      }
    } else {
      // Khi mở tự do chưa tích chọn trước từ bảng: để danh sách rỗng để người dùng tự chọn, không gán sẵn mặc định thiết bị
      setBatchItems([]);
    }

    setIsBatchConsumeOpen(true);
  };

  const handleAddBatchItem = () => {
    // Chỉ lấy các mặt hàng thuộc Kho Tổng / Dự Trữ
    const available = equipments.filter((e) => {
      const tId = typeof e.teamId === 'object' && e.teamId ? (e.teamId as any)._id : e.teamId;
      return !tId && e.quantity > 0;
    });
    if (available.length === 0) {
      toast.warning('Kho Tổng / Dự Trữ hiện không còn mặt hàng nào để xuất thêm');
      return;
    }
    const selectedIds = new Set(batchItems.map((bi) => bi.equipmentId));
    const nextItem = available.find((e) => !selectedIds.has(e._id)) || available[0];
    if (nextItem) {
      setBatchItems((prev) => [
        ...prev,
        { equipmentId: nextItem._id, quantity: Math.min(10, nextItem.quantity) },
      ]);
    }
  };

  const handleRemoveBatchItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateBatchItem = (index: number, patch: Partial<BatchConsumeItem>) => {
    setBatchItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, ...patch };
        const eq = equipments.find((e) => e._id === updated.equipmentId);
        if (eq) {
          updated.quantity = Math.min(eq.quantity, Math.max(1, Number(updated.quantity) || 1));
        }
        return updated;
      })
    );
  };

  const handleConfirmBatchConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchDestination.trim()) {
      toast.warning('Vui lòng nhập điểm tiếp nhận cứu trợ / khu vực ngập lụt');
      return;
    }
    if (batchDispatchMode === 'ASSIGN_TEAM') {
      if (!batchTeamId) {
        toast.warning('Vui lòng chọn Đội cứu hộ nhận lệnh vận chuyển tiếp tế');
        return;
      }
      const selectedTeam = rescueTeams.find((t) => t._id === batchTeamId);
      if (selectedTeam && selectedTeam.status && selectedTeam.status !== 'ACTIVE') {
        const statusText = selectedTeam.status === 'INACTIVE' ? 'Tạm dừng hoạt động' : selectedTeam.status;
        toast.error(`Đội "${selectedTeam.name}" đang ở trạng thái "${statusText}", không thể tiếp nhận lệnh điều phối`);
        return;
      }
      if (selectedTeam && !isTeamInTargetArea(selectedTeam)) {
        toast.error(`Đội "${selectedTeam.name}" không thuộc địa bàn quản lý hiện tại, không thể điều phối`);
        return;
      }
    }
    if (batchItems.length === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 mặt hàng vào phiếu xuất cấp');
      return;
    }

    for (let i = 0; i < batchItems.length; i++) {
      const bi = batchItems[i];
      const eq = equipments.find((e) => e._id === bi.equipmentId);
      if (!eq) {
        toast.warning('Có mặt hàng không hợp lệ trong danh sách');
        return;
      }
      const qty = Number(bi.quantity);
      if (!qty || qty <= 0) {
        toast.warning(`Số lượng xuất cho "${eq.name}" phải lớn hơn 0`);
        return;
      }
      if (qty > eq.quantity) {
        toast.warning(`"${eq.name}" chỉ còn tồn kho ${eq.quantity} ${eq.unit}, không đủ để xuất ${qty}`);
        return;
      }
    }

    try {
      setIsSubmittingBatchConsume(true);
      const res = await batchConsumeEquipments({
        destination: batchDestination.trim(),
        coordinates: batchCoordinates || undefined,
        recipientName: batchRecipientName.trim() || undefined,
        note: batchNote.trim() || undefined,
        teamId: batchDispatchMode === 'ASSIGN_TEAM' ? batchTeamId : undefined,
        priority: batchDispatchMode === 'ASSIGN_TEAM' ? batchPriority : undefined,
        items: batchItems.map((bi) => ({ equipmentId: bi.equipmentId, quantity: Number(bi.quantity) })),
      });

      const updatedList: EquipmentItem[] = Array.isArray(res.data)
        ? res.data
        : (res.data?.updatedEquipments || []);

      if (res.success && updatedList.length > 0) {
        const updatedMap = new Map(updatedList.map((eq) => [eq._id, eq]));
        setEquipments((prev) => prev.map((eq) => updatedMap.get(eq._id) || eq));

        const teamObj = rescueTeams.find((t) => t._id === batchTeamId);
        if (batchDispatchMode === 'ASSIGN_TEAM' && teamObj) {
          toast.success(
            `Đã xuất kho ${updatedList.length} mặt hàng & Tạo lệnh điều phối cho "${teamObj.name}" thành công!`,
            'Xuất cấp & Điều phối hoàn tất'
          );
        } else {
          toast.success(
            `Đã xuất cấp trực tiếp thành công ${updatedList.length} mặt hàng cứu trợ tới "${batchDestination.trim()}"!`,
            'Phiếu xuất cấp hoàn tất'
          );
        }
        setIsBatchConsumeOpen(false);
        setBatchItems([]);
        setSelectedTableItemIds([]);
        setBatchDestination('');
        setBatchRecipientName('');
        setBatchNote('');
      } else {
        toast.error(res.message || 'Không thể tạo phiếu xuất cấp cứu trợ tổng hợp');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi xuất cấp cứu trợ tổng hợp');
    } finally {
      setIsSubmittingBatchConsume(false);
    }
  };

  // Quick Status Update for Equipment
  const handleQuickUpdateEquipmentStatus = async (id: string, status: string) => {
    try {
      const res = await updateEquipmentStatus(id, status);
      if (res.success) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === id ? { ...eq, status: status as any } : eq))
        );
        if (selectedEquipment && selectedEquipment._id === id) {
          setSelectedEquipment((prev) => (prev ? { ...prev, status: status as any } : null));
        }
        toast.success('Đã cập nhật trạng thái vật tư thành công');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Lỗi cập nhật trạng thái vật tư');
    }
  };

  // Restock Equipment Handlers (Nhập thêm cơ số vào kho)
  const handleOpenRestock = (eq: EquipmentItem) => {
    setRestockTarget(eq);
    setRestockSourceType('DONATION');
    setRestockQuantity(10);
    setRestockSource('');
  };

  const handleExecuteRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockTarget) return;
    const addQty = Number(restockQuantity) || 0;
    if (addQty <= 0) {
      toast.warning('Số lượng nhập thêm phải lớn hơn 0');
      return;
    }

    try {
      setIsRestocking(true);

      if (restockSourceType === 'DEPOT') {
        const isTeam = Boolean(
          restockTarget.teamId &&
          (typeof restockTarget.teamId === 'string'
            ? restockTarget.teamId !== 'NONE'
            : (restockTarget.teamId as any)._id)
        );

        if (!isTeam) {
          toast.warning('Mặt hàng này hiện đã ở Kho Tổng');
          setIsRestocking(false);
          return;
        }

        const targetTeamId =
          typeof restockTarget.teamId === 'object' && restockTarget.teamId
            ? (restockTarget.teamId as any)._id
            : restockTarget.teamId;

        // Ưu tiên tìm khớp tên chính xác, sau đó tìm theo tên chứa hoặc cùng danh mục ở Kho Tổng
        const depotItem =
          equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              eq.name.trim().toLowerCase() === restockTarget.name.trim().toLowerCase()
          ) ||
          equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              (eq.name.toLowerCase().includes(restockTarget.name.toLowerCase()) ||
                restockTarget.name.toLowerCase().includes(eq.name.toLowerCase()))
          ) ||
          equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              eq.category === restockTarget.category
          );

        const depotQty = depotItem ? Math.max(0, Number(depotItem.quantity) || 0) : 0;

        if (!depotItem || depotQty <= 0) {
          toast.error(
            `Kho Tổng hiện không còn mặt hàng "${restockTarget.name}" (Tồn kho: 0). Vui lòng chọn "Tiếp nhận tài trợ trực tiếp" hoặc nhập thêm vào Kho Tổng trước!`,
            'Kho Tổng hết hàng'
          );
          setIsRestocking(false);
          return;
        }

        if (addQty > depotQty) {
          toast.warning(
            `Kho Tổng chỉ còn ${depotQty} ${depotItem.unit}, không đủ để cấp ${addQty} ${depotItem.unit}. Vui lòng chọn số lượng ≤ ${depotQty}.`,
            'Vượt quá tồn kho Kho Tổng'
          );
          setIsRestocking(false);
          return;
        }

        const res = await transferEquipment(depotItem._id, {
          targetTeamId,
          quantity: addQty,
          note: restockSource.trim() || 'Cấp bổ sung từ Kho Tổng SOS cho Đội',
        });

        if (res.success) {
          const newDepotQty = depotQty - addQty;
          const newTeamQty = Number(restockTarget.quantity) + addQty;

          setEquipments((prev) =>
            prev
              .map((eq) => {
                if (eq._id === depotItem._id) {
                  return newDepotQty > 0 ? { ...eq, quantity: newDepotQty } : null;
                }
                if (eq._id === restockTarget._id) {
                  return { ...eq, quantity: newTeamQty };
                }
                return eq;
              })
              .filter(Boolean) as EquipmentItem[]
          );

          if (selectedEquipment && selectedEquipment._id === restockTarget._id) {
            setSelectedEquipment((prev) => (prev ? { ...prev, quantity: newTeamQty } : null));
          }

          toast.success(
            `Đã cấp bổ sung +${addQty} ${restockTarget.unit} từ Kho Tổng về Đội thành công! (Kho Tổng còn: ${newDepotQty} ${depotItem.unit})`,
            'Cấp phát từ Kho Tổng'
          );
          setRefreshIndex((p) => p + 1);
          setRestockTarget(null);
        } else {
          toast.error(res.message || 'Không thể cấp từ Kho Tổng');
        }
      } else {
        // Nguồn DONATION (Tiếp nhận tài trợ trực tiếp)
        const newTotal = Number(restockTarget.quantity) + addQty;
        const donorNote = restockSource.trim()
          ? `[Tiếp nhận tài trợ: ${restockSource.trim()} (+${addQty} ${restockTarget.unit})]`
          : `[Tiếp nhận tài trợ bổ sung: +${addQty} ${restockTarget.unit}]`;
        const res = await updateEquipment(restockTarget._id, {
          quantity: newTotal,
          note: restockTarget.note ? `${restockTarget.note} | ${donorNote}` : donorNote,
        });

        if (res.success) {
          toast.success(`Đã nhập thêm +${addQty} ${restockTarget.unit} từ nguồn tài trợ thành công!`);
          setEquipments((prev) =>
            prev.map((eq) => (eq._id === restockTarget._id ? { ...eq, quantity: newTotal } : eq))
          );
          if (selectedEquipment && selectedEquipment._id === restockTarget._id) {
            setSelectedEquipment((prev) => (prev ? { ...prev, quantity: newTotal } : null));
          }
          setRestockTarget(null);
        } else {
          toast.error(res.message || 'Không thể nhập thêm vật tư');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi nhập thêm');
    } finally {
      setIsRestocking(false);
    }
  };

  // Thực thi rút khỏi đội hoặc xóa vĩnh viễn (được gọi từ Custom Confirm Modal, không dùng alert/confirm của browser)
  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    const { type, id, name, teamName } = deleteConfirmTarget;

    try {
      setIsDeleting(true);
      if (type === 'UNASSIGN_VEHICLE') {
        // Rút xe khỏi đội: Cập nhật teamId = null, KHÔNG XÓA XE
        const res = await updateVehicle(id, { teamId: null });
        if (res.success) {
          setVehicles((prev) =>
            prev.map((v) => (v._id === id ? { ...v, teamId: undefined } : v))
          );
          if (selectedVehicle?._id === id) {
            setSelectedVehicle((prev) => (prev ? { ...prev, teamId: undefined } : null));
          }
          toast.success(
            `Đã rút phương tiện "${name}" khỏi ${teamName ? `đội ${teamName}` : 'đội cứu hộ'} và chuyển về Kho tổng dự trữ!`,
            'Rút biên chế thành công'
          );
        } else {
          toast.error(res.message || 'Không thể rút phương tiện khỏi đội');
        }
      } else if (type === 'UNASSIGN_EQUIPMENT') {
        // Thu hồi trang bị/vật tư khỏi đội về Kho tổng: Cập nhật teamId = null, tự động cộng dồn nếu Kho Tổng đã có bản ghi
        const res = await updateEquipment(id, { teamId: null });
        if (res.success) {
          const mergedData = res.data;
          setEquipments((prev) => {
            const withoutOld = prev.filter((eq) => eq._id !== id);
            if (mergedData) {
              const alreadyExists = withoutOld.some((eq) => eq._id === mergedData._id);
              if (alreadyExists) {
                return withoutOld.map((eq) => (eq._id === mergedData._id ? mergedData : eq));
              } else {
                return [mergedData, ...withoutOld];
              }
            }
            return withoutOld;
          });

          if (selectedEquipment?._id === id) {
            setSelectedEquipment(null);
          }

          toast.success(
            `Đã thu hồi và cộng dồn trang bị "${name}" về Kho Tổng Cứu Trợ SOS thành công!`,
            'Thu hồi & Cộng dồn hoàn tất'
          );
          setRefreshIndex((p) => p + 1);
        } else {
          toast.error(res.message || 'Không thể thu hồi vật tư về Kho tổng');
        }
      } else if (type === 'DELETE_VEHICLE') {
        // Xóa vĩnh viễn xe khỏi DB
        const res = await deleteVehicle(id);
        if (res.success) {
          setVehicles((prev) => prev.filter((v) => v._id !== id));
          if (selectedVehicle?._id === id) setSelectedVehicle(null);
          toast.success(`Đã xóa vĩnh viễn phương tiện "${name}" khỏi hệ thống!`);
        } else {
          toast.error(res.message || 'Không thể xóa phương tiện');
        }
      } else {
        // Xóa vật tư (Thanh lý tài sản)
        const res = await deleteEquipment(id);
        if (res.success) {
          setEquipments((prev) => prev.filter((eq) => eq._id !== id));
          if (selectedEquipment?._id === id) setSelectedEquipment(null);
          toast.success(`Đã thanh lý & xóa vật tư "${name}" khỏi biên chế!`);
        } else {
          toast.error(res.message || 'Không thể xóa vật tư');
        }
      }
      setDeleteConfirmTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi thực hiện thao tác');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Edit Equipment Modal
  const handleOpenEditEquipment = (eq: EquipmentItem) => {
    setEditEquipmentTarget(eq);
    setEditEqQuantity(eq.quantity);
    setEditEqStatus(eq.status);
    setEditEqSerialNumber(eq.serialNumber || '');
    setEditEqReceivedAt(eq.receivedAt ? eq.receivedAt.split('T')[0] : eq.createdAt ? eq.createdAt.split('T')[0] : '');
    setEditEqNote(eq.note || '');
  };

  // Submit Edit Equipment
  const handleSaveEditEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEquipmentTarget) return;

    try {
      setIsUpdatingEquipment(true);
      const res = await updateEquipment(editEquipmentTarget._id, {
        quantity: Number(editEqQuantity) || 1,
        status: editEqStatus,
        serialNumber: editEqSerialNumber.trim() ? editEqSerialNumber.trim().toUpperCase() : undefined,
        receivedAt: editEqReceivedAt ? new Date(editEqReceivedAt).toISOString() : undefined,
        note: editEqNote.trim() || undefined,
      });

      if (res.success && res.data) {
        setEquipments((prev) =>
          prev.map((eq) => (eq._id === editEquipmentTarget._id ? res.data : eq))
        );
        if (selectedEquipment?._id === editEquipmentTarget._id) {
          setSelectedEquipment(res.data);
        }
        toast.success(`Đã cập nhật trang thiết bị "${editEquipmentTarget.name}" thành công!`);
        setEditEquipmentTarget(null);
      } else {
        toast.error(res.message || 'Không thể cập nhật trang thiết bị');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi cập nhật trang thiết bị');
    } finally {
      setIsUpdatingEquipment(false);
    }
  };

  // Handle Transfer Equipment
  const handleExecuteTransferEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferEquipmentTarget) return;

    const newErrors: { team?: string; quantity?: string } = {};

    if (!transferEquipmentTeamId || transferEquipmentTeamId.trim() === '') {
      newErrors.team = 'Vui lòng chọn đơn vị tiếp nhận bàn giao';
    }

    const qty = Number(transferEquipmentQuantity);
    if (!qty || isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Số lượng bàn giao phải lớn hơn 0';
    } else if (qty > transferEquipmentTarget.quantity) {
      newErrors.quantity = `Số lượng không được vượt quá cơ số hiện có (${transferEquipmentTarget.quantity})`;
    }

    if (Object.keys(newErrors).length > 0) {
      setTransferEquipmentErrors(newErrors);
      if (newErrors.team) {
        toast.warning(newErrors.team, 'Chưa chọn đơn vị tiếp nhận');
      } else if (newErrors.quantity) {
        toast.warning(newErrors.quantity, 'Số lượng không hợp lệ');
      }
      return;
    }

    setTransferEquipmentErrors({});

    try {
      setIsTransferringEquipment(true);
      const targetTeam = transferEquipmentTeamId === 'NONE' ? null : transferEquipmentTeamId;
      const res = await transferEquipment(transferEquipmentTarget._id, {
        targetTeamId: targetTeam,
        quantity: qty,
        note: transferEquipmentNote.trim() || undefined,
      });

      if (res.success) {
        const destName = targetTeam
          ? (rescueTeams.find((t) => t._id === targetTeam)?.name || 'Đội cứu hộ')
          : 'Kho Tổng / Dự Trữ';
        toast.success(
          `Đã bàn giao ${qty} ${transferEquipmentTarget.unit} "${transferEquipmentTarget.name}" sang "${destName}" thành công!`,
          'Bàn giao hoàn tất'
        );
        setTransferEquipmentTarget(null);
        setTransferEquipmentTeamId('');
        setTransferEquipmentQuantity(1);
        setTransferEquipmentNote('');
        setTransferEquipmentErrors({});
        if (selectedEquipment?._id === transferEquipmentTarget._id) {
          setSelectedEquipment(null);
        }
        refreshData();
      } else {
        toast.error(res.message || 'Không thể điều chuyển trang thiết bị');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi điều chuyển trang thiết bị');
    } finally {
      setIsTransferringEquipment(false);
    }
  };

  // Phân trang cho từng tab
  const totalVehiclePages = Math.max(1, Math.ceil(filteredVehicles.length / pageSize));
  const paginatedVehicles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVehicles.slice(start, start + pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  const totalEquipmentPages = Math.max(1, Math.ceil(filteredEquipments.length / pageSize));
  const paginatedEquipments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEquipments.slice(start, start + pageSize);
  }, [filteredEquipments, currentPage, pageSize]);

  const totalConsumablePages = Math.max(1, Math.ceil(filteredConsumables.length / pageSize));
  const paginatedConsumables = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredConsumables.slice(start, start + pageSize);
  }, [filteredConsumables, currentPage, pageSize]);

  const renderVehicleStatusBadge = (status?: string) => {
    const s = (status || 'READY').toUpperCase();
    if (s === 'READY' || s === 'AVAILABLE') {
      return (
        <span className="ra-status-badge verified" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
          Sẵn sàng
        </span>
      );
    }
    if (s === 'IN_USE' || s === 'ASSIGNED' || s === 'ON_MISSION') {
      return (
        <span className="ra-status-badge in-review" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#3b82f6', borderRadius: '50%' }} />
          Đang sử dụng
        </span>
      );
    }
    if (s === 'MAINTENANCE') {
      return (
        <span className="ra-status-badge pending" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#f59e0b', borderRadius: '50%' }} />
          Bảo trì
        </span>
      );
    }
    if (s === 'DAMAGED' || s === 'BROKEN') {
      return (
        <span className="ra-status-badge rejected" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />
          Hỏng hóc
        </span>
      );
    }
    return (
      <span className="ra-status-badge rejected" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
        <span className="live-dot" style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%' }} />
        Ngừng hoạt động
      </span>
    );
  };

  const renderEquipmentStatusBadge = (eq: EquipmentItem) => {
    const isDurable =
      eq.supplyType === 'DURABLE' ||
      eq.category === 'LIFE_VEST' ||
      eq.category === 'COMMUNICATION' ||
      eq.category === 'LIGHTING' ||
      eq.category === 'ROPE_TOOL' ||
      eq.category === 'TOOL' ||
      eq.category === 'VEHICLE_ACCESSORY';

    if (isDurable) {
      const s = (eq.status || 'AVAILABLE').toUpperCase();
      if (s === 'AVAILABLE' || s === 'READY') {
        return (
          <span className="ra-status-badge verified" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
            <span className="live-dot" style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
            Sẵn sàng
          </span>
        );
      }
      if (s === 'IN_USE' || s === 'ASSIGNED' || s === 'BORROWED') {
        return (
          <span className="ra-status-badge in-review" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
            <span className="live-dot" style={{ width: 6, height: 6, background: '#3b82f6', borderRadius: '50%' }} />
            Đang sử dụng
          </span>
        );
      }
      if (s === 'MAINTENANCE') {
        return (
          <span className="ra-status-badge pending" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
            <span className="live-dot" style={{ width: 6, height: 6, background: '#f59e0b', borderRadius: '50%' }} />
            Bảo trì
          </span>
        );
      }
      if (s === 'DAMAGED' || s === 'BROKEN' || s === 'LOST') {
        return (
          <span className="ra-status-badge rejected" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            <span className="live-dot" style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />
            Hỏng hóc
          </span>
        );
      }
      if (s === 'EXPIRED') {
        return (
          <span className="ra-status-badge rejected" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            <span className="live-dot" style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />
            Hết hạn
          </span>
        );
      }
      return (
        <span className="ra-status-badge rejected" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#94a3b8', borderRadius: '50%' }} />
          {eq.status}
        </span>
      );
    }

    // Nhu yếu phẩm / Hàng cứu trợ tiêu hao (Consumable)
    const isAvailable = (eq.quantity ?? 0) > 0 && eq.status !== 'EXPIRED';
    if (isAvailable) {
      return (
        <span className="ra-status-badge verified" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
          <span className="live-dot" style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
          Khả dụng
        </span>
      );
    }
    return (
      <span className="ra-status-badge rejected" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
        <span className="live-dot" style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />
        {eq.status === 'EXPIRED' ? 'Hết hạn' : 'Hết hàng'}
      </span>
    );
  };

  const renderPagination = (totalItems: number, totalPages: number, itemLabel: string) => {
    const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endItem = Math.min(currentPage * pageSize, totalItems);

    return (
      <div className="ra-pagination">
        <div className="ra-pagination-left">
          <span>
            Hiển thị <strong>{startItem}</strong> - <strong>{endItem}</strong> trên tổng số <strong>{totalItems}</strong> {itemLabel}
          </span>

          <select
            className="ra-page-size-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10 dòng / trang</option>
            <option value={20}>20 dòng / trang</option>
            <option value={50}>50 dòng / trang</option>
          </select>
        </div>

        <div className="ra-pagination-nav">
          <button
            className="ra-page-btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            title="Trang trước"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
            if (
              pg === 1 ||
              pg === totalPages ||
              (pg >= currentPage - 1 && pg <= currentPage + 1)
            ) {
              return (
                <button
                  key={pg}
                  className={'ra-page-btn ' + (pg === currentPage ? 'active' : '')}
                  onClick={() => setCurrentPage(pg)}
                >
                  {pg}
                </button>
              );
            }
            return null;
          })}

          <button
            className="ra-page-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            title="Trang sau"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="resources-executive-container oceanic-executive-theme">
      {/* CARD BẢNG DỮ LIỆU & TOOLBAR: GỘP CHUNG TIÊU ĐỀ PHÂN HỆ + BỘ LỌC + BẢNG */}
      <section className="ra-table-card">
        {/* ===================================================================
            1. CARD HEADER (HÀNG 1): TIÊU ĐỀ KHO + THỐNG KÊ + CÁC NÚT HÀNH ĐỘNG
            =================================================================== */}
        <div className="resources-card-header">
          <div className="resources-card-header-main">
            {resourceTab === 'VEHICLES' ? (
              <>
                <div className="resources-context-icon vehicles">
                  <Truck size={18} />
                </div>
                <div className="resources-context-text">
                  <div className="resources-context-title-row">
                    <h2 className="resources-context-title">Kho Phương tiện cơ động</h2>
                    <span className="resources-context-stat vehicles">
                      {rawVehicles.length} phương tiện
                    </span>
                  </div>
                  <p className="resources-context-desc">
                    Ca-nô, xuồng máy vượt lũ, xe cứu thương và phương tiện cơ động đường bộ
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="resources-context-icon supplies" style={{ background: '#ecfdf5', color: '#16a34a' }}>
                  <Package size={18} />
                </div>
                <div className="resources-context-text">
                  <div className="resources-context-title-row">
                    <h2 className="resources-context-title">Kho Thiết bị &amp; Hàng cứu trợ</h2>
                    <span className="resources-context-stat supplies" style={{ background: '#dcfce7', color: '#15803d' }}>
                      {equipments.length} mặt hàng
                    </span>
                  </div>
                  <p className="resources-context-desc">
                    Áo phao, bộ đàm, đèn pin dã chiến, máy phát điện, lương thực, nước sạch và thuốc men cứu trợ
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Phía phải Header: Toàn bộ nút hành động cấp kho */}
          <div className="resources-card-header-actions">
            <button
              className="ra-refresh-btn"
              onClick={refreshData}
              title="Cập nhật danh sách mới nhất"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Làm mới</span>
            </button>

            {resourceTab === 'VEHICLES' && (
              <button
                type="button"
                className="coordination-action-btn primary"
                onClick={() => {
                  setNewPlate('');
                  setNewType('BOAT');
                  setNewCapacity(8);
                  setNewTeamId(
                    vehicleTeamFilter !== 'ALL' && vehicleTeamFilter !== 'UNASSIGNED'
                      ? vehicleTeamFilter
                      : ''
                  );
                  setNewDescription('');
                  setIsCreateVehicleOpen(true);
                }}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <PlusCircle size={15} />
                <span>+ Thêm phương tiện mới</span>
              </button>
            )}

            {resourceTab !== 'VEHICLES' && (
              <>
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  style={{
                    borderColor: selectedTableItemIds.length > 0 ? '#0284c7' : '#0284c7',
                    color: selectedTableItemIds.length > 0 ? '#ffffff' : '#0284c7',
                    background: selectedTableItemIds.length > 0 ? '#0284c7' : '#f0f9ff',
                    borderRadius: 8,
                    padding: '7px 14px',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: selectedTableItemIds.length > 0 ? '0 2px 6px rgba(2, 132, 199, 0.35)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => handleOpenBatchConsumeModal()}
                  title="Xuất cùng lúc nhiều loại thiết bị cứu hộ & nhu yếu phẩm cho điểm sơ tán hoặc chuyến xe"
                >
                  <PackageCheck size={15} />
                  <span>
                    {selectedTableItemIds.length > 0
                      ? `🚚 Xuất kho & Điều phối (${selectedTableItemIds.length} mục đã chọn)`
                      : '🚚 Tạo phiếu xuất kho & Điều phối'}
                  </span>
                </button>

                {selectedTableItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTableItemIds([])}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      color: '#64748b',
                      borderRadius: 8,
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    title="Bỏ tích chọn các mặt hàng"
                  >
                    <X size={13} />
                    <span>Bỏ chọn</span>
                  </button>
                )}

                <button
                  type="button"
                  className="coordination-action-btn primary"
                  onClick={() => {
                    setEqTeamId('');
                    setEqSupplyType('DURABLE');
                    setEqName(STANDARD_EQUIPMENT_CATALOG[0].name);
                    setEqCategory(STANDARD_EQUIPMENT_CATALOG[0].category);
                    setEqUnit(STANDARD_EQUIPMENT_CATALOG[0].unit);
                    setCustomEqName('');
                    setEqQuantity(1);
                    setEqSerialNumber(generateRandomEquipmentSerial(STANDARD_EQUIPMENT_CATALOG[0].category));
                    setEqNote('');
                    setIsCreateEquipmentOpen(true);
                  }}
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 14px',
                    fontWeight: 600,
                    fontSize: 13,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                  title="Nhập kho thiết bị hoặc nhu yếu phẩm mới"
                >
                  <PlusCircle size={15} />
                  <span>+ Nhập kho mới</span>
                </button>
              </>
            )}
          </div>
        </div>

        {resourceTab === 'VEHICLES' ? (
          <>
            {/* TOOLBAR PHƯƠNG TIỆN (ULTRA-COMPACT: TIÊU ĐỀ + BỘ LỌC + THAO TÁC TRÊN 1 HÀNG) */}
            <div className="ra-toolbar">
              <div className="ra-toolbar-controls">
                {/* 0A. Lọc theo Tỉnh / Thành phố: Gọi API Open-API Việt Nam */}
                {isAdmin && (
                  <select
                    className="ra-filter-select"
                    value={selectedProvince}
                    onChange={(e) => {
                      setSelectedProvince(e.target.value);
                      setVehicleTeamFilter('ALL');
                      setCurrentPage(1);
                    }}
                    style={{
                      minWidth: 175,
                      fontWeight: 700,
                      borderColor: selectedProvince !== 'ALL' ? '#0284c7' : undefined,
                      background: selectedProvince !== 'ALL' ? '#f0f9ff' : undefined,
                      color: selectedProvince !== 'ALL' ? '#0369a1' : undefined,
                    }}
                    title="Bước 1: Chọn Tỉnh / Thành phố (API)"
                  >
                    <option value="ALL">
                      {provincesLoading ? '⏳ Đang tải Tỉnh / TP...' : `🌐 Tất cả Tỉnh / TP (${provinces.length})`}
                    </option>
                    {provinces.map((prov) => (
                      <option key={prov.id || prov.name} value={prov.name}>
                        🏙️ {prov.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* 0B. Lọc theo Quận / Huyện / Xã / Phường: Gọi API Wards của Tỉnh */}
                {isAdmin && (
                  <select
                    className="ra-filter-select"
                    value={selectedAreaId}
                    onChange={(e) => {
                      setSelectedAreaId(e.target.value);
                      setVehicleTeamFilter('ALL');
                      setCurrentPage(1);
                    }}
                    style={{
                      minWidth: 185,
                      fontWeight: 700,
                      borderColor: selectedAreaId !== 'ALL' ? '#0284c7' : undefined,
                      background: selectedAreaId !== 'ALL' ? '#f0f9ff' : undefined,
                      color: selectedAreaId !== 'ALL' ? '#0369a1' : undefined,
                    }}
                    title="Bước 2: Chọn Quận / Huyện / Xã / Phường"
                  >
                    <option value="ALL">
                      {wardsLoading
                        ? '⏳ Đang tải xã, phường từ API...'
                        : selectedProvince === 'ALL'
                          ? `📍 Tất cả địa bàn (${wards.length})`
                          : `📍 Tất cả xã / phường (${wards.length})`}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.id} value={ward.id}>
                        {ward.type === 'DISTRICT' ? '🏛️' : '📍'} {ward.name} {ward.code ? `(${ward.code})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* 1. Chọn Đội quản lý / Kho Tổng */}
                <select
                  className="ra-filter-select"
                  value={vehicleTeamFilter}
                  onChange={(e) => {
                    setVehicleTeamFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ minWidth: 210, fontWeight: 700 }}
                  title="Chọn Đội quản lý hoặc Kho tổng dự trữ"
                >
                  <option value="ALL">🏢 Tất cả Đội cứu hộ ({filteredVehicles.length} xe)</option>
                  <option value="UNASSIGNED">📦 Kho Tổng / Chưa phân công ({filteredVehicles.filter(v => !v.assignedTeam && !v.teamId).length} xe)</option>
                      {
                        scopedRescueTeams.map((team) => {
                          const count = filteredVehicles.filter(v => {
                            const tId = typeof v.teamId === 'object' ? (v.teamId as any)?._id : v.teamId;
                            return tId === team._id || v.assignedTeam?._id === team._id;
                          }).length;
                          return (
                            <option key={team._id} value={team._id}>
                              📍 {team.name} ({count} xe)
                            </option>
                          );
                        })
                      }
                </select>

                {/* 2. Chọn loại phương tiện */}
                <select
                  className="ra-filter-select"
                  value={vehicleTypeFilter}
                  onChange={(e) => {
                    setVehicleTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  title="Lọc theo chủng loại phương tiện"
                >
                  <option value="ALL">Tất cả loại phương tiện ({filteredVehicles.length})</option>
                  {STANDARD_VEHICLE_TYPES.map((t) => {
                    const count = rawVehicles.filter((v) => {
                      if (t.value === 'BOAT') return v.type === 'BOAT' || v.type === 'MOTORBOAT';
                      if (t.value === 'PICKUP_4X4') return v.type === 'PICKUP_4X4' || v.type === 'PICKUP_TRUCK' || v.type === 'PICKUP';
                      if (t.value === 'TRUCK') return v.type === 'TRUCK' || v.type === 'HIGH_CLEARANCE_TRUCK';
                      if (t.value === 'OTHER') {
                        return v.type === 'OTHER' || !STANDARD_VEHICLE_TYPES.some((st) => st.value === v.type && st.value !== 'OTHER');
                      }
                      return v.type === t.value;
                    }).length;
                    return (
                      <option key={t.value} value={t.value}>
                        {t.label} ({count})
                      </option>
                    );
                  })}
                </select>

                {/* 3. Ô tìm kiếm */}
                <div className="ra-search-box">
                  <Search size={15} className="ra-search-icon" />
                  <input
                    type="text"
                    className="ra-search-input"
                    placeholder="Tìm theo biển số, loại xe, tên đội..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {searchQuery && (
                    <button
                      className="ra-search-clear"
                      onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                      title="Xóa tìm kiếm"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* 4. Nút xóa lọc nhanh */}
                {hasActiveVehicleFilters && (
                  <button
                    type="button"
                    className="ra-clear-filter-btn"
                    onClick={handleClearVehicleFilters}
                    title="Xóa toàn bộ bộ lọc phương tiện và đặt lại mặc định"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#dc2626',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <FilterX size={14} />
                    <span>Xóa lọc</span>
                  </button>
                )}

              </div>
            </div>

            {/* BẢNG PHƯƠNG TIỆN */}
            <div className="ra-table-wrap">
              {loading && filteredVehicles.length === 0 ? (
                <div style={{ padding: '20px 0' }}>
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                </div>
              ) : filteredVehicles.length === 0 ? (
                (() => {
                  const isSpecificTeam = vehicleTeamFilter !== 'ALL' && vehicleTeamFilter !== 'UNASSIGNED';
                  const filteredTeamObj = isSpecificTeam ? rescueTeams.find((t) => t._id === vehicleTeamFilter) : null;

                  if (isSpecificTeam && filteredTeamObj) {
                    return (
                      <div className="ra-state-container" style={{ padding: '40px 20px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            border: '1px solid #bae6fd',
                          }}
                        >
                          <Truck size={32} />
                        </div>
                        <h3 className="ra-state-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                          {filteredTeamObj.name} chưa có phương tiện
                        </h3>
                        <p className="ra-state-desc" style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                          Đội cứu hộ này hiện chưa được biên chế phương tiện tác chiến nào. Bạn có thể cấp ngay phương tiện sẵn có từ Kho Tổng hoặc đăng ký mới cho đội.
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="coordination-action-btn primary"
                            onClick={() => {
                              setAssignTargetTeamId(filteredTeamObj._id);
                              setSelectedVehiclesToAssign([]);
                              setIsAssignVehicleModalOpen(true);
                            }}
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              padding: '9px 18px',
                              fontSize: 13.5,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <ArrowRightLeft size={16} />
                            <span>Biên chế xe từ Kho Tổng ({unassignedVehicles.length} xe sẵn có)</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="ra-state-container">
                      <div className="ra-state-icon empty">
                        <Truck size={32} />
                      </div>
                      <h3 className="ra-state-title">Không tìm thấy phương tiện nào phù hợp</h3>
                      <p className="ra-state-desc">
                        Vui lòng thử điều chỉnh lại bộ lọc loại xe, đơn vị quản lý hoặc từ khóa tìm kiếm.
                      </p>
                      <button
                        className="ra-btn ra-btn-secondary"
                        style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={handleClearVehicleFilters}
                      >
                        <FilterX size={14} />
                        <span>Xóa lọc</span>
                      </button>
                    </div>
                  );
                })()
              ) : (
                <table className="ra-table">
                  <thead>
                    <tr>
                      <th style={{ width: '17%' }}>BIỂN SỐ &amp; ĐỊNH DANH</th>
                      <th style={{ width: '18%' }}>LOẠI PHƯƠNG TIỆN</th>
                      <th style={{ width: '25%' }}>ĐỘI QUẢN LÝ</th>
                      <th style={{ width: '15%' }}>SỨC CHỞ / TẢI TRỌNG</th>
                      <th style={{ width: '15%' }}>TRẠNG THÁI</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedVehicles.map((v) => {
                      const team = v.assignedTeam;
                      const isUnassigned = !team;
                      const teamName = team?.name || 'Chưa phân công';
                      const areaName = typeof team?.areaId === 'object' && team?.areaId !== null
                        ? (team?.areaId as any)?.name
                        : (isUnassigned ? 'Kho Tổng dự trữ' : 'Địa bàn phụ trách');

                    const typeLabel = getVehicleTypeLabel(v.type);

                    return (
                    <tr
                      key={v._id}
                      onClick={() => setSelectedVehicle(v)}
                      style={{ cursor: 'pointer' }}
                      title="Bấm để xem hồ sơ kỹ thuật chi tiết phương tiện"
                    >
                      {/* Cột 1: Biển số & định danh */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            fontSize: 13.5,
                            color: '#0f172a',
                            background: '#f8fafc',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1'
                          }}>
                            {v.plateNumber}
                          </span>
                        </div>
                      </td>

                      {/* Cột 2: Loại phương tiện */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: '#eff6ff',
                            color: '#0284c7',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            {getVehicleIcon(v.type, 15)}
                          </span>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                            {typeLabel}
                          </span>
                        </div>
                      </td>

                      {/* Cột 3: Đội quản lý */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: isUnassigned ? '#d97706' : '#0f172a'
                          }}>
                            {teamName}
                          </span>
                          <span style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={11} color="#0284c7" />
                            {areaName}
                          </span>
                        </div>
                      </td>

                      {/* Cột 4: Sức chở / tải trọng */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: 700, color: '#0284c7', fontSize: 13 }}>
                            {v.capacity} Người / Cứu hộ
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>
                            {v.type === 'BOAT' ? 'Động cơ thủy 60HP' : 'Dẫn động 4x4 vượt lũ'}
                          </span>
                        </div>
                      </td>

                      {/* Cột 5: Trạng thái */}
                      <td>
                        {renderVehicleStatusBadge(v.status)}
                      </td>

                      {/* Cột 6: Thao tác */}
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="ra-view-btn"
                          onClick={() => setSelectedVehicle(v)}
                          title="Xem hồ sơ chi tiết phương tiện"
                        >
                          <Eye size={13} />
                          <span>Hồ sơ xe</span>
                        </button>
                      </td>
                    </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Phân trang phương tiện */}
            {renderPagination(filteredVehicles.length, totalVehiclePages, 'phương tiện')}
          </>
        ) : (
          <>
            {/* TOOLBAR THIẾT BỊ & HÀNG CỨU TRỢ (ULTRA-COMPACT: TIÊU ĐỀ + BỘ LỌC + THAO TÁC TRÊN 1 HÀNG) */}
            <div className="ra-toolbar">
              <div className="ra-toolbar-controls">
                {/* 0A. Lọc theo Tỉnh / Thành phố: Gọi API Open-API Việt Nam */}
                {isAdmin && (
                  <select
                    className="ra-filter-select"
                    value={selectedProvince}
                    onChange={(e) => {
                      setSelectedProvince(e.target.value);
                      setSupplyTeamFilter('DEPOT');
                      setCurrentPage(1);
                    }}
                    style={{
                      minWidth: 175,
                      fontWeight: 700,
                      borderColor: selectedProvince !== 'ALL' ? '#0284c7' : undefined,
                      background: selectedProvince !== 'ALL' ? '#f0f9ff' : undefined,
                      color: selectedProvince !== 'ALL' ? '#0369a1' : undefined,
                    }}
                    title="Bước 1: Chọn Tỉnh / Thành phố (API)"
                  >
                    <option value="ALL">
                      {provincesLoading ? '⏳ Đang tải Tỉnh / TP...' : `🌐 Tất cả Tỉnh / TP (${provinces.length})`}
                    </option>
                    {provinces.map((prov) => (
                      <option key={prov.id || prov.name} value={prov.name}>
                        🏙️ {prov.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* 0B. Lọc theo Quận / Huyện / Xã / Phường: Gọi API Wards của Tỉnh */}
                {isAdmin && (
                  <select
                    className="ra-filter-select"
                    value={selectedAreaId}
                    onChange={(e) => {
                      setSelectedAreaId(e.target.value);
                      setSupplyTeamFilter('DEPOT');
                      setCurrentPage(1);
                    }}
                    style={{
                      minWidth: 185,
                      fontWeight: 700,
                      borderColor: selectedAreaId !== 'ALL' ? '#0284c7' : undefined,
                      background: selectedAreaId !== 'ALL' ? '#f0f9ff' : undefined,
                      color: selectedAreaId !== 'ALL' ? '#0369a1' : undefined,
                    }}
                    title="Bước 2: Chọn Quận / Huyện / Xã / Phường"
                  >
                    <option value="ALL">
                      {wardsLoading
                        ? '⏳ Đang tải xã, phường từ API...'
                        : selectedProvince === 'ALL'
                          ? `📍 Tất cả địa bàn (${wards.length})`
                          : `📍 Tất cả xã / phường (${wards.length})`}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.id} value={ward.id}>
                        {ward.type === 'DISTRICT' ? '🏛️' : '📍'} {ward.name} {ward.code ? `(${ward.code})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* 1. Chọn Kho Tổng / Đơn vị quản lý */}
                <select
                  className="ra-filter-select"
                  value={supplyTeamFilter}
                  onChange={(e) => {
                    setSupplyTeamFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ minWidth: 210, fontWeight: 700 }}
                  title="Chọn Kho Tổng / Dự Trữ hoặc đơn vị quản lý"
                >
                  <option value="DEPOT">📦 Kho Tổng / Dự Trữ</option>
                  <option value="ALL">🏢 Toàn bộ đơn vị</option>
                    {
                      scopedRescueTeams.map((team) => (
                        <option key={team._id} value={team._id}>
                          📍 {team.name}
                        </option>
                      ))
                    }
                </select>

                {/* 2. Lọc theo Phân loại: Dùng bền vs Tiêu hao */}
                <select
                  className="ra-filter-select"
                  value={supplyTypeFilter}
                  onChange={(e) => {
                    const newType = e.target.value as any;
                    setSupplyTypeFilter(newType);
                    // Tự động reset danh mục con nếu không tương thích với phân loại mới
                    const durableCats = ['LIFE_VEST', 'MEDICAL_KIT', 'COMMUNICATION', 'LIGHTING', 'ROPE_TOOL', 'TOOL'];
                    const consumableCats = ['FOOD_WATER', 'WATER_PURIFICATION', 'MEDICAL_SUPPLY', 'FUEL', 'HYGIENE'];
                    if (newType === 'DURABLE' && consumableCats.includes(supplyCategoryFilter)) {
                      setSupplyCategoryFilter('ALL');
                    } else if (newType === 'CONSUMABLE' && durableCats.includes(supplyCategoryFilter)) {
                      setSupplyCategoryFilter('ALL');
                    }
                    setCurrentPage(1);
                  }}
                  style={{ minWidth: 165, fontWeight: 600 }}
                  title="Lọc theo phân loại mặt hàng"
                >
                  <option value="ALL">📋 Tất cả mặt hàng</option>
                  <option value="DURABLE">🛠️ Thiết bị cứu hộ</option>
                  <option value="CONSUMABLE">📦 Nhu yếu phẩm</option>
                </select>

                {/* 3. Chọn danh mục chuẩn (tự động co giãn theo Phân loại mặt hàng) */}
                <select
                  className="ra-filter-select"
                  value={supplyCategoryFilter}
                  onChange={(e) => {
                    setSupplyCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ minWidth: 160 }}
                  title="Lọc theo danh mục chuẩn"
                >
                  <option value="ALL">🏷️ Tất cả danh mục</option>
                  {(supplyTypeFilter === 'ALL' || supplyTypeFilter === 'DURABLE') && (
                    <optgroup label="🛠️ Thiết bị cứu hộ (Dùng lại)">
                      <option value="LIFE_VEST">Áo phao cứu sinh</option>
                      <option value="MEDICAL_KIT">Túi sơ cứu y tế</option>
                      <option value="COMMUNICATION">Bộ đàm vô tuyến</option>
                      <option value="LIGHTING">Đèn pin cứu hộ</option>
                      <option value="ROPE_TOOL">Dây thừng cứu hộ</option>
                      <option value="TOOL">Máy cưa &amp; Công cụ</option>
                    </optgroup>
                  )}
                  {(supplyTypeFilter === 'ALL' || supplyTypeFilter === 'CONSUMABLE') && (
                    <optgroup label="📦 Nhu yếu phẩm cứu trợ (Cấp phát)">
                      <option value="FOOD_WATER">Lương thực &amp; Nước uống</option>
                      <option value="WATER_PURIFICATION">Lọc nước &amp; Khử khuẩn</option>
                      <option value="MEDICAL_SUPPLY">Y tế &amp; Dược phẩm</option>
                      <option value="FUEL">Nhiên liệu dã chiến</option>
                      <option value="HYGIENE">Vệ sinh &amp; Nhu yếu phẩm</option>
                    </optgroup>
                  )}
                </select>

                {/* 4. Ô tìm kiếm */}
                <div className="ra-search-box">
                  <Search size={15} className="ra-search-icon" />
                  <input
                    type="text"
                    className="ra-search-input"
                    placeholder="Tìm theo tên hàng, mã lô, số sê-ri..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  {searchQuery && (
                    <button
                      className="ra-search-clear"
                      onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                      title="Xóa tìm kiếm"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* 5. Nút xóa lọc nhanh */}
                {hasActiveSupplyFilters && (
                  <button
                    type="button"
                    className="ra-clear-filter-btn"
                    onClick={handleClearSupplyFilters}
                    title="Xóa toàn bộ bộ lọc vật tư và đặt lại danh sách ban đầu"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#dc2626',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <FilterX size={14} />
                    <span>Xóa lọc</span>
                  </button>
                )}
              </div>
            </div>

            {/* BẢNG THIẾT BỊ & HÀNG CỨU TRỢ */}
            <div className="ra-table-wrap">
              {equipmentsLoading && filteredEquipments.length === 0 ? (
                <div style={{ padding: '20px 0' }}>
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                  <div className="ra-skeleton-row" />
                </div>
              ) : filteredEquipments.length === 0 ? (
                (() => {
                  const isSpecificTeam = supplyTeamFilter !== 'ALL' && supplyTeamFilter !== 'DEPOT';
                  const filteredTeamObj = isSpecificTeam ? rescueTeams.find((t) => String(t._id) === String(supplyTeamFilter)) : null;

                  if (isSpecificTeam && filteredTeamObj) {
                    const teamAllEquips = equipments.filter((e) => {
                      const tId = typeof e.teamId === 'object' && e.teamId ? (e.teamId as any)._id : e.teamId;
                      return String(tId) === String(filteredTeamObj._id);
                    });
                    const teamConsumables = teamAllEquips.filter((e) => e.supplyType === 'CONSUMABLE');
                    const teamDurables = teamAllEquips.filter((e) => e.supplyType !== 'CONSUMABLE');

                    const hasItemsOfThisType =
                      supplyTypeFilter === 'CONSUMABLE'
                        ? teamConsumables.length > 0
                        : supplyTypeFilter === 'DURABLE'
                          ? teamDurables.length > 0
                          : teamAllEquips.length > 0;

                    // Trường hợp đội thực sự có mặt hàng loại này nhưng bị ẩn do gõ tìm kiếm hoặc lọc danh mục
                    if (hasItemsOfThisType && (searchQuery.trim() !== '' || supplyCategoryFilter !== 'ALL')) {
                      return (
                        <div className="ra-state-container" style={{ padding: '40px 20px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              borderRadius: '50%',
                              background: '#f8fafc',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 16px',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <Search size={32} />
                          </div>
                          <h3 className="ra-state-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                            Không tìm thấy mặt hàng phù hợp của {filteredTeamObj.name}
                          </h3>
                          <p className="ra-state-desc" style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                            Không có kết quả nào khớp với từ khóa tìm kiếm hoặc danh mục đã chọn trong biên chế của đội.
                          </p>
                          <button
                            type="button"
                            className="ra-btn ra-btn-secondary"
                            onClick={() => {
                              setSearchQuery('');
                              setSupplyCategoryFilter('ALL');
                            }}
                          >
                            Xóa điều kiện lọc
                          </button>
                        </div>
                      );
                    }

                    // Trường hợp lọc NHU YẾU PHẨM và đội chưa có nhu yếu phẩm nào
                    if (supplyTypeFilter === 'CONSUMABLE') {
                      return (
                        <div className="ra-state-container" style={{ padding: '40px 20px', maxWidth: 580, margin: '0 auto', textAlign: 'center' }}>
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              borderRadius: '50%',
                              background: '#fffbeb',
                              color: '#d97706',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 16px',
                              border: '1px solid #fde68a',
                            }}
                          >
                            <Package size={32} />
                          </div>
                          <h3 className="ra-state-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                            {filteredTeamObj.name} chưa có nhu yếu phẩm nào
                          </h3>
                          <p className="ra-state-desc" style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                            Đội cứu hộ này hiện chưa được cấp hoặc lưu giữ nhu yếu phẩm cứu trợ nào. Bạn có thể cấp nhu yếu phẩm từ Kho Tổng cho đội hoặc tạo phiếu xuất điều phối tiếp tế ngay.
                          </p>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="coordination-action-btn primary"
                              onClick={() => {
                                setAssignEquipTargetTeamId(filteredTeamObj._id);
                                setSelectedEquipmentsToAssign({});
                                setAssignEquipNote('');
                                setAssignEquipSupplyType('CONSUMABLE');
                                setIsAssignEquipmentModalOpen(true);
                              }}
                              style={{
                                background: '#16a34a',
                                borderColor: '#16a34a',
                                padding: '9px 18px',
                                fontSize: 13.5,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <ArrowRightLeft size={16} />
                              <span>Cấp nhu yếu phẩm từ Kho Tổng ({depotConsumableEquipments.length} mặt hàng sẵn có)</span>
                            </button>
                            <button
                              type="button"
                              className="coordination-action-btn outline"
                              onClick={() => {
                                handleOpenBatchConsumeModal({ targetTeamId: filteredTeamObj._id });
                              }}
                              style={{
                                borderColor: '#0284c7',
                                color: '#0284c7',
                                background: '#f0f9ff',
                                padding: '9px 18px',
                                fontSize: 13.5,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <Truck size={16} />
                              <span>Tạo phiếu xuất điều phối cho đội</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // Trường hợp lọc THIẾT BỊ CỨU HỘ và đội chưa có thiết bị nào
                    if (supplyTypeFilter === 'DURABLE') {
                      return (
                        <div className="ra-state-container" style={{ padding: '40px 20px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              borderRadius: '50%',
                              background: '#ecfdf5',
                              color: '#16a34a',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 16px',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            <LifeBuoy size={32} />
                          </div>
                          <h3 className="ra-state-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                            {filteredTeamObj.name} chưa có thiết bị cứu hộ nào
                          </h3>
                          <p className="ra-state-desc" style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                            Đội cứu hộ này hiện chưa được biên chế thiết bị cứu hộ nào. Bạn có thể cấp ngay trang thiết bị sẵn có từ Kho Tổng cho đội.
                          </p>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="coordination-action-btn primary"
                              onClick={() => {
                                setAssignEquipTargetTeamId(filteredTeamObj._id);
                                setSelectedEquipmentsToAssign({});
                                setAssignEquipNote('');
                                setAssignEquipSupplyType('DURABLE');
                                setIsAssignEquipmentModalOpen(true);
                              }}
                              style={{
                                background: '#16a34a',
                                borderColor: '#16a34a',
                                padding: '9px 18px',
                                fontSize: 13.5,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <ArrowRightLeft size={16} />
                              <span>Cấp thiết bị từ Kho Tổng ({depotDurableEquipments.length} mặt hàng sẵn có)</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // Trường hợp lọc TẤT CẢ MẶT HÀNG và đội chưa có bất kỳ mặt hàng nào
                    return (
                      <div className="ra-state-container" style={{ padding: '40px 20px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            border: '1px solid #bae6fd',
                          }}
                        >
                          <Package size={32} />
                        </div>
                        <h3 className="ra-state-title" style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                          {filteredTeamObj.name} chưa có mặt hàng nào
                        </h3>
                        <p className="ra-state-desc" style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                          Đội cứu hộ này hiện chưa được trang bị thiết bị cứu hộ hay lưu giữ nhu yếu phẩm nào. Bạn có thể cấp thiết bị hoặc nhu yếu phẩm từ Kho Tổng cho đội.
                        </p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="coordination-action-btn primary"
                            onClick={() => {
                              setAssignEquipTargetTeamId(filteredTeamObj._id);
                              setSelectedEquipmentsToAssign({});
                              setAssignEquipNote('');
                              setAssignEquipSupplyType('DURABLE');
                              setIsAssignEquipmentModalOpen(true);
                            }}
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              padding: '9px 16px',
                              fontSize: 13,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <LifeBuoy size={15} />
                            <span>Cấp thiết bị ({depotDurableEquipments.length})</span>
                          </button>
                          <button
                            type="button"
                            className="coordination-action-btn primary"
                            onClick={() => {
                              setAssignEquipTargetTeamId(filteredTeamObj._id);
                              setSelectedEquipmentsToAssign({});
                              setAssignEquipNote('');
                              setAssignEquipSupplyType('CONSUMABLE');
                              setIsAssignEquipmentModalOpen(true);
                            }}
                            style={{
                              background: '#d97706',
                              borderColor: '#d97706',
                              color: '#ffffff',
                              padding: '9px 16px',
                              fontSize: 13,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Package size={15} />
                            <span>Cấp nhu yếu phẩm ({depotConsumableEquipments.length})</span>
                          </button>
                          <button
                            type="button"
                            className="coordination-action-btn outline"
                            onClick={() => {
                              handleOpenBatchConsumeModal({ targetTeamId: filteredTeamObj._id });
                            }}
                            style={{
                              borderColor: '#0284c7',
                              color: '#0284c7',
                              background: '#f0f9ff',
                              padding: '9px 16px',
                              fontSize: 13,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Truck size={15} />
                            <span>Tạo phiếu xuất</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="ra-state-container">
                      <div className="ra-state-icon empty">
                        <Package size={32} />
                      </div>
                      <h3 className="ra-state-title">Chưa có mặt hàng nào phù hợp</h3>
                      <p className="ra-state-desc">
                        Vui lòng thử điều chỉnh lại bộ lọc phân loại hoặc từ khóa tìm kiếm.
                      </p>
                      <button
                        className="ra-btn ra-btn-secondary"
                        style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={handleClearSupplyFilters}
                      >
                        <FilterX size={14} />
                        <span>Xóa lọc</span>
                      </button>
                    </div>
                  );
                })()
              ) : (
                <table className="ra-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center', padding: '8px 4px' }}>
                        <input
                          type="checkbox"
                          checked={(() => {
                            const availableDepot = paginatedEquipments.filter((eq) => {
                              const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
                              return !tId && eq.quantity > 0;
                            });
                            return (
                              availableDepot.length > 0 &&
                              availableDepot.every((eq) => selectedTableItemIds.includes(eq._id))
                            );
                          })()}
                          onChange={(e) => {
                            const availableDepot = paginatedEquipments.filter((eq) => {
                              const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
                              return !tId && eq.quantity > 0;
                            });
                            if (e.target.checked) {
                              const availableOnPage = availableDepot.map((eq) => eq._id);
                              setSelectedTableItemIds((prev) => Array.from(new Set([...prev, ...availableOnPage])));
                            } else {
                              const onPageDepotIds = new Set(availableDepot.map((eq) => eq._id));
                              setSelectedTableItemIds((prev) => prev.filter((id) => !onPageDepotIds.has(id)));
                            }
                          }}
                          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#0284c7' }}
                          title="Chọn tất cả mặt hàng khả dụng tại Kho Tổng trên trang này"
                        />
                      </th>
                      <th style={{ width: '22%' }}>TÊN THIẾT BỊ / NHU YẾU PHẨM</th>
                      <th style={{ width: '13%' }}>PHÂN LOẠI</th>
                      <th style={{ width: '18%' }}>ĐƠN VỊ QUẢN LÝ / VỊ TRÍ</th>
                      <th style={{ width: '14%' }}>SỐ LƯỢNG TỒN</th>
                      <th style={{ width: '14%' }}>MÃ LÔ / ĐỢT NHẬP</th>
                      <th style={{ width: '11%' }}>TÌNH TRẠNG</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEquipments.map((eq) => {
                      const isDurable = eq.supplyType !== 'CONSUMABLE';
                      const teamObj = typeof eq.teamId === 'object' ? eq.teamId : null;
                      const teamName = teamObj?.name || '—';
                      const tId = typeof eq.teamId === 'object' && eq.teamId ? (eq.teamId as any)._id : eq.teamId;
                      const isDepotItem = !tId;
                      const canSelect = isDepotItem && eq.quantity > 0;
                      const minTh = eq.minThreshold || 10;
                      const isLow = eq.quantity <= minTh * 0.3;
                      const isWarning = eq.quantity <= minTh;
                      const isSelected = selectedTableItemIds.includes(eq._id);

                      return (
                        <tr
                          key={eq._id}
                          onClick={() => setSelectedEquipment(eq)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? '#f0f9ff' : undefined,
                            transition: 'background 0.15s ease',
                          }}
                          title="Bấm để xem chi tiết"
                        >
                          {/* Cột Checkbox chọn mặt hàng */}
                          <td
                            style={{ textAlign: 'center', padding: '8px 4px', width: '40px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              disabled={!canSelect}
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (isSelected) {
                                  setSelectedTableItemIds((prev) => prev.filter((id) => id !== eq._id));
                                } else {
                                  setSelectedTableItemIds((prev) => [...prev, eq._id]);
                                }
                              }}
                              style={{
                                cursor: !canSelect ? 'not-allowed' : 'pointer',
                                width: 16,
                                height: 16,
                                accentColor: '#0284c7',
                                opacity: !canSelect ? 0.35 : 1,
                              }}
                              title={
                                !isDepotItem
                                  ? 'Mặt hàng này đang do Đội quản lý, phiếu xuất kho chỉ cấp từ Kho Tổng'
                                  : eq.quantity <= 0
                                    ? 'Mặt hàng đã hết tồn kho'
                                    : `Tích chọn để xuất "${eq.name}"`
                              }
                            />
                          </td>
                          {/* Cột 1: Tên mặt hàng */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
                                {eq.name}
                              </span>
                              <span style={{ fontSize: 11, color: '#64748b' }}>
                                Quy cách: <span style={{ color: '#334155', fontWeight: 600 }}>Quản lý theo lô nhập kho</span>
                              </span>
                            </div>
                          </td>

                          {/* Cột 2: Phân loại */}
                          <td>
                            {isDurable ? (
                              <span
                                style={{
                                  background: '#ecfdf5',
                                  color: '#15803d',
                                  border: '1px solid #bbf7d0',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <LifeBuoy size={11} />
                                <span>Thiết bị cứu hộ</span>
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Package size={11} />
                                <span>Nhu yếu phẩm</span>
                              </span>
                            )}
                          </td>

                          {/* Cột 3: Đơn vị quản lý / vị trí */}
                          <td>
                            <span style={{ fontSize: 12.5, color: teamObj ? '#0f172a' : '#b45309', fontWeight: 600 }}>
                              {teamObj ? teamName : '📦 Kho Tổng / Dự Trữ'}
                            </span>
                          </td>

                          {/* Cột 4: Số lượng tồn */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 13.5 }}>
                                {eq.quantity} {eq.unit === 'cai' ? 'cái' : eq.unit}
                              </span>
                              {isDurable ? (
                                <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                  (Sẵn sàng: {eq.status === 'AVAILABLE' ? eq.quantity : 0})
                                </span>
                              ) : (
                                <span style={{ fontSize: 10.5, fontWeight: 700, color: isLow ? '#dc2626' : isWarning ? '#b45309' : '#15803d' }}>
                                  {isLow ? '🔴 Cạn kho' : isWarning ? '🟡 Sắp hết' : '🟢 Dồi dào'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Cột 5: Mã lô / Đợt nhập */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{
                                fontFamily: 'monospace',
                                fontSize: 11.5,
                                color: '#0f172a',
                                fontWeight: 700,
                              }}>
                                {eq.serialNumber || '—'}
                              </span>
                              <span style={{ fontSize: 10.5, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                <Calendar size={11} color="#0284c7" />
                                {eq.receivedAt || eq.createdAt
                                  ? `Nhập: ${new Date(eq.receivedAt || eq.createdAt!).toLocaleDateString('vi-VN')}`
                                  : 'Đợt chuẩn'}
                              </span>
                            </div>
                          </td>

                          {/* Cột 6: Tình trạng / Trạng thái */}
                          <td>
                            {renderEquipmentStatusBadge(eq)}
                          </td>

                          {/* Cột 7: Thao tác */}
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="ra-view-btn"
                              onClick={() => setSelectedEquipment(eq)}
                              title="Xem chi tiết"
                            >
                              <Eye size={13} />
                              <span>Chi tiết</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Phân trang thiết bị & hàng cứu trợ */}
            {renderPagination(filteredEquipments.length, totalEquipmentPages, 'mặt hàng')}
          </>
        )}
      </section>

      {/* ===================================================================
          1. DRAWER CHI TIẾT HỒ SƠ PHƯƠNG TIỆN (SLIDE-OVER TỪ CẠNH MÀN HÌNH)
          =================================================================== */}
      {selectedVehicle && (() => {
        const vStatusMeta = getVehicleStatusMeta(selectedVehicle.status);
        const assignedTeamObj =
          selectedVehicle.assignedTeam ||
          rescueTeams.find(
            (t) =>
              t._id ===
              (typeof selectedVehicle.teamId === 'string'
                ? selectedVehicle.teamId
                : (selectedVehicle.teamId as any)?._id)
          );

        let teamLeaderName = '';
        let teamLeaderPhone = '';
        if (assignedTeamObj) {
          if (typeof assignedTeamObj.leaderId === 'object' && assignedTeamObj.leaderId) {
            teamLeaderName = (assignedTeamObj.leaderId as any).fullName || (assignedTeamObj.leaderId as any).name || '';
            teamLeaderPhone = (assignedTeamObj.leaderId as any).phone || '';
          } else if (Array.isArray(assignedTeamObj.members) && assignedTeamObj.members.length > 0) {
            const leaderMember = assignedTeamObj.members.find((m) => m.role === 'LEADER') || assignedTeamObj.members[0];
            const rescuerObj = typeof leaderMember?.rescuerId === 'object' ? (leaderMember.rescuerId as any) : null;
            teamLeaderName = rescuerObj?.fullName || rescuerObj?.name || '';
            teamLeaderPhone = rescuerObj?.phone || '';
          }
        }

        return (
          <div
            className={`team-drawer-backdrop ${isVehicleDrawerClosing ? 'closing' : 'open'}`}
            onClick={handleCloseVehicleDetail}
          >
            <div
              className={`team-drawer-container ${isVehicleDrawerClosing ? 'closing' : 'open'}`}
              style={{ width: 720, maxWidth: '94vw' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Drawer */}
              <div className="team-drawer-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    className="kpi-icon-squircle blue"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: '#eff6ff',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getVehicleIcon(selectedVehicle.type, 22)}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        {getVehicleTypeLabel(selectedVehicle.type)}
                      </h3>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 800,
                          fontSize: 12.5,
                          color: '#0369a1',
                          background: '#e0f2fe',
                          border: '1px solid #bae6fd',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {selectedVehicle.plateNumber}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: vStatusMeta.bg,
                          color: vStatusMeta.color,
                          border: `1px solid ${vStatusMeta.border}`,
                        }}
                      >
                        <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: vStatusMeta.dot }} />
                        <span>{vStatusMeta.label}</span>
                      </span>

                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Mã tài sản: {selectedVehicle._id.slice(-8).toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="executive-toggle-btn"
                  onClick={handleCloseVehicleDetail}
                  title="Đóng hồ sơ (ESC)"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body Drawer - Redesigned (Bố cục phẳng thoáng sạch, loại bỏ card lồng card) */}
              <div className="rd-drawer-content">
                {/* 1. Thanh tóm tắt thông số ngang đồng nhất (Single seamless bar) */}
                <div className="rd-metrics-bar">
                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Sức chở / Tải</span>
                    <span className="rd-metric-val highlight">{selectedVehicle.capacity} người</span>
                    <span className="rd-metric-sub">Cơ số cứu nạn vượt lũ</span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Chủng loại</span>
                    <span className="rd-metric-val">
                      {getVehicleTypeLabel(selectedVehicle.type)}
                    </span>
                    <span className="rd-metric-sub">Lội nước cơ động</span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Tình trạng trực chiến</span>
                    <div style={{ marginTop: 2 }}>
                      <select
                        value={selectedVehicle.status || 'AVAILABLE'}
                        onChange={(e) => handleQuickChangeVehicleStatus(e.target.value as any)}
                        style={{
                          padding: '3px 8px',
                          fontSize: 12.5,
                          fontWeight: 700,
                          borderRadius: 6,
                          border: `1px solid ${vStatusMeta.border}`,
                          background: vStatusMeta.bg,
                          color: vStatusMeta.color,
                          cursor: 'pointer',
                          outline: 'none',
                          maxWidth: '100%',
                        }}
                        title="Bấm để chuyển nhanh trạng thái trực chiến của phương tiện"
                      >
                        <option value="AVAILABLE">🟢 Sẵn sàng xuất kích</option>
                        <option value="IN_USE">🔵 Đang làm nhiệm vụ</option>
                        <option value="MAINTENANCE">🟡 Bảo dưỡng / Sửa chữa</option>
                        <option value="INACTIVE">⚪ Tạm ngưng hoạt động</option>
                      </select>
                    </div>
                    <span className="rd-metric-sub">Bấm để đổi nhanh</span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Biên chế</span>
                    <span
                      className="rd-metric-val"
                      style={{
                        color: assignedTeamObj ? '#0284c7' : '#d97706',
                      }}
                    >
                      {assignedTeamObj ? 'Đã biên chế' : 'Kho Tổng'}
                    </span>
                    <span className="rd-metric-sub">
                      {assignedTeamObj ? 'Đang trực chiến' : 'Chưa phân đội'}
                    </span>
                  </div>
                </div>

                {/* 2. Thông tin biên chế & Vận hành (Property Grid - Flat, thoáng đãng) */}
                <div className="rd-section">
                  <div className="rd-section-header">
                    <Building2 size={15} />
                    <span>Thông Tin Biên Chế &amp; Phân Vùng Tác Chiến</span>
                  </div>

                  <div className="rd-property-grid">
                    <div className="rd-property-item">
                      <span className="rd-property-label">Đội cứu hộ biên chế</span>
                      <span className="rd-property-val" style={{ color: '#0369a1' }}>
                        {assignedTeamObj?.name || '📦 Kho Tổng Cứu Trợ (Chưa biên chế)'}
                      </span>
                      {teamLeaderName && (
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                          Chỉ huy: <strong style={{ color: '#1e293b' }}>{teamLeaderName}</strong>
                        </span>
                      )}
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Hotline xuất kích khẩn cấp</span>
                      <span className="rd-property-val">
                        {teamLeaderPhone ? (
                          <a
                            href={`tel:${teamLeaderPhone}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              color: '#0284c7',
                              textDecoration: 'none',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              fontSize: 13.5,
                            }}
                            title="Bấm để gọi điện thoại khẩn cấp"
                          >
                            <Phone size={13} />
                            <span>{teamLeaderPhone}</span>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '1px 6px',
                                borderRadius: 4,
                              }}
                            >
                              Gọi ngay
                            </span>
                          </a>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12.5 }}>
                            <Phone size={13} />
                            <span>1800-1199 (Tổng đài SOS)</span>
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Biển số kiểm soát</span>
                      <span className="rd-property-val code">{selectedVehicle.plateNumber}</span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Khu vực phân vùng &amp; Bến đỗ</span>
                      <span className="rd-property-val" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MapPin size={13} color="#0284c7" />
                        <span>
                          {typeof selectedVehicle.assignedTeam?.areaId === 'object' && (selectedVehicle.assignedTeam.areaId as any)?.name
                            ? (selectedVehicle.assignedTeam.areaId as any).name
                            : (selectedVehicle.assignedTeam as any)?.areaName || (selectedVehicle.assignedTeam ? selectedVehicle.assignedTeam.name : 'Kho Tổng Dự Trữ Quốc Gia')}
                        </span>
                      </span>
                      {onOpenMap && (
                        <div>
                          <button
                            type="button"
                            onClick={() => onOpenMap()}
                            style={{
                              border: 'none',
                              background: '#eff6ff',
                              color: '#0284c7',
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              cursor: 'pointer',
                              marginTop: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <MapPin size={11} /> Xem vị trí trên bản đồ
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Quy cách kỹ thuật & Trang bị chuyên dụng kèm theo */}
                <div className="rd-section">
                  <div className="rd-section-header">
                    <Wrench size={15} />
                    <span>Trang Bị Chuyên Dụng Đi Kèm &amp; Quy Cách Kỹ Thuật</span>
                  </div>

                  <div className="rd-callout">
                    {selectedVehicle.description ||
                      'Phương tiện đã được kiểm định cơ số tác chiến tiêu chuẩn, sẵn sàng xuất kích cơ động khi có lệnh cứu hộ cứu nạn khẩn cấp từ Ban Chỉ huy Phòng chống thiên tai.'}
                  </div>
                </div>
              </div>

              {/* Footer Drawer */}
              <div className="team-drawer-footer" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Chỉnh sửa thông tin phương tiện */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => handleOpenEditVehicle(selectedVehicle)}
                    style={{ color: '#0284c7', borderColor: '#bae6fd' }}
                    title="Chỉnh sửa thông số kỹ thuật, tải trọng, biển số hoặc trang bị đi kèm"
                  >
                    <Pencil size={14} />
                    <span>Chỉnh Sửa</span>
                  </button>

                  {/* Rút khỏi đội */}
                  {(selectedVehicle.assignedTeam || selectedVehicle.teamId) && (
                    <button
                      type="button"
                      className="coordination-action-btn outline"
                      onClick={() => {
                        const tName =
                          selectedVehicle.assignedTeam?.name ||
                          rescueTeams.find((t) => t._id === selectedVehicle.teamId)?.name;
                        setDeleteConfirmTarget({
                          type: 'UNASSIGN_VEHICLE',
                          id: selectedVehicle._id,
                          name: selectedVehicle.plateNumber,
                          teamName: tName,
                        });
                      }}
                      style={{ color: '#d97706', borderColor: '#fde68a' }}
                      title="Rút xe ra khỏi đội về Kho tổng dự trữ (Không xóa xe)"
                    >
                      <LogOut size={14} />
                      <span>Rút Về Kho Tổng</span>
                    </button>
                  )}

                  {/* Điều chuyển đội */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => {
                      setTransferVehicleTarget(selectedVehicle);
                      setTransferNewTeamId(
                        selectedVehicle.assignedTeam?._id ||
                        (typeof selectedVehicle.teamId === 'string' ? selectedVehicle.teamId : '') ||
                        ''
                      );
                    }}
                    style={{ color: '#0284c7', borderColor: '#bae6fd' }}
                    title="Điều chuyển hoặc biên chế xe"
                  >
                    <ArrowRightLeft size={14} />
                    <span>
                      {selectedVehicle.assignedTeam || selectedVehicle.teamId
                        ? 'Điều Chuyển Đội'
                        : 'Biên Chế Vào Đội'}
                    </span>
                  </button>

                  {/* Xóa vĩnh viễn */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() =>
                      setDeleteConfirmTarget({
                        type: 'DELETE_VEHICLE',
                        id: selectedVehicle._id,
                        name: selectedVehicle.plateNumber,
                      })
                    }
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                    title="Xóa vĩnh viễn phương tiện (Thanh lý tài sản)"
                  >
                    <Trash2 size={14} />
                    <span>Thanh Lý Xe</span>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  <button
                    type="button"
                    className="coordination-action-btn primary"
                    onClick={handleCloseVehicleDetail}
                    style={{ minWidth: 120, justifyContent: 'center' }}
                  >
                    Đóng hồ sơ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CHỈNH SỬA HỒ SƠ PHƯƠNG TIỆN CƠ ĐỘNG */}
      {editVehicleTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isUpdatingVehicle && setEditVehicleTarget(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="executive-modal-header" style={{ background: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="executive-modal-title" style={{ color: '#0369a1' }}>
                    Chỉnh Sửa Hồ Sơ Phương Tiện
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                    Cập nhật biển số, sức chở, trạng thái trực chiến và đơn vị biên chế
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isUpdatingVehicle && setEditVehicleTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditVehicle}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="executive-modal-field">
                  <label className="executive-modal-label">Biển số / Định danh phương tiện (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 43C-XP-999 hoặc 43-CANO-02"
                    className="executive-modal-input"
                    value={editVehiclePlate}
                    onChange={(e) => setEditVehiclePlate(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Chủng loại phương tiện</label>
                    <select
                      className="executive-modal-select"
                      value={editVehicleType}
                      onChange={(e) => setEditVehicleType(e.target.value as any)}
                    >
                      <optgroup label="🚤 Phương tiện thủy cứu nạn">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Phương tiện thủy cứu nạn').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="🚛 Xe cơ giới đường bộ &amp; lội nước">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Xe cơ giới đường bộ & lội nước').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="🛸 Thiết bị bay chuyên dụng">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Thiết bị bay chuyên dụng').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="⚙️ Đặc chủng khác">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Đặc chủng khác').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Sức chở tối đa (Người)</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="executive-modal-input"
                      value={editVehicleCapacity}
                      onChange={(e) => setEditVehicleCapacity(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Trạng thái trực chiến</label>
                    <select
                      className="executive-modal-select"
                      value={editVehicleStatus}
                      onChange={(e) => setEditVehicleStatus(e.target.value as any)}
                    >
                      <option value="AVAILABLE">🟢 Sẵn sàng xuất kích</option>
                      <option value="IN_USE">🟡 Đang làm nhiệm vụ</option>
                      <option value="MAINTENANCE">🔴 Bảo dưỡng / Hỏng hóc</option>
                      <option value="INACTIVE">⚪ Tạm ngưng hoạt động</option>
                    </select>
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Đội cứu hộ biên chế</label>
                    <select
                      className="executive-modal-select"
                      value={editVehicleTeamId}
                      onChange={(e) => setEditVehicleTeamId(e.target.value)}
                    >
                      <option value="">📦 Kho tổng dự trữ (Chưa biên chế)</option>
                      {rescueTeams.map((team) => (
                        <option key={team._id} value={team._id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Mô tả quy cách kỹ thuật &amp; Trang bị đi kèm</label>
                  <textarea
                    rows={3}
                    placeholder="Mô tả công suất máy, tời kéo cứu hộ, ống thở chống ngập..."
                    className="executive-modal-textarea"
                    value={editVehicleDescription}
                    onChange={(e) => setEditVehicleDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setEditVehicleTarget(null)}
                  disabled={isUpdatingVehicle}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingVehicle}
                  className="coordination-action-btn primary"
                >
                  <Check size={15} />
                  <span>{isUpdatingVehicle ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: THÊM PHƯƠNG TIỆN MỚI */}
      {isCreateVehicleOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateVehicleOpen(false)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Thêm Phương Tiện Cơ Động Mới</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  Đăng ký phương tiện cứu hộ vào cơ số quản lý tác chiến
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setIsCreateVehicleOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateVehicle}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="executive-modal-field">
                  <label className="executive-modal-label">Biển số / Định danh phương tiện (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 43C-888.99 hoặc 43-CANO-02"
                    className="executive-modal-input"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Chủng loại</label>
                    <select
                      className="executive-modal-select"
                      value={newType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        setNewType(nextType as any);
                        const matched = STANDARD_VEHICLE_TYPES.find((v) => v.value === nextType);
                        if (matched) {
                          setNewCapacity(matched.defaultCapacity);
                        }
                      }}
                    >
                      <optgroup label="🚤 Phương tiện thủy cứu nạn">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Phương tiện thủy cứu nạn').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="🚛 Xe cơ giới đường bộ &amp; lội nước">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Xe cơ giới đường bộ & lội nước').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="🛸 Thiết bị bay chuyên dụng">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Thiết bị bay chuyên dụng').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="⚙️ Đặc chủng khác">
                        {STANDARD_VEHICLE_TYPES.filter((v) => v.group === 'Đặc chủng khác').map((v) => (
                          <option key={v.value} value={v.value}>{v.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Sức chở tối đa (Người)</label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      className="executive-modal-input"
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Đội cứu hộ tiếp nhận &amp; quản lý</label>
                  <select
                    className="executive-modal-select"
                    value={newTeamId}
                    onChange={(e) => setNewTeamId(e.target.value)}
                  >
                    <option value="">📦 Kho tổng dự trữ (Chưa biên chế vào đội nào)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Mô tả trang bị chuyên dụng</label>
                  <textarea
                    rows={3}
                    placeholder="Mô tả công suất máy, tời kéo cứu nạn, ống thở chống ngập, bình oxy..."
                    className="executive-modal-textarea"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsCreateVehicleOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVehicle}
                  className="coordination-action-btn primary"
                >
                  <Check size={15} />
                  <span>{isSubmittingVehicle ? 'Đang lưu...' : 'Lưu & Kích Hoạt'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: THÊM TRANG THIẾT BỊ / NHẬP KHO VẬT TƯ TIÊU HAO */}
      {isCreateEquipmentOpen && (
        <div className="executive-modal-backdrop" onClick={() => setIsCreateEquipmentOpen(false)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="executive-modal-header" style={{
              background: '#f0f9ff',
              borderBottom: '1px solid #bae6fd'
            }}>
              <div>
                <h3 className="executive-modal-title" style={{ color: '#0369a1' }}>
                  {eqSupplyType === 'CONSUMABLE' ? '📦 Nhập Kho Nhu Yếu Phẩm' : '🛠️ Thêm Thiết Bị Cứu Hộ Mới'}
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                  {eqSupplyType === 'CONSUMABLE'
                    ? 'Nhập mới cơ số lương thực, nước sạch, dược phẩm, nhu yếu phẩm phục vụ cứu trợ'
                    : 'Nhập mới trang thiết bị cứu hộ chuyên dụng cho Đội hoặc lưu Kho tổng dự trữ'}
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => setIsCreateEquipmentOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateEquipment}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 0. Chuyển đổi phân loại mặt hàng nhập kho */}
                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: 4,
                  borderRadius: 10,
                  gap: 6,
                  border: '1px solid #e2e8f0'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEqSupplyType('DURABLE');
                      setEqName(STANDARD_EQUIPMENT_CATALOG[0].name);
                      setEqCategory(STANDARD_EQUIPMENT_CATALOG[0].category);
                      setEqUnit(STANDARD_EQUIPMENT_CATALOG[0].unit);
                      setCustomEqName('');
                      setEqQuantity(1);
                      setEqSerialNumber(generateRandomEquipmentSerial(STANDARD_EQUIPMENT_CATALOG[0].category));
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: eqSupplyType !== 'CONSUMABLE' ? '#ffffff' : 'transparent',
                      color: eqSupplyType !== 'CONSUMABLE' ? '#16a34a' : '#64748b',
                      boxShadow: eqSupplyType !== 'CONSUMABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <LifeBuoy size={14} />
                    <span>🛠️ Thiết bị cứu hộ (Dùng lại)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEqSupplyType('CONSUMABLE');
                      setEqName(STANDARD_CONSUMABLE_CATALOG[0].name);
                      setEqCategory(STANDARD_CONSUMABLE_CATALOG[0].category);
                      setEqUnit(STANDARD_CONSUMABLE_CATALOG[0].unit);
                      setCustomEqName('');
                      setEqQuantity(10);
                      setEqMinThreshold(STANDARD_CONSUMABLE_CATALOG[0].minThreshold);
                      setEqSerialNumber(`LÔ-VT-${Date.now().toString().slice(-4)}`);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: eqSupplyType === 'CONSUMABLE' ? '#ffffff' : 'transparent',
                      color: eqSupplyType === 'CONSUMABLE' ? '#d97706' : '#64748b',
                      boxShadow: eqSupplyType === 'CONSUMABLE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Package size={14} />
                    <span>📦 Nhu yếu phẩm (Cấp phát)</span>
                  </button>
                </div>

                {/* 1. Chọn đội tiếp nhận hoặc Kho tổng */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    {eqSupplyType === 'CONSUMABLE' ? 'Kho lưu trữ / Đơn vị phụ trách xuất cấp (*)' : 'Đơn vị tiếp nhận &amp; chịu trách nhiệm (*)'}
                  </label>
                  <select
                    className="executive-modal-select"
                    value={eqTeamId}
                    onChange={(e) => setEqTeamId(e.target.value)}
                  >
                    <option value="">
                      {eqSupplyType === 'CONSUMABLE'
                        ? '📦 Kho tổng dự trữ (Mặc định - Trung tâm Tiếp nhận &amp; Điều phối)'
                        : '📦 Kho tổng dự trữ (Trung tâm Tiếp nhận &amp; Bàn giao trang thiết bị)'}
                    </option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                      </option>
                    ))}
                  </select>
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                    {eqSupplyType === 'CONSUMABLE'
                      ? '💡 Mặc định lưu Kho tổng để điều phối chung; chỉ chọn Đội nếu hàng cứu trợ được chuyển thẳng đến trạm dã chiến của đội đó.'
                      : '💡 Chọn Đội tiếp nhận trực tiếp hoặc lưu Kho tổng dự trữ để sẵn sàng điều chuyển khi có lệnh.'}
                  </p>
                </div>

                {/* 2. Loại hàng hóa theo catalog chuẩn */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                    {eqSupplyType === 'CONSUMABLE' ? 'Danh mục nhu yếu phẩm chuẩn (*)' : 'Loại Thiết Bị Cứu Hộ (*)'}
                  </label>
                  {eqSupplyType === 'CONSUMABLE' ? (
                    <select
                      className="executive-modal-select"
                      value={eqName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEqName(val);
                        const matched = STANDARD_CONSUMABLE_CATALOG.find((item) => item.name === val);
                        if (matched) {
                          setEqCategory(matched.category);
                          setEqUnit(matched.unit);
                          setEqMinThreshold(matched.minThreshold);
                          setEqSerialNumber(`LÔ-VT-${Date.now().toString().slice(-4)}`);
                        }
                      }}
                      required
                    >
                      {STANDARD_CONSUMABLE_CATALOG.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name}
                        </option>
                      ))}
                      <option value="CUSTOM">➕ Khác (Nhập mặt hàng cứu trợ khác)...</option>
                    </select>
                  ) : (
                    <select
                      className="executive-modal-select"
                      value={eqName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEqName(val);
                        const matched = STANDARD_EQUIPMENT_CATALOG.find((item) => item.name === val);
                        if (matched) {
                          setEqCategory(matched.category);
                          setEqUnit(matched.unit);
                          setEqSerialNumber(generateRandomEquipmentSerial(matched.category));
                        } else if (val === 'CUSTOM') {
                          setEqSerialNumber(generateRandomEquipmentSerial('KT'));
                        }
                      }}
                      required
                    >
                      {STANDARD_EQUIPMENT_CATALOG.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                      <option value="CUSTOM">➕ Khác (Nhập thiết bị tùy chỉnh)...</option>
                    </select>
                  )}
                </div>

                {/* Nếu chọn nhập tùy chỉnh */}
                {eqName === 'CUSTOM' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Tên mặt hàng mới (*)
                      </label>
                      <input
                        type="text"
                        className="executive-modal-input"
                        placeholder={eqSupplyType === 'CONSUMABLE' ? 'VD: Chăn giữ nhiệt, Sữa đặc...' : 'VD: Phao bè cứu sinh, Máy phát điện...'}
                        value={customEqName}
                        onChange={(e) => setCustomEqName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Đơn vị tính (*)
                      </label>
                      <input
                        type="text"
                        className="executive-modal-input"
                        placeholder="VD: thùng, cái, hộp..."
                        value={eqUnit}
                        onChange={(e) => setEqUnit(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                {/* 3. Cơ số số lượng & Ngưỡng báo động tồn kho (Consumable) hoặc Ngày nhập kho (Khí tài) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                      Số lượng nhập {eqUnit ? `(${eqUnit})` : ''} (*)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={99999}
                      required
                      className="executive-modal-input"
                      value={eqQuantity}
                      onChange={(e) => setEqQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>

                  {eqSupplyType === 'CONSUMABLE' ? (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngưỡng báo động tồn kho (Min) (*)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        required
                        className="executive-modal-input"
                        value={eqMinThreshold}
                        onChange={(e) => setEqMinThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        placeholder="VD: 20"
                        title="Hệ thống cảnh báo đỏ khi lượng tồn dưới mức này"
                      />
                    </div>
                  ) : (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngày nhập kho / Tiếp nhận (*)
                      </label>
                      <input
                        type="date"
                        required
                        className="executive-modal-input"
                        value={eqReceivedAt}
                        onChange={(e) => setEqReceivedAt(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* 4. Ngày nhập kho & Mã lô hàng */}
                <div style={{ display: 'grid', gridTemplateColumns: eqSupplyType === 'CONSUMABLE' ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {eqSupplyType === 'CONSUMABLE' && (
                    <div className="executive-modal-field">
                      <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                        Ngày nhập kho / Tiếp nhận (*)
                      </label>
                      <input
                        type="date"
                        required
                        className="executive-modal-input"
                        value={eqReceivedAt}
                        onChange={(e) => setEqReceivedAt(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700 }}>
                      Mã lô hàng / Số sê-ri đợt nhập
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={eqSerialNumber}
                      onChange={(e) => setEqSerialNumber(e.target.value)}
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                      placeholder={eqSupplyType === 'CONSUMABLE' ? 'VD: LÔ-LK-202610...' : 'VD: LÔ-AP-6772...'}
                    />
                  </div>
                </div>

                {/* 6. Ghi chú kỹ thuật / bảo quản */}
                <div className="executive-modal-field">
                  <label className="executive-modal-label">
                    {eqSupplyType === 'CONSUMABLE' ? 'Hướng dẫn bảo quản & Điều kiện lưu kho' : 'Thông số kỹ thuật & Hướng dẫn sử dụng'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={eqSupplyType === 'CONSUMABLE'
                      ? 'VD: Bảo quản nơi khô ráo, nhiệt độ dưới 30°C, ưu tiên xuất trước cho vùng cô lập...'
                      : 'VD: Động cơ xăng 2 thì, áp lực phao đạt chuẩn SOLAS 150N, pin dùng 36 tiếng liên tục...'}
                    className="executive-modal-textarea"
                    value={eqNote}
                    onChange={(e) => setEqNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  className="coordination-action-btn outline"
                  onClick={() => setIsCreateEquipmentOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEquipment}
                  className="coordination-action-btn primary"
                >
                  <Check size={15} />
                  <span>
                    {isSubmittingEquipment
                      ? 'Đang nhập kho...'
                      : eqSupplyType === 'CONSUMABLE'
                        ? 'Xác Nhận Nhập Kho Nhu Yếu Phẩm'
                        : 'Xác Nhận Nhập Thiết Bị Cứu Hộ'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL 4: HỘP THOẠI XÁC NHẬN RÚT KHỎI ĐỘI HOẶC XÓA TÀI SẢN (CUSTOM UI THAY THẾ ALERT/CONFIRM CỦA TRÌNH DUYỆT) */}
      {deleteConfirmTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isDeleting && setDeleteConfirmTarget(null)}>
          <div
            className="executive-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, borderRadius: 16, overflow: 'hidden' }}
          >
            <div
              className="executive-modal-header"
              style={{
                borderBottom:
                  deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                    ? '1px solid #fef3c7'
                    : '1px solid #fee2e2',
                background:
                  deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                    ? '#fffbeb'
                    : '#fff5f5',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background:
                      deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                        ? '#fef3c7'
                        : '#fef2f2',
                    border:
                      deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                        ? '1px solid #fde68a'
                        : '1px solid #fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color:
                      deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                        ? '#b45309'
                        : '#dc2626',
                    flexShrink: 0,
                  }}
                >
                  {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT' ? (
                    <LogOut size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                </div>
                <div>
                  <h3
                    className="executive-modal-title"
                    style={{
                      color:
                        deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                          ? '#92400e'
                          : '#991b1b',
                      fontSize: 16,
                    }}
                  >
                    {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE'
                      ? 'Rút Phương Tiện Ra Khỏi Đội'
                      : deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                        ? 'Thu Hồi Vật Tư Về Kho Tổng'
                        : deleteConfirmTarget.type === 'DELETE_VEHICLE'
                          ? 'Xác Nhận Xóa Vĩnh Viễn Phương Tiện'
                          : 'Xác Nhận Thanh Lý & Xóa Vật Tư'}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color:
                        deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                          ? '#b45309'
                          : '#b91c1c',
                    }}
                  >
                    {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                      ? 'Chuyển tài sản về Kho tổng dự trữ SOS (Không xóa khỏi hệ thống)'
                      : 'Loại bỏ hoàn toàn tài sản khỏi danh mục cơ sở dữ liệu'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isDeleting && setDeleteConfirmTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="executive-modal-body" style={{ padding: '20px 24px', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
              {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' ? (
                <>
                  Bạn có chắc chắn muốn rút phương tiện <strong style={{ color: '#0f172a' }}>"{deleteConfirmTarget.name}"</strong> ra khỏi {deleteConfirmTarget.teamName ? <strong>đội "{deleteConfirmTarget.teamName}"</strong> : 'đội cứu hộ'} không?
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#fefce8',
                      border: '1px solid #fef08a',
                      fontSize: 12,
                      color: '#854d0e',
                      lineHeight: 1.5,
                    }}
                  >
                    💡 <strong>Phương tiện sẽ không bị xóa:</strong> Xe sẽ được bảo lưu an toàn trong hệ thống và chuyển về trạng thái <strong>"📦 Kho Tổng / Chưa Biên Chế"</strong>. Bạn có thể điều chuyển xe sang bất kỳ đội cứu hộ nào khác sau này.
                  </div>
                </>
              ) : deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT' ? (
                <>
                  Bạn có chắc chắn muốn thu hồi trang bị / vật tư <strong style={{ color: '#0f172a' }}>"{deleteConfirmTarget.name}"</strong> ra khỏi {deleteConfirmTarget.teamName ? <strong>đội "{deleteConfirmTarget.teamName}"</strong> : 'đội cứu hộ'} về Kho Tổng Cứu Trợ SOS không?
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#fefce8',
                      border: '1px solid #fef08a',
                      fontSize: 12,
                      color: '#854d0e',
                      lineHeight: 1.5,
                    }}
                  >
                    💡 <strong>Vật tư sẽ không bị mất:</strong> Tài sản sẽ được chuyển về <strong>"📦 Kho Tổng Cứu Trợ SOS"</strong>, sẵn sàng điều phối chi viện cho các đội khác khi có yêu cầu ứng phó khẩn cấp.
                  </div>
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn {deleteConfirmTarget.type === 'DELETE_VEHICLE' ? 'xóa vĩnh viễn phương tiện' : 'thanh lý và xóa vật tư'}{' '}
                  <strong style={{ color: '#0f172a' }}>"{deleteConfirmTarget.name}"</strong> khỏi hệ thống?
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      fontSize: 12,
                      color: '#991b1b',
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ <strong>Cảnh báo xóa vĩnh viễn:</strong> Toàn bộ dữ liệu của tài sản này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu và không thể hoàn tác.
                  </div>
                </>
              )}
            </div>

            <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                disabled={isDeleting}
                className="coordination-action-btn outline"
                onClick={() => setDeleteConfirmTarget(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                className="coordination-action-btn primary"
                onClick={handleExecuteDelete}
                style={{
                  background:
                    deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                      ? '#d97706'
                      : '#dc2626',
                  borderColor:
                    deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                      ? '#d97706'
                      : '#dc2626',
                }}
              >
                {deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT' ? (
                  <LogOut size={14} />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>
                  {isDeleting
                    ? 'Đang xử lý...'
                    : deleteConfirmTarget.type === 'UNASSIGN_VEHICLE' || deleteConfirmTarget.type === 'UNASSIGN_EQUIPMENT'
                      ? 'Xác Nhận Rút Về Kho'
                      : deleteConfirmTarget.type === 'DELETE_VEHICLE'
                        ? 'Xác Nhận Xóa Vĩnh Viễn'
                        : 'Xác Nhận Thanh Lý'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ĐIỀU CHUYỂN / BIÊN CHẾ PHƯƠNG TIỆN VÀO ĐỘI CỨU HỘ */}
      {transferVehicleTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isTransferring && setTransferVehicleTarget(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, borderRadius: 16 }}>
            <div className="executive-modal-header" style={{ borderBottom: '1px solid #e0f2fe', background: '#f0f9ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#e0f2fe',
                    border: '1px solid #bae6fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    flexShrink: 0,
                  }}
                >
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                    Điều Chuyển / Biên Chế Phương Tiện
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                    Xe: <strong>{transferVehicleTarget.plateNumber}</strong> ({transferVehicleTarget.type})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isTransferring && setTransferVehicleTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} noValidate>
              <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="executive-modal-field">
                  <label className="executive-modal-label" style={{ fontWeight: 700, color: transferVehicleError ? '#ef4444' : '#0f172a' }}>
                    Đội cứu hộ tiếp nhận biên chế (*)
                  </label>
                  <select
                    className="executive-modal-select"
                    value={transferNewTeamId}
                    onChange={(e) => {
                      setTransferNewTeamId(e.target.value);
                      if (transferVehicleError) setTransferVehicleError('');
                    }}
                    style={{
                      border: transferVehicleError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                      backgroundColor: transferVehicleError ? '#fef2f2' : '#ffffff',
                      boxShadow: transferVehicleError ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <option value="">-- Chọn đội cứu hộ tiếp nhận xe --</option>
                    <option value="NONE">📦 Kho tổng dự trữ (Không trực thuộc đội nào)</option>
                    {rescueTeams.map((team) => (
                      <option key={team._id} value={team._id}>
                        {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                      </option>
                    ))}
                  </select>
                  {transferVehicleError && (
                    <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={14} />
                      <span>{transferVehicleError}</span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    color: '#64748b',
                    lineHeight: 1.5,
                  }}
                >
                  ℹ️ Khi điều chuyển, phương tiện sẽ xuất hiện trong danh sách xe cơ động của đội mới và được Đội trưởng quản lý trực tiếp.
                </div>
              </div>

              <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  disabled={isTransferring}
                  className="coordination-action-btn outline"
                  onClick={() => setTransferVehicleTarget(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isTransferring}
                  className="coordination-action-btn primary"
                  style={{ background: '#0284c7', borderColor: '#0284c7', cursor: isTransferring ? 'not-allowed' : 'pointer' }}
                >
                  <Check size={14} />
                  <span>{isTransferring ? 'Đang cập nhật...' : 'Xác Nhận Biên Chế'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5B: BIÊN CHẾ PHƯƠNG TIỆN TỪ KHO TỔNG CHO ĐỘI CỨU HỘ */}
      {isAssignVehicleModalOpen && (() => {
        const allSelected = unassignedVehicles.length > 0 && selectedVehiclesToAssign.length === unassignedVehicles.length;

        const toggleSelectAll = () => {
          if (allSelected) {
            setSelectedVehiclesToAssign([]);
          } else {
            setSelectedVehiclesToAssign(unassignedVehicles.map((v) => v._id));
          }
        };

        const toggleSelectVehicle = (vId: string) => {
          setSelectedVehiclesToAssign((prev) =>
            prev.includes(vId) ? prev.filter((id) => id !== vId) : [...prev, vId]
          );
        };

        return (
          <div
            className="executive-modal-backdrop"
            onClick={() => !isAssigningVehicles && setIsAssignVehicleModalOpen(false)}
          >
            <div
              className="executive-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 640, borderRadius: 16 }}
            >
              <div
                className="executive-modal-header"
                style={{ borderBottom: '1px solid #bbf7d0', background: '#f0fdf4' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#dcfce7',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#16a34a',
                      flexShrink: 0,
                    }}
                  >
                    <ArrowRightLeft size={18} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#166534', fontSize: 16 }}>
                      Biên Chế Phương Tiện Cho Đội Cứu Hộ
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#15803d' }}>
                      Cấp phương tiện tác chiến sẵn có từ Kho Tổng Dự Trữ cho Đội cơ động
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isAssigningVehicles && setIsAssignVehicleModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmAssignVehicles} noValidate>
                <div
                  className="executive-modal-body"
                  style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  {/* 1. Chọn Đội tiếp nhận */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Đội cứu hộ tiếp nhận biên chế (*)
                    </label>
                    <select
                      className="executive-modal-select"
                      value={assignTargetTeamId}
                      onChange={(e) => setAssignTargetTeamId(e.target.value)}
                      style={{
                        fontWeight: 700,
                        borderColor: '#cbd5e1',
                      }}
                    >
                      <option value="">-- Chọn đội cứu hộ tiếp nhận xe --</option>
                      {rescueTeams.map((team) => (
                        <option key={team._id} value={team._id}>
                          🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Danh sách phương tiện tại Kho Tổng */}
                  <div className="executive-modal-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Chọn phương tiện từ Kho Tổng / Dự Trữ ({unassignedVehicles.length} xe sẵn có)
                      </label>
                      {unassignedVehicles.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </button>
                      )}
                    </div>

                    {unassignedVehicles.length === 0 ? (
                      <div
                        style={{
                          padding: '24px 16px',
                          borderRadius: 10,
                          background: '#fefce8',
                          border: '1px solid #fef08a',
                          textAlign: 'center',
                          color: '#854d0e',
                          fontSize: 13,
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700 }}>Kho Tổng hiện không còn phương tiện nào chưa phân công.</p>
                        <p style={{ margin: '6px 0 12px', fontSize: 12, color: '#a16207' }}>
                          Bạn có thể đăng ký phương tiện mới hoặc rút xe từ đội khác về kho trước khi biên chế.
                        </p>
                        <button
                          type="button"
                          className="coordination-action-btn primary"
                          onClick={() => {
                            setIsAssignVehicleModalOpen(false);
                            setNewPlate('');
                            setNewType('BOAT');
                            setNewCapacity(8);
                            setNewTeamId(assignTargetTeamId || '');
                            setNewDescription('');
                            setIsCreateVehicleOpen(true);
                          }}
                          style={{ margin: '0 auto', fontSize: 12.5 }}
                        >
                          <PlusCircle size={14} />
                          <span>+ Đăng ký phương tiện mới</span>
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          maxHeight: 250,
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          padding: 6,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          background: '#f8fafc',
                        }}
                      >
                        {unassignedVehicles.map((veh) => {
                          const isSelected = selectedVehiclesToAssign.includes(veh._id);
                          return (
                            <div
                              key={veh._id}
                              onClick={() => toggleSelectVehicle(veh._id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                borderRadius: 8,
                                background: isSelected ? '#f0fdf4' : '#ffffff',
                                border: isSelected ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectVehicle(veh._id)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }}
                              />
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: isSelected ? '#dcfce7' : '#eff6ff',
                                  color: isSelected ? '#16a34a' : '#0284c7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {getVehicleIcon(veh.type, 15)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span
                                    style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 800,
                                      fontSize: 13,
                                      color: '#0f172a',
                                      background: '#f1f5f9',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                    }}
                                  >
                                    {veh.plateNumber}
                                  </span>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>
                                    {getVehicleTypeLabel(veh.type)}
                                  </span>
                                  <span style={{ fontSize: 12, color: '#64748b' }}>
                                    • Sức chở: <strong style={{ color: '#0f172a' }}>{veh.capacity}</strong> người
                                  </span>
                                </div>
                                {veh.description && (
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: '#64748b',
                                      marginTop: 3,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {veh.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Ghi chú điều chuyển / biên chế */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Lý do / Quyết định biên chế <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder="VD: Cấp tăng cường ứng phó lũ lụt, phục vụ cứu nạn tại chỗ..."
                      value={assignVehicleNote}
                      onChange={(e) => setAssignVehicleNote(e.target.value)}
                    />
                  </div>
                </div>

                <div
                  className="executive-modal-footer"
                  style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}
                >
                  <button
                    type="button"
                    disabled={isAssigningVehicles}
                    className="coordination-action-btn outline"
                    onClick={() => setIsAssignVehicleModalOpen(false)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isAssigningVehicles || selectedVehiclesToAssign.length === 0 || !assignTargetTeamId}
                    className="coordination-action-btn primary"
                    style={{
                      background: '#16a34a',
                      borderColor: '#16a34a',
                      cursor:
                        isAssigningVehicles || selectedVehiclesToAssign.length === 0 || !assignTargetTeamId
                          ? 'not-allowed'
                          : 'pointer',
                      opacity:
                        isAssigningVehicles || selectedVehiclesToAssign.length === 0 || !assignTargetTeamId ? 0.6 : 1,
                    }}
                  >
                    <Check size={14} />
                    <span>
                      {isAssigningVehicles
                        ? 'Đang biên chế...'
                        : `Xác Nhận Biên Chế (${selectedVehiclesToAssign.length} xe)`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL 5C: CẤP TRANG THIẾT BỊ / NHU YẾU PHẨM TỪ KHO TỔNG CHO ĐỘI CỨU HỘ */}
      {isAssignEquipmentModalOpen && (() => {
        const activeDepotList =
          assignEquipSupplyType === 'DURABLE'
            ? depotDurableEquipments
            : assignEquipSupplyType === 'CONSUMABLE'
              ? depotConsumableEquipments
              : depotAllEquipments;

        const selectedIds = Object.keys(selectedEquipmentsToAssign).filter(
          (id) => (selectedEquipmentsToAssign[id] || 0) > 0
        );
        const selectedCount = selectedIds.length;
        const allSelected =
          activeDepotList.length > 0 &&
          activeDepotList.every((eq) => Boolean(selectedEquipmentsToAssign[eq._id] && selectedEquipmentsToAssign[eq._id] > 0));

        const toggleSelectAll = () => {
          if (allSelected) {
            setSelectedEquipmentsToAssign((prev) => {
              const next = { ...prev };
              activeDepotList.forEach((eq) => {
                delete next[eq._id];
              });
              return next;
            });
          } else {
            setSelectedEquipmentsToAssign((prev) => {
              const next = { ...prev };
              activeDepotList.forEach((eq) => {
                next[eq._id] = eq.quantity;
              });
              return next;
            });
          }
        };

        const toggleSelectEquipment = (eqItem: EquipmentItem) => {
          setSelectedEquipmentsToAssign((prev) => {
            const next = { ...prev };
            if (next[eqItem._id]) {
              delete next[eqItem._id];
            } else {
              next[eqItem._id] = eqItem.quantity;
            }
            return next;
          });
        };

        const modalTitle =
          assignEquipSupplyType === 'CONSUMABLE'
            ? 'Cấp Nhu Yếu Phẩm Cho Đội Cứu Hộ'
            : assignEquipSupplyType === 'DURABLE'
              ? 'Cấp Thiết Bị Cho Đội Cứu Hộ'
              : 'Cấp Mặt Hàng Cho Đội Cứu Hộ';

        const modalSubtitle =
          assignEquipSupplyType === 'CONSUMABLE'
            ? 'Điều phối & bàn giao nhu yếu phẩm cứu trợ từ Kho Tổng cho Đội cơ động tiếp tế'
            : assignEquipSupplyType === 'DURABLE'
              ? 'Điều phối & bàn giao thiết bị cứu hộ sẵn có từ Kho Tổng cho Đội cơ động'
              : 'Điều phối & bàn giao thiết bị hoặc nhu yếu phẩm từ Kho Tổng cho Đội cơ động';

        const headerBg = assignEquipSupplyType === 'CONSUMABLE' ? '#fffbeb' : '#f0fdf4';
        const headerBorder = assignEquipSupplyType === 'CONSUMABLE' ? '#fde68a' : '#bbf7d0';
        const iconBg = assignEquipSupplyType === 'CONSUMABLE' ? '#fef3c7' : '#dcfce7';
        const iconColor = assignEquipSupplyType === 'CONSUMABLE' ? '#d97706' : '#16a34a';
        const titleColor = assignEquipSupplyType === 'CONSUMABLE' ? '#92400e' : '#166534';
        const subtitleColor = assignEquipSupplyType === 'CONSUMABLE' ? '#b45309' : '#15803d';

        return (
          <div
            className="executive-modal-backdrop"
            onClick={() => !isAssigningEquipment && setIsAssignEquipmentModalOpen(false)}
          >
            <div
              className="executive-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 680, borderRadius: 16 }}
            >
              <div
                className="executive-modal-header"
                style={{ borderBottom: `1px solid ${headerBorder}`, background: headerBg }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: iconBg,
                      border: `1px solid ${headerBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: iconColor,
                      flexShrink: 0,
                    }}
                  >
                    {assignEquipSupplyType === 'CONSUMABLE' ? (
                      <Package size={18} />
                    ) : assignEquipSupplyType === 'DURABLE' ? (
                      <LifeBuoy size={18} />
                    ) : (
                      <ArrowRightLeft size={18} />
                    )}
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: titleColor, fontSize: 16 }}>
                      {modalTitle}
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: subtitleColor }}>
                      {modalSubtitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isAssigningEquipment && setIsAssignEquipmentModalOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmAssignEquipments} noValidate>
                <div
                  className="executive-modal-body"
                  style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
                >
                  {/* 1. Chọn Đội tiếp nhận */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Đội cứu hộ tiếp nhận bàn giao (*)
                    </label>
                    <select
                      className="executive-modal-select"
                      value={assignEquipTargetTeamId}
                      onChange={(e) => setAssignEquipTargetTeamId(e.target.value)}
                      style={{
                        fontWeight: 700,
                        borderColor: '#cbd5e1',
                      }}
                    >
                      <option value="">-- Chọn đội cứu hộ tiếp nhận bàn giao --</option>
                      {rescueTeams.map((team) => (
                        <option key={team._id} value={team._id}>
                          🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Tỉnh'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Bộ lọc phân loại nhanh trong Modal */}
                  <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
                    <button
                      type="button"
                      onClick={() => setAssignEquipSupplyType('ALL')}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: assignEquipSupplyType === 'ALL' ? 700 : 500,
                        borderRadius: 6,
                        border: 'none',
                        background: assignEquipSupplyType === 'ALL' ? '#ffffff' : 'transparent',
                        color: assignEquipSupplyType === 'ALL' ? '#0f172a' : '#64748b',
                        boxShadow: assignEquipSupplyType === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                    >
                      <ArrowRightLeft size={13} />
                      <span>Tất cả ({depotAllEquipments.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignEquipSupplyType('DURABLE')}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: assignEquipSupplyType === 'DURABLE' ? 700 : 500,
                        borderRadius: 6,
                        border: 'none',
                        background: assignEquipSupplyType === 'DURABLE' ? '#ffffff' : 'transparent',
                        color: assignEquipSupplyType === 'DURABLE' ? '#166534' : '#64748b',
                        boxShadow: assignEquipSupplyType === 'DURABLE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                    >
                      <LifeBuoy size={13} />
                      <span>Thiết bị cứu hộ ({depotDurableEquipments.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignEquipSupplyType('CONSUMABLE')}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: assignEquipSupplyType === 'CONSUMABLE' ? 700 : 500,
                        borderRadius: 6,
                        border: 'none',
                        background: assignEquipSupplyType === 'CONSUMABLE' ? '#ffffff' : 'transparent',
                        color: assignEquipSupplyType === 'CONSUMABLE' ? '#b45309' : '#64748b',
                        boxShadow: assignEquipSupplyType === 'CONSUMABLE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                    >
                      <Package size={13} />
                      <span>Nhu yếu phẩm ({depotConsumableEquipments.length})</span>
                    </button>
                  </div>

                  {/* 3. Danh sách mặt hàng tại Kho Tổng */}
                  <div className="executive-modal-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        Chọn mặt hàng từ Kho Tổng ({activeDepotList.length} mặt hàng sẵn có)
                      </label>
                      {activeDepotList.length > 0 && (
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {allSelected ? 'Bỏ chọn trong mục này' : 'Chọn tất cả trong mục này'}
                        </button>
                      )}
                    </div>

                    {activeDepotList.length === 0 ? (
                      <div
                        style={{
                          padding: '24px 16px',
                          borderRadius: 10,
                          background: '#fefce8',
                          border: '1px solid #fef08a',
                          textAlign: 'center',
                          color: '#854d0e',
                          fontSize: 13,
                        }}
                      >
                        <p style={{ margin: 0, fontWeight: 700 }}>
                          Kho Tổng hiện không còn {assignEquipSupplyType === 'CONSUMABLE' ? 'nhu yếu phẩm' : assignEquipSupplyType === 'DURABLE' ? 'thiết bị cứu hộ' : 'mặt hàng'} nào sẵn sàng bàn giao.
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#a16207' }}>
                          Bạn có thể chuyển phân loại khác ở trên hoặc nhập thêm hàng mới vào kho.
                        </p>
                      </div>
                    ) : (
                      <div
                        style={{
                          maxHeight: 280,
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          padding: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          background: '#f8fafc',
                        }}
                      >
                        {activeDepotList.map((eq) => {
                          const isSelected = Boolean(selectedEquipmentsToAssign[eq._id] && selectedEquipmentsToAssign[eq._id] > 0);
                          const currentQty = selectedEquipmentsToAssign[eq._id] || eq.quantity;
                          const isConsumable = eq.supplyType === 'CONSUMABLE';

                          return (
                            <div
                              key={eq._id}
                              onClick={() => toggleSelectEquipment(eq)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 14px',
                                borderRadius: 8,
                                background: isSelected ? (isConsumable ? '#fffbeb' : '#f0fdf4') : '#ffffff',
                                border: isSelected ? (isConsumable ? '1.5px solid #fde68a' : '1.5px solid #86efac') : '1px solid #e2e8f0',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectEquipment(eq)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: 16, height: 16, accentColor: isConsumable ? '#d97706' : '#16a34a', cursor: 'pointer' }}
                              />
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  background: isSelected ? (isConsumable ? '#fef3c7' : '#dcfce7') : '#eff6ff',
                                  color: isSelected ? (isConsumable ? '#d97706' : '#16a34a') : '#0284c7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {isConsumable ? <Package size={16} /> : <LifeBuoy size={16} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
                                    {eq.name}
                                  </span>
                                  {isConsumable ? (
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        color: '#b45309',
                                        background: '#fef3c7',
                                        border: '1px solid #fde68a',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      Nhu yếu phẩm
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        color: '#15803d',
                                        background: '#ecfdf5',
                                        border: '1px solid #bbf7d0',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                      }}
                                    >
                                      Thiết bị cứu hộ
                                    </span>
                                  )}
                                  {eq.serialNumber && (
                                    <span
                                      style={{
                                        fontFamily: 'monospace',
                                        fontSize: 11.5,
                                        color: '#475569',
                                        background: '#f1f5f9',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {eq.serialNumber}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                  Kho sẵn có: <strong style={{ color: '#0284c7' }}>{eq.quantity} {eq.unit || 'chiếc'}</strong>
                                  {' '}&bull; {getEquipmentCategoryName(eq.category)}
                                </div>
                              </div>

                              {/* Quantity control when checked */}
                              {isSelected && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: '#ffffff',
                                    padding: '2px 4px',
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextVal = Math.max(1, currentQty - 1);
                                      setSelectedEquipmentsToAssign((prev) => ({ ...prev, [eq._id]: nextVal }));
                                    }}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 4,
                                      border: '1px solid #e2e8f0',
                                      background: '#f8fafc',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#475569',
                                    }}
                                    title="Giảm 1"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={eq.quantity}
                                    value={currentQty}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (isNaN(val) || val <= 0) {
                                        setSelectedEquipmentsToAssign((prev) => ({ ...prev, [eq._id]: 1 }));
                                      } else {
                                        setSelectedEquipmentsToAssign((prev) => ({
                                          ...prev,
                                          [eq._id]: Math.min(eq.quantity, val),
                                        }));
                                      }
                                    }}
                                    style={{
                                      width: 44,
                                      height: 24,
                                      textAlign: 'center',
                                      fontWeight: 800,
                                      fontSize: 12.5,
                                      border: 'none',
                                      outline: 'none',
                                      color: '#0f172a',
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextVal = Math.min(eq.quantity, currentQty + 1);
                                      setSelectedEquipmentsToAssign((prev) => ({ ...prev, [eq._id]: nextVal }));
                                    }}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: 4,
                                      border: '1px solid #e2e8f0',
                                      background: '#f8fafc',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#475569',
                                    }}
                                    title="Tăng 1"
                                  >
                                    <Plus size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedEquipmentsToAssign((prev) => ({ ...prev, [eq._id]: eq.quantity }));
                                    }}
                                    style={{
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      color: '#0284c7',
                                      background: '#eff6ff',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: 4,
                                      padding: '2px 5px',
                                      cursor: 'pointer',
                                      marginLeft: 2,
                                    }}
                                    title="Lấy tối đa"
                                  >
                                    Max
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Ghi chú điều chuyển / bàn giao */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, color: '#0f172a' }}>
                      Lý do / Quyết định bàn giao <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder="VD: Cấp bổ sung trang bị ứng phó bão lũ, phục vụ cứu nạn tại chỗ..."
                      value={assignEquipNote}
                      onChange={(e) => setAssignEquipNote(e.target.value)}
                    />
                  </div>
                </div>

                <div
                  className="executive-modal-footer"
                  style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}
                >
                  <button
                    type="button"
                    disabled={isAssigningEquipment}
                    className="coordination-action-btn outline"
                    onClick={() => setIsAssignEquipmentModalOpen(false)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isAssigningEquipment || selectedCount === 0 || !assignEquipTargetTeamId}
                    className="coordination-action-btn primary"
                    style={{
                      background: '#16a34a',
                      borderColor: '#16a34a',
                      cursor:
                        isAssigningEquipment || selectedCount === 0 || !assignEquipTargetTeamId
                          ? 'not-allowed'
                          : 'pointer',
                      opacity:
                        isAssigningEquipment || selectedCount === 0 || !assignEquipTargetTeamId ? 0.6 : 1,
                    }}
                  >
                    <Check size={14} />
                    <span>
                      {isAssigningEquipment
                        ? 'Đang bàn giao...'
                        : `Xác Nhận Bàn Giao (${selectedCount} mặt hàng)`}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ===================================================================
          6. DRAWER CHI TIẾT TRANG THIẾT BỊ & VẬT TƯ (SLIDE-OVER TỪ CẠNH MÀN HÌNH)
          =================================================================== */}
      {selectedEquipment && (() => {
        const eqTeamObj = selectedEquipment.teamId
          ? (typeof selectedEquipment.teamId === 'object'
            ? (selectedEquipment.teamId as any)
            : rescueTeams.find((t) => t._id === selectedEquipment.teamId))
          : null;

        let eqLeaderName = '';
        let eqLeaderPhone = '';
        if (eqTeamObj) {
          if (typeof eqTeamObj.leaderId === 'object' && eqTeamObj.leaderId) {
            eqLeaderName = (eqTeamObj.leaderId as any).fullName || (eqTeamObj.leaderId as any).name || '';
            eqLeaderPhone = (eqTeamObj.leaderId as any).phone || '';
          } else if (Array.isArray(eqTeamObj.members) && eqTeamObj.members.length > 0) {
            const leaderMember = eqTeamObj.members.find((m: any) => m.role === 'LEADER') || eqTeamObj.members[0];
            const rescuerObj = typeof leaderMember?.rescuerId === 'object' ? (leaderMember.rescuerId as any) : null;
            eqLeaderName = rescuerObj?.fullName || rescuerObj?.name || '';
            eqLeaderPhone = rescuerObj?.phone || '';
          }
        }

        const isSafeStock = selectedEquipment.quantity >= (selectedEquipment.minThreshold || 10);

        return (
          <div
            className={`team-drawer-backdrop ${isEquipmentDrawerClosing ? 'closing' : 'open'}`}
            onClick={handleCloseEquipmentDetail}
          >
            <div
              className={`team-drawer-container ${isEquipmentDrawerClosing ? 'closing' : 'open'}`}
              style={{ width: 720, maxWidth: '94vw' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Drawer */}
              <div className="team-drawer-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    className="kpi-icon-squircle blue"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: selectedEquipment.supplyType === 'CONSUMABLE' ? '#fef3c7' : '#dcfce7',
                      color: selectedEquipment.supplyType === 'CONSUMABLE' ? '#d97706' : '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {selectedEquipment.supplyType === 'CONSUMABLE' ? (
                      <Package size={22} />
                    ) : (
                      <LifeBuoy size={22} />
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        {selectedEquipment.name}
                      </h3>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: 12.5,
                          color: '#475569',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '2px 8px',
                          borderRadius: 6,
                        }}
                      >
                        {selectedEquipment.serialNumber || `LÔ-${selectedEquipment._id.slice(-6).toUpperCase()}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      {renderEquipmentStatusBadge(selectedEquipment)}

                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Phân loại: {selectedEquipment.supplyType === 'CONSUMABLE' ? 'Vật tư tiêu hao' : 'Trang thiết bị bền'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="executive-toggle-btn"
                  onClick={handleCloseEquipmentDetail}
                  title="Đóng hồ sơ (ESC)"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body Drawer - Redesigned Equipment (Bố cục phẳng thoáng sạch, loại bỏ card lồng card) */}
              <div className="rd-drawer-content">
                {/* 1. Thanh tóm tắt chỉ số ngang đồng nhất */}
                <div className="rd-metrics-bar">
                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Cơ số tồn kho</span>
                    <span className="rd-metric-val highlight">
                      {selectedEquipment.quantity} {selectedEquipment.unit === 'cai' ? 'cái' : selectedEquipment.unit}
                    </span>
                    <span className="rd-metric-sub">Khả dụng tại kho</span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Phân loại</span>
                    <span className="rd-metric-val" style={{ fontSize: 15 }}>
                      {selectedEquipment.supplyType === 'CONSUMABLE' ? 'Vật tư tiêu hao' : 'Trang bị bền'}
                    </span>
                    <span className="rd-metric-sub">
                      {selectedEquipment.supplyType === 'CONSUMABLE' ? 'Cấp phát dân sinh' : 'Dùng lâu dài'}
                    </span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Tình trạng trực chiến</span>
                    <div style={{ marginTop: 2 }}>
                      {selectedEquipment.supplyType === 'CONSUMABLE' ? (
                        <select
                          value={selectedEquipment.status || 'AVAILABLE'}
                          onChange={(e) => handleQuickUpdateEquipmentStatus(selectedEquipment._id, e.target.value)}
                          style={{
                            padding: '3px 8px',
                            fontSize: 12.5,
                            fontWeight: 700,
                            borderRadius: 6,
                            border:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '1px solid #86efac'
                                : '1px solid #fecaca',
                            background:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '#f0fdf4'
                                : '#fef2f2',
                            color:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '#15803d'
                                : '#dc2626',
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: '100%',
                          }}
                          title="Bấm để đổi nhanh trạng thái nhu yếu phẩm"
                        >
                          <option value="AVAILABLE">🟢 Đạt chuẩn (Khả dụng)</option>
                          <option value="EXPIRED">🔴 Hết hạn sử dụng</option>
                          <option value="DAMAGED">🔴 Hư hại / Hỏng hóc</option>
                        </select>
                      ) : (
                        <select
                          value={selectedEquipment.status || 'AVAILABLE'}
                          onChange={(e) => handleQuickUpdateEquipmentStatus(selectedEquipment._id, e.target.value)}
                          style={{
                            padding: '3px 8px',
                            fontSize: 12.5,
                            fontWeight: 700,
                            borderRadius: 6,
                            border:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '1px solid #86efac'
                                : selectedEquipment.status === 'IN_USE'
                                  ? '1px solid #fde68a'
                                  : '1px solid #fecaca',
                            background:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '#f0fdf4'
                                : selectedEquipment.status === 'IN_USE'
                                  ? '#fffbeb'
                                  : '#fef2f2',
                            color:
                              selectedEquipment.status === 'AVAILABLE'
                                ? '#15803d'
                                : selectedEquipment.status === 'IN_USE'
                                  ? '#b45309'
                                  : '#dc2626',
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: '100%',
                          }}
                          title="Bấm để đổi nhanh tình trạng trực chiến của thiết bị"
                        >
                          <option value="AVAILABLE">🟢 Đạt chuẩn (Sẵn sàng)</option>
                          <option value="IN_USE">🔵 Đang sử dụng</option>
                          <option value="MAINTENANCE">🟡 Bảo dưỡng / Kiểm tra</option>
                          <option value="DAMAGED">🔴 Hỏng hóc</option>
                        </select>
                      )}
                    </div>
                    <span className="rd-metric-sub">Bấm để đổi nhanh</span>
                  </div>

                  <div className="rd-metric-divider" />

                  <div className="rd-metric-cell">
                    <span className="rd-metric-label">Tiếp nhận</span>
                    <span className="rd-metric-val" style={{ fontSize: 14 }}>
                      {selectedEquipment.receivedAt || selectedEquipment.createdAt
                        ? new Date(selectedEquipment.receivedAt || selectedEquipment.createdAt!).toLocaleDateString('vi-VN')
                        : 'Mới'}
                    </span>
                    <span className="rd-metric-sub">Đã kiểm định</span>
                  </div>
                </div>

                {/* Ngưỡng báo động tồn kho (nếu là vật tư tiêu hao) */}
                {selectedEquipment.supplyType === 'CONSUMABLE' && (
                  <div className="rd-alert-bar">
                    <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                        Ngưỡng an toàn dự trữ: ≥ {selectedEquipment.minThreshold || 20} {selectedEquipment.unit}
                      </div>
                      <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                        {selectedEquipment.quantity <= (selectedEquipment.minThreshold || 20)
                          ? '⚠️ Lượng tồn kho đang chạm mức báo động tối thiểu, cần đề xuất bổ sung sớm!'
                          : 'Lượng tồn kho hiện tại đáp ứng tốt yêu cầu dự trữ khẩn cấp cho mùa mưa lũ.'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Thông tin lưu kho & Quản lý (Property Grid) */}
                <div className="rd-section">
                  <div className="rd-section-header">
                    <Package size={15} />
                    <span>Thông Tin Quản Lý &amp; Vị Trí Lưu Kho</span>
                  </div>

                  <div className="rd-property-grid">
                    <div className="rd-property-item">
                      <span className="rd-property-label">Tên trang bị / vật tư</span>
                      <span className="rd-property-val">{selectedEquipment.name}</span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Đơn vị quản lý / Tiếp nhận</span>
                      <span className="rd-property-val" style={{ color: '#0369a1' }}>
                        {eqTeamObj ? eqTeamObj.name : '📦 Kho Tổng Cứu Trợ SOS'}
                      </span>
                      {eqLeaderName ? (
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                          Chỉ huy / Phụ trách: <strong style={{ color: '#1e293b' }}>{eqLeaderName}</strong>
                          {eqLeaderPhone && (
                            <span style={{ marginLeft: 6, color: '#0284c7', fontWeight: 700 }}>({eqLeaderPhone})</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                          Thủ kho: <strong style={{ color: '#1e293b' }}>Ban Điều Hành Cứu Trợ SOS</strong>
                        </span>
                      )}
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Mã Lô / Số Serial</span>
                      <span className="rd-property-val code">
                        {selectedEquipment.serialNumber || `LÔ-${selectedEquipment._id.slice(-6).toUpperCase()}`}
                      </span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Đơn vị tính &amp; Định mức an toàn</span>
                      <span className="rd-property-val" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{selectedEquipment.unit}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: isSafeStock ? '#dcfce7' : '#fef3c7',
                            color: isSafeStock ? '#166534' : '#92400e',
                            border: `1px solid ${isSafeStock ? '#bbf7d0' : '#fde68a'}`,
                          }}
                        >
                          Định mức: ≥ {selectedEquipment.minThreshold || 10} {selectedEquipment.unit}
                        </span>
                      </span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Quy cách danh mục</span>
                      <span className="rd-property-val">
                        {getEquipmentCategoryName(selectedEquipment.category)}
                      </span>
                    </div>

                    <div className="rd-property-item">
                      <span className="rd-property-label">Trạng thái cấp phát</span>
                      <span className="rd-property-val" style={{ color: selectedEquipment.status === 'AVAILABLE' ? '#16a34a' : selectedEquipment.status === 'IN_USE' ? '#d97706' : '#dc2626' }}>
                        {selectedEquipment.status === 'AVAILABLE'
                          ? 'Sẵn sàng điều phối'
                          : selectedEquipment.status === 'IN_USE'
                            ? 'Đang trực chiến tác chiến'
                            : 'Đang bảo dưỡng'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Quy cách kỹ thuật & Hướng dẫn sử dụng & 4. Lịch sử luân chuyển */}
                {(() => {
                  const { specs, logs } = parseEquipmentNote(selectedEquipment.note);
                  return (
                    <>
                      {/* 3. Quy cách kỹ thuật & Hướng dẫn sử dụng */}
                      <div className="rd-section">
                        <div className="rd-section-header">
                          <Info size={15} />
                          <span>
                            {selectedEquipment.supplyType === 'CONSUMABLE'
                              ? 'Hướng Dẫn Bảo Quản & Điều Kiện Lưu Kho'
                              : 'Thông Số Kỹ Thuật & Hướng Dẫn Sử Dụng'}
                          </span>
                        </div>

                        <div className="rd-callout">
                          {specs}
                        </div>
                      </div >

                      {/* 4. Nhật Ký Luân Chuyển & Biến Động Cơ Số (Audit Trail) */}
                      {
                        logs.length > 0 && (
                          <div className="rd-section">
                            <div className="rd-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <History size={15} color="#0284c7" />
                                <span style={{ color: '#0369a1' }}>Lịch Sử Luân Chuyển &amp; Biến Động Cơ Số</span>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '1px 8px', borderRadius: 10 }}>
                                {logs.length} biến động
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                              {logs.map((logItem, idx) => {
                                const isRestock = logItem.includes('Tiếp nhận tài trợ') || logItem.includes('Cấp bổ sung');
                                const isReturn = logItem.includes('Rút hồi') || logItem.includes('Hoàn trả');
                                const dotClr = isRestock ? '#16a34a' : isReturn ? '#d97706' : '#0284c7';

                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      padding: '6px 4px',
                                      fontSize: 12.5,
                                      color: '#334155',
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 10,
                                      lineHeight: 1.5,
                                      borderBottom: idx < logs.length - 1 ? '1px solid #f1f5f9' : 'none',
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        background: dotClr,
                                        flexShrink: 0,
                                        marginTop: 6,
                                      }}
                                    />
                                    <span style={{ fontWeight: 500 }}>{logItem}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      }
                    </>
                  );
                })()}
              </div>

              {/* Footer Drawer */}
              <div className="team-drawer-footer" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Nhập thêm vào kho */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => handleOpenRestock(selectedEquipment)}
                    style={{ color: '#16a34a', borderColor: '#bbf7d0' }}
                    title="Nhập bổ sung thêm số lượng vào kho"
                  >
                    <PlusCircle size={14} />
                    <span>Nhập Thêm</span>
                  </button>

                  {/* Xuất cấp (CHỈ DÀNH CHO VẬT TƯ TIÊU HAO CỨU TRỢ DÂN SINH) */}
                  {selectedEquipment.supplyType === 'CONSUMABLE' && (
                    <button
                      type="button"
                      className="coordination-action-btn outline"
                      onClick={() => {
                        const currentEq = selectedEquipment;
                        setConsumeTarget(currentEq);
                        setConsumeQuantity(1);
                        setConsumeDestination('');
                        setConsumeNote('');
                      }}
                      style={{ color: '#0284c7', borderColor: '#bae6fd' }}
                      title="Xuất cấp vật tư cứu trợ cho nhân dân hoặc khu vực ngập lụt"
                    >
                      <Send size={14} />
                      <span>Xuất Cấp Cứu Trợ</span>
                    </button>
                  )}

                  {/* Bàn giao / Điều chuyển (chỉ dành cho trang thiết bị bền tác chiến) */}
                  {selectedEquipment.supplyType !== 'CONSUMABLE' && (
                    <button
                      type="button"
                      className="coordination-action-btn outline"
                      onClick={() => {
                        const currentEq = selectedEquipment;
                        setTransferEquipmentTarget(currentEq);
                        setTransferEquipmentTeamId('');
                      }}
                      style={{ color: '#0284c7', borderColor: '#bae6fd' }}
                      title={
                        selectedEquipment.teamId
                          ? 'Điều chuyển thiết bị sang đội cứu hộ khác'
                          : 'Bàn giao / Biên chế thiết bị cho Đội cứu hộ tiếp nhận'
                      }
                    >
                      <ArrowRightLeft size={14} />
                      <span>{selectedEquipment.teamId ? 'Điều Chuyển Đội' : 'Bàn Giao Cho Đội'}</span>
                    </button>
                  )}

                  {/* Rút về kho tổng / Hoàn trả khi hết hạn chiến dịch (nếu đã phân đội) */}
                  {selectedEquipment.teamId && (
                    <button
                      type="button"
                      className="coordination-action-btn outline"
                      onClick={() => {
                        const tName = eqTeamObj?.name || 'Đội cứu hộ';
                        setDeleteConfirmTarget({
                          type: 'UNASSIGN_EQUIPMENT',
                          id: selectedEquipment._id,
                          name: selectedEquipment.name,
                          teamName: tName,
                        });
                      }}
                      style={{ color: '#d97706', borderColor: '#fde68a' }}
                      title="Hoàn trả thiết bị về Kho Tổng khi kết thúc chiến dịch hoặc đến hạn bảo trì"
                    >
                      <LogOut size={14} />
                      <span>Rút Về Kho Tổng</span>
                    </button>
                  )}

                  {/* Chỉnh sửa */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => handleOpenEditEquipment(selectedEquipment)}
                    title="Cập nhật thông tin và trạng thái"
                  >
                    <Pencil size={14} />
                    <span>Chỉnh Sửa</span>
                  </button>

                  {/* Thanh lý / Xóa */}
                  <button
                    type="button"
                    className="coordination-action-btn outline"
                    onClick={() => {
                      setDeleteConfirmTarget({
                        type: 'EQUIPMENT',
                        id: selectedEquipment._id,
                        name: selectedEquipment.name,
                      });
                    }}
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                    title="Thanh lý hoặc xóa vật tư khỏi danh mục"
                  >
                    <Trash2 size={14} />
                    <span>Thanh Lý</span>
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  <button
                    type="button"
                    className="coordination-action-btn primary"
                    onClick={handleCloseEquipmentDetail}
                    style={{ minWidth: 120, justifyContent: 'center' }}
                  >
                    Đóng hồ sơ
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 7: ĐIỀU CHUYỂN / BÀN GIAO KHÍ TÀI (HỖ TRỢ CHỌN SỐ LƯỢNG) */}
      {transferEquipmentTarget && (() => {
        const currentTId = typeof transferEquipmentTarget.teamId === 'object' && transferEquipmentTarget.teamId
          ? (transferEquipmentTarget.teamId as any)._id
          : transferEquipmentTarget.teamId;
        const currentOwnerName = typeof transferEquipmentTarget.teamId === 'object' && transferEquipmentTarget.teamId
          ? (transferEquipmentTarget.teamId as any).name
          : rescueTeams.find((t) => t._id === transferEquipmentTarget.teamId)?.name || '📦 Kho Tổng / Dự Trữ';
        const isFromDepot = !currentTId;
        const maxQty = transferEquipmentTarget.quantity;
        const selectedQty = Math.min(maxQty, Math.max(1, Number(transferEquipmentQuantity) || 1));
        const remainingQty = maxQty - selectedQty;

        return (
          <div className="executive-modal-backdrop" onClick={() => !isTransferringEquipment && setTransferEquipmentTarget(null)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #e0f2fe', background: '#f0f9ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <ArrowRightLeft size={19} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Điều Chuyển / Bàn Giao Trang Thiết Bị
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Trang thiết bị: <strong>{transferEquipmentTarget.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isTransferringEquipment && setTransferEquipmentTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleExecuteTransferEquipment} noValidate>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Tóm tắt nguồn điều chuyển */}
                  <div
                    style={{
                      fontSize: 13,
                      color: '#475569',
                      background: '#f8fafc',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>
                      Đơn vị hiện tại: <strong style={{ color: '#0f172a' }}>{currentOwnerName}</strong>
                    </span>
                    <span>
                      Khả dụng: <strong style={{ color: '#0284c7', fontSize: 14 }}>{maxQty} {transferEquipmentTarget.unit}</strong>
                    </span>
                  </div>

                  {/* 1. Chọn đơn vị tiếp nhận */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13, color: transferEquipmentErrors.team ? '#ef4444' : '#0f172a' }}>
                      Đơn vị tiếp nhận (*)
                    </label>
                    <select
                      className="executive-modal-select"
                      value={transferEquipmentTeamId}
                      onChange={(e) => {
                        setTransferEquipmentTeamId(e.target.value);
                        if (transferEquipmentErrors.team) {
                          setTransferEquipmentErrors((prev) => ({ ...prev, team: undefined }));
                        }
                      }}
                      style={{
                        border: transferEquipmentErrors.team ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                        backgroundColor: transferEquipmentErrors.team ? '#fef2f2' : '#ffffff',
                        boxShadow: transferEquipmentErrors.team ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <option value="">-- Chọn đơn vị tiếp nhận --</option>
                      {!isFromDepot && (
                        <option value="NONE">📦 Kho tổng dự trữ (Thu hồi về kho)</option>
                      )}
                      {rescueTeams
                        .filter((team) => String(team._id) !== String(currentTId))
                        .map((team) => (
                          <option key={team._id} value={team._id}>
                            🏢 {team.name} ({typeof team.areaId === 'object' && team.areaId ? (team.areaId as any).name : 'Toàn Xã'})
                          </option>
                        ))}
                    </select>
                    {transferEquipmentErrors.team && (
                      <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangle size={14} />
                        <span>{transferEquipmentErrors.team}</span>
                      </div>
                    )}
                  </div>

                  {/* 2. Số lượng điều chuyển */}
                  <div className="executive-modal-field" style={{ gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13, margin: 0, color: transferEquipmentErrors.quantity ? '#ef4444' : '#0f172a' }}>
                        Số lượng điều chuyển (*)
                      </label>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Tối đa: <strong style={{ color: '#0284c7' }}>{maxQty}</strong> {transferEquipmentTarget.unit}
                      </span>
                    </div>

                    {/* Hộp nhập số lượng tích hợp liền mạch (Unified Input Bar) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: transferEquipmentErrors.quantity ? '1.5px solid #ef4444' : '1.5px solid #cbd5e1',
                        borderRadius: 10,
                        background: transferEquipmentErrors.quantity ? '#fef2f2' : '#ffffff',
                        boxShadow: transferEquipmentErrors.quantity ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : undefined,
                        padding: '4px 8px 4px 14px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={transferEquipmentQuantity}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          if (rawVal === '') {
                            setTransferEquipmentQuantity('' as any);
                          } else {
                            const val = parseInt(rawVal, 10);
                            setTransferEquipmentQuantity(isNaN(val) ? ('' as any) : val);
                          }
                          if (transferEquipmentErrors.quantity) {
                            setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                          }
                        }}
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          fontSize: 16,
                          fontWeight: 700,
                          color: '#0f172a',
                          background: 'transparent',
                          padding: '6px 0',
                          minWidth: 60,
                        }}
                      />

                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginRight: 12 }}>
                        {transferEquipmentTarget.unit}
                      </span>

                      {/* Nút trừ / cộng gọn trong hộp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          type="button"
                          disabled={selectedQty <= 1}
                          onClick={() => {
                            setTransferEquipmentQuantity(Math.max(1, selectedQty - 1));
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: selectedQty <= 1 ? '#f8fafc' : '#f1f5f9',
                            color: selectedQty <= 1 ? '#cbd5e1' : '#334155',
                            cursor: selectedQty <= 1 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Giảm 1"
                        >
                          <Minus size={13} />
                        </button>

                        <button
                          type="button"
                          disabled={selectedQty >= maxQty}
                          onClick={() => {
                            setTransferEquipmentQuantity(Math.min(maxQty, selectedQty + 1));
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: selectedQty >= maxQty ? '#f8fafc' : '#f1f5f9',
                            color: selectedQty >= maxQty ? '#cbd5e1' : '#334155',
                            cursor: selectedQty >= maxQty ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Tăng 1"
                        >
                          <Plus size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTransferEquipmentQuantity(maxQty);
                            if (transferEquipmentErrors.quantity) {
                              setTransferEquipmentErrors((prev) => ({ ...prev, quantity: undefined }));
                            }
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            border: selectedQty === maxQty ? '1px solid #0284c7' : '1px solid #bae6fd',
                            background: selectedQty === maxQty ? '#0284c7' : '#e0f2fe',
                            color: selectedQty === maxQty ? '#ffffff' : '#0369a1',
                            cursor: 'pointer',
                            marginLeft: 4,
                            transition: 'all 0.15s ease',
                          }}
                          title="Chọn toàn bộ số lượng"
                        >
                          Tất cả
                        </button>
                      </div>
                    </div>

                    {transferEquipmentErrors.quantity && (
                      <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangle size={14} />
                        <span>{transferEquipmentErrors.quantity}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: remainingQty === 0 ? '#b45309' : '#15803d', fontWeight: 600 }}>
                        📦 Còn lại tại nguồn: <strong>{remainingQty} {transferEquipmentTarget.unit}</strong>
                      </span>
                      {maxQty > 1 && (
                        <span style={{ color: '#64748b' }}>
                          Bàn giao: <strong>{selectedQty}/{maxQty}</strong> {transferEquipmentTarget.unit}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. Lý do điều chuyển */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Lý do điều chuyển <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder="VD: Cấp phát tăng cường ứng phó bão lũ..."
                      value={transferEquipmentNote}
                      onChange={(e) => setTransferEquipmentNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isTransferringEquipment}
                    className="coordination-action-btn outline"
                    onClick={() => setTransferEquipmentTarget(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isTransferringEquipment}
                    className="coordination-action-btn primary"
                    style={{ background: '#0284c7', borderColor: '#0284c7', cursor: isTransferringEquipment ? 'not-allowed' : 'pointer' }}
                  >
                    <Check size={14} />
                    <span>{isTransferringEquipment ? 'Đang bàn giao...' : `Xác Nhận Bàn Giao (${selectedQty} ${transferEquipmentTarget.unit})`}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL 8: CHỈNH SỬA KHÍ TÀI */}
      {editEquipmentTarget && (
        <div className="executive-modal-backdrop" onClick={() => !isUpdatingEquipment && setEditEquipmentTarget(null)}>
          <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="executive-modal-header">
              <div>
                <h3 className="executive-modal-title">Cập Nhật Thông Tin Trang Thiết Bị</h3>
                <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                  {editEquipmentTarget.name} ({editEquipmentTarget.serialNumber || 'Không có sê-ri'})
                </p>
              </div>
              <button
                type="button"
                className="executive-modal-close"
                onClick={() => !isUpdatingEquipment && setEditEquipmentTarget(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditEquipment}>
              <div className="executive-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Số lượng ({editEquipmentTarget.unit}) (*)</label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      required
                      className="executive-modal-input"
                      value={editEqQuantity}
                      onChange={(e) => setEditEqQuantity(Number(e.target.value))}
                    />
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Ngày nhập kho / Tiếp nhận</label>
                    <input
                      type="date"
                      className="executive-modal-input"
                      value={editEqReceivedAt}
                      onChange={(e) => setEditEqReceivedAt(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Mã lô hàng / Số sê-ri</label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      value={editEqSerialNumber}
                      onChange={(e) => setEditEqSerialNumber(e.target.value)}
                      style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                      placeholder="VD: LÔ-AP-6772..."
                    />
                  </div>

                  <div className="executive-modal-field">
                    <label className="executive-modal-label">Trạng thái kỹ thuật</label>
                    <select
                      className="executive-modal-select"
                      value={editEqStatus}
                      onChange={(e) => setEditEqStatus(e.target.value)}
                    >
                      <option value="AVAILABLE">🟢 Sẵn sàng trong kho</option>
                      <option value="IN_USE">🔵 Đang sử dụng</option>
                      <option value="BORROWED">📤 Đã xuất cấp</option>
                      <option value="MAINTENANCE">🟡 Đang bảo dưỡng</option>
                      <option value="DAMAGED">🟣 Hư hỏng kỹ thuật</option>
                      <option value="LOST">🔴 Thất lạc / Báo mất</option>
                      <option value="EXPIRED">⚪ Hết hạn sử dụng</option>
                    </select>
                  </div>
                </div>

                <div className="executive-modal-field">
                  <label className="executive-modal-label">Ghi chú thông số &amp; tình trạng chi tiết</label>
                  <textarea
                    rows={3}
                    className="executive-modal-textarea"
                    value={editEqNote}
                    onChange={(e) => setEditEqNote(e.target.value)}
                    placeholder="Nhập thông số kỹ thuật, hướng dẫn bảo quản..."
                  />
                </div>
              </div>

              <div className="executive-modal-footer">
                <button
                  type="button"
                  disabled={isUpdatingEquipment}
                  className="coordination-action-btn outline"
                  onClick={() => setEditEquipmentTarget(null)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingEquipment}
                  className="coordination-action-btn primary"
                >
                  <Check size={14} />
                  <span>{isUpdatingEquipment ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8B: NHẬP THÊM SỐ LƯỢNG VÀO KHO (RESTOCK MODAL) */}
      {restockTarget && (() => {
        const isBelongingToTeam = Boolean(
          restockTarget.teamId &&
          (typeof restockTarget.teamId === 'string'
            ? restockTarget.teamId !== 'NONE' && restockTarget.teamId !== 'null'
            : (restockTarget.teamId as any)._id)
        );

        const depotItem = isBelongingToTeam
          ? equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              eq.name.trim().toLowerCase() === restockTarget.name.trim().toLowerCase()
          ) ||
          equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              (eq.name.toLowerCase().includes(restockTarget.name.toLowerCase()) ||
                restockTarget.name.toLowerCase().includes(eq.name.toLowerCase()))
          ) ||
          equipments.find(
            (eq) =>
              (!eq.teamId || eq.teamId === 'NONE' || eq.teamId === 'null') &&
              eq.category === restockTarget.category
          )
          : null;

        const depotAvailableQty = depotItem ? Math.max(0, Number(depotItem.quantity) || 0) : 0;
        const isDepotEmpty = isBelongingToTeam && depotAvailableQty <= 0;
        const currentQty = Math.max(1, Number(restockQuantity) || 1);
        const newTotalQty = restockTarget.quantity + (restockSourceType === 'DEPOT' && isDepotEmpty ? 0 : currentQty);

        return (
          <div className="executive-modal-backdrop" onClick={() => !isRestocking && setRestockTarget(null)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, borderRadius: 16 }}>
              <div
                className="executive-modal-header"
                style={{
                  borderBottom: `1px solid ${restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fecaca' : '#bae6fd') : '#dcfce7'}`,
                  background: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fff1f2' : '#f0f9ff') : '#f0fdf4',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fee2e2' : '#e0f2fe') : '#dcfce7',
                      border: `1px solid ${restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fecaca' : '#bae6fd') : '#bbf7d0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#e11d48' : '#0284c7') : '#16a34a',
                      flexShrink: 0,
                    }}
                  >
                    <PlusCircle size={20} />
                  </div>
                  <div>
                    <h3
                      className="executive-modal-title"
                      style={{ color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#9f1239' : '#0369a1') : '#166534', fontSize: 16 }}
                    >
                      {restockSourceType === 'DEPOT'
                        ? 'Cấp Bổ Sung Từ Kho Tổng SOS'
                        : 'Nhập Bổ Sung / Tiếp Nhận Tài Trợ'}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#be123c' : '#0284c7') : '#15803d',
                      }}
                    >
                      {restockTarget.name} ({restockTarget.serialNumber || 'Khí tài SOS'})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isRestocking && setRestockTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleExecuteRestock}>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Thông tin tồn kho hiện tại */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Tồn kho hiện tại của Đội</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                        {restockTarget.quantity} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{restockTarget.unit}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Đơn vị quản lý</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0284c7', marginTop: 2 }}>
                        {isBelongingToTeam
                          ? (typeof restockTarget.teamId === 'object' && restockTarget.teamId
                            ? (restockTarget.teamId as any).name
                            : rescueTeams.find((t) => t._id === restockTarget.teamId)?.name || 'Đội cứu hộ')
                          : '📦 Kho Tổng Cứu Trợ SOS'}
                      </div>
                    </div>
                  </div>

                  {/* 1. Ô CHỌN NGUỒN NHẬP (Tiếp nhận tài trợ trực tiếp / Lấy từ Kho Tổng) */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                      Nguồn gốc nhập bổ sung (*)
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                      {/* Lựa chọn 1: Tiếp nhận tài trợ trực tiếp */}
                      <div
                        onClick={() => setRestockSourceType('DONATION')}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: restockSourceType === 'DONATION' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                          background: restockSourceType === 'DONATION' ? '#f0fdf4' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="radio"
                            name="restockSourceType"
                            checked={restockSourceType === 'DONATION'}
                            onChange={() => setRestockSourceType('DONATION')}
                            style={{ accentColor: '#16a34a', cursor: 'pointer' }}
                          />
                          <strong style={{ fontSize: 13, color: restockSourceType === 'DONATION' ? '#166534' : '#0f172a' }}>
                            Tiếp nhận tài trợ trực tiếp
                          </strong>
                        </div>
                        <p style={{ margin: '0 0 0 24px', fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>
                          Nhận tài trợ / mua sắm tại chỗ. Cộng thẳng vào kho mà không trừ Kho Tổng.
                        </p>
                      </div>

                      {/* Lựa chọn 2: Lấy từ Kho Tổng Cứu Trợ SOS */}
                      <div
                        onClick={() => {
                          if (isBelongingToTeam) {
                            setRestockSourceType('DEPOT');
                            if (depotAvailableQty > 0 && restockQuantity > depotAvailableQty) {
                              setRestockQuantity(depotAvailableQty);
                            }
                          }
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border:
                            restockSourceType === 'DEPOT'
                              ? isDepotEmpty
                                ? '2px solid #ef4444'
                                : '2px solid #0284c7'
                              : '1px solid #cbd5e1',
                          background:
                            !isBelongingToTeam
                              ? '#f8fafc'
                              : restockSourceType === 'DEPOT'
                                ? isDepotEmpty
                                  ? '#fff1f2'
                                  : '#f0f9ff'
                                : '#ffffff',
                          cursor: !isBelongingToTeam ? 'not-allowed' : 'pointer',
                          opacity: !isBelongingToTeam ? 0.6 : 1,
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="radio"
                              name="restockSourceType"
                              disabled={!isBelongingToTeam}
                              checked={restockSourceType === 'DEPOT'}
                              onChange={() => {
                                setRestockSourceType('DEPOT');
                                if (depotAvailableQty > 0 && restockQuantity > depotAvailableQty) {
                                  setRestockQuantity(depotAvailableQty);
                                }
                              }}
                              style={{ accentColor: isDepotEmpty ? '#ef4444' : '#0284c7', cursor: !isBelongingToTeam ? 'not-allowed' : 'pointer' }}
                            />
                            <strong style={{ fontSize: 13, color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#991b1b' : '#0369a1') : '#0f172a' }}>
                              Lấy từ Kho Tổng SOS
                            </strong>
                          </div>
                          {isBelongingToTeam && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 10,
                                background: depotAvailableQty > 0 ? '#dcfce7' : '#fee2e2',
                                color: depotAvailableQty > 0 ? '#15803d' : '#b91c1c',
                                border: `1px solid ${depotAvailableQty > 0 ? '#bbf7d0' : '#fecaca'}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                flexShrink: 0,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: depotAvailableQty > 0 ? '#16a34a' : '#dc2626' }} />
                              {depotAvailableQty > 0 ? `Còn ${depotAvailableQty} ${restockTarget.unit}` : 'Hết hàng (0)'}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '0 0 0 24px', fontSize: 11.5, color: isDepotEmpty ? '#b91c1c' : '#64748b', lineHeight: 1.4 }}>
                          {!isBelongingToTeam
                            ? 'Mặt hàng này hiện đã nằm ở Kho Tổng.'
                            : depotAvailableQty > 0
                              ? `Cơ số trung tâm sẵn có: ${depotAvailableQty} ${restockTarget.unit}. Tự động trừ Kho Tổng và điều chuyển vào Đội.`
                              : `Kho Tổng hiện có: 0 ${restockTarget.unit} (Không còn cơ số dự trữ để cấp).`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CẢNH BÁO NẾU KHO TỔNG HẾT HÀNG KHI CHỌN NGUỒN KHO TỔNG */}
                  {restockSourceType === 'DEPOT' && isDepotEmpty && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: '#fff1f2',
                        border: '1px solid #fecdd3',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <AlertTriangle size={18} color="#e11d48" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#9f1239' }}>
                          Kho Tổng hiện có 0 {restockTarget.unit} (Hết hàng trong cơ sở dữ liệu)
                        </div>
                        <div style={{ fontSize: 12, color: '#be123c', marginTop: 3, lineHeight: 1.4 }}>
                          Hệ thống đã kiểm tra database: Kho Tổng SOS chưa có bản ghi dự trữ hoặc đã cấp phát hết mặt hàng này. Vui lòng chuyển sang <strong>"Tiếp nhận tài trợ trực tiếp"</strong> để tiếp nhận vào Đội, hoặc thực hiện nhập bổ sung vào Kho Tổng trước.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Số lượng nhập thêm */}
                  <div className="executive-modal-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                        Số lượng nhập thêm ({restockTarget.unit}) <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      {restockSourceType === 'DEPOT' && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: depotAvailableQty > 0 ? '#0284c7' : '#dc2626',
                          }}
                        >
                          {depotAvailableQty > 0 ? (
                            <>Tối đa có thể cấp: <strong>{depotAvailableQty} {restockTarget.unit}</strong></>
                          ) : (
                            <>Tồn kho Kho Tổng: <strong>0 {restockTarget.unit}</strong></>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        disabled={isDepotEmpty && restockSourceType === 'DEPOT'}
                        onClick={() => setRestockQuantity((prev) => Math.max(1, prev - 1))}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: isDepotEmpty && restockSourceType === 'DEPOT' ? '#f1f5f9' : '#fff',
                          cursor: isDepotEmpty && restockSourceType === 'DEPOT' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#475569',
                        }}
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={restockSourceType === 'DEPOT' && depotAvailableQty > 0 ? depotAvailableQty : undefined}
                        disabled={isDepotEmpty && restockSourceType === 'DEPOT'}
                        className="executive-modal-input"
                        style={{
                          textAlign: 'center',
                          fontSize: 16,
                          fontWeight: 800,
                          flex: 1,
                          background: isDepotEmpty && restockSourceType === 'DEPOT' ? '#f1f5f9' : '#fff',
                          color: isDepotEmpty && restockSourceType === 'DEPOT' ? '#94a3b8' : '#0f172a',
                        }}
                        value={isDepotEmpty && restockSourceType === 'DEPOT' ? 0 : restockQuantity}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          if (restockSourceType === 'DEPOT' && depotAvailableQty > 0) {
                            setRestockQuantity(Math.min(depotAvailableQty, val));
                          } else {
                            setRestockQuantity(val);
                          }
                        }}
                        required
                      />
                      <button
                        type="button"
                        disabled={isDepotEmpty && restockSourceType === 'DEPOT'}
                        onClick={() => {
                          if (restockSourceType === 'DEPOT' && depotAvailableQty > 0) {
                            setRestockQuantity((prev) => Math.min(depotAvailableQty, prev + 1));
                          } else {
                            setRestockQuantity((prev) => prev + 1);
                          }
                        }}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: isDepotEmpty && restockSourceType === 'DEPOT' ? '#f1f5f9' : '#fff',
                          cursor: isDepotEmpty && restockSourceType === 'DEPOT' ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#475569',
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {/* Quick add chips */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[5, 10, 20, 50, 100].map((amt) => {
                        const isOver = Boolean(
                          restockSourceType === 'DEPOT' &&
                          (isDepotEmpty || (depotAvailableQty > 0 && amt > depotAvailableQty))
                        );
                        return (
                          <button
                            key={amt}
                            type="button"
                            disabled={isOver}
                            onClick={() => {
                              if (restockSourceType === 'DEPOT' && depotAvailableQty > 0) {
                                setRestockQuantity((prev) => Math.min(depotAvailableQty, prev + amt));
                              } else {
                                setRestockQuantity((prev) => prev + amt);
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '4px 0',
                              fontSize: 12,
                              fontWeight: 700,
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                              background: isOver ? '#f1f5f9' : '#f8fafc',
                              color: isOver ? '#cbd5e1' : '#475569',
                              cursor: isOver ? 'not-allowed' : 'pointer',
                            }}
                          >
                            +{amt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Computed Preview */}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fff1f2' : '#f0f9ff') : '#f0fdf4',
                      border: `1px solid ${restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#fecdd3' : '#bae6fd') : '#bbf7d0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#be123c' : '#0369a1') : '#166534',
                    }}
                  >
                    <span>
                      {restockSourceType === 'DEPOT'
                        ? isDepotEmpty
                          ? 'Kho Tổng không có sẵn cơ số (Tồn kho Đội giữ nguyên):'
                          : 'Tổng tồn kho của Đội sau khi trích cấp:'
                        : 'Tổng tồn kho sau khi tiếp nhận tài trợ:'}
                    </span>
                    <strong
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: restockSourceType === 'DEPOT' ? (isDepotEmpty ? '#e11d48' : '#0284c7') : '#15803d',
                      }}
                    >
                      {newTotalQty} {restockTarget.unit}
                    </strong>
                  </div>

                  {/* 4. Nguồn tiếp nhận / Ghi chú */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label">
                      {restockSourceType === 'DEPOT'
                        ? 'Ghi chú / Quyết định điều động chi viện (Tùy chọn)'
                        : 'Nguồn tiếp nhận tài trợ / Đơn vị trao tặng (Tùy chọn)'}
                    </label>
                    <input
                      type="text"
                      className="executive-modal-input"
                      placeholder={
                        restockSourceType === 'DEPOT'
                          ? 'Ví dụ: Theo Quyết định số 05/BCH PCTT mùa lũ, Cấp phát khẩn cấp...'
                          : 'Ví dụ: Hội Chữ thập đỏ tài trợ, Doanh nghiệp X trao tặng...'
                      }
                      value={restockSource}
                      onChange={(e) => setRestockSource(e.target.value)}
                    />
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isRestocking}
                    className="coordination-action-btn outline"
                    onClick={() => setRestockTarget(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isRestocking || Boolean(restockSourceType === 'DEPOT' && isDepotEmpty)}
                    className="coordination-action-btn primary"
                    style={{
                      background:
                        restockSourceType === 'DEPOT'
                          ? isDepotEmpty
                            ? '#94a3b8'
                            : '#0284c7'
                          : '#16a34a',
                      borderColor:
                        restockSourceType === 'DEPOT'
                          ? isDepotEmpty
                            ? '#94a3b8'
                            : '#0284c7'
                          : '#16a34a',
                      cursor: Boolean(restockSourceType === 'DEPOT' && isDepotEmpty) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <PlusCircle size={14} />
                    <span>
                      {isRestocking
                        ? 'Đang cập nhật...'
                        : restockSourceType === 'DEPOT'
                          ? isDepotEmpty
                            ? 'Kho Tổng Hết Hàng (Không thể cấp)'
                            : `Xác Nhận Cấp ${restockQuantity} ${restockTarget.unit} Từ Kho Tổng`
                          : 'Xác Nhận Tiếp Nhận Tài Trợ'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL 9: XUẤT CẤP VẬT TƯ CỨU TRỢ DÂN SINH */}
      {consumeTarget && (() => {
        const maxQty = consumeTarget.quantity;
        const currentQty = Math.min(maxQty, Math.max(1, Number(consumeQuantity) || 1));
        const remainingQty = maxQty - currentQty;
        const ownerName = typeof consumeTarget.teamId === 'object' && consumeTarget.teamId
          ? (consumeTarget.teamId as any).name
          : rescueTeams.find((t) => t._id === consumeTarget.teamId)?.name || '📦 Kho Tổng Cứu Trợ SOS';

        return (
          <div className="executive-modal-backdrop" onClick={() => !isConsuming && setConsumeTarget(null)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #bae6fd', background: '#f0f9ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <Send size={18} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Xuất Cấp Cứu Trợ Dân Sinh Khẩn Cấp
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Xuất kho trực tiếp cho người dân ngập lụt, cô lập hoặc điểm tập kết cứu nạn
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isConsuming && setConsumeTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmConsume}>
                <div className="executive-modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Tóm tắt mặt hàng đang xuất */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                        {consumeTarget.name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                        Lô hàng: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{consumeTarget.serialNumber || 'Không có mã'}</span> • Kho: <strong>{ownerName}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                        Tồn kho khả dụng
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#0284c7' }}>
                        {maxQty} <span style={{ fontSize: 13, fontWeight: 600 }}>{consumeTarget.unit}</span>
                      </div>
                    </div>
                  </div>

                  {/* 1. Chọn số lượng xuất cấp */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Số lượng xuất cấp ({consumeTarget.unit}) (*)
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: 10,
                        padding: '4px 10px',
                        background: '#ffffff',
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={currentQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setConsumeQuantity(isNaN(val) ? 1 : Math.min(maxQty, Math.max(1, val)));
                        }}
                        style={{
                          border: 'none',
                          outline: 'none',
                          flex: 1,
                          fontSize: 16,
                          fontWeight: 800,
                          color: '#0f172a',
                          background: 'transparent',
                          padding: '6px 0',
                          minWidth: 60,
                        }}
                      />

                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginRight: 12 }}>
                        {consumeTarget.unit}
                      </span>

                      {/* Nút cộng trừ & nút tắt nhanh */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button
                          type="button"
                          disabled={currentQty <= 1}
                          onClick={() => setConsumeQuantity(Math.max(1, currentQty - 1))}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: currentQty <= 1 ? '#f8fafc' : '#f1f5f9',
                            color: currentQty <= 1 ? '#cbd5e1' : '#334155',
                            cursor: currentQty <= 1 ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Giảm 1"
                        >
                          <Minus size={13} />
                        </button>

                        <button
                          type="button"
                          disabled={currentQty >= maxQty}
                          onClick={() => setConsumeQuantity(Math.min(maxQty, currentQty + 1))}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            border: '1px solid #e2e8f0',
                            background: currentQty >= maxQty ? '#f8fafc' : '#f1f5f9',
                            color: currentQty >= maxQty ? '#cbd5e1' : '#334155',
                            cursor: currentQty >= maxQty ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Tăng 1"
                        >
                          <Plus size={13} />
                        </button>

                        {/* Presets */}
                        {maxQty >= 10 && (
                          <button
                            type="button"
                            onClick={() => setConsumeQuantity(Math.min(maxQty, 10))}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: currentQty === 10 ? '1px solid #0284c7' : '1px solid #e2e8f0',
                              background: currentQty === 10 ? '#0284c7' : '#f1f5f9',
                              color: currentQty === 10 ? '#ffffff' : '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            10
                          </button>
                        )}
                        {maxQty >= 50 && (
                          <button
                            type="button"
                            onClick={() => setConsumeQuantity(Math.min(maxQty, 50))}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: currentQty === 50 ? '1px solid #0284c7' : '1px solid #e2e8f0',
                              background: currentQty === 50 ? '#0284c7' : '#f1f5f9',
                              color: currentQty === 50 ? '#ffffff' : '#334155',
                              cursor: 'pointer',
                            }}
                          >
                            50
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConsumeQuantity(maxQty)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            border: currentQty === maxQty ? '1px solid #0284c7' : '1px solid #bae6fd',
                            background: currentQty === maxQty ? '#0284c7' : '#f0f9ff',
                            color: currentQty === maxQty ? '#ffffff' : '#0369a1',
                            cursor: 'pointer',
                            marginLeft: 2,
                            transition: 'all 0.15s ease',
                          }}
                          title="Xuất toàn bộ cơ số còn lại"
                        >
                          Tất cả
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: remainingQty === 0 ? '#dc2626' : remainingQty <= (consumeTarget.minThreshold || 20) ? '#d97706' : '#15803d', fontWeight: 600 }}>
                        📦 Còn lại trong kho: <strong>{remainingQty} {consumeTarget.unit}</strong> {remainingQty === 0 ? '(Sẽ hết kho)' : remainingQty <= (consumeTarget.minThreshold || 20) ? '⚠️ (Dưới ngưỡng tồn)' : ''}
                      </span>
                      <span style={{ color: '#64748b' }}>
                        Tỷ lệ xuất: <strong>{Math.round((currentQty / maxQty) * 100)}%</strong>
                      </span>
                    </div>
                  </div>

                  {/* 2. Nơi tiếp nhận cứu trợ */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Điểm tiếp nhận cứu trợ / Khu vực ngập lụt (*)
                    </label>
                    <input
                      type="text"
                      required
                      className="executive-modal-input"
                      placeholder="VD: Thôn An Trạch (Xã Hòa Tiến), Điểm sơ tán Trường THCS Nguyễn Du, Khu vực Cẩm Lệ..."
                      value={consumeDestination}
                      onChange={(e) => setConsumeDestination(e.target.value)}
                    />
                  </div>

                  {/* 3. Ghi chú điều phối / Biên bản bàn giao */}
                  <div className="executive-modal-field">
                    <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 13 }}>
                      Ghi chú / Người đại diện nhận hàng <span style={{ fontWeight: 400, color: '#94a3b8' }}>(tùy chọn)</span>
                    </label>
                    <textarea
                      rows={2}
                      className="executive-modal-textarea"
                      placeholder="VD: Trưởng thôn Nguyễn Văn A tiếp nhận (SĐT: 0912.xxx.xxx), cấp phát cho 45 hộ dân bị chia cắt..."
                      value={consumeNote}
                      onChange={(e) => setConsumeNote(e.target.value)}
                    />
                  </div>
                </div>

                <div className="executive-modal-footer" style={{ padding: '14px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    disabled={isConsuming}
                    className="coordination-action-btn outline"
                    onClick={() => setConsumeTarget(null)}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={isConsuming}
                    className="coordination-action-btn primary"
                    style={{ cursor: isConsuming ? 'not-allowed' : 'pointer' }}
                  >
                    <Send size={14} />
                    <span>{isConsuming ? 'Đang xuất cấp...' : `Xác Nhận Xuất Cấp (${currentQty} ${consumeTarget.unit})`}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* THANH TÁC VỤ NỔI KHI CÓ MẶT HÀNG ĐƯỢC TÍCH CHỌN TỪ BẢNG */}
      {selectedTableItemIds.length > 0 && !isBatchConsumeOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 990,
            background: '#0f172a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 50,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            border: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <CheckCircle2 size={16} color="#38bdf8" />
            <span>
              Đã tích chọn <strong style={{ color: '#38bdf8' }}>{selectedTableItemIds.length}</strong> mặt hàng
            </span>
          </div>
          <div style={{ width: 1, height: 18, background: '#334155' }} />
          <button
            type="button"
            onClick={() => handleOpenBatchConsumeModal()}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              borderRadius: 20,
              padding: '7px 16px',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)',
            }}
          >
            <PackageCheck size={15} />
            <span>Lập lệnh điều phối &amp; Xuất kho ngay</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedTableItemIds([])}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
            title="Hủy bỏ tích chọn"
          >
            <X size={12} />
            <span>Hủy chọn</span>
          </button>
        </div>
      )}

      {/* MODAL 10: PHIẾU XUẤT CẤP CỨU TRỢ TỔNG HỢP (XUẤT NHIỀU MẶT HÀNG CÙNG LÚC TỪ KHO TỔNG) */}
      {isBatchConsumeOpen && (() => {
        // Chỉ lấy các mặt hàng còn tồn kho tại KHO TỔNG / DỰ TRỮ (không lấy hàng đã giao cho các Đội)
        const availableSupplies = equipments.filter((e) => {
          const tId = typeof e.teamId === 'object' && e.teamId ? (e.teamId as any)._id : e.teamId;
          return !tId && e.quantity > 0;
        });
        const totalItemsCount = batchItems.length;
        const totalUnitsCount = batchItems.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);

        return (
          <div className="executive-modal-backdrop" onClick={() => !isSubmittingBatchConsume && setIsBatchConsumeOpen(false)}>
            <div className="executive-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: '96%', borderRadius: 16 }}>
              <div className="executive-modal-header" style={{ borderBottom: '1px solid #bae6fd', background: '#f0f9ff', padding: '14px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#e0f2fe',
                      border: '1px solid #bae6fd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7',
                      flexShrink: 0,
                    }}
                  >
                    <PackageCheck size={18} />
                  </div>
                  <div>
                    <h3 className="executive-modal-title" style={{ color: '#0369a1', fontSize: 16 }}>
                      Phiếu Xuất Kho &amp; Lệnh Điều Phối Tiếp Tế
                    </h3>
                    <p style={{ margin: 0, fontSize: 12, color: '#0284c7' }}>
                      Xuất cấp từ <strong>Kho Tổng / Dự Trữ</strong> cho Đội cứu hộ hoặc cấp trực tiếp tại kho
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="executive-modal-close"
                  onClick={() => !isSubmittingBatchConsume && setIsBatchConsumeOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmBatchConsume}>
                <div className="executive-modal-body" style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto', overflowX: 'hidden' }}>
                  {/* 1. Chọn phương thức xuất cấp (Segmented Switcher 1 hàng siêu gọn) */}
                  <div style={{
                    display: 'flex',
                    background: '#f1f5f9',
                    padding: 3,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    gap: 4,
                  }}>
                    <button
                      type="button"
                      onClick={() => setBatchDispatchMode('ASSIGN_TEAM')}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: batchDispatchMode === 'ASSIGN_TEAM' ? '#ffffff' : 'transparent',
                        color: batchDispatchMode === 'ASSIGN_TEAM' ? '#0369a1' : '#64748b',
                        fontWeight: batchDispatchMode === 'ASSIGN_TEAM' ? 700 : 500,
                        fontSize: 13,
                        boxShadow: batchDispatchMode === 'ASSIGN_TEAM' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Truck size={15} color={batchDispatchMode === 'ASSIGN_TEAM' ? '#0284c7' : '#64748b'} />
                      <span>1. Điều động Đội cứu hộ tiếp tế</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchDispatchMode('DIRECT')}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: batchDispatchMode === 'DIRECT' ? '#ffffff' : 'transparent',
                        color: batchDispatchMode === 'DIRECT' ? '#0369a1' : '#64748b',
                        fontWeight: batchDispatchMode === 'DIRECT' ? 700 : 500,
                        fontSize: 13,
                        boxShadow: batchDispatchMode === 'DIRECT' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <PackageCheck size={15} color={batchDispatchMode === 'DIRECT' ? '#0284c7' : '#64748b'} />
                      <span>2. Xuất cấp trực tiếp tại kho</span>
                    </button>
                  </div>

                  {/* 2. Thông tin tiếp nhận & Địa điểm (Gọn gàng trong 1 container bo góc) */}
                  {batchDispatchMode === 'ASSIGN_TEAM' ? (
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      {/* Hàng 1: Đội nhận & Địa điểm (2 cột cân xứng) */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', boxSizing: 'border-box', alignItems: 'start' }}>
                        {/* Cột 1: Đội cứu hộ */}
                        <div className="executive-modal-field">
                          <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0 }}>
                            <label style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span>Đội cứu hộ nhận lệnh</span>
                              <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            {activeRescueTeams.length > 0 && (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#0284c7',
                                background: '#e0f2fe',
                                padding: '2px 8px',
                                borderRadius: 12,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                height: 22,
                                boxSizing: 'border-box',
                                lineHeight: '18px',
                              }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0284c7' }} />
                                {activeRescueTeams.length} đội sẵn sàng
                              </span>
                            )}
                          </div>
                          <select
                            required
                            className="executive-modal-select"
                            value={batchTeamId}
                            onChange={(e) => setBatchTeamId(e.target.value)}
                            style={{
                              background: '#ffffff',
                              fontWeight: 600,
                              width: '100%',
                              height: 38,
                              minHeight: 38,
                              maxHeight: 38,
                              boxSizing: 'border-box',
                              fontSize: 12.5,
                              color: '#0f172a',
                              border: '1px solid #cbd5e1',
                              borderRadius: 8,
                              padding: '0 10px',
                            }}
                          >
                            <option value="">-- Chọn Đội nhận lệnh tiếp tế --</option>
                            {activeRescueTeams.length === 0 ? (
                              <option value="" disabled>⚠️ Không có đội cứu hộ nào đang Sẵn sàng (ACTIVE)</option>
                            ) : (
                              activeRescueTeams.map((t) => (
                                <option key={t._id} value={t._id}>
                                  🛡️ {t.name}
                                </option>
                              ))
                            )}
                          </select>

                          {/* Dòng tóm tắt Đội trưởng thông minh (inline sub-bar) */}
                          {batchTeamId && (() => {
                            const chosenTeam = activeRescueTeams.find((t) => t._id === batchTeamId) || rescueTeams.find((t) => t._id === batchTeamId);
                            if (!chosenTeam) return null;
                            let lName = '';
                            let lPhone = '';
                            if (typeof chosenTeam.leaderId === 'object' && chosenTeam.leaderId) {
                              lName = (chosenTeam.leaderId as any).fullName || (chosenTeam.leaderId as any).name || '';
                              lPhone = (chosenTeam.leaderId as any).phone || '';
                            } else if (Array.isArray(chosenTeam.members) && chosenTeam.members.length > 0) {
                              const leaderMember = chosenTeam.members.find((m) => m.role === 'LEADER') || chosenTeam.members[0];
                              const rescuerObj = typeof leaderMember?.rescuerId === 'object' ? (leaderMember.rescuerId as any) : null;
                              lName = rescuerObj?.fullName || rescuerObj?.name || '';
                              lPhone = rescuerObj?.phone || '';
                            }

                            const memberIds = new Set();
                            if (chosenTeam.leaderId) {
                              const lId = typeof chosenTeam.leaderId === 'object' ? (chosenTeam.leaderId as any)._id : chosenTeam.leaderId;
                              if (lId) memberIds.add(String(lId));
                            }
                            if (Array.isArray(chosenTeam.members)) {
                              chosenTeam.members.forEach((m: any) => {
                                if (m && (m.status === 'APPROVED' || !m.status) && m.rescuerId) {
                                  memberIds.add((m.rescuerId._id || m.rescuerId).toString());
                                }
                              });
                            }
                            const memberCount = memberIds.size;
                            const isInactive = chosenTeam.status && chosenTeam.status !== 'ACTIVE';

                            return (
                              <div style={{
                                marginTop: 4,
                                padding: '5px 8px',
                                background: isInactive ? '#fef2f2' : '#f0f9ff',
                                border: isInactive ? '1px solid #fecaca' : '1px solid #bae6fd',
                                borderRadius: 7,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 11,
                                color: '#334155',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ fontWeight: 700, color: '#0369a1' }}>👤 {lName || 'Chưa chỉ định'}</span>
                                  {lPhone && (
                                    <a href={`tel:${lPhone}`} style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}>
                                      ({lPhone})
                                    </a>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  {memberCount > 0 && <span style={{ color: '#64748b' }}>👥 {memberCount} QS</span>}
                                  <span style={{
                                    fontWeight: 700,
                                    fontSize: 10,
                                    color: isInactive ? '#dc2626' : '#16a34a',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: isInactive ? '#dc2626' : '#16a34a' }} />
                                    {isInactive ? 'Tạm dừng' : 'Sẵn sàng'}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Cột 2: Địa điểm tiếp tế / Vùng ngập */}
                        <div className="executive-modal-field">
                          <div style={{ height: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0 }}>
                            <label style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span>Địa điểm tiếp tế / Vùng ngập</span>
                              <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {batchCoordinates && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBatchCoordinates(null);
                                    toast.info('Đã hủy ghim GPS');
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    padding: '0 6px',
                                    height: 22,
                                    boxSizing: 'border-box',
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    color: '#dc2626',
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                  }}
                                  title="Hủy ghim tọa độ"
                                >
                                  <X size={10} />
                                  <span>Bỏ ghim</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsMapPickerOpen(true)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '0 8px',
                                  height: 22,
                                  boxSizing: 'border-box',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: batchCoordinates ? '#0284c7' : '#0369a1',
                                  background: batchCoordinates ? '#e0f2fe' : '#f0f9ff',
                                  border: batchCoordinates ? '1px solid #7dd3fc' : '1px solid #bae6fd',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                }}
                                title="Ghim vị trí trên bản đồ"
                              >
                                <MapPin size={11} color={batchCoordinates ? '#0284c7' : '#0369a1'} />
                                <span>{batchCoordinates ? 'GPS đã ghim' : 'Ghim bản đồ'}</span>
                              </button>
                            </div>
                          </div>

                          <div style={{ position: 'relative', width: '100%', height: 38 }}>
                            <input
                              type="text"
                              required
                              className="executive-modal-input"
                              placeholder="VD: Trường THCS Nguyễn Du, Thôn An Trạch..."
                              value={batchDestination}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBatchDestination(val);
                                if (!val.trim() && batchCoordinates) {
                                  setBatchCoordinates(null);
                                }
                              }}
                              style={{
                                background: '#ffffff',
                                width: '100%',
                                height: 38,
                                minHeight: 38,
                                maxHeight: 38,
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                padding: '0 28px 0 10px',
                                fontSize: 12.5,
                                boxSizing: 'border-box',
                              }}
                            />
                            {batchDestination && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchDestination('');
                                  setBatchCoordinates(null);
                                }}
                                style={{
                                  position: 'absolute',
                                  right: 6,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  border: 'none',
                                  background: '#f1f5f9',
                                  borderRadius: '50%',
                                  width: 18,
                                  height: 18,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  color: '#64748b',
                                }}
                                title="Xóa địa điểm"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>

                          {/* Gợi ý điểm sơ tán an toàn (nếu có điểm hợp lệ) */}
                          {suggestedSafeLocations.filter((l: any) => l.name && l.name.trim().length >= 3 && !['iui', 'ok', 'test', 'abc'].includes(l.name.trim().toLowerCase())).length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Gợi ý:</span>
                              {suggestedSafeLocations
                                .filter((l: any) => l.name && l.name.trim().length >= 3 && !['iui', 'ok', 'test', 'abc'].includes(l.name.trim().toLowerCase()))
                                .slice(0, 4)
                                .map((loc: any) => {
                                  const isSelected = Boolean(
                                    batchDestination && (batchDestination === loc.name || batchDestination.startsWith(loc.name + ' ('))
                                  );

                                  return (
                                    <button
                                      key={loc._id}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setBatchDestination('');
                                          setBatchCoordinates(null);
                                        } else {
                                          setBatchDestination(loc.name + (loc.address ? ` (${loc.address})` : ''));
                                          if (loc.location?.coordinates && loc.location.coordinates.length === 2) {
                                            setBatchCoordinates([loc.location.coordinates[0], loc.location.coordinates[1]]);
                                          }
                                        }
                                      }}
                                      style={{
                                        fontSize: 10,
                                        padding: '2px 6px',
                                        borderRadius: 5,
                                        background: isSelected ? '#e0f2fe' : '#ffffff',
                                        border: isSelected ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                        color: isSelected ? '#0369a1' : '#334155',
                                        fontWeight: isSelected ? 700 : 500,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3,
                                      }}
                                    >
                                      <span>{loc.type === 'HOSPITAL' ? '🏥' : '🏫'}</span>
                                      <span>{loc.name}</span>
                                      {isSelected && <Check size={9} color="#0284c7" strokeWidth={3} />}
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Hàng 2: Người liên hệ / SĐT tại điểm ngập */}
                      <div className="executive-modal-field">
                        <div style={{ height: 20, display: 'flex', alignItems: 'center', margin: 0 }}>
                          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', margin: 0 }}>
                            Người liên hệ / SĐT tại điểm ngập <span style={{ color: '#94a3b8', fontWeight: 400 }}>(tùy chọn)</span>
                          </label>
                        </div>
                        <input
                          type="text"
                          className="executive-modal-input"
                          placeholder="VD: Thầy Trần Văn B - 0912.xxx.xxx (để Đội cứu hộ liên lạc khi tiếp cận điểm ngập)"
                          value={batchRecipientName}
                          onChange={(e) => setBatchRecipientName(e.target.value)}
                          style={{
                            background: '#ffffff',
                            width: '100%',
                            height: 36,
                            minHeight: 36,
                            maxHeight: 36,
                            borderRadius: 8,
                            border: '1px solid #cbd5e1',
                            padding: '0 10px',
                            fontSize: 12,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Chế độ 2: Xuất trực tiếp tại kho */
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      <div className="executive-modal-field">
                        <label className="executive-modal-label" style={{ fontWeight: 700, fontSize: 12, color: '#0f172a', marginBottom: 4 }}>
                          Địa bàn / Điểm cần tiếp nhận cứu trợ <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="text"
                          required
                          className="executive-modal-input"
                          placeholder="VD: Thôn An Trạch, xã Hòa Tiến (hoặc Đoàn cứu trợ Tỉnh bạn)..."
                          value={batchDestination}
                          onChange={(e) => setBatchDestination(e.target.value)}
                          style={{ background: '#ffffff', width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: 12.5 }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', boxSizing: 'border-box' }}>
                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 2 }}>
                            Người đại diện nhận hàng <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: Nguyễn Văn A (Trưởng thôn)..."
                            value={batchRecipientName}
                            onChange={(e) => setBatchRecipientName(e.target.value)}
                            style={{ background: '#ffffff', width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '7px 10px', fontSize: 12 }}
                          />
                        </div>

                        <div className="executive-modal-field">
                          <label className="executive-modal-label" style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 2 }}>
                            Số điện thoại liên hệ <span style={{ color: '#94a3b8' }}>(tùy chọn)</span>
                          </label>
                          <input
                            type="text"
                            className="executive-modal-input"
                            placeholder="VD: 0912.xxx.xxx..."
                            value={batchNote}
                            onChange={(e) => setBatchNote(e.target.value)}
                            style={{ background: '#ffffff', width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: '7px 10px', fontSize: 12 }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Danh mục các mặt hàng xuất cấp (Thiết kế 1 hàng ngang / Mini Data Table) */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                          Danh mục mặt hàng xuất kho ({totalItemsCount})
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          (Cả Thiết bị cứu hộ &amp; Nhu yếu phẩm)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddBatchItem}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: '#0284c7',
                          background: '#e0f2fe',
                          border: '1px solid #bae6fd',
                          padding: '4px 10px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Plus size={12} />
                        <span>Thêm mặt hàng</span>
                      </button>
                    </div>

                    {batchItems.length === 0 ? (
                      <div
                        style={{
                          padding: '28px 16px',
                          textAlign: 'center',
                          background: '#ffffff',
                          borderRadius: 10,
                          border: '1.5px dashed #cbd5e1',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Package size={32} color="#94a3b8" />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>
                          Chưa có mặt hàng nào trong phiếu xuất
                        </span>
                        <span style={{ fontSize: 11.5, color: '#64748b' }}>
                          Bấm nút <strong>"+ Thêm mặt hàng"</strong> ở trên, hoặc đóng phiếu để <strong>tích chọn nhanh từ bảng kho</strong> bên ngoài.
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: '#ffffff',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        }}
                      >
                        {/* Hàng Tiêu Đề Cột Cố Định (Fixed Table Header) */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '26px 1fr 95px 85px 135px 28px',
                            gap: 8,
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#64748b',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                          }}
                        >
                          <span style={{ textAlign: 'center' }}>#</span>
                          <span>Mặt hàng xuất kho</span>
                          <span style={{ textAlign: 'center' }}>Phân loại</span>
                          <span style={{ textAlign: 'center' }}>Tồn kho</span>
                          <span style={{ textAlign: 'center' }}>Số lượng xuất</span>
                          <span></span>
                        </div>

                        {/* Danh sách các mặt hàng cuộn mượt */}
                        <div style={{ maxHeight: 270, overflowY: 'auto' }}>
                          {batchItems.map((bi, idx) => {
                            const currentEq = equipments.find((e) => e._id === bi.equipmentId);
                            const isDurable = currentEq?.supplyType !== 'CONSUMABLE';
                            const maxStock = currentEq ? currentEq.quantity : 0;
                            const unitName = currentEq ? (currentEq.unit || 'đơn vị') : 'đơn vị';

                            return (
                              <div
                                key={idx}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '26px 1fr 95px 85px 135px 28px',
                                  gap: 8,
                                  alignItems: 'center',
                                  padding: '7px 12px',
                                  background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                                  borderBottom: idx === batchItems.length - 1 ? 'none' : '1px solid #f1f5f9',
                                  transition: 'background 0.15s ease',
                                }}
                              >
                                {/* Cột 1: STT (cố định 26px) */}
                                <span style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 5,
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  fontSize: 11,
                                  fontWeight: 800,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  margin: '0 auto',
                                }}>
                                  {idx + 1}
                                </span>

                                {/* Cột 2: Select mặt hàng (co giãn 1fr ~300px rộng rãi) */}
                                <div style={{ width: '100%', minWidth: 0 }}>
                                  <select
                                    value={bi.equipmentId}
                                    onChange={(e) => handleUpdateBatchItem(idx, { equipmentId: e.target.value })}
                                    style={{
                                      width: '100%',
                                      height: 33,
                                      borderRadius: 6,
                                      border: '1px solid #cbd5e1',
                                      background: '#ffffff',
                                      padding: '0 8px',
                                      fontSize: 12.5,
                                      fontWeight: 600,
                                      color: '#0f172a',
                                      outline: 'none',
                                      cursor: 'pointer',
                                      boxSizing: 'border-box',
                                    }}
                                  >
                                    <optgroup label="🛠️ Thiết bị cứu hộ (Kho Tổng / Dự Trữ)">
                                      {availableSupplies
                                        .filter((eq) => eq.supplyType !== 'CONSUMABLE')
                                        .map((eq) => (
                                          <option key={eq._id} value={eq._id}>
                                            🛠️ {eq.name} — (Tồn: {eq.quantity} {eq.unit || 'cái'})
                                          </option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="📦 Nhu yếu phẩm cứu trợ (Kho Tổng / Dự Trữ)">
                                      {availableSupplies
                                        .filter((eq) => eq.supplyType === 'CONSUMABLE')
                                        .map((eq) => (
                                          <option key={eq._id} value={eq._id}>
                                            📦 {eq.name} — (Tồn: {eq.quantity} {eq.unit || 'phần'})
                                          </option>
                                        ))}
                                    </optgroup>
                                  </select>
                                </div>

                                {/* Cột 3: Tag phân loại (cố định 95px) */}
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <span style={{
                                    width: '100%',
                                    textAlign: 'center',
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: isDurable ? '#15803d' : '#b45309',
                                    background: isDurable ? '#ecfdf5' : '#fef3c7',
                                    border: '1px solid ' + (isDurable ? '#bbf7d0' : '#fde68a'),
                                    padding: '3px 0',
                                    borderRadius: 5,
                                    whiteSpace: 'nowrap',
                                    display: 'block',
                                    boxSizing: 'border-box',
                                  }}>
                                    {isDurable ? 'Thiết bị' : 'Nhu yếu phẩm'}
                                  </span>
                                </div>

                                {/* Cột 4: Tồn khả dụng (cố định 85px) */}
                                <div
                                  style={{
                                    textAlign: 'center',
                                    fontSize: 11.5,
                                    color: '#0f172a',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={`${maxStock} ${unitName}`}
                                >
                                  <strong style={{ color: '#0284c7' }}>{maxStock}</strong>{' '}
                                  <span style={{ color: '#64748b', fontSize: 11 }}>{unitName}</span>
                                </div>

                                {/* Cột 5: Bộ điều khiển số lượng xuất (cố định 135px) */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: 6,
                                      background: '#ffffff',
                                      height: 29,
                                      padding: '0 2px',
                                      boxSizing: 'border-box',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      disabled={bi.quantity <= 1}
                                      onClick={() => handleUpdateBatchItem(idx, { quantity: Math.max(1, bi.quantity - 1) })}
                                      style={{
                                        width: 20,
                                        height: 21,
                                        borderRadius: 4,
                                        border: 'none',
                                        background: bi.quantity <= 1 ? 'transparent' : '#f1f5f9',
                                        color: bi.quantity <= 1 ? '#cbd5e1' : '#334155',
                                        cursor: bi.quantity <= 1 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <Minus size={10} />
                                    </button>

                                    <input
                                      type="number"
                                      min={1}
                                      max={maxStock}
                                      value={bi.quantity}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        handleUpdateBatchItem(idx, { quantity: isNaN(val) ? 1 : Math.min(maxStock, Math.max(1, val)) });
                                      }}
                                      style={{
                                        width: 38,
                                        border: 'none',
                                        outline: 'none',
                                        textAlign: 'center',
                                        fontWeight: 800,
                                        fontSize: 12,
                                        color: '#0f172a',
                                        background: 'transparent',
                                        padding: 0,
                                      }}
                                    />

                                    <button
                                      type="button"
                                      disabled={bi.quantity >= maxStock}
                                      onClick={() => handleUpdateBatchItem(idx, { quantity: Math.min(maxStock, bi.quantity + 1) })}
                                      style={{
                                        width: 20,
                                        height: 21,
                                        borderRadius: 4,
                                        border: 'none',
                                        background: bi.quantity >= maxStock ? 'transparent' : '#f1f5f9',
                                        color: bi.quantity >= maxStock ? '#cbd5e1' : '#334155',
                                        cursor: bi.quantity >= maxStock ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <Plus size={10} />
                                    </button>
                                  </div>

                                  {maxStock > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateBatchItem(idx, { quantity: maxStock })}
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: bi.quantity === maxStock ? '#15803d' : '#0284c7',
                                        background: bi.quantity === maxStock ? '#dcfce7' : '#f0f9ff',
                                        border: bi.quantity === maxStock ? '1px solid #86efac' : '1px solid #bae6fd',
                                        borderRadius: 5,
                                        padding: '0 6px',
                                        height: 27,
                                        cursor: 'pointer',
                                        boxSizing: 'border-box',
                                      }}
                                      title="Xuất tối đa tồn kho"
                                    >
                                      Max
                                    </button>
                                  )}
                                </div>

                                {/* Cột 6: Nút xóa dòng (cố định 28px) */}
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBatchItem(idx)}
                                    style={{
                                      border: 'none',
                                      background: '#fee2e2',
                                      color: '#dc2626',
                                      borderRadius: 6,
                                      width: 26,
                                      height: 26,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                    }}
                                    title="Xóa mặt hàng khỏi phiếu xuất"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer với Tóm tắt số lượng & Nút hành động */}
                <div className="executive-modal-footer" style={{
                  padding: '12px 22px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569' }}>
                    <span>Tổng xuất:</span>
                    <strong style={{ color: '#0369a1' }}>{totalItemsCount} mặt hàng</strong>
                    <span>•</span>
                    <strong style={{ color: '#16a34a' }}>{totalUnitsCount.toLocaleString('vi-VN')} đơn vị</strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      disabled={isSubmittingBatchConsume}
                      className="coordination-action-btn outline"
                      onClick={() => setIsBatchConsumeOpen(false)}
                      style={{ padding: '8px 16px', fontSize: 13 }}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingBatchConsume || batchItems.length === 0}
                      className="coordination-action-btn primary"
                      style={{
                        background: '#0284c7',
                        borderColor: '#0284c7',
                        cursor: isSubmittingBatchConsume || batchItems.length === 0 ? 'not-allowed' : 'pointer',
                        padding: '8px 18px',
                        fontWeight: 700,
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Send size={14} />
                      <span>{isSubmittingBatchConsume ? 'Đang xuất kho...' : `Lập Lệnh Điều Phối & Xuất Kho (${totalItemsCount} mặt hàng)`}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div >
          </div >
        );
      })()}

      {/* MODAL 11: GHIM TỌA ĐỘ VỊ TRÍ ĐIỂM TIẾP TẾ / KHU VỰC NGẬP LỤT */}
      <LocationMapPickerModal
        isOpen={isMapPickerOpen}
        onClose={() => setIsMapPickerOpen(false)}
        initialCoords={batchCoordinates}
        areaName={userAreaName || (managedArea as any)?.name || 'Đà Nẵng'}
        onConfirm={(coords, address) => {
          if (!coords) {
            setBatchCoordinates(null);
            toast.info('Đã hủy ghim tọa độ GPS');
            return;
          }
          setBatchCoordinates(coords);
          if (address) {
            setBatchDestination(address);
          } else if (!batchDestination.trim()) {
            setBatchDestination(`Tọa độ [${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}]`);
          }
          toast.success(`Đã ghim tọa độ GPS [${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}] thành công!`);
        }
        }
      />
    </div >
  );
};

export default ResourcesView;

