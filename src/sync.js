// Pulls everything the dashboard needs from Brightspace into one plain-JSON snapshot.
// Only depends on a client with get / getAllObjects / getAllItems (see d2l.js).

import { BASE, COURSE_ORDER, COURSE_SITES, DUE_OVERRIDES, EXTRA_DEADLINES, BONUS_DEADLINES, DUE_NIGHT_BEFORE, ONE_AT_A_TIME } from './config.js';
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
  // Quizzes and folders that exist in Brightspace are `live`: there is something to open and work on.
  const fromBrightspace = (course.deadlines || []).filter((d) => !d.id.startsWith('cfg:')) // older snapshots baked these in
    .map((d) => (/:(quiz|drop):/.test(d.id) ? { ...d, live: true } : d));
  // Names of grade items with a mark, from the sync and straight from the grade sheet.
  const gradedNames = [...new Set([
    ...(course.gradedNames || []),
    ...(course.grades?.items || []).filter((it) => it.points != null).map((it) => it.name),
  ])];
  const groupId = (g) => (g ? `group:${slug(code)}:${slug(g)}` : undefined);
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const synced = new Set(fromBrightspace.map((d) => norm(d.title)));
  const countMatching = (pattern, names) => names.filter((n) => new RegExp(pattern, 'i').test(n)).length;
  const syncedTitles = fromBrightspace.map((d) => d.title);

  const graded = (pattern, count = 1) => countMatching(pattern, gradedNames) >= count;
  // From the course website (see coursesite.js): assignment due dates, and one deadline per
  // tutorial that isn't graded yet.
  const { site } = course;
  const siteCfg = COURSE_SITES[code];
  const siteAssignment = (title) => {
    const n = /^Assignment (\d+)$/.exec(title);
    return n && site?.assignments.find((a) => a.n === Number(n[1]));
  };
  const tutorials = (siteCfg && site ? site.tutorials : [])
    .filter((t) => !graded(`^Tutorial ${t.n}$`))
    .flatMap((t) => {
      const [y, m, d] = t.available.split('-').map(Number);
      const { name, weekday, time } = siteCfg.session;
      const [hh, mm] = time.split(':').map(Number);
      // Your first session after the release day (released Monday -> Tuesday's session).
      const first = new Date(y, m - 1, d + 1, hh, mm);
      first.setDate(first.getDate() + ((weekday - first.getDay() + 7) % 7));
      const at = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(first);
      const row = (key, title, due) => ({
        id: `site:${slug(code)}:tutorial-${t.n}-${key}`,
        course: code,
        title,
        kind: 'tutorial',
        opens: new Date(y, m - 1, d).toISOString(),
        due: due.toISOString(),
        end: null,
        autoDone: false,
        url: siteCfg.tutorialUrl.replace('{n}', t.n),
        group: groupId(`tutorial-${t.n}`), // ticking either one ticks both
        posted: t.posted,
        live: t.posted === true,
      });
      return [
        { ...row('first', `Tutorial ${t.n}: get it marked at your ${name}`, first), fixedTime: true }, // it's a session
        row('final', `Tutorial ${t.n}: last day to get it marked (${name}, ${at})`, new Date(y, m - 1, d + siteCfg.tutorialDays, 23, 59)),
      ];
    });

  const extras = EXTRA_DEADLINES.filter((x) => x.course === code)
    .map((x) => {
      const a = siteAssignment(x.title);
      return a ? { ...x, date: x.keepDate ? x.date : a.due, posted: a.posted } : x;
    })
    .filter((x) => !synced.has(norm(x.title)))
    .filter((x) => !(x.unless && countMatching(x.unless, syncedTitles) > 0))
    .filter((x) => !(x.dropWhenGraded && graded(x.gradedAs, x.gradedCount)))
    .flatMap((x) => {
      if (!x.notes?.length) return [{ ...x, fullTitle: x.title }];
      // The id keeps every note, so it stays stable as notes drop off (and dates keep sessions apart).
      const fullTitle = `${x.title} (${x.notes.map((n) => n.text).join('; ')}) ${x.date}`;
      const open = x.notes.filter((n) => !graded(n.gradedAs));
      if (!open.length) return [];
      const notes = open.map((n) => ({ text: n.text, group: groupId(n.group) }));
      return [{ ...x, fullTitle, baseTitle: x.title, notes, title: `${x.title} (${open.map((n) => n.text).join('; ')})` }];
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
      autoDone: (!!x.gradedAs && graded(x.gradedAs, x.gradedCount))
        || (!!x.doneWith && fromBrightspace.some((d) => d.autoDone && new RegExp(x.doneWith, 'i').test(d.title))),
      url: x.url || `${BASE}/d2l/home/${ou}`,
      group: groupId(x.group),
      ...(x.posted == null ? {} : { posted: x.posted, live: x.posted }),
      ...(x.openWeekOf ? { live: true, openFrom: weekStart(localDate(x.date)), openTitle: x.openSteps?.find((s) => !graded(s.gradedAs))?.title } : {}),
      ...(x.baseTitle ? { baseTitle: x.baseTitle, notes: x.notes } : {}),
    }));

  // Any grade update ticks what it can: a deadline is done once a grade item with a mark has
  // its name, or the name its title starts with ("Test 2" marks "Test 2 (JS + DOM), in person").
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const gradedWords = gradedNames.map(words).filter((g) => g.length >= 4);
  const hasMark = (title) => gradedWords.some((g) => words(title) === g || words(title).startsWith(`${g} `));

  return [...fromBrightspace, ...extras, ...tutorials].map(moveEarlier).map((d) => {
    if (!d.autoDone && hasMark(d.title)) d = { ...d, autoDone: true };
    // Hand-in work only: a quiz or exam neither waits its turn nor holds the next paper back.
    if (d.live && d.kind === 'assignment' && ONE_AT_A_TIME.includes(code)) d = { ...d, oneAtATime: true };
    const rule = BONUS_DEADLINES.find((b) => b.course === code && new RegExp(b.match, 'i').test(d.title));
    const bonus = rule ? rule.note : d.bonus || /bonus/i.test(d.title) ? 'Bonus marks' : null;
    return bonus ? { ...d, bonus } : { ...d, bonus: undefined };
  });
}

// Monday 00:00 (local) of the week containing an ISO date; weeks run Monday to Sunday.
function weekStart(iso) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).toISOString();
}

// Applies DUE_NIGHT_BEFORE: a hand-in due partway through a day moves to 11:59 PM the night
// before. The real due time is kept as `realDue`.
function moveEarlier(d) {
  if (!DUE_NIGHT_BEFORE || !d.due || d.slot || d.end || d.kind === 'event' || d.fixedTime) return d;
  const due = new Date(d.due);
  if (due.getHours() === 23 && due.getMinutes() >= 55) return d; // already end of day
  // A window inside one day is a sitting, not a hand-in.
  if (d.opens && new Date(d.opens).toDateString() === due.toDateString()) return d;
  const moved = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 23, 59);
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
