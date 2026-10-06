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

test('COMP 3000 tutorial reminders disappear once Brightspace has the mark', async () => {
  const client = fakeClient({
    name: 'Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026',
    grades: [1, 2, 3, 4].map((n) => ({ Id: n, Name: `Tutorial ${n}`, GradeType: 'Numeric', MaxPoints: 4 })),
    values: [1, 2].map((n) => ({ GradeObjectIdentifier: String(n), PointsNumerator: 4, PointsDenominator: 4 })),
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const c = { deadlines: courseDeadlines(course) };
  const tut = (n) => c.deadlines.find((d) => d.title.startsWith(`Get Tutorial ${n} `));
  assert.equal(c.deadlines.filter((d) => /^Get Tutorial \d marked by a TA/.test(d.title)).length, 6);
  assert.equal(tut(1), undefined);
  assert.equal(tut(2), undefined);
  assert.equal(tut(3).autoDone, false);
});

test('B2 tutorial sessions drop notes for graded tutorials, and vanish once none are left', async () => {
  const client = fakeClient({
    name: 'Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026',
    grades: [1, 2, 3, 4].map((n) => ({ Id: n, Name: `Tutorial ${n}`, GradeType: 'Numeric', MaxPoints: 4 })),
    values: [1, 2, 3].map((n) => ({ GradeObjectIdentifier: String(n), PointsNumerator: 4, PointsDenominator: 4 })),
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const sessions = courseDeadlines(course).filter((d) => d.title.startsWith('B2 tutorial'));
  const on = (day) => sessions.find((d) => new Date(d.due).toDateString() === new Date(`${day}T12:00`).toDateString());
  assert.equal(on('2026-09-22'), undefined); // only note was Tutorial 1
  assert.equal(on('2026-10-06').title, 'B2 tutorial (get Tutorial 4 marked)'); // Tutorial 3 note gone
  assert.equal(on('2026-10-13').title, 'B2 tutorial (last chance for Tutorial 4)');
  assert.equal(on('2026-10-20').title, 'B2 tutorial'); // never had notes, stays
  const noted = sessions.filter((d) => d.title !== 'B2 tutorial');
  assert.equal(new Set(noted.map((d) => d.id)).size, noted.length);
});

test('COMP 3000 week-early tutorial reminders disappear with the same Brightspace mark', async () => {
  const client = fakeClient({
    name: 'Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026',
    grades: [4, 5].map((n) => ({ Id: n, Name: `Tutorial ${n}`, GradeType: 'Numeric', MaxPoints: 4 })),
    values: [{ GradeObjectIdentifier: '4', PointsNumerator: 4, PointsDenominator: 4 }],
  });
  const { courses: [course] } = await syncAll(client, NOW);
  const plans = courseDeadlines(course).filter((d) => /^Get Tutorial \d marked at B2 tutorial/.test(d.title));
  const plan = (n) => plans.find((d) => d.title.startsWith(`Get Tutorial ${n} `));
  assert.equal(plans.length, 4);
  assert.equal(plan(4), undefined);
  assert.equal(new Date(plan(5).due).toString(), new Date(2026, 10, 3, 18, 5).toString());
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

test('COMP 2406 tutorials due Friday 10:00 show as due Thursday 11:59 PM', () => {
  const fri = new Date(2026, 9, 9, 10, 0).toISOString();
  const course = {
    code: 'COMP 2406', ou: 2,
    deadlines: [
      { id: '2:q:1', title: 'Tutorial 3', kind: 'quiz', due: fri },
      { id: '2:q:2', title: 'Test 2 (JS + DOM)', kind: 'quiz', due: fri },
    ],
  };
  const list = courseDeadlines(course);
  const t3 = list.find((d) => d.title === 'Tutorial 3');
  assert.equal(new Date(t3.due).toString(), new Date(2026, 9, 8, 23, 59).toString());
  assert.equal(t3.realDue, fri);
  assert.equal(list.find((d) => d.title.startsWith('Test 2')).due, fri); // only tutorials move
  const t4 = list.find((d) => d.title === 'Tutorial 4'); // from config, also Friday 10:00
  assert.equal(new Date(t4.due).toString(), new Date(2026, 9, 8, 23, 59).toString());
});
