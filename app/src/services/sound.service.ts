import { Platform, Vibration } from 'react-native';
import { getSavedNotificationSettings } from '../utils';

let activePlayer: any = null;

/**
 * Trình phát âm thanh Còi Hú Cứu Hộ / Cấp Cứu Dã Chiến bằng Web Audio API
 * (Sử dụng 2 nhịp còi hú cứu thương Yelp Siren + chuông xác nhận tiếp nhận lệnh tác chiến)
 */
function playWebFallbackDispatchSound() {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Hàm tạo 1 nhịp còi hú cứu hộ dã chiến
    const playSirenBurst = (startTime: number, duration: number, baseFreq: number, peakFreq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      // Tần số quét hình sin từ trầm lên bổng rồi hạ xuống (tiếng còi hú cứu hộ đặc thù)
      osc.frequency.setValueAtTime(baseFreq, startTime);
      osc.frequency.linearRampToValueAtTime(peakFreq, startTime + duration * 0.5);
      osc.frequency.linearRampToValueAtTime(baseFreq, startTime + duration);

      // Envelope âm lượng
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.35, startTime + 0.03);
      gain.gain.linearRampToValueAtTime(0.35, startTime + duration - 0.03);
      gain.gain.linearRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Chuông ding ping báo chốt lệnh
    const playDing = (startTime: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    };

    // 2 nhịp còi hú xe cứu hộ / cứu thương dã chiến
    playSirenBurst(now, 0.42, 750, 1350);
    playSirenBurst(now + 0.48, 0.42, 800, 1450);

    // 2 tiếng ping xác nhận chốt lệnh điều động
    playDing(now + 0.95, 1175);
    playDing(now + 1.10, 1568);
  } catch (err) {
    console.warn('⚠️ [SoundService] Web Audio error:', err);
  }
}

/**
 * Phát âm thanh thông báo bình thường (2 nốt nhẹ trên Web)
 */
function playWebNormalNotificationChime() {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const playTone = (startTime: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    };

    playTone(now, 587.33, 0.14); // D5
    playTone(now + 0.11, 880, 0.22); // A5
  } catch (err) {
    console.warn('⚠️ [SoundService] Web Audio error:', err);
  }
}

/**
 * Phát chuông thông báo bình thường (chỉ dùng tiếng nhẹ, không dùng còi SOS).
 * Trên thiết bị di động, âm báo mặc định được phát qua hệ thống expo-notifications.
 */
export async function playNormalNotificationSound(): Promise<void> {
  let allowSound = true;
  let allowVibration = true;

  try {
    const settings = await getSavedNotificationSettings();
    if (settings) {
      if (settings.appEnabled === false) return;
      if (settings.sound === false) allowSound = false;
      if (settings.vibration === false) allowVibration = false;
    }
  } catch (_) {}

  if (allowVibration) {
    try {
      Vibration.vibrate(150);
    } catch (_) {}
  }

  if (!allowSound) return;

  if (Platform.OS === 'web') {
    playWebNormalNotificationChime();
  }
}

/**
 * Phát chuông báo động điều động tác chiến cứu nạn (Rescue Siren Yelp + Dispatch Ping)
 * Đảm bảo tuân thủ nghiêm ngặt chế độ im lặng / tắt chuông của điện thoại (playsInSilentMode = false)
 */
export async function playDispatchAlertSound(): Promise<void> {
  let allowSound = true;
  let allowVibration = true;

  try {
    const settings = await getSavedNotificationSettings();
    if (settings) {
      if (settings.appEnabled === false) return;
      if (settings.sound === false) allowSound = false;
      if (settings.vibration === false) allowVibration = false;
    }
  } catch (_) {}

  // Chỉ rung 1 lần nếu cài đặt cho phép rung
  if (allowVibration) {
    try {
      Vibration.vibrate(300);
    } catch (_) {}
  }

  // Nếu người dùng đã tắt chuông trong cài đặt thông báo, không phát bất kỳ âm thanh nào
  if (!allowSound) {
    return;
  }

  // 1. Nếu chạy trên nền Web
  if (Platform.OS === 'web') {
    try {
      const audio = new (window as any).Audio(require('../../assets/sounds/dispatch_alert.wav'));
      audio.volume = 1.0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
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
    const ExpoAudio = require('expo-audio');
    if (ExpoAudio && typeof ExpoAudio.createAudioPlayer === 'function') {
      if (typeof ExpoAudio.setAudioModeAsync === 'function') {
        // QUAN TRỌNG: playsInSilentMode = false để TUÂN THỦ chế độ im lặng / tắt chuông của điện thoại
        // Khi điện thoại gạt nút im lặng (iOS) hoặc đặt chế độ Rung / Im lặng (Android), còi hú sẽ tự động câm
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: false,
          interruptionMode: 'duckOthers',
        }).catch(() => { });
      }

      if (activePlayer) {
        try {
          if (typeof activePlayer.pause === 'function') activePlayer.pause();
          if (typeof activePlayer.remove === 'function') activePlayer.remove();
        } catch (_) { }
      }

      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/dispatch_alert.wav'));
      activePlayer = player;
      player.play();
      return;
    }
  } catch (err) {
    console.log('ℹ️ [SoundService] Chạy trên Expo Go: Kích hoạt nhịp rung khẩn cấp và thông báo hệ thống.');
  }
}

/**
 * Dừng âm thanh thông báo đang phát
 */
export async function stopAlertSound(): Promise<void> {
  if (activePlayer) {
    try {
      if (typeof activePlayer.pause === 'function') activePlayer.pause();
      if (typeof activePlayer.remove === 'function') activePlayer.remove();
    } catch (_) { }
    activePlayer = null;
  }
}
