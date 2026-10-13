import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SOSMapScreen } from './SOSMapScreen';

export interface SosScreenProps {
  onNavigateToHome?: () => void;
}

/**
 * Tab Cứu hộ SOS:
 * Trực tiếp hiển thị Biểu mẫu báo cứu hộ ngập lụt khẩn cấp (GPS tự động, số người, mô tả, ảnh, hotline),
 * loại bỏ màn hình trung gian và nút chạm không cần thiết.
 */
export const SosScreen: React.FC<SosScreenProps> = ({ onNavigateToHome }) => {
  return (
    <View style={styles.container}>
      <SOSMapScreen onClose={onNavigateToHome} isTab={true} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
