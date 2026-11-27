import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bell, Palette, ShieldCheck, User as UserIcon } from 'lucide-react';
import type { User } from '@/types/auth';
import { navigateTo, parseRoute } from '@/services/appRouter';
import { cn } from '@/lib/utils';
import { ProfileSectionTab } from './ProfileSectionTab';
import { AccountSectionTab } from './AccountSectionTab';
import { AppearanceSectionTab } from './AppearanceSectionTab';
import { NotificationsSectionTab } from './NotificationsSectionTab';

export type ProfileSectionKey = 'profile' | 'account' | 'appearance' | 'notifications';

interface ProfileNavGroup {
  label: string;
  items: {
    key: ProfileSectionKey;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}

const PROFILE_NAV_GROUPS: ProfileNavGroup[] = [
  {
    label: 'Cá nhân',
    items: [
      { key: 'profile', title: 'Hồ sơ', icon: UserIcon },
      { key: 'account', title: 'Tài khoản & Bảo mật', icon: ShieldCheck },
    ],
  },
  {
    label: 'Tùy chỉnh',
    items: [
      { key: 'appearance', title: 'Giao diện', icon: Palette },
      { key: 'notifications', title: 'Thông báo', icon: Bell },
    ],
  },
];

const VALID_SECTIONS = new Set<ProfileSectionKey>([
  'profile',
  'account',
  'appearance',
  'notifications',
]);

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function resolveSectionFromLocation(user?: User): ProfileSectionKey {
  if (typeof window === 'undefined') return 'profile';
  const parsed = parseRoute(window.location.pathname, window.location.hash, user ?? null);
  const sub = (parsed.subPath || '').split('/')[0]?.toLowerCase() as ProfileSectionKey;
  if (VALID_SECTIONS.has(sub)) return sub;
  return 'profile';
}

/** Measures the active link in the left settings rail so the card pill slides smoothly. */
function useActiveRect(
  navRef: React.RefObject<HTMLElement | null>,
  current: ProfileSectionKey
) {
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const node = navRef.current;
    if (!node || typeof window === 'undefined') return;

    const measure = () => {
      const link = node.querySelector<HTMLElement>('[aria-current="page"]');
      setRect(link ? { top: link.offsetTop, height: link.offsetHeight } : null);
    };

    measure();
    const frame = window.requestAnimationFrame(() => setReady(true));
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [navRef, current]);

  return { rect, ready };
}

export interface ProfileViewProps {
  user?: User;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onLogout }) => {
  const [activeSection, setActiveSection] = useState<ProfileSectionKey>(() =>
    resolveSectionFromLocation(user)
  );
  const navRef = useRef<HTMLElement>(null);
  const { rect, ready } = useActiveRect(navRef, activeSection);

  useEffect(() => {
    const onPopState = () => {
      setActiveSection(resolveSectionFromLocation(user));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  const handleSelectSection = (next: ProfileSectionKey) => {
    setActiveSection(next);
    navigateTo('profile', user ?? null, next === 'profile' ? undefined : next);
  };

  return (
    <div className="grid items-start gap-6 pb-8 lg:grid-cols-[13rem_1fr]">
      {/* Desktop Sticky Left Rail — exact mirror of shadcn-ref SettingsLayout */}
      <nav
        ref={navRef}
        aria-label="Mục cài đặt hồ sơ"
        className="relative hidden flex-col gap-5 lg:sticky lg:top-6 lg:flex"
      >
        {rect && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 rounded-lg bg-card shadow-(--surface-shadow) ring-1 ring-foreground/5',
              ready && 'transition-[translate,height] duration-200 ease-out'
            )}
            style={{ translate: `0 ${rect.top}px`, height: rect.height }}
          />
        )}

        {PROFILE_NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {group.label}
            </span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleSelectSection(item.key)}
                  className={cn(
                    'group/link relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                    !active && 'hover:bg-muted/60',
                    active && 'font-medium text-foreground'
                  )}
                >
                  <Icon
                    className={cn(
                      'size-4 shrink-0 transition-colors duration-150',
                      active && 'text-primary'
                    )}
                  />
                  <span className="truncate">{item.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Mobile Select Switcher */}
      <select
        aria-label="Chọn mục hồ sơ"
        value={activeSection}
        onChange={(e) => handleSelectSection(e.target.value as ProfileSectionKey)}
        className="flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 lg:hidden"
      >
        {PROFILE_NAV_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((item) => (
              <option key={item.key} value={item.key}>
                {item.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Active Section Content Column */}
      <div className="flex min-w-0 flex-col gap-4">
        {activeSection === 'profile' && <ProfileSectionTab user={user} />}
        {activeSection === 'account' && (
          <AccountSectionTab
            user={user}
            onLogout={onLogout}
            onGoToProfile={() => handleSelectSection('profile')}
          />
        )}
        {activeSection === 'appearance' && <AppearanceSectionTab />}
        {activeSection === 'notifications' && <NotificationsSectionTab />}
      </div>
    </div>
  );
};
