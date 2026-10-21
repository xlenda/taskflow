import { Platform } from 'react-native';

import { normalizeAlarmWeekdays } from '../utils/alarmSchedule';

// Android "Meu despertar": an ordinary reminder with sound that opens the
// sequence. No exact alarm and no foreground service (Play boundary), so the
// system may deliver it a few minutes late; the voice plays once she opens it.
export const WAKE_CHANNEL_ID = 'celeste-despertar';
export const WAKE_NOTIFICATION_KIND = 'wake_sequence';
export const WAKE_URL = 'celeste://despertar/ouvir';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

const isWakeData = (data) => data?.kind === WAKE_NOTIFICATION_KIND && data?.url === WAKE_URL;
const responseIsWake = (response) => isWakeData(response?.notification?.request?.content?.data);

function permissionLabel(permission) {
  if (permission?.granted === true || permission?.status === 'granted') return 'granted';
  return permission?.status === 'denied' || permission?.canAskAgain === false ? 'denied' : 'undetermined';
}

// Turning on, the sync and turning off run one at a time: two at once would each
// keep the other's new reminders as duplicates.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function scheduledWake(client) {
  const scheduled = await client.getAllScheduledNotificationsAsync();
  return (Array.isArray(scheduled) ? scheduled : [])
    .map((item) => ({
      identifier: item?.identifier || item?.request?.identifier,
      data: item?.content?.data || item?.request?.content?.data,
    }))
    .filter(({ identifier, data }) => isWakeData(data) && typeof identifier === 'string' && identifier);
}

const scheduledWakeIdentifiers = async (client) => (await scheduledWake(client)).map((item) => item.identifier);

function parseSchedule(time, weekdays) {
  const match = TIME_PATTERN.exec(String(time || ''));
  if (!match) return { error: 'invalid_time' };
  const days = normalizeAlarmWeekdays(weekdays);
  if (!days) return { error: 'invalid_weekdays' };
  return { hour: Number(match[1]), minute: Number(match[2]), days };
}

// Each reminder carries its language and its slot, so the sync can tell a
// missing, stale or other-language reminder from one that is right.
const slotOf = (trigger) => `${trigger.hour}:${trigger.minute}/${trigger.weekday || 'daily'}`;

// One failing id never keeps the others alive.
async function cancelEachQuietly(client, identifiers) {
  for (const identifier of identifiers) {
    await Promise.resolve()
      .then(() => client.cancelScheduledNotificationAsync(identifier))
      .catch(() => {});
  }
}

function wakeContent(lang, slot) {
  const en = lang === 'en';
  return {
    title: en ? 'Your wake-up is ready' : 'Seu despertar está pronto',
    body: en
      ? 'Tap, light the three stars and listen to your sequence.'
      : 'Toque, acenda as três estrelas e ouça sua sequência.',
    sound: true,
    data: { kind: WAKE_NOTIFICATION_KIND, url: WAKE_URL, lang: en ? 'en' : 'pt', slot },
  };
}

function wakeTriggers(client, hour, minute, weekdays) {
  const channel = Platform.OS === 'android' ? { channelId: WAKE_CHANNEL_ID } : {};
  if (weekdays.length === 7) {
    return [{ type: client.SchedulableTriggerInputTypes.DAILY, hour, minute, ...channel }];
  }
  // Celeste stores ISO weekdays (Monday = 1); Expo WEEKLY counts Sunday = 1.
  return weekdays.map((weekday) => ({
    type: client.SchedulableTriggerInputTypes.WEEKLY,
    weekday: weekday === 7 ? 1 : weekday + 1,
    hour,
    minute,
    ...channel,
  }));
}

function clearLastResponse(client) {
  try {
    if (typeof client.clearLastNotificationResponse === 'function') client.clearLastNotificationResponse();
    else if (typeof client.clearLastNotificationResponseAsync === 'function') {
      client.clearLastNotificationResponseAsync().catch(() => {});
    }
  } catch (_error) {}
}

// The foreground handler is global (the last call wins): App calls this after
// the daily-ritual and plan setups, so their banners stay silent and only the
// wake-up reminder plays its sound.
export function configureWakeNotifications() {
  const client = api();
  if (typeof client?.setNotificationHandler !== 'function') return false;
  client.setNotificationHandler({
    handleNotification: async (notification) => ({
      shouldPlaySound: isWakeData(notification?.request?.content?.data),
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  return true;
}

// Same shape as the AlarmKit capability, so the screen reads both alike.
export async function getWakeReminderCapability() {
  const client = api();
  if (typeof client?.getPermissionsAsync !== 'function') return { supported: false, reason: 'unsupported' };
  try {
    const permission = permissionLabel(await client.getPermissionsAsync());
    return {
      supported: true,
      canSchedule: permission === 'granted',
      canRequestAuthorization: permission === 'undetermined',
      authorization:
        permission === 'granted' ? 'authorized' : permission === 'denied' ? 'denied' : 'not_determined',
    };
  } catch (_error) {
    return { supported: false, reason: 'capability_error' };
  }
}

// Called only from the explicit "turn on" tap: asks for notification permission
// here, replaces any earlier wake-up reminders and keeps them if anything fails.
export function scheduleWakeReminders(input = {}) {
  return serial(() => schedule(input, true));
}

// App start and every return to the foreground while the reminder is on: re-creates
// reminders that vanished (backup restore, reinstall, force-stop) or no longer
// match the saved time, days or app language. Never asks for permission: without
// it nothing changes and the screen shows its status.
export function syncWakeReminders(input = {}) {
  return serial(async () => {
    const client = api();
    if (typeof client?.getAllScheduledNotificationsAsync !== 'function') return { ok: false, error: 'unsupported' };
    const plan = parseSchedule(input.time, input.weekdays);
    if (plan.error) return { ok: false, error: plan.error };
    try {
      const permission = permissionLabel(await client.getPermissionsAsync());
      if (permission !== 'granted') return { ok: false, error: 'permission_denied', permission };
      const lang = input.lang === 'en' ? 'en' : 'pt';
      const wanted = wakeTriggers(client, plan.hour, plan.minute, plan.days).map((trigger) => `${lang} ${slotOf(trigger)}`);
      const found = (await scheduledWake(client)).map(({ data }) => `${data.lang} ${data.slot}`);
      if (wanted.sort().join('|') === found.sort().join('|')) return { ok: true, changed: false };
    } catch (_error) {
      return { ok: false, error: 'status_failed' };
    }
    const result = await schedule(input, false);
    return result.ok ? { ...result, changed: true } : result;
  });
}

async function schedule({ time, weekdays, lang = 'pt' }, askPermission) {
  const client = api();
  if (!client) return { ok: false, error: 'unsupported' };
  const plan = parseSchedule(time, weekdays);
  if (plan.error) return { ok: false, error: plan.error };

  let permission = 'unknown';
  try {
    let current = await client.getPermissionsAsync();
    if (askPermission && permissionLabel(current) !== 'granted') {
      current = await client.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
    }
    permission = permissionLabel(current);
    if (permission !== 'granted') return { ok: false, error: 'permission_denied', permission };

    if (Platform.OS === 'android' && typeof client.setNotificationChannelAsync === 'function') {
      // No `sound` key = Android's default notification sound (null would mute it).
      await client.setNotificationChannelAsync(WAKE_CHANNEL_ID, {
        name: lang === 'en' ? 'My wake-up' : 'Meu despertar',
        description:
          lang === 'en'
            ? 'Reminder with sound that opens your wake-up sequence.'
            : 'Lembrete com som que abre a sua sequência do despertar.',
        importance: client.AndroidImportance?.HIGH,
        lightColor: '#4A80C9',
      });
    }

    const previous = await scheduledWakeIdentifiers(client);
    const created = [];
    try {
      for (const trigger of wakeTriggers(client, plan.hour, plan.minute, plan.days)) {
        const identifier = await client.scheduleNotificationAsync({ content: wakeContent(lang, slotOf(trigger)), trigger });
        if (typeof identifier !== 'string' || !identifier) throw new Error('empty_identifier');
        created.push(identifier);
      }
    } catch (_error) {
      await cancelEachQuietly(client, created);
      return { ok: false, error: 'schedule_failed', permission };
    }
    // The new reminders exist, so the old ones go one by one. ponytail: an old one
    // whose cancel fails stays scheduled; turning the reminder off sweeps them all.
    await cancelEachQuietly(client, previous);
    return { ok: true, identifiers: created, permission };
  } catch (_error) {
    return { ok: false, error: 'schedule_failed', permission };
  }
}

export function cancelWakeReminders() {
  return serial(cancel);
}

async function cancel() {
  if (Platform.OS === 'web') return { ok: true };
  const client = api();
  if (
    typeof client?.getAllScheduledNotificationsAsync !== 'function' ||
    typeof client?.cancelScheduledNotificationAsync !== 'function'
  ) {
    return { ok: false, error: 'unsupported' };
  }
  try {
    // Per id, then a second look: an id that refused once gets another try, and
    // only a wake reminder still scheduled after that makes it a failure.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const left = await scheduledWakeIdentifiers(client);
      if (left.length === 0) return { ok: true };
      await cancelEachQuietly(client, left);
    }
    return (await scheduledWakeIdentifiers(client)).length === 0
      ? { ok: true }
      : { ok: false, error: 'cancel_failed' };
  } catch (_error) {
    return { ok: false, error: 'cancel_failed' };
  }
}

export async function initialWakeNotificationUrl() {
  const client = api();
  if (!client) return null;
  try {
    const response =
      typeof client.getLastNotificationResponse === 'function'
        ? client.getLastNotificationResponse()
        : typeof client.getLastNotificationResponseAsync === 'function'
        ? await client.getLastNotificationResponseAsync()
        : null;
    if (!responseIsWake(response)) return null;
    clearLastResponse(client);
    return WAKE_URL;
  } catch (_error) {
    return null;
  }
}

export function subscribeWakeNotificationUrls(listener) {
  const client = api();
  if (typeof listener !== 'function' || typeof client?.addNotificationResponseReceivedListener !== 'function') {
    return () => {};
  }
  const subscription = client.addNotificationResponseReceivedListener((response) => {
    if (!responseIsWake(response)) return;
    clearLastResponse(client);
    listener(WAKE_URL);
  });
  return () => subscription?.remove?.();
}

export const _wakeRemindersTest = {
  setApiForTests(value) {
    notificationApi = value;
  },
};
