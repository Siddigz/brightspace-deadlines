// Phone stand-in for the extension's store.js: same exports, backed by the gist (see boot.js).

import { DEFAULT_PREFS, applyGroups } from './prefs.js';

export { DEFAULT_PREFS, isDone } from './prefs.js';

const t = () => globalThis.tracker;

export async function load() {
  const { data, prefs, error } = t();
  const syncError = error ? { at: new Date().toISOString(), auth: false, message: error } : data.syncError;
  return { snapshot: data.snapshot, prefs: { ...DEFAULT_PREFS, ...prefs }, syncError };
}

export async function savePrefs(prefs) {
  t().savePrefs(prefs);
}

// Course websites are read by the extension, not here.
export const siteProblems = () => [];

// Deadlines arrive already worked out by the extension; only your own additions live in prefs.
export function allDeadlines(_snapshot, prefs) {
  return applyGroups([...t().data.deadlines, ...prefs.custom], prefs);
}
