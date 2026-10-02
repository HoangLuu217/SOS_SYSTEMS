import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const SosScreen: React.FC = () => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handleSOS = () => {
    // Pulse animation
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.05, duration: 150, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    Alert.alert(
      '🚨 Gửi tín hiệu SOS',
      'Hệ thống sẽ gửi vị trí của bạn đến trung tâm cứu hộ SOS ngay lập tức.\n\nBạn có chắc muốn gửi tín hiệu khẩn cấp?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'GỬI NGAY',
          style: 'destructive',
          onPress: () =>
            Alert.alert('✅ Đã gửi', 'Tín hiệu SOS đã được gửi. Đội cứu hộ đang trên đường đến.'),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />

      <View style={styles.header}>
        <Text style={styles.appBadge}>HỆ THỐNG CỨU HỘ SOS</Text>
        <Text style={styles.title}>Cứu nạn khẩn cấp</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.instructionText}>
          Nhấn nút bên dưới để gửi tín hiệu SOS kèm vị trí GPS của bạn đến đội cứu hộ gần nhất
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
                <Ionicons name="notifications" size={48} color="#FFFFFF" />
                <Text style={styles.sosText}>SOS</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.holdText}>Nhấn để gửi tín hiệu khẩn cấp</Text>

        {/* Emergency contacts */}
        <View style={styles.contactsCard}>
          <Text style={styles.contactsTitle}>Số điện thoại khẩn cấp</Text>

          <View style={styles.contactRow}>
            <View style={styles.contactIcon}>
              <Ionicons name="medical" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cấp cứu y tế</Text>
              <Text style={styles.contactNumber}>115</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#10B981" />
            </TouchableOpacity>
          </View>

          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="flame" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cứu hỏa</Text>
              <Text style={styles.contactNumber}>114</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#10B981" />
            </TouchableOpacity>
          </View>

          <View style={styles.contactRow}>
            <View style={[styles.contactIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="shield" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>Cảnh sát</Text>
              <Text style={styles.contactNumber}>113</Text>
            </View>
            <TouchableOpacity style={styles.callBtn} activeOpacity={0.7}>
              <Ionicons name="call" size={16} color="#10B981" />
            </TouchableOpacity>
          </View>
        </View>
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
    flex: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 32,
  },
  instructionText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  sosCircle: {
    marginBottom: 16,
  },
  sosPulseOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosPulseInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
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
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  holdText: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 28,
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
    fontSize: 14,
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
    backgroundColor: '#EF4444',
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
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
