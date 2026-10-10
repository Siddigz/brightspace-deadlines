// Course websites outside Brightspace (see COURSE_SITES in config.js). The COMP 3000 wiki lists
// when each tutorial is released and when each assignment is due; this reads those tables on
// every sync so date changes show up without editing config.js.

import { COURSE_SITES } from './config.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// 'Oct. 15, 14:30' -> '2026-10-15T14:30'; 'Nov. 2' -> '2026-11-02'; anything else -> null.
export function siteDate(text, year) {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/.exec(text);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (month === -1) return null;
  const day = `${year}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return m[3] ? `${day}T${m[3].padStart(2, '0')}:${m[4]}` : day;
}

// Rows of the table under a "==Heading==": [[date text, link text], ...].
function tableRows(raw, heading) {
  const start = raw.search(new RegExp(`^==\\s*${heading}\\s*==`, 'mi'));
  if (start === -1) return [];
  const rest = raw.slice(start + 2);
  const end = rest.search(/^==[^=]/m);
  const section = end === -1 ? rest : rest.slice(0, end);
  const text = (cell) => cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return [...section.matchAll(/<tr[\s\S]*?<\/tr>/g)]
    .map(([row]) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])))
    .filter((cells) => cells.length >= 2);
}

// Wiki source of the course page -> { tutorials: [{ n, available, page }], assignments: [{ n, due, page }] }.
// `page` is the wiki page the row links to.
export function parseCourseSite(raw, year) {
  const numbered = (heading, word, key) => tableRows(raw, heading).flatMap(([date, what]) => {
    const link = new RegExp(`\\[\\[([^|\\]]+)\\|\\s*${word}\\s+(\\d+)\\s*\\]\\]`, 'i').exec(what);
    const when = siteDate(date, year);
    return link && when ? [{ n: Number(link[2]), [key]: when, page: link[1].trim() }] : [];
  });
  return {
    tutorials: numbered('Tutorials', 'Tutorial', 'available'),
    assignments: numbered('Assignments', 'Assignment', 'due'),
  };
}

// Adds `site` to each course that has a website. If the site can't be read, the copy from
// the previous snapshot is kept so its deadlines don't vanish.
export async function attachSites(snapshot, previous) {
  for (const course of snapshot.courses) {
    const cfg = COURSE_SITES[course.code];
    if (!cfg) continue;
    const old = previous?.courses?.find((c) => c.code === course.code)?.site || null;
    try {
      const res = await fetch(cfg.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const site = parseCourseSite(await res.text(), cfg.year);
      // An empty result means the page changed shape; don't trust it over what we had.
      const usable = site.tutorials.length || site.assignments.length;
      if (usable && cfg.api) await markPosted(site, cfg.api);
      course.site = usable ? { ...site, fetchedAt: snapshot.syncedAt } : old;
      course.siteError = usable ? null : 'the page no longer has the tutorial and assignment tables';
    } catch (e) {
      course.site = old;
      course.siteError = await whyFailed(cfg.url, e);
    }
  }
  return snapshot;
}

// Sets `posted` on each tutorial and assignment: whether its wiki page exists yet (a link on the
// course page goes up long before the page itself). Left unset if the wiki can't say.
async function markPosted(site, api) {
  const all = [...site.tutorials, ...site.assignments];
  try {
    const titles = encodeURIComponent(all.map((x) => x.page).join('|'));
    const res = await fetch(`${api}?action=query&format=json&titles=${titles}`, { cache: 'no-store' });
    const { query } = await res.json();
    const renamed = new Map((query.normalized || []).map((x) => [x.from, x.to]));
    const exists = new Set(Object.values(query.pages).filter((p) => !('missing' in p)).map((p) => p.title));
    for (const x of all) x.posted = exists.has(renamed.get(x.page) || x.page);
  } catch {}
}

// A blocked cross-site request only says "Failed to fetch"; say if it's Chrome's site access.
async function whyFailed(url, e) {
  const origin = `${new URL(url).origin}/*`;
  const allowed = await globalThis.chrome?.permissions?.contains({ origins: [origin] }).catch(() => true);
  if (allowed === false) return `Chrome hasn't given the extension access to ${new URL(url).host}`;
  return /^\d+$/.test(e.message) ? `the site answered ${e.message}` : e.message;
}

// What to tell the user about course websites that couldn't be read, if anything.
export function siteProblems(snapshot) {
  return (snapshot?.courses || []).filter((c) => COURSE_SITES[c.code]).flatMap((c) => {
    if (c.siteError) {
      return [`Couldn't read the ${c.code} course website (${c.siteError}). ${c.site ? 'Its dates are from the last time it worked.' : 'Its tutorials are missing until it can.'}`];
    }
    // Still missing after a sync means the background worker is running old code.
    return c.site ? [] : [`The ${c.code} course website hasn't been read yet, so its tutorials are missing. Press Sync now. If this stays, reload the extension at chrome://extensions (the ↻ on its card), then sync again.`];
  });
}
