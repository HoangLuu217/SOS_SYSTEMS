/**
 * Kiểu dữ liệu phản hồi chuẩn từ Backend SOS SYSTEMS
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  urls?: string[];
  url?: string;
  error?: any;
}

export interface PaginatedQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
