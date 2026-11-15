import type React from 'react';

export interface PendingUploadImage {
  id: string;
  file: File;
  previewUrl: string;
}

/**
 * Giải phóng các Blob URL tạm thời khi đóng modal hoặc gửi thành công
 */
export function revokePendingImagePreviews(items: PendingUploadImage[]): void {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

/**
 * Lọc và thêm danh sách tệp ảnh người dùng vừa chọn vào state tạm thời
 */
export function appendPendingImageFiles(
  files: FileList | null,
  setter: React.Dispatch<React.SetStateAction<PendingUploadImage[]>>,
  onInvalidFile?: () => void
): void {
  if (!files || files.length === 0) return;

  const validFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
  if (validFiles.length < files.length && onInvalidFile) {
    onInvalidFile();
  }
  if (validFiles.length === 0) return;

  const nextItems: PendingUploadImage[] = validFiles.map((file, idx) => ({
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }));
  setter((prev) => [...prev, ...nextItems]);
}

/**
 * Xóa một ảnh đang chờ tải lên và thu hồi Blob URL tương ứng
 */
export function removePendingImageItem(
  id: string,
  setter: React.Dispatch<React.SetStateAction<PendingUploadImage[]>>
): void {
  setter((prev) => {
    const target = prev.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    return prev.filter((item) => item.id !== id);
  });
}

/**
 * Tải danh sách ảnh đang chờ lên máy chủ và trả về mảng URL
 */
export async function uploadPendingImageItems(
  items: PendingUploadImage[],
  uploader: (file: File) => Promise<{ success?: boolean; url?: string; data?: { url?: string } }>,
  errorMessage = 'Không thể tải lên đầy đủ hình ảnh'
): Promise<string[]> {
  if (items.length === 0) return [];
  const results = await Promise.all(items.map((item) => uploader(item.file)));
  const urls = results.map((res) => res?.url || res?.data?.url).filter(Boolean) as string[];
  if (urls.length !== items.length) {
    throw new Error(errorMessage);
  }
  return urls;
}
