import React from 'react';
import { Sidebar, type NavItemKey } from './Sidebar';
import { MapPin, Globe } from 'lucide-react';
import { AuthorPortal, AdminPortal } from '@/features/map-operation';
import { NAV_TITLES } from '@/constants/navConfig';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import type { User } from '@/types/auth';

export interface DashboardLayoutProps {
  user: User;
  activeNavKey: NavItemKey;
  sidebarCollapsed: boolean;
  onSelectNavKey: (key: NavItemKey, subPath?: string) => void;
  onToggleSidebarCollapse: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  user,
  activeNavKey,
  sidebarCollapsed,
  onSelectNavKey,
  onToggleSidebarCollapse,
  onLogout,
  children,
}) => {
  const currentMeta = NAV_TITLES[activeNavKey] || NAV_TITLES.map;
  const isAuthority =
    (Boolean(user.authority) ||
      Boolean(user.roles?.includes('LOCAL_AUTHORITY')) ||
      Boolean(user.roles?.includes('AUTHORITY'))) &&
    !user.roles?.includes('ADMIN');

  const userAreaName =
    user.authority?.areaName ||
    (user.authority as any)?.jurisdictionAreaName ||
    '';

  return (
    <div className="sos-dashboard-container">
      {/* 1. THANH SIDEBAR BÊN TRÁI PHÂN BIỆT THEO ROLE */}
      <Sidebar
        user={user}
        activeKey={activeNavKey}
        onSelectKey={onSelectNavKey}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebarCollapse}
      />

      {/* 2. KHÔNG GIAN NỘI DUNG CHÍNH (MAIN DASHBOARD CONTENT) */}
      <main
        className="sos-main-content"
        style={{
          overflow:
            activeNavKey === 'map' ||
            activeNavKey === 'coordination' ||
            activeNavKey === 'hazard_reports' ||
            activeNavKey === 'shelters' ||
            activeNavKey === 'notifications' ||
            activeNavKey === 'alerts'
              ? 'hidden'
              : 'auto',
          height: '100vh',
          maxHeight: '100vh',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {activeNavKey === 'map' ? (
          /* Cán bộ địa phương dùng AuthorPortal (Khóa khu vực), Admin dùng AdminPortal (Toàn TP Đà Nẵng) */
          isAuthority ? (
            <AuthorPortal
              user={user}
              embedded={true}
              onLogout={onLogout}
            />
          ) : (
            <AdminPortal
              embedded={true}
              onLogout={onLogout}
            />
          )
        ) : (
          /* Các màn hình quản trị nghiệp vụ khác */
          <>
            <header className="sos-main-header">
              <div className="sos-page-title-wrap">
                <div>
                  <h1 className="sos-page-title">{currentMeta.title}</h1>
                  {currentMeta.desc && <p className="sos-page-desc">{currentMeta.desc}</p>}
                </div>
              </div>

              {/* Huy hiệu khu vực địa bàn phụ trách ở góc phải header */}
              {isAuthority ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1d4ed8',
                    boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)',
                  }}
                  title="Địa bàn bạn đang phụ trách quản lý cứu hộ"
                >
                  <MapPin size={14} style={{ color: '#2563eb' }} />
                  <span>
                    Khu vực:{' '}
                    {userAreaName
                      ? userAreaName.includes('Đà Nẵng') || userAreaName.includes('Hà Nội') || userAreaName.includes('Hồ Chí Minh')
                        ? userAreaName
                        : `${userAreaName}, Thành phố Đà Nẵng`
                      : 'Xã Xuân Phú, Thành phố Đà Nẵng'}
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    borderRadius: 8,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0369a1',
                    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.05)',
                  }}
                  title="Quyền Quản trị viên hệ thống - Giám sát & Điều phối tác chiến cứu hộ Toàn quốc"
                >
                  <Globe size={14} style={{ color: '#0284c7' }} />
                  <span>Phạm vi: Toàn quốc (Toàn hệ thống)</span>
                </div>
              )}
            </header>

            <div
              className="sos-page-body"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow:
                  activeNavKey === 'hazard_reports' ||
                  activeNavKey === 'shelters' ||
                  activeNavKey === 'notifications' ||
                  activeNavKey === 'alerts'
                    ? 'hidden'
                    : 'auto',
                padding:
                  activeNavKey === 'hazard_reports' ||
                  activeNavKey === 'shelters' ||
                  activeNavKey === 'notifications' ||
                  activeNavKey === 'alerts'
                    ? '14px 20px 16px'
                    : '12px 18px 14px',
              }}
            >
              <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <ErrorBoundary fallbackTitle={`Đã xảy ra sự cố khi tải dữ liệu ${currentMeta.title}`}>
                  {children}
                </ErrorBoundary>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
