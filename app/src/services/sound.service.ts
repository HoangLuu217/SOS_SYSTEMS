import { Platform } from 'react-native';
import { Audio } from 'expo-av';

let nativeSoundInstance: Audio.Sound | null = null;
let isAudioModeConfigured = false;

/**
 * Cấu hình chế độ âm thanh tác chiến khẩn cấp cho Expo AV
 */
async function configureAudioMode() {
  if (isAudioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    isAudioModeConfigured = true;
  } catch (err) {
    console.warn('⚠️ [SoundService] Lỗi cấu hình Audio mode:', err);
  }
}

/**
 * Trình phát âm thanh Web Audio API dự phòng khi chạy trên môi trường Web / Preview
 */
function playWebSynthesizerTone(freq: number, startTime: number, duration: number, ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);

  // Envelope: Fast attack, exponential decay
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.65, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playWebFallbackDispatchSound() {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    // Điệp khúc 3 âm thanh dồn dập chuẩn lệnh điều động tác chiến (880Hz -> 1175Hz -> 1760Hz)
    // Đợt 1
    playWebSynthesizerTone(880, now, 0.14, ctx);
    playWebSynthesizerTone(1175, now + 0.16, 0.14, ctx);
    playWebSynthesizerTone(1760, now + 0.32, 0.28, ctx);

    // Đợt 2 nhắc lại sau 120ms
    const secondWave = now + 0.65;
    playWebSynthesizerTone(880, secondWave, 0.14, ctx);
    playWebSynthesizerTone(1175, secondWave + 0.16, 0.14, ctx);
    playWebSynthesizerTone(1760, secondWave + 0.32, 0.32, ctx);
  } catch (err) {
    console.warn('⚠️ [SoundService] Web Audio fallback error:', err);
  }
}

/**
 * Phát chuông báo động điều động tác chiến cứu nạn (Dispatch Alert Sound)
 */
export async function playDispatchAlertSound(): Promise<void> {
  // 1. Nếu chạy trên nền Web
  if (Platform.OS === 'web') {
    try {
      // Thử dùng file audio thực tế
      const audio = new (window as any).Audio(require('../../assets/sounds/dispatch_alert.wav'));
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback sang Web Audio API nếu trình duyệt chặn autoplay
          playWebFallbackDispatchSound();
        });
      }
      return;
    } catch {
      playWebFallbackDispatchSound();
      return;
    }
  }

  // 2. Nếu chạy trên thiết bị Native (iOS / Android)
  try {
    await configureAudioMode();

    // Dừng âm thanh cũ nếu đang phát để tránh chồng chéo
    if (nativeSoundInstance) {
      try {
        await nativeSoundInstance.stopAsync();
        await nativeSoundInstance.unloadAsync();
      } catch (_) {}
      nativeSoundInstance = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/dispatch_alert.wav'),
      { shouldPlay: true, volume: 1.0 }
    );

    nativeSoundInstance = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (nativeSoundInstance === sound) {
          nativeSoundInstance = null;
        }
      }
    });
  } catch (err) {
    console.warn('⚠️ [SoundService] Không thể phát âm thanh lệnh điều động trên thiết bị:', err);
  }
}

/**
 * Dừng âm thanh thông báo đang phát
 */
export async function stopAlertSound(): Promise<void> {
  if (nativeSoundInstance) {
    try {
      await nativeSoundInstance.stopAsync();
      await nativeSoundInstance.unloadAsync();
    } catch (_) {}
    nativeSoundInstance = null;
  }
}
