import { Platform, Vibration } from 'react-native';

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
 * Phát chuông báo động điều động tác chiến cứu nạn (Rescue Siren Yelp + Dispatch Ping)
 */
export async function playDispatchAlertSound(): Promise<void> {
  // Rung 1 lần duy nhất
  try {
    Vibration.vibrate(300);
  } catch (_) { }

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
        await ExpoAudio.setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
        }).catch(() => { });
      }

      if (activePlayer && typeof activePlayer.remove === 'function') {
        try {
          activePlayer.remove();
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
  if (activePlayer && typeof activePlayer.remove === 'function') {
    try {
      activePlayer.remove();
    } catch (_) { }
    activePlayer = null;
  }
}
