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
  const manual = prefs.done[d.id];
  if (manual != null) return manual;
  if (d.checklist) return d.checklist.every((x) => prefs.checked?.[x]);
  return !!d.autoDone;
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
