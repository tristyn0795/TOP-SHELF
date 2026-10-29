# TOP SHELF

16-bit pro hockey in the browser, in the spirit of NHL '94 and Blades of Steel.
Every screen plays like a cartridge from 1994: an attract-mode demo behind PRESS START, blue menu windows driven by a cursor (keyboard, gamepad, mouse or touch), and a vertical-scrolling rink. There are 32 made-up clubs, from the Port Kessel Yetis to the Skyhaven Pilots.

- **Season:** pick a club on an NHL '94-style select screen with ratings bars, then play or sim a 16/32/41/82-game season from the season menu. The top 8 in each conference play best-of-1/3/5/7 series for the Silver Cup. Includes standings, the bracket, league leaders, a news wire, rosters, and players who age from season to season. Between periods, an "Around the League" board shows the day's other games.
- **Quick game:** 1P vs CPU, 2 players on one keyboard or two gamepads, or CPU vs CPU (TAB fast-forwards).
- **Online:** one player creates a room and gets a 4-letter code; the other joins with it. The server runs the game and both browsers render it, and each player sees their own team attacking up the ice.
- **Real rules:** three periods, 3-on-3 OT then a playable shootout in the regular season, sudden-death 5-on-5 OT in the playoffs, 2-minute minors with power plays, and icing. There is no offside, as in the classics.
- No build step, no database, no external assets. Sound is synthesized in the browser.

## Run it locally

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000. The server reads `PORT` from the environment when it is set.

## Controls

**Menus:** arrows / WASD / d-pad move the cursor. Enter, Space, J or A selects; Esc, Backspace, K or B goes back. Left/right changes options and flips pages.

**On the ice:**

| | Offense | Defense | Keys | Gamepad |
|---|---|---|---|---|
| Skate | | | WASD / arrows | stick / d-pad |
| Button 1 | Pass | Switch player | J or Z | A |
| Button 2 | Shoot (hold for a slap shot) | Body check | K or X | B |
| Button 3 | Deke | Poke check | L or C | X |
| Sprint | | | Shift / Space | RB / RT |
| Pause | | | Esc / P | Start |

- **One-timer:** press shoot while your pass is still travelling.
- **Aim:** hold left or right as you release a shot to pick a post.
- **Faceoffs:** press pass or shoot as the puck drops to win the draw.
- **Two players on one keyboard:** P1 uses WASD + C / V / B + Left Shift; P2 uses Arrows + , / . / / + Right Shift.
- **Phones:** get an on-screen stick and buttons.

## Deploy to Railway

1. Push this folder to a GitHub repository.
2. In Railway, choose **New Project → Deploy from GitHub repo** and pick the repository.
3. Railway detects Node and runs `npm start`. `railway.json` sets the health check to `/health`.
4. Under **Settings → Networking**, click **Generate Domain**. WebSockets for online play work on Railway without extra setup.

No environment variables are needed. Season saves live in each player's browser (localStorage), so there is nothing to persist on the server.

## Project layout

```
server.js           Express static server + WebSocket endpoint (/ws) + /health
server/rooms.js     Online rooms: 4-letter codes, authoritative engine at 60 Hz, snapshots at 30 Hz
shared/             Isomorphic game code, loaded by both the browser and the server
  engine.js         The game: skating physics, puck, goalies, AI, rules, penalties, shootout
  league.js         Seasons: rosters, schedule, quick-sim, standings, playoffs, leaders, team ratings
  teams.js          The 32 fictional clubs (made-up hometowns, colours, arenas, specialties)
  rng.js, names.js
public/
  js/render.js      400px-wide pixel canvas, NHL '94-style vertical scroll, bitmap font
  js/game-client.js Local game loop (replays, sim-to-end) and online snapshot interpolation
  js/main.js        Console-style screens: attract title, team select, season menu, versus, online lobby
  js/menu.js        Cursor navigation for keyboard, gamepad, mouse and touch
  js/crest.js       Pixel-art club crests
  js/input.js       Keyboard, gamepads, touch
  js/audio.js       Synthesized arena sounds: horn, organ, crowd, posts
test/
  headless.mjs      CPU-vs-CPU games plus a full simulated season, with invariant checks
  human-bot.mjs     Drives every control through the human input path
```

## Tests

```bash
npm test
```

```bash
node test/human-bot.mjs
```

`npm test` plays CPU-vs-CPU games through the real engine and prints per-game averages (goals, shots, save percentage, penalties, one-timers). It asserts that the puck and players never leave the rink, that every game ends, and that a full season reaches a champion with consistent standings.

See [DESIGN.md](DESIGN.md) for the research behind the mechanics and ideas for what to build next.
