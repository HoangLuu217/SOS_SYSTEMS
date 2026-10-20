export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  createdAt: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

let listeners: ToastListener[] = [];
let memoryToasts: ToastMessage[] = [];

const notify = () => {
  listeners.forEach((listener) => listener([...memoryToasts]));
};

export const toast = {
  show: (message: string, type: ToastType = 'info', title?: string, duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      duration,
      createdAt: Date.now(),
    };
    memoryToasts = [...memoryToasts, newToast];
    notify();

    if (duration > 0) {
      setTimeout(() => {
        toast.dismiss(id);
      }, duration);
    }
    return id;
  },

  success: (message: string, title: string = 'Thành công', duration = 3500) => {
    return toast.show(message, 'success', title, duration);
  },

  error: (message: string, title: string = 'Đã có lỗi xảy ra', duration = 4000) => {
    return toast.show(message, 'error', title, duration);
  },

  warning: (message: string, title: string = 'Cảnh báo', duration = 3500) => {
    return toast.show(message, 'warning', title, duration);
  },

  info: (message: string, title: string = 'Thông tin', duration = 3500) => {
    return toast.show(message, 'info', title, duration);
  },

  dismiss: (id: string) => {
    memoryToasts = memoryToasts.filter((t) => t.id !== id);
    notify();
  },

  clearAll: () => {
    memoryToasts = [];
    notify();
  },

  subscribe: (listener: ToastListener) => {
    listeners.push(listener);
    listener([...memoryToasts]);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};
