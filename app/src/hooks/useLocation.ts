import { useState, useCallback, useEffect } from 'react';
import * as Location from 'expo-location';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface UseLocationOptions {
  autoFetch?: boolean;
  reverseGeocode?: boolean;
  accuracy?: Location.Accuracy;
}

// Tọa độ trung tâm mặc định (Đà Nẵng - Trung tâm cứu hộ miền Trung)
export const DEFAULT_FALLBACK_COORDS: LocationCoords = {
  latitude: 16.0544,
  longitude: 108.2022,
};

/**
 * Hook quản lý quyền và lấy vị trí GPS thiết bị an toàn
 */
export const useLocation = (options: UseLocationOptions = {}) => {
  const {
    autoFetch = false,
    reverseGeocode = false,
    accuracy = Location.Accuracy.Balanced,
  } = options;

  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [address, setAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      return granted;
    } catch (err: any) {
      setError(err.message || 'Lỗi kiểm tra quyền vị trí');
      setPermissionGranted(false);
      return false;
    }
  }, []);

  const getAddressFromCoords = useCallback(async (latitude: number, longitude: number): Promise<string> => {
    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo) {
        const parts = [
          geo.streetNumber,
          geo.street,
          geo.subregion,
          geo.district,
          geo.city || geo.region,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
    } catch {
      // Bỏ qua lỗi reverse geocode
    }
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }, []);

  const getCurrentLocation = useCallback(async (shouldGeocode = reverseGeocode): Promise<{ coords: LocationCoords; address: string } | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const hasPerm = await requestPermission();
      if (!hasPerm) {
        setError('Chưa cấp quyền truy cập vị trí');
        setCoords(DEFAULT_FALLBACK_COORDS);
        setIsLoading(false);
        return null;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy });
      const currentCoords: LocationCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCoords(currentCoords);

      let resolvedAddr = '';
      if (shouldGeocode) {
        resolvedAddr = await getAddressFromCoords(currentCoords.latitude, currentCoords.longitude);
        setAddress(resolvedAddr);
      }

      setIsLoading(false);
      return { coords: currentCoords, address: resolvedAddr };
    } catch (err: any) {
      setError(err.message || 'Không thể lấy tọa độ GPS');
      setCoords(DEFAULT_FALLBACK_COORDS);
      setIsLoading(false);
      return null;
    }
  }, [accuracy, reverseGeocode, requestPermission, getAddressFromCoords]);

  useEffect(() => {
    if (autoFetch) {
      getCurrentLocation();
    }
  }, [autoFetch, getCurrentLocation]);

  return {
    coords: coords || DEFAULT_FALLBACK_COORDS,
    rawCoords: coords,
    address,
    isLoading,
    error,
    permissionGranted,
    requestPermission,
    getCurrentLocation,
    setCoords,
    setAddress,
  };
};
