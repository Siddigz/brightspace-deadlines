// Phone page start-up: load your data from the gist, then run the extension's own dashboard
// with chrome.* stood in for. Ticks are saved here first and merged into the gist.

import { readGist, syncPrefs, gistId } from './src/gist.js';
import { mergePrefs } from './src/prefs.js';

const SETTINGS = 'tracker-settings';
const CACHE = 'tracker-cache';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const settings = read(SETTINGS);
if (!settings?.gistId) setup();
else await start();

function setup() {
  const form = document.getElementById('setup');
  form.hidden = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    write(SETTINGS, { gistId: gistId(form.gist.value), token: form.token.value.trim() || null });
    location.reload();
  });
}

async function start() {
  // tracker.data = data.json from the extension; prefs = your ticks; base = last copy agreed with the gist.
  const tracker = globalThis.tracker = { data: null, prefs: {}, base: null, error: null, ...read(CACHE) };
  const listeners = [];
  const notify = () => listeners.forEach((f) => f({}));
  const persist = () => write(CACHE, { data: tracker.data, prefs: tracker.prefs, base: tracker.base });

  let queue = Promise.resolve();
  const serial = (fn) => (queue = queue.then(fn, fn));

  let pulledAt = 0;
  const pull = () => serial(async () => {
    try {
      const files = await readGist(settings.gistId, settings.token);
      tracker.data = files['data.json'];
      tracker.prefs = settings.token
        ? await syncPrefs(settings, tracker.prefs, tracker.base, files['prefs.json'] ?? null)
        : mergePrefs(tracker.base, tracker.prefs, files['prefs.json'] || {}); // read-only: ticks stay on this phone
      tracker.base = settings.token ? tracker.prefs : files['prefs.json'] || {};
      tracker.error = null;
      pulledAt = Date.now();
      persist();
    } catch (e) {
      tracker.error = e.message;
    }
  });

  tracker.savePrefs = (prefs) => {
    tracker.prefs = prefs;
    persist();
    if (!settings.token) return;
    serial(async () => {
      try {
        const merged = await syncPrefs(settings, tracker.prefs, tracker.base);
        const changed = JSON.stringify(merged) !== JSON.stringify(tracker.prefs);
        tracker.prefs = tracker.base = merged;
        tracker.error = null;
        persist();
        if (changed) notify();
      } catch (e) {
        tracker.error = `Couldn't save to GitHub: ${e.message}`;
        notify();
      }
    });
  };

  globalThis.chrome = {
    storage: { onChanged: { addListener: (f) => listeners.push(f) } },
    runtime: {
      // "Refresh" (and the dashboard's own stale check) re-reads the gist.
      async sendMessage(msg) {
        if (msg?.type === 'sync' && Date.now() - pulledAt > 15e3) await pull();
      },
    },
  };

  await pull();
  if (!tracker.data) {
    document.getElementById('setup').hidden = false;
    document.querySelector('#setup .hint').textContent = `Couldn't load your data: ${tracker.error}`;
    setup();
    return;
  }

  document.getElementById('app').hidden = false;
  document.getElementById('forget').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem(SETTINGS);
    localStorage.removeItem(CACHE);
    location.reload();
  });
  // Back from another app: show the latest.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && Date.now() - pulledAt > 60e3) {
      await pull();
      notify();
    }
  });

  await import('./src/dashboard.js');
}
