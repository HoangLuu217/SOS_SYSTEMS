import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { LOGO_SOS_SOURCE } from '../constants/logoBase64';

interface LogoSOSProps {
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
}

/**
 * Component hiển thị Logo RescueSOS từ bộ nhớ RAM (Base64 Data URI).
 * Không cần gọi mạng HTTP qua Metro / Tunnel, hiển thị tức thì 0.00 giây
 * và không bao giờ bị nháy khi chuyển tab hay chuyển màn hình.
 */
export const LogoSOS = React.memo<LogoSOSProps>(({
  style,
  resizeMode = 'contain',
}) => {
  return (
    <Image
      source={LOGO_SOS_SOURCE}
      style={style}
      resizeMode={resizeMode}
      fadeDuration={0}
    />
  );
});
