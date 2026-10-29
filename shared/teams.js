// 32 fictional franchises. No real league names, marks or players.

export const PERKS = {
  CANNON: { name: 'Cannon', desc: 'Slap shots leave the stick 10% harder.' },
  BRICK_WALL: { name: 'Brick Wall', desc: 'Goalies get +4 on every rating that stops pucks.' },
  SANDPAPER: { name: 'Sandpaper', desc: 'Body checks hit harder and knock more pucks loose.' },
  SNIPERS: { name: 'Snipers', desc: 'Shots find the corners more often.' },
  SPEEDSTERS: { name: 'Speedsters', desc: 'Every skater is a step faster.' },
  GRINDERS: { name: 'Grinders', desc: 'Legs stay fresh: energy drains 25% slower.' },
  DANGLERS: { name: 'Danglers', desc: 'Silky hands: harder to poke check, nastier dekes.' },
  PLAYMAKERS: { name: 'Playmakers', desc: 'Crisper passes and deadlier one-timers.' },
  DISCIPLINED: { name: 'Disciplined', desc: 'Takes half as many penalties.' },
};

export const CONFERENCES = [
  { name: 'Frost', divisions: ['North', 'Harbor'] },
  { name: 'Summit', divisions: ['Canyon', 'Coast'] },
];

// [name, abbr, primary, secondary, tagline, perk, arena]
const RAW = [
  // Frost / North
  ['Yetis', 'YET', '#5fb4e6', '#13233f', 'Abominable on ice.', 'BRICK_WALL', 'The Summit Dome'],
  ['Moose', 'MOO', '#7a4a26', '#f0c674', 'Big antlers. Bigger hits.', 'SANDPAPER', 'The Bog'],
  ['Huskies', 'HSK', '#9aa6b8', '#14284a', 'Run with the pack.', 'SPEEDSTERS', 'Kennel Arena'],
  ['Narwhals', 'NAR', '#2ec4b6', '#0b2840', 'Unicorns of the sea.', 'SNIPERS', 'The Fjord'],
  ['Lumberjacks', 'LUM', '#c0392b', '#1b1b1b', 'Timber!', 'GRINDERS', 'Sawmill Gardens'],
  ['Glaciers', 'GLA', '#b8e6ff', '#24507e', 'Slow? Unstoppable.', 'DISCIPLINED', 'The Ice Shelf'],
  ['Lynx', 'LNX', '#d9a521', '#262626', 'Pounce on every puck.', 'DANGLERS', 'The Pounce Pit'],
  ['Wolverines', 'WOL', '#f2c12e', '#3b2716', 'Small. Angry. Relentless.', 'SANDPAPER', 'The Burrow'],
  // Frost / Harbor
  ['Orcas', 'ORC', '#151515', '#e9eef2', 'Apex of the ocean.', 'CANNON', 'The Pod'],
  ['Anchors', 'ANC', '#0b3d91', '#e63946', 'Drop anchor.', 'DISCIPLINED', 'Drydock Arena'],
  ['Riveters', 'RIV', '#1d4e89', '#f2a541', 'We can do it.', 'GRINDERS', 'The Foundry'],
  ['Hammerheads', 'HAM', '#5a6e7f', '#ff6b35', 'Head first.', 'CANNON', 'The Tank'],
  ['Icebreakers', 'ICB', '#d62839', '#f1faee', 'Cut through anything.', 'SPEEDSTERS', 'Port Arena'],
  ['Nighthawks', 'NHK', '#2e1a47', '#a57cff', 'Own the night.', 'DANGLERS', 'The Roost'],
  ['Bulldogs', 'BUL', '#7a0019', '#cfcfcf', 'Never let go.', 'SANDPAPER', 'The Doghouse'],
  ['Specters', 'SPC', '#4a4e69', '#d8c3bd', 'Now you see us.', 'SNIPERS', 'The Haunt'],
  // Summit / Canyon
  ['Scorpions', 'SCO', '#ff8c00', '#1a1a1a', 'Sting in the tail.', 'SNIPERS', 'Sandpit Arena'],
  ['Rattlers', 'RAT', '#56702f', '#e9c46a', 'Hear us coming.', 'DANGLERS', 'The Den'],
  ['Mustangs', 'MUS', '#8b4513', '#f5deb3', 'Run wild.', 'SPEEDSTERS', 'The Corral'],
  ['Outlaws', 'OUT', '#2f2f2f', '#d4a373', 'Wanted: two points.', 'SANDPAPER', 'The Saloon'],
  ['Cyclones', 'CYC', '#6a4c93', '#8ac926', "Spin 'em around.", 'PLAYMAKERS', 'The Funnel'],
  ['Comets', 'COM', '#ffbe0b', '#003049', 'Here and gone.', 'SPEEDSTERS', 'Crater Center'],
  ['Sundogs', 'SUN', '#ff6f59', '#254441', 'Bright cold days.', 'PLAYMAKERS', 'Halo Arena'],
  ['Jackalopes', 'JAK', '#c49a6c', '#2a2a72', 'Legends are real.', 'DANGLERS', 'The Mesa'],
  // Summit / Coast
  ['Kodiaks', 'KOD', '#5b3a29', '#ffb300', 'Born in the cold.', 'SANDPAPER', 'The Cave'],
  ['Sasquatch', 'SAS', '#3e5641', '#d6a75e', 'Seen it? Neither has the goalie.', 'CANNON', 'Timberline Arena'],
  ['Bison', 'BIS', '#4e342e', '#ffcc80', 'Stampede.', 'GRINDERS', 'The Range'],
  ['Barons', 'BAR', '#800020', '#d4af37', 'Old money. Hard hits.', 'DISCIPLINED', 'Baron Hall'],
  ['Dragons', 'DRG', '#2a9d8f', '#e76f51', 'Breathe fire.', 'CANNON', 'The Lair'],
  ['Riptide', 'RIP', '#00a6d6', '#03045e', 'Pulled under.', 'PLAYMAKERS', 'Undertow Arena'],
  ['Magma', 'MAG', '#d00000', '#ffba08', 'Molten core.', 'SNIPERS', 'The Caldera'],
  ['Pilots', 'PIL', '#0077b6', '#f1faee', 'Cleared for takeoff.', 'SPEEDSTERS', 'The Hangar'],
];

export const TEAMS = RAW.map(([name, abbr, primary, secondary, tagline, perk, arena], id) => {
  const conf = Math.floor(id / 16);
  const div = Math.floor((id % 16) / 8);
  return {
    id, name, abbr, primary, secondary, tagline, perk, arena,
    conf, div,
    confName: CONFERENCES[conf].name,
    divName: CONFERENCES[conf].divisions[div],
  };
});

// Rating adjustments from a team perk (and CPU difficulty). Returns a new object.
export function effRatings(r, perk, bonus = 0) {
  const e = { ...r };
  for (const k of Object.keys(e)) e[k] = e[k] + bonus;
  switch (perk) {
    case 'SPEEDSTERS': if (e.spd != null) e.spd += 6; break;
    case 'SNIPERS': if (e.acc != null) e.acc += 8; break;
    case 'DANGLERS': if (e.hnd != null) e.hnd += 8; break;
    case 'SANDPAPER': if (e.chk != null) e.chk += 8; break;
    case 'PLAYMAKERS': if (e.pas != null) e.pas += 8; break;
    case 'BRICK_WALL': if (e.gk != null) { e.gk += 4; e.reb += 4; } break;
  }
  for (const k of Object.keys(e)) e[k] = Math.max(20, Math.min(105, e[k]));
  return e;
}
