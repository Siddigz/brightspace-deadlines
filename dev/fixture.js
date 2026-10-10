// Sample snapshot for previewing the dashboard outside Chrome.
const B = 'https://brightspace.carleton.ca';
const links = (ou) => ({ home: `${B}/d2l/home/${ou}`, grades: `${B}/d2l/lms/grades/my_grades/main.d2l?ou=${ou}`, content: `${B}/d2l/le/content/${ou}/Home` });
const item = (id, name, categoryId, max, weight, points = null) => ({ id, name, categoryId, max, weight, bonus: false, points, outOf: points == null ? null : max });
const dl = (id, course, title, kind, due, extra = {}) => ({ id, course, title, kind, opens: null, due, autoDone: false, url: `${B}/d2l/home`, ...extra });

const biolTests = [
  ['2026-09-23', 10], ['2026-09-30'], ['2026-10-07'], ['2026-10-14'], ['2026-10-21'],
  ['2026-11-04'], ['2026-11-11'], ['2026-11-18'], ['2026-11-25'], ['2026-12-02'], ['2026-12-09'],
];

export const fixture = {
  syncedAt: new Date().toISOString(),
  user: 'Sample Student',
  courses: [
    {
      ou: 448293, code: 'BIOL 1010', title: 'Biotechnology and Society', name: 'BIOL1010R Biotechnology and Society (LEC) Fall 2026', links: links(448293),
      grades: {
        system: 'Weighted', categories: [],
        items: biolTests.map(([, pts], i) => item(`b${i + 1}`, `Test #${i + 1}`, null, 10, i === 0 ? 10 : 6, pts ?? null)),
      },
      deadlines: biolTests.map(([d], i) => {
        const tz = d >= '2026-11-01' ? '-05:00' : '-04:00';
        return dl(`bq${i}`, 'BIOL 1010', `Test #${i + 1}`, 'test', new Date(`${d}T23:59:59${tz}`).toISOString(), {
          opens: new Date(`${d}T00:01:00${tz}`).toISOString(), autoDone: i === 0,
        });
      }),
      news: [{ id: 'n1', title: 'BIOL 1010 - Lecture #4 now available', date: '2026-09-27T04:01:00.000Z', body: 'BIOL 1010 - Lecture #4 is now available.' }],
    },
    {
      ou: 448765, code: 'CGSC 2001', title: 'Theories in Cognitive Science', name: 'CGSC2001A', links: links(448765),
      grades: { system: 'Weighted', categories: [], items: [] },
      deadlines: [
        dl('c1', 'CGSC 2001', 'Midterm 1', 'test', '2026-10-08T19:00:00.000Z', { opens: '2026-10-08T18:30:00.000Z' }),
        dl('c2', 'CGSC 2001', 'Midterm 2', 'test', '2026-11-19T20:00:00.000Z', { opens: '2026-11-19T19:30:00.000Z' }),
        dl('c3', 'CGSC 2001', 'Take Home Exam', 'test', '2026-12-25T04:59:59.000Z', { opens: '2026-12-22T05:01:00.000Z' }),
      ],
      news: [{ id: 'n2', title: 'Material posted', date: '2026-09-24T13:19:00.000Z', body: 'The material for this week is posted' }],
    },
    {
      ou: 452873, code: 'CLCV 2105', title: 'Ancient Phil:Search for Wisdom', name: 'Crosslist CLCV2105A', links: links(452873),
      grades: {
        system: 'Weighted',
        categories: [
          { id: 'ma1', name: 'Term 1: Mini-Assignments', weight: 15, drop: 6 },
          { id: 'q1', name: 'Term 1: Quizzes', weight: 5, drop: 0 },
          { id: 'p1', name: 'Term 1: Engagement & Participation', weight: 5, drop: 0 },
          { id: 'bn', name: 'Bonus Marks: Discussion Participation', weight: 3, drop: 2 },
          { id: 'fe', name: 'Fall Exam', weight: 25, drop: 0 },
          { id: 'ma2', name: 'Term 2: Mini-assignments', weight: 15, drop: 6 },
          { id: 'q2', name: 'Term 2: Quizzes', weight: 5, drop: 0 },
          { id: 'p2', name: 'Term 2: Engagement and Participation', weight: 5, drop: 0 },
          { id: 'we', name: 'Winter Exam', weight: 25, drop: 0 },
        ],
        items: [
          ...Array.from({ length: 12 }, (_, i) => item(`ma${i}`, `Lesson ${i + 1}: Mini-assignment submission`, 'ma1', 100, 1.25)),
          ...Array.from({ length: 24 }, (_, i) => item(`q${i}`, `Lesson ${Math.floor(i / 2) + 1}: Quiz ${(i % 2) + 1}`, 'q1', 100, 0.2083333, i < 6 ? 100 : null)),
          ...Array.from({ length: 12 }, (_, i) => item(`p${i}`, `Lesson ${i + 1}: Participation Report Quiz`, 'p1', 10, 0.4166667, i === 0 ? 0 : null)),
          ...Array.from({ length: 8 }, (_, i) => item(`bn${i}`, `Bonus Marks for Live Group Discussion ${i + 1}`, 'bn', 0.5, 0.375)),
          item('fe', 'Fall Exam', 'fe', 100, 100),
          ...Array.from({ length: 12 }, (_, i) => item(`mb${i}`, `Lesson ${i + 13}: Mini-assignment submission`, 'ma2', 100, 1.25)),
          ...Array.from({ length: 24 }, (_, i) => item(`qb${i}`, `Lesson ${Math.floor(i / 2) + 13}: Quiz ${(i % 2) + 1}`, 'q2', 100, 0.2083333)),
          ...Array.from({ length: 12 }, (_, i) => item(`pb${i}`, `Lesson ${i + 13}: Participation Report Quiz`, 'p2', 10, 0.4166667)),
          item('we', 'Winter Exam', 'we', 100, 100),
        ],
      },
      deadlines: [
        dl('l3', 'CLCV 2105', 'Lesson 3: Mini-assignment submission', 'assignment', '2026-09-28T03:59:59.000Z', { autoDone: true }),
        dl('l3p', 'CLCV 2105', 'Lesson 3: Participation Report Quiz', 'quiz', '2026-09-28T03:59:59.000Z'),
        dl('l4p', 'CLCV 2105', 'Lesson 4: Participation Report Quiz', 'quiz', '2026-10-05T03:59:59.000Z'),
        dl('z1', 'CLCV 2105', 'Wednesday Zoom Discussion', 'event', '2026-09-30T18:35:00.000Z', { end: '2026-09-30T19:35:00.000Z', bonus: '+0.5% final grade if you participate (claim it with the bonus quiz afterwards), max 3%' }),
        dl('l1', 'CLCV 2105', 'Lesson 1: Mini-assignment instructions + submission', 'assignment', '2026-11-09T04:59:59.000Z'),
      ],
      news: [{ id: 'n3', title: 'Contact Information For Professor and TA', date: '2021-06-17T21:37:00.000Z', body: 'Instructor and TA contact details are in the course outline.' }],
    },
    {
      ou: 452612, code: 'CLCV 2305', title: 'Ancient Science and Technology', name: 'Crosslist CLCV2305A', links: links(452612),
      grades: { system: 'Weighted', categories: [], items: [item('as', 'ANCIENT SOURCE', null, 25, 10), item('mb', 'MODERN BOOK', null, 25, 10), item('ce', 'COURSE ESSAY', null, 25, 10)] },
      deadlines: [
        dl('as', 'CLCV 2305', 'ANCIENT SOURCE', 'assignment', '2026-11-03T04:59:00.000Z'),
        dl('mt', 'CLCV 2305', 'MID-TERM', 'test', '2026-12-23T22:00:00.000Z', { opens: '2026-12-12T15:00:00.000Z' }),
      ],
      news: [{ id: 'n4', title: 'AncSciTech 2026 2027: This week (21-25 Sept)', date: '2026-09-21T15:26:00.000Z', body: '(1) NO new recording this week (2) Course Essay video loaded in Course Essay folder; last item.\n(3) Office Hours tomorrow (Tues) 10:00 am - 11:00 am.' }],
    },
    {
      ou: 467909, code: 'COMP 2406', title: 'Fundamentals Web Applications', name: 'COMP2406A', links: links(467909),
      grades: {
        system: 'Weighted',
        categories: [
          { id: 't', name: 'Tutorials', weight: 20, drop: 0 },
          { id: 'a', name: 'Assignments', weight: 20, drop: 0 },
          { id: 'x', name: 'Tests', weight: 40, drop: 1 },
        ],
        items: [
          item('t1', 'Tutorial 1', 't', 15, 2, 15), item('t2', 'Tutorial 2', 't', 25, 2, 22),
          ...[21, 16, 17, 18, 16, 17, 16, 17].map((m, i) => item(`t${i + 3}`, `Tutorial ${i + 3}`, 't', m, 2)),
          item('a1', 'Assignment 1 - Client-side Programming', 'a', 100, 5), item('a2', 'Assignment 2 - Server-side Programming', 'a', 100, 5),
          item('a3', 'Assignment 3 - Express and PUG', 'a', 125, 5), item('a4', 'Assignment 4 - MongoDB and Sessions', 'a', 100, 5),
          ...[1, 2, 3, 4, 5].map((n) => item(`x${n}`, `Test${n}`, 'x', 20, 8)),
          item('fin', 'Final Exam', null, 80, 20),
        ],
      },
      deadlines: [
        dl('a1', 'COMP 2406', 'Assignment 1 - Client-side Programming', 'assignment', '2026-10-09T03:59:59.000Z'),
        dl('tu3', 'COMP 2406', 'Tutorial 3', 'quiz', '2026-10-09T14:00:00.000Z'),
        dl('te2', 'COMP 2406', 'Test 2 (JS + DOM), in person', 'test', '2026-10-10T03:59:00.000Z', { allDay: true }),
      ],
      news: [{ id: 'n5', title: 'Course Structure', date: '2026-09-11T04:01:00.000Z', body: 'There are no assigned lecture times. There are scheduled Tutorials every Friday morning and you MUST attend these 5 times during the term to complete the required in-person tests.' }],
    },
    {
      ou: 486347, code: 'COMP 3000', title: 'Operating Systems', name: 'Merged COMP3000A:COMP3000B', links: links(486347),
      // What coursesite.js reads from the course wiki.
      site: {
        tutorials: [['2026-09-14'], ['2026-09-21'], ['2026-09-28'], ['2026-10-05'], ['2026-11-02'], ['2026-11-09'], ['2026-11-16'], ['2026-11-23']].map(([available], i) => ({ n: i + 1, available })),
        assignments: [['2026-10-05'], ['2026-10-15T14:30'], ['2026-11-16'], ['2026-12-07']].map(([due], i) => ({ n: i + 1, due })),
      },
      grades: {
        system: 'Points',
        categories: [
          { id: 't', name: 'Tutorials', weight: null, drop: 0 },
          { id: 'a', name: 'Assignments', weight: null, drop: 0 },
          { id: 'e', name: 'Exams', weight: null, drop: 0 },
        ],
        items: [item('t1', 'Tutorial 1', 't', 4, 10, 4), item('t2', 'Tutorial 2', 't', 4, 10, 4), item('t3', 'Tutorial 3', 't', 4, 10), item('t4', 'Tutorial 4', 't', 4, 10),
          // Brightspace really does have Assignment 1 outside any category.
          item('a1', 'Assignment 1', 0, 20, 10)],
      },
      deadlines: [],
      news: [],
    },
  ],
};
