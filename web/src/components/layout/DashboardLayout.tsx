import React from 'react';
import { Sidebar, type NavItemKey } from './Sidebar';
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
            (activeNavKey === 'map' && isAuthority) ||
            activeNavKey === 'hazard_reports' ||
            activeNavKey === 'shelters' ||
            activeNavKey === 'notifications' ||
            activeNavKey === 'alerts'
              ? 'hidden'
              : 'auto',
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
                {children}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
