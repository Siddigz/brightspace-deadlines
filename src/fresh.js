// Runs on the dashboard (extension only): if the background worker is running older code than
// what's on disk, reload the extension so syncing uses the current code. The worker reopens the
// dashboard and syncs straight after (see background.js).

import { codeHash } from './build.js';

const [onDisk, { codeHash: running, reloadAskedAt = 0 }] = await Promise.all([
  codeHash(),
  chrome.storage.local.get(['codeHash', 'reloadAskedAt']),
]);

if (onDisk !== running) {
  if (Date.now() - reloadAskedAt > 60e3) {
    await chrome.storage.local.set({ reloadAskedAt: Date.now(), reopenDashboard: true });
    chrome.runtime.reload();
  } else {
    // Just tried and it's still stale: don't loop, say what to do.
    const note = document.createElement('div');
    note.className = 'banner';
    note.textContent = 'The extension is running old code and reloading it didn\'t help. Open chrome://extensions and press the reload arrow on Brightspace Deadlines.';
    document.querySelector('.top').after(note);
  }
}
