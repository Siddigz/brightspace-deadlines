import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAll, courseDeadlines } from '../src/sync.js';

// A tiny fake Brightspace: one pinned course with the given gradebook, quizzes and folders.
function fakeClient({ name, grades = [], values = [], quizzes = [], folders = [] }) {
  const routes = [
    [/enrollments\/myenrollments/, { PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 1, Name: name }, Access: { CanAccess: true, IsActive: true }, PinDate: '2026-09-28' }] }],
    [/grades\/setup/, { GradingSystem: 'Points' }],
    [/grades\/categories/, []],
    [/grades\/values\/myGradeValues/, values],
    [/grades\/$/, grades],
    [/quizzes\//, { Objects: quizzes, Next: null }],
    [/dropbox\/folders\/\d+\/submissions/, []],
    [/dropbox\/folders\//, folders],
    [/calendar/, []],
    [/news/, []],
  ];
  const get = async (path) => routes.find(([re]) => re.test(path))?.[1] ?? null;
  return { me: null, get, getAllObjects: async (p) => (await get(p))?.Objects ?? (await get(p)), getAllItems: async (p) => (await get(p)).Items };
}

const NOW = Date.parse('2026-09-28T12:00:00Z');

test('COMP 3000 tutorials marked in Brightspace show as done', async () => {
  const client = fakeClient({
    name: 'Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026',
    grades: [1, 2, 3, 4].map((n) => ({ Id: n, Name: `Tutorial ${n}`, GradeType: 'Numeric', MaxPoints: 4 })),
    values: [1, 2].map((n) => ({ GradeObjectIdentifier: String(n), PointsNumerator: 4, PointsDenominator: 4 })),
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const c = { deadlines: courseDeadlines(course) };
  const tut = (n) => c.deadlines.find((d) => d.title.startsWith(`Get Tutorial ${n} `));
  assert.equal(c.deadlines.filter((d) => /^Get Tutorial \d marked by a TA/.test(d.title)).length, 8);
  assert.equal(tut(1).autoDone, true);
  assert.equal(tut(2).autoDone, true);
  assert.equal(tut(3).autoDone, false);
});

test('COMP 3000 week-early tutorial reminders tick off with the same Brightspace mark', async () => {
  const client = fakeClient({
    name: 'Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026',
    grades: [4, 5].map((n) => ({ Id: n, Name: `Tutorial ${n}`, GradeType: 'Numeric', MaxPoints: 4 })),
    values: [{ GradeObjectIdentifier: '4', PointsNumerator: 4, PointsDenominator: 4 }],
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const plans = courseDeadlines(course).filter((d) => /^Get Tutorial \d marked at B2 tutorial/.test(d.title));
  const plan = (n) => plans.find((d) => d.title.startsWith(`Get Tutorial ${n} `));
  assert.equal(plans.length, 5);
  assert.equal(new Date(plan(4).due).toString(), new Date(2026, 9, 6, 18, 5).toString());
  assert.equal(plan(4).autoDone, true);
  assert.equal(plan(5).autoDone, false);
});

test('CLCV 2105: quizzes done once both are graded; config mini-assignment gives way to the real folder', async () => {
  const client = fakeClient({
    name: 'Crosslist CLCV2105A:PHIL2005A [31033:33778] Ancient Phil:Search for Wisdom (LEC) Fall 2026',
    grades: [
      { Id: 11, Name: 'Lesson 4: Quiz 1 (5 questions)', GradeType: 'Numeric', MaxPoints: 100 },
      { Id: 12, Name: 'Lesson 4: Quiz 2 (5 questions)', GradeType: 'Numeric', MaxPoints: 100 },
      { Id: 21, Name: 'Lesson 5: Quiz 1 (5 questions)', GradeType: 'Numeric', MaxPoints: 100 },
    ],
    values: [11, 12, 21].map((id) => ({ GradeObjectIdentifier: String(id), PointsNumerator: 100, PointsDenominator: 100 })),
    folders: [{ Id: 99, Name: 'Lesson 4: Mini-assignment submission', DueDate: '2026-10-05T03:59:59.000Z', Availability: {} }],
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const c = { deadlines: courseDeadlines(course) };
  const find = (t) => c.deadlines.filter((d) => d.title.startsWith(t));
  assert.equal(find('Lesson 4: Quiz 1 and Quiz 2')[0].autoDone, true);
  assert.equal(find('Lesson 5: Quiz 1 and Quiz 2')[0].autoDone, false); // only one of two done
  assert.equal(find('Lesson 4: Mini-assignment').length, 1); // the real Brightspace folder only
  assert.equal(find('Lesson 4: Mini-assignment')[0].id, '1:drop:99');
  assert.equal(find('Lesson 5: Mini-assignment').length, 1); // config placeholder until the folder exists
});
