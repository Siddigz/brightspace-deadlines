// Builds the phone page into phone-dist/, ready to push to a public GitHub Pages repo.
// Only generic code goes in: config.js, the dev fixture and your data never leave this repo
// (the phone gets those from your secret gist).

import { cp, rm, mkdir, writeFile } from 'node:fs/promises';

const OUT = 'phone-dist';
// Shared with the extension unchanged.
const SHARED = ['src/dashboard.js', 'src/grades.js', 'src/prefs.js', 'src/gist.js', 'dashboard.css'];

// Keep phone-dist/.git (the Pages repo) between builds.
await mkdir(OUT, { recursive: true });
for (const f of ['index.html', 'boot.js', 'manifest.webmanifest', '.nojekyll', 'src', 'dashboard.css']) {
  await rm(`${OUT}/${f}`, { recursive: true, force: true });
}
await cp('phone', OUT, { recursive: true });
for (const f of SHARED) await cp(f, `${OUT}/${f}`);
await writeFile(`${OUT}/.nojekyll`, '');
console.log(`Built ${OUT}/. Push it to your Pages repo (see README, "Phone").`);
