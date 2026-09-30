// chrome.storage.local wrapper plus the "run a sync" entry point shared by the
// background worker and the dashboard.

import { connect, AuthError } from './d2l.js';
import { syncAll, localDate, courseDeadlines } from './sync.js';
import { UNIVERSITY_DATES } from './config.js';

export const DEFAULT_PREFS = {
  done: {}, // deadline id -> true/false (overrides auto-detected state)
  hidden: {}, // deadline id -> true
  custom: [], // [{ id, course, title, due, allDay, kind }]
};

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
      const snapshot = await syncAll(client);
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

// Deadline is done if the user said so, otherwise if Brightspace shows a submission/grade.
export function isDone(d, prefs) {
  const manual = prefs.done[d.id];
  return manual ?? !!d.autoDone;
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

export function allDeadlines(snapshot, prefs) {
  const fromSync = (snapshot?.courses || []).flatMap(courseDeadlines);
  return [...fromSync, ...universityDates, ...prefs.custom];
}
