// A secret GitHub gist that carries your data to the phone page. It holds two files:
// data.json (written by the extension after each sync) and prefs.json (written by both sides).

import { mergePrefs } from './prefs.js';

const API = 'https://api.github.com/gists';

const headers = (token) => ({
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function call(url, token, init = {}) {
  const res = await fetch(url, { ...init, cache: 'no-store', headers: { ...headers(token), ...init.headers } });
  if (!res.ok) throw new Error(`GitHub said ${res.status}${res.status === 401 ? ' (check the token)' : res.status === 404 ? ' (no such gist, or the token can\'t see it)' : ''}`);
  return res.json();
}

// Gist id from either the id itself or a gist URL.
export const gistId = (s) => s.trim().replace(/\/+$/, '').split('/').pop();

// -> { 'data.json': {...}, 'prefs.json': {...} }, parsed. `only` limits which files are read.
export async function readGist(id, token, only = null) {
  const gist = await call(`${API}/${id}`, token);
  const out = {};
  for (const [name, f] of Object.entries(gist.files)) {
    if (only && !only.includes(name)) continue;
    // Big files come back truncated; the raw URL has the whole thing.
    const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
    out[name] = JSON.parse(text);
  }
  return out;
}

export async function writeGist(id, token, files) {
  const body = { files: Object.fromEntries(Object.entries(files).map(([name, v]) => [name, { content: JSON.stringify(v) }])) };
  await call(`${API}/${id}`, token, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function createGist(token, files) {
  const body = {
    description: 'Course Tracker data (secret gist; holds your deadlines and grades)',
    public: false,
    files: Object.fromEntries(Object.entries(files).map(([name, v]) => [name, { content: JSON.stringify(v) }])),
  };
  return (await call(API, token, { method: 'POST', body: JSON.stringify(body) })).id;
}

// Merge our prefs with the gist's and write the result back if it changed. Returns the merged
// prefs, which become the new `base`. Pass `remote` if you've already read prefs.json.
export async function syncPrefs({ gistId: id, token }, local, base, remote) {
  if (remote === undefined) remote = (await readGist(id, token, ['prefs.json']))['prefs.json'];
  const merged = remote ? mergePrefs(base, local, remote) : local;
  if (JSON.stringify(merged) !== JSON.stringify(remote)) await writeGist(id, token, { 'prefs.json': merged });
  return merged;
}
