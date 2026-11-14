import React from 'react';

interface Props {
  onNavigateToNews?: () => void;
}

/**
 * InAppNotificationBanner đã được vô hiệu hóa theo yêu cầu:
 * "Chỉ đẩy thông báo ra ngoài app (thanh thông báo hệ điều hành), không hiển thị banner nổi trong app".
 */
export const InAppNotificationBanner: React.FC<Props> = () => {
  return null;
};
