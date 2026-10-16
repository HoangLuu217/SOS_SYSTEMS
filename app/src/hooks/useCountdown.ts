import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCountdownOptions {
  initialSeconds?: number;
  onComplete?: () => void;
  autoStart?: boolean;
}

/**
 * Hook quản lý đếm ngược (thường dùng cho OTP Cooldown, thời gian gửi lại mã)
 */
export const useCountdown = (options: UseCountdownOptions = {}) => {
  const { initialSeconds = 60, onComplete, autoStart = false } = options;
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(autoStart);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((newSeconds?: number) => {
    clearTimer();
    setSeconds(newSeconds ?? initialSeconds);
    setIsActive(true);
  }, [clearTimer, initialSeconds]);

  const stop = useCallback(() => {
    clearTimer();
    setIsActive(false);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setSeconds(initialSeconds);
    setIsActive(false);
  }, [clearTimer, initialSeconds]);

  useEffect(() => {
    if (!isActive) return;

    timerRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearTimer();
          setIsActive(false);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearTimer();
  }, [isActive, clearTimer, onComplete]);

  return {
    seconds,
    isActive,
    start,
    stop,
    reset,
  };
};
