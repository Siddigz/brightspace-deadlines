// Builds the public half of the phone page into phone-dist/. GitHub Actions publishes it to this
// repo's GitHub Pages (.github/workflows/phone-page.yml). It's only a sign-in box (phone-public/) plus two plain icons: the page's real code
// and your data are uploaded by the extension to your private repo (see src/phone.js), so
// nothing here says what the page is.

import { cp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { deflateSync, crc32 } from 'node:zlib';

const OUT = 'phone-dist';

// Replace everything in phone-dist/ (keeping a .git there, if you push it somewhere yourself).
await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT)) if (f !== '.git') await rm(`${OUT}/${f}`, { recursive: true, force: true });
await cp('phone-public', OUT, { recursive: true });
await writeFile(`${OUT}/.nojekyll`, '');

// A grey circle on near-black.
function icon(size) {
  const row = 1 + size * 3;
  const px = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / size;
      const v = d < 0.22 ? 0xcc : 0x11;
      px.fill(v, y * row + 1 + x * 3, y * row + 4 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(px)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const s of [192, 512]) await writeFile(`${OUT}/icon-${s}.png`, icon(s));

console.log(`Built ${OUT}/. Pushing phone-public/ changes to main publishes it (see README, "Phone").`);
