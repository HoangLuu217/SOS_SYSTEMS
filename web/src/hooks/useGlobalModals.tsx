import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, Loader2 } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface ConfirmModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'primary' | 'danger' | 'warning';
  confirmText?: string;
  cancelText?: string;
  details?: { label: string; value: string }[];
  promptInput?: {
    label: string;
    defaultValue?: string;
    placeholder?: string;
  };
  onConfirm: (promptVal?: string) => void | Promise<void>;
}

export function useGlobalModals() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [confirmPromptValue, setConfirmPromptValue] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const renderGlobalModals = () => (
    <>
      {/* TOAST NOTIFICATIONS */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 100000,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            pointerEvents: 'none',
          }}
        >
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const isWarning = toast.type === 'warning';
            const bg = isSuccess ? '#064e3b' : isError ? '#7f1d1d' : isWarning ? '#78350f' : '#0f172a';
            const borderCol = isSuccess ? '#10b981' : isError ? '#ef4444' : isWarning ? '#f59e0b' : '#38bdf8';
            const iconColor = isSuccess ? '#34d399' : isError ? '#f87171' : isWarning ? '#fbbf24' : '#38bdf8';

            return (
              <div
                key={toast.id}
                style={{
                  pointerEvents: 'auto',
                  minWidth: '320px',
                  maxWidth: '440px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: bg,
                  color: '#ffffff',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
                  borderLeft: `5px solid ${borderCol}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isSuccess && <CheckCircle2 size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {isError && <AlertTriangle size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {isWarning && <AlertTriangle size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  {!isSuccess && !isError && !isWarning && <Info size={18} style={{ color: iconColor, flexShrink: 0 }} />}
                  <span style={{ lineHeight: 1.4 }}>{toast.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Đóng thông báo"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}
          onClick={() => !confirmLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {confirmModal.type === 'danger' ? (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </div>
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                    <CheckCircle2 size={18} />
                  </div>
                )}
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {confirmModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !confirmLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                {confirmModal.message}
              </p>

              {confirmModal.details && confirmModal.details.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {confirmModal.details.map((d, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', gap: '10px' }}>
                      <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{d.label}:</span>
                      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{d.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {confirmModal.promptInput && (
                <div style={{ marginTop: '4px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', marginBottom: '5px' }}>
                    {confirmModal.promptInput.label}
                  </label>
                  <textarea
                    rows={2}
                    value={confirmPromptValue}
                    onChange={(e) => setConfirmPromptValue(e.target.value)}
                    placeholder={confirmModal.promptInput.placeholder}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #f1f5f9',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                disabled={confirmLoading}
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="sos-btn-flat"
                style={{ padding: '7px 14px', fontSize: '12.5px' }}
              >
                {confirmModal.cancelText || 'Hủy bỏ'}
              </button>
              <button
                type="button"
                disabled={confirmLoading}
                onClick={async () => {
                  try {
                    setConfirmLoading(true);
                    await confirmModal.onConfirm(confirmPromptValue);
                    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  } catch (err: any) {
                    showToast(err.message || 'Thao tác không thành công', 'error');
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
                className={`sos-btn-flat ${confirmModal.type === 'danger' ? 'danger' : 'primary'}`}
                style={{
                  padding: '7px 18px',
                  fontSize: '12.5px',
                  background: confirmModal.type === 'danger' ? '#dc2626' : '#0284c7',
                  color: '#ffffff',
                  borderColor: confirmModal.type === 'danger' ? '#dc2626' : '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {confirmLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  confirmModal.confirmText || 'Xác nhận'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return {
    toasts,
    showToast,
    confirmModal,
    setConfirmModal,
    confirmPromptValue,
    setConfirmPromptValue,
    renderGlobalModals,
  };
}
