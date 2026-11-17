import { COURSE_COLORS, CODE_LABELS, BASE, OUTLINES } from './config.js';
import { load, savePrefs, isDone, allDeadlines, siteProblems } from './store.js';
import { openNow } from './prefs.js';
import { applyOutline, computeCourse, termSheet, letter } from './grades.js';

const DAY = 86400000;
const TARGETS = [90, 85, 80, 77, 73, 70];

const state = {
  snapshot: null,
  prefs: null,
  syncError: null,
  syncing: false,
  view: 'deadlines',
  hiddenCourses: new Set(),
  showDone: false,
  showAll: false,
  bonusOnly: false,
  expanded: new Set(),
  openChecklists: new Set(), // deadline ids whose checklist dropdown is open
  terms: {}, // full-year course code -> 'Fall' | 'Winter' | 'Full year' (absent = the current term)
  freshNews: new Set(), // unseen when you opened Announcements; stay marked New until you leave the tab
};

// ---- per-viewer UI memory (never required) ----
function remember() {
  try {
    localStorage.setItem('ui', JSON.stringify({
      view: state.view, hiddenCourses: [...state.hiddenCourses], showDone: state.showDone,
      showAll: state.showAll, bonusOnly: state.bonusOnly, terms: state.terms,
    }));
  } catch {}
}
function recall() {
  try {
    const ui = JSON.parse(localStorage.getItem('ui') || '{}');
    Object.assign(state, { ...ui, hiddenCourses: new Set(ui.hiddenCourses || []), expanded: new Set() });
  } catch {}
}

// ---- helpers ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const label = (code) => CODE_LABELS[code] || code;
const color = (code) => COURSE_COLORS[code] || '#6b7280';
const fmt1 = (n) => (n == null || Number.isNaN(n) ? '–' : (Math.round(n * 10) / 10).toString());
const courses = () => state.snapshot?.courses || [];
const codeOrder = (code) => {
  const i = courses().findIndex((c) => c.code === code);
  return i === -1 ? 99 : i;
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
// Monday 00:00 of the week containing t (weeks run Monday to Sunday).
function startOfWeek(t) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
function weekLabel(monday) {
  const diff = Math.round((monday - startOfWeek(Date.now())) / (7 * DAY));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const range = `${shortFmt.format(new Date(monday))} – ${shortFmt.format(sunday)}`;
  if (diff === 0) return `This week · ${range}`;
  if (diff === 1) return `Next week · ${range}`;
  if (diff === -1) return `Last week · ${range}`;
  return `Week of ${range}`;
}
function dayHeading(key) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(y, m - 1, d).getTime();
  const today = startOfDay(Date.now());
  const diff = Math.round((t - today) / DAY);
  const name = dayFmt.format(new Date(t));
  if (diff === 0) return `Today · ${name}`;
  if (diff === 1) return `Tomorrow · ${name}`;
  if (diff === -1) return `Yesterday · ${name}`;
  return name;
}
function relative(t) {
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const unit = abs < 3600e3 ? [Math.round(abs / 60e3), 'min'] : abs < 2 * DAY ? [Math.round(abs / 3600e3), 'h'] : [Math.round(abs / DAY), 'd'];
  return diff >= 0 ? `in ${unit[0]}${unit[1]}` : `${unit[0]}${unit[1]} ago`;
}

// Time slots (events, test sittings, exam windows) have an end and are never "overdue".
const isSlot = (d) => d.kind === 'event' || !!d.slot;

// A test you can sit any time in a window of more than a day (a take-home final) is listed at the
// moment it opens, the earliest you can start, until then; after that, under the day it closes.
const listedAtOpen = (d, now = Date.now()) =>
  d.kind === 'test' && !!d.opens && Date.parse(d.opens) > now && Date.parse(d.due) - Date.parse(d.opens) > DAY;

function whenText(d) {
  const due = new Date(d.due);
  const end = d.end ? new Date(d.end) : null;
  if (d.allDay) return end && dayKey(end) !== dayKey(due) ? `${shortFmt.format(due)} – ${shortFmt.format(end)}` : 'all day';
  if (isSlot(d)) {
    if (!end || +end === +due) return timeFmt.format(due);
    return dayKey(end) === dayKey(due)
      ? `${timeFmt.format(due)} – ${timeFmt.format(end)}`
      : `${shortFmt.format(due)} – ${shortFmt.format(end)}`;
  }
  const opens = d.opens ? new Date(d.opens) : null;
  if (listedAtOpen(d)) return `opens ${timeFmt.format(opens)} · closes ${shortFmt.format(due)}, ${timeFmt.format(due)}`;
  if (opens && opens > Date.now()) {
    const sameDay = dayKey(opens) === dayKey(due);
    if (sameDay && due - opens > 20 * 3600e3) return 'open all day';
    if (sameDay) return `${timeFmt.format(opens)} – ${timeFmt.format(due)}`;
    return `window opens ${shortFmt.format(opens)} · closes ${timeFmt.format(due)}`;
  }
  return `due ${timeFmt.format(due)}`;
}

// ---- data mutations ----
async function updatePrefs(fn) {
  fn(state.prefs);
  await savePrefs(state.prefs);
  render();
}

async function sync() {
  if (state.syncing) return;
  state.syncing = true;
  render();
  try {
    await chrome.runtime.sendMessage({ type: 'sync' });
  } finally {
    Object.assign(state, await load(), { syncing: false });
    render();
  }
}

// ---- announcements you haven't seen ----
const allNews = () => courses().flatMap((c) => c.news.map((n) => ({ ...n, course: c.code })));

function unseenNews() {
  const seen = new Set(state.prefs.newsSeen || []);
  return allNews().filter((n) => !state.hiddenCourses.has(n.course) && !seen.has(n.id));
}

// The first sync counts everything as seen, so old posts don't light up the tab.
function markNewsSeen() {
  const all = allNews();
  if (!all.length) return;
  const { prefs } = state;
  const first = !prefs.newsSeen;
  const fresh = first ? all : unseenNews();
  if (!fresh.length) return;
  if (!first) for (const n of fresh) state.freshNews.add(n.id);
  const current = new Set(all.map((n) => n.id));
  prefs.newsSeen = [...(prefs.newsSeen || []).filter((id) => current.has(id)), ...fresh.map((n) => n.id)];
  savePrefs(prefs);
}

// ---- views ----
function renderHeader() {
  const status = document.getElementById('sync-status');
  const btn = document.getElementById('sync-btn');
  btn.disabled = state.syncing;
  // The phone page (phone/boot.js sets globalThis.tracker) only re-reads what the laptop last synced.
  const onPhone = !!globalThis.tracker;
  btn.textContent = state.syncing ? (onPhone ? 'Refreshing…' : 'Syncing…') : (onPhone ? 'Refresh' : 'Sync now');
  const s = state.snapshot;
  status.textContent = s
    ? `${s.user ? s.user + ' · ' : ''}${onPhone ? 'Last change from laptop' : 'Synced'} ${longFmt.format(new Date(s.syncedAt))}`
    : state.syncing ? 'Syncing with Brightspace…' : 'Not synced yet';

  const banner = document.getElementById('banner');
  const err = state.syncError;
  if (err && !state.syncing) {
    banner.hidden = false;
    banner.innerHTML = err.auth
      ? `Couldn't reach your Brightspace account. <a href="${BASE}/d2l/home" target="_blank">Sign in to Brightspace</a>, then press Sync now.`
      : `Last sync failed: ${esc(err.message)}`;
  } else {
    banner.hidden = true;
  }

  for (const b of document.querySelectorAll('.tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.view === state.view));
  }
  const unseen = state.view === 'news' ? 0 : unseenNews().length;
  const badge = document.getElementById('news-badge');
  badge.hidden = !unseen;
  badge.textContent = unseen;
  badge.title = `${unseen} new announcement${unseen === 1 ? '' : 's'}`;

  const chips = courses().length ? [...courses(), { code: 'Carleton', title: 'University dates' }, { code: 'Personal', title: 'Your own deadlines' }] : [];
  document.getElementById('course-filter').innerHTML = chips
    .map((c) => `<button class="chip" data-toggle-course="${esc(c.code)}" aria-pressed="${!state.hiddenCourses.has(c.code)}" title="${esc(c.title)}"><span class="dot" style="--c:${color(c.code)}"></span>${esc(label(c.code))}</button>`)
    .join('');
}

function renderDeadlines() {
  const now = Date.now();
  const today = startOfDay(now);
  const { prefs } = state;

  let items = allDeadlines(state.snapshot, prefs)
    .filter((d) => !state.hiddenCourses.has(d.course) && (!prefs.hidden[d.id] || d.locked))
    .map((d) => ({ ...d, t: Date.parse(listedAtOpen(d, now) ? d.opens : d.due), done: isDone(d, prefs) }));

  if (!state.showDone) items = items.filter((d) => !d.done);
  if (state.bonusOnly) items = items.filter((d) => d.bonus);

  // The next deadline flagged `highlightUntil` (e.g. an interview): everything before it is highlighted.
  const target = items.filter((d) => d.highlightUntil && d.t > now).sort((a, b) => a.t - b.t)[0];
  const mark = (d) => (!target ? '' : d.id === target.id ? 'target' : d.t <= target.t ? 'before-target' : '');

  const overdue = [];
  const late = []; // past due but still accepted with a penalty (LATE_POLICIES)
  const byDay = new Map();
  for (const d of items) {
    const over = isSlot(d) && d.end ? Date.parse(d.end) : d.t;
    const isPast = over < now && !(d.allDay && over >= today);
    // Unfinished checklists stay overdue until done or hidden with ×.
    if (isPast && !state.showAll && d.checklist && !d.done) {
      overdue.push(d);
      continue;
    }
    if (isPast && !state.showAll && !d.done && d.lateUntil && Date.parse(d.lateUntil) > now) {
      late.push(d);
      continue;
    }
    if (isPast && !state.showAll) {
      // Missed work from the last two weeks stays visible; past time slots just drop off.
      if (!isSlot(d) && !d.done && d.t > now - 14 * DAY) overdue.push(d);
      continue;
    }
    if (!state.showAll && d.t > now + 75 * DAY) continue;
    const key = dayKey(new Date(d.t));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(d);
  }

  const sortItems = (a, b) => a.t - b.t || codeOrder(a.course) - codeOrder(b.course);
  const isLate = (d) => !d.done && d.t < now && d.lateUntil && Date.parse(d.lateUntil) > now;
  const row = (d) => {
    const soon = !d.done && d.t > now && d.t - now < 2 * DAY;
    const lateNow = isLate(d);
    // A session that's your catch-up for a tutorial you missed (see sync.js): red, like late work.
    const behindNow = !d.done && d.behind?.length && Date.parse(d.behindSince) < now;
    return `<div class="row ${d.done ? 'done' : ''} ${lateNow || behindNow ? 'late' : ''} ${mark(d)}">
      ${d.locked
    ? '<span class="no-check"></span>' // locked: nothing to tick, but keep the column so titles line up
    : `<input type="checkbox" data-done="${esc(d.id)}" ${d.done ? 'checked' : ''} aria-label="Mark done">`}
      <span class="tag" style="--c:${color(d.course)}">${esc(label(d.course))}</span>
      <span class="title">${d.url ? `<a href="${esc(d.url)}" target="_blank">${esc(d.title)}</a>` : esc(d.title)}<span class="kind">${esc(d.kind)}</span>${(d.links || []).map(([name, href]) => `<a class="link" href="${esc(href)}" target="_blank">${esc(name)}</a>`).join('')}${d.posted === false ? '<span class="kind">not posted yet</span>' : ''}${d.realDue && !lateNow ? `<span class="kind">closes ${esc(longFmt.format(new Date(d.realDue)))}</span>` : ''}${lateNow ? `<span class="late-note">${esc(d.latePenalty)} · accepted until ${esc(longFmt.format(new Date(d.lateUntil)))}</span>` : ''}${behindNow ? `<span class="late-note">overdue: Tutorial ${d.behind.join(' + ')} (missed ${esc(shortFmt.format(new Date(d.behindSince)))})</span>` : ''}${d.bonus ? `<span class="bonus" title="${esc(d.bonus)}">bonus</span><span class="bonus-note">${esc(d.bonus)}</span>` : ''}${checklist(d)}</span>
      <span class="when ${soon ? 'soon' : ''}" title="${esc(longFmt.format(new Date(d.t)))}">${lateNow ? `due · ${relative(d.t)}` : `${esc(whenText(d))}${d.t > now ? ` · ${relative(d.t)}` : ''}`}</span>
      ${d.locked ? '' : `<button class="icon-btn" data-hide="${esc(d.id)}" title="Hide this item" aria-label="Hide">×</button>`}
    </div>`;
  };

  const checklist = (d) => {
    if (!d.checklist) return '';
    const solved = d.checklist.filter((x) => prefs.checked[x]).length;
    return `<details class="checklist" data-checklist="${esc(d.id)}" ${state.openChecklists.has(d.id) ? 'open' : ''}>
      <summary>${solved}/${d.checklist.length} solved</summary>
      ${d.checklist.map((x) => `<label><input type="checkbox" data-check="${esc(x)}" ${prefs.checked[x] ? 'checked' : ''}> ${esc(x)}</label>`).join('')}
    </details>`;
  };

  let html = `<div class="toolbar">
    <label><input type="checkbox" data-opt="showDone" ${state.showDone ? 'checked' : ''}> Show finished</label>
    <label><input type="checkbox" data-opt="showAll" ${state.showAll ? 'checked' : ''}> Show everything (past and far future)</label>
    <label><input type="checkbox" data-opt="bonusOnly" ${state.bonusOnly ? 'checked' : ''}> Only bonus-mark items</label>
    ${Object.keys(prefs.hidden).length ? `<button class="btn small" data-action="unhide">Unhide ${Object.keys(prefs.hidden).length} hidden</button>` : ''}
  </div>`;
  for (const problem of siteProblems(state.snapshot)) html += `<p class="site-note">${esc(problem)}</p>`;
  if (target) {
    html += `<p class="target-note"><span class="swatch"></span>Highlighted: everything before <b>${esc(target.title)}</b> · ${esc(dayFmt.format(new Date(target.t)))} · ${relative(target.t)}</p>`;
  }

  if (late.length) {
    html += `<section class="day late"><h2>Due (late, still accepted)</h2><div class="list">${late.sort(sortItems).map(row).join('')}</div></section>`;
  }
  if (overdue.length) {
    html += `<section class="day overdue"><h2>Overdue</h2><div class="list">${overdue.sort(sortItems).map(row).join('')}</div></section>`;
  }
  const days = [...byDay.keys()].sort();
  let week = null;
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number);
    const monday = startOfWeek(new Date(y, m - 1, d).getTime());
    if (monday !== week) {
      week = monday;
      html += `<div class="week-break" role="separator"><span>${esc(weekLabel(monday))}</span></div>`;
    }
    html += `<section class="day"><h2>${esc(dayHeading(key))}</h2><div class="list">${byDay.get(key).sort(sortItems).map(row).join('')}</div></section>`;
  }
  if (!overdue.length && !days.length) {
    html += `<div class="empty">${state.snapshot ? 'Nothing due. Enjoy it.' : 'Press Sync now to pull your deadlines from Brightspace.'}</div>`;
  }

  html += `<details class="add"><summary>Add a deadline</summary>
    <form class="form" data-form="deadline">
      <label>Course<select name="course" required>${courses().map((c) => `<option value="${esc(c.code)}">${esc(label(c.code))}</option>`).join('')}</select></label>
      <label style="flex:1 1 220px">What<input name="title" required placeholder="e.g. Assignment 1"></label>
      <label>Date<input type="date" name="date" required></label>
      <label>Time (optional)<input type="time" name="time"></label>
      <button class="btn primary" type="submit">Add</button>
    </form>
  </details>`;

  const custom = prefs.custom.filter((c) => !state.hiddenCourses.has(c.course));
  if (custom.length) {
    html += `<p class="hint">You've added ${custom.length} deadline${custom.length > 1 ? 's' : ''} yourself. Hide one with × to remove it.</p>`;
  }

  // Side panel: what's open to work on right now.
  const open = openNow(allDeadlines(state.snapshot, prefs).filter((d) => !state.hiddenCourses.has(d.course)), prefs, now);
  const side = `<aside class="open-now" aria-label="Open now">
    <h2>Open now <span class="count">${open.length}</span></h2>
    ${open.map((d) => {
      const t = Date.parse(d.realDue || d.due);
      return `<a class="open-item" href="${esc(d.openUrl || d.url)}" target="_blank" style="--c:${color(d.course)}">
        <span class="tag" style="--c:${color(d.course)}">${esc(label(d.course))}</span>
        <span class="open-title">${esc(d.openTitle || d.title)}</span>
        <span class="open-when ${t - now < 2 * DAY ? 'soon' : ''}">closes ${esc(longFmt.format(new Date(t)))} · ${relative(t)}</span>
        ${d.unlocked == null ? '' : `<span class="open-lock ${d.unlocked ? 'yes' : ''}">${d.unlocked ? 'Unlocked in Brightspace' : 'Locked in Brightspace: watch the lectures first'}</span>`}
      </a>`;
    }).join('') || '<p class="hint">Nothing is open right now.</p>'}
  </aside>`;
  return `<div class="with-side"><div class="main-col">${html}</div>${side}</div>`;
}

function neededChips(r) {
  if (r.current == null && r.totalW === 0) return '';
  return `<div class="needed">${TARGETS.map((t) => {
    const n = r.needed(t);
    if (n == null) return '';
    const l = letter(t);
    if (n <= 0) return `<span>${l}: locked in</span>`;
    if (n > 100) return `<span class="no">${l}: out of reach</span>`;
    return `<span>${l}: need <b class="num">${fmt1(n)}%</b> avg on the rest</span>`;
  }).join('')}</div>`;
}

function componentRows(course, r) {
  const weightCell = (W) => (W ? `${fmt1(W)}%` : '<span class="muted">–</span>');
  const scoreCell = (it, dropped) => {
    if (it.actual != null) {
      const pts = it.points != null ? `${fmt1(it.points)}/${fmt1(it.outOf || it.max)} · ` : '';
      return `${pts}<b>${fmt1(it.actual)}%</b>${dropped ? ' (dropped)' : ''}`;
    }
    return '<span class="muted">–</span>';
  };

  // Components that can only raise the grade; `ignored` while counting them wouldn't help.
  const helps = (c) => (c.onlyHelps
    ? ` <span class="pill-helps" title="Can only raise your grade">only helps</span>${c.ignored ? ' <span class="muted" title="Your grade is better without it right now, or it has no mark yet">· not counted</span>' : ''}`
    : '');

  let html = '';
  for (const c of r.components) {
    if (c.single) {
      const it = c.items[0];
      html += `<tr class="comp">
        <td>${esc(it.name)}${c.bonus ? ' <span class="pill-bonus">bonus</span>' : ''}${helps(c)}</td>
        <td class="r num">${weightCell(c.W)}</td>
        <td class="r num">${scoreCell(it, false)}</td>
        <td class="r">${it.extra ? '<span class="muted" title="From the course outline; not in Brightspace yet">outline</span>' : ''}</td>
      </tr>`;
      continue;
    }
    const key = `${course.code}|${c.id}`;
    const open = state.expanded.has(key);
    const graded = c.items.filter((it) => it.actual != null).length;
    html += `<tr class="comp">
      <td>${c.items.length ? `<button class="icon-btn" data-expand="${esc(key)}" aria-expanded="${open}">${open ? '▾' : '▸'}</button>` : ''}${esc(c.name)}
        <span class="muted"> · ${graded}/${c.items.length} graded${c.drop ? `, lowest ${c.drop} dropped` : ''}${c.limited ? ` · only ${c.limited.max} of the ${c.limited.of} could be handed in, all ${c.limited.max} used` : ''}</span>${c.bonus ? ' <span class="pill-bonus">bonus</span>' : ''}${helps(c)}</td>
      <td class="r num">${weightCell(c.W)}</td>
      <td class="r num">${c.pct == null ? '–' : `<b>${fmt1(c.pct)}%</b>`}</td>
      <td></td>
    </tr>`;
    if (open) {
      for (const it of c.items) {
        const dropped = c.dropped.includes(it.id);
        html += `<tr class="item ${dropped ? 'dropped' : ''}">
          <td>${esc(it.name)}</td>
          <td class="r num muted">${it.share ? `${fmt1(it.share)}%` : ''}</td>
          <td class="r num">${scoreCell(it, dropped)}</td>
          <td></td>
        </tr>`;
      }
    }
  }
  return html;
}


// Winter runs January to April; the rest of the school year is Fall.
const currentTerm = () => (new Date().getMonth() < 4 ? 'Winter' : 'Fall');

function renderGrades() {
  const list = courses().filter((c) => !state.hiddenCourses.has(c.code));
  if (!list.length) return `<div class="empty">Press Sync now to pull your grades from Brightspace.</div>`;

  let html = '<div class="cards">';

  for (const c of list) {
    const outline = OUTLINES[c.code];
    const sheet = applyOutline(c.grades, outline);
    const terms = outline?.terms || [];
    const picked = state.terms[c.code] ?? currentTerm();
    const term = terms.some((t) => t.name === picked) ? picked : null;
    const part = term ? termSheet(sheet, outline, term) : null;
    // A term counts out of 100 on its own; termShare is what it's worth of the final grade.
    const r = part ? computeCourse(part, { scaleTo: 100 }) : computeCourse(sheet);
    const termShare = part ? computeCourse(part).totalW : null;
    const noWeights = r.totalW === 0;
    const termSwitch = terms.length
      ? `<div class="seg" role="group" aria-label="Show term">${[null, ...terms.map((t) => t.name)].map((t) =>
        `<button data-term="${esc(c.code)}" data-term-name="${esc(t || '')}" aria-pressed="${t === term}">${esc(t || 'Full year')}</button>`).join('')}</div>`
      : '';
    html += `<article class="card" style="--c:${color(c.code)}">
      <div class="card-head">
        <div>
          <h2><span class="tag" style="--c:${color(c.code)}">${esc(label(c.code))}</span> ${esc(c.title)}</h2>
          <div class="sub"><a href="${esc(c.links.grades)}" target="_blank">Brightspace grades</a> · <a href="${esc(c.links.content)}" target="_blank">Content</a></div>
          ${termSwitch}
        </div>
        <div class="score">
          <span class="big num">${r.current == null ? '–' : fmt1(r.current) + '%'}</span><span class="letter">${letter(r.current)}</span>
          <div class="sub">${term ? `${esc(term)} average` : 'current average'}</div>
        </div>
      </div>
      ${gradeBar(r)}
      <div class="stats">
        <span><b class="num">${fmt1(r.coverage * 100)}%</b> of the ${term ? 'term' : 'course'} graded</span>
        ${term ? `<span>${esc(term)} is worth <b class="num">${fmt1(termShare)}%</b> of your final grade</span>` : ''}
        ${r.floor != null ? `<span>Banked: <b class="num">${fmt1(r.floor)}%</b></span>` : ''}
        ${r.bonusW ? `<span>Bonus: <b class="num">+${fmt1(r.bonusW)}</b></span>` : ''}
        ${!term && r.totalW && Math.abs(r.totalW + r.ignoredW - 100) > 0.5 ? `<span>Weights add up to <b class="num">${fmt1(r.totalW + r.ignoredW)}</b>, not 100</span>` : ''}
      </div>
      ${neededChips(r)}
      ${noWeights ? `<p class="hint">No grading scheme for this course yet. Add it to OUTLINES in src/config.js.</p>` : ''}
      ${outline?.rules?.length ? `<details class="rules"><summary>Course rules from the outline</summary><ul>${outline.rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <div class="table-wrap"><table>
        <thead><tr><th>Item</th><th class="r">Weight</th><th class="r">Score</th><th></th></tr></thead>
        <tbody>${componentRows(c, r)}</tbody>
      </table></div>
    </article>`;
  }
  return html + '</div>';
}

// Graded share of the course, split into what you banked and what you lost on it; the rest is
// still to come. Hover a part to see its size.
function gradeBar(r) {
  const graded = Math.min(100, r.coverage * 100);
  const banked = Math.min(graded, r.floor ?? 0);
  const lost = graded - banked;
  const part = (cls, w, tip) => (w > 0 ? `<span class="${cls}" style="width:${w}%" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></span>` : '');
  return `<div class="bar">${
    part('banked', banked, `Banked ${fmt1(banked)}%`)}${
    part('lost', lost, `Lost ${fmt1(lost)}%`)}${
    part('rest', 100 - graded, `Not graded yet ${fmt1(100 - graded)}%`)}</div>`;
}

function renderNews() {
  const posts = courses()
    .filter((c) => !state.hiddenCourses.has(c.code))
    .flatMap((c) => c.news.map((n) => ({ ...n, course: c.code })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40);
  if (!posts.length) return `<div class="empty">No announcements.</div>`;
  return posts.map((n) => `<article class="news-item ${state.freshNews.has(n.id) ? 'new' : ''}">
    <div class="meta"><span class="tag" style="--c:${color(n.course)}">${esc(label(n.course))}</span>${esc(longFmt.format(new Date(n.date)))}${state.freshNews.has(n.id) ? '<span class="new-pill">New</span>' : ''}</div>
    <strong>${esc(n.title)}</strong>
    ${n.body ? `<p>${esc(n.body)}</p>` : ''}
  </article>`).join('');
}

function render() {
  if (state.view === 'news' || !state.prefs.newsSeen) markNewsSeen();
  renderHeader();
  const view = document.getElementById('view');
  document.body.classList.toggle('wide', state.view === 'deadlines'); // room for the Open now panel
  view.innerHTML = state.view === 'grades' ? renderGrades() : state.view === 'news' ? renderNews() : renderDeadlines();
}

// ---- events ----
document.getElementById('sync-btn').addEventListener('click', sync);

document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  if (b.dataset.view !== state.view) state.freshNews.clear();
  state.view = b.dataset.view;
  remember();
  render();
});

document.getElementById('course-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle-course]');
  if (!b) return;
  const code = b.dataset.toggleCourse;
  state.hiddenCourses.has(code) ? state.hiddenCourses.delete(code) : state.hiddenCourses.add(code);
  remember();
  render();
});

const view = document.getElementById('view');

// Hover text for `data-tip` (the grades bar), shown right away and above the bar's clipping.
const tip = document.createElement('div');
tip.className = 'tip';
tip.hidden = true;
document.body.append(tip);
view.addEventListener('pointermove', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
  const box = t.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(e.clientX - tip.offsetWidth / 2, innerWidth - tip.offsetWidth - 8))}px`;
  tip.style.top = `${box.top - tip.offsetHeight - 6}px`;
});
view.addEventListener('pointerleave', () => { tip.hidden = true; });
addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

view.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.hide) {
    const id = t.dataset.hide;
    updatePrefs((p) => {
      if (id.startsWith('custom:')) p.custom = p.custom.filter((c) => c.id !== id);
      else p.hidden[id] = true;
    });
  } else if (t.dataset.action === 'unhide') {
    updatePrefs((p) => { p.hidden = {}; });
  } else if (t.dataset.term) {
    state.terms[t.dataset.term] = t.dataset.termName || 'Full year';
    remember();
    render();
  } else if (t.dataset.expand) {
    const k = t.dataset.expand;
    state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k);
    render();
  }
});

view.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.done) {
    const id = t.dataset.done;
    const d = allDeadlines(state.snapshot, state.prefs).find((x) => x.id === id);
    updatePrefs((p) => {
      // Grouped rows (every date for one tutorial) tick and clear together.
      if (d?.group) {
        if (t.checked) p.done[d.group] = true;
        else delete p.done[d.group];
        delete p.done[id];
        return;
      }
      // A checklist's own box ticks (or clears) every item on it.
      if (d?.checklist) {
        for (const x of d.checklist) {
          if (t.checked) p.checked[x] = true;
          else delete p.checked[x];
        }
        delete p.done[id];
        return;
      }
      // Only store an override when it differs from what Brightspace says.
      if (t.checked === !!d?.autoDone) delete p.done[id];
      else p.done[id] = t.checked;
    });
  } else if (t.dataset.check) {
    const x = t.dataset.check;
    updatePrefs((p) => {
      if (t.checked) p.checked[x] = true;
      else delete p.checked[x];
    });
  } else if (t.dataset.opt) {
    state[t.dataset.opt] = t.checked;
    remember();
    render();
  }
});

// Keep checklist dropdowns open across re-renders (toggle doesn't bubble, so capture it).
view.addEventListener('toggle', (e) => {
  const id = e.target.dataset?.checklist;
  if (!id) return;
  e.target.open ? state.openChecklists.add(id) : state.openChecklists.delete(id);
}, true);

view.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.dataset.form === 'deadline') {
    const [y, m, d] = data.date.split('-').map(Number);
    const [hh, mm] = data.time ? data.time.split(':').map(Number) : [23, 59];
    updatePrefs((p) => {
      p.custom.push({
        id: `custom:${crypto.randomUUID()}`,
        course: data.course,
        title: data.title.trim(),
        kind: 'other',
        due: new Date(y, m - 1, d, hh, mm).toISOString(),
        allDay: !data.time,
        autoDone: false,
        url: courses().find((c) => c.code === data.course)?.links.home,
      });
    });
  }
});

// Another tab or the background sync changed storage: pick it up.
chrome.storage.onChanged.addListener(async () => {
  if (state.syncing) return;
  Object.assign(state, await load());
  render();
});

// ---- boot ----
recall();
Object.assign(state, await load());
render();
chrome.runtime.sendMessage({ type: 'pull' });
const stale = !state.snapshot || Date.now() - Date.parse(state.snapshot.syncedAt) > 10 * 60e3;
if (stale) sync();
