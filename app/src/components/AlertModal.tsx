import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface AlertModalProps {
  visible: boolean;
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
  onClose: () => void;
  actionText?: string;
  onAction?: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  visible,
  type = 'info',
  title,
  message,
  onClose,
  actionText = 'Đồng ý',
  onAction,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Feather name="check-circle" size={36} color="#10B981" />;
      case 'error':
        return <Feather name="alert-circle" size={36} color="#EF4444" />;
      case 'warning':
        return <Feather name="alert-triangle" size={36} color="#F59E0B" />;
      default:
        return <Feather name="info" size={36} color="#0066FF" />;
    }
  };

  const getDefaultTitle = () => {
    switch (type) {
      case 'success':
        return 'Thành công';
      case 'error':
        return 'Thông báo lỗi';
      case 'warning':
        return 'Cảnh báo';
      default:
        return 'Thông báo';
    }
  };

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <View style={styles.iconWrapper}>{getIcon()}</View>

              <Text style={styles.title}>{title || getDefaultTitle()}</Text>
              <Text style={styles.message}>{message}</Text>

              <TouchableOpacity
                style={[
                  styles.button,
                  type === 'error' && styles.buttonError,
                  type === 'success' && styles.buttonSuccess,
                ]}
                onPress={handleAction}
                activeOpacity={0.85}
              >
                <Text style={styles.buttonText}>{actionText}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 24,
    paddingHorizontal: 22,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  iconWrapper: {
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonError: {
    backgroundColor: '#EF4444',
  },
  buttonSuccess: {
    backgroundColor: '#10B981',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
