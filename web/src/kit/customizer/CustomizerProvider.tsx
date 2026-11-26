import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  KIT_FONTS,
  KIT_THEME_PRESETS,
  findKitPreset,
  type TokenMap,
} from '@/kit/theme/presets';

export type KitFont = (typeof KIT_FONTS)[number]['id'];
export type KitScale = 'sm' | 'md' | 'lg';
export type KitContentWidth = 'full' | 'contained';
export type KitSidebarVariant = 'sidebar' | 'floating' | 'inset';
export type KitSidebarCollapsible = 'offcanvas' | 'icon';
export type KitLayout = 'sidebar' | 'top';
export type KitDirection = 'ltr' | 'rtl';

export interface CustomizerSettings {
  preset: string;
  custom: { light: TokenMap; dark: TokenMap } | null;
  radius: string;
  font: KitFont;
  scale: KitScale;
  contentWidth: KitContentWidth;
  sidebarVariant: KitSidebarVariant;
  sidebarCollapsible: KitSidebarCollapsible;
  layout: KitLayout;
  direction: KitDirection;
}

export const DEFAULT_CUSTOMIZER_SETTINGS: CustomizerSettings = {
  preset: 'default',
  custom: null,
  radius: '0.625rem',
  font: 'hanken',
  scale: 'md',
  contentWidth: 'full',
  sidebarVariant: 'inset',
  sidebarCollapsible: 'icon',
  layout: 'sidebar',
  direction: 'ltr',
};

const STORAGE_KEY = 'kit-customizer';
const SCALE_SIZES: Record<KitScale, string> = { sm: '15px', md: '16px', lg: '17px' };

function loadSavedSettings(): CustomizerSettings {
  if (typeof window === 'undefined') return DEFAULT_CUSTOMIZER_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOMIZER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<CustomizerSettings>;
    return {
      ...DEFAULT_CUSTOMIZER_SETTINGS,
      ...parsed,
      preset: KIT_THEME_PRESETS.some((p) => p.id === parsed.preset)
        ? (parsed.preset as string)
        : 'default',
      font: KIT_FONTS.some((f) => f.id === parsed.font) ? (parsed.font as KitFont) : 'hanken',
    };
  } catch {
    return DEFAULT_CUSTOMIZER_SETTINGS;
  }
}

export function buildKitThemeCss(settings: CustomizerSettings): string {
  const preset = findKitPreset(settings.preset);
  const light = settings.custom ? settings.custom.light : preset.light;
  const dark = settings.custom ? settings.custom.dark : preset.dark;
  const fontVar =
    KIT_FONTS.find((f) => f.id === settings.font)?.variable ?? KIT_FONTS[0].variable;

  const lines = (tokens: TokenMap) =>
    Object.entries(tokens)
      .map(([name, value]) => `--${name}:${value};`)
      .join('');

  const primaryHoverLight = light.primary
    ? `--primary-hover:color-mix(in oklch, ${light.primary} 86%, black);`
    : '';
  const primaryHoverDark = dark.primary
    ? `--primary-hover:color-mix(in oklch, ${dark.primary} 88%, white);`
    : '';

  return (
    `html:root{--radius:${settings.radius};--font-sans:${fontVar};font-size:${SCALE_SIZES[settings.scale] || '16px'};${lines(light)}${primaryHoverLight}}` +
    `html:root.dark,html[data-theme="dark"]{${lines(dark)}${primaryHoverDark}}`
  );
}

interface CustomizerContextValue {
  settings: CustomizerSettings;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  updateSettings: (patch: Partial<CustomizerSettings>) => void;
  resetSettings: () => void;
}

const CustomizerContext = createContext<CustomizerContextValue | null>(null);

export function CustomizerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CustomizerSettings>(() => loadSavedSettings());
  const [panelOpen, setPanelOpen] = useState(false);

  const css = useMemo(() => buildKitThemeCss(settings), [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota issues
    }
  }, [settings]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dir = settings.direction;

    let styleEl = document.getElementById('kit-customizer') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'kit-customizer';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }, [css, settings.direction]);

  const updateSettings = (patch: Partial<CustomizerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_CUSTOMIZER_SETTINGS);
  };

  return (
    <CustomizerContext.Provider
      value={{ settings, panelOpen, setPanelOpen, updateSettings, resetSettings }}
    >
      {children}
    </CustomizerContext.Provider>
  );
}

export function useCustomizer(): CustomizerContextValue {
  const ctx = useContext(CustomizerContext);
  if (!ctx) {
    throw new Error('useCustomizer must be used inside CustomizerProvider.');
  }
  return ctx;
}
