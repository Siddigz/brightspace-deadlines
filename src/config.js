// Settings shared by everyone at Carleton. Your own courses, outline rules and personal
// deadlines live in courses.js (copy courses.example.js to start; it's git-ignored).

export * from './courses.js';

export const BASE = 'https://brightspace.carleton.ca';

// University-wide dates (Carleton Registrar calendar, 2026-27).
// They show under "Carleton" on the Deadlines page and never count as overdue.
export const UNIVERSITY_DATES = [
  { title: 'Fall term begins', date: '2026-09-09' },
  { title: 'Last day to register or change fall / full-year courses', date: '2026-09-22' },
  { title: 'Last day to withdraw from fall / full-year courses with a full fee adjustment', date: '2026-09-30' },
  { title: 'December final exam schedule posted', date: '2026-10-09' },
  { title: 'Thanksgiving: university closed', date: '2026-10-12' },
  { title: 'Fall break: no classes', date: '2026-10-26', end: '2026-10-30' },
  { title: 'Last day to withdraw (some course sites say Nov 13; play it safe)', date: '2026-11-13' },
  { title: 'Last day for academic withdrawal from fall courses', date: '2026-11-15' },
  { title: 'Last day of fall classes (Monday schedule)', date: '2026-12-11' },
  { title: 'Fall exam period', date: '2026-12-12', end: '2026-12-23' },
  { title: 'Winter term begins', date: '2027-01-06' },
  { title: 'Last day to register or change winter courses', date: '2027-01-19' },
  { title: 'Last day to withdraw from winter courses with a full fee adjustment', date: '2027-01-31' },
  { title: 'April final exam schedule posted', date: '2027-02-12' },
  { title: 'Winter break: no classes', date: '2027-02-15', end: '2027-02-19' },
  { title: 'Last day for academic withdrawal from full-year and winter courses', date: '2027-03-15' },
  { title: 'Good Friday: university closed', date: '2027-03-26' },
  { title: 'Last day of winter classes', date: '2027-04-09' },
  { title: 'Winter exam period', date: '2027-04-11', end: '2027-04-23' },
];

// Anything due partway through a day (Friday 10:00 AM, Thursday 2:30 PM) shows as due at 11:59 PM
// the night before, with the real closing time still on the row. Sittings (tests, sessions, and
// quizzes that open and close the same day) keep their real time.
export const DUE_NIGHT_BEFORE = true;

// Carleton's letter-grade cutoffs (percent).
export const LETTERS = [
  [90, 'A+'], [85, 'A'], [80, 'A-'], [77, 'B+'], [73, 'B'], [70, 'B-'],
  [67, 'C+'], [63, 'C'], [60, 'C-'], [57, 'D+'], [53, 'D'], [50, 'D-'], [0, 'F'],
];
