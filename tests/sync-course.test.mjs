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

test('a mark in the gradebook ticks any deadline named after that grade item', () => {
  const item = (name, points = 8) => ({ id: name, name, points, outOf: 10 });
  const comp = courseDeadlines({
    code: 'COMP 2406', ou: 2,
    deadlines: [{ id: '2:q:9', title: 'Tutorial 10', kind: 'quiz', due: new Date(2026, 10, 27, 10).toISOString(), autoDone: false }],
    grades: { items: [item('Test 1'), item('Test 3', null), item('Tutorial 1'), item('Final Exam')] },
  });
  const done = (list, start) => list.find((d) => d.title.startsWith(start)).autoDone;
  assert.equal(done(comp, 'Test 1 (HTML + CSS)'), true); // in-person test from config
  assert.equal(done(comp, 'Test 2 (JS + DOM)'), false); // no grade item with a mark
  assert.equal(done(comp, 'Test 3 (AJAX)'), false); // grade item exists but has no mark yet
  assert.equal(done(comp, 'Final exam (must pass'), true);
  assert.equal(done(comp, 'Tutorial 10'), false); // "Tutorial 1" must not tick "Tutorial 10"

  const clcv = courseDeadlines({
    code: 'CLCV 2105', ou: 4, deadlines: [],
    grades: { items: [item('Lesson 7: Quiz 1 (5 questions)'), item('Lesson 7: Quiz 2 (5 questions)'), item('Lesson 8: Quiz 1 (5 questions)')] },
  });
  assert.equal(done(clcv, 'Lesson 7: Quiz 1 and Quiz 2'), true);
  assert.equal(done(clcv, 'Lesson 8: Quiz 1 and Quiz 2'), false); // only one of the two so far
});

test('CLCV 2305 Brightspace items are marked one-at-a-time; other courses are not', () => {
  const due = new Date(2026, 10, 2, 23, 59).toISOString();
  const rows = (code) => courseDeadlines({ code, ou: 5, deadlines: [{ id: '5:drop:1', title: 'ANCIENT SOURCE', kind: 'assignment', due }] });
  assert.equal(rows('CLCV 2305').find((d) => d.title === 'ANCIENT SOURCE').oneAtATime, true);
  assert.equal(rows('CLCV 2105').find((d) => d.title === 'ANCIENT SOURCE').oneAtATime, undefined);
});
