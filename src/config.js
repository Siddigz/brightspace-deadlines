// Things Brightspace doesn't know (or gets wrong), taken from each course outline. Edit freely.

export const BASE = 'https://brightspace.carleton.ca';

// Courses appear in this order everywhere. Anything pinned but not listed goes last.
export const COURSE_ORDER = ['BIOL 1010', 'CGSC 2001', 'CLCV 2105', 'CLCV 2305', 'COMP 2406', 'COMP 3000'];

// Rename a course code in the UI, e.g. { 'CGSC 2001': 'PHIL 2001' }.
export const CODE_LABELS = {};

export const COURSE_COLORS = {
  'BIOL 1010': '#2f9e6b',
  'CGSC 2001': '#8b5cf6',
  'CLCV 2105': '#d97706',
  'CLCV 2305': '#c2410c',
  'COMP 2406': '#2563eb',
  'COMP 3000': '#0891b2',
  Carleton: '#6b7280',
  Personal: '#db2777',
};

// University-wide dates (Carleton Registrar calendar, 2026-27).
// They show under "Carleton" on the Deadlines page and never count as overdue.
export const UNIVERSITY_DATES = [
  { title: 'Fall term begins', date: '2026-09-09' },
  { title: 'Last day to register or change fall / full-year courses', date: '2026-09-22' },
  { title: 'Last day to withdraw from fall / full-year courses with a full fee adjustment', date: '2026-09-30' },
  { title: 'December final exam schedule posted', date: '2026-10-09' },
  { title: 'Thanksgiving: university closed', date: '2026-10-12' },
  { title: 'Fall break: no classes', date: '2026-10-26', end: '2026-10-30' },
  { title: 'Last day to withdraw (Nov 13 per COMP 3000 site; play it safe)', date: '2026-11-13' },
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

// Your own deadlines, outside any course. They show under "Personal" and can be ticked off.
// `date` is local time; a bare date means 11:59 PM that day. `end` makes it a time slot.
export const PERSONAL_DEADLINES = [
  { title: 'Online assessment (timed)', date: '2026-10-14', kind: 'test' },
  { title: 'Club meeting', date: '2026-10-15T18:00', kind: 'event' },
  { title: 'Renew bus pass', date: '2026-10-16', kind: 'errand' },
];

// Due dates for Brightspace items that have none set, matched by course + exact item title.
// Dates are local time; a bare date means 11:59 PM that day.
export const DUE_OVERRIDES = {
  'CLCV 2305': {
    'ANCIENT SOURCE': '2026-11-02',
    'MODERN BOOK': '2027-01-18',
    'COURSE ESSAY': '2027-03-29',
  },
};

// Your own earlier deadlines: anything in `course` whose title matches `match` and is due on
// weekday `from` (0 = Sun ... 5 = Fri) shows as due on the weekday `to` before it, at `time`.
// The real closing time still shows on the row.
export const MOVE_DEADLINES = [
  // COMP 2406 tutorials close Friday 10:00 AM; finish them Thursday night instead.
  { course: 'COMP 2406', match: '^Tutorial \\d+$', from: 5, to: 4, time: '23:59' },
];

// Deadlines that aren't in Brightspace (or have no date there). `date` is local time
// ('2026-10-15T14:30'; a bare date means 11:59 PM). `end` makes it a time slot (a test sitting,
// an exam window) rather than something you hand in, so it never shows as overdue.
// An entry is skipped once Brightspace has an item with the same name, or one matching `unless`.
// `gradedAs` marks it done once that many (`gradedCount`, default 1) Brightspace grade items
// matching the pattern have a mark; add `dropWhenGraded` to remove it outright instead.
// `notes` ([{ text, gradedAs }]) are appended to the title until their item is graded; once
// every note is graded the entry is removed.
export const EXTRA_DEADLINES = [
  // COMP 2406: in-person tests, Fridays 10:00-11:30 in the tutorial room.
  { course: 'COMP 2406', title: 'Test 1 (HTML + CSS), in person', date: '2026-09-25T10:00', end: '2026-09-25T11:30', kind: 'test' },
  { course: 'COMP 2406', title: 'Test 2 (JS + DOM), in person', date: '2026-10-09T10:00', end: '2026-10-09T11:30', kind: 'test' },
  { course: 'COMP 2406', title: 'Test 3 (AJAX), in person', date: '2026-10-23T10:00', end: '2026-10-23T11:30', kind: 'test' },
  { course: 'COMP 2406', title: 'Test 4 (Node + EJS/PUG), in person', date: '2026-11-20T10:00', end: '2026-11-20T11:30', kind: 'test' },
  { course: 'COMP 2406', title: 'Test 5 (Express + MongoDB), in person', date: '2026-12-04T10:00', end: '2026-12-04T11:30', kind: 'test' },
  { course: 'COMP 2406', title: 'Final exam (date TBA; must pass)', date: '2026-12-12', end: '2026-12-23', kind: 'test', allDay: true },
  // Tutorials 4 and 6 unlock after 3 and 5, so Brightspace doesn't list them yet. Due with them (Fri 10:00).
  { course: 'COMP 2406', title: 'Tutorial 4', date: '2026-10-09T10:00', kind: 'quiz', unless: '^Tutorial 4$', gradedAs: '^Tutorial 4$' },
  { course: 'COMP 2406', title: 'Tutorial 6', date: '2026-10-23T10:00', kind: 'quiz', unless: '^Tutorial 6$', gradedAs: '^Tutorial 6$' },

  // COMP 3000: course website, not Brightspace.
  // Assignment 1 moved Sep 28 -> Sep 30 -> Oct 5 -> Oct 4.
  ...[[1, '2026-10-04'], [2, '2026-10-15T14:30'], [3, '2026-11-16'], [4, '2026-12-07']].map(([n, date]) => ({
    course: 'COMP 3000', title: `Assignment ${n}`, date, kind: 'assignment', gradedAs: `^Assignment ${n}\\b`,
    url: `https://homeostasis.scs.carleton.ca/wiki/index.php/Operating_Systems_2026F:_Assignment_${n}`,
  })),
  // Tutorials must be TA-marked within 8 days of release. Every deadline falls on a Tuesday,
  // the same day as your B2 tutorial (Tue 18:05-19:25), so that session is the last chance.
  ...[
    [1, '2026-09-22'], [2, '2026-09-29'], [3, '2026-10-06'], [4, '2026-10-13'],
    [5, '2026-11-10'], [6, '2026-11-17'], [7, '2026-11-24'], [8, '2026-12-01'],
  ].map(([n, day]) => ({
    course: 'COMP 3000', title: `Get Tutorial ${n} marked by a TA (last chance: B2 tutorial, 6:05 PM)`, date: day, kind: 'tutorial',
    gradedAs: `^Tutorial ${n}$`, dropWhenGraded: true,
    url: `https://homeostasis.scs.carleton.ca/wiki/index.php/Operating_Systems_2026F:_Tutorial_${n}`,
  })),
  // Your plan: get each tutorial marked at the B2 session the day after it's released (Mondays),
  // a week before the real deadline above.
  ...[[4, '2026-10-06'], [5, '2026-11-03'], [6, '2026-11-10'], [7, '2026-11-17'], [8, '2026-11-24']].map(([n, day]) => ({
    course: 'COMP 3000', title: `Get Tutorial ${n} marked at B2 tutorial (your plan; a week early)`, date: `${day}T18:05`, kind: 'tutorial',
    gradedAs: `^Tutorial ${n}$`, dropWhenGraded: true,
    url: `https://homeostasis.scs.carleton.ca/wiki/index.php/Operating_Systems_2026F:_Tutorial_${n}`,
  })),
  // Your B2 tutorial sessions (Tue 18:05-19:25, Carleton Central). None in fall break (Oct 27).
  // Dec 1 isn't on the course site but it's the Tutorial 8 sign-off deadline, so it's included.
  // [day, last chance for tutorial, planned tutorial]
  ...[
    ['2026-09-15'], ['2026-09-22', 1], ['2026-09-29', 2], ['2026-10-06', 3, 4], ['2026-10-13', 4], ['2026-10-20'],
    ['2026-11-03', null, 5], ['2026-11-10', 5, 6], ['2026-11-17', 6, 7], ['2026-11-24', 7, 8], ['2026-12-01', 8],
  ].map(([day, due, plan]) => ({
    course: 'COMP 3000', title: 'B2 tutorial', date: `${day}T18:05`, end: `${day}T19:25`, kind: 'tutorial',
    notes: [
      plan && { text: `get Tutorial ${plan} marked`, gradedAs: `^Tutorial ${plan}$` },
      due && { text: `last chance for Tutorial ${due}`, gradedAs: `^Tutorial ${due}$` },
    ].filter(Boolean),
  })),
  // Section B: in class Wed Oct 21 (section A writes Tue Oct 20).
  { course: 'COMP 3000', title: 'Midterm, in class (closed book)', date: '2026-10-21T08:35', end: '2026-10-21T09:55', kind: 'test' },
  { course: 'COMP 3000', title: 'Final exam (date TBA)', date: '2026-12-12', end: '2026-12-23', kind: 'test', allDay: true },

  // CLCV 2105: each lesson's two quizzes (no dates in Brightspace) and its mini-assignment (Brightspace
  // only creates the submission folder when the lesson opens), due Sunday 11:59 PM per the outline.
  ...[
    '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-08',
    '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31',
    '2027-02-07', '2027-02-14', '2027-02-28', '2027-03-07', '2027-03-14', '2027-03-21', '2027-03-28', '2027-04-04',
  ].flatMap((date, i) => [
    {
      course: 'CLCV 2105', title: `Lesson ${i + 1}: Quiz 1 and Quiz 2`, date, kind: 'quiz',
      gradedAs: `^Lesson ${i + 1}: Quiz [12]\\b`, gradedCount: 2,
    },
    {
      course: 'CLCV 2105', title: `Lesson ${i + 1}: Mini-assignment (optional: max 7 per term, best 6 count)`, date, kind: 'assignment',
      unless: `^Lesson ${i + 1}: Mini-assignment`, gradedAs: `^Lesson ${i + 1}: Mini-assignment`,
    },
  ]),


  // CLCV 2305: late papers are accepted (with a penalty) until this date only.
  { course: 'CLCV 2305', title: 'Last day for late papers (with penalty)', date: '2027-04-10', kind: 'assignment' },

  // CLCV 2105: proctored online exams (CoMaS) during the exam periods; exact dates TBA.
  { course: 'CLCV 2105', title: 'Fall exam, CoMaS proctored (date TBA)', date: '2026-12-12', end: '2026-12-23', kind: 'test', allDay: true },
  { course: 'CLCV 2105', title: 'Winter exam, CoMaS proctored (date TBA)', date: '2027-04-11', end: '2027-04-23', kind: 'test', allDay: true },
];

// Deadlines that carry bonus marks get a "bonus" tag with this note. `match` is tested
// against the deadline title. Brightspace items graded into a bonus category are tagged too.
export const BONUS_DEADLINES = [
  { course: 'CLCV 2105', match: 'Zoom Discussion', note: '+0.5% final grade if you participate (claim it with the bonus quiz afterwards), max 3%' },
  { course: 'CLCV 2105', match: 'bonus', note: 'Claim your Zoom discussion bonus (+0.5%)' },
];

// Grading rules from each outline, applied on top of the Brightspace gradebook.
// See applyOutline() in grades.js for what each field does. `rules` show on the course card.
export const OUTLINES = {
  'BIOL 1010': {
    groups: [{ name: 'Tests (best 10 of 11, 10% each)', weight: 100, best: 10, match: '^Test #\\d+$' }],
    ignore: ['^Sample Test$'],
    rules: [
      'Grade is 100% tests: best 10 of 11 count, 10% each. No final exam.',
      'Each test is open 12:01 AM to 11:59 PM on its Wednesday; once started you get one hour and one attempt.',
      'Missed a second test? Email the TA and instructor and submit the Academic Consideration form within 24 hours.',
    ],
  },
  'CGSC 2001': {
    extra: [
      { name: 'Midterm 1', weight: 33, unless: '^Midterm 1$' },
      { name: 'Midterm 2', weight: 33, unless: '^Midterm 2$' },
      { name: 'Final', weight: 34, unless: '^(Final|Take Home Exam)$' },
    ],
    rules: ['Midterm 1 33%, Midterm 2 33%, Final (take-home) 34%.'],
  },
  'CLCV 2105': {
    // Brightspace already splits the gradebook: "Term 1: …" / "Term 2: …" categories plus the two exams.
    terms: [
      { name: 'Fall', match: ['^(Term 1|Fall)\\b'] },
      { name: 'Winter', match: ['^(Term 2|Winter)\\b'] },
    ],
    termNote: 'Zoom discussion bonus marks run all year, so they only show under Full year.',
    rules: [
      'Full year. Quizzes 10%, mini-assignments 30%, participation 10%, Fall exam 25%, Winter exam 25%.',
      'Mini-assignments: submit at most 7 per term, best 6 count. No late submissions, ever.',
      'Every mini-assignment needs the AI-use note, or it gets 0. Use the one cumulative Word submission form.',
      'The submission box only unlocks after you attempt both quizzes for that lesson.',
      'Zoom discussions: +0.5% bonus each (max 3%), claimed through the bonus quiz after each one.',
      'You must write both exams (online, CoMaS proctored) to pass.',
    ],
  },
  'CLCV 2305': {
    groups: [{
      name: 'Best 4 of 5 (25% each)', weight: 100, best: 4,
      match: '^(ANCIENT SOURCE|MODERN BOOK|COURSE ESSAY|MID-?TERM|December midterm|FINAL|April final)$',
    }],
    extra: [
      { name: 'December midterm', unless: '^MID-?TERM$' },
      { name: 'April final', unless: '^FINAL$' },
    ],
    terms: [
      { name: 'Fall', match: ['^(ANCIENT SOURCE|MID-?TERM|December midterm)$'] },
      { name: 'Winter', match: ['^(MODERN BOOK|COURSE ESSAY|FINAL|April final)$'] },
    ],
    termNote: 'Best 4 of 5 is worked out over the whole year, so each term here is a plain average (25% per item, nothing dropped).',
    rules: [
      'Full year. Best 4 of 5 count, 25% each: Ancient Source, Modern Book, Course Essay, December midterm, April final.',
      'Papers: PDF only, Times New Roman 12 pt, double-spaced. Minimum 9 / 10 / 11 full pages of text.',
      'Late papers accepted with an increasing penalty until Sat Apr 10, 2027, 11:59 PM.',
      'No Wikipedia, encyclopedias or AI as sources. Ancient Source needs 1+ outside academic source, Modern Book 2+, Course Essay 3+ peer-reviewed.',
      'Midterm and final: 33 multiple-choice questions, 70 minutes, any time inside the window.',
    ],
  },
  'COMP 2406': {
    rules: [
      'Tutorials 20%, assignments 20%, tests 40% (best 4 of 5), final exam 20%.',
      'You must get at least 50% on the final exam to pass.',
      'Tests are on paper, Fridays 10:00-11:30. No makeups or reweighting, even if sick.',
      'Assignments due Thursdays 11:59 PM; -2% per 15 minutes late, not graded after 12 hours.',
      'Attempt each tutorial before its due date, or you lose access to it.',
      'No AI on tutorials, tests or the final. AI is allowed for debugging assignments (document it).',
    ],
  },
  'COMP 3000': {
    categoryWeights: { Tutorials: 20, Assignments: 20, Exams: 55 },
    // Brightspace only lists the grade items that exist so far; these are the rest of the course.
    expect: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `Tutorial ${n}`, category: 'Tutorials', max: 4 })),
      ...[1, 2, 3, 4].map((n) => ({ name: `Assignment ${n}`, category: 'Assignments', max: 20 })),
      { name: 'Midterm', category: 'Exams', max: 100, unless: 'midterm' },
      { name: 'Final exam', category: 'Exams', max: 100, unless: '^final' },
    ],
    itemWeights: { midterm: 20, '^final': 35, '^lecture participation': 5 },
    extra: [{ name: 'Lecture participation', weight: 5, unless: '^lecture participation' }],
    onlyHelps: ['^lecture participation'],
    rules: [
      'Lecture participation 5%, tutorials 20%, assignments 20%, midterm 20%, final exam 35%.',
      'Tutorials are participation (4/4 for a real attempt), but a TA must mark them within 8 days of release.',
      'If your assignment average is more than 25% above your exam average, assignments are dropped and exams take their weight.',
      'Late assignments are accepted only until solutions are posted.',
      'Lecture participation can only raise your grade, and the prof keeps the best of several marking schemes.',
    ],
  },
};

// Carleton's letter-grade cutoffs (percent).
export const LETTERS = [
  [90, 'A+'], [85, 'A'], [80, 'A-'], [77, 'B+'], [73, 'B'], [70, 'B-'],
  [67, 'C+'], [63, 'C'], [60, 'C-'], [57, 'D+'], [53, 'D'], [50, 'D-'], [0, 'F'],
];
