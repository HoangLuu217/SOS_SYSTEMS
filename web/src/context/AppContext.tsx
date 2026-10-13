import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'vi' | 'en';
export type Theme = 'light' | 'dark';
export type MapMode = 'street' | 'satellite';

interface AppContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const STORAGE_LANG = 'rescuesos_lang_v1';
const STORAGE_THEME = 'rescuesos_theme_v1';
const STORAGE_MAP_MODE = 'rescuesos_map_mode_v1';

export const TRANSLATIONS: Record<Language, Record<string, string>> = {
  vi: {
    // Top Navigation
    'nav.brandTitle': 'RescueSOS',
    'nav.brandSubtitle': 'Trung Tâm Chỉ Huy Tác Chiến',
    'nav.territorial': 'Quản Trị Địa Bàn',
    'nav.dispatch': 'Tác Chiến Điều Phối',
    'nav.urgent': 'Khẩn Cấp',
    'nav.resetDemo': 'Đặt Lại Demo',
    'nav.systemOnline': 'Hệ Thống Trực Tuyến',
    'nav.officerMenuTitle': 'TÀI KHOẢN CÁN BỘ ĐỊA BÀN',
    'nav.officerMenuSub': 'Chọn cán bộ để kích hoạt nổi bật ranh giới đỏ khu vực phụ trách',
    'nav.logout': 'Đăng Xuất',
    'nav.light': 'Sáng',
    'nav.dark': 'Tối',
    'nav.vietnamese': 'Tiếng Việt',
    'nav.english': 'English',

    // Screen 1: Territorial Governance
    'territorial.adminAreas': 'Địa Bàn Hành Chính',
    'territorial.districts': 'Quận / Huyện',
    'territorial.assigned': 'Đã Phân Công',
    'territorial.unassigned': 'Chưa Phân Công',
    'territorial.reviewPending': 'Chờ Thẩm Định',
    'territorial.searchPlaceholder': 'Tìm tỉnh, quận/huyện, phường/xã...',
    'territorial.filterAll': 'Tất Cả',
    'territorial.filterAssigned': 'Đã Phân Công',
    'territorial.filterUnassigned': 'Chưa Phân Công',
    'territorial.filterPending': 'Chờ Thẩm Định',
    'territorial.registerAuth': 'Đăng Ký Cơ Quan Phụ Trách',
    'territorial.drawBoundary': 'Vẽ Ranh Giới',
    'territorial.importGeoJson': 'Nhập GeoJSON',
    'territorial.yourJurisdiction': '★ ĐỊA BÀN CỦA BẠN',
    'territorial.assignedAuthLabel': 'Cơ quan',
    'territorial.activeTeamsLabel': 'Đội Cứu Hộ Đang Trực',
    'territorial.hudTitle': '📍 ĐỊA BÀN PHỤ TRÁCH (VIỀN ĐỎ NÉT ĐỨT)',
    'territorial.hudOfficer': 'Cán bộ',
    'territorial.hudRecenter': 'Canh giữa',
    'territorial.inspectorBoundaryRef': 'MÃ RANH GIỚI',
    'territorial.inspectorArea': 'DIỆN TÍCH (KM²)',
    'territorial.inspectorPopulation': 'DÂN SỐ',
    'territorial.inspectorTeams': 'LỰC LƯỢNG CỨU HỘ',
    'territorial.inspectorAssignedAuth': 'CƠ QUAN QUẢN LÝ',
    'territorial.editArea': 'Chỉnh Sửa Địa Bàn',
    'territorial.reassignAuthority': 'Phân Công Lại',
    'territorial.scopeWardNotice': 'Bạn đang quản lý độc quyền: {ward} ({district}). Các địa bàn khác do Ban Chỉ Huy Thành Phố phân chia và chỉ có thể xem.',
    'territorial.scopeAdminNotice': 'Tổng Chỉ Huy TP Đà Nẵng: Toàn quyền quy hoạch, vẽ ranh giới và phân bổ địa bàn cho tất cả các phường.',
    'territorial.outOfJurisdiction': 'NGOÀI THẨM QUYỀN TRỰC TIẾP (CHỈ XEM)',
    'territorial.outOfJurisdictionDesc': 'Địa bàn này do cơ quan khác phụ trách hoặc do Admin Thành phố phân công. Cán bộ phường chỉ quản lý 1 địa bàn và không có quyền thay đổi vùng khác.',
    'territorial.requestCooperation': 'Yêu Cầu Phối Hợp Liên Phường',
    'territorial.adminOnlyAction': 'Chỉ Admin / BCH Thành Phố Mới Có Quyền Phân Chia',
    'territorial.quickToMyWard': 'Đến Địa Bàn Của Tôi',
    'territorial.allocateWards': 'Phân Chia Địa Bàn Phường',
    'territorial.drawAdminOnlyAlert': 'Chức năng phân chia ranh giới do Ban Chỉ Huy Tổng Thành Phố quản lý. Mỗi cán bộ chỉ điều hành tại 1 địa bàn được giao.',
    'territorial.viewDispatchWard': 'Xem Bảng Tác Chiến Phường Này',
    'territorial.sovereigntyNotice': 'Hoàng Sa & Trường Sa là của Việt Nam',

    // Screen 2: Mission Dispatch
    'dispatch.activeSos': 'Yêu Cầu Cứu Nạn Khẩn Cấp',
    'dispatch.urgentCounter': 'Khẩn Cấp',
    'dispatch.searchPlaceholder': 'Tìm mã SOS, người dân, vị trí...',
    'dispatch.tabAll': 'Tất Cả',
    'dispatch.tabMyWard': 'Địa Bàn Của Tôi',
    'dispatch.tabUrgent': 'Khẩn Cấp',
    'dispatch.tabStandby': 'Chờ Xử Lý',
    'dispatch.tabResolved': 'Hoàn Thành',
    'dispatch.emptyFeed': 'Không tìm thấy yêu cầu cứu hộ nào.',
    'dispatch.peopleAffected': 'người gặp nạn',
    'dispatch.workflowTitle': 'ĐIỀU PHỐI TÁC CHIẾN',
    'dispatch.step1': '1. Chọn Cơ Quan Phụ Trách',
    'dispatch.step2': '2. Chọn Đội Cứu Hộ',
    'dispatch.step3': '3. Chỉ Định Chỉ Huy Đội',
    'dispatch.step4': '4. Chỉ Định Phương Tiện',
    'dispatch.confirmButton': 'Xác Nhận Lệnh Điều Động',
    'dispatch.statusOnTheWay': 'Đang Di Chuyển',
    'dispatch.statusArrived': 'Đã Tiếp Cận Hiện Trường',
    'dispatch.statusRescuing': 'Đang Triển Khai Cứu Hộ',
    'dispatch.statusCompleted': 'Hoàn Thành Nhiệm Vụ',
    'dispatch.btnNextStatus': 'Cập Nhật Bước Tiếp Theo',
    'dispatch.btnReassign': 'Điều Động Đội Khác',
    'dispatch.btnCancel': 'Hủy Lệnh Điều Động',
    'dispatch.awaitingDispatch': 'Đang chờ phân công lực lượng cứu hộ',
    'dispatch.remainingDistance': 'còn lại',
    'dispatch.eta': 'Dự kiến đến',
    'dispatch.target': 'Mục tiêu:',
    'dispatch.step1Title': 'ĐỊA BÀN PHỤ TRÁCH',
    'dispatch.step2Title': 'ĐỘI CỨU HỘ',
    'dispatch.step3Title': 'CHỈ HUY / CỨU HỘ VIÊN',
    'dispatch.step4Title': 'PHƯƠNG TIỆN CỨU HỘ',
    'dispatch.verified': 'Đã Xác Minh',
    'dispatch.available': 'Sẵn Sàng',
    'dispatch.online': 'Trực Tuyến',
    'dispatch.change': 'Thay Đổi',
    'dispatch.done': 'Xong',
    'dispatch.availableRescuers': '{count} cứu hộ viên sẵn sàng',
    'dispatch.role': 'Vai trò',
    'dispatch.capacity': 'Sức chứa',
    'dispatch.people': 'người',
    'dispatch.confirmAndAssign': 'Xác Nhận & Điều Động Lực Lượng',
    'dispatch.mission': 'NHIỆM VỤ',
    'dispatch.statusProgression': 'Tiến Độ Xử Lý Nhiệm Vụ:',
    'dispatch.advanceTo': 'Cập nhật sang {step}',
    'dispatch.reassign': 'Điều Động Đội Khác',
    'dispatch.cancelAssignment': 'Hủy Lệnh Điều Động',
    'dispatch.active': 'Đang Hoạt Động',
    'dispatch.etaFormat': 'Dự kiến: {eta} phút',
    'dispatch.jurisdictionHud': '📍 ĐỊA BÀN PHỤ TRÁCH:',
    'dispatch.jurisdictionSub': 'Vị trí SOS thuộc địa bàn quản lý ({ward}).',
    'dispatch.awaitingDispatchSub': 'Xác minh địa bàn và phân công lực lượng ở bảng bên phải.',
    'dispatch.zoomIn': 'Phóng to',
    'dispatch.zoomOut': 'Thu nhỏ',
    'dispatch.recenter': 'Canh lại vị trí SOS',
  },
  en: {
    // Top Navigation
    'nav.brandTitle': 'RescueSOS',
    'nav.brandSubtitle': 'Operations Console',
    'nav.territorial': 'Territorial Governance',
    'nav.dispatch': 'Mission Dispatch',
    'nav.urgent': 'Urgent',
    'nav.resetDemo': 'Reset Demo',
    'nav.systemOnline': 'System Online',
    'nav.officerMenuTitle': 'LOCAL AUTHORITY ACCOUNTS',
    'nav.officerMenuSub': 'Select officer to highlight assigned territorial jurisdiction boundary in red',
    'nav.logout': 'Log Out',
    'nav.light': 'Light',
    'nav.dark': 'Dark',
    'nav.vietnamese': 'Tiếng Việt',
    'nav.english': 'English',

    // Screen 1: Territorial Governance
    'territorial.adminAreas': 'Administrative Areas',
    'territorial.districts': 'Districts',
    'territorial.assigned': 'Assigned',
    'territorial.unassigned': 'Unassigned',
    'territorial.reviewPending': 'Review Pending',
    'territorial.searchPlaceholder': 'Search province, district, ward...',
    'territorial.filterAll': 'All',
    'territorial.filterAssigned': 'Assigned',
    'territorial.filterUnassigned': 'Unassigned',
    'territorial.filterPending': 'Review Pending',
    'territorial.registerAuth': 'Register Authority Organization',
    'territorial.drawBoundary': 'Draw Boundary',
    'territorial.importGeoJson': 'Import GeoJSON',
    'territorial.yourJurisdiction': '★ YOUR JURISDICTION',
    'territorial.assignedAuthLabel': 'Authority',
    'territorial.activeTeamsLabel': 'Active Rescue Teams',
    'territorial.hudTitle': '📍 ASSIGNED JURISDICTION (RED DASHED BORDER)',
    'territorial.hudOfficer': 'Officer',
    'territorial.hudRecenter': 'Recenter',
    'territorial.inspectorBoundaryRef': 'BOUNDARY REF',
    'territorial.inspectorArea': 'AREA (KM²)',
    'territorial.inspectorPopulation': 'POPULATION',
    'territorial.inspectorTeams': 'RESCUE TEAMS',
    'territorial.inspectorAssignedAuth': 'ASSIGNED AUTHORITY',
    'territorial.editArea': 'Edit Area',
    'territorial.reassignAuthority': 'Reassign Authority',
    'territorial.scopeWardNotice': 'You exclusively manage: {ward} ({district}). Other areas are partitioned by City Command and are read-only.',
    'territorial.scopeAdminNotice': 'Da Nang City Commander: Full rights to partition, draw boundaries, and allocate wards to authorities.',
    'territorial.outOfJurisdiction': 'OUTSIDE DIRECT JURISDICTION (READ ONLY)',
    'territorial.outOfJurisdictionDesc': 'This area is assigned to another authority or awaiting City partition. Ward officers cannot redraw or reallocate boundaries outside their ward.',
    'territorial.requestCooperation': 'Request Inter-Ward Coordination',
    'territorial.adminOnlyAction': 'City Command Authorization Required to Reassign',
    'territorial.quickToMyWard': 'Go to My Ward',
    'territorial.allocateWards': 'Allocate Ward Jurisdictions',
    'territorial.drawAdminOnlyAlert': 'Boundary drawing and ward partitioning is managed by City Command HQ. Each local officer manages only 1 assigned ward.',
    'territorial.viewDispatchWard': 'Open Ward Tactical Dispatch',
    'territorial.sovereigntyNotice': 'Hoang Sa & Truong Sa belong to Vietnam',

    // Screen 2: Mission Dispatch
    'dispatch.activeSos': 'Active SOS Incidents',
    'dispatch.urgentCounter': 'Urgent',
    'dispatch.searchPlaceholder': 'Search SOS code, citizen, location...',
    'dispatch.tabAll': 'All',
    'dispatch.tabMyWard': 'My Ward',
    'dispatch.tabUrgent': 'Urgent',
    'dispatch.tabStandby': 'Standby',
    'dispatch.tabResolved': 'Resolved',
    'dispatch.emptyFeed': 'No emergency SOS incidents match criteria.',
    'dispatch.peopleAffected': 'people affected',
    'dispatch.workflowTitle': 'DISPATCH WORKFLOW',
    'dispatch.step1': '1. Select Authority Organization',
    'dispatch.step2': '2. Select Rescue Team',
    'dispatch.step3': '3. Assign Team Leader',
    'dispatch.step4': '4. Select Vehicle',
    'dispatch.confirmButton': 'Confirm Mission Dispatch',
    'dispatch.statusOnTheWay': 'On The Way',
    'dispatch.statusArrived': 'Arrived at Scene',
    'dispatch.statusRescuing': 'Rescue in Progress',
    'dispatch.statusCompleted': 'Mission Completed',
    'dispatch.btnNextStatus': 'Advance Status',
    'dispatch.btnReassign': 'Reassign Unit',
    'dispatch.btnCancel': 'Cancel Mission',
    'dispatch.awaitingDispatch': 'Awaiting rescue resource dispatch',
    'dispatch.remainingDistance': 'remaining',
    'dispatch.eta': 'ETA',
    'dispatch.target': 'Target:',
    'dispatch.step1Title': 'JURISDICTION',
    'dispatch.step2Title': 'RESCUE TEAM',
    'dispatch.step3Title': 'RESCUER',
    'dispatch.step4Title': 'VEHICLE',
    'dispatch.verified': 'Verified',
    'dispatch.available': 'Available',
    'dispatch.online': 'Online',
    'dispatch.change': 'Change',
    'dispatch.done': 'Done',
    'dispatch.availableRescuers': '{count} available rescuers',
    'dispatch.role': 'Role',
    'dispatch.capacity': 'Capacity',
    'dispatch.people': 'people',
    'dispatch.confirmAndAssign': 'Confirm & Assign Mission',
    'dispatch.mission': 'MISSION',
    'dispatch.statusProgression': 'Operational Status Progression:',
    'dispatch.advanceTo': 'Advance to {step}',
    'dispatch.reassign': 'Reassign',
    'dispatch.cancelAssignment': 'Cancel Assignment',
    'dispatch.active': 'Active',
    'dispatch.etaFormat': 'ETA: {eta} min',
    'dispatch.jurisdictionHud': '📍 ASSIGNED JURISDICTION:',
    'dispatch.jurisdictionSub': 'SOS location belongs to the selected administrative area ({ward}).',
    'dispatch.awaitingDispatchSub': 'Verify jurisdiction and assign rescue resources in the right panel.',
    'dispatch.zoomIn': 'Zoom In',
    'dispatch.zoomOut': 'Zoom Out',
    'dispatch.recenter': 'Recenter on SOS',
  },
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_LANG);
    return saved === 'en' ? 'en' : 'vi'; // Default to Vietnamese
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_THEME);
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [mapMode, setMapModeState] = useState<MapMode>(() => {
    const saved = localStorage.getItem(STORAGE_MAP_MODE);
    return saved === 'satellite' ? 'satellite' : 'street';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-lang', lang);
  }, [theme, lang]);

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    localStorage.setItem(STORAGE_LANG, nextLang);
  };

  const toggleLang = () => {
    const next = lang === 'vi' ? 'en' : 'vi';
    setLang(next);
  };

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    localStorage.setItem(STORAGE_THEME, nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const setMapMode = (nextMode: MapMode) => {
    setMapModeState(nextMode);
    localStorage.setItem(STORAGE_MAP_MODE, nextMode);
  };

  const t = (key: string, params?: Record<string, any>): string => {
    let str = TRANSLATIONS[lang]?.[key] || TRANSLATIONS.vi[key] || key;
    if (params) {
      Object.keys(params).forEach((k) => {
        str = str.replace(new RegExp(`{${k}}`, 'g'), String(params[k]));
      });
    }
    return str;
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        theme,
        setTheme,
        toggleTheme,
        mapMode,
        setMapMode,
        t,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
};
