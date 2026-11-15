/**
 * Continuous Loud Order Alarm Engine for Web POS, Tablets, and Capacitor Android.
 *
 * Plays a multi-harmonic bell cadence using Web Audio API plus an HTMLAudio WAV
 * fallback generated in-memory so browser background tabs and Android WebViews
 * alert kitchen staff loudly until every pending online order is Accepted or Declined.
 */

let audioCtx = null;
let ringInterval = null;
let fallbackAudioEl = null;
let fallbackBlobUrl = null;
let nativeChannelReady = false;
let isMutedOrSnoozedUntil = 0;

function buildAlarmWavDataUri() {
  if (typeof window === 'undefined' || typeof Blob === 'undefined') return null;
  if (fallbackBlobUrl) return fallbackBlobUrl;

  const sampleRate = 22050;
  const durationSec = 1.05;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Two-pulse bright restaurant bell chime (988Hz + 1318Hz -> 1568Hz)
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    let sample = 0;
    if (t < 0.45) {
      const env = Math.exp(-t * 6.5);
      sample = (Math.sin(2 * Math.PI * 987.77 * t) * 0.55 + Math.sin(2 * Math.PI * 1318.51 * t) * 0.45) * env;
    } else if (t >= 0.48 && t < 1.02) {
      const lt = t - 0.48;
      const env = Math.exp(-lt * 6.0);
      sample = (Math.sin(2 * Math.PI * 1318.51 * lt) * 0.5 + Math.sin(2 * Math.PI * 1567.98 * lt) * 0.5) * env;
    }
    const clamped = Math.max(-1, Math.min(1, sample * 0.9));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  fallbackBlobUrl = URL.createObjectURL(blob);
  return fallbackBlobUrl;
}

export function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export async function unlockOrderAlarmAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
    const url = buildAlarmWavDataUri();
    if (url && !fallbackAudioEl) {
      fallbackAudioEl = new Audio(url);
      fallbackAudioEl.volume = 1.0;
    }
    return true;
  } catch {
    return false;
  }
}

export async function ensureAndroidAlarmChannel() {
  if (nativeChannelReady || typeof window === 'undefined') return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
    if (Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({
        id: 'manipos_orders_alarm',
        name: 'Incoming Orders Alarm',
        description: 'Loud continuous ringtone alerts for new restaurant orders',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'default',
      });
    }
    nativeChannelReady = true;
  } catch {
    // Web / non-Capacitor browser runtime
  }
}

export async function triggerNativeOrderAlert(order) {
  if (typeof window === 'undefined') return;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      await ensureAndroidAlarmChannel();
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { Haptics } = await import('@capacitor/haptics');

      await Haptics.vibrate({ duration: 900 }).catch(() => {});
      const numericId = Math.abs(
        Array.from(String(order?.id || Date.now())).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7)
      ) % 2147483000;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId || 1001,
            title: `NEW ORDER #${order?.ticket_number || 'LIVE'} — KES ${Number(order?.total_amount || 0).toLocaleString()}`,
            body: `${order?.customer_name || 'Guest'} (${order?.dining_option || order?.order_channel || 'Microsite'}) — Tap to Accept or Decline`,
            channelId: 'manipos_orders_alarm',
            sound: 'default',
            autoCancel: true,
            extra: { orderId: order?.id || null },
          },
        ],
      });
      return;
    }
  } catch {
    // Fall back to Web Notification API below
  }

  // Browser / Android Chrome PWA fallback popup notification
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const notif = new Notification(
        `NEW ORDER #${order?.ticket_number || 'LIVE'} — KES ${Number(order?.total_amount || 0).toLocaleString()}`,
        {
          body: `${order?.customer_name || 'Guest'} (${order?.dining_option || order?.order_channel || 'Microsite'}) — Tap to Accept or Decline`,
          tag: `manipos-order-${order?.id || 'live'}`,
          requireInteraction: true,
          renotify: true,
        }
      );
      notif.onclick = () => {
        try {
          window.focus();
          notif.close();
        } catch {
          // ignore
        }
      };
    }
  } catch {
    // Notification blocked or unsupported
  }
}

export async function registerOrderAlarmNotificationListeners(onResumeOrTap) {
  if (typeof window === 'undefined') return () => {};
  const cleanups = [];
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return () => {};
    const [{ LocalNotifications }, { App: CapacitorApp }] = await Promise.all([
      import('@capacitor/local-notifications'),
      import('@capacitor/app'),
    ]);

    const tapListener = await LocalNotifications.addListener('localNotificationActionPerformed', async () => {
      await unlockOrderAlarmAudio().catch(() => {});
      onResumeOrTap?.();
    });
    cleanups.push(() => tapListener?.remove?.());

    const stateListener = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await unlockOrderAlarmAudio().catch(() => {});
        onResumeOrTap?.();
      }
    });
    cleanups.push(() => stateListener?.remove?.());
  } catch {
    // Web / non-Capacitor browser runtime
  }
  return () => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
  };
}

export function playSingleOrderRing() {
  let playedWebAudio = false;
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      // Triple bright ascending chime cadence (loud & unmistakable in kitchen)
      const notes = [
        { freq: 987.77, start: 0, dur: 0.24 },
        { freq: 1318.51, start: 0.26, dur: 0.24 },
        { freq: 1567.98, start: 0.52, dur: 0.36 },
      ];
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        overtone.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);
        overtone.frequency.setValueAtTime(n.freq * 2, now + n.start);

        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.linearRampToValueAtTime(0.45, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

        osc.connect(gain);
        overtone.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.start);
        overtone.start(now + n.start);
        osc.stop(now + n.start + n.dur);
        overtone.stop(now + n.start + n.dur);
      }
      playedWebAudio = ctx.state === 'running';
    }
  } catch {
    // Fallback below
  }

  if (!playedWebAudio) {
    try {
      const uri = buildAlarmWavDataUri();
      if (uri) {
        if (!fallbackAudioEl) {
          fallbackAudioEl = new Audio(uri);
        }
        fallbackAudioEl.volume = 1.0;
        fallbackAudioEl.currentTime = 0;
        fallbackAudioEl.play().catch(() => {});
      }
    } catch {
      // Blocked until user gesture
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([400, 120, 400, 120, 400]);
    } catch {
      // Ignore vibration errors
    }
  }

  // Native Android haptic pulse alongside audio bell cadence
  if (typeof window !== 'undefined') {
    import('@capacitor/core')
      .then(async ({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return;
        const { Haptics } = await import('@capacitor/haptics');
        await Haptics.vibrate({ duration: 450 }).catch(() => {});
      })
      .catch(() => {});
  }
}

export function snoozeOrderAlarm(durationMs = 30000) {
  isMutedOrSnoozedUntil = Date.now() + durationMs;
}

export function clearAlarmSnooze() {
  isMutedOrSnoozedUntil = 0;
}

export function isOrderAlarmSnoozed() {
  return Date.now() < isMutedOrSnoozedUntil;
}

export function startContinuousOrderAlarm() {
  if (ringInterval) return;

  const ringIfActive = () => {
    if (!isOrderAlarmSnoozed()) {
      playSingleOrderRing();
    }
  };

  ringIfActive();
  ringInterval = setInterval(ringIfActive, 2800);
}

export function stopContinuousOrderAlarm() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  clearAlarmSnooze();
  if (fallbackAudioEl) {
    try {
      fallbackAudioEl.pause();
      fallbackAudioEl.currentTime = 0;
    } catch {
      // ignore
    }
  }
}
