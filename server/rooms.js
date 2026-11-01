// Online rooms: two players, one authoritative engine on the server.
import { createGame, step, snapshot, drainEvents, DT } from '../shared/engine.js';
import { buildTeams, gameTeam } from '../shared/league.js';
import { TEAMS } from '../shared/teams.js';

const ROSTERS = buildTeams(1994);
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rooms = new Map();
const PERIOD_OK = [120, 180, 300, 480];

function newCode() {
  for (let i = 0; i < 1000; i++) {
    let c = '';
    for (let j = 0; j < 4; j++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no codes left');
}

function send(ws, m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function validTeam(t) {
  return Number.isInteger(t) && t >= 0 && t < TEAMS.length;
}

function cleanInput(i) {
  if (!i || typeof i !== 'object') return {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const clampU = (v) => Math.max(-1, Math.min(1, num(v)));
  return {
    mx: clampU(i.mx), my: clampU(i.my),
    pass: !!i.pass, shoot: !!i.shoot, deke: !!i.deke, sprint: !!i.sprint,
    np: num(i.np), ns: num(i.ns), nd: num(i.nd), as: !!i.as,
  };
}

function startGame(room) {
  const [h, g] = room.players;
  let teams = [h.team, g.team];
  if (teams[0] === teams[1]) teams = [teams[0], (teams[1] + 1) % TEAMS.length]; // mirror match: guest gets next team
  room.teams = teams;
  room.inputs = [{}, {}];
  room.rematch = [false, false];
  room.state = createGame({
    teams: [gameTeam(ROSTERS, teams[0], true), gameTeam(ROSTERS, teams[1], false)],
    humans: [{ team: 0 }, { team: 1 }],
    cfg: { periodLen: room.cfg.periodLen, ot: 'reg', penalties: true, icing: true },
  });
  room.players.forEach((p, side) => send(p.ws, { t: 'start', side, teams, homeIdx: 0, cfg: room.state.cfg, code: room.code }));
  room.last = process.hrtime.bigint();
  room.acc = 0;
  room.frame = 0;
  room.evBuf = [];
  clearInterval(room.timer);
  room.timer = setInterval(() => tickRoom(room), 1000 / 60);
}

function tickRoom(room) {
  const now = process.hrtime.bigint();
  room.acc += Number(now - room.last) / 1e9;
  room.last = now;
  room.acc = Math.min(room.acc, 0.25);
  const s = room.state;
  while (room.acc >= DT) {
    step(s, room.inputs, DT);
    room.acc -= DT;
    room.frame++;
    room.evBuf.push(...drainEvents(s));
    if (room.frame % 2 === 0) {
      const msg = JSON.stringify({ t: 'snap', s: snapshot(s), ev: room.evBuf });
      room.evBuf = [];
      for (const p of room.players) if (p.ws.readyState === 1) p.ws.send(msg);
    }
    if (s.phase === 'final' && !room.ended) {
      room.ended = true;
      setTimeout(() => {
        clearInterval(room.timer);
        room.players.forEach((p) => send(p.ws, { t: 'end', result: s.result }));
      }, 3000);
      break;
    }
  }
  room.touched = Date.now();
}

function closeRoom(room, reason) {
  clearInterval(room.timer);
  rooms.delete(room.code);
  for (const p of room.players) {
    if (p.ws.room === room) p.ws.room = null;
    if (reason) send(p.ws, { t: 'left' });
  }
}

export function attachRooms(wss) {
  wss.on('connection', (ws) => {
    ws.room = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      if (raw.length > 4096) return;
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      const room = ws.room;
      switch (m.t) {
        case 'create': {
          if (room) closeRoom(room, true);
          if (!validTeam(m.team)) return send(ws, { t: 'error', msg: 'Pick a team first.' });
          const periodLen = PERIOD_OK.includes(m.cfg?.periodLen) ? m.cfg.periodLen : 180;
          const code = newCode();
          const r = { code, players: [{ ws, team: m.team }], cfg: { periodLen }, touched: Date.now() };
          rooms.set(code, r);
          ws.room = r;
          send(ws, { t: 'created', code });
          break;
        }
        case 'join': {
          const code = String(m.code || '').toUpperCase().slice(0, 4);
          const r = rooms.get(code);
          if (!r) return send(ws, { t: 'error', msg: `No room called ${code}.` });
          if (r.players.length >= 2) return send(ws, { t: 'error', msg: 'That room is full.' });
          if (!validTeam(m.team)) return send(ws, { t: 'error', msg: 'Pick a team first.' });
          if (room && room !== r) closeRoom(room, true);
          r.players.push({ ws, team: m.team });
          ws.room = r;
          startGame(r);
          break;
        }
        case 'input': {
          if (!room || !room.state) return;
          const side = room.players.findIndex((p) => p.ws === ws);
          if (side >= 0) room.inputs[side] = cleanInput(m.i);
          break;
        }
        case 'rematch': {
          if (!room || !room.ended) return;
          const side = room.players.findIndex((p) => p.ws === ws);
          if (side < 0) return;
          room.rematch[side] = true;
          if (room.rematch.every(Boolean) && room.players.length === 2) {
            room.ended = false;
            startGame(room);
          } else send(ws, { t: 'rematchWait' });
          break;
        }
        case 'leave':
          if (room) closeRoom(room, true);
          break;
        default:
          break;
      }
    });
    ws.on('close', () => { if (ws.room) closeRoom(ws.room, true); });
  });

  // Heartbeat + idle cleanup.
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const r of rooms.values()) if (r.touched < cutoff) closeRoom(r, true);
  }, 30000).unref();
}

export function roomCount() {
  return rooms.size;
}
