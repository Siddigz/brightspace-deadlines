import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_DEADLINES, OUTLINES, COURSE_ORDER } from '../src/config.js';
import { localDate } from '../src/sync.js';
import { applyOutline, computeCourse } from '../src/grades.js';

test('every extra deadline has a known course and a parseable date', () => {
  for (const x of EXTRA_DEADLINES) {
    assert.ok(COURSE_ORDER.includes(x.course), `${x.title}: unknown course ${x.course}`);
    assert.ok(!Number.isNaN(Date.parse(localDate(x.date))), `${x.title}: bad date ${x.date}`);
    if (x.end) assert.ok(Date.parse(localDate(x.end)) >= Date.parse(localDate(x.date)), `${x.title}: ends before it starts`);
    for (const p of [x.unless, x.gradedAs]) if (p) new RegExp(p, 'i');
  }
});

test('outline covers everything in each course', () => {
  const count = (course, re) => EXTRA_DEADLINES.filter((x) => x.course === course && re.test(x.title)).length;
  assert.equal(count('COMP 3000', /^Assignment \d$/), 4);
  assert.equal(count('CLCV 2105', /^Lesson \d+: Quiz 1 and Quiz 2$/), 24);
  assert.equal(count('CLCV 2105', /^Lesson \d+: Mini-assignment/), 24);
  assert.equal(count('COMP 2406', /^Tutorial [46]$/), 2);
});

test('COMP 3000 grades count all 8 tutorials, not just the 4 Brightspace lists', () => {
  const sheet = applyOutline({
    system: 'Points',
    categories: [
      { id: 't', name: 'Tutorials', weight: null, drop: 0 },
      { id: 'a', name: 'Assignments', weight: null, drop: 0 },
      { id: 'e', name: 'Exams', weight: null, drop: 0 },
    ],
    items: [1, 2, 3, 4].map((n) => ({
      id: `t${n}`, name: `Tutorial ${n}`, categoryId: 't', max: 4, weight: 10,
      points: n <= 2 ? 4 : null, outOf: n <= 2 ? 4 : null,
    })),
  }, OUTLINES['COMP 3000']);
  const r = computeCourse(sheet);
  const tut = r.components.find((c) => c.name === 'Tutorials');
  assert.equal(tut.items.length, 8);
  assert.equal(r.components.find((c) => c.name === 'Assignments').items.length, 4);
  assert.equal(r.components.find((c) => c.name === 'Exams').items.length, 2);
  assert.equal(r.totalW, 95); // lecture participation waits for a mark
  assert.equal(r.gradedW, 5); // 2 of 8 tutorials = a quarter of 20%
});
