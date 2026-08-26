import { Platform } from 'react-native';

export const DAILY_RITUAL_CHANNEL_ID = 'celeste-daily-ritual';
export const DAILY_RITUAL_URL = 'celeste://ritual';

let notificationApi;

function api() {
  if (Platform.OS === 'web') return null;
  if (notificationApi !== undefined) return notificationApi;
  try {
    notificationApi = require('expo-notifications');
  } catch (_error) {
    notificationApi = null;
  }
  return notificationApi;
}

function cleanIdentifier(value) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : '';
}

function parseTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

function permissionGranted(client, permission) {
  if (permission?.granted === true || permission?.status === 'granted') return true;
  return permission?.ios?.status === client?.IosAuthorizationStatus?.PROVISIONAL;
}

async function ensureAndroidChannel(client) {
  if (Platform.OS !== 'android' || typeof client.setNotificationChannelAsync !== 'function') return;
  await client.setNotificationChannelAsync(DAILY_RITUAL_CHANNEL_ID, {
    name: 'Ritual diário',
    importance: client.AndroidImportance?.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: '#4A80C9',
    sound: null,
  });
}

export function configureDailyRitualNotifications() {
  const client = api();
  if (!client || typeof client.setNotificationHandler !== 'function') return false;
  client.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  return true;
}

export async function scheduleDailyRitualReminder({ time, previousId, lang = 'pt' }) {
  const client = api();
  const parsed = parseTime(time);
  if (!client || !parsed) return { ok: false, error: 'unsupported' };

  try {
    await ensureAndroidChannel(client);
    let permission = await client.getPermissionsAsync();
    if (!permissionGranted(client, permission)) {
      permission = await client.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: false, allowBadge: false },
      });
    }
    if (!permissionGranted(client, permission)) {
      return { ok: false, error: 'permission_denied' };
    }

    const identifier = await client.scheduleNotificationAsync({
      content: {
        title: lang === 'en' ? 'Your Celeste minute is ready' : 'Seu minuto Celeste está pronto',
        body:
          lang === 'en'
            ? 'A short pause for your affirmation today.'
            : 'Uma pausa curta para sua afirmação de hoje.',
        data: { url: DAILY_RITUAL_URL, kind: 'daily_ritual' },
      },
      trigger: {
        type: client.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hour,
        minute: parsed.minute,
        channelId: Platform.OS === 'android' ? DAILY_RITUAL_CHANNEL_ID : undefined,
      },
    });
    const oldId = cleanIdentifier(previousId);
    if (oldId && oldId !== identifier) {
      try {
        await client.cancelScheduledNotificationAsync(oldId);
      } catch (_cancelError) {
        try {
          await client.cancelScheduledNotificationAsync(identifier);
        } catch (_rollbackError) {
          if (typeof client.cancelAllScheduledNotificationsAsync === 'function') {
            await client.cancelAllScheduledNotificationsAsync().catch(() => {});
          }
        }
        return { ok: false, error: 'previous_cancel_failed' };
      }
    }
    return { ok: true, identifier, permission: 'granted' };
  } catch (_error) {
    return { ok: false, error: 'schedule_failed' };
  }
}

export async function cancelDailyRitualReminder(identifier) {
  const id = cleanIdentifier(identifier);
  if (!id) return { ok: true };
  const client = api();
  if (!client) return { ok: Platform.OS === 'web', error: Platform.OS === 'web' ? null : 'unsupported' };
  try {
    await client.cancelScheduledNotificationAsync(id);
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'cancel_failed' };
  }
}

export async function getDailyRitualReminderStatus(identifier) {
  const id = cleanIdentifier(identifier);
  if (Platform.OS === 'web') {
    return { ok: true, supported: false, scheduled: false, permission: 'unsupported' };
  }
  const client = api();
  if (!client || typeof client.getPermissionsAsync !== 'function') {
    return { ok: false, error: 'unsupported' };
  }
  try {
    const permission = await client.getPermissionsAsync();
    const granted = permissionGranted(client, permission);
    if (!granted || !id) {
      return {
        ok: true,
        supported: true,
        scheduled: false,
        permission: granted ? 'granted' : 'denied',
      };
    }
    if (typeof client.getAllScheduledNotificationsAsync !== 'function') {
      return { ok: true, supported: true, scheduled: true, permission: 'granted' };
    }
    const scheduled = await client.getAllScheduledNotificationsAsync();
    return {
      ok: true,
      supported: true,
      scheduled: Array.isArray(scheduled) && scheduled.some((item) => item?.identifier === id),
      permission: 'granted',
    };
  } catch (_error) {
    return { ok: false, error: 'status_failed' };
  }
}

function responseUrl(response) {
  const url = response?.notification?.request?.content?.data?.url;
  return url === DAILY_RITUAL_URL ? url : null;
}

export async function initialDailyRitualNotificationUrl() {
  const client = api();
  if (!client) return null;
  try {
    const response =
      typeof client.getLastNotificationResponse === 'function'
        ? client.getLastNotificationResponse()
        : await client.getLastNotificationResponseAsync();
    const url = responseUrl(response);
    if (url) {
      if (typeof client.clearLastNotificationResponse === 'function') {
        client.clearLastNotificationResponse();
      } else if (typeof client.clearLastNotificationResponseAsync === 'function') {
        await client.clearLastNotificationResponseAsync();
      }
    }
    return url;
  } catch (_error) {
    return null;
  }
}

export function subscribeDailyRitualNotificationUrls(listener) {
  const client = api();
  if (!client || typeof client.addNotificationResponseReceivedListener !== 'function') {
    return () => {};
  }
  const subscription = client.addNotificationResponseReceivedListener((response) => {
    const url = responseUrl(response);
    if (!url) return;
    if (typeof client.clearLastNotificationResponse === 'function') {
      try { client.clearLastNotificationResponse(); } catch (_error) {}
    } else if (typeof client.clearLastNotificationResponseAsync === 'function') {
      client.clearLastNotificationResponseAsync().catch(() => {});
    }
    listener(url);
  });
  return () => subscription?.remove?.();
}

export const _dailyRitualReminderTest = {
  parseTime,
  responseUrl,
  setApiForTests(value) {
    notificationApi = value;
  },
};
