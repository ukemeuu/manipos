/**
 * Native Push Order Ringing Service (Capacitor Android + iOS)
 *
 * Registers the physical device's FCM / APNs token into Supabase
 * `device_push_tokens` when a staff member signs into the Capacitor app so
 * incoming orders ring loudly even when the screen is locked or backgrounded.
 */

import { supabase } from './supabase';

const STORED_PUSH_TOKEN_KEY = 'manipos_native_push_token';
let initializedForRestaurant = null;
let listenersAttached = false;

function isNativeCapacitor() {
  return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

function getNativePlatform() {
  try {
    const p = window.Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch (_) {}
  return 'android';
}

export async function initNativeOrderPush({ restaurantId, staffId = null, deviceLabel = '' } = {}) {
  if (!isNativeCapacitor() || !restaurantId) return false;
  if (initializedForRestaurant === restaurantId) return true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const platform = getNativePlatform();

    // Ensure high-importance Android alarm channel exists before notifications arrive
    if (platform === 'android' && typeof PushNotifications.createChannel === 'function') {
      await PushNotifications.createChannel({
        id: 'incoming_orders',
        name: 'Incoming Orders Alarm',
        description: 'Loud priority ringtone for new online & microsite orders',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'order_alarm',
      }).catch(() => {});
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      return false;
    }

    if (!listenersAttached) {
      listenersAttached = true;

      PushNotifications.addListener('registration', async (tokenObj) => {
        const token = String(tokenObj?.value || '').trim();
        if (!token) return;
        try {
          localStorage.setItem(STORED_PUSH_TOKEN_KEY, token);
        } catch (_) {}
        const targetRestId = initializedForRestaurant || restaurantId;
        if (!targetRestId) return;
        await supabase.rpc('register_device_push_token', {
          p_restaurant_id: targetRestId,
          p_token: token,
          p_platform: platform,
          p_staff_id: staffId || null,
          p_device_label: deviceLabel || `${platform.toUpperCase()} POS Terminal`,
        }).catch((err) => {
          console.warn('[NativePush] Token registration failed:', err?.message || err);
        });
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.warn('[NativePush] Registration error:', err);
      });

      // Foreground push received -> wake overlay & refresh orders immediately
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        window.dispatchEvent(new CustomEvent('manipos:incoming-order-push', { detail: notification }));
      });

      // User tapped push notification from lock screen / background
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        window.dispatchEvent(new CustomEvent('manipos:incoming-order-push', { detail: action?.notification || action }));
      });
    }

    initializedForRestaurant = restaurantId;
    await PushNotifications.register();

    // If we already have a cached token from an earlier registration, refresh its restaurant binding immediately
    const cachedToken = (() => {
      try { return localStorage.getItem(STORED_PUSH_TOKEN_KEY); } catch { return null; }
    })();
    if (cachedToken) {
      await supabase.rpc('register_device_push_token', {
        p_restaurant_id: restaurantId,
        p_token: cachedToken,
        p_platform: platform,
        p_staff_id: staffId || null,
        p_device_label: deviceLabel || `${platform.toUpperCase()} POS Terminal`,
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.warn('[NativePush] Init skipped:', err?.message || err);
    return false;
  }
}

export async function unregisterNativeOrderPush() {
  initializedForRestaurant = null;
  if (!isNativeCapacitor()) return;
  try {
    const token = localStorage.getItem(STORED_PUSH_TOKEN_KEY);
    if (token) {
      await supabase.rpc('deactivate_device_push_token', { p_token: token }).catch(() => {});
    }
  } catch (_) {}
}
