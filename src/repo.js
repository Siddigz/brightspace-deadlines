// A private GitHub repo that carries your data to the phone page, on its own branch (`data`) so
// these writes never touch your code on main. The branch holds:
//   data.json   written by the extension after each sync
//   prefs.json  your ticks, written by both sides
//   app.json    the phone page's own code, written by the extension (see phone.js)
// Every call needs a fine-grained token with Contents: Read and write on that one repo.

import { mergePrefs } from './prefs.js';

const API = 'https://api.github.com/repos';
const BRANCH = 'data';

// "owner/name" from either that or a github.com URL.
export const repoName = (s) => s.trim().replace(/\.git$/, '').replace(/\/+$/, '').split('/').slice(-2).join('/');

const url = (repo, path = '') => `${API}/${repo}/contents/${path}?ref=${BRANCH}`;

async function call(href, token, init = {}, raw = false) {
  const res = await fetch(href, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (res.status === 404 && !init.method) return null;
  if (!res.ok) {
    const why = { 401: ' (check the token)', 403: ' (the token can\'t write to this repo)', 404: ' (no such repo, or the token can\'t see it)', 409: ' (changed meanwhile)' }[res.status] || '';
    const err = new Error(`GitHub said ${res.status}${why}`);
    err.status = res.status;
    throw err;
  }
  return raw ? res.text() : res.json();
}

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

// Throws unless the token can see the repo.
export async function checkRepo({ repo, token }) {
  if (!(await call(`${API}/${repo}`, token))) throw new Error('GitHub said 404 (no such repo, or the token can\'t see it)');
}

// Parsed contents of a JSON file, or null if it isn't there yet.
export async function readJSON({ repo, token }, path) {
  const text = await call(url(repo, path), token, {}, true);
  return text == null ? null : JSON.parse(text);
}

// { value, sha } for a small file (under 1 MB), or { value: null, sha: null }.
async function readWithSha({ repo, token }, path) {
  const f = await call(url(repo, path), token);
  return f ? { value: JSON.parse(fromBase64(f.content)), sha: f.sha } : { value: null, sha: null };
}

// sha of every file at the top of the repo, without downloading them.
async function shas({ repo, token }) {
  const list = (await call(url(repo), token)) || [];
  return Object.fromEntries(list.map((f) => [f.path, f.sha]));
}

async function put({ repo, token }, path, value, sha) {
  const body = { message: `Update ${path}`, branch: BRANCH, content: toBase64(JSON.stringify(value)), ...(sha ? { sha } : {}) };
  await call(`${API}/${repo}/contents/${path}`, token, { method: 'PUT', body: JSON.stringify(body) });
}

// Write files that only the extension writes (data.json, app.json).
export async function writeJSON(cfg, files) {
  const known = await shas(cfg);
  for (const [path, value] of Object.entries(files)) await put(cfg, path, value, known[path]);
}

// Merge our prefs with the repo's and write the result back if it changed. Returns the merged
// prefs, which become the new `base`. If the other side wrote in between, merge again.
export async function syncPrefs(cfg, local, base) {
  for (let attempt = 0; ; attempt++) {
    const { value: remote, sha } = await readWithSha(cfg, 'prefs.json');
    const merged = remote ? mergePrefs(base, local, remote) : local;
    if (JSON.stringify(merged) === JSON.stringify(remote)) return merged;
    try {
      await put(cfg, 'prefs.json', merged, sha);
      return merged;
    } catch (e) {
      if (attempt >= 2 || (e.status !== 409 && e.status !== 422)) throw e;
    }
  }
}
