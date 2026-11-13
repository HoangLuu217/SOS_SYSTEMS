import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { backendApi, EmergencyAuthorityContact } from '@/api';

interface EmergencyDirectoryModalProps {
  visible: boolean;
  onClose: () => void;
  userAddress?: string;
  initialMode?: 'GPS' | 'PROFILE' | 'ALL';
}

// Hàm tính khoảng cách giữa 2 toạ độ GPS (km) theo công thức Haversine
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const EmergencyDirectoryModal: React.FC<EmergencyDirectoryModalProps> = ({
  visible,
  onClose,
  userAddress,
  initialMode = 'ALL',
}) => {
  const insets = useSafeAreaInsets();

  const [directory, setDirectory] = useState<EmergencyAuthorityContact[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('TẤT CẢ');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedLocationName, setDetectedLocationName] = useState<string>('');
  const [activeSourceMode, setActiveSourceMode] = useState<'GPS' | 'PROFILE' | 'ALL'>('ALL');

  // Nạp danh bạ khẩn cấp từ backend khi mở modal
  const fetchDirectory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await backendApi.getEmergencyDirectory();
      if (res.success && Array.isArray(res.data)) {
        setDirectory(res.data);
      }
    } catch (err) {
      console.log('Lỗi khi tải danh bạ khẩn cấp:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lọc theo địa chỉ hồ sơ
  const handleFilterByProfile = useCallback(() => {
    if (!userAddress) return;
    setActiveSourceMode('PROFILE');
    setUserCoords(null);
    const parts = userAddress.split(',').map((p) => p.trim()).filter(Boolean);
    const searchTarget = parts.length > 1 ? parts[parts.length - 2] : parts[0] || userAddress;
    setSearchText(searchTarget);
  }, [userAddress]);

  // Tự động định vị GPS thiết bị để gợi ý phường/tỉnh gần nhất
  const handleAutoLocate = useCallback(async () => {
    try {
      setIsLocating(true);
      setActiveSourceMode('GPS');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setIsLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setUserCoords({ lat, lng });

      // Dịch ngược địa danh
      try {
        const geoList = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (geoList && geoList.length > 0) {
          const g = geoList[0];
          const name = g.district || g.subregion || g.city || g.region || '';
          setDetectedLocationName(name);
          if (name) {
            setSearchText(name);
          }
        }
      } catch {}
    } catch (err) {
      console.log('Lỗi định vị:', err);
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      void fetchDirectory();
      if (initialMode === 'GPS') {
        void handleAutoLocate();
      } else if (initialMode === 'PROFILE' && userAddress) {
        handleFilterByProfile();
      } else {
        setActiveSourceMode('ALL');
      }
    } else {
      setSearchText('');
      setSelectedTag('TẤT CẢ');
      setUserCoords(null);
      setDetectedLocationName('');
      setActiveSourceMode('ALL');
    }
  }, [visible, initialMode, userAddress, fetchDirectory, handleAutoLocate, handleFilterByProfile]);

  // Mở ứng dụng gọi điện ngay lập tức với số điện thoại đã chọn
  const handleCall = (phoneNumber: string) => {
    const clean = (phoneNumber || '').replace(/[^0-9+]/g, '');
    if (!clean) return;
    Linking.openURL(`tel:${clean}`).catch((err) => {
      console.warn('Không thể mở ứng dụng quay số:', err);
    });
  };

  // Danh mục bộ lọc nhanh các khu vực thuộc TP. Đà Nẵng mới
  const QUICK_TAGS = ['TẤT CẢ', 'HẢI CHÂU', 'THANH KHÊ', 'SƠN TRÀ', 'NGŨ HÀNH SƠN', 'LIÊN CHIỂU', 'CẨM LỆ', 'ĐIỆN BÀN', 'HỘI AN', 'TAM KỲ'];

  // Lọc và sắp xếp danh sách theo từ khóa tìm kiếm & khoảng cách
  const filteredList = useMemo(() => {
    let list = [...directory];

    // Lọc theo tag
    if (selectedTag !== 'TẤT CẢ') {
      const tagLower = selectedTag.toLowerCase();
      list = list.filter((item) => {
        const fullStr = `${item.name} ${item.department} ${item.address || ''} ${item.areaName || ''}`.toLowerCase();
        return fullStr.includes(tagLower);
      });
    }

    // Lọc theo từ khóa tìm kiếm
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((item) => {
        const fullStr = `${item.name} ${item.department} ${item.address || ''} ${item.areaName || ''} ${item.phone}`.toLowerCase();
        return fullStr.includes(q);
      });
    }

    // Nếu đã có toạ độ GPS, tính khoảng cách và ưu tiên xếp các điểm gần nhất lên trước
    if (userCoords) {
      list = list.map((item) => {
        let dist: number | undefined = undefined;
        if (typeof item.lat === 'number' && typeof item.lng === 'number') {
          dist = calculateDistanceKm(userCoords.lat, userCoords.lng, item.lat, item.lng);
        }
        return { ...item, distanceKm: dist };
      });

      list.sort((a: any, b: any) => {
        if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
          return a.distanceKm - b.distanceKm;
        }
        if (a.distanceKm !== undefined) return -1;
        if (b.distanceKm !== undefined) return 1;
        return 0;
      });
    }

    return list;
  }, [directory, selectedTag, searchText, userCoords]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={true} />

        {/* Thanh đệm che kín đỉnh màn hình (Status Bar) bằng nền trắng nguyên khối */}
        <View style={{ height: insets.top, backgroundColor: '#FFFFFF' }} />

        {/* Thanh tiêu đề Modal */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="call" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.headerTitle}>Đường Dây Nóng Cứu Nạn</Text>
          </View>

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={22} color="#475569" />
          </TouchableOpacity>
        </View>

        {/* Thanh tìm kiếm & Nút tự động định vị */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm theo phường, xã, khu vực Đà Nẵng..."
              placeholderTextColor="#94A3B8"
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Hàng nút chọn: Định vị GPS thực tế vs Lọc theo địa chỉ Hồ sơ */}
          {userAddress ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {/* Nút GPS */}
              <TouchableOpacity
                style={[
                  styles.locateBtn,
                  { flex: 1, paddingHorizontal: 8 },
                  activeSourceMode === 'GPS' && userCoords ? styles.locateBtnActive : null,
                ]}
                onPress={handleAutoLocate}
                disabled={isLocating}
                activeOpacity={0.75}
              >
                {isLocating ? (
                  <ActivityIndicator size="small" color={activeSourceMode === 'GPS' ? '#FFFFFF' : '#0066FF'} />
                ) : (
                  <>
                    <Ionicons
                      name={activeSourceMode === 'GPS' && userCoords ? 'location' : 'location-outline'}
                      size={15}
                      color={activeSourceMode === 'GPS' && userCoords ? '#FFFFFF' : '#0066FF'}
                    />
                    <Text
                      style={[
                        styles.locateBtnText,
                        { fontSize: 12 },
                        activeSourceMode === 'GPS' && userCoords ? styles.locateBtnTextActive : null,
                      ]}
                      numberOfLines={1}
                    >
                      {activeSourceMode === 'GPS' && detectedLocationName
                        ? `GPS: ${detectedLocationName}`
                        : 'GPS hiện tại'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Nút Hồ sơ */}
              <TouchableOpacity
                style={[
                  styles.locateBtn,
                  {
                    flex: 1,
                    paddingHorizontal: 8,
                    backgroundColor: activeSourceMode === 'PROFILE' ? '#0066FF' : '#F1F5F9',
                    borderColor: activeSourceMode === 'PROFILE' ? '#0066FF' : '#E2E8F0',
                  },
                ]}
                onPress={handleFilterByProfile}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={activeSourceMode === 'PROFILE' ? 'home' : 'home-outline'}
                  size={15}
                  color={activeSourceMode === 'PROFILE' ? '#FFFFFF' : '#475569'}
                />
                <Text
                  style={[
                    styles.locateBtnText,
                    {
                      fontSize: 12,
                      color: activeSourceMode === 'PROFILE' ? '#FFFFFF' : '#475569',
                    },
                  ]}
                  numberOfLines={1}
                >
                  Theo Hồ sơ
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Nút định vị GPS nhanh mặc định */
            <TouchableOpacity
              style={[styles.locateBtn, userCoords ? styles.locateBtnActive : null]}
              onPress={handleAutoLocate}
              disabled={isLocating}
              activeOpacity={0.75}
            >
              {isLocating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name={userCoords ? 'location' : 'location-outline'}
                    size={16}
                    color={userCoords ? '#FFFFFF' : '#0066FF'}
                  />
                  <Text style={[styles.locateBtnText, userCoords ? styles.locateBtnTextActive : null]}>
                    {userCoords
                      ? `Đã định vị: ${detectedLocationName || 'Gần bạn'}`
                      : 'Tìm phường gần tôi'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Danh sách chip lọc nhanh */}
        <View style={styles.tagsContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={QUICK_TAGS}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.tagsContent}
            renderItem={({ item }) => {
              const active = selectedTag === item;
              return (
                <TouchableOpacity
                  style={[styles.tagChip, active ? styles.tagChipActive : null]}
                  onPress={() => setSelectedTag(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagChipText, active ? styles.tagChipTextActive : null]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Danh sách cơ quan cứu nạn */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>Đang tải danh bạ cứu nạn...</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="search-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Không tìm thấy địa phương phù hợp</Text>
            <Text style={styles.emptySubtitle}>
              Vui lòng thử gõ tên phường, xã hoặc tỉnh thành khác.
            </Text>
            <TouchableOpacity style={styles.resetBtn} onPress={() => { setSearchText(''); setSelectedTag('TẤT CẢ'); }}>
              <Text style={styles.resetBtnText}>Xem tất cả danh bạ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: any }) => {
              return (
                <TouchableOpacity
                  style={styles.cardItem}
                  onPress={() => handleCall(item.phone)}
                  activeOpacity={0.75}
                >
                  <View style={styles.cardLeft}>
                    <View style={styles.cardIconWrap}>
                      <Ionicons
                        name={item.type === 'OFFICER' ? 'person' : 'shield-checkmark'}
                        size={20}
                        color="#0066FF"
                      />
                    </View>

                    <View style={styles.cardInfo}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardName} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>

                      {item.department && item.department !== item.name && (
                        <Text style={styles.cardDept} numberOfLines={1}>
                          {item.department}
                        </Text>
                      )}

                      <View style={styles.addressRow}>
                        <Ionicons name="location-outline" size={13} color="#64748B" style={styles.miniIcon} />
                        <Text style={styles.cardAddress} numberOfLines={1}>
                          {item.address || item.areaName}
                        </Text>
                      </View>

                      {item.distanceKm !== undefined && (
                        <View style={styles.distanceBadge}>
                          <Text style={styles.distanceText}>
                            Cách bạn khoảng ~{item.distanceKm} km
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Nút gọi điện tròn xanh lá nổi bật */}
                  <View style={styles.callActionArea}>
                    <View style={styles.callBtnCircle}>
                      <Ionicons name="call" size={18} color="#FFFFFF" />
                    </View>
                    <Text style={styles.callPhoneText}>{item.phone}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 0,
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  locateBtnActive: {
    backgroundColor: '#0066FF',
    borderColor: '#0052CC',
  },
  locateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066FF',
    marginLeft: 6,
  },
  locateBtnTextActive: {
    color: '#FFFFFF',
  },
  tagsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  tagsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  tagChipActive: {
    backgroundColor: '#0F172A',
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tagChipTextActive: {
    color: '#FFFFFF',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  resetBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderRadius: 10,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 10,
  },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  cardDept: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  miniIcon: {
    marginRight: 3,
  },
  cardAddress: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
  },
  distanceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  distanceText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  callActionArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  callBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0066FF',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  callPhoneText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0066FF',
    marginTop: 4,
  },
});

