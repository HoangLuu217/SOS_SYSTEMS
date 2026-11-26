import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  FileInput,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/kit/ui-patterns';
import {
  KIT_FONTS,
  KIT_THEME_PRESETS,
  findKitPreset,
  parseThemeCss,
  serializeThemeCss,
} from '@/kit/theme/presets';
import { useCustomizer, type KitFont } from '@/kit/customizer/CustomizerProvider';
import { useApp } from '@/context/AppContext';
import { toast } from '@/components/common/toast';
import { cn } from '@/lib/utils';

const RADIUS_OPTIONS = [
  { value: '0rem', label: '', icon: Ban, ariaLabel: 'Không bo góc' },
  { value: '0.375rem', label: 'SM' },
  { value: '0.625rem', label: 'MD' },
  { value: '0.875rem', label: 'LG' },
] as const;

function nearestRadius(radius: string): string {
  const rem = radius.endsWith('px') ? parseFloat(radius) / 16 : parseFloat(radius);
  return RADIUS_OPTIONS.reduce((best, option) =>
    Math.abs(parseFloat(option.value) - rem) < Math.abs(parseFloat(best.value) - rem)
      ? option
      : best
  ).value;
}

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span
      className="flex h-5 w-16 shrink-0 divide-x divide-white/60 overflow-hidden rounded-sm ring-1 ring-black/15 ring-inset dark:ring-white/20"
      aria-hidden
    >
      {colors.map((color, idx) => (
        <span key={idx} className="h-full flex-1" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * Exact Chronicle CustomizerPanel Popover (from kit/customizer/customizer-panel-body.tsx):
 * 9 OKLCH presets with 4-strip swatches, Font, Color Mode, Radius, Content Width,
 * Scale, Layout (Sidebar vs Top Bar), Sidebar Variant (Default/Inset/Floating),
 * Sidebar Collapse (Icons/Hidden), Language, plus Import CSS & Copy CSS.
 */
export function CustomizerPanel({
  showLayoutControls = true,
}: {
  showLayoutControls?: boolean;
}) {
  const { settings, panelOpen, setPanelOpen, updateSettings, resetSettings } = useCustomizer();
  const { theme, setTheme, lang, setLang } = useApp();

  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCss, setImportCss] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) {
      setPresetMenuOpen(false);
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPanelOpen(false);
        setImportOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen, setPanelOpen]);

  const activePreset = findKitPreset(settings.preset);

  const handleCopyCss = async () => {
    const cssText = serializeThemeCss(
      settings.custom?.light ?? activePreset.light,
      settings.custom?.dark ?? activePreset.dark,
      settings.radius
    );
    try {
      await navigator.clipboard.writeText(cssText);
      setCopied(true);
      toast.success('Đã sao chép biến CSS chủ đề vào bộ nhớ tạm.', 'Sao chép CSS');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.warning('Trình duyệt không cho phép sao chép tự động.');
    }
  };

  const handleApplyImport = () => {
    const parsed = parseThemeCss(importCss);
    if (!parsed) {
      setImportError('Không tìm thấy khối `:root { --token: value; }` hoặc `.dark { ... }` hợp lệ.');
      return;
    }
    const radius = parsed.light.radius;
    delete parsed.light.radius;
    updateSettings({ custom: parsed, ...(radius ? { radius } : {}) });
    setImportCss('');
    setImportError(null);
    setImportOpen(false);
    toast.success('Đã áp dụng bộ màu CSS tùy chỉnh cho toàn bộ hệ thống.', 'Nhập chủ đề thành công');
  };

  const handleReset = () => {
    resetSettings();
    setTheme('light');
    setLang('vi');
    toast.info('Đã khôi phục giao diện về chuẩn Chronicle mặc định.');
  };

  return (
    <>
      <div className="relative" ref={anchorRef}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Tùy biến giao diện"
          title="Tùy biến chủ đề & bố cục (Chronicle)"
          onClick={() => setPanelOpen(!panelOpen)}
          className={cn(panelOpen && 'bg-muted text-foreground')}
        >
          <Palette className="size-4" />
        </Button>

        {panelOpen && (
          <div
            role="dialog"
            aria-label="Tùy biến giao diện"
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(20.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-(--surface-shadow-raised)"
          >
            {/* Header matching kit/customizer/customizer-panel-body.tsx */}
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold leading-tight text-foreground">
                  Tùy biến giao diện
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Lưu tự động trên trình duyệt.
                </p>
              </div>
              <div className="-mr-1 -mt-0.5 flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Nhập CSS chủ đề (tweakcn / shadcn)"
                  aria-label="Nhập CSS chủ đề"
                  onClick={() => {
                    setPanelOpen(false);
                    setImportOpen(true);
                  }}
                >
                  <FileInput className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Sao chép CSS chủ đề"
                  aria-label="Sao chép CSS chủ đề"
                  onClick={handleCopyCss}
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Khôi phục mặc định"
                  aria-label="Khôi phục mặc định"
                  onClick={handleReset}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="max-h-[min(34rem,calc(100vh-8rem))] overflow-y-auto px-4 py-3.5">
              <div className="flex flex-col gap-3.5">
                {/* 1. Theme Preset Dropdown */}
                <Section label="Chủ đề màu">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPresetMenuOpen((v) => !v)}
                      className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        {settings.custom ? (
                          <span className="text-xs font-medium">Chủ đề CSS đã nhập</span>
                        ) : (
                          <>
                            <Swatches colors={activePreset.swatches} />
                            <span className="truncate text-xs font-medium">{activePreset.name}</span>
                          </>
                        )}
                      </span>
                      <span className="text-[11px] text-muted-foreground">▾</span>
                    </button>

                    {presetMenuOpen && (
                      <div className="mt-1.5 flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md">
                        {KIT_THEME_PRESETS.map((preset) => {
                          const selected = !settings.custom && settings.preset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                updateSettings({
                                  preset: preset.id,
                                  custom: null,
                                  radius: nearestRadius(preset.radius),
                                });
                                setPresetMenuOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                selected
                                  ? 'bg-accent font-semibold text-accent-foreground'
                                  : 'text-foreground hover:bg-muted'
                              )}
                            >
                              <span className="flex items-center gap-2.5 truncate">
                                <Swatches colors={preset.swatches} />
                                <span className="truncate">{preset.name}</span>
                              </span>
                              {selected && <Check className="size-3.5 shrink-0 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Section>

                {/* 2. Font Selector */}
                <Section label="Phông chữ">
                  <select
                    aria-label="Phông chữ"
                    value={settings.font}
                    onChange={(e) => updateSettings({ font: e.target.value as KitFont })}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  >
                    {KIT_FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Section>

                {/* 3. Color Mode */}
                <Section label="Chế độ">
                  <Segmented
                    aria-label="Chế độ màu"
                    value={theme}
                    onChange={(mode) => setTheme(mode)}
                    options={[
                      { value: 'light', label: 'Sáng', icon: Sun },
                      { value: 'dark', label: 'Tối', icon: Moon },
                    ]}
                  />
                </Section>

                {/* 4. Radius */}
                <Section label="Bo góc">
                  <Segmented
                    aria-label="Độ bo góc"
                    value={settings.radius}
                    onChange={(radius) => updateSettings({ radius })}
                    options={[...RADIUS_OPTIONS]}
                  />
                </Section>

                {/* 5. Content Width + Scale + Layout + Sidebar Variant (Dashboard) */}
                {showLayoutControls && (
                  <>
                    <Section label="Khung trang">
                      <Segmented
                        aria-label="Độ rộng nội dung"
                        value={settings.contentWidth}
                        onChange={(contentWidth) => updateSettings({ contentWidth })}
                        options={[
                          { value: 'contained', label: 'Gọn' },
                          { value: 'full', label: 'Rộng' },
                        ]}
                      />
                    </Section>

                    <Section label="Cỡ chữ">
                      <Segmented
                        aria-label="Tỷ lệ chữ"
                        value={settings.scale}
                        onChange={(scale) => updateSettings({ scale })}
                        options={[
                          { value: 'sm', label: 'SM' },
                          { value: 'md', label: 'MD' },
                          { value: 'lg', label: 'LG' },
                        ]}
                      />
                    </Section>

                    <Section label="Bố cục">
                      <Segmented
                        aria-label="Kiểu điều hướng"
                        value={settings.layout}
                        onChange={(layout) => updateSettings({ layout })}
                        options={[
                          { value: 'sidebar', label: 'Thanh bên' },
                          { value: 'top', label: 'Thanh trên' },
                        ]}
                      />
                    </Section>

                    {settings.layout === 'sidebar' && (
                      <>
                        <Section label="Kiểu Sidebar">
                          <Segmented
                            aria-label="Kiểu Sidebar"
                            value={settings.sidebarVariant}
                            onChange={(sidebarVariant) => updateSettings({ sidebarVariant })}
                            options={[
                              { value: 'sidebar', label: 'Mặc định' },
                              { value: 'inset', label: 'Inset' },
                              { value: 'floating', label: 'Floating' },
                            ]}
                          />
                        </Section>

                        <Section label="Thu gọn menu">
                          <Segmented
                            aria-label="Khi thu gọn Sidebar"
                            value={settings.sidebarCollapsible}
                            onChange={(sidebarCollapsible) =>
                              updateSettings({ sidebarCollapsible })
                            }
                            options={[
                              { value: 'icon', label: 'Biểu tượng' },
                              { value: 'offcanvas', label: 'Ẩn hẳn' },
                            ]}
                          />
                        </Section>
                      </>
                    )}
                  </>
                )}

                {/* Language */}
                <Section label="Ngôn ngữ">
                  <Segmented
                    aria-label="Ngôn ngữ"
                    value={lang}
                    onChange={(nextLang) => setLang(nextLang)}
                    options={[
                      { value: 'vi', label: 'Tiếng Việt' },
                      { value: 'en', label: 'English' },
                    ]}
                  />
                </Section>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import Theme CSS Dialog (ported from kit/customizer/customizer-panel-body.tsx) */}
      {importOpen && (
        <div
          className="fixed inset-0 z-[990] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setImportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nhập CSS chủ đề"
            className="w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Nhập CSS chủ đề (tweakcn / shadcn)</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dán đoạn CSS chứa khối <code>:root</code> và <code>.dark</code> để áp dụng tức thì.
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setImportOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            <textarea
              rows={9}
              value={importCss}
              onChange={(e) => {
                setImportCss(e.target.value);
                if (importError) setImportError(null);
              }}
              placeholder={`:root {\n  --primary: oklch(0.55 0.2 260);\n  --radius: 0.625rem;\n}\n\n.dark {\n  --primary: oklch(0.7 0.16 260);\n}`}
              className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            {importError && <p className="mt-1.5 text-xs text-destructive">{importError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                Hủy
              </Button>
              <Button disabled={!importCss.trim()} onClick={handleApplyImport}>
                Áp dụng chủ đề
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
