import React from 'react';
import { Sidebar, type NavItemKey } from './Sidebar';
import { MapPin } from 'lucide-react';
import { AuthorPortal, AdminPortal } from '@/features/map-operation';
import { NAV_TITLES } from '@/constants/navConfig';
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
          overflow: 'hidden',
          height: '100vh',
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
              {isAuthority && userAreaName && (
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
                  title="Địa bàn bạn đang phụ trách quản lý"
                >
                  <MapPin size={14} style={{ color: '#2563eb' }} />
                  <span>Khu vực: {userAreaName}</span>
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
                overflow: 'hidden',
                padding: '12px 18px 14px',
              }}
            >
              <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                {children}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
