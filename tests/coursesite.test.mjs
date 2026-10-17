import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCourseSite, siteDate } from '../src/coursesite.js';
import { courseDeadlines } from '../src/sync.js';

// The COMP 3000 wiki page source as it was on 2026-10-09.
const raw = await readFile('tests/fixtures-comp3000-site.txt', 'utf8');

test('site dates: month and day, optional time, junk ignored', () => {
  assert.equal(siteDate('Sep. 14', 2026), '2026-09-14');
  assert.equal(siteDate('Oct 5', 2026), '2026-10-05');
  assert.equal(siteDate('Oct. 15, 14:30', 2026), '2026-10-15T14:30');
  assert.equal(siteDate('Sep. 9, 10', 2026), '2026-09-09');
  assert.equal(siteDate('TBA', 2026), null);
});

test('COMP 3000 site: tutorials and assignments are read from their tables', () => {
  const site = parseCourseSite(raw, 2026);
  assert.deepEqual(site.tutorials.map((t) => t.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(site.tutorials[3].available, '2026-10-05');
  assert.equal(site.tutorials[4].available, '2026-11-02');
  assert.deepEqual(site.assignments.map((x) => [x.n, x.due]), [
    [1, '2026-10-05'], [2, '2026-10-15T14:30'], [3, '2026-11-16'], [4, '2026-12-07'],
  ]);
  assert.equal(site.assignments[1].page, 'Operating Systems 2026F: Assignment 2');
  assert.equal(site.tutorials[4].page, 'Operating Systems 2026F: Tutorial 5');
  assert.deepEqual(parseCourseSite('nothing here', 2026), { tutorials: [], assignments: [] });
});

test('COMP 3000 site tutorials: two linked deadlines each (next B2 session, then 8 days after release); gone once graded', async () => {
  const { isDone } = await import('../src/prefs.js');
  const course = {
    code: 'COMP 3000', ou: 3, deadlines: [], site: parseCourseSite(raw, 2026),
    grades: { items: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, name: `Tutorial ${n}`, points: 4, outOf: 4 })) },
  };
  const all = courseDeadlines(course);
  const tut = all.filter((d) => d.kind === 'tutorial');
  assert.equal(tut.length, 8); // tutorials 5-8, two rows each
  const [first, final] = tut.filter((d) => d.title.startsWith('Tutorial 5:'));
  assert.equal(first.title, 'Tutorial 5: get it marked at your B2 tutorial');
  assert.equal(new Date(first.due).toString(), new Date(2026, 10, 3, 18, 5).toString()); // released Mon Nov 2 -> Tue Nov 3
  assert.equal(final.title, 'Tutorial 5: last day to get it marked (B2 tutorial, 6:05 PM)');
  assert.equal(new Date(final.due).toString(), new Date(2026, 10, 10, 23, 59).toString());
  // Ticking one ticks the other, and only that tutorial.
  const prefs = { done: { [first.group]: true }, checked: {} };
  assert.equal(isDone(first, prefs) && isDone(final, prefs), true);
  assert.equal(isDone(tut.find((d) => d.title.startsWith('Tutorial 6:')), prefs), false);
});

test('COMP 3000 assignment dates come from the site, falling back to config without it', () => {
  const due = (course, n) => new Date(courseDeadlines(course).find((d) => d.title === `Assignment ${n}`).due).toString();
  const site = { tutorials: [], assignments: [{ n: 3, due: '2026-11-20T14:30' }] };
  // Due 2:30 PM on the site, so it shows the night before with the real time kept.
  assert.equal(due({ code: 'COMP 3000', ou: 3, deadlines: [], site }, 3), new Date(2026, 10, 19, 23, 59).toString());
  const a3 = courseDeadlines({ code: 'COMP 3000', ou: 3, deadlines: [], site }).find((d) => d.title === 'Assignment 3');
  assert.equal(new Date(a3.realDue).toString(), new Date(2026, 10, 20, 14, 30).toString());
  assert.equal(due({ code: 'COMP 3000', ou: 3, deadlines: [], site }, 4), new Date(2026, 11, 7, 23, 59).toString());
  assert.equal(due({ code: 'COMP 3000', ou: 3, deadlines: [] }, 3), new Date(2026, 10, 16, 23, 59).toString());
});

test('a course website that could not be read is reported, not silently skipped', async () => {
  const { attachSites, siteProblems } = await import('../src/coursesite.js');
  const realFetch = globalThis.fetch;
  const snap = () => ({ syncedAt: '2026-10-10T12:00:00.000Z', courses: [{ code: 'COMP 3000' }, { code: 'BIOL 1010' }] });
  try {
    assert.match(siteProblems(snap())[0], /hasn't been read yet/);

    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const failed = await attachSites(snap(), null);
    assert.equal(failed.courses[0].site, null);
    assert.match(siteProblems(failed)[0], /Couldn't read the COMP 3000 course website \(Failed to fetch\).*missing/);

    globalThis.fetch = async () => new Response(raw);
    const ok = await attachSites(snap(), null);
    assert.equal(ok.courses[0].site.tutorials.length, 8);
    assert.deepEqual(siteProblems(ok), []);

    // A later failure keeps the last good copy.
    globalThis.fetch = async () => new Response('gone', { status: 503 });
    const later = await attachSites(snap(), ok);
    assert.equal(later.courses[0].site.tutorials.length, 8);
    assert.match(siteProblems(later)[0], /the site answered 503.*last time it worked/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the wiki is asked which tutorial and assignment pages exist yet', async () => {
  const { attachSites } = await import('../src/coursesite.js');
  const realFetch = globalThis.fetch;
  const posted = ['Operating Systems 2026F: Tutorial 4', 'Operating Systems 2026F: Assignment 1'];
  globalThis.fetch = async (url) => {
    if (!String(url).includes('api.php')) return new Response(raw);
    const titles = decodeURIComponent(String(url).split('titles=')[1]).split('|');
    const pages = Object.fromEntries(titles.map((title, i) => (posted.includes(title) ? [1000 + i, { pageid: 1000 + i, title }] : [-1 - i, { title, missing: '' }])));
    return new Response(JSON.stringify({ query: { pages } }));
  };
  try {
    const { courses: [c] } = await attachSites({ syncedAt: '2026-10-10T12:00:00.000Z', courses: [{ code: 'COMP 3000', ou: 3, deadlines: [] }] }, null);
    assert.equal(c.site.tutorials.find((t) => t.n === 4).posted, true);
    assert.equal(c.site.tutorials.find((t) => t.n === 5).posted, false);
    assert.equal(c.site.assignments.find((x) => x.n === 2).posted, false);
    const rows = courseDeadlines(c);
    assert.equal(rows.find((d) => d.title === 'Assignment 2').live, false);
    assert.equal(rows.find((d) => d.title.startsWith('Tutorial 4:')).live, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('COMP 3000 Assignment 2 keeps its announced date, over the site and the Brightspace folder', () => {
  const site = { tutorials: [], assignments: [{ n: 2, due: '2026-10-15T14:30', posted: true }] };
  const rows = (deadlines) => courseDeadlines({ code: 'COMP 3000', ou: 3, deadlines, site }).filter((d) => /^Assignment 2\b/.test(d.title));
  const sunday = new Date(2026, 9, 18, 23, 59).toString();
  const [a2] = rows([]);
  assert.equal(new Date(a2.due).toString(), sunday); // not the site's Oct 15
  assert.equal(a2.live, true);
  const folder = (autoDone) => [{ id: '3:drop:9', title: 'Assignment 2', kind: 'assignment', due: new Date(2026, 9, 16, 17, 0).toISOString(), autoDone }];
  const synced = rows(folder(false));
  assert.equal(synced.length, 1); // Brightspace's row replaces the config one
  assert.equal(synced[0].id, '3:drop:9');
  assert.equal(new Date(synced[0].due).toString(), sunday); // not the folder's Fri 5:00 PM
  assert.equal(synced[0].realDue, undefined);
  assert.equal(synced[0].live, true);
  assert.equal(rows(folder(true))[0].autoDone, true);
});
