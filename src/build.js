// A fingerprint of the background worker's source files as they are on disk right now.
//
// Chrome keeps running the worker's old code after its files change, until the extension is
// reloaded; pages like the dashboard always load fresh files. The worker records this fingerprint
// when it's (re)installed and the dashboard compares it (see fresh.js), so a stale worker gets
// reloaded instead of quietly syncing with old code.

const FILES = [
  'manifest.json', 'src/background.js', 'src/store.js', 'src/sync.js', 'src/d2l.js', 'src/config.js',
  'src/prefs.js', 'src/coursesite.js', 'src/phone.js', 'src/gist.js', 'src/build.js',
];

export async function codeHash() {
  const texts = await Promise.all(FILES.map(async (f) => (await fetch(chrome.runtime.getURL(f), { cache: 'no-store' })).text()));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texts.join('\0')));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
