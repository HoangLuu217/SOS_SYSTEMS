import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { backendApi } from '../services/backendApi';

interface SOSMapScreenProps {
  onClose: () => void;
}

export const SOSMapScreen: React.FC<SOSMapScreenProps> = ({ onClose }) => {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('Đang lấy vị trí GPS từ điện thoại...');
  const [sending, setSending] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Form State
  const [people, setPeople] = useState('1');
  const [description, setDescription] = useState('');
  const [emergencyType, setEmergencyType] = useState('MEDICAL');

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], 
      allowsEditing: true, 
      quality: 0.2, // Giảm mạnh dung lượng ảnh để up qua mạng LAN/Tunnel không bị timeout
      base64: true, // Quan trọng: Lấy mã base64 để gửi qua JSON
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 || null);
    }
  };

  useEffect(() => {
    (async () => {
      // 1. Xin quyền GPS
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Lỗi', 'Ứng dụng cần quyền GPS để báo nạn!');
        setLoadingMsg('Bị từ chối GPS');
        return;
      }

      // 2. Lấy vị trí
      try {
        const currentLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(currentLoc);
      } catch (err) {
        setLoadingMsg('Không thể lấy được GPS lúc này');
      }
    })();
  }, []);

  const handleSendSOS = async () => {
    if (!location) return;
    setSending(true);
    try {
      // 1. Tạo SOS Request trước
      const response = await backendApi.post('/sos', {
        location: {
          type: "Point",
          coordinates: [location.coords.longitude, location.coords.latitude]
        },
        address: "Khu vực Đà Nẵng (Lấy tự động từ GPS)",
        areaId: "650c1f1e1c9d440000a1b1c1",
        priority: "HIGH",
        emergencyType: emergencyType,
        description: description || "Báo nạn khẩn cấp từ Mobile App",
        reportedByRole: "CITIZEN",
        people: parseInt(people) || 1
      });

      if (response.success && response.data?._id) {
        const sosId = response.data._id;
        
        // 2. Sử dụng JSON Base64 thay vì FormData để vượt rào Tunnel 100%
        if (imageBase64) {
          const uploadRes = await backendApi.post('/files', {
            sosId: sosId,
            base64File: imageBase64
          });
          
          if (!uploadRes.success) {
            Alert.alert('Cảnh báo', 'Gửi SOS thành công nhưng up ảnh bị lỗi: ' + uploadRes.message);
            setSending(false);
            return;
          }
        }

        Alert.alert('Thành công', 'Tín hiệu cầu cứu và hình ảnh đã được gửi đến trung tâm!', [
          { text: 'Đóng', onPress: onClose }
        ]);
      } else {
        Alert.alert('Lỗi', response.message || 'Gửi thất bại');
      }
    } catch (err: any) {
      Alert.alert('Lỗi mạng', 'Không thể kết nối đến máy chủ. ' + err.message);
    } finally {
      setSending(false);
    }
  };

  // Nếu đang loading tọa độ
  if (!location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={{ marginTop: 15, fontWeight: '600' }}>{loadingMsg}</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Hủy bỏ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Feather name="arrow-left" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Báo nạn khẩn cấp</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.formContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          <Text style={styles.label}>Loại khẩn cấp:</Text>
          <View style={styles.typeRow}>
            {[
              { id: 'MEDICAL', iconName: 'ambulance', label: 'Y tế' },
              { id: 'FIRE', iconName: 'fire', label: 'Hỏa hoạn' },
              { id: 'POLICE', iconName: 'shield-account', label: 'An ninh' },
              { id: 'RESCUE', iconName: 'lifebuoy', label: 'Cứu hộ' }
            ].map(t => (
              <TouchableOpacity 
                key={t.id} 
                onPress={() => setEmergencyType(t.id)} 
                style={[styles.typeBtn, emergencyType === t.id && styles.typeBtnActive]}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons 
                  name={t.iconName as any} 
                  size={24} 
                  color={emergencyType === t.id ? '#EF4444' : '#64748B'} 
                />
                <Text style={[styles.typeText, emergencyType === t.id && styles.typeTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Số người gặp nạn:</Text>
          <TextInput 
            style={styles.input} 
            keyboardType="numeric" 
            value={people} 
            onChangeText={setPeople} 
            placeholder="Ví dụ: 1"
          />

          <Text style={styles.label}>Mô tả tình trạng (Tùy chọn):</Text>
          <TextInput 
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
            multiline
            placeholder="Vết thương, đặc điểm người bệnh..."
            value={description} 
            onChangeText={setDescription} 
          />

          {/* Nút chọn ảnh */}
          <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage} activeOpacity={0.8}>
            <Feather name="camera" size={20} color="#0284C7" />
            <Text style={styles.imagePickerText}>
              {imageUri ? 'Thay đổi ảnh khác' : 'Đính kèm hình ảnh hiện trường (Khuyên dùng)'}
            </Text>
          </TouchableOpacity>
          
          {/* Hiển thị ảnh thu nhỏ nếu đã chọn */}
          {imageUri && (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          )}

          {/* Cảnh báo chuyên nghiệp */}
          <View style={styles.warningBox}>
            <Feather name="alert-triangle" size={18} color="#EF4444" style={{ marginRight: 8 }} />
            <Text style={styles.warningText}>
              Đội cứu hộ sẽ được điều động đến vị trí này ngay lập tức!
            </Text>
          </View>

          <TouchableOpacity 
            style={styles.sendButton} 
            onPress={handleSendSOS}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="white" />
            ) : (
              <View style={styles.sendButtonContent}>
                <MaterialCommunityIcons name="broadcast" size={20} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.sendButtonText}>XÁC NHẬN GỬI TÍN HIỆU CỨU NẠN</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  backButton: { padding: 10, marginLeft: -10 },
  closeBtn: { marginTop: 25, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#64748B', borderRadius: 8 },
  formContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 12, marginBottom: 5, fontSize: 15, color: '#0F172A' },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  typeBtn: { flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 10, marginHorizontal: 4 },
  typeBtnActive: { backgroundColor: '#FEE2E2', borderColor: '#EF4444' },
  typeText: { fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 4 },
  typeTextActive: { color: '#EF4444' },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 15,
    marginBottom: 20,
  },
  warningText: { color: '#DC2626', fontWeight: 'bold', fontSize: 13, flexShrink: 1 },
  sendButton: { backgroundColor: '#EF4444', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 30, elevation: 3, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  sendButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, backgroundColor: '#F0F9FF', borderRadius: 12, borderWidth: 1, borderColor: '#BAE6FD', marginTop: 15, marginBottom: 15 },
  imagePickerText: { marginLeft: 10, fontWeight: '600', color: '#0284C7', fontSize: 14 },
  previewImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 15, resizeMode: 'cover' }
});
