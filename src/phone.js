// Mirrors your data into the secret gist the phone page reads (see src/gist.js). Set up from the
// extension's options page; does nothing until then.

import { load, allDeadlines } from './store.js';
import { createGist, writeGist, syncPrefs } from './gist.js';
import { COURSE_COLORS, CODE_LABELS, BASE, OUTLINES, LETTERS } from './config.js';

// { token, gistId, base, uploadedAt, error }
export async function phoneSettings() {
  const { phone = null } = await chrome.storage.local.get('phone');
  return phone;
}

async function patchSettings(patch) {
  await chrome.storage.local.set({ phone: { ...(await phoneSettings()), ...patch } });
}

// Everything the phone page shows, with deadlines already worked out (config.js stays private).
async function dataFile() {
  const { snapshot, syncError } = await load();
  return {
    snapshot,
    syncError,
    deadlines: allDeadlines(snapshot, { custom: [] }),
    config: { COURSE_COLORS, CODE_LABELS, BASE, OUTLINES, LETTERS },
  };
}

export async function setUp(token, gistId) {
  if (!gistId) {
    const { prefs } = await load();
    gistId = await createGist(token, { 'data.json': await dataFile(), 'prefs.json': prefs });
    await chrome.storage.local.set({ phone: { token, gistId, base: prefs } });
  } else {
    await chrome.storage.local.set({ phone: { token, gistId, base: null } });
  }
  await upload();
  return gistId;
}

// One at a time, so two prefs merges never race.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function guard(fn) {
  const phone = await phoneSettings();
  if (!phone?.gistId || !phone.token) return;
  try {
    await fn(phone);
    if (phone.error) await patchSettings({ error: null });
  } catch (e) {
    await patchSettings({ error: e.message });
  }
}

// Fold in ticks made on the phone, and send ours.
export const syncPhonePrefs = () => serial(() => guard(async (phone) => {
  const { prefs } = await load();
  const merged = await syncPrefs(phone, prefs, phone.base);
  if (JSON.stringify(merged) !== JSON.stringify(prefs)) await chrome.storage.local.set({ prefs: merged });
  await patchSettings({ base: merged });
}));

export const upload = () => serial(() => guard(async (phone) => {
  await writeGist(phone.gistId, phone.token, { 'data.json': await dataFile() });
  await patchSettings({ uploadedAt: new Date().toISOString() });
})).then(syncPhonePrefs);
