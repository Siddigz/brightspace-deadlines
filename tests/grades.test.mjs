import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOutline, computeCourse, termSheet, letter } from '../src/grades.js';
import { OUTLINES } from '../src/config.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// Shaped like COMP 2406's gradebook on 2026-09-27.
const comp2406 = (testScores = []) => ({
  system: 'Weighted',
  categories: [
    { id: 't', name: 'Tutorials', weight: 20, drop: 0 },
    { id: 'a', name: 'Assignments', weight: 20, drop: 0 },
    { id: 'x', name: 'Tests', weight: 40, drop: 1 },
  ],
  items: [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, name: `Tutorial ${i + 1}`, categoryId: 't', max: 20, weight: 2, points: null, outOf: null })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i + 1}`, name: `A${i + 1}`, categoryId: 'a', max: 100, weight: 5, points: null, outOf: null })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `x${i + 1}`, name: `Test${i + 1}`, categoryId: 'x', max: 20, weight: 8,
      points: testScores[i] ?? null, outOf: testScores[i] == null ? null : 20,
    })),
    { id: 'final', name: 'Final Exam', categoryId: null, max: 80, weight: 20, points: null, outOf: null },
  ],
});

test('two tutorials graded', () => {
  const sheet = comp2406();
  Object.assign(sheet.items[0], { points: 15, outOf: 15 });
  Object.assign(sheet.items[1], { points: 22, outOf: 25 });
  const r = computeCourse(sheet);
  close(r.current, 94); // (100 + 88) / 2
  close(r.gradedW, 4); // 2 tutorials x 2%
  close(r.totalW, 100);
  close(r.floor, 3.76);
});

test('lowest test is dropped and the rest count 10% each', () => {
  const r = computeCourse(comp2406([10, 20, 20, 20, 20]));
  const tests = r.components.find((c) => c.name === 'Tests');
  close(tests.pct, 100);
  close(tests.coverage, 1);
  assert.deepEqual(tests.dropped, ['x1']);
});

test('one test graded counts as a quarter of the tests category', () => {
  const r = computeCourse(comp2406([16]));
  close(r.gradedW, 10);
  close(r.current, 80);
});

test('needed average on the remainder', () => {
  const r = computeCourse(comp2406([16])); // 8 of 10 banked, 90 weight left
  close(r.needed(80), ((80 - 8) / 90) * 100);
  assert.equal(r.needed(0) <= 0, true);
});

test('bonus category adds on top instead of diluting', () => {
  const sheet = {
    system: 'Weighted',
    categories: [
      { id: 'q', name: 'Quizzes', weight: 100, drop: 0 },
      { id: 'b', name: 'Bonus Marks: Discussion Participation', weight: 3, drop: 2 },
    ],
    items: [
      { id: 'q1', name: 'Q1', categoryId: 'q', max: 100, weight: 100, points: 80, outOf: 100 },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `Bonus ${i}`, categoryId: 'b', max: 0.5, weight: 0.375, points: 0.5, outOf: 0.5 })),
    ],
  };
  const r = computeCourse(sheet);
  close(r.totalW, 100);
  close(r.current, 80);
  close(r.bonusW, 3);
  close(r.floor, 83);
});

test('CGSC 2001 outline fills an empty gradebook (33/33/34)', () => {
  const sheet = applyOutline({ system: 'Weighted', categories: [], items: [] }, OUTLINES['CGSC 2001']);
  close(computeCourse(sheet).totalW, 100);
  sheet.items.find((it) => it.name === 'Midterm 1').points = 90;
  const r = computeCourse(sheet);
  close(r.current, 90);
  close(r.coverage, 0.33);
  close(r.needed(85), ((85 - 29.7) / 67) * 100);
});

test('CGSC outline items step aside once Brightspace has them', () => {
  const sheet = applyOutline(
    { system: 'Weighted', categories: [], items: [{ id: '9', name: 'Midterm 1', categoryId: null, max: 50, weight: null, points: null, outOf: null }] },
    OUTLINES['CGSC 2001'],
  );
  assert.equal(sheet.items.filter((it) => /Midterm 1/.test(it.name)).length, 1);
});

test('nothing is dropped before there are more marks than count', () => {
  // COMP 2406: best 4 of 5 tests. Two tests in -> both count.
  const r = computeCourse(comp2406([10, 20]));
  const tests = r.components.find((c) => c.name === 'Tests');
  assert.deepEqual(tests.dropped, []);
  close(tests.pct, 75);
  close(r.gradedW, 20);
});

test('BIOL 1010 outline: best 10 of 11 tests at 10% each, sample test ignored', () => {
  const items = Array.from({ length: 11 }, (_, i) => ({
    id: `t${i + 1}`, name: `Test #${i + 1}`, categoryId: null, max: 10, weight: i === 0 ? 10 : 6,
    points: i === 0 ? 10 : null, outOf: i === 0 ? 10 : null,
  }));
  items.push({ id: 's', name: 'Sample Test', categoryId: null, max: 1, weight: 5, points: 1, outOf: 1 });
  const sheet = applyOutline({ system: 'Weighted', categories: [], items }, OUTLINES['BIOL 1010']);
  let r = computeCourse(sheet);
  close(r.totalW, 100);
  close(r.gradedW, 10);
  close(r.current, 100);
  // All 11 written: lowest one drops.
  sheet.items.forEach((it, i) => { it.points = i === 3 ? 2 : 10; it.outOf = 10; });
  r = computeCourse(sheet);
  close(r.current, 100);
  close(r.coverage, 1);
});

test('CLCV 2305 outline: best 4 of 5 at 25% each, midterm and final added', () => {
  const items = ['ANCIENT SOURCE', 'MODERN BOOK', 'COURSE ESSAY'].map((n, i) => ({
    id: `p${i}`, name: n, categoryId: null, max: 25, weight: 10, points: null, outOf: null,
  }));
  items[0].points = 20; items[0].outOf = 25;
  const sheet = applyOutline({ system: 'Weighted', categories: [], items }, OUTLINES['CLCV 2305']);
  const r = computeCourse(sheet);
  const group = r.components.find((c) => /Best 4 of 5/.test(c.name));
  assert.equal(group.items.length, 5);
  close(r.totalW, 100);
  close(r.gradedW, 25);
  close(r.current, 80);
});

test('COMP 3000 outline weights a points-based gradebook', () => {
  const sheet = applyOutline({
    system: 'Points',
    categories: [
      { id: 't', name: 'Tutorials', weight: null, drop: 0 },
      { id: 'a', name: 'Assignments', weight: null, drop: 0 },
      { id: 'e', name: 'Exams', weight: null, drop: 0 },
    ],
    items: [
      { id: 't1', name: 'Tutorial 1', categoryId: 't', max: 4, weight: 10, points: 4, outOf: 4 },
      { id: 't2', name: 'Tutorial 2', categoryId: 't', max: 4, weight: 10, points: 4, outOf: 4 },
    ],
  }, OUTLINES['COMP 3000']);
  const r = computeCourse(sheet);
  close(r.totalW, 95); // 20 + 20 + 55; lecture participation (5) waits for a mark
  close(r.gradedW, 5); // 2 of the 8 tutorials the outline expects
  close(r.current, 100);
});

test('COMP 3000: an assignment Brightspace left uncategorized still shares the 20% assignment weight', () => {
  const sheet = applyOutline({
    system: 'Points',
    categories: [
      { id: 't', name: 'Tutorials', weight: null, drop: 0 },
      { id: 'a', name: 'Assignments', weight: null, drop: 0 },
      { id: 'e', name: 'Exams', weight: null, drop: 0 },
    ],
    items: [{ id: 'a1', name: 'Assignment 1', categoryId: 0, max: 20, weight: 10, points: 15, outOf: 20 }],
  }, OUTLINES['COMP 3000']);
  const r = computeCourse(sheet);
  const assignments = r.components.find((c) => c.name === 'Assignments');
  assert.equal(assignments.items.length, 4);
  assert.ok(!r.components.some((c) => c.single && c.name === 'Assignment 1'));
  close(r.totalW, 95); // lecture participation waits for a mark
  close(r.gradedW, 5); // 1 of 4 assignments = a quarter of 20%
  close(r.current, 75);
});

test('each item shows its share of the course, not its point value', () => {
  const sheet = applyOutline({
    system: 'Points',
    categories: [
      { id: 't', name: 'Tutorials', weight: null, drop: 0 },
      { id: 'a', name: 'Assignments', weight: null, drop: 0 },
      { id: 'e', name: 'Exams', weight: null, drop: 0 },
    ],
    items: [],
  }, OUTLINES['COMP 3000']);
  const r = computeCourse(sheet);
  const share = (cat) => r.components.find((c) => c.name === cat).items.map((it) => it.share);
  assert.deepEqual(share('Assignments'), [5, 5, 5, 5]); // 20% over 4, not 20 points each
  assert.deepEqual(share('Tutorials'), Array(8).fill(2.5));
  assert.deepEqual(share('Exams'), [20, 35]);
  // Best 4 of 5 tests at 40%: each one that counts is worth 10%.
  const tests = computeCourse(comp2406()).components.find((c) => c.name === 'Tests');
  tests.items.forEach((it) => close(it.share, 10));
});

test('CLCV 2105 terms follow the Term 1 / Term 2 categories and the two exams', () => {
  const sheet = applyOutline({
    system: 'Weighted',
    categories: [
      { id: 'q1', name: 'Term 1: Quizzes', weight: 5, drop: 0 },
      { id: 'fe', name: 'Fall Exam', weight: 25, drop: 0 },
      { id: 'q2', name: 'Term 2: Quizzes', weight: 5, drop: 0 },
      { id: 'we', name: 'Winter Exam', weight: 25, drop: 0 },
      { id: 'bn', name: 'Bonus Marks: Discussion Participation', weight: 3, drop: 0 },
    ],
    items: [
      { id: 'a', name: 'Lesson 1: Quiz 1', categoryId: 'q1', max: 100, weight: 1, points: 80, outOf: 100 },
      { id: 'b', name: 'Fall Exam', categoryId: 'fe', max: 100, weight: 100, points: null, outOf: null },
      { id: 'c', name: 'Lesson 13: Quiz 1', categoryId: 'q2', max: 100, weight: 1, points: 50, outOf: 100 },
      { id: 'd', name: 'Winter Exam', categoryId: 'we', max: 100, weight: 100, points: null, outOf: null },
      { id: 'e', name: 'Bonus Marks for Live Group Discussion 1', categoryId: 'bn', max: 0.5, weight: 1, points: 0.5, outOf: 0.5 },
    ],
  }, OUTLINES['CLCV 2105']);
  const fall = computeCourse(termSheet(sheet, OUTLINES['CLCV 2105'], 'Fall'));
  close(fall.totalW, 30);
  close(fall.current, 80);
  assert.deepEqual(fall.components.map((c) => c.name), ['Term 1: Quizzes', 'Fall Exam']);
  const winter = computeCourse(termSheet(sheet, OUTLINES['CLCV 2105'], 'Winter'));
  close(winter.totalW, 30);
  close(winter.current, 50);

  // Shown on its own, a term counts out of 100: 5 and 25 become 16.7 and 83.3, the average is unchanged.
  const scaled = computeCourse(termSheet(sheet, OUTLINES['CLCV 2105'], 'Fall'), { scaleTo: 100 });
  close(scaled.totalW, 100);
  close(scaled.components[0].W, 100 / 6);
  close(scaled.current, 80);
  close(scaled.floor, 80 / 6); // 80% on a sixth of the term
});

test('CLCV 2305 terms: plain average of that term\'s items, best-4-of-5 not applied', () => {
  const sheet = applyOutline({
    system: 'Weighted',
    categories: [],
    items: ['ANCIENT SOURCE', 'MODERN BOOK', 'COURSE ESSAY'].map((name, i) => ({
      id: `p${i}`, name, categoryId: null, max: 25, weight: 10, points: [20, 15, null][i], outOf: 25,
    })),
  }, OUTLINES['CLCV 2305']);
  const fall = computeCourse(termSheet(sheet, OUTLINES['CLCV 2305'], 'Fall'));
  assert.deepEqual(fall.components[0].items.map((it) => it.name).sort(), ['ANCIENT SOURCE', 'December midterm']);
  close(fall.totalW, 50);
  close(fall.current, 80);
  const winter = computeCourse(termSheet(sheet, OUTLINES['CLCV 2305'], 'Winter'));
  assert.equal(winter.components[0].items.length, 3);
  assert.equal(winter.components[0].drop, 0);
  close(winter.totalW, 75);
  close(winter.current, 60);
});

test('letters follow Carleton cutoffs', () => {
  assert.equal(letter(94), 'A+');
  assert.equal(letter(84.9), 'A-');
  assert.equal(letter(49), 'F');
  assert.equal(letter(null), '–');
});

// COMP 3000 gradebook with the given tutorial marks (out of 4) and lecture participation (out of 100).
const comp3000 = (tutorials, participation) => applyOutline({
  system: 'Points',
  categories: [
    { id: 't', name: 'Tutorials', weight: null, drop: 0 },
    { id: 'a', name: 'Assignments', weight: null, drop: 0 },
    { id: 'e', name: 'Exams', weight: null, drop: 0 },
  ],
  items: [
    ...tutorials.map((p, i) => ({ id: `t${i + 1}`, name: `Tutorial ${i + 1}`, categoryId: 't', max: 4, points: p, outOf: 4 })),
    ...(participation == null ? [] : [{ id: 'lp', name: 'Lecture Participation', categoryId: null, max: 100, points: participation, outOf: 100 }]),
  ],
}, OUTLINES['COMP 3000']);

test('COMP 3000 lecture participation is left out until it has a mark', () => {
  const r = computeCourse(comp3000([4, 2]));
  close(r.totalW, 95); // scored out of the other 95%
  close(r.current, 75);
  close(r.floor, (3.75 / 95) * 100);
  close(r.needed(80), ((0.8 * 95 - 3.75) / 90) * 100);
  const lp = r.components.find((c) => c.name === 'Lecture participation');
  assert.ok(lp.onlyHelps && lp.ignored);
});

test('COMP 3000 lecture participation counts when it raises the grade', () => {
  const r = computeCourse(comp3000([4, 2], 100));
  close(r.totalW, 100);
  close(r.current, (3.75 + 5) / 10 * 100);
  assert.ok(!r.components.find((c) => c.onlyHelps).ignored);
  assert.equal(r.components.filter((c) => /lecture participation/i.test(c.name)).length, 1); // Brightspace item replaces the outline one
});

test('COMP 3000 lecture participation is dropped when it would lower the grade', () => {
  const r = computeCourse(comp3000([4, 2], 40));
  close(r.totalW, 95);
  close(r.current, 75);
  assert.ok(r.components.find((c) => c.onlyHelps).ignored);
});
