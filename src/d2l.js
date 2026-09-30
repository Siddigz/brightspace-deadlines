// Minimal Brightspace (D2L Valence) client that rides on the browser's signed-in session.
//
// Two transports:
//   direct - fetch from the extension with the user's cookies (host permission lets us).
//   tab    - run the fetch inside an open Brightspace tab, for when direct requests are
//            rejected (e.g. cookie SameSite rules). Opens a background tab if none exists.

import { BASE } from './config.js';

export const LP = '/d2l/api/lp/1.63';
export const LE = '/d2l/api/le/1.99';

export class AuthError extends Error {}

async function directGet(path) {
  const r = await fetch(BASE + path, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (r.redirected && /login/i.test(r.url)) return { status: 401 };
  if (!r.ok) return { status: r.status };
  const type = r.headers.get('content-type') || '';
  if (!type.includes('json')) return { status: 401 }; // login page served with 200
  return { status: 200, body: await r.json() };
}

async function brightspaceTab() {
  const [existing] = await chrome.tabs.query({ url: BASE + '/*' });
  if (existing) return existing.id;
  const tab = await chrome.tabs.create({ url: BASE + '/d2l/home', active: false });
  await new Promise((resolve) => {
    const onUpdated = (id, info) => {
      if (id === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  return tab.id;
}

async function tabGet(tabId, path) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [path],
    func: async (p) => {
      const r = await fetch(p, { headers: { Accept: 'application/json' } });
      if (!r.ok) return { status: r.status };
      if (!(r.headers.get('content-type') || '').includes('json')) return { status: 401 };
      return { status: 200, body: await r.json() };
    },
  });
  return result;
}

export async function connect() {
  const who = await directGet(`${LP}/users/whoami`);
  if (who.status === 200) return new Client(directGet, who.body);

  const tabId = await brightspaceTab();
  const viaTab = (path) => tabGet(tabId, path);
  const who2 = await viaTab(`${LP}/users/whoami`);
  if (who2.status === 200) return new Client(viaTab, who2.body);
  throw new AuthError('Not signed in to Brightspace');
}

export class Client {
  constructor(transport, me) {
    this.transport = transport;
    this.me = me;
  }

  // Returns the parsed body, or null when the endpoint is forbidden/missing for this user.
  async get(path) {
    const res = await this.transport(path);
    if (res.status === 200) return res.body;
    if (res.status === 401) throw new AuthError('Brightspace session expired');
    return null;
  }

  // Follows D2L's ObjectListPage paging ({ Objects, Next }).
  async getAllObjects(path) {
    const out = [];
    let page = await this.get(path);
    while (page) {
      if (Array.isArray(page)) return out.concat(page);
      out.push(...(page.Objects || []));
      if (!page.Next) break;
      page = await this.get(new URL(page.Next, BASE).pathname + new URL(page.Next, BASE).search);
    }
    return out;
  }

  // Follows D2L's PagedResultSet paging ({ PagingInfo: { Bookmark, HasMoreItems }, Items }).
  async getAllItems(path) {
    const out = [];
    let bookmark = '';
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const page = await this.get(bookmark ? `${path}${sep}bookmark=${encodeURIComponent(bookmark)}` : path);
      if (!page) break;
      out.push(...page.Items);
      if (!page.PagingInfo?.HasMoreItems) break;
      bookmark = page.PagingInfo.Bookmark;
    }
    return out;
  }
}
