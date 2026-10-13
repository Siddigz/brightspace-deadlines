import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAll, courseDeadlines } from '../src/sync.js';

// A tiny fake Brightspace: one pinned course with the given gradebook, quizzes and folders.
function fakeClient({ name, grades = [], values = [], quizzes = [], folders = [], submittedTo = [] }) {
  const submissions = (id) => (submittedTo.includes(id) ? [{ Submissions: [{ Id: 1 }] }] : []);
  const routes = [
    [/enrollments\/myenrollments/, { PagingInfo: { HasMoreItems: false }, Items: [{ OrgUnit: { Id: 1, Name: name }, Access: { CanAccess: true, IsActive: true }, PinDate: '2026-09-28' }] }],
    [/grades\/setup/, { GradingSystem: 'Points' }],
    [/grades\/categories/, []],
    [/grades\/values\/myGradeValues/, values],
    [/grades\/$/, grades],
    [/quizzes\//, { Objects: quizzes, Next: null }],
    [/dropbox\/folders\/(\d+)\/submissions/, (m) => submissions(Number(m[1]))],
    [/dropbox\/folders\//, folders],
    [/calendar/, []],
    [/news/, []],
  ];
  const get = async (path) => {
    const route = routes.find(([re]) => re.test(path));
    return typeof route?.[1] === 'function' ? route[1](route[0].exec(path)) : route?.[1] ?? null;
  };
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

test('hand-ins due partway through a day show as due 11:59 PM the night before', () => {
  const at = (...d) => new Date(...d).toISOString();
  const fri = at(2026, 9, 9, 10, 0);
  const course = {
    code: 'COMP 2406', ou: 2,
    deadlines: [
      { id: '2:quiz:1', title: 'Tutorial 3', kind: 'quiz', due: fri },
      { id: '2:drop:2', title: 'Assignment 2', kind: 'assignment', due: at(2026, 9, 15, 23, 59) }, // already end of day
      { id: '2:drop:3', title: 'Assignment 3', kind: 'assignment', due: at(2026, 9, 22, 0, 0) }, // midnight = the night before
      { id: '2:quiz:4', title: 'Midterm sitting', kind: 'test', opens: at(2026, 9, 20, 14, 30), due: at(2026, 9, 20, 15, 0) },
      { id: '2:quiz:5', title: 'Take-home window', kind: 'test', opens: at(2026, 11, 12, 10, 0), due: at(2026, 11, 23, 17, 0) },
    ],
  };
  const list = courseDeadlines(course);
  const row = (title) => list.find((d) => d.title === title);
  const due = (title) => new Date(row(title).due).toString();
  assert.equal(due('Tutorial 3'), new Date(2026, 9, 8, 23, 59).toString());
  assert.equal(row('Tutorial 3').realDue, fri);
  assert.equal(due('Tutorial 4'), new Date(2026, 9, 8, 23, 59).toString()); // from config, also Friday 10:00
  assert.equal(row('Assignment 2').realDue, undefined);
  assert.equal(due('Assignment 3'), new Date(2026, 9, 21, 23, 59).toString());
  assert.equal(row('Midterm sitting').realDue, undefined); // opens and closes the same day
  assert.equal(due('Take-home window'), new Date(2026, 11, 22, 23, 59).toString());
  // In-person tests are time slots and stay put.
  assert.equal(new Date(row('Test 2 (JS + DOM), in person').due).toString(), new Date(2026, 9, 9, 10, 0).toString());
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
  const rows = (code) => courseDeadlines({ code, ou: 5, deadlines: [
    { id: '5:drop:1', title: 'ANCIENT SOURCE', kind: 'assignment', due },
    { id: '5:quiz:2', title: 'MID-TERM', kind: 'test', due: new Date(2026, 11, 23, 17).toISOString() },
  ] });
  assert.equal(rows('CLCV 2305').find((d) => d.title === 'ANCIENT SOURCE').oneAtATime, true);
  assert.equal(rows('CLCV 2305').find((d) => d.title === 'MID-TERM').oneAtATime, undefined); // exams don't queue
  assert.equal(rows('CLCV 2105').find((d) => d.title === 'ANCIENT SOURCE').oneAtATime, undefined);
});

test('CLCV 2105 quizzes count as open from the Monday of their week: Quiz 1, then Quiz 2', async () => {
  const { openNow } = await import('../src/prefs.js');
  const item = (name) => ({ id: name, name, points: 4, outOf: 5 });
  const open = (graded, now) => openNow(
    courseDeadlines({ code: 'CLCV 2105', ou: 4, deadlines: [], grades: { items: graded.map(item) } }),
    { done: {}, hidden: {}, checked: {} }, now.getTime(),
  ).map((d) => d.openTitle || d.title);
  // Lesson 6 is due Sun Oct 18, so its week starts Mon Oct 12; Lesson 7's starts Mon Oct 19.
  assert.deepEqual(open([], new Date(2026, 9, 11, 22)), ['Lesson 5: Quiz 1']); // Sunday night: still last week's
  assert.deepEqual(open([], new Date(2026, 9, 12, 8)), ['Lesson 6: Quiz 1']);
  assert.deepEqual(open(['Lesson 6: Quiz 1 (5 questions)'], new Date(2026, 9, 14)), ['Lesson 6: Quiz 2']);
  assert.deepEqual(open(['Lesson 6: Quiz 1 (5 questions)', 'Lesson 6: Quiz 2 (5 questions)'], new Date(2026, 9, 14)), []);
  assert.deepEqual(open([], new Date(2026, 9, 19, 0, 1)), ['Lesson 7: Quiz 1']);
});

test('a submission ticks the deadline for that work, even when the Brightspace folder has no due date', async () => {
  const client = fakeClient({
    name: 'Crosslist CLCV2105A:PHIL2005A [31033:33778] Ancient Phil:Search for Wisdom (LEC) Fall 2026',
    folders: [
      { Id: 6, Name: 'Lesson 6: Mini-assignment submission', DueDate: null }, // no date yet, submitted
      { Id: 7, Name: 'Lesson 7: Mini-assignment submission', DueDate: null }, // no date, nothing handed in
      { Id: 5, Name: 'Lesson 5: Mini-assignment submission', DueDate: '2026-10-12T03:59:00.000Z' },
    ],
    submittedTo: [6, 5],
  });
  const { courses: [course] } = await syncAll(client, Date.parse('2026-10-13T12:00:00Z'));
  assert.deepEqual(course.submittedNames.sort(), ['Lesson 5: Mini-assignment submission', 'Lesson 6: Mini-assignment submission']);
  const list = courseDeadlines(course);
  const mini = (n) => list.find((d) => d.title.startsWith(`Lesson ${n}: Mini-assignment`));
  assert.equal(mini(6).autoDone, true); // the outline's row, ticked by the undated folder's submission
  assert.equal(mini(7).autoDone, false);
  assert.equal(mini(5).autoDone, true); // Brightspace's own dated folder
});
