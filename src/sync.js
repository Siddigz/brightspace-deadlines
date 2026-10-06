// Pulls everything the dashboard needs from Brightspace into one plain-JSON snapshot.
// Only depends on a client with get / getAllObjects / getAllItems (see d2l.js).

import { BASE, COURSE_ORDER, DUE_OVERRIDES, EXTRA_DEADLINES, BONUS_DEADLINES, MOVE_DEADLINES } from './config.js';
import { LP, LE } from './d2l.js';

const DAY = 86400000;

// "Crosslist CLCV2105A:PHIL2005A [31033:33778] Ancient Phil:Search for Wisdom (LEC) Fall 2026"
//   -> { code: 'CLCV 2105', title: 'Ancient Phil:Search for Wisdom' }
export function parseCourseName(name) {
  const m = name.match(/([A-Z]{4})\s?(\d{4})/);
  const code = m ? `${m[1]} ${m[2]}` : name;
  const title = name
    .replace(/^(Crosslist|Merged?)\s+/i, '')
    .replace(/^([A-Z]{4}\s?\d{4}[A-Z]?(:[A-Z]{4}\s?\d{4}[A-Z]?)*)\s*/, '')
    .replace(/^\[[\d:]+\]\s*/, '')
    .replace(/\s*\((LEC|OTH|WRK|LAB|SEM|TUT)\).*$/, '')
    .trim();
  return { code, title: title || name };
}

// Local-time date for config values: '2026-11-02' means 11:59 PM that day.
export function localDate(s) {
  const [d, t] = s.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t ? t.split(':').map(Number) : [23, 59];
  return new Date(y, mo - 1, da, h, mi).toISOString();
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function pickCourses(client) {
  const all = await client.getAllItems(`${LP}/enrollments/myenrollments/?orgUnitTypeId=3`);
  let chosen = all.filter((e) => e.PinDate && e.Access.CanAccess);
  if (!chosen.length) chosen = all.filter((e) => e.Access.IsActive && e.Access.CanAccess);
  const rank = (code) => {
    const i = COURSE_ORDER.indexOf(code);
    return i === -1 ? COURSE_ORDER.length : i;
  };
  return chosen
    .map((e) => ({ ou: e.OrgUnit.Id, name: e.OrgUnit.Name, ...parseCourseName(e.OrgUnit.Name) }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}

async function syncCourse(client, course, now) {
  const { ou, code } = course;
  const from = new Date(now - 60 * DAY).toISOString();
  const to = new Date(now + 300 * DAY).toISOString();

  const [setup, gradeObjects, categories, myGrades, quizzes, folders, events, news] = await Promise.all([
    client.get(`${LE}/${ou}/grades/setup/`),
    client.get(`${LE}/${ou}/grades/`),
    client.get(`${LE}/${ou}/grades/categories/`),
    client.get(`${LE}/${ou}/grades/values/myGradeValues/`),
    client.getAllObjects(`${LE}/${ou}/quizzes/`),
    client.get(`${LE}/${ou}/dropbox/folders/`),
    client.getAllObjects(`${LE}/${ou}/calendar/events/myEvents/?startDateTime=${from}&endDateTime=${to}`),
    client.get(`${LE}/${ou}/news/`),
  ]);

  const gradeById = new Map();
  for (const g of myGrades || []) {
    if (g.PointsNumerator != null) gradeById.set(String(g.GradeObjectIdentifier), g);
  }

  // ---- grade sheet ----
  const objs = (gradeObjects || []).filter((o) => o.GradeType !== 'Text' && o.GradeType !== 'Category');
  const grades = {
    system: setup?.GradingSystem || 'Weighted',
    categories: (categories || []).map((c) => ({
      id: String(c.Id),
      name: c.Name,
      weight: c.Weight,
      drop: c.NumberOfLowestToDrop || 0,
    })),
    items: objs.map((o) => {
      const g = gradeById.get(String(o.Id));
      return {
        id: String(o.Id),
        name: o.Name.trim(),
        categoryId: o.CategoryId ? String(o.CategoryId) : null,
        max: o.MaxPoints,
        weight: o.Weight,
        bonus: !!o.IsBonus,
        points: g ? g.PointsNumerator : null,
        outOf: g ? g.PointsDenominator : null,
      };
    }),
  };

  // Grade items that only add bonus marks, so their deadlines can be flagged.
  const bonusCats = new Set((categories || []).filter((c) => /bonus/i.test(c.Name)).map((c) => String(c.Id)));
  const bonusItems = new Set(
    (gradeObjects || []).filter((o) => o.IsBonus || bonusCats.has(String(o.CategoryId))).map((o) => String(o.Id)),
  );
  const isBonusItem = (gradeItemId) => gradeItemId != null && bonusItems.has(String(gradeItemId));

  // ---- deadlines ----
  const deadlines = [];
  const overrides = DUE_OVERRIDES[code] || {};

  for (const q of quizzes) {
    const due = q.DueDate || q.EndDate || (overrides[q.Name.trim()] && localDate(overrides[q.Name.trim()]));
    if (!due || !q.IsActive) continue;
    deadlines.push({
      id: `${ou}:quiz:${q.QuizId}`,
      course: code,
      title: q.Name.trim(),
      kind: /exam|midterm|mid-term|final|test/i.test(q.Name) ? 'test' : 'quiz',
      opens: q.StartDate,
      due,
      autoDone: q.GradeItemId != null && gradeById.has(String(q.GradeItemId)),
      bonus: isBonusItem(q.GradeItemId),
      url: `${BASE}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${q.QuizId}&ou=${ou}`,
    });
  }

  for (const f of folders || []) {
    const override = overrides[f.Name.trim()];
    const due = f.DueDate || (override && localDate(override)) || f.Availability?.EndDate;
    if (!due) continue;
    // Only ask about submissions for folders that are still relevant.
    let submitted = false;
    if (Date.parse(due) > now - 21 * DAY) {
      const subs = await client.get(`${LE}/${ou}/dropbox/folders/${f.Id}/submissions/mysubmissions/`);
      submitted = (subs || []).some((s) => (s.Submissions || []).length > 0);
    }
    deadlines.push({
      id: `${ou}:drop:${f.Id}`,
      course: code,
      title: f.Name.trim(),
      kind: 'assignment',
      opens: f.Availability?.StartDate || null,
      due,
      autoDone: submitted || (f.GradeItemId != null && gradeById.has(String(f.GradeItemId))),
      bonus: isBonusItem(f.GradeItemId),
      url: `${BASE}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${f.Id}&ou=${ou}`,
    });
  }

  // Calendar entries tied to quizzes/folders/content are already covered above;
  // keep only standalone events (e.g. Zoom discussions), minus the recurring class-meeting entry.
  for (const e of events) {
    if (e.AssociatedEntity?.AssociatedEntityType) continue;
    if (e.Title.trim() === course.name.trim()) continue;
    deadlines.push({
      id: `${ou}:cal:${e.CalendarEventId}`,
      course: code,
      title: e.Title.trim(),
      kind: 'event',
      opens: null,
      due: e.StartDateTime,
      end: e.EndDateTime,
      autoDone: false,
      url: `${BASE}/d2l/le/calendar/${ou}`,
    });
  }

  return {
    ...course,
    links: {
      home: `${BASE}/d2l/home/${ou}`,
      grades: `${BASE}/d2l/lms/grades/my_grades/main.d2l?ou=${ou}`,
      content: `${BASE}/d2l/le/content/${ou}/Home`,
    },
    grades,
    deadlines,
    // Names of grade items that have a mark, so config deadlines can tick themselves off.
    gradedNames: objs.filter((o) => gradeById.has(String(o.Id))).map((o) => o.Name.trim()),
    news: (news || [])
      .filter((n) => !n.IsHidden)
      .map((n) => ({ id: `${ou}:news:${n.Id}`, title: n.Title, date: n.StartDate, body: stripHtml(n.Body?.Html).slice(0, 1200) }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
  };
}

// A course's full deadline list: what Brightspace has, plus config entries (outline dates,
// Outlook dates, lectures...) and bonus notes. Applied when displaying, not when syncing,
// so config changes show up as soon as the extension reloads, even without a new sync.
export function courseDeadlines(course) {
  const { code, ou } = course;
  const fromBrightspace = (course.deadlines || []).filter((d) => !d.id.startsWith('cfg:')); // older snapshots baked these in
  const gradedNames = course.gradedNames || [];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const synced = new Set(fromBrightspace.map((d) => norm(d.title)));
  const countMatching = (pattern, names) => names.filter((n) => new RegExp(pattern, 'i').test(n)).length;
  const syncedTitles = fromBrightspace.map((d) => d.title);

  const graded = (pattern, count = 1) => countMatching(pattern, gradedNames) >= count;
  const extras = EXTRA_DEADLINES.filter((x) => x.course === code)
    .filter((x) => !synced.has(norm(x.title)))
    .filter((x) => !(x.unless && countMatching(x.unless, syncedTitles) > 0))
    .filter((x) => !(x.dropWhenGraded && graded(x.gradedAs, x.gradedCount)))
    .flatMap((x) => {
      if (!x.notes?.length) return [{ ...x, fullTitle: x.title }];
      // The id keeps every note, so it stays stable as notes drop off (and dates keep sessions apart).
      const fullTitle = `${x.title} (${x.notes.map((n) => n.text).join('; ')}) ${x.date}`;
      const open = x.notes.filter((n) => !graded(n.gradedAs));
      return open.length ? [{ ...x, fullTitle, title: `${x.title} (${open.map((n) => n.text).join('; ')})` }] : [];
    })
    .map((x) => ({
      id: `cfg:${slug(code)}:${slug(x.fullTitle)}`,
      course: code,
      title: x.title,
      kind: x.kind || 'other',
      opens: null,
      due: localDate(x.date),
      end: x.end ? localDate(x.end) : null,
      slot: !!x.end,
      allDay: !!x.allDay,
      autoDone: !!x.gradedAs && graded(x.gradedAs, x.gradedCount),
      url: x.url || `${BASE}/d2l/home/${ou}`,
    }));

  return [...fromBrightspace, ...extras].map((d) => moveEarlier(d, code)).map((d) => {
    const rule = BONUS_DEADLINES.find((b) => b.course === code && new RegExp(b.match, 'i').test(d.title));
    const bonus = rule ? rule.note : d.bonus || /bonus/i.test(d.title) ? 'Bonus marks' : null;
    return bonus ? { ...d, bonus } : { ...d, bonus: undefined };
  });
}

// Applies MOVE_DEADLINES; the real due time is kept as `realDue`.
function moveEarlier(d, code) {
  if (!d.due || d.slot) return d;
  const due = new Date(d.due);
  const rule = MOVE_DEADLINES.find((m) => m.course === code && due.getDay() === m.from && new RegExp(m.match, 'i').test(d.title));
  if (!rule) return d;
  const [hh, mm] = rule.time.split(':').map(Number);
  const moved = new Date(due.getFullYear(), due.getMonth(), due.getDate() - ((rule.from - rule.to + 7) % 7 || 7), hh, mm);
  return { ...d, due: moved.toISOString(), realDue: d.due };
}

export async function syncAll(client, now = Date.now()) {
  const list = await pickCourses(client);
  const courses = [];
  for (const c of list) courses.push(await syncCourse(client, c, now));
  return {
    syncedAt: new Date(now).toISOString(),
    user: client.me ? `${client.me.FirstName} ${client.me.LastName}` : null,
    courses,
  };
}
