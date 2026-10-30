# TOP SHELF

16-bit pro hockey in the browser, in the spirit of NHL '94 and Blades of Steel.
Every screen plays like a cartridge from 1994: an attract-mode demo behind PRESS START, blue menu windows driven by a cursor (keyboard, gamepad, mouse or touch), and a vertical-scrolling rink. There are 32 made-up clubs, from the Port Kessel Yetis to the Skyhaven Pilots.

- **Season:** pick a club on an NHL '94-style select screen with ratings bars, then play or sim a 16/32/41/82-game season from the season menu. The top 8 in each conference play best-of-1/3/5/7 series for the Silver Cup. Includes standings, the bracket, league leaders, a news wire, rosters, and players who age from season to season. Between periods, an "Around the League" board shows the day's other games.
- **Quick game:** 1P vs CPU, 2 players on one keyboard or two gamepads, or CPU vs CPU (TAB fast-forwards).
- **Online:** one player creates a room and gets a 4-letter code; the other joins with it. The server runs the game and both browsers render it, and each player sees their own team attacking up the ice.
- **Real rules:** three periods, 3-on-3 OT then a playable shootout in the regular season, sudden-death 5-on-5 OT in the playoffs, 2-minute minors with power plays, and icing. There is no offside, as in the classics.
- No build step, no database, no external assets. Sound is synthesized in the browser.

## Running your club (GM mode)

From the season menu, **MANAGE TEAM** opens the front office:

- **Lines:** pick a slot, then pick who goes there (4 forward lines, 3 D pairs, 2 goalies, plus scratches). AUTO SET LINES fills them by rating. Injured players are swapped out automatically on game day.
- **Roster & contracts:** salary, years left, potential grade and injuries for every player, against an $88M salary cap. Releasing a player leaves a third of his salary on your cap for the rest of the season.
- **Trades:** pick a club, choose players and draft picks from both sides, and propose. The CPU judges value (rating, age, potential, contract), the cap, and roster needs. Ask WHAT DO THEY WANT? if a deal falls short. Trades close at 75% of the season and reopen in the off-season.
- **Free agents:** sign at the asking price, or try a lowball offer.
- **Injuries** happen through the season; CPU clubs fill holes from free agency or the minors.
- **Off-season** (after the Cup is handed out): re-sign or let go your expiring contracts → a 2-round **entry draft** with scouting grades (traded picks count) → **free agency** → START NEXT SEASON. Young players grow toward their potential, veterans decline and retire. Your roster needs 20-26 players (2+ goalies, 6+ D, 12+ F) under the cap.

Seasons saved before GM mode are upgraded automatically.

## The broadcast booth

Every game can be called by **Mick Embers** (play-by-play) and **Eddie O'Shea** (analyst):

- **Pre-game show:** the two hosts at the desk, with matchup, stakes, form guide, tale of the tape, keys to the game, players to watch and Eddie's pick.
- **Live commentary:** goal calls (first goal, tying, go-ahead, one-timer, top shelf…), big saves, hits, penalties, power plays, late-game tension, overtime and the shootout. Eddie breaks down every goal during the replay.
- **Post-game show:** the result, three stars, Eddie's analysis, what it means for the standings or the series, scores from around the league, and the sign-off.

All 351 lines live in [`shared/booth-lines.js`](shared/booth-lines.js). Each line's id is its file name (`public/voice/<id>.mp3`). Lines nobody has recorded yet show as captions and are read by the browser's built-in voice as a stand-in. Every piece can be switched off in OPTIONS → BROADCAST.

### Recording the voices

1. Open **OPTIONS → COMMENTARY STUDIO** (or go to `/#studio`).
2. Pick a section and a category, read the line, and press **R** to record and **R** to stop. **P** plays the take back; **C** plays it in context with a sample team name spliced in; **N** moves to the next line. Use the SHOW filter to work through ESSENTIALS first (206 lines, including the 64 team names).
3. Takes are trimmed, levelled and saved as MP3s in your browser, and the game uses them immediately.
4. When you're ready, press **DOWNLOAD ALL**. Upload the MP3s from the zip's `voice` folder into `public/voice/` in this repo (on GitHub: Add file → Upload files). Railway redeploys, and everyone hears your recordings.

For lines with a team in them (`{team} strikes first!`), record only the words. The team name is its own clip, recorded once per team in the TEAM NAMES section.

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

**Every game control can be rebound** in OPTIONS → CONTROLS: two keys per action for single player, separate layouts for couch Player 1 and Player 2, and gamepad buttons. The defaults are below.

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
  gm.js             GM mode: contracts & cap, injuries, lineups, trades & picks, free agency, off-season
  players.js        Player generation and overall ratings
  teams.js          The 32 fictional clubs (made-up hometowns, colours, arenas, specialties)
  booth-lines.js    The commentary script: every line, who says it, when it plays, delivery notes
  rng.js, names.js
public/
  js/render.js      400px-wide pixel canvas, NHL '94-style vertical scroll, bitmap font
  js/game-client.js Local game loop (replays, sim-to-end) and online snapshot interpolation
  js/main.js        Console-style screens: attract title, team select, season menu, versus, online lobby
  js/menu.js        Cursor navigation for keyboard, gamepad, mouse and touch
  js/crest.js       Pixel-art club crests
  js/booth/         Commentary: voice playback + captions, live director, pre/post-game shows, recording studio
  voice/            Recorded commentary clips (<line id>.mp3)
  js/input.js       Keyboard, gamepads, touch, rebindable controls
  js/controls-ui.js OPTIONS → CONTROLS screen
  js/gm-ui.js       Manage-team screens: lines, contracts, trades, free agents, re-sign, draft
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

```bash
node test/booth.mjs
```

```bash
node test/gm.mjs
```

`node test/gm.mjs` plays two full seasons with off-seasons and checks the cap, trades, free agency, the draft and save upgrades. `node test/booth.mjs` checks the commentary script (ids, team slots, every category the game asks for). `npm test` plays CPU-vs-CPU games through the real engine and prints per-game averages (goals, shots, save percentage, penalties, one-timers). It asserts that the puck and players never leave the rink, that every game ends, and that a full season reaches a champion with consistent standings.

See [DESIGN.md](DESIGN.md) for the research behind the mechanics and ideas for what to build next.
