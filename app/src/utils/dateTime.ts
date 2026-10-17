/**
 * Tiện ích xử lý và định dạng ngày giờ cho SOS SYSTEMS
 */

/**
 * Định dạng ngày giờ dạng "14:30 ngày 15/10/2026"
 */
export const formatDateTime = (dateStr?: string | Date | null): string => {
  if (!dateStr) return 'Vừa xong';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);

    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${time} ngày ${date}`;
  } catch {
    return String(dateStr);
  }
};

/**
 * Định dạng chỉ ngày dạng "15/10/2026"
 */
export const formatDate = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

/**
 * Định dạng khoảng thời gian tương đối ("5 phút trước", "2 giờ trước", ...)
 */
export const timeAgo = (dateStr?: string | Date | null): string => {
  if (!dateStr) return 'Vừa xong';
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();

    if (diffMs < 0) return 'Vừa xong';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days === 1) return 'Hôm qua';
    if (days < 7) return `${days} ngày trước`;
    return formatDate(d);
  } catch {
    return String(dateStr);
  }
};

export const formatRelativeTime = timeAgo;
export const formatRelativeTimeVi = timeAgo;
