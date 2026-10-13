// Your choices (done marks, hidden items, ticked problems, your own deadlines). Pure functions,
// shared by the extension and the phone page.

export const DEFAULT_PREFS = {
  done: {}, // deadline id -> true/false (overrides auto-detected state)
  hidden: {}, // deadline id -> true
  checked: {}, // checklist item -> true
  custom: [], // [{ id, course, title, due, allDay, kind }]
  newsSeen: null, // announcement ids you've seen; null until the first sync with announcements
};

// Deadline is done if the user said so, otherwise if Brightspace shows a submission/grade,
// or (for a checklist) once every item on it is ticked.
export function isDone(d, prefs) {
  if (d.locked) return false; // can't be ticked off
  const manual = prefs.done[d.id] ?? (d.group ? prefs.done[d.group] : undefined);
  if (manual != null) return manual;
  if (d.checklist) return d.checklist.every((x) => prefs.checked?.[x]);
  return !!d.autoDone;
}

// Deadlines sharing a `group` (e.g. every date for one tutorial) are ticked together, under the
// group's id. Session rows carry `notes` tied to groups: a note goes once its group is ticked,
// and the row goes with its last note.
export function applyGroups(deadlines, prefs) {
  const done = prefs.done || {};
  return deadlines.flatMap((d) => {
    if (!d.notes) return [d];
    const open = d.notes.filter((n) => !(n.group && done[n.group]));
    if (!open.length) return [];
    return [{ ...d, title: `${d.baseTitle} (${open.map((n) => n.text).join('; ')})` }];
  });
}

// What you can work on right now: it exists (`live`), has opened, hasn't closed, and isn't done
// or hidden. Soonest to close first; grouped rows (a tutorial's two deadlines) show once.
// In a one-at-a-time course, something waits until every earlier deadline in that course has passed.
export function openNow(deadlines, prefs, now = Date.now()) {
  const seen = new Set();
  const upcoming = deadlines.filter((d) => d.oneAtATime && Date.parse(d.due) > now);
  const mustWait = (d) => d.oneAtATime && upcoming.some((o) => o.course === d.course && Date.parse(o.due) < Date.parse(d.due));
  return deadlines
    .filter((d) => d.live && !prefs.hidden?.[d.id] && !isDone(d, prefs))
    .filter((d) => (!d.opens || Date.parse(d.opens) <= now) && Date.parse(d.realDue || d.due) > now)
    .filter((d) => !d.openFrom || Date.parse(d.openFrom) <= now) // counted as open from then (see openWeekOf)
    .filter((d) => !mustWait(d))
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .filter((d) => !d.group || (!seen.has(d.group) && seen.add(d.group)));
}

// Three-way merge of the laptop's and the phone's prefs. `base` is the copy both last agreed on:
// for each key, whichever side changed it since then wins, so ticks made on either side survive.
export function mergePrefs(base, local, remote) {
  base ||= {};
  const out = { ...DEFAULT_PREFS, ...remote, ...local };
  for (const k of ['done', 'hidden', 'checked']) out[k] = mergeMap(base[k], local[k], remote[k]);
  out.custom = Object.values(mergeMap(byId(base.custom), byId(local.custom), byId(remote.custom)));
  const seen = [...(remote.newsSeen || []), ...(local.newsSeen || [])];
  out.newsSeen = local.newsSeen || remote.newsSeen ? [...new Set(seen)] : null;
  return out;
}

function mergeMap(base = {}, local = {}, remote = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const v = JSON.stringify(local[k]) !== JSON.stringify(base[k]) ? local[k] : remote[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const byId = (list = []) => Object.fromEntries(list.map((x) => [x.id, x]));
