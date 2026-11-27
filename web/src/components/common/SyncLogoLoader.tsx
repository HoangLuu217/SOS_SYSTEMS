import React from 'react';
import { cn } from '@/lib/utils';

export type SyncLogoLoaderSize = 'sm' | 'md' | 'lg';

export interface SyncLogoLoaderProps {
  size?: SyncLogoLoaderSize;
  message?: string;
  logoSrc?: string;
  fullScreen?: boolean;
  className?: string;
}

/**
 * Branded 3-layer pulsing & radiating logo loader (/logoSOS.png).
 * Used for initial app boot / page reload splash and page/table loading states.
 */
export const SyncLogoLoader: React.FC<SyncLogoLoaderProps> = ({
  size = 'md',
  message,
  logoSrc = '/logoSOS.png',
  fullScreen = false,
  className,
}) => {
  const content = (
    <div
      className={cn(
        'sync-loader',
        size === 'sm' && 'sync-loader--sm',
        size === 'md' && 'sync-loader--md',
        !fullScreen && className
      )}
      role="status"
      aria-live="polite"
      aria-label={message || 'Đang tải'}
    >
      <div className="logo-loader">
        <img src={logoSrc} alt="Logo" className="logo-layer layer-1" />
        <img src={logoSrc} alt="" aria-hidden="true" className="logo-layer layer-2" />
        <img src={logoSrc} alt="" aria-hidden="true" className="logo-layer layer-3" />
      </div>

      {message && <p className="sync-loader-message">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className={cn('sync-loader-fullscreen', className)}>{content}</div>;
  }

  return content;
};
