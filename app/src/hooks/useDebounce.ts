import { useState, useEffect } from 'react';

/**
 * Hook trì hoãn giá trị đầu vào (Debounce) hữu ích khi tìm kiếm / lọc dữ liệu
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
