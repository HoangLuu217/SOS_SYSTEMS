import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { toast, type ToastMessage } from './toast';
import './Toast.css';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((newToasts) => {
      setToasts(newToasts);
    });
    return () => unsubscribe();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="sos-toast-container" aria-live="polite">
      {toasts.map((t) => {
        const renderIcon = () => {
          switch (t.type) {
            case 'success':
              return <CheckCircle2 size={18} strokeWidth={2.5} />;
            case 'error':
              return <AlertCircle size={18} strokeWidth={2.5} />;
            case 'warning':
              return <AlertTriangle size={18} strokeWidth={2.5} />;
            case 'info':
            default:
              return <Info size={18} strokeWidth={2.5} />;
          }
        };

        const defaultTitle =
          t.title ||
          (t.type === 'success'
            ? 'Thành công'
            : t.type === 'error'
            ? 'Lỗi'
            : t.type === 'warning'
            ? 'Cảnh báo'
            : 'Thông báo');

        return (
          <div
            key={t.id}
            className={`sos-toast-card ${t.type}`}
            onClick={() => toast.dismiss(t.id)}
            role="alert"
          >
            <div className="sos-toast-icon-wrap">{renderIcon()}</div>
            <div className="sos-toast-content">
              <h5 className="sos-toast-title">{defaultTitle}</h5>
              <p className="sos-toast-message">{t.message}</p>
            </div>
            <button
              type="button"
              className="sos-toast-close"
              onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(t.id);
              }}
              title="Đóng thông báo"
            >
              <X size={15} />
            </button>
            {t.duration && t.duration > 0 && (
              <div
                className="sos-toast-progress-bar"
                style={{ animationDuration: `${t.duration}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
