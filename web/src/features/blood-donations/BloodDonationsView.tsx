import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Droplet,
  Plus,
  RefreshCw,
  Search,
  Clock,
  MapPin,
  Eye,
  X,
  Phone,
  Mail,
  Building2,
  User as UserIcon,
  Activity,
  Download,
  ExternalLink,
  CheckCircle2,
  Bell,
} from 'lucide-react';
import { fetchWithAuth } from '@/api/client';
import { fetchAdministrativeAreas, getDaNangAreaScope } from '@/api/area.api';
import type { User } from '@/types/auth';
import { BloodEventMapPicker, parseGoogleMapsUrlOrCoords } from './BloodEventMapPicker';

export interface BloodDonationsViewProps {
  user?: User | null;
}

interface AdministrativeAreaItem {
  _id: string;
  name: string;
  code?: string;
  type: 'PROVINCE' | 'DISTRICT' | 'WARD' | string;
  parentId?: string | null;
}

interface BloodDonationRegistration {
  _id: string;
  userId?: {
    _id: string;
    fullName: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    address?: string;
  };
  eventId?: {
    _id: string;
    title: string;
    locationName: string;
    eventDate: string;
    startTime: string;
    endTime: string;
  } | null;
  registrationType: 'PRE_REGISTRATION' | 'EVENT_REGISTRATION';
  fullName: string;
  phone: string;
  bloodType: string;
  weightKg?: number | null;
  healthNote?: string;
  preferredTimeSlot?: string;
  note?: string;
  areaId?: string | null;
  areaName?: string;
  provinceId?: string | null;
  provinceName?: string;
  address?: string;
  status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';
  respondedAt: string;
  createdAt: string;
  reminded1DayBefore?: boolean;
  reminded1DayAt?: string | null;
  remindedUpcoming?: boolean;
  remindedUpcomingAt?: string | null;
}

interface BloodDonationEvent {
  _id: string;
  title: string;
  description?: string;
  locationName: string;
  address: string;
  googleMapsUrl?: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  neededBloodTypes: string[];
  targetDonors: number;
  organizerName: string;
  contactPhone?: string;
  requirements?: string;
  urgencyLevel: 'NORMAL' | 'HIGH' | 'CRITICAL';
  scope: 'ALL' | 'PROVINCE' | 'WARD';
  areaId?: string | null;
  areaName?: string;
  provinceId?: string | null;
  provinceName?: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  stats: {
    totalNotified: number;
    confirmedCount: number;
    declinedCount: number;
    completedCount: number;
  };
  createdAt: string;
}

interface BloodDonationsCache {
  registrations: BloodDonationRegistration[];
  events: BloodDonationEvent[];
  areas: AdministrativeAreaItem[];
  eventResponses: Record<string, BloodDonationRegistration[]>;
  eventDetails: Record<string, BloodDonationEvent>;
  cachedAt: number;
}

const CACHE_KEY = 'sos_blood_donations_cache_v1';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút

// Bộ nhớ đệm cấp module trong tiến trình trình duyệt (tồn tại qua các lần chuyển tab/menu Admin)
let memoryBloodCache: BloodDonationsCache | null = null;

const getInitialBloodCache = (): BloodDonationsCache | null => {
  if (memoryBloodCache && Date.now() - memoryBloodCache.cachedAt < CACHE_TTL_MS) {
    return memoryBloodCache;
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BloodDonationsCache;
      if (parsed && typeof parsed.cachedAt === 'number' && Date.now() - parsed.cachedAt < CACHE_TTL_MS) {
        memoryBloodCache = parsed;
        return parsed;
      }
    }
  } catch {
    // Bỏ qua lỗi parse
  }
  return memoryBloodCache;
};

const saveBloodCache = (cache: BloodDonationsCache) => {
  memoryBloodCache = cache;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Bỏ qua lỗi vượt dung lượng quota sessionStorage
  }
};

const getStatusLabelText = (status: string) => {
  if (status === 'PENDING') return 'ĐK nhận thông báo đợt hiến';
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'Xác nhận tham gia';
  if (status === 'DECLINED') return 'Chưa tham gia';
  return status || '';
};

export const BloodDonationsView: React.FC<BloodDonationsViewProps> = ({ user }) => {
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const authorityAreaId = user?.authority?.areaId ? String(user.authority.areaId) : '';

  // Khởi tạo trực tiếp từ bộ nhớ đệm (Cache) để khi chuyển trang trong admin KHÔNG bị load lại!
  const initialCache = useMemo(() => getInitialBloodCache(), []);

  const [activeTab, setActiveTab] = useState<'REGISTRATIONS' | 'EVENTS'>('REGISTRATIONS');
  const [registrations, setRegistrations] = useState<BloodDonationRegistration[]>(
    () => initialCache?.registrations || []
  );
  const [events, setEvents] = useState<BloodDonationEvent[]>(
    () => initialCache?.events || []
  );
  const [areas, setAreas] = useState<AdministrativeAreaItem[]>(
    () => initialCache?.areas || []
  );
  // Nếu đã có cache thì loading = false ngay lập tức, không che màn hình bằng spinner
  const [loading, setLoading] = useState<boolean>(() => !initialCache || initialCache.events.length === 0);

  // Thanh tìm kiếm thông minh & Gợi ý bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Đóng popover gợi ý khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Slide-over Drawer bên phải cho chi tiết Người đăng ký
  const [selectedRegistration, setSelectedRegistration] =
    useState<BloodDonationRegistration | null>(null);

  // Slide-over Drawer bên phải cho chi tiết Đợt hiến máu
  const [selectedEventDetail, setSelectedEventDetail] = useState<BloodDonationEvent | null>(null);
  const [eventResponses, setEventResponses] = useState<BloodDonationRegistration[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modal Tạo đợt hiến máu
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('Đợt hiến máu tình nguyện');
  const [formLocationName, setFormLocationName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formMapUrl, setFormMapUrl] = useState('');
  const [formAreaId, setFormAreaId] = useState<string>(isAdmin ? 'ALL' : authorityAreaId || 'ALL');
  const [formEventDate, setFormEventDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [formStartTime, setFormStartTime] = useState('07:30');
  const [formEndTime, setFormEndTime] = useState('11:30');
  const [formNeededBlood, setFormNeededBlood] = useState<string[]>(['ALL']);
  const [formTargetDonors, setFormTargetDonors] = useState('100');
  const formOrganizer = 'Ban Chỉ Huy PCTT & Hội Chữ Thập Đỏ';
  const formContactPhone = user?.phone || '';
  const formRequirements =
    'Mang CCCD, ăn sáng nhẹ, không uống rượu bia trước khi hiến máu.';

  // Toast
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchAreas = useCallback(async () => {
    if (memoryBloodCache?.areas && memoryBloodCache.areas.length > 0) {
      setAreas(memoryBloodCache.areas);
      return;
    }
    try {
      const res: any = await fetchAdministrativeAreas();
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setAreas(list);
      if (memoryBloodCache) {
        memoryBloodCache.areas = list;
        saveBloodCache(memoryBloodCache);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAllData = useCallback(async (force = false) => {
    const hasCache = Boolean(
      memoryBloodCache &&
      memoryBloodCache.events.length > 0 &&
      Date.now() - memoryBloodCache.cachedAt < CACHE_TTL_MS
    );

    // Chỉ bật spinner che màn hình nếu chưa hề có cache hoặc người dùng nhấn nút "Làm mới"
    if (!hasCache || force) {
      setLoading(true);
    }

    try {
      const [regRes, evRes] = await Promise.all([
        fetchWithAuth<any>('/blood-donations/registrations?limit=200'),
        fetchWithAuth<any>('/blood-donations/events?limit=100'),
      ]);
      const regList = Array.isArray(regRes?.data) ? regRes.data : [];
      const evList = Array.isArray(evRes?.data) ? evRes.data : [];
      setRegistrations(regList);
      setEvents(evList);

      const curCache = memoryBloodCache || {
        registrations: [],
        events: [],
        areas: [],
        eventResponses: {},
        eventDetails: {},
        cachedAt: 0,
      };
      curCache.registrations = regList;
      curCache.events = evList;
      curCache.cachedAt = Date.now();
      saveBloodCache(curCache);

      if (force) {
        showToast('success', 'Đã làm mới dữ liệu hiến máu từ máy chủ.');
      }
    } catch (err: any) {
      if (!hasCache || force) {
        showToast('error', err?.message || 'Không thể tải dữ liệu.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Cập nhật trạng thái người tham gia (Xác nhận, Đã hiến máu, Từ chối)
  const handleUpdateRegistrationStatus = useCallback(
    async (
      regId: string,
      newStatus: 'CONFIRMED' | 'COMPLETED' | 'DECLINED' | 'PENDING'
    ) => {
      try {
        const res = await fetchWithAuth<any>(`/blood-donations/registrations/${regId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        });
        if (res?.success === false) {
          throw new Error(res?.message || 'Không thể cập nhật trạng thái');
        }

        showToast('success', `Đã cập nhật trạng thái thành: ${getStatusLabelText(newStatus)}`);

        // 1. Cập nhật selectedRegistration nếu đang mở
        setSelectedRegistration((prev) =>
          prev && prev._id === regId ? { ...prev, status: newStatus } : prev
        );

        // 2. Cập nhật eventResponses (trong form đợt hiến hiện tại)
        setEventResponses((prev) =>
          prev.map((r) => (r._id === regId ? { ...r, status: newStatus } : r))
        );

        // 3. Cập nhật danh sách registrations chung
        setRegistrations((prev) =>
          prev.map((r) => (r._id === regId ? { ...r, status: newStatus } : r))
        );

        // 4. Đồng bộ vào cache
        if (memoryBloodCache) {
          memoryBloodCache.registrations = memoryBloodCache.registrations.map((r) =>
            r._id === regId ? { ...r, status: newStatus } : r
          );
          if (selectedEventDetail?._id && memoryBloodCache.eventResponses?.[selectedEventDetail._id]) {
            memoryBloodCache.eventResponses[selectedEventDetail._id] = memoryBloodCache.eventResponses[
              selectedEventDetail._id
            ].map((r) => (r._id === regId ? { ...r, status: newStatus } : r));
          }
          saveBloodCache(memoryBloodCache);
        }
      } catch (err: any) {
        showToast('error', err?.message || 'Không thể cập nhật trạng thái');
      }
    },
    [selectedEventDetail]
  );

  useEffect(() => {
    void fetchAreas();
    // Khi chuyển trang qua lại, gọi với force=false để tận dụng cache và cập nhật ngầm không giật lag
    void fetchAllData(false);
  }, [fetchAreas, fetchAllData]);

  const { areaById, daNangProvince, daNangProvinceId, daNangWards } = useMemo(
    () => getDaNangAreaScope(areas),
    [areas]
  );

  useEffect(() => {
    if (isAdmin && daNangProvinceId && (!formAreaId || formAreaId === 'ALL')) {
      setFormAreaId(daNangProvinceId);
    }
  }, [isAdmin, daNangProvinceId, formAreaId]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      // Chỉ hiển thị người đăng ký nhận thông báo về hiến máu
      if (r.registrationType !== 'PRE_REGISTRATION') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (r.fullName || r.userId?.fullName || '').toLowerCase().includes(q);
        const matchPhone = (r.phone || r.userId?.phone || '').toLowerCase().includes(q);
        const matchArea = (r.provinceName || r.areaName || r.address || '')
          .toLowerCase()
          .includes(q);
        const blood = (r.bloodType || '').toLowerCase();
        const matchBlood =
          blood.includes(q) || (q === 'chưa rõ' && (blood === 'unknown' || !blood));
        const statusText = getStatusLabelText(r.status).toLowerCase();
        const matchStatus = statusText.includes(q);

        if (!matchName && !matchPhone && !matchArea && !matchBlood && !matchStatus) return false;
      }
      return true;
    });
  }, [registrations, searchQuery]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (ev.title || '').toLowerCase().includes(q);
        const matchLoc = (ev.locationName || '').toLowerCase().includes(q);
        const matchAddress = (ev.address || '').toLowerCase().includes(q);
        const matchArea = (ev.provinceName || ev.areaName || '').toLowerCase().includes(q);
        const matchBlood = ev.neededBloodTypes?.some((bt) => bt.toLowerCase().includes(q));
        if (!matchTitle && !matchLoc && !matchAddress && !matchArea && !matchBlood) return false;
      }
      return true;
    });
  }, [events, searchQuery]);

  const toggleBloodNeed = (bt: string) => {
    if (bt === 'ALL') {
      setFormNeededBlood(['ALL']);
      return;
    }
    setFormNeededBlood((prev) => {
      const withoutAll = prev.filter((x) => x !== 'ALL');
      if (withoutAll.includes(bt)) {
        const next = withoutAll.filter((x) => x !== bt);
        return next.length === 0 ? ['ALL'] : next;
      }
      return [...withoutAll, bt];
    });
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formLocationName.trim() || !formAddress.trim() || !formEventDate) {
      showToast('error', 'Vui lòng điền đủ Tên đợt, Địa điểm, Địa chỉ và Ngày.');
      return;
    }

    let resolvedMapUrl = formMapUrl.trim();
    const parsedCoords = parseGoogleMapsUrlOrCoords(resolvedMapUrl);
    if (parsedCoords) {
      resolvedMapUrl = `https://www.google.com/maps?q=${parsedCoords.lat},${parsedCoords.lng}`;
    }

    if (!resolvedMapUrl) {
      showToast('error', 'Vui lòng chọn vị trí trên bản đồ bên phải hoặc dán link Google Maps dẫn đường.');
      return;
    }

    const resolvedAreaId =
      !isAdmin && authorityAreaId
        ? authorityAreaId
        : formAreaId && formAreaId !== 'ALL'
          ? formAreaId
          : daNangProvinceId || 'ALL';

    if (isAdmin && (!resolvedAreaId || resolvedAreaId === 'ALL')) {
      showToast('error', 'Không tìm thấy dữ liệu khu vực Đà Nẵng trong hệ thống, vui lòng thử lại.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetchWithAuth<any>('/blood-donations/events', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle.trim(),
          locationName: formLocationName.trim(),
          address: formAddress.trim(),
          googleMapsUrl: resolvedMapUrl,
          areaId: resolvedAreaId,
          eventDate: formEventDate,
          startTime: formStartTime.trim(),
          endTime: formEndTime.trim(),
          neededBloodTypes: formNeededBlood,
          targetDonors: Number(formTargetDonors) || 100,
          organizerName: formOrganizer.trim(),
          contactPhone: formContactPhone.trim(),
          requirements: formRequirements.trim(),
        }),
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'Không thể tạo đợt hiến máu.');
      }

      const createdEv = res?.data || res;
      const notifiedCount =
        createdEv?.stats?.totalNotified ?? registrations.filter((r) => r.status === 'PENDING').length;
      showToast('success', `Đã tạo đợt hiến máu và gửi thông báo tới ${notifiedCount} người đăng ký!`);
      setIsCreateOpen(false);
      setActiveTab('EVENTS');
      await fetchAllData(true);
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
    } catch (err: any) {
      showToast('error', err?.message || 'Không thể tạo đợt hiến máu.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEventDetail = async (ev: BloodDonationEvent) => {
    setSelectedRegistration(null);

    // Kiểm tra cache cho đợt hiến này -> hiển thị ngay nếu có
    const cachedEvent = memoryBloodCache?.eventDetails?.[ev._id] || ev;
    const cachedResponses = memoryBloodCache?.eventResponses?.[ev._id];

    setSelectedEventDetail(cachedEvent);

    if (cachedResponses && cachedResponses.length > 0) {
      setEventResponses(cachedResponses);
      setLoadingDetail(false);
    } else {
      setEventResponses([]);
      setLoadingDetail(true);
    }

    try {
      const res = await fetchWithAuth<any>(`/blood-donations/events/${ev._id}`);
      const data = res?.data || res;
      const resolvedEv = data?.event || ev;
      const resolvedResponses = Array.isArray(data?.responses) ? data.responses : [];

      setSelectedEventDetail(resolvedEv);
      setEventResponses(resolvedResponses);

      // Cập nhật vào cache
      const curCache = memoryBloodCache || {
        registrations: [],
        events: [],
        areas: [],
        eventResponses: {},
        eventDetails: {},
        cachedAt: Date.now(),
      };
      if (!curCache.eventResponses) curCache.eventResponses = {};
      if (!curCache.eventDetails) curCache.eventDetails = {};
      curCache.eventResponses[ev._id] = resolvedResponses;
      curCache.eventDetails[ev._id] = resolvedEv;
      saveBloodCache(curCache);
    } catch {
      if (!cachedResponses) setEventResponses([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleEventStatus = async (ev: BloodDonationEvent) => {
    const nextStatus = ev.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE';
    try {
      const res = await fetchWithAuth<any>(`/blood-donations/events/${ev._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'Lỗi cập nhật trạng thái.');
      }
      showToast('success', nextStatus === 'CLOSED' ? 'Đã đóng đợt hiến máu.' : 'Đã mở lại đợt hiến máu.');
      await fetchAllData(true);
      window.dispatchEvent(new CustomEvent('sos_data_updated'));
      if (selectedEventDetail?._id === ev._id) {
        setSelectedEventDetail({ ...ev, status: nextStatus });
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Không thể cập nhật.');
    }
  };

  const [sendingReminder, setSendingReminder] = useState(false);

  const handleSendEventReminders = async (ev: BloodDonationEvent) => {
    if (sendingReminder) return;
    setSendingReminder(true);
    try {
      const res = await fetchWithAuth<any>(`/blood-donations/events/${ev._id}/remind`, {
        method: 'POST',
        body: JSON.stringify({ reminderType: 'AUTO' }),
      });
      if (res?.success === false) {
        throw new Error(res?.message || 'Lỗi gửi nhắc nhở');
      }
      const d = res?.data || {};
      const msg = `Đã kiểm tra gửi nhắc nhở: ${d.count1Day || 0} người (cách 1 ngày), ${d.countUpcoming || 0} người (sắp đến giờ). Tổng đã nhắc: ${d.totalReminded || 0} người.`;
      showToast('success', msg);
      // Cập nhật lại danh sách người tham gia để hiển thị cờ nhắc nhở mới nhất
      await handleOpenEventDetail(ev);
    } catch (err: any) {
      showToast('error', err?.message || 'Không thể gửi nhắc nhở.');
    } finally {
      setSendingReminder(false);
    }
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const formatDateTime = (d?: string) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return parts[parts.length - 1]?.[0]?.toUpperCase() || 'U';
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span
            style={{
              background: '#fef3c7',
              color: '#b45309',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ĐK nhận thông báo đợt hiến
          </span>
        );
      case 'CONFIRMED':
      case 'COMPLETED':
        return (
          <span
            style={{
              background: '#dcfce7',
              color: '#15803d',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Xác nhận tham gia
          </span>
        );
      case 'DECLINED':
        return (
          <span
            style={{
              background: '#f1f5f9',
              color: '#64748b',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Chưa tham gia
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const escapeCsvCell = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Xuất CSV danh sách người tham gia cho từng đợt hiến máu cụ thể
  const handleExportEventParticipantsCsv = async (
    ev: BloodDonationEvent,
    preloadedResponses?: BloodDonationRegistration[]
  ) => {
    try {
      let list: BloodDonationRegistration[] = preloadedResponses || [];
      if (!preloadedResponses) {
        const res = await fetchWithAuth<any>(`/blood-donations/events/${ev._id}`);
        if (res?.success && res.data) {
          list = Array.isArray(res.data.responses) ? res.data.responses : [];
        } else {
          // Fallback lọc từ danh sách registrations hiện có
          list = registrations.filter((r) => r.eventId?._id === ev._id);
        }
      }

      const headers = [
        'STT',
        'Đợt hiến máu',
        'Địa điểm tổ chức',
        'Ngày tổ chức',
        'Khung giờ',
        'Họ và tên người tham gia',
        'Số điện thoại',
        'Email',
        'Nhóm máu',
        'Cân nặng (kg)',
        'Trạng thái tham gia',
        'Khu vực / Tỉnh TP',
        'Địa chỉ chi tiết',
        'Tình trạng sức khỏe',
        'Ghi chú thêm',
        'Thời gian xác nhận',
      ];

      const rows = list.map((r, idx) => [
        idx + 1,
        ev.title || '',
        ev.locationName || '',
        formatDate(ev.eventDate),
        `${ev.startTime || ''} - ${ev.endTime || ''}`,
        r.fullName || r.userId?.fullName || '',
        r.phone || r.userId?.phone || '',
        r.userId?.email || '',
        r.bloodType === 'UNKNOWN' ? 'Chưa rõ' : r.bloodType || '',
        r.weightKg ?? '',
        getStatusLabelText(r.status),
        r.provinceName || r.areaName || ev.areaName || '',
        r.address || r.userId?.address || '',
        r.healthNote || 'Đủ điều kiện',
        r.note || '',
        formatDateTime(r.respondedAt || r.createdAt),
      ]);

      const csvContent =
        '\uFEFF' +
        [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = (ev.title || 'dot_hien_mau')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 45);
      link.href = url;
      link.download = `Danh_sach_nguoi_tham_gia_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', `Đã xuất file CSV danh sách người tham gia đợt "${ev.title}" (${list.length} người).`);
    } catch (err: any) {
      showToast('error', err.message || 'Không thể xuất file CSV cho đợt hiến máu này');
    }
  };

  // Xuất CSV danh sách trên thanh công cụ (theo tab hiện tại)
  const handleExportToolbarCsv = () => {
    if (activeTab === 'REGISTRATIONS') {
      const headers = [
        'STT',
        'Họ và tên',
        'Số điện thoại',
        'Email',
        'Nhóm máu',
        'Cân nặng (kg)',
        'Loại đăng ký',
        'Trạng thái',
        'Đợt hiến máu phản hồi',
        'Khu vực / Tỉnh TP',
        'Địa chỉ',
        'Sức khỏe',
        'Ghi chú',
        'Thời gian đăng ký',
      ];
      const rows = filteredRegistrations.map((r, idx) => [
        idx + 1,
        r.fullName || r.userId?.fullName || '',
        r.phone || r.userId?.phone || '',
        r.userId?.email || '',
        r.bloodType === 'UNKNOWN' ? 'Chưa rõ' : r.bloodType || '',
        r.weightKg ?? '',
        r.registrationType === 'PRE_REGISTRATION' ? 'ĐK nhận thông báo đợt hiến' : 'Xác nhận theo đợt',
        getStatusLabelText(r.status),
        r.eventId?.title || '—',
        r.provinceName || r.areaName || '',
        r.address || r.userId?.address || '',
        r.healthNote || 'Đủ điều kiện',
        r.note || '',
        formatDateTime(r.respondedAt || r.createdAt),
      ]);
      const csvContent =
        '\uFEFF' +
        [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Danh_sach_dang_ky_hien_mau_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', `Đã xuất ${filteredRegistrations.length} hồ sơ đăng ký hiến máu ra CSV.`);
    } else {
      const headers = [
        'STT',
        'Tên đợt hiến máu',
        'Địa điểm',
        'Địa chỉ',
        'Khu vực',
        'Ngày tổ chức',
        'Khung giờ',
        'Nhóm máu cần',
        'Số người xác nhận',
        'Chỉ tiêu dự kiến',
        'Đơn vị tổ chức',
        'SĐT liên hệ',
        'Trạng thái',
      ];
      const rows = filteredEvents.map((ev, idx) => [
        idx + 1,
        ev.title || '',
        ev.locationName || '',
        ev.address || '',
        ev.areaName || 'Toàn hệ thống',
        formatDate(ev.eventDate),
        `${ev.startTime || ''} - ${ev.endTime || ''}`,
        !ev.neededBloodTypes || ev.neededBloodTypes.includes('ALL') ? 'Tất cả' : ev.neededBloodTypes.join(', '),
        ev.stats?.confirmedCount || 0,
        ev.targetDonors || 0,
        ev.organizerName || '',
        ev.contactPhone || '',
        ev.status === 'ACTIVE' ? 'Đang mở' : 'Đã đóng',
      ]);
      const csvContent =
        '\uFEFF' +
        [headers.map(escapeCsvCell).join(','), ...rows.map((row) => row.map(escapeCsvCell).join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Danh_sach_dot_hien_mau_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('success', `Đã xuất ${filteredEvents.length} đợt hiến máu ra CSV.`);
    }
  };

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: toastMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${toastMsg.type === 'success' ? '#86efac' : '#fecaca'}`,
            color: toastMsg.type === 'success' ? '#166534' : '#991b1b',
            fontWeight: 600,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{toastMsg.text}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Thanh công cụ 1 hàng duy nhất & Nút đồng bộ màu #2563eb */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* Nhóm Tabs bên trái */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab('REGISTRATIONS')}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              background: activeTab === 'REGISTRATIONS' ? '#2563eb' : '#f1f5f9',
              color: activeTab === 'REGISTRATIONS' ? '#ffffff' : '#475569',
              whiteSpace: 'nowrap',
            }}
          >
            ĐK nhận thông báo ({filteredRegistrations.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EVENTS')}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              background: activeTab === 'EVENTS' ? '#2563eb' : '#f1f5f9',
              color: activeTab === 'EVENTS' ? '#ffffff' : '#475569',
              whiteSpace: 'nowrap',
            }}
          >
            Đợt hiến máu ({events.length})
          </button>
        </div>

        {/* Thanh Search thông minh & Popover gợi ý bộ lọc */}
        <div
          ref={searchContainerRef}
          style={{
            position: 'relative',
            flex: '1 1 auto',
            maxWidth: 440,
            minWidth: 200,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#f8fafc',
              border: showSuggestions ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '6px 10px',
              transition: 'border 0.15s ease',
            }}
          >
            <Search size={14} color={showSuggestions ? '#2563eb' : '#94a3b8'} style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên, SĐT, nhóm máu (A, B, O...), khu vực..."
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 13,
                color: '#0f172a',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  color: '#94a3b8',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Popover gợi ý lọc nhanh */}
          {showSuggestions && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: '#ffffff',
                borderRadius: 10,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e2e8f0',
                padding: '12px 14px',
                zIndex: 100,
                maxHeight: 330,
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Gợi ý lọc nhanh
                </span>
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 11 }}
                >
                  Đóng
                </button>
              </div>

              {/* Nhóm máu */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                  🩸 Nhóm máu:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'].map((bt) => (
                    <button
                      key={bt}
                      type="button"
                      onClick={() => {
                        setSearchQuery(bt);
                        setShowSuggestions(false);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid #fed7aa',
                        background: searchQuery.toUpperCase() === bt ? '#ea580c' : '#fff7ed',
                        color: searchQuery.toUpperCase() === bt ? '#ffffff' : '#c2410c',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trạng thái (ở tab ĐK nhận thông báo) */}
              {activeTab === 'REGISTRATIONS' && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                    📋 Trạng thái:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {[
                      { label: 'ĐK nhận thông báo', val: 'ĐK nhận thông báo' },
                      { label: 'Xác nhận tham gia', val: 'Xác nhận' },
                      { label: 'Chưa tham gia', val: 'Chưa tham gia' },
                    ].map((st) => (
                      <button
                        key={st.val}
                        type="button"
                        onClick={() => {
                          setSearchQuery(st.val);
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          background: searchQuery === st.val ? '#2563eb' : '#f8fafc',
                          color: searchQuery === st.val ? '#ffffff' : '#334155',
                          fontSize: 11.5,
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Khu vực phổ biến (Đà Nẵng) */}
              {daNangWards.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                    📍 Phường / Xã (Đà Nẵng):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 90, overflowY: 'auto' }}>
                    {daNangWards.map((w) => (
                      <button
                        key={w._id}
                        type="button"
                        onClick={() => {
                          setSearchQuery(w.name);
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: '1px solid #e2e8f0',
                          background: searchQuery === w.name ? '#2563eb' : '#f1f5f9',
                          color: searchQuery === w.name ? '#ffffff' : '#475569',
                          fontSize: 11.5,
                          cursor: 'pointer',
                        }}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nhóm nút hành động bên phải */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <button
            type="button"
            onClick={handleExportToolbarCsv}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
            title="Xuất danh sách hiện tại ra file CSV"
          >
            <Download size={14} />
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            onClick={() => fetchAllData(true)}
            title="Làm mới dữ liệu từ máy chủ (bỏ qua cache)"
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={15} />
            <span>Tạo đợt hiến máu</span>
          </button>
        </div>
      </div>

      {/* BẢNG DỮ LIỆU GỌN GÀNG */}
      {loading ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
            color: '#64748b',
          }}
        >
          Đang tải...
        </div>
      ) : activeTab === 'REGISTRATIONS' ? (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  color: '#475569',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '11px 16px' }}>Người đăng ký</th>
                <th style={{ padding: '11px 14px' }}>Số điện thoại</th>
                <th style={{ padding: '11px 14px', textAlign: 'center' }}>Nhóm máu</th>
                <th style={{ padding: '11px 14px' }}>Khu vực</th>
                <th style={{ padding: '11px 14px' }}>Thời gian</th>
                <th style={{ padding: '11px 16px', textAlign: 'center' }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filteredRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                    Chưa có đăng ký hiến máu nào.
                  </td>
                </tr>
              ) : (
                filteredRegistrations.map((reg) => {
                  const avatarUrl = reg.userId?.avatarUrl;
                  return (
                    <tr
                      key={reg._id}
                      onClick={() => {
                        setSelectedEventDetail(null);
                        setSelectedRegistration(reg);
                      }}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        backgroundColor:
                          selectedRegistration?._id === reg._id ? '#eff6ff' : undefined,
                      }}
                    >
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={reg.fullName}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1px solid #e2e8f0',
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: '#dbeafe',
                                color: '#1d4ed8',
                                fontWeight: 700,
                                fontSize: 13,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {getInitials(reg.fullName)}
                            </div>
                          )}
                          <span
                            style={{
                              fontWeight: 600,
                              color: '#2563eb',
                            }}
                            title="Nhấn để xem chi tiết"
                          >
                            {reg.fullName}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '11px 14px', color: '#334155' }}>{reg.phone}</td>

                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 700,
                            padding: '2px 9px',
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                        >
                          {reg.bloodType === 'UNKNOWN' ? 'Chưa rõ' : reg.bloodType}
                        </span>
                      </td>

                      <td style={{ padding: '11px 14px', color: '#334155' }}>
                        {reg.provinceName || reg.areaName || '—'}
                      </td>

                      <td style={{ padding: '11px 14px', fontSize: 12.5, color: '#64748b' }}>
                        {formatDateTime(reg.respondedAt || reg.createdAt)}
                      </td>

                      <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                        {renderStatusBadge(reg.status)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ================= BẢNG ĐỢT HIẾN MÁU GỌN GÀNG ================= */
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr
                style={{
                  background: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  color: '#475569',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '11px 16px' }}>Tên đợt hiến máu</th>
                <th style={{ padding: '11px 14px' }}>Địa điểm</th>
                <th style={{ padding: '11px 14px' }}>Thời gian</th>
                <th style={{ padding: '11px 14px', textAlign: 'center' }}>Xác nhận trên App</th>
                <th style={{ padding: '11px 14px', textAlign: 'center' }}>Trạng thái</th>
                <th style={{ padding: '11px 16px', textAlign: 'center' }}>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#64748b' }}>
                    Chưa có đợt hiến máu nào.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => (
                  <tr
                    key={ev._id}
                    onClick={() => handleOpenEventDetail(ev)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      backgroundColor:
                        selectedEventDetail?._id === ev._id ? '#eff6ff' : undefined,
                    }}
                  >
                    <td style={{ padding: '11px 16px', fontWeight: 600, color: '#2563eb' }}>
                      {ev.title}
                    </td>
                    <td style={{ padding: '11px 14px', color: '#334155' }}>
                      {ev.locationName} ({ev.areaName || 'Toàn hệ thống'})
                    </td>
                    <td style={{ padding: '11px 14px', color: '#475569', fontSize: 12.5 }}>
                      {formatDate(ev.eventDate)} ({ev.startTime} - {ev.endTime})
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>
                      {ev.stats?.confirmedCount || 0} / {ev.targetDonors}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          background: ev.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                          color: ev.status === 'ACTIVE' ? '#15803d' : '#64748b',
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {ev.status === 'ACTIVE' ? 'Đang mở' : 'Đã đóng'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleExportEventParticipantsCsv(ev);
                          }}
                          title="Xuất file CSV danh sách tên & thông tin người tham gia đợt hiến máu này"
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Download size={13} />
                          <span>Xuất CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenEventDetail(ev);
                          }}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#334155',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Eye size={13} />
                          <span>Xem</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= SLIDE-OVER DRAWER BÊN PHẢI: CHI TIẾT NGƯỜI ĐĂNG KÝ (ĐÈ LÊN FORM NẾU ĐANG XEM ĐỢT HIẾN) ================= */}
      {selectedRegistration && (
        <>
          <div
            onClick={() => setSelectedRegistration(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.45)',
              zIndex: selectedEventDetail ? 10010 : 9998,
              backdropFilter: selectedEventDetail ? 'blur(2px)' : undefined,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 440,
              maxWidth: '94vw',
              background: '#ffffff',
              zIndex: selectedEventDetail ? 10020 : 9999,
              boxShadow: '-8px 0 35px rgba(15, 23, 42, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.2s ease-out',
            }}
          >
            {/* Header Drawer */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: selectedEventDetail ? '#f8fafc' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserIcon size={18} color="#2563eb" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0f172a' }}>
                    {selectedEventDetail ? 'Hồ sơ người tham gia đợt hiến' : 'Chi tiết đăng ký hiến máu'}
                  </h3>
                  {selectedEventDetail && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Thuộc đợt: <strong style={{ color: '#2563eb' }}>{selectedEventDetail.title}</strong>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRegistration(null)}
                title={selectedEventDetail ? 'Đóng hồ sơ (giữ nguyên đợt hiến)' : 'Đóng'}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body Drawer */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Khối User + Ảnh đại diện */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: 14,
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                }}
              >
                {selectedRegistration.userId?.avatarUrl ? (
                  <img
                    src={selectedRegistration.userId.avatarUrl}
                    alt={selectedRegistration.fullName}
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #bfdbfe',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      fontWeight: 800,
                      fontSize: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getInitials(selectedRegistration.fullName)}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {selectedRegistration.fullName}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#475569', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Phone size={13} color="#64748b" />
                    <a
                      href={`tel:${selectedRegistration.phone}`}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {selectedRegistration.phone}
                    </a>
                  </div>
                  {selectedRegistration.userId?.email && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Mail size={12} color="#64748b" />
                      <span>{selectedRegistration.userId.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thông tin hiến máu */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 11,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={15} color="#dc2626" />
                  <span>Thông tin hiến máu</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>Nhóm máu</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                      {selectedRegistration.bloodType === 'UNKNOWN'
                        ? 'Chưa rõ'
                        : selectedRegistration.bloodType}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: 11.5, color: '#64748b' }}>Cân nặng</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {selectedRegistration.weightKg ? `${selectedRegistration.weightKg} kg` : '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 4 }}>
                  <span style={{ color: '#64748b' }}>Trạng thái trên App:</span>
                  {renderStatusBadge(selectedRegistration.status)}
                </div>

                {selectedRegistration.preferredTimeSlot && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Khung giờ đăng ký:</span>
                    <strong style={{ color: '#1d4ed8' }}>
                      {selectedRegistration.preferredTimeSlot}
                    </strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Loại đăng ký:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {selectedRegistration.registrationType === 'PRE_REGISTRATION'
                      ? 'ĐK nhận thông báo đợt hiến'
                      : 'Xác nhận theo đợt'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Tỉnh / Khu vực:</span>
                  <strong style={{ color: '#0f172a' }}>
                    {selectedRegistration.provinceName || selectedRegistration.areaName || '—'}
                  </strong>
                </div>

                {selectedRegistration.address && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Địa chỉ: </span>
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>
                      {selectedRegistration.address}
                    </span>
                  </div>
                )}

                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Sức khỏe: </span>
                  <span style={{ color: '#0f172a' }}>
                    {selectedRegistration.healthNote || 'Đủ điều kiện'}
                  </span>
                </div>

                {selectedRegistration.note && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>Ghi chú: </span>
                    <span style={{ color: '#0284c7', fontWeight: 500 }}>
                      {selectedRegistration.note}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#64748b' }}>
                  <span>Thời gian:</span>
                  <span>{formatDateTime(selectedRegistration.respondedAt || selectedRegistration.createdAt)}</span>
                </div>
              </div>

              {/* Thông tin sự kiện liên kết (nếu có) */}
              {selectedRegistration.eventId && (
                <div
                  style={{
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    borderRadius: 12,
                    padding: 13,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>
                    Đợt hiến máu đã phản hồi:
                  </div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {selectedRegistration.eventId.title}
                  </div>
                  <div style={{ color: '#475569', fontSize: 12.5, marginTop: 3 }}>
                    📍 {selectedRegistration.eventId.locationName} •{' '}
                    {formatDate(selectedRegistration.eventId.eventDate)} (
                    {selectedRegistration.eventId.startTime} -{' '}
                    {selectedRegistration.eventId.endTime})
                  </div>
                </div>
              )}

              {/* Trạng thái thông báo nhắc nhở (cách 1 ngày & sắp đến giờ) */}
              {selectedRegistration.registrationType === 'EVENT_REGISTRATION' && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 12.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 7,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Bell size={13} color="#2563eb" />
                    <span>Trạng thái thông báo nhắc nhở:</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Nhắc trước 1 ngày:</span>
                    {selectedRegistration.reminded1DayBefore ? (
                      <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} color="#16a34a" />
                        <span>Đã gửi {selectedRegistration.reminded1DayAt ? `(${formatDateTime(selectedRegistration.reminded1DayAt)})` : ''}</span>
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Chưa gửi (tự động trước 24h)</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>Nhắc sắp đến giờ:</span>
                    {selectedRegistration.remindedUpcoming ? (
                      <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} color="#16a34a" />
                        <span>Đã gửi {selectedRegistration.remindedUpcomingAt ? `(${formatDateTime(selectedRegistration.remindedUpcomingAt)})` : ''}</span>
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>Chưa gửi (tự động trước 2h)</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Drawer có nút thao tác & Đóng giữ nguyên form đợt hiến */}
            <div
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRegistration(null)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {selectedEventDetail ? '← Đóng (Giữ đợt hiến)' : 'Đóng'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedRegistration.status !== 'COMPLETED' ? (
                  <button
                    type="button"
                    onClick={() => handleUpdateRegistrationStatus(selectedRegistration._id, 'COMPLETED')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>Xác nhận đã hiến máu</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUpdateRegistrationStatus(selectedRegistration._id, 'CONFIRMED')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#64748b',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Đổi về: Xác nhận tham gia
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================= SLIDE-OVER DRAWER BÊN PHẢI: CHI TIẾT ĐỢT HIẾN MÁU ================= */}
      {selectedEventDetail && (
        <>
          <div
            onClick={() => setSelectedEventDetail(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.35)',
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 480,
              maxWidth: '94vw',
              background: '#ffffff',
              zIndex: 9999,
              boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.15)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0f172a' }}>
                  {selectedEventDetail.title}
                </h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selectedEventDetail.areaName || 'Toàn hệ thống'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventDetail(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <MapPin size={15} color="#2563eb" style={{ marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedEventDetail.locationName}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{selectedEventDetail.address}</div>
                    {Boolean(selectedEventDetail.googleMapsUrl || selectedEventDetail.address) && (
                      <a
                        href={
                          selectedEventDetail.googleMapsUrl ||
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${selectedEventDetail.locationName} ${selectedEventDetail.address}`
                          )}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: '#2563eb',
                          fontWeight: 600,
                          textDecoration: 'none',
                          marginTop: 4,
                        }}
                      >
                        <span>📍 Chỉ đường Google Maps</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Clock size={15} color="#2563eb" />
                  <span>
                    {formatDate(selectedEventDetail.eventDate)} • {selectedEventDetail.startTime} -{' '}
                    {selectedEventDetail.endTime}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Droplet size={15} color="#dc2626" />
                  <span>
                    Nhóm máu cần:{' '}
                    <b>
                      {!selectedEventDetail.neededBloodTypes ||
                        selectedEventDetail.neededBloodTypes.includes('ALL')
                        ? 'Tất cả'
                        : selectedEventDetail.neededBloodTypes.join(', ')}
                    </b>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Building2 size={15} color="#64748b" />
                  <span>
                    {selectedEventDetail.organizerName}
                    {selectedEventDetail.contactPhone ? ` (${selectedEventDetail.contactPhone})` : ''}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>
                  Người dân phản hồi từ App ({eventResponses.length})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleSendEventReminders(selectedEventDetail)}
                    disabled={sendingReminder}
                    title="Gửi thông báo nhắc nhở tự động cho người tham gia (cách 1 ngày và sắp đến giờ)"
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: sendingReminder ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      opacity: sendingReminder ? 0.7 : 1,
                    }}
                  >
                    <Bell size={13} color="#2563eb" />
                    <span>{sendingReminder ? 'Đang gửi...' : 'Gửi nhắc nhở'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportEventParticipantsCsv(selectedEventDetail, eventResponses)}
                    title="Xuất file CSV danh sách người tham gia của đợt hiến máu này"
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Download size={13} />
                    <span>Xuất CSV người tham gia</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleEventStatus(selectedEventDetail)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {selectedEventDetail.status === 'ACTIVE' ? 'Đóng đợt này' : 'Mở lại đợt'}
                  </button>
                </div>
              </div>

              {loadingDetail ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Đang tải...
                </div>
              ) : eventResponses.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  Chưa có người dân xác nhận trên App.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {eventResponses.map((r) => {
                    const isCompleted = r.status === 'COMPLETED';
                    return (
                      <div
                        key={r._id}
                        onClick={() => setSelectedRegistration(r)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: isCompleted ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                          background: isCompleted ? '#f0fdf4' : '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 9,
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          transition: 'all 0.18s ease',
                          cursor: 'pointer',
                        }}
                      >
                        {/* Hàng 1: Avatar + Họ tên (Click mở đè lên) + Badge trạng thái */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            {r.userId?.avatarUrl ? (
                              <img
                                src={r.userId.avatarUrl}
                                alt={r.fullName}
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: '1.5px solid #bfdbfe',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  background: isCompleted ? '#dcfce7' : '#dbeafe',
                                  color: isCompleted ? '#15803d' : '#1d4ed8',
                                  fontWeight: 700,
                                  fontSize: 13.5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {getInitials(r.fullName)}
                              </div>
                            )}

                            <div style={{ minWidth: 0 }}>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRegistration(r);
                                }}
                                style={{
                                  fontWeight: 700,
                                  color: '#2563eb',
                                  fontSize: 14,
                                  textDecoration: 'underline',
                                  textUnderlineOffset: 3,
                                  cursor: 'pointer',
                                }}
                                title="Nhấn vào tên để hiển thị hồ sơ chi tiết đè lên form hiện tại"
                              >
                                {r.fullName}
                              </div>
                              <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <Phone size={12} color="#64748b" />
                                  <a
                                    href={`tel:${r.phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ color: '#475569', textDecoration: 'none' }}
                                  >
                                    {r.phone}
                                  </a>
                                </span>
                                {r.userId?.email && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Mail size={12} color="#94a3b8" />
                                    <span>{r.userId.email}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            {renderStatusBadge(r.status)}
                          </div>
                        </div>

                        {/* Hàng 2: Nhóm máu nổi bật + Cân nặng + Khung giờ + Thời gian đăng ký */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11.5 }}>
                          <span
                            style={{
                              background: r.bloodType === 'UNKNOWN' ? '#f1f5f9' : '#fee2e2',
                              color: r.bloodType === 'UNKNOWN' ? '#64748b' : '#dc2626',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 10,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Droplet size={11} />
                            <span>{r.bloodType === 'UNKNOWN' ? 'Chưa rõ nhóm máu' : `Nhóm máu ${r.bloodType}`}</span>
                          </span>

                          {r.weightKg && (
                            <span
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                color: '#334155',
                                padding: '2px 7px',
                                borderRadius: 10,
                                fontWeight: 500,
                              }}
                            >
                              ⚖️ {r.weightKg} kg
                            </span>
                          )}

                          {r.preferredTimeSlot && (
                            <span
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                color: '#1d4ed8',
                                padding: '2px 7px',
                                borderRadius: 10,
                                fontWeight: 500,
                              }}
                            >
                              ⏰ Khung giờ: {r.preferredTimeSlot}
                            </span>
                          )}

                          {r.reminded1DayBefore && (
                            <span
                              style={{
                                background: '#fef3c7',
                                border: '1px solid #fde68a',
                                color: '#b45309',
                                padding: '2px 7px',
                                borderRadius: 10,
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                              title={`Đã gửi thông báo nhắc nhở 1 ngày trước${r.reminded1DayAt ? ` (${formatDateTime(r.reminded1DayAt)})` : ''}`}
                            >
                              <Bell size={10} />
                              <span>Đã nhắc 1 ngày</span>
                            </span>
                          )}

                          {r.remindedUpcoming && (
                            <span
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#b91c1c',
                                padding: '2px 7px',
                                borderRadius: 10,
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                              title={`Đã gửi thông báo nhắc nhở sắp đến giờ${r.remindedUpcomingAt ? ` (${formatDateTime(r.remindedUpcomingAt)})` : ''}`}
                            >
                              <Clock size={10} />
                              <span>Đã nhắc sắp tới</span>
                            </span>
                          )}

                          <span style={{ color: '#64748b', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} />
                            {formatDateTime(r.respondedAt || r.createdAt)}
                          </span>
                        </div>

                        {/* Hàng 3: Địa chỉ & Sức khỏe & Ghi chú nếu có */}
                        {(r.address || r.areaName || r.provinceName || (r.healthNote && r.healthNote !== 'Sức khỏe bình thường, đủ điều kiện hiến máu') || r.note) && (
                          <div
                            style={{
                              background: isCompleted ? '#f0fdf4' : '#f8fafc',
                              border: isCompleted ? '1px dashed #bbf7d0' : '1px dashed #cbd5e1',
                              borderRadius: 8,
                              padding: '7px 9px',
                              fontSize: 11.5,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                            }}
                          >
                            {(r.address || r.areaName || r.provinceName) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569' }}>
                                <MapPin size={11} color="#64748b" />
                                <span>{r.address ? `${r.address}${r.areaName ? `, ${r.areaName}` : ''}` : (r.areaName || r.provinceName)}</span>
                              </div>
                            )}
                            {r.healthNote && r.healthNote !== 'Sức khỏe bình thường, đủ điều kiện hiến máu' && (
                              <div style={{ color: '#047857' }}>
                                🩺 <b>Sức khỏe:</b> {r.healthNote}
                              </div>
                            )}
                            {r.note && (
                              <div style={{ color: '#0284c7' }}>
                                📝 <b>Ghi chú:</b> {r.note}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Hàng 4: Link xem chi tiết hồ sơ & Nút thao tác nhanh */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRegistration(r);
                            }}
                            style={{
                              color: '#2563eb',
                              fontSize: 11.5,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Eye size={12} />
                            <span>Nhấn xem hồ sơ chi tiết &rarr;</span>
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {!isCompleted ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateRegistrationStatus(r._id, 'COMPLETED');
                                }}
                                title="Đánh dấu người này đã đến hiến máu thành công"
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: 6,
                                  border: '1px solid #bbf7d0',
                                  background: '#f0fdf4',
                                  color: '#15803d',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                ✓ Đã hiến máu
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateRegistrationStatus(r._id, 'CONFIRMED');
                                }}
                                title="Khôi phục trạng thái về Xác nhận tham gia"
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: 6,
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#64748b',
                                  fontSize: 11.5,
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                Hoàn tác
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= MODAL TẠO ĐỢT HIẾN MÁU (2 CỘT: FORM + MAP SEARCH & PICKER) ================= */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 1040,
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Droplet size={18} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Tạo đợt hiến máu & Gửi thông báo App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                padding: 20,
                display: 'grid',
                gridTemplateColumns: '1.05fr 1fr',
                gap: 20,
                alignItems: 'start',
              }}
            >
              {/* CỘT TRÁI: FORM NHẬP THÔNG TIN */}
              <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                    Tên đợt hiến máu *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 11px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                    Khu vực *
                  </label>
                  {!isAdmin && authorityAreaId ? (
                    <input
                      type="text"
                      disabled
                      value={
                        areas.find((a) => a._id === authorityAreaId)?.name ||
                        user?.authority?.areaName ||
                        'Khu vực địa phương quản lý'
                      }
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        background: '#f1f5f9',
                        color: '#475569',
                        cursor: 'not-allowed',
                      }}
                    />
                  ) : (
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Phường / Xã ({daNangProvince?.name || 'Thành phố Đà Nẵng'})
                      </div>
                      <select
                        value={
                          areaById.get(formAreaId)?.type === 'WARD'
                            ? formAreaId
                            : ''
                        }
                        onChange={(e) => {
                          const wardId = e.target.value;
                          const nextAreaId = wardId || daNangProvinceId || 'ALL';
                          setFormAreaId(nextAreaId);
                          const matched = areas.find((a) => a._id === nextAreaId);
                          if (matched) setFormAddress(matched.name);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 11px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          fontSize: 13,
                          background: '#ffffff',
                        }}
                      >
                        <option value="">
                          Toàn {daNangProvince?.name || 'Thành phố Đà Nẵng'} ({daNangWards.length} Phường/Xã)
                        </option>
                        {daNangWards.map((w) => (
                          <option key={w._id} value={w._id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        Khu vực áp dụng: <strong>{daNangProvince?.name || 'Thành phố Đà Nẵng'}</strong>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Địa điểm tổ chức *
                    </label>
                    <input
                      type="text"
                      value={formLocationName}
                      onChange={(e) => setFormLocationName(e.target.value)}
                      required
                      placeholder="VD: Nhà văn hóa Phường"
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Địa chỉ *
                    </label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      required
                      placeholder="Số nhà, đường, phường/xã"
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>

                {/* Khung tạo địa chỉ map là bắt buộc */}
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                    Địa chỉ Google Maps / Link dẫn đường <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={formMapUrl}
                      onChange={(e) => setFormMapUrl(e.target.value)}
                      required
                      placeholder="Dán link Google Maps, nhập tọa độ (lat, lng), hoặc click chọn trên bản đồ bên phải"
                      style={{
                        flex: 1,
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        background: '#f8fafc',
                      }}
                    />
                    {Boolean(formMapUrl.trim()) && (
                      <a
                        href={
                          formMapUrl.trim().startsWith('http')
                            ? formMapUrl.trim()
                            : `https://www.google.com/maps?q=${encodeURIComponent(formMapUrl.trim())}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#2563eb',
                          fontSize: 12.5,
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>Mở Maps</span>
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 90px', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Ngày tổ chức *
                    </label>
                    <input
                      type="date"
                      value={formEventDate}
                      onChange={(e) => setFormEventDate(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Bắt đầu *
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Kết thúc *
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                      Chỉ tiêu
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formTargetDonors}
                      onChange={(e) => setFormTargetDonors(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 11px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 5 }}>
                    Nhóm máu cần:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['ALL', 'O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'].map((bt) => {
                      const active = formNeededBlood.includes(bt);
                      return (
                        <button
                          key={bt}
                          type="button"
                          onClick={() => toggleBloodNeed(bt)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`,
                            background: active ? '#2563eb' : '#f8fafc',
                            color: active ? '#ffffff' : '#334155',
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {bt === 'ALL' ? 'Tất cả' : bt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #2563eb',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: creating ? 'not-allowed' : 'pointer',
                      opacity: creating ? 0.7 : 1,
                    }}
                  >
                    {creating ? 'Đang gửi...' : 'Tạo & Gửi thông báo App'}
                  </button>
                </div>
              </form>

              {/* CỘT PHẢI: BẢN ĐỒ MAP SEARCH & TỌA ĐỘ DẪN ĐƯỜNG */}
              <div
                style={{
                  borderLeft: '1px solid #e2e8f0',
                  paddingLeft: 20,
                  height: '100%',
                }}
              >
                <BloodEventMapPicker
                  mapUrl={formMapUrl}
                  selectedProvinceName={daNangProvince?.name || 'Thành phố Đà Nẵng'}
                  onLocationSelected={(_lat, _lng, googleMapsUrl, detectedAddress) => {
                    setFormMapUrl(googleMapsUrl);
                    if (detectedAddress && !formAddress.trim()) {
                      setFormAddress(detectedAddress);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
