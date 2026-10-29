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

// [name, city, abbr, primary, secondary, perk, arena]  (cities are made up)
const RAW = [
  // Frost / North
  ['Yetis', 'Port Kessel', 'YET', '#5fb4e6', '#13233f', 'BRICK_WALL', 'The Summit Dome'],
  ['Moose', 'Bramblewood', 'MOO', '#7a4a26', '#f0c674', 'SANDPAPER', 'The Bog'],
  ['Huskies', 'Ironridge', 'HSK', '#9aa6b8', '#14284a', 'SPEEDSTERS', 'Kennel Arena'],
  ['Narwhals', 'Saltmarsh', 'NAR', '#2ec4b6', '#0b2840', 'SNIPERS', 'The Fjord'],
  ['Lumberjacks', 'Cedar Hollow', 'LUM', '#c0392b', '#1b1b1b', 'GRINDERS', 'Sawmill Gardens'],
  ['Glaciers', 'Frostmoor', 'GLA', '#b8e6ff', '#24507e', 'DISCIPLINED', 'The Ice Shelf'],
  ['Lynx', 'Ashvale', 'LNX', '#d9a521', '#262626', 'DANGLERS', 'The Pounce Pit'],
  ['Wolverines', 'Blackspruce', 'WOL', '#f2c12e', '#3b2716', 'SANDPAPER', 'The Burrow'],
  // Frost / Harbor
  ['Orcas', 'Gullhaven', 'ORC', '#151515', '#e9eef2', 'CANNON', 'The Pod'],
  ['Anchors', 'Brinemouth', 'ANC', '#0b3d91', '#e63946', 'DISCIPLINED', 'Drydock Arena'],
  ['Riveters', 'Boltwater', 'RIV', '#1d4e89', '#f2a541', 'GRINDERS', 'The Foundry'],
  ['Hammerheads', 'Coralmere', 'HAM', '#5a6e7f', '#ff6b35', 'CANNON', 'The Tank'],
  ['Icebreakers', 'Kittering Bay', 'ICB', '#d62839', '#f1faee', 'SPEEDSTERS', 'Port Arena'],
  ['Nighthawks', 'Lantern City', 'NHK', '#2e1a47', '#a57cff', 'DANGLERS', 'The Roost'],
  ['Bulldogs', 'Granthollow', 'BUL', '#7a0019', '#cfcfcf', 'SANDPAPER', 'The Doghouse'],
  ['Specters', 'Mistport', 'SPC', '#4a4e69', '#d8c3bd', 'SNIPERS', 'The Haunt'],
  // Summit / Canyon
  ['Scorpions', 'Red Mesa', 'SCO', '#ff8c00', '#1a1a1a', 'SNIPERS', 'Sandpit Arena'],
  ['Rattlers', 'Sagebrush', 'RAT', '#56702f', '#e9c46a', 'DANGLERS', 'The Den'],
  ['Mustangs', 'Wildrun', 'MUS', '#8b4513', '#f5deb3', 'SPEEDSTERS', 'The Corral'],
  ['Outlaws', 'Deadwater', 'OUT', '#2f2f2f', '#d4a373', 'SANDPAPER', 'The Saloon'],
  ['Cyclones', 'Stormfield', 'CYC', '#6a4c93', '#8ac926', 'PLAYMAKERS', 'The Funnel'],
  ['Comets', 'Starfall', 'COM', '#ffbe0b', '#003049', 'SPEEDSTERS', 'Crater Center'],
  ['Sundogs', 'Brightwater', 'SUN', '#ff6f59', '#254441', 'PLAYMAKERS', 'Halo Arena'],
  ['Jackalopes', 'Mirage Springs', 'JAK', '#c49a6c', '#2a2a72', 'DANGLERS', 'The Mesa'],
  // Summit / Coast
  ['Kodiaks', 'Bearpaw Isle', 'KOD', '#5b3a29', '#ffb300', 'SANDPAPER', 'The Cave'],
  ['Sasquatch', 'Fogridge', 'SAS', '#3e5641', '#d6a75e', 'CANNON', 'Timberline Arena'],
  ['Bison', 'Longgrass', 'BIS', '#4e342e', '#ffcc80', 'GRINDERS', 'The Range'],
  ['Barons', 'Kingsgate', 'BAR', '#800020', '#d4af37', 'DISCIPLINED', 'Baron Hall'],
  ['Dragons', 'Emberlake', 'DRG', '#2a9d8f', '#e76f51', 'CANNON', 'The Lair'],
  ['Riptide', 'Driftwood Bay', 'RIP', '#00a6d6', '#03045e', 'PLAYMAKERS', 'Undertow Arena'],
  ['Magma', 'Cinderpeak', 'MAG', '#d00000', '#ffba08', 'SNIPERS', 'The Caldera'],
  ['Pilots', 'Skyhaven', 'PIL', '#0077b6', '#f1faee', 'SPEEDSTERS', 'The Hangar'],
];

export const TEAMS = RAW.map(([name, city, abbr, primary, secondary, perk, arena], id) => {
  const conf = Math.floor(id / 16);
  const div = Math.floor((id % 16) / 8);
  return {
    id, name, city, fullName: `${city} ${name}`, abbr, primary, secondary, perk, arena,
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
