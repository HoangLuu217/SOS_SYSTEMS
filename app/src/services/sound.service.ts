import { Platform, Vibration } from 'react-native';

let activePlayer: any = null;

/**
 * Trình phát âm thanh Web Audio API khi chạy trên môi trường Web / Browser
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
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.65, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Đợt 1: 3 tông dồn dập (880Hz -> 1175Hz -> 1760Hz)
    playTone(880, now, 0.14);
    playTone(1175, now + 0.16, 0.14);
    playTone(1760, now + 0.32, 0.28);

    // Đợt 2: lặp lại sau 120ms
    const secondWave = now + 0.65;
    playTone(880, secondWave, 0.14);
    playTone(1175, secondWave + 0.16, 0.14);
    playTone(1760, secondWave + 0.32, 0.32);
  } catch (err) {
    console.warn('⚠️ [SoundService] Web Audio error:', err);
  }
}

/**
 * Phát chuông báo động điều động tác chiến cứu nạn (Dispatch Alert Sound)
 * Hoạt động an toàn 100% trên cả Expo Go, Development Build và Web
 */
export async function playDispatchAlertSound(): Promise<void> {
  // Luôn phát nhịp rung báo động đặc thù của cứu hộ
  try {
    Vibration.vibrate([0, 500, 150, 500, 150, 800, 200, 800]);
  } catch (_) {}

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
  // Sử dụng lazy require để không bao giờ làm sập Expo Go khi thiếu native module
  try {
    const ExpoAudio = require('expo-audio');
    if (ExpoAudio && typeof ExpoAudio.createAudioPlayer === 'function') {
      if (typeof ExpoAudio.setAudioModeAsync === 'function') {
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
        }).catch(() => {});
      }

      if (activePlayer && typeof activePlayer.remove === 'function') {
        try {
          activePlayer.remove();
        } catch (_) {}
      }

      const player = ExpoAudio.createAudioPlayer(require('../../assets/sounds/dispatch_alert.wav'));
      activePlayer = player;
      player.play();
      return;
    }
  } catch (err) {
    // Graceful fallback cho Expo Go: Hệ thống vẫn sẽ rung chuông dồn dập và phát thông báo hệ thống
    console.log('ℹ️ [SoundService] Chạy trên Expo Go: Kích hoạt nhịp rung khẩn cấp và thông báo hệ thống.');
  }
}

/**
 * Dừng âm thanh thông báo đang phát
 */
export async function stopAlertSound(): Promise<void> {
  if (activePlayer && typeof activePlayer.remove === 'function') {
    try {
      activePlayer.remove();
    } catch (_) {}
    activePlayer = null;
  }
}
