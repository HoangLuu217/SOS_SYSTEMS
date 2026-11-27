import React from 'react';
import {
  Ban,
  Check,
  LayoutTemplate,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Type,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  useCustomizer,
  type KitContentWidth,
  type KitFont,
  type KitLayout,
  type KitScale,
  type KitSidebarCollapsible,
  type KitSidebarVariant,
} from '@/kit/customizer/CustomizerProvider';
import { KIT_FONTS, KIT_THEME_PRESETS, findKitPreset } from '@/kit/theme/presets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Segmented } from '@/kit/ui-patterns';
import {
  FIT_HERO,
  SETTINGS_PAGE,
  SettingsCard,
  SettingsHero,
} from '@/kit/settings/SettingsPrimitives';
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

const PREVIEW_BARS = [
  { label: 'T2', height: 42 },
  { label: 'T3', height: 58 },
  { label: 'T4', height: 50 },
  { label: 'T5', height: 74 },
  { label: 'T6', height: 64 },
  { label: 'T7', height: 92 },
  { label: 'CN', height: 80 },
];

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="@container/row border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-col gap-2 @xl/row:flex-row @xl/row:items-center @xl/row:justify-between @xl/row:gap-6">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </div>
        <div className="w-full shrink-0 @xl/row:w-80">{children}</div>
      </div>
    </div>
  );
}

/** Live mini-preview mirroring shadcn-ref AppearanceSettingsPage `LivePreview` */
function LiveThemePreview() {
  return (
    <div className="flex flex-col gap-2" aria-label="Xem trước giao diện">
      <span className="text-sm text-muted-foreground">Xem trước trực tiếp</span>
      <div className="flex overflow-hidden rounded-xl bg-page shadow-(--surface-shadow) ring-1 ring-foreground/5">
        <div
          className="hidden w-24 shrink-0 flex-col gap-1.5 border-e border-sidebar-border bg-sidebar p-2.5 sm:flex"
          aria-hidden
        >
          <span className="mb-1 h-2 w-12 rounded-full bg-sidebar-foreground/30" />
          <span className="flex h-6 items-center rounded-md bg-sidebar-accent px-2">
            <span className="h-1.5 w-10 rounded-full bg-sidebar-primary" />
          </span>
          {[56, 44, 52, 36].map((width, index) => (
            <span key={index} className="flex h-5 items-center px-2">
              <span
                className="h-1.5 rounded-full bg-sidebar-foreground/20"
                style={{ width }}
              />
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3">
          <div className="flex flex-col gap-3 rounded-lg bg-card p-3 shadow-(--surface-shadow) ring-1 ring-foreground/5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Ca SOS tuần này</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                    140
                  </span>
                  <span className="text-xs font-medium text-success">+12,4%</span>
                </span>
              </div>
              <Badge variant="secondary">7 ngày</Badge>
            </div>
            <div className="flex h-16 items-end gap-1.5 pt-1" aria-hidden>
              {PREVIEW_BARS.map((bar, idx) => (
                <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={cn(
                      'w-full max-w-4 rounded-full transition-colors',
                      idx === PREVIEW_BARS.length - 1 ? 'bg-primary' : 'bg-muted-foreground/25'
                    )}
                    style={{ height: `${Math.round((bar.height / 100) * 44)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">Chính</Button>
            <Button size="xs" variant="outline">
              Phụ
            </Button>
            <Switch defaultChecked size="sm" aria-label="Xem trước công tắc" className="ms-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const AppearanceSectionTab: React.FC = () => {
  const { theme, setTheme } = useApp();
  const { settings, updateSettings, resetSettings } = useCustomizer();
  const currentPreset = settings.custom ? null : findKitPreset(settings.preset);
  const currentFontLabel =
    KIT_FONTS.find((f) => f.id === settings.font)?.label ?? KIT_FONTS[0].label;

  return (
    <div className={SETTINGS_PAGE}>
      <SettingsHero aside={<LiveThemePreview />} className={FIT_HERO}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Giao diện hiện tại</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-me-2 text-muted-foreground"
            onClick={() => {
              resetSettings();
              setTheme('light');
              toast.success('Đã khôi phục giao diện mặc định.');
            }}
          >
            <RotateCcw className="size-3.5" />
            Đặt lại
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {currentPreset?.name ?? 'Chủ đề tùy chỉnh'}
          </span>
          <span className="text-sm text-muted-foreground">
            {theme === 'dark' ? 'Chế độ tối' : 'Chế độ sáng'} · {currentFontLabel} ·{' '}
            {settings.layout === 'top' ? 'Thanh trên' : 'Thanh bên'}
          </span>
        </div>

        {currentPreset && (
          <div
            className="flex h-8 overflow-hidden rounded-lg ring-1 ring-foreground/10"
            aria-hidden
          >
            {currentPreset.swatches.map((color, index) => (
              <span key={index} className="flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>
        )}

        <p className="mt-auto text-sm text-muted-foreground">
          Đồng bộ trực tiếp với bảng tùy biến trên thanh công cụ và tự động lưu trên trình duyệt.
        </p>
      </SettingsHero>

      <SettingsCard
        icon={Palette}
        title="Chủ đề màu sắc"
        description="Áp dụng đồng bộ màu bề mặt, điểm nhấn và bo góc trên toàn hệ thống."
      >
        <div className="@container/presets flex flex-col gap-5">
          <div
            className="grid gap-2 @sm/presets:grid-cols-2 @xl/presets:grid-cols-4"
            role="radiogroup"
            aria-label="Bảng màu chủ đề"
          >
            {KIT_THEME_PRESETS.map((preset) => {
              const selected = !settings.custom && preset.id === settings.preset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    updateSettings({
                      preset: preset.id,
                      custom: null,
                      radius: nearestRadius(preset.radius),
                    })
                  }
                  className={cn(
                    'group/preset relative flex flex-col items-stretch gap-2 rounded-xl bg-muted/40 p-2.5 text-start ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected && 'bg-card shadow-(--surface-shadow) ring-2 ring-primary hover:bg-card'
                  )}
                >
                  <span
                    className="flex h-8 w-full overflow-hidden rounded-md ring-1 ring-foreground/10"
                    aria-hidden
                  >
                    {preset.swatches.map((color, index) => (
                      <span key={index} className="flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-foreground">
                      {preset.name}
                    </span>
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150',
                        selected ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col border-t border-border pt-4">
            <SettingRow label="Chế độ màu" description="Chuyển đổi nhanh giữa nền sáng và tối.">
              <Segmented<'light' | 'dark'>
                aria-label="Chế độ màu"
                value={theme}
                onChange={(next) => setTheme(next)}
                options={[
                  { value: 'light', label: 'Sáng', icon: Sun },
                  { value: 'dark', label: 'Tối', icon: Moon },
                ]}
              />
            </SettingRow>

            <SettingRow label="Bo góc" description="Áp dụng cho thẻ, nút bấm và ô nhập liệu.">
              <Segmented<string>
                aria-label="Bo góc"
                value={settings.radius}
                onChange={(radius) => updateSettings({ radius })}
                options={RADIUS_OPTIONS}
              />
            </SettingRow>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={Type}
        tone="two"
        title="Văn bản"
        description="Phông chữ hiển thị và tỷ lệ kích thước giao diện."
      >
        <div className="flex flex-col">
          <SettingRow label="Phông chữ" description="Các chỉ số luôn hiển thị bằng phông monospace.">
            <select
              aria-label="Phông chữ"
              value={settings.font}
              onChange={(e) => updateSettings({ font: e.target.value as KitFont })}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              {KIT_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow label="Tỷ lệ hiển thị" description="Nhỏ gọn hơn trên laptop; lớn dễ đọc hơn.">
            <Segmented<KitScale>
              aria-label="Tỷ lệ hiển thị"
              value={settings.scale}
              onChange={(scale) => updateSettings({ scale })}
              options={[
                { value: 'sm', label: 'Nhỏ' },
                { value: 'md', label: 'Vừa' },
                { value: 'lg', label: 'Lớn' },
              ]}
            />
          </SettingRow>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={LayoutTemplate}
        tone="three"
        title="Bố cục"
        description="Vị trí thanh điều hướng và độ rộng vùng nội dung."
      >
        <div className="flex flex-col">
          <SettingRow label="Thanh điều hướng">
            <Segmented<KitLayout>
              aria-label="Thanh điều hướng"
              value={settings.layout}
              onChange={(layout) => updateSettings({ layout })}
              options={[
                { value: 'sidebar', label: 'Thanh bên' },
                { value: 'top', label: 'Thanh trên' },
              ]}
            />
          </SettingRow>

          {settings.layout === 'sidebar' && (
            <>
              <SettingRow label="Kiểu thanh bên">
                <Segmented<KitSidebarVariant>
                  aria-label="Kiểu thanh bên"
                  value={settings.sidebarVariant}
                  onChange={(sidebarVariant) => updateSettings({ sidebarVariant })}
                  options={[
                    { value: 'sidebar', label: 'Mặc định' },
                    { value: 'inset', label: 'Inset' },
                    { value: 'floating', label: 'Nổi' },
                  ]}
                />
              </SettingRow>

              <SettingRow
                label="Khi thu gọn thanh bên"
                description="Hiển thị dải biểu tượng hay ẩn hoàn toàn."
              >
                <Segmented<KitSidebarCollapsible>
                  aria-label="Khi thu gọn thanh bên"
                  value={settings.sidebarCollapsible}
                  onChange={(sidebarCollapsible) => updateSettings({ sidebarCollapsible })}
                  options={[
                    { value: 'icon', label: 'Biểu tượng' },
                    { value: 'offcanvas', label: 'Ẩn hẳn' },
                  ]}
                />
              </SettingRow>
            </>
          )}

          <SettingRow
            label="Chiều rộng nội dung"
            description="Gọn giữa cân đối trên màn hình lớn."
          >
            <Segmented<KitContentWidth>
              aria-label="Chiều rộng nội dung"
              value={settings.contentWidth}
              onChange={(contentWidth) => updateSettings({ contentWidth })}
              options={[
                { value: 'contained', label: 'Gọn giữa' },
                { value: 'full', label: 'Toàn màn hình' },
              ]}
            />
          </SettingRow>
        </div>
      </SettingsCard>
    </div>
  );
};
