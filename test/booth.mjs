// Checks the commentary script: ids, slots, categories, and that every category the
// game asks for exists with at least one "record first" (tier 1) line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LINES, CATS, SLOT_NAMES, parse, teamClipId } from '../shared/booth-lines.js';
import { TEAMS } from '../shared/teams.js';

const ids = new Set();
for (const l of LINES) {
  assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
  ids.add(l.id);
  assert.match(l.id, /^((mick|eddie)\.[a-z0-9_]+\.\d{2}|team\.(city|nick)\.\d{2})$/, `bad id ${l.id}`);
  assert.ok(CATS[l.cat], `line ${l.id} has unknown category`);
  const slots = l.parts.filter((p) => typeof p === 'object');
  assert.ok(slots.length <= 1, `${l.id} has more than one team slot`);
  for (const s of slots) assert.ok(SLOT_NAMES.includes(s.slot), `${l.id} uses unknown slot {${s.slot}}`);
  assert.equal((l.text.match(/\{/g) || []).length, slots.length, `${l.id}: a slot must sit at the very start or end`);
  const words = l.parts.filter((p) => typeof p === 'string').join(' ').trim();
  assert.ok(words.length > 0, `${l.id} has nothing to record`);
}
for (const c of Object.keys(CATS)) assert.ok(LINES.some((l) => l.cat === c && l.tier === 1), `category ${c} has no tier-1 line`);
for (const t of TEAMS) for (const nick of [false, true]) assert.ok(ids.has(teamClipId(t.id, nick)), `missing team clip for ${t.name}`);

// Every category referenced by the director and the shows must exist.
const used = new Set();
for (const f of ['public/js/booth/director.js', 'public/js/booth/shows.js']) {
  if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/'((?:g|e|pre|post)_[a-z0-9_]+)'/g)) used.add(m[1]);
}
for (const c of used) assert.ok(CATS[c], `code asks for category '${c}' that the script does not have`);

assert.deepEqual(parse('{team} strikes first!'), [{ slot: 'team', nick: false }, 'strikes first!']);
assert.deepEqual(parse("Eddie, what's the key for {team.nick}?"), ["Eddie, what's the key for", { slot: 'team', nick: true, tail: '?' }]);

const by = (k) => LINES.filter((l) => l.cat.startsWith(k) || (k === 'team' && l.id.startsWith('team.')));
const count = (arr) => `${arr.length} (${arr.filter((l) => l.tier === 1).length} essential)`;
console.log(`script: ${LINES.length} recordings, ${Object.keys(CATS).length} categories, ${used.size} used by the game`);
console.log(`  pre-game ${count(by('pre_'))} · in-game ${count([...by('g_'), ...by('e_')])} · post-game ${count(by('post_'))} · team names ${count(by('team'))}`);
console.log(`  mick ${LINES.filter((l) => l.who === 'mick').length} · eddie ${LINES.filter((l) => l.who === 'eddie').length}`);
console.log('BOOTH SCRIPT OK');
