import { Platform } from 'react-native';

export const PRACTICE_PLAN_CHANNEL_ID = 'celeste-practice-plan';
export const PRACTICE_PLAN_NOTIFICATION_KIND = 'practice_plan';
export const PRACTICE_PLAN_MAX_SLOTS = 4;
export const PRACTICE_PLAN_SNOOZE_MINUTES = 10;

const PRACTICE_PLAN_URL_PREFIX = 'celeste://pratica/';
const SLOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

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

function normalizeSlotId(value) {
  const slotId = typeof value === 'string' ? value.trim() : '';
  if (!SLOT_ID_PATTERN.test(slotId)) return null;
  return Object.prototype.hasOwnProperty.call(Object.prototype, slotId) ? null : slotId;
}

function parseTime(value) {
  const match = TIME_PATTERN.exec(String(value || ''));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

function normalizeWeekdays(value) {
  if (value == null) return [...ALL_WEEKDAYS];
  if (!Array.isArray(value) || value.length === 0) return null;
  const weekdays = [...new Set(value)];
  if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
  return weekdays.sort((left, right) => left - right);
}

function isoWeekdayToExpo(weekday) {
  // Celeste stores ISO weekdays (Monday = 1); Expo WEEKLY uses Sunday = 1.
  return weekday === 7 ? 1 : weekday + 1;
}

function normalizeSlots(slots) {
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > PRACTICE_PLAN_MAX_SLOTS) {
    return { error: 'invalid_slots' };
  }

  const seen = new Set();
  const normalized = [];
  for (const candidate of slots) {
    if (!candidate || typeof candidate !== 'object') return { error: 'invalid_slot' };
    const slotId = normalizeSlotId(candidate.slotId || candidate.id);
    if (!slotId || seen.has(slotId)) return { error: 'invalid_slot_id' };
    seen.add(slotId);

    const enabled = candidate.enabled !== false;
    if (!enabled) {
      normalized.push({ slotId, enabled: false });
      continue;
    }

    const time = parseTime(candidate.time);
    const weekdays = normalizeWeekdays(candidate.weekdays);
    if (!time) return { error: 'invalid_time', slotId };
    if (!weekdays) return { error: 'invalid_weekdays', slotId };
    normalized.push({ slotId, enabled: true, time: String(candidate.time), ...time, weekdays });
  }
  return { value: normalized };
}

function permissionGranted(client, permission) {
  if (permission?.granted === true || permission?.status === 'granted') return true;
  return permission?.ios?.status === client?.IosAuthorizationStatus?.PROVISIONAL;
}

function permissionLabel(client, permission) {
  if (permissionGranted(client, permission)) return 'granted';
  if (permission?.status === 'denied' || permission?.canAskAgain === false) return 'denied';
  return 'undetermined';
}

async function readPermission(client) {
  if (typeof client?.getPermissionsAsync !== 'function') return null;
  return client.getPermissionsAsync();
}

async function obtainPermission(client, requestPermission) {
  let permission = await readPermission(client);
  if (permissionGranted(client, permission)) {
    return { ok: true, permission: 'granted' };
  }
  if (requestPermission !== true) {
    return {
      ok: false,
      error: 'permission_required',
      permission: permissionLabel(client, permission),
    };
  }
  if (typeof client.requestPermissionsAsync !== 'function') {
    return { ok: false, error: 'unsupported', permission: permissionLabel(client, permission) };
  }
  permission = await client.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: false, allowBadge: false },
  });
  if (!permissionGranted(client, permission)) {
    return { ok: false, error: 'permission_denied', permission: permissionLabel(client, permission) };
  }
  return { ok: true, permission: 'granted' };
}

async function ensureAndroidChannel(client) {
  if (Platform.OS !== 'android' || typeof client.setNotificationChannelAsync !== 'function') return;
  await client.setNotificationChannelAsync(PRACTICE_PLAN_CHANNEL_ID, {
    name: 'Plano Celeste',
    description: 'Lembretes tranquilos do plano de prática escolhido.',
    importance: client.AndroidImportance?.DEFAULT,
    sound: null,
    enableVibrate: false,
    vibrationPattern: [0],
    lightColor: '#4A80C9',
  });
}

function practicePlanUrl(slotId) {
  const normalized = normalizeSlotId(slotId);
  return normalized ? `${PRACTICE_PLAN_URL_PREFIX}${normalized}` : null;
}

function parsePracticePlanUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(PRACTICE_PLAN_URL_PREFIX)) return null;
  const slotId = value.slice(PRACTICE_PLAN_URL_PREFIX.length);
  if (!normalizeSlotId(slotId) || value !== practicePlanUrl(slotId)) return null;
  return slotId;
}

function scheduledRequest(item) {
  return item?.request && typeof item.request === 'object' ? item.request : item;
}

function scheduledIdentifier(item) {
  const request = scheduledRequest(item);
  return cleanIdentifier(request?.identifier || item?.identifier);
}

function notificationData(item) {
  const request = scheduledRequest(item);
  return request?.content?.data || item?.content?.data || null;
}

function practicePlanSlotId(item) {
  const data = notificationData(item);
  if (data?.kind !== PRACTICE_PLAN_NOTIFICATION_KIND) return null;
  const urlSlotId = parsePracticePlanUrl(data?.url);
  const dataSlotId = normalizeSlotId(data?.slotId);
  return urlSlotId && dataSlotId === urlSlotId ? urlSlotId : null;
}

function isPracticePlanNotification(item) {
  return Boolean(practicePlanSlotId(item));
}

function genericContent(slotId, lang) {
  const url = practicePlanUrl(slotId);
  return {
    title: lang === 'en' ? 'Your Celeste practice is ready' : 'Sua prática Celeste está pronta',
    body:
      lang === 'en'
        ? 'Take a brief moment for the practice you chose.'
        : 'Reserve um momento para a prática que você escolheu.',
    sound: null,
    data: { kind: PRACTICE_PLAN_NOTIFICATION_KIND, slotId, url },
  };
}

function withChannel(trigger) {
  return Platform.OS === 'android'
    ? { ...trigger, channelId: PRACTICE_PLAN_CHANNEL_ID }
    : trigger;
}

function scheduleRequestsForSlot(client, slot, lang) {
  if (!slot.enabled) return [];
  const content = genericContent(slot.slotId, lang);
  if (slot.weekdays.length === ALL_WEEKDAYS.length) {
    return [
      {
        slotId: slot.slotId,
        request: {
          content,
          trigger: withChannel({
            type: client.SchedulableTriggerInputTypes.DAILY,
            hour: slot.hour,
            minute: slot.minute,
          }),
        },
      },
    ];
  }
  return slot.weekdays.map((weekday) => ({
    slotId: slot.slotId,
    request: {
      content,
      trigger: withChannel({
        type: client.SchedulableTriggerInputTypes.WEEKLY,
        weekday: isoWeekdayToExpo(weekday),
        hour: slot.hour,
        minute: slot.minute,
      }),
    },
  }));
}

function normalizeIdentifiersBySlot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [rawSlotId, rawIdentifiers] of Object.entries(value)) {
    const slotId = normalizeSlotId(rawSlotId);
    if (!slotId) continue;
    const source = Array.isArray(rawIdentifiers) ? rawIdentifiers : [rawIdentifiers];
    const identifiers = [...new Set(source.map(cleanIdentifier).filter(Boolean))];
    if (identifiers.length > 0) result[slotId] = identifiers;
  }
  return result;
}

function flatIdentifiers(value) {
  return [...new Set(Object.values(normalizeIdentifiersBySlot(value)).flat())];
}

async function scheduledPlanSnapshots(client) {
  if (typeof client.getAllScheduledNotificationsAsync !== 'function') {
    throw new Error('scheduled_status_unsupported');
  }
  const scheduled = await client.getAllScheduledNotificationsAsync();
  return (Array.isArray(scheduled) ? scheduled : [])
    .map((item) => {
      const request = scheduledRequest(item);
      return {
        identifier: scheduledIdentifier(item),
        slotId: practicePlanSlotId(item),
        content: request?.content,
        trigger: request?.trigger,
      };
    })
    .filter((snapshot) => snapshot.identifier && snapshot.slotId && snapshot.content && snapshot.trigger);
}

async function cancelKnownIdentifiers(client, identifiers) {
  const failed = [];
  const cancelled = [];
  for (const identifier of identifiers) {
    try {
      await client.cancelScheduledNotificationAsync(identifier);
      cancelled.push(identifier);
    } catch (_error) {
      failed.push(identifier);
    }
  }
  return { cancelled, failed };
}

async function restoreSnapshots(client, snapshots) {
  const identifiersBySlot = {};
  const failedSlots = [];
  for (const snapshot of snapshots) {
    try {
      const identifier = cleanIdentifier(
        await client.scheduleNotificationAsync({
          content: snapshot.content,
          trigger: snapshot.trigger,
        })
      );
      if (!identifier) throw new Error('empty_identifier');
      if (!identifiersBySlot[snapshot.slotId]) identifiersBySlot[snapshot.slotId] = [];
      identifiersBySlot[snapshot.slotId].push(identifier);
    } catch (_error) {
      failedSlots.push(snapshot.slotId);
    }
  }
  return { identifiersBySlot, failedSlots };
}

async function rollbackNewSchedules(client, identifiers) {
  if (identifiers.length === 0) return { ok: true };
  const result = await cancelKnownIdentifiers(client, identifiers);
  return { ok: result.failed.length === 0, failedIdentifiers: result.failed };
}

function groupSnapshots(snapshots) {
  const identifiersBySlot = {};
  for (const snapshot of snapshots) {
    if (!identifiersBySlot[snapshot.slotId]) identifiersBySlot[snapshot.slotId] = [];
    identifiersBySlot[snapshot.slotId].push(snapshot.identifier);
  }
  return identifiersBySlot;
}

export function configurePracticePlanNotifications() {
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

export async function requestPracticePlanNotificationPermission() {
  const client = api();
  if (!client) return { ok: false, error: 'unsupported', permission: 'unsupported' };
  try {
    return await obtainPermission(client, true);
  } catch (_error) {
    return { ok: false, error: 'permission_failed', permission: 'unknown' };
  }
}

export async function schedulePracticePlanReminders({
  slots,
  previousIds,
  previousIdentifiersBySlot,
  identifiersBySlot,
  lang = 'pt',
  requestPermission = false,
} = {}) {
  const normalized = normalizeSlots(slots);
  if (normalized.error) return { ok: false, error: normalized.error, slotId: normalized.slotId };
  const client = api();
  if (
    !client ||
    typeof client.scheduleNotificationAsync !== 'function' ||
    typeof client.cancelScheduledNotificationAsync !== 'function'
  ) {
    return { ok: false, error: 'unsupported', permission: 'unsupported' };
  }

  const activeSlots = normalized.value.filter((slot) => slot.enabled);
  const previous = normalizeIdentifiersBySlot(
    previousIdentifiersBySlot || previousIds || identifiersBySlot
  );
  const requestedPreviousIds = flatIdentifiers(previous);
  let permission = 'unknown';

  try {
    if (activeSlots.length > 0) {
      const permissionResult = await obtainPermission(client, requestPermission);
      if (!permissionResult.ok) return permissionResult;
      permission = permissionResult.permission;
      await ensureAndroidChannel(client);
    } else {
      const currentPermission = await readPermission(client);
      permission = currentPermission ? permissionLabel(client, currentPermission) : 'unknown';
    }

    let oldSnapshots = [];
    if (requestedPreviousIds.length > 0) {
      const requestedSet = new Set(requestedPreviousIds);
      oldSnapshots = (await scheduledPlanSnapshots(client)).filter((snapshot) =>
        requestedSet.has(snapshot.identifier)
      );
    }

    const created = [];
    try {
      for (const slot of activeSlots) {
        for (const entry of scheduleRequestsForSlot(client, slot, lang)) {
          const identifier = cleanIdentifier(await client.scheduleNotificationAsync(entry.request));
          if (!identifier) throw new Error('empty_identifier');
          created.push({ identifier, slotId: entry.slotId });
        }
      }
    } catch (_error) {
      const rollback = await rollbackNewSchedules(
        client,
        created.map((item) => item.identifier)
      );
      return {
        ok: false,
        error: rollback.ok ? 'schedule_failed' : 'rollback_failed',
        permission,
        identifiersBySlot: {},
        ...(rollback.ok ? {} : { rollbackFailedIdentifiers: rollback.failedIdentifiers }),
      };
    }

    const cancelledOld = [];
    for (const snapshot of oldSnapshots) {
      try {
        await client.cancelScheduledNotificationAsync(snapshot.identifier);
        cancelledOld.push(snapshot);
      } catch (_error) {
        const newRollback = await rollbackNewSchedules(
          client,
          created.map((item) => item.identifier)
        );
        const restored = await restoreSnapshots(client, cancelledOld);
        const rollbackOk = newRollback.ok && restored.failedSlots.length === 0;
        return {
          ok: false,
          error: rollbackOk ? 'previous_cancel_failed' : 'rollback_failed',
          permission,
          identifiersBySlot: {},
          restoredIdentifiersBySlot: restored.identifiersBySlot,
          ...(newRollback.ok ? {} : { rollbackFailedIdentifiers: newRollback.failedIdentifiers }),
          ...(restored.failedSlots.length === 0 ? {} : { restoreFailedSlots: restored.failedSlots }),
        };
      }
    }

    const result = {};
    for (const item of created) {
      if (!result[item.slotId]) result[item.slotId] = [];
      result[item.slotId].push(item.identifier);
    }
    return { ok: true, identifiersBySlot: result, permission };
  } catch (_error) {
    return { ok: false, error: 'schedule_failed', permission, identifiersBySlot: {} };
  }
}

export async function cancelPracticePlanReminders(identifiersBySlot) {
  if (Platform.OS === 'web') {
    return { ok: true, supported: false, cancelled: 0, identifiersBySlot: {} };
  }
  const client = api();
  if (
    !client ||
    typeof client.getAllScheduledNotificationsAsync !== 'function' ||
    typeof client.cancelScheduledNotificationAsync !== 'function'
  ) {
    return { ok: false, error: 'unsupported', cancelled: 0 };
  }
  try {
    const allPlanSnapshots = await scheduledPlanSnapshots(client);
    const hasIdentifierFilter = identifiersBySlot != null;
    const requested = flatIdentifiers(identifiersBySlot);
    const requestedSet = hasIdentifierFilter ? new Set(requested) : null;
    const targets = requestedSet
      ? allPlanSnapshots.filter((snapshot) => requestedSet.has(snapshot.identifier))
      : allPlanSnapshots;
    const cancelled = [];
    for (const snapshot of targets) {
      try {
        await client.cancelScheduledNotificationAsync(snapshot.identifier);
        cancelled.push(snapshot);
      } catch (_error) {
        const restored = await restoreSnapshots(client, cancelled);
        const rollbackOk = restored.failedSlots.length === 0;
        return {
          ok: false,
          error: rollbackOk ? 'cancel_failed' : 'rollback_failed',
          cancelled: 0,
          identifiersBySlot: restored.identifiersBySlot,
          ...(rollbackOk ? {} : { restoreFailedSlots: restored.failedSlots }),
        };
      }
    }
    return { ok: true, supported: true, cancelled: targets.length, identifiersBySlot: {} };
  } catch (_error) {
    return { ok: false, error: 'status_failed', cancelled: 0 };
  }
}

export async function reconcilePracticePlanReminders(expectedIdentifiersBySlot = {}) {
  if (Platform.OS === 'web') {
    return {
      ok: true,
      supported: false,
      permission: 'unsupported',
      identifiersBySlot: {},
      statusBySlot: {},
      missingIdentifiers: [],
      orphanIdentifiers: [],
    };
  }
  const client = api();
  if (!client || typeof client.getPermissionsAsync !== 'function') {
    return { ok: false, error: 'unsupported' };
  }
  try {
    const nativePermission = await readPermission(client);
    const permission = permissionLabel(client, nativePermission);
    const snapshots =
      permission === 'granted' && typeof client.getAllScheduledNotificationsAsync === 'function'
        ? await scheduledPlanSnapshots(client)
        : [];
    const identifiersBySlot = groupSnapshots(snapshots);
    const statusBySlot = {};
    for (const [slotId, ids] of Object.entries(identifiersBySlot)) {
      statusBySlot[slotId] = { scheduled: ids.length > 0, count: ids.length, identifiers: [...ids] };
    }

    const expected = normalizeIdentifiersBySlot(expectedIdentifiersBySlot);
    for (const slotId of Object.keys(expected)) {
      if (!statusBySlot[slotId]) {
        statusBySlot[slotId] = { scheduled: false, count: 0, identifiers: [] };
      }
    }
    const expectedIds = new Set(flatIdentifiers(expected));
    const actualIds = new Set(Object.values(identifiersBySlot).flat());
    return {
      ok: true,
      supported: true,
      permission,
      identifiersBySlot,
      statusBySlot,
      missingIdentifiers: [...expectedIds].filter((identifier) => !actualIds.has(identifier)),
      orphanIdentifiers: [...actualIds].filter((identifier) => !expectedIds.has(identifier)),
    };
  } catch (_error) {
    return { ok: false, error: 'status_failed' };
  }
}

export const getPracticePlanReminderStatus = reconcilePracticePlanReminders;

export async function snoozePracticePlanReminder(
  slotId,
  { minutes = PRACTICE_PLAN_SNOOZE_MINUTES, lang = 'pt' } = {}
) {
  const normalizedSlotId = normalizeSlotId(slotId);
  if (!normalizedSlotId || minutes !== PRACTICE_PLAN_SNOOZE_MINUTES) {
    return { ok: false, error: 'invalid_snooze' };
  }
  const client = api();
  if (!client || typeof client.scheduleNotificationAsync !== 'function') {
    return { ok: false, error: 'unsupported', permission: 'unsupported' };
  }
  try {
    const permission = await obtainPermission(client, false);
    if (!permission.ok) return permission;
    await ensureAndroidChannel(client);
    const content = genericContent(normalizedSlotId, lang);
    const identifier = cleanIdentifier(
      await client.scheduleNotificationAsync({
        content: {
          ...content,
          data: {
            ...content.data,
            snooze: true,
          },
        },
        trigger: withChannel({
          type: client.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: PRACTICE_PLAN_SNOOZE_MINUTES * 60,
          repeats: false,
        }),
      })
    );
    if (!identifier) throw new Error('empty_identifier');
    return {
      ok: true,
      identifier,
      slotId: normalizedSlotId,
      minutes: PRACTICE_PLAN_SNOOZE_MINUTES,
      permission: 'granted',
    };
  } catch (_error) {
    return { ok: false, error: 'schedule_failed', permission: 'unknown' };
  }
}

function responseUrl(response) {
  const data = response?.notification?.request?.content?.data;
  if (data?.kind !== PRACTICE_PLAN_NOTIFICATION_KIND) return null;
  const slotId = parsePracticePlanUrl(data?.url);
  return slotId && normalizeSlotId(data?.slotId) === slotId ? practicePlanUrl(slotId) : null;
}

async function clearLastResponse(client) {
  if (typeof client.clearLastNotificationResponse === 'function') {
    client.clearLastNotificationResponse();
  } else if (typeof client.clearLastNotificationResponseAsync === 'function') {
    await client.clearLastNotificationResponseAsync();
  }
}

export async function initialPracticePlanNotificationUrl() {
  const client = api();
  if (!client) return null;
  try {
    const response =
      typeof client.getLastNotificationResponse === 'function'
        ? client.getLastNotificationResponse()
        : typeof client.getLastNotificationResponseAsync === 'function'
        ? await client.getLastNotificationResponseAsync()
        : null;
    const url = responseUrl(response);
    if (url) await clearLastResponse(client);
    return url;
  } catch (_error) {
    return null;
  }
}

export function subscribePracticePlanNotificationUrls(listener) {
  const client = api();
  if (
    typeof listener !== 'function' ||
    !client ||
    typeof client.addNotificationResponseReceivedListener !== 'function'
  ) {
    return () => {};
  }
  const subscription = client.addNotificationResponseReceivedListener((response) => {
    const url = responseUrl(response);
    if (!url) return;
    Promise.resolve(clearLastResponse(client)).catch(() => {});
    listener(url);
  });
  return () => subscription?.remove?.();
}

export const _practicePlanRemindersTest = {
  parseTime,
  normalizeWeekdays,
  isoWeekdayToExpo,
  normalizeSlots,
  normalizeIdentifiersBySlot,
  practicePlanUrl,
  parsePracticePlanUrl,
  responseUrl,
  isPracticePlanNotification,
  practicePlanSlotId,
  scheduleRequestsForSlot,
  setApiForTests(value) {
    notificationApi = value;
  },
  resetApiForTests() {
    notificationApi = undefined;
  },
};
