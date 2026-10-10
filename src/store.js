// chrome.storage.local wrapper plus the "run a sync" entry point shared by the
// background worker and the dashboard.

import { connect, AuthError } from './d2l.js';
import { syncAll, localDate, courseDeadlines } from './sync.js';
import { UNIVERSITY_DATES, PERSONAL_DEADLINES } from './config.js';
import { DEFAULT_PREFS, applyGroups } from './prefs.js';
import { attachSites } from './coursesite.js';

export { DEFAULT_PREFS, isDone } from './prefs.js';

export async function load() {
  const { snapshot = null, prefs = {}, syncError = null } = await chrome.storage.local.get(['snapshot', 'prefs', 'syncError']);
  return { snapshot, prefs: { ...DEFAULT_PREFS, ...prefs }, syncError };
}

export async function savePrefs(prefs) {
  await chrome.storage.local.set({ prefs });
}

let inFlight = null;

export function runSync() {
  inFlight ??= (async () => {
    try {
      const client = await connect();
      const { snapshot: previous = null } = await chrome.storage.local.get('snapshot');
      const snapshot = await attachSites(await syncAll(client), previous);
      await chrome.storage.local.set({ snapshot, syncError: null });
      return { ok: true, snapshot };
    } catch (e) {
      const syncError = { at: new Date().toISOString(), auth: e instanceof AuthError, message: e.message };
      await chrome.storage.local.set({ syncError });
      return { ok: false, error: syncError };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

const universityDates = UNIVERSITY_DATES.map((x) => ({
  id: `uni:${x.date}:${x.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  course: 'Carleton',
  title: x.title,
  kind: 'date',
  due: localDate(x.date),
  end: x.end ? localDate(x.end) : null,
  slot: true,
  allDay: true,
  autoDone: false,
}));

const personalDeadlines = PERSONAL_DEADLINES.map((x) => ({
  id: `personal:${x.date}:${x.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  course: 'Personal',
  title: x.title,
  kind: x.kind || 'other',
  due: localDate(x.date),
  end: x.end ? localDate(x.end) : null,
  slot: !!x.end || !!x.allDay,
  allDay: !!x.allDay,
  autoDone: false,
  url: x.url,
  checklist: x.checklist,
}));

export function allDeadlines(snapshot, prefs) {
  const fromSync = (snapshot?.courses || []).flatMap(courseDeadlines);
  return applyGroups([...fromSync, ...universityDates, ...personalDeadlines, ...prefs.custom], prefs);
}
