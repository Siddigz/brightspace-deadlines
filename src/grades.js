// Grade math. Pure functions, no browser APIs, so it can be tested under Node.
//
// A course sheet is { system, categories: [{id,name,weight,drop}], items: [{id,name,categoryId,max,weight,bonus,points,outOf}] }.
// applyOutline() reshapes a sheet to match the course outline (see OUTLINES in config.js).
// computeCourse() then scores it; weights come only from Brightspace and the outline.

import { LETTERS } from './config.js';

export function letter(pct) {
  if (pct == null || Number.isNaN(pct)) return '–';
  return LETTERS.find(([cut]) => pct >= cut)[1];
}

const isBonusName = (name) => /bonus/i.test(name || '');
const matches = (pattern, name) => new RegExp(pattern, 'i').test(name.trim());
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Rewrites a Brightspace sheet so it follows the course outline:
//   ignore:          item name patterns to leave out (e.g. practice tests)
//   expect:          items the course will have that Brightspace hasn't created yet, placed in a category
//   extra:           graded work missing from Brightspace; `unless` skips it once Brightspace has a matching item
//   groups:          "best N of M" groups of items with a shared total weight
//   categoryWeights: category name -> weight
//   itemWeights:     item name pattern -> weight
export function applyOutline(sheet, outline) {
  if (!outline) return sheet;
  let items = sheet.items.filter((it) => !(outline.ignore || []).some((p) => matches(p, it.name)));
  const categories = sheet.categories.map((c) => {
    const w = outline.categoryWeights?.[c.name];
    return w == null ? c : { ...c, weight: w, fromOutline: true };
  });

  for (const x of outline.expect || []) {
    const pattern = x.unless || `^${x.name}$`;
    const cat = categories.find((c) => c.name === x.category);
    const existing = items.find((it) => matches(pattern, it.name));
    if (existing) {
      // Brightspace sometimes creates an item outside its category (CategoryId 0); file it where the outline says.
      const filed = categories.some((c) => c.id === existing.categoryId);
      if (cat && !filed) items = items.map((it) => (it === existing ? { ...it, categoryId: cat.id } : it));
      continue;
    }
    items.push({
      id: `outline:${slug(x.name)}`, name: x.name, categoryId: cat ? cat.id : null, max: x.max ?? 100,
      weight: null, bonus: false, points: null, outOf: null, extra: true,
    });
  }

  for (const x of outline.extra || []) {
    if (x.unless && items.some((it) => matches(x.unless, it.name))) continue;
    items.push({
      id: `outline:${slug(x.name)}`, name: x.name, categoryId: null, max: x.max ?? 100,
      weight: x.weight ?? null, bonus: false, points: null, outOf: null, fromOutline: x.weight != null, extra: true,
    });
  }

  items = items.map((it) => {
    const hit = Object.entries(outline.itemWeights || {}).find(([p]) => matches(p, it.name));
    const out = hit ? { ...it, weight: hit[1], fromOutline: true } : it;
    return (outline.onlyHelps || []).some((p) => matches(p, it.name)) ? { ...out, onlyHelps: true } : out;
  });

  for (const g of outline.groups || []) {
    const id = `outline:${slug(g.name)}`;
    const members = items.filter((it) => matches(g.match, it.name));
    if (!members.length) continue;
    const each = g.weight / g.best;
    categories.push({ id, name: g.name, weight: g.weight, drop: Math.max(0, members.length - g.best), perItem: each, fromOutline: true });
    items = items.map((it) => (members.includes(it) ? { ...it, categoryId: id, weight: each, fromOutline: true } : it));
  }

  return { ...sheet, categories, items };
}

// One term of a full-year course: the items whose name, or whose category's name, matches
// that term's `match` patterns in outline.terms. Year-long rules ("best 4 of 5") don't apply inside a term, so a
// best-of group keeps only its members from this term at their per-item weight, nothing dropped.
// Anything matching neither term (e.g. bonus marks over the whole year) only shows in the full year.
export function termSheet(sheet, outline, term) {
  const patterns = outline?.terms?.find((t) => t.name === term)?.match || [];
  const hit = (name) => patterns.some((p) => matches(p, name || ''));
  const catName = Object.fromEntries(sheet.categories.map((c) => [c.id, c.name]));
  const items = sheet.items.filter((it) => hit(it.name) || hit(catName[it.categoryId]));
  const categories = sheet.categories
    .filter((c) => hit(c.name) || items.some((it) => it.categoryId === c.id))
    .map((c) => {
      if (c.perItem == null) return c;
      const n = items.filter((it) => it.categoryId === c.id).length;
      return { ...c, weight: c.perItem * n, drop: 0 };
    });
  return { ...sheet, categories, items };
}

function itemPct(item) {
  if (item.points == null) return null;
  const outOf = item.outOf || item.max;
  return outOf ? (item.points / outOf) * 100 : null;
}

// Builds the list of components (a category, or a stand-alone item) with resolved weights.
function components(sheet) {
  const points = sheet.system === 'Points';

  const items = sheet.items.map((it) => {
    const w = it.fromOutline ? it.weight : points ? it.max : it.weight ?? it.max ?? 0;
    return { ...it, w: Number(w) || 0, actual: itemPct(it) };
  });

  const out = [];
  for (const c of sheet.categories) {
    // Empty categories are kept so their weight still counts before anything is posted.
    const members = items.filter((it) => it.categoryId === c.id);
    const sum = members.reduce((s, it) => s + it.w, 0);
    const W = Number(c.fromOutline ? c.weight : points ? sum : c.weight ?? sum) || 0;
    const drop = c.drop || 0;
    // An item's share of the course: the category weight split over the items that count
    // (weights are relative, e.g. points in a Points gradebook), matching scoreComponent().
    const allW = members.reduce((s, it) => s + (it.w || 1), 0);
    const keepN = Math.max(1, members.length - drop);
    const shareOf = (it) => (W * (it.w || 1) * members.length) / (allW * keepN);
    out.push({
      id: `cat:${c.id}`,
      name: c.name,
      W,
      drop,
      bonus: isBonusName(c.name) || (members.length > 0 && members.every((m) => m.bonus)),
      onlyHelps: members.length > 0 && members.every((m) => m.onlyHelps),
      items: members.map((it) => ({ ...it, share: shareOf(it) })),
    });
  }
  for (const it of items) {
    if (it.categoryId && sheet.categories.some((c) => c.id === it.categoryId)) continue;
    out.push({
      id: it.id, name: it.name, W: it.w, drop: 0, bonus: it.bonus || isBonusName(it.name), onlyHelps: !!it.onlyHelps,
      items: [{ ...it, share: it.w }], single: true,
    });
  }
  return out;
}

// "Drop the lowest N" means only the best (items - N) count. Nothing is dropped until
// more than that many marks are in.
function scoreComponent(comp) {
  const scored = comp.items.filter((it) => it.actual != null).map((it) => ({ it, pct: it.actual }));
  if (!scored.length || comp.W <= 0) return { pct: null, coverage: 0, dropped: [] };

  const keepN = Math.max(1, comp.items.length - comp.drop);
  let kept = scored;
  let dropped = [];
  if (scored.length > keepN) {
    const sorted = [...scored].sort((a, b) => a.pct - b.pct);
    dropped = sorted.slice(0, scored.length - keepN).map((x) => x.it.id);
    kept = sorted.slice(scored.length - keepN);
  }
  const wsum = kept.reduce((s, x) => s + (x.it.w || 1), 0);
  const pct = kept.reduce((s, x) => s + x.pct * (x.it.w || 1), 0) / wsum;

  const allW = comp.items.reduce((s, it) => s + (it.w || 1), 0);
  const countedW = (allW * keepN) / comp.items.length;
  const coverage = countedW > 0 ? Math.min(1, wsum / countedW) : 1;
  return { pct, coverage, dropped };
}

// Components marked `onlyHelps` (outline.onlyHelps) can only raise the grade: they're left out
// (`ignored`) until they have a mark, and after that whenever counting them would lower the average.
// `scaleTo` rescales every weight so the graded work adds up to that (e.g. a term out of 100).
export function computeCourse(sheet, { scaleTo } = {}) {
  let parts = components(sheet);
  const total = parts.filter((c) => !c.bonus).reduce((s, c) => s + c.W, 0);
  if (scaleTo && total > 0) {
    const k = scaleTo / total;
    parts = parts.map((c) => ({ ...c, W: c.W * k, items: c.items.map((it) => ({ ...it, share: it.share * k })) }));
  }
  const comps = parts.map((c) => ({ ...c, ...scoreComponent(c) }));
  const optional = comps.filter((c) => c.onlyHelps);
  const without = summarize(comps.map((c) => (c.onlyHelps ? { ...c, ignored: true } : c)));
  if (!optional.length || optional.every((c) => c.pct == null)) return without;
  const withAll = summarize(comps);
  return without.current != null && without.current > withAll.current ? without : withAll;
}

function summarize(comps) {
  const main = comps.filter((c) => !c.bonus && !c.ignored);
  const bonus = comps.filter((c) => c.bonus && !c.ignored);

  const totalW = main.reduce((s, c) => s + c.W, 0);
  let gradedW = 0;
  let earnedW = 0;
  for (const c of main) {
    if (c.pct == null) continue;
    gradedW += c.W * c.coverage;
    earnedW += c.W * c.coverage * (c.pct / 100);
  }
  // Bonus marks count as extra points on top of the course total.
  const bonusW = bonus.reduce((s, c) => s + (c.pct == null ? 0 : c.W * c.coverage * (c.pct / 100)), 0);

  const current = gradedW > 0 ? (earnedW / gradedW) * 100 : null;
  const remainingW = Math.max(0, totalW - gradedW);

  return {
    components: comps,
    totalW,
    // Weight of "only helps" components left out right now (see computeCourse).
    ignoredW: comps.filter((c) => c.ignored && !c.bonus).reduce((s, c) => s + c.W, 0),
    gradedW,
    earnedW,
    bonusW,
    current,
    // Share of the course that has been graded so far.
    coverage: totalW > 0 ? gradedW / totalW : 0,
    // Guaranteed minimum if you got 0 on everything left.
    floor: totalW > 0 ? ((earnedW + bonusW) / totalW) * 100 : null,
    // Average you'd need on the rest to finish at `target` %.
    needed(target) {
      if (remainingW <= 0 || totalW <= 0) return null;
      return ((target / 100) * totalW - earnedW - bonusW) / remainingW * 100;
    },
  };
}
