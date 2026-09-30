import { load, runSync, isDone, allDeadlines } from './store.js';

const DASHBOARD = chrome.runtime.getURL('dashboard.html');
const SYNC_EVERY_MIN = 180;

chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ url: DASHBOARD });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DASHBOARD });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sync', { periodInMinutes: SYNC_EVERY_MIN, delayInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sync') await runSync();
});

// Dashboard asks the worker to sync so only one runs at a time.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'sync') {
    runSync().then(reply);
    return true;
  }
});

// Badge = unfinished things due in the next 48 hours.
async function updateBadge() {
  const { snapshot, prefs } = await load();
  const now = Date.now();
  const soon = allDeadlines(snapshot, prefs).filter((d) => {
    const t = Date.parse(d.due);
    return t > now && t - now < 48 * 3600e3 && !isDone(d, prefs) && !prefs.hidden[d.id];
  }).length;
  await chrome.action.setBadgeText({ text: soon ? String(soon) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
}

chrome.storage.onChanged.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
