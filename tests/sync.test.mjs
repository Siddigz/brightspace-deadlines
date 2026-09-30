import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseName, stripHtml } from '../src/sync.js';

test('course names from Brightspace become short codes', () => {
  const cases = [
    ['BIOL1010R Biotechnology and Society (LEC) Fall 2026', 'BIOL 1010', 'Biotechnology and Society'],
    ['Crosslist CLCV2105A:PHIL2005A [31033:33778] Ancient Phil:Search for Wisdom (LEC) Fall 2026', 'CLCV 2105', 'Ancient Phil:Search for Wisdom'],
    ['Crosslist CLCV2305A:TSES2305A [31035:34623] Ancient Science and Technology (LEC) Fall 2026', 'CLCV 2305', 'Ancient Science and Technology'],
    ['Merged COMP3000A:COMP3000B Operating Systems (LEC) Fall 2026', 'COMP 3000', 'Operating Systems'],
    ['COMP2406A Fundamentals Web Applications (LEC) Fall 2026', 'COMP 2406', 'Fundamentals Web Applications'],
    ['CGSC2001A Theories in Cognitive Science (LEC) Fall 2026', 'CGSC 2001', 'Theories in Cognitive Science'],
  ];
  for (const [name, code, title] of cases) assert.deepEqual(parseCourseName(name), { code, title });
});

test('announcement HTML becomes readable text', () => {
  assert.equal(stripHtml('<p>Hello&#160;there</p><p>It&#39;s &amp; done</p>'), "Hello there\nIt's & done");
});
