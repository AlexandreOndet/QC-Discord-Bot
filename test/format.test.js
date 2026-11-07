import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format, formatDates, compId, announcedIn, windowEnd } from '../format.js';

const comps = JSON.parse(readFileSync(new URL('comps.json', import.meta.url)));
const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');
const examples = [...spec.split('## Acceptance examples')[1].matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);

test('matches the spec acceptance examples', () => {
  assert.equal(examples.length, comps.length);
  comps.forEach((c, i) => assert.equal(format(c), examples[i]));
});

test('dates across months and years', () => {
  assert.equal(formatDates('2026-10-31', '2026-11-01'), '31 octobre - 1 novembre 2026');
  assert.equal(formatDates('2026-12-31', '2027-01-01'), '31 décembre 2026 - 1 janvier 2027');
});

test('compId accepts WCA URLs and bare ids only', () => {
  assert.equal(compId('https://www.worldcubeassociation.org/competitions/FMCaMontreal2026/register?x=1'), 'FMCaMontreal2026');
  assert.equal(compId(' FMCaMontreal2026 '), 'FMCaMontreal2026');
  assert.equal(compId('https://evil.example/competitions/FMCaMontreal2026'), null);
  assert.equal(compId('../users'), null);
});

test('announcedIn covers [end - minutes, end)', () => {
  const end = Date.parse('2026-11-06T15:05:00Z');
  const at = (t) => ({ announced_at: t });
  assert.equal(announcedIn(at('2026-11-06T15:00:00.000Z'), end, 5), true);
  assert.equal(announcedIn(at('2026-11-06T15:04:59.999Z'), end, 5), true);
  assert.equal(announcedIn(at('2026-11-06T14:59:59.999Z'), end, 5), false);
  assert.equal(announcedIn(at('2026-11-06T15:05:00.000Z'), end, 5), false);
  assert.equal(announcedIn(at(null), end, 5), false);
  assert.equal(announcedIn(at('2026-11-06T12:30:00.000Z'), end, 180), true);
});

test('consecutive windows tile without gaps or overlap', () => {
  const step = 5;
  const b = Date.parse('2026-11-06T15:00:00Z');
  for (const t of ['2026-11-06T15:04:59.999Z', '2026-11-06T15:05:00.000Z', '2026-11-06T15:07:30.000Z']) {
    const hits = [b + 5 * 60e3, b + 10 * 60e3].filter((end) => announcedIn({ announced_at: t }, end, step));
    assert.equal(hits.length, 1, t);
  }
});

test('windowEnd snaps to the step boundary', () => {
  assert.equal(windowEnd(Date.parse('2026-11-06T15:07:30Z'), 5), Date.parse('2026-11-06T15:05:00Z'));
  assert.equal(windowEnd(Date.parse('2026-11-06T15:05:00Z'), 5), Date.parse('2026-11-06T15:05:00Z'));
});
