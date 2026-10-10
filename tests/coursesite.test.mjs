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
  assert.deepEqual(site.assignments, [
    { n: 1, due: '2026-10-05' }, { n: 2, due: '2026-10-15T14:30' }, { n: 3, due: '2026-11-16' }, { n: 4, due: '2026-12-07' },
  ]);
  assert.deepEqual(parseCourseSite('nothing here', 2026), { tutorials: [], assignments: [] });
});

test('COMP 3000 site tutorials are due 8 days after release and vanish once graded', () => {
  const course = {
    code: 'COMP 3000', ou: 3, deadlines: [], site: parseCourseSite(raw, 2026),
    grades: { items: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, name: `Tutorial ${n}`, points: 4, outOf: 4 })) },
  };
  const tut = courseDeadlines(course).filter((d) => d.kind === 'tutorial');
  assert.deepEqual(tut.map((d) => d.title), [5, 6, 7, 8].map((n) => `Tutorial ${n}: get it marked by a TA`));
  assert.equal(new Date(tut[0].opens).toString(), new Date(2026, 10, 2).toString());
  assert.equal(new Date(tut[0].due).toString(), new Date(2026, 10, 10, 23, 59).toString());
});

test('COMP 3000 assignment dates come from the site, falling back to config without it', () => {
  const due = (course, n) => new Date(courseDeadlines(course).find((d) => d.title === `Assignment ${n}`).due).toString();
  const site = { tutorials: [], assignments: [{ n: 3, due: '2026-11-20T14:30' }] };
  assert.equal(due({ code: 'COMP 3000', ou: 3, deadlines: [], site }, 3), new Date(2026, 10, 20, 14, 30).toString());
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
