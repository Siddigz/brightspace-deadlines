import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergePrefs, isDone, openNow } from '../src/prefs.js';

test('prefs merge keeps ticks made on either side since the last sync', () => {
  const base = { done: { a: true }, hidden: {}, checked: { 'Two Sum': true }, custom: [], newsSeen: ['n1'] };
  const laptop = { ...base, done: { a: true, b: true }, checked: { 'Two Sum': true, '3Sum': true }, newsSeen: ['n1', 'n2'] };
  const phone = { ...base, done: {}, checked: { 'Two Sum': true, 'Valid Anagram': true }, custom: [{ id: 'custom:1', title: 'x' }] };
  const m = mergePrefs(base, laptop, phone);
  assert.deepEqual(m.done, { b: true }); // phone unticked a, laptop ticked b
  assert.deepEqual(m.checked, { 'Two Sum': true, '3Sum': true, 'Valid Anagram': true });
  assert.deepEqual(m.custom.map((c) => c.id), ['custom:1']);
  assert.deepEqual(m.newsSeen, ['n1', 'n2']);
});

test('prefs merge with no shared history lets the local side win', () => {
  const m = mergePrefs(null, { done: { a: false }, checked: {} }, { done: { a: true, c: true }, checked: { x: true } });
  assert.deepEqual(m.done, { a: false, c: true });
  assert.deepEqual(m.checked, { x: true });
});

test('checklist deadlines are done once every item is ticked', () => {
  const d = { id: 'n', checklist: ['A', 'B'] };
  assert.equal(isDone(d, { done: {}, checked: { A: true } }), false);
  assert.equal(isDone(d, { done: {}, checked: { A: true, B: true } }), true);
  assert.equal(isDone(d, { done: { n: false }, checked: { A: true, B: true } }), false);
});

// The phone page swaps in phone/src/config.js; it must export everything the shared code imports.
test('phone config stand-in covers every config import in shared code', async () => {
  const shim = await readFile('phone/src/config.js', 'utf8');
  const exported = new Set(shim.match(/export const \{([^}]*)\}/)[1].split(',').map((s) => s.trim()));
  for (const f of ['src/dashboard.js', 'src/grades.js', 'src/prefs.js', 'src/gist.js']) {
    const src = await readFile(f, 'utf8');
    for (const [, names] of src.matchAll(/import \{([^}]*)\} from '\.\/config\.js'/g)) {
      for (const n of names.split(',').map((s) => s.trim())) assert.ok(exported.has(n), `${f} imports ${n} from config.js`);
    }
  }
});

test('Open now: live things that have opened, not closed, not done; a group shows once', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const at = (days) => new Date(now + days * 86400000).toISOString();
  const list = [
    { id: 'open', live: true, opens: at(-1), due: at(3) },
    { id: 'no-start', live: true, opens: null, due: at(1) },
    { id: 'not-yet', live: true, opens: at(1), due: at(5) },
    { id: 'closed', live: true, opens: at(-9), due: at(-1) },
    { id: 'done', live: true, opens: at(-1), due: at(2), autoDone: true },
    { id: 'hidden', live: true, opens: at(-1), due: at(2) },
    { id: 'config-only', opens: null, due: at(2) },
    { id: 't4-first', live: true, group: 'g4', opens: at(-5), due: at(-4) },
    { id: 't4-final', live: true, group: 'g4', opens: at(-5), due: at(4) },
    { id: 't6-first', live: true, group: 'g6', opens: at(-1), due: at(2) },
    { id: 't6-final', live: true, group: 'g6', opens: at(-1), due: at(7) },
  ];
  const ids = openNow(list, { done: {}, hidden: { hidden: true }, checked: {} }, now).map((d) => d.id);
  assert.deepEqual(ids, ['no-start', 't6-first', 'open', 't4-final']);
});
