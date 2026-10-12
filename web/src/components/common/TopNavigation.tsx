import {
  ShieldAlert,
  Map,
  Radio,
  RotateCcw,
  LogOut,
  Sun,
  Moon,
  Layers,
} from 'lucide-react';
import type { AuthorityOfficer } from '../../types/domainD';
import { useApp } from '../../context/AppContext';

interface Props {
  activeScreen: 'territorial' | 'dispatch';
  onChangeScreen: (screen: 'territorial' | 'dispatch') => void;
  onResetData: () => void;
  onSwitchToLogin?: () => void;
  urgentSosCount: number;
  activeOfficer: AuthorityOfficer;
  officers: AuthorityOfficer[];
  onSwitchOfficer: (officerId: string) => void;
}

export const TopNavigation = ({
  activeScreen,
  onChangeScreen,
  onResetData,
  onSwitchToLogin,
  urgentSosCount,
  activeOfficer,
}: Props) => {
  const { lang, setLang, theme, setTheme, mapMode, setMapMode, t } = useApp();
  // Compute initials
  const initials = activeOfficer.fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <header className="sos-top-nav">
      {/* Left: RescueSOS / Operations Console */}
      <div className="sos-nav-left">
        <div className="sos-brand-logo">
          <ShieldAlert size={19} />
        </div>
        <div className="sos-brand-text">
          <span className="sos-brand-title">{t('nav.brandTitle')}</span>
          <span className="sos-brand-subtitle">{t('nav.brandSubtitle')}</span>
        </div>
      </div>

      {/* Center: Segmented Mode Switcher */}
      <div className="sos-nav-center">
        <div className="sos-segmented-control" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === 'territorial'}
            className={`sos-segment-btn ${activeScreen === 'territorial' ? 'active' : ''}`}
            onClick={() => onChangeScreen('territorial')}
          >
            <Map size={14} />
            {t('nav.territorial')}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeScreen === 'dispatch'}
            className={`sos-segment-btn ${activeScreen === 'dispatch' ? 'active' : ''}`}
            onClick={() => onChangeScreen('dispatch')}
          >
            <Radio size={14} />
            {t('nav.dispatch')}
            {urgentSosCount > 0 && (
              <span className="sos-segment-badge">
                {urgentSosCount} {t('nav.urgent')}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Right: Language, Theme, Status, Officer Switcher */}
      <div className="sos-nav-right">
        {/* 1. Language Switcher (Tiếng Việt <-> English) */}
        <div className="nav-toggle-group" title={lang === 'vi' ? 'Chuyển đổi ngôn ngữ' : 'Switch language'}>
          <button
            type="button"
            className={`nav-toggle-btn ${lang === 'vi' ? 'active' : ''}`}
            onClick={() => setLang('vi')}
          >
            🇻🇳 VI
          </button>
          <button
            type="button"
            className={`nav-toggle-btn ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en')}
          >
            🇬🇧 EN
          </button>
        </div>

        {/* 2. Map Mode Switcher (Đường phố vs Vệ tinh) */}
        <div className="nav-toggle-group" title="Chế độ bản đồ (Đường phố / Vệ tinh)">
          <button
            type="button"
            className={`nav-toggle-btn ${mapMode === 'street' ? 'active' : ''}`}
            onClick={() => setMapMode('street')}
            title="Bản đồ đường phố"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Map size={12} />
            <span>Đường phố</span>
          </button>
          <button
            type="button"
            className={`nav-toggle-btn ${mapMode === 'satellite' ? 'active' : ''}`}
            onClick={() => setMapMode('satellite')}
            title="Bản đồ vệ tinh"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Layers size={12} />
            <span>Vệ tinh</span>
          </button>
        </div>

        {/* 3. Theme Switcher (Sáng <-> Tối) */}
        <div className="nav-toggle-group" title={theme === 'dark' ? 'Chế độ Tối (Dark mode)' : 'Chế độ Sáng (Light mode)'}>
          <button
            type="button"
            className={`nav-toggle-btn ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
            title={lang === 'vi' ? 'Giao diện Sáng' : 'Light Mode'}
          >
            <Sun size={12} />
            <span>{t('nav.light')}</span>
          </button>
          <button
            type="button"
            className={`nav-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
            title={lang === 'vi' ? 'Giao diện Tối' : 'Dark Mode'}
          >
            <Moon size={12} />
            <span>{t('nav.dark')}</span>
          </button>
        </div>

        {/* Reset Mock Data trigger for demonstration */}
        <button
          type="button"
          onClick={onResetData}
          title={lang === 'vi' ? 'Đặt lại toàn bộ dữ liệu mẫu' : 'Reset demonstration data'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--sos-text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            fontSize: 11,
            gap: 4,
          }}
        >
          <RotateCcw size={13} />
          {t('nav.resetDemo')}
        </button>

        {/* System Online Badge */}
        <div className="sos-system-status">
          <span className="sos-status-dot" />
          <span>{t('nav.systemOnline')}</span>
        </div>

        {/* Officer Profile & Jurisdiction Switcher */}
        <div className="sos-officer-dropdown-container">
          <button
            type="button"
            className={`nav-user-profile-btn ${activeOfficer.role === 'ADMIN' ? 'is-admin-officer' : 'is-ward-officer'}`}
          >
            <div className={`nav-user-avatar ${activeOfficer.role === 'ADMIN' ? 'authority-admin' : 'authority-active'}`}>
              {activeOfficer.role === 'ADMIN' ? '⭐' : initials}
            </div>
            <div className="nav-user-info">
              <span className="nav-user-name">{activeOfficer.fullName}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  className="nav-user-role-badge"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: activeOfficer.role === 'ADMIN' ? '#fef3c7' : '#fee2e2',
                    color: activeOfficer.role === 'ADMIN' ? '#b45309' : '#dc2626',
                    border: `1px solid ${activeOfficer.role === 'ADMIN' ? '#fde68a' : '#fecaca'}`,
                  }}
                >
                  {activeOfficer.role === 'ADMIN' ? '👑 TỔNG CHỈ HUY TP' : `🛡️ ${activeOfficer.jurisdictionAreaName}`}
                </span>
              </div>
            </div>
                      </button>

        </div>

        {onSwitchToLogin && (
          <button
            type="button"
            onClick={onSwitchToLogin}
            title={lang === 'vi' ? 'Đăng xuất / Quay về trang Login' : 'Log out'}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--sos-text-muted)',
              cursor: 'pointer',
              marginLeft: 2,
              padding: 4,
            }}
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </header>
  );
};
