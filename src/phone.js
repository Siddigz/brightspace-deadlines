// Mirrors your data into the private repo the phone page reads (see src/repo.js). Set up from the
// extension's options page; does nothing until then.
//
// The phone page's own code goes in that repo too (app.json), so the public page is only a
// sign-in box that fetches it (phone-public/). Nothing about what this is lives in public.

import { load, allDeadlines } from './store.js';
import { checkRepo, writeJSON, syncPrefs } from './repo.js';
import { COURSE_COLORS, CODE_LABELS, BASE, OUTLINES, LETTERS } from './config.js';

// Phone page files: path on the phone -> file in this extension.
const APP_FILES = {
  'boot.js': 'phone/boot.js',
  'src/config.js': 'phone/src/config.js',
  'src/store.js': 'phone/src/store.js',
  'src/dashboard.js': 'src/dashboard.js',
  'src/grades.js': 'src/grades.js',
  'src/prefs.js': 'src/prefs.js',
  'src/repo.js': 'src/repo.js',
};

// { token, repo, base, uploadedAt, appHash, dataHash, error }
export async function phoneSettings() {
  const { phone = null } = await chrome.storage.local.get('phone');
  return phone;
}

async function patchSettings(patch) {
  await chrome.storage.local.set({ phone: { ...(await phoneSettings()), ...patch } });
}

const text = async (f) => (await fetch(chrome.runtime.getURL(f), { cache: 'no-store' })).text();

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

// The phone page's code, read fresh from disk, and a fingerprint of it.
async function appFile() {
  const paths = Object.keys(APP_FILES);
  const [body, css, ...sources] = await Promise.all([text('phone/app.html'), text('dashboard.css'), ...paths.map((p) => text(APP_FILES[p]))]);
  const app = { title: 'Brightspace Deadlines', entry: 'boot.js', body, css, files: Object.fromEntries(paths.map((p, i) => [p, sources[i]])) };
  const hash = await sha256(app);
  return { app: { ...app, hash }, hash };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A fingerprint of the data leaving out when the sync ran (or failed), so a sync that found nothing new
// doesn't write (each write is a commit in the repo).
const dataHash = (data) => sha256({
  ...data,
  snapshot: data.snapshot && { ...data.snapshot, syncedAt: null },
  syncError: data.syncError && { ...data.syncError, at: null },
});

export async function setUp(token, repo) {
  await checkRepo({ repo, token });
  await chrome.storage.local.set({ phone: { token, repo, base: null } });
  await upload({ force: true });
  const phone = await phoneSettings();
  if (phone.error) throw new Error(phone.error);
}

// One at a time, so two prefs merges never race.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function guard(fn) {
  const phone = await phoneSettings();
  if (!phone?.repo || !phone.token) return;
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

// Data and the page's code, each only when it has changed (or `force`).
export const upload = ({ force = false } = {}) => serial(() => guard(async (phone) => {
  const data = await dataFile();
  const [{ app, hash }, dHash] = await Promise.all([appFile(), dataHash(data)]);
  const files = {};
  if (force || dHash !== phone.dataHash) files['data.json'] = data;
  if (force || hash !== phone.appHash) files['app.json'] = app;
  if (Object.keys(files).length) await writeJSON(phone, files);
  await patchSettings({ uploadedAt: new Date().toISOString(), appHash: hash, dataHash: dHash });
})).then(syncPhonePrefs);
