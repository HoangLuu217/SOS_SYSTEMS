import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Animated,
  Modal,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SOSMapScreen } from './SOSMapScreen';

export const SosScreen: React.FC = () => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const [showSosModal, setShowSosModal] = useState(false);

  const handleSOS = () => {
    // Pulse animation
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.05, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      // Mở ngay trung tâm phát tín hiệu SOS
      setShowSosModal(true);
    });
  };

  const makeCall = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {
      // Fallback
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />

      <View style={styles.header}>
        <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
        <Text style={styles.title}>Cứu hộ ngập lụt khẩn cấp</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.instructionText}>
          Nhấn nút bên dưới để phát tín hiệu cứu hộ kèm vị trí GPS đến Đội cano/xuồng cứu nạn & Chính quyền gần nhất
        </Text>

        {/* SOS Big Button */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={styles.sosCircle}
            onPress={handleSOS}
            activeOpacity={0.85}
          >
            <View style={styles.sosPulseOuter}>
              <View style={styles.sosPulseInner}>
                <Ionicons name="notifications" size={54} color="#FFFFFF" />
                <Text style={styles.sosText}>SOS</Text>
                <Text style={styles.sosSubBadge}>CHẠM ĐỂ BÁO NẠN</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.holdText}>Tự động định vị GPS vệ tinh chính xác</Text>

        {/* Quick Action Button */}
        <TouchableOpacity
          style={styles.openFormBtn}
          onPress={() => setShowSosModal(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="waves" size={22} color="#FFFFFF" />
          <Text style={styles.openFormBtnText}>BÁO CỨU HỘ NGẬP LỤT CHI TIẾT</Text>
        </TouchableOpacity>

        {/* Emergency contacts */}
        <View style={styles.contactsCard}>
          <Text style={styles.contactsTitle}>Số điện thoại khẩn cấp quốc gia (Bấm để gọi ngay)</Text>

          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: '#DC2626' }]}>
              <Ionicons name="flame" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cứu nạn & Cứu hỏa</Text>
              <Text style={styles.contactNumber}>114 (Miễn phí cước)</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={() => makeCall('114')} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#DC2626" />
            </TouchableOpacity>
          </View>

          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="medical" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cấp cứu y tế</Text>
              <Text style={styles.contactNumber}>115 (Miễn phí cước)</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={() => makeCall('115')} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#10B981" />
            </TouchableOpacity>
          </View>

          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="shield" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cảnh sát phản ứng nhanh</Text>
              <Text style={styles.contactNumber}>113 (Miễn phí cước)</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={() => makeCall('113')} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Modal biểu mẫu Báo nạn SOS */}
      <Modal
        visible={showSosModal}
        animationType="slide"
        onRequestClose={() => setShowSosModal(false)}
      >
        <SOSMapScreen onClose={() => setShowSosModal(false)} />
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 36 : 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  appBadge: {
    fontSize: 11,
    color: '#EF4444',
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
    alignItems: 'center',
    padding: 24,
    paddingTop: 24,
    paddingBottom: 50,
  },
  instructionText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  sosCircle: {
    marginBottom: 12,
  },
  sosPulseOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosPulseInner: {
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 2,
  },
  sosSubBadge: {
    color: '#FEE2E2',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  holdText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 20,
    fontWeight: '500',
  },
  openFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    gap: 8,
    marginBottom: 24,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  openFormBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  contactsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  contactsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  contactNumber: {
    fontSize: 12,
    color: '#64748B',
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

