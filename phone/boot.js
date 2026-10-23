// Phone page start-up, run by the public sign-in page (phone-public/loader.js) once it has
// fetched this code from your private repo. Loads your data from the repo, then runs the
// extension's own dashboard with chrome.* stood in for. Ticks are saved here first and merged
// into the repo.

import { readJSON, syncPrefs } from './src/repo.js';

// { repo, token, forget } from the sign-in page.
const cfg = globalThis.signedIn;
const CACHE = 'tracker-cache';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// tracker.data = data.json from the extension; prefs = your ticks; base = last copy agreed with the repo.
const tracker = globalThis.tracker = { data: null, prefs: {}, base: null, error: null, ...read(CACHE) };
const listeners = [];
const notify = () => listeners.forEach((f) => f({}));
const persist = () => write(CACHE, { data: tracker.data, prefs: tracker.prefs, base: tracker.base });

let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

let pulledAt = 0;
const pull = () => serial(async () => {
  try {
    const data = await readJSON(cfg, 'data.json');
    if (!data) throw new Error('No data in the repo yet. Sync once on the laptop.');
    tracker.data = data;
    tracker.prefs = tracker.base = await syncPrefs(cfg, tracker.prefs, tracker.base);
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
  serial(async () => {
    try {
      const merged = await syncPrefs(cfg, tracker.prefs, tracker.base);
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
    // "Refresh" (and the dashboard's own stale check) re-reads the repo.
    async sendMessage(msg) {
      if (msg?.type === 'sync' && Date.now() - pulledAt > 15e3) await pull();
    },
  },
};

const forget = (e) => {
  e?.preventDefault();
  localStorage.removeItem(CACHE);
  cfg.forget();
};

await pull();
if (!tracker.data) {
  const p = document.getElementById('load-error');
  p.hidden = false;
  p.textContent = `Couldn't load your data: ${tracker.error} `;
  const a = Object.assign(document.createElement('a'), { href: '#', textContent: 'Sign out' });
  a.addEventListener('click', forget);
  p.append(a);
} else {
  document.getElementById('app').hidden = false;
  document.getElementById('forget').addEventListener('click', forget);
  // Back from another app: show the latest.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && Date.now() - pulledAt > 60e3) {
      await pull();
      notify();
    }
  });
  await import('./src/dashboard.js');
}
