import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../config/supabase';
import { SOSMapScreen } from './SOSMapScreen';

interface HomeScreenProps {
  onOpenSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onOpenSettings }) => {
  const { user, supabaseUser, authMode, logout, isLoading } = useAuth();
  const [showMap, setShowMap] = useState(false);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
          <Text style={styles.greeting}>Xin chào, {user?.fullName || 'Người dùng'}!</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onOpenSettings}
            activeOpacity={0.7}
          >
            <Feather name="settings" size={20} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.logoutIconButton]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Feather name="log-out" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{getInitials(user?.fullName)}</Text>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.fullName || 'Chưa cập nhật tên'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {user?.phone ? <Text style={styles.userPhone}>📱 {user.phone}</Text> : null}

            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user?.roles?.[0] || 'CITIZEN'}</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Feather name="shield" size={12} color="#10B981" />
                <Text style={styles.verifiedText}>Đã xác thực</Text>
              </View>
            </View>
          </View>
        </View>

        {/* SOS Emergency Quick Action Card */}
        <View style={styles.sosCard}>
          <View style={styles.sosContent}>
            <View style={styles.sosIconContainer}>
              <Feather name="alert-octagon" size={28} color="#FFFFFF" />
            </View>
            <View style={styles.sosTextContainer}>
              <Text style={styles.sosTitle}>Cứu nạn khẩn cấp</Text>
              <Text style={styles.sosSubtitle}>Gửi vị trí & tín hiệu khẩn cấp đến đội cứu hộ</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.sosButton}
            onPress={() => setShowMap(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.sosButtonText}>GỬI TÍN HIỆU SOS</Text>
          </TouchableOpacity>
        </View>

        {/* System Connection Status */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionHeader}>Trạng thái kết nối</Text>

          <View style={styles.statusItem}>
            <View style={styles.statusDotActive} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Backend Express / MongoDB</Text>
              <Text style={styles.statusSub}>
                {user?._id ? `Đã đồng bộ User ID: ${user._id.slice(0, 8)}...` : 'Chưa kết nối'}
              </Text>
            </View>
            <Feather name="check" size={18} color="#10B981" />
          </View>

          <View style={styles.statusItem}>
            <View style={isSupabaseConfigured() ? styles.statusDotActive : styles.statusDotPending} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Supabase Auth / Google OAuth</Text>
              <Text style={styles.statusSub}>
                {supabaseUser ? 'Đã đăng nhập qua Supabase' : isSupabaseConfigured() ? 'Sẵn sàng' : 'Chưa cấu hình API Key'}
              </Text>
            </View>
            <Feather
              name={isSupabaseConfigured() ? 'check' : 'alert-circle'}
              size={18}
              color={isSupabaseConfigured() ? '#10B981' : '#F59E0B'}
            />
          </View>

          <View style={styles.statusItem}>
            <View style={styles.statusDotActive} />
            <View style={styles.statusInfo}>
              <Text style={styles.statusTitle}>Chế độ xác thực hiện tại</Text>
              <Text style={styles.statusSub}>
                {authMode === 'hybrid'
                  ? 'Hybrid (Kết hợp Supabase & SOS Backend)'
                  : authMode === 'backend'
                  ? 'Chỉ SOS Backend'
                  : 'Chỉ Supabase'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <Feather name="log-out" size={18} color="#EF4444" />
          <Text style={styles.logoutButtonText}>Đăng xuất khỏi hệ thống</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal hiển thị Bản đồ Cứu nạn SOS */}
      <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
        <SOSMapScreen onClose={() => setShowMap(false)} />
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  appBadge: {
    fontSize: 11,
    color: '#0066FF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutIconButton: {
    backgroundColor: '#FEF2F2',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  userPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: {
    color: '#0066FF',
    fontSize: 11,
    fontWeight: '700',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '600',
  },
  sosCard: {
    backgroundColor: '#EF4444',
    borderRadius: 20,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  sosContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  sosIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosTextContainer: {
    flex: 1,
  },
  sosTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  sosSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  sosButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  sosButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  statusDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  statusDotPending: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
