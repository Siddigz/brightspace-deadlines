import { load, runSync, isDone, allDeadlines } from './store.js';
import { upload, syncPhonePrefs } from './phone.js';
import { codeHash } from './build.js';

const DASHBOARD = chrome.runtime.getURL('dashboard.html');
const SYNC_EVERY_MIN = 180;

// Every sync also refreshes the phone copy (a no-op until it's set up on the options page).
async function syncAndUpload() {
  const result = await runSync();
  await upload();
  return result;
}

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ url: DASHBOARD });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD });
  }
});

// Note which code this worker is running. Only done when the extension has just been loaded or
// reloaded (the one time the worker's code is sure to match the files), never on an ordinary
// wake-up, when Chrome may still be running an older copy. The dashboard compares it (fresh.js).
let recorded = null;
const recordBuild = () => (recorded ??= (async () => {
  const { reopenDashboard, syncAfterReload } = await chrome.storage.local.get(['reopenDashboard', 'syncAfterReload']);
  await chrome.storage.local.set({ codeHash: await codeHash() });
  if (!reopenDashboard && !syncAfterReload) return;
  // We were reloaded for being stale (by the dashboard, or by a scheduled sync): sync with the new code.
  await chrome.storage.local.remove(['reopenDashboard', 'syncAfterReload']);
  if (reopenDashboard) await chrome.tabs.create({ url: DASHBOARD });
  await syncAndUpload();
})());

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sync', { periodInMinutes: SYNC_EVERY_MIN, delayInMinutes: 1 });
  recordBuild();
});
// Belt and braces: the first start after a requested reload, in case onInstalled doesn't fire.
chrome.storage.local.get(['reopenDashboard', 'syncAfterReload'])
  .then(({ reopenDashboard, syncAfterReload }) => (reopenDashboard || syncAfterReload) && recordBuild());

// A scheduled sync with old code (files changed since the extension last loaded) would send the
// phone stale deadlines, so reload first and sync from the fresh worker instead.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'sync') return;
  const { codeHash: running } = await chrome.storage.local.get('codeHash');
  if (running && running !== await codeHash()) {
    await chrome.storage.local.set({ syncAfterReload: true });
    chrome.runtime.reload();
    return;
  }
  await syncAndUpload();
});

// Dashboard asks the worker to sync so only one runs at a time.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'sync') {
    syncAndUpload().then(reply);
    return true;
  }
  // Dashboard opened: pick up anything ticked on the phone.
  if (msg?.type === 'pull') syncPhonePrefs();
});

// Badge = unfinished things due in the next 48 hours. Routine time slots (lectures, tutorial
// sessions, university dates) aren't due, so they don't count.
const ROUTINE = new Set(['lecture', 'tutorial', 'date']);
async function updateBadge() {
  const { snapshot, prefs } = await load();
  const now = Date.now();
  const soon = allDeadlines(snapshot, prefs).filter((d) => {
    const t = Date.parse(d.due);
    if (d.slot && ROUTINE.has(d.kind)) return false;
    return t > now && t - now < 48 * 3600e3 && !isDone(d, prefs) && !prefs.hidden[d.id];
  }).length;
  await chrome.action.setBadgeText({ text: soon ? String(soon) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

chrome.storage.onChanged.addListener(updateBadge);

// Ticked or hid something: send it to the phone copy (batched, in case you tick several).
let prefsTimer = null;
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.prefs) return;
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(syncPhonePrefs, 1500);
});
chrome.runtime.onStartup.addListener(updateBadge);
