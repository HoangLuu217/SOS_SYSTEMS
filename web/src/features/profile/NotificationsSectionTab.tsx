import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CloudLightning,
  Moon,
  Siren,
  Smartphone,
  Volume2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/common/toast';
import {
  FIT_HERO,
  HeroFigure,
  HeroTitle,
  SETTINGS_PAGE,
  SaveBar,
  SettingsCard,
  SettingsHero,
  ToggleRow,
  type TileTone,
} from '@/kit/settings/SettingsPrimitives';
import { cn } from '@/lib/utils';

type ChannelId = 'inApp' | 'siren' | 'push';
type AlertKind =
  | 'newSos'
  | 'teamCancelled'
  | 'missionDone'
  | 'weatherAlert'
  | 'hazardPending'
  | 'rescuerApply';

interface NotificationPrefs {
  quietHours: boolean;
  channels: Record<ChannelId, Record<AlertKind, boolean>>;
}

const STORAGE_KEY = 'sos_profile_notification_prefs_v1';

const DEFAULT_PREFS: NotificationPrefs = {
  quietHours: false,
  channels: {
    inApp: {
      newSos: true,
      teamCancelled: true,
      missionDone: true,
      weatherAlert: true,
      hazardPending: true,
      rescuerApply: true,
    },
    siren: {
      newSos: true,
      teamCancelled: true,
      missionDone: false,
      weatherAlert: true,
      hazardPending: false,
      rescuerApply: false,
    },
    push: {
      newSos: true,
      teamCancelled: true,
      missionDone: false,
      weatherAlert: true,
      hazardPending: false,
      rescuerApply: false,
    },
  },
};

const CHANNELS: {
  id: ChannelId;
  label: string;
  short: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: TileTone;
}[] = [
  {
    id: 'inApp',
    label: 'Trong ứng dụng',
    short: 'Ứng dụng',
    description: 'Hiển thị chuông thông báo và hộp thoại góc màn hình.',
    icon: Bell,
    tone: 'lead',
  },
  {
    id: 'siren',
    label: 'Âm thanh cảnh báo',
    short: 'Còi báo',
    description: 'Phát âm thanh còi khi có ca SOS khẩn cấp hoặc lệnh bị hủy.',
    icon: Volume2,
    tone: 'danger',
  },
  {
    id: 'push',
    label: 'Thông báo trình duyệt',
    short: 'Đẩy',
    description: 'Thông báo nổi trên máy tính ngay cả khi mở tab khác.',
    icon: Smartphone,
    tone: 'two',
  },
];

const GROUPS: {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: TileTone;
  alerts: { id: AlertKind; label: string; description: string }[];
}[] = [
  {
    id: 'sos',
    title: 'SOS & Điều phối',
    description: 'Sự cố khẩn cấp cần phản ứng tức thì.',
    icon: Siren,
    tone: 'danger',
    alerts: [
      {
        id: 'newSos',
        label: 'Ca SOS mới trên địa bàn',
        description: 'Có tín hiệu cầu cứu mới cần xác minh và phân công đội.',
      },
      {
        id: 'teamCancelled',
        label: 'Đội cứu hộ hủy / từ chối lệnh',
        description: 'Cảnh báo ngay để điều phối đơn vị thay thế kịp thời.',
      },
      {
        id: 'missionDone',
        label: 'Hoàn thành nhiệm vụ cứu nạn',
        description: 'Xác nhận khi đội đã tiếp cận và đưa người dân đến nơi an toàn.',
      },
    ],
  },
  {
    id: 'community',
    title: 'Cộng đồng & Thiên tai',
    description: 'Cập nhật thời tiết, điểm nguy hiểm và lực lượng tình nguyện.',
    icon: CloudLightning,
    tone: 'info',
    alerts: [
      {
        id: 'weatherAlert',
        label: 'Bản tin bão lũ & thời tiết xấu',
        description: 'Cảnh báo thiên tai khẩn cấp tại khu vực TP. Đà Nẵng.',
      },
      {
        id: 'hazardPending',
        label: 'Điểm nguy hiểm mới chờ duyệt',
        description: 'Người dân báo cáo ngập sâu, sạt lở hoặc cây đổ.',
      },
      {
        id: 'rescuerApply',
        label: 'Hồ sơ cứu hộ viên mới',
        description: 'Tình nguyện viên nộp hồ sơ đăng ký tham gia đội cứu hộ.',
      },
    ],
  },
];

const ALL_KINDS: AlertKind[] = GROUPS.flatMap((g) => g.alerts.map((a) => a.id));

function loadSavedPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      quietHours: Boolean(parsed.quietHours),
      channels: {
        inApp: { ...DEFAULT_PREFS.channels.inApp, ...(parsed.channels?.inApp || {}) },
        siren: { ...DEFAULT_PREFS.channels.siren, ...(parsed.channels?.siren || {}) },
        push: { ...DEFAULT_PREFS.channels.push, ...(parsed.channels?.push || {}) },
      },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export const NotificationsSectionTab: React.FC = () => {
  const [saved, setSaved] = useState<NotificationPrefs>(() => loadSavedPrefs());
  const [draft, setDraft] = useState<NotificationPrefs>(() => loadSavedPrefs());
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const onCount = (channel: ChannelId) =>
    ALL_KINDS.filter((kind) => draft.channels[channel][kind]).length;

  const totalOn = CHANNELS.reduce((acc, ch) => acc + onCount(ch.id), 0);
  const activeChannelCount = CHANNELS.filter((ch) => onCount(ch.id) > 0).length;

  const setAlert = (channel: ChannelId, kind: AlertKind, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: { ...prev.channels[channel], [kind]: value },
      },
    }));
  };

  const setChannel = (channel: ChannelId, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: value
          ? { ...DEFAULT_PREFS.channels[channel] }
          : (Object.fromEntries(ALL_KINDS.map((k) => [k, false])) as Record<AlertKind, boolean>),
      },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      // Sync sirenSound & pushNotifications with sos_local_system_settings if present
      const rawSys = localStorage.getItem('sos_local_system_settings');
      if (rawSys) {
        try {
          const parsedSys = JSON.parse(rawSys);
          parsedSys.sirenSound = onCount('siren') > 0;
          parsedSys.pushNotifications = onCount('push') > 0;
          localStorage.setItem('sos_local_system_settings', JSON.stringify(parsedSys));
        } catch {
          // ignore
        }
      }
      setSaved(draft);
      toast.success('Đã lưu cài đặt thông báo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={SETTINGS_PAGE}>
      <SettingsHero
        className={FIT_HERO}
        aside={
          <div className="flex flex-col gap-4">
            {CHANNELS.map((channel) => {
              const count = onCount(channel.id);
              const Icon = channel.icon;
              return (
                <div key={channel.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <Icon className="size-4 text-muted-foreground" />
                      {channel.label}
                    </span>
                    <span className="font-mono text-foreground tabular-nums">
                      {count}
                      <span className="text-muted-foreground">/{ALL_KINDS.length}</span>
                    </span>
                  </div>
                  <div className="flex h-2 gap-1" aria-hidden>
                    {ALL_KINDS.map((kind) => (
                      <span
                        key={kind}
                        className={cn(
                          'flex-1 rounded-full transition-colors duration-200',
                          draft.channels[channel.id][kind] ? 'bg-primary' : 'bg-muted'
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        }
      >
        <HeroTitle
          icon={BellRing}
          label="Cảnh báo đang bật"
          title={
            totalOn === 0
              ? 'Đang tắt tất cả'
              : `${activeChannelCount} / ${CHANNELS.length} kênh hoạt động`
          }
        />
        <HeroFigure value={totalOn} unit={` / ${ALL_KINDS.length * CHANNELS.length}`} />
        <p className="text-sm text-muted-foreground">
          Ưu tiên giữ bật âm thanh còi và thông báo đẩy cho các sự cố SOS khẩn cấp.
        </p>
      </SettingsHero>

      <SettingsCard
        icon={Bell}
        title="Kênh nhận cảnh báo"
        description="Bật hoặc tắt nhanh từng kênh mà không làm mất cấu hình chi tiết bên dưới."
      >
        <div className="flex flex-col gap-2">
          {CHANNELS.map((channel) => (
            <ToggleRow
              key={channel.id}
              id={`notif-channel-${channel.id}`}
              icon={channel.icon}
              tone={channel.tone}
              title={channel.label}
              description={channel.description}
              checked={onCount(channel.id) > 0}
              onCheckedChange={(val) => setChannel(channel.id, val)}
            />
          ))}
          <ToggleRow
            id="notif-quiet-hours"
            icon={Moon}
            tone="muted"
            title="Giờ yên tĩnh (22:00 – 06:00)"
            description="Tạm hoãn thông báo thường vào ban đêm; ca SOS khẩn cấp vẫn luôn phát báo động."
            checked={draft.quietHours}
            onCheckedChange={(quietHours) => setDraft((prev) => ({ ...prev, quietHours }))}
          />
        </div>
      </SettingsCard>

      {GROUPS.map((group) => (
        <SettingsCard
          key={group.id}
          icon={group.icon}
          tone={group.tone}
          title={group.title}
          description={group.description}
        >
          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_repeat(3,3.75rem)] items-end gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_repeat(3,4.75rem)]">
              <span>Loại cảnh báo</span>
              {CHANNELS.map((channel) => (
                <span key={channel.id} className="text-center">
                  {channel.short}
                </span>
              ))}
            </div>

            {group.alerts.map((alert) => (
              <div
                key={alert.id}
                className="grid grid-cols-[1fr_repeat(3,3.75rem)] items-center gap-2 border-b border-border py-3 last:border-b-0 last:pb-0 sm:grid-cols-[1fr_repeat(3,4.75rem)]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{alert.label}</span>
                  <span className="text-xs text-muted-foreground">{alert.description}</span>
                </div>
                {CHANNELS.map((channel) => (
                  <span key={channel.id} className="flex justify-center">
                    <Switch
                      size="sm"
                      aria-label={`${alert.label} qua ${channel.label}`}
                      checked={draft.channels[channel.id][alert.id]}
                      onCheckedChange={(value) => setAlert(channel.id, alert.id, value)}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </SettingsCard>
      ))}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={() => setDraft(saved)}
        saveLabel="Lưu cài đặt"
      />
    </div>
  );
};
