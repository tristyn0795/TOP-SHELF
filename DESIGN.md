# TOP SHELF design notes

TOP SHELF is a real-time arcade hockey game wrapped in a season mode, with online play, hosted on Railway. Its mechanics come from the retro hockey games people remember, checked against how the NHL actually works. Its look is its own: the whole thing presents like a 16-bit console cartridge.

## Identity

- **Console presentation:** an attract-mode demo game runs behind a PRESS START title. Menus are blue bevelled windows with a blinking red cursor, driven by keyboard, gamepad, mouse or touch (`public/js/menu.js`). The page backdrop is a sheet of ice with faint rink lines, and Press Start 2P is used everywhere.
- **Clubs:** 32 clubs with made-up hometowns (Port Kessel, Saltmarsh, Red Mesa, Skyhaven…), pixel crests drawn at runtime (`public/js/crest.js`), and NHL '94-style ratings bars (offense, defense, goaltending, skating, checking, overall) on the select and versus screens. Each club has one SPECIALTY that changes how it plays.
- **Season flow:** a vertical season menu whose right-hand window previews the highlighted item. Stats open as pages you flip with left/right. Before each game there's a versus screen. Between periods, an "Around the League" board shows the day's other scores on the jumbotron. The trophy is the Silver Cup.

## GM mode

- **Rules live in `shared/gm.js`** (pure JSON in, JSON out, tested by `test/gm.mjs`). `league.js` calls it from the day loop: injuries heal and happen, CPU clubs keep legal rosters, and occasionally trade with each other.
- **Money:** fair salary rises steeply with overall rating (≈$0.75M at 65, $3M at 75, $8.5M at 85). The cap is $88M. New leagues scale each club's payroll to 75–92% of the cap so everyone starts close to it, like the real league.
- **Game day:** `gameLineup()` turns your saved lines into tonight's lineup. It swaps in healthy extras for injured players (and promotes the backup goalie) without changing your lines. The engine and the quick sim both use it.
- **Trade AI:** player value = (rating + youth upside − 55)² ÷ 10, scaled by age, plus contract surplus. Picks are valued by round and the original team's standing. The CPU wants ≥105% back (120% for its stars), stays legal on the cap and roster, and explains every rejection.
- **Off-season:** players develop (toward their potential if young, down if old), retire, and contracts tick down. Then re-sign → 2-round draft (order by standings and playoff exit, traded picks honoured, scouting grades with noise) → free agency → new season.

## Controls

Bindings live in `public/js/input.js` (saved in localStorage): two keys per action for single player and for each couch player, plus gamepad buttons. Binding a key moves it off any other action in that layout. Menus always use arrows/Enter/Esc and Esc always pauses, so a bad binding can't lock anyone out.

## Phones and foldables

- **Game layout** (`fit()` in `public/js/main.js`): it measures the real screen (including safe areas and fold segments) and picks one of four layouts.
  - `side`: a landscape screen with at least 160 px beside the rink gets the stick on the left and the buttons on the right.
  - `bottom`: portrait screens, the Fold cover screen and the Fold inner screen get a control band under the rink. It takes 34% of the height (150–210 px), and narrow screens give it whatever height the rink can't use.
  - `split-v` / `split-h`: when the browser reports two viewport segments, the rink takes one half of the fold and the controls take the other, so nothing sits on the hinge.
  - The rink's internal height follows the space it gets (300–640 px tall at 400 px wide). Captions sit at the rink's edge, never over the buttons. The layout is recalculated on resize, rotation, keyboard and fold changes.
- **Touch controls** (`mountTouch` in `public/js/input.js`): a floating stick in the whole left zone and a thumb arc of 52–84 px buttons. They support multi-touch, and a cancelled touch releases everything.
- **Menus:** on touch screens every target is at least 44 px tall. Under 480 px wide, text is at least 9 px, secondary table columns hide, and the action buttons of wide tables stay pinned on the right. Fold inner screens (640 px and up) keep two columns.
- **App shell:**
  - an installable manifest (full screen, any orientation) with pixel-art icons
  - a full-screen button
  - a screen wake lock while playing
  - auto-pause when the app goes to the background
  - vibration on goals, posts, big hits and whistles (OPTIONS → VIBRATION)
  - the title demo runs at half frame rate on slower phones

## Broadcast booth

- **The voices:** Mick Embers is a poetic play-by-play man with a big vocabulary who builds to the goal call. Eddie O'Shea is a folksy ex-player analyst ("you gotta get pucks to the net"). They are inspired by classic hockey broadcast pairings but are original characters with original lines.
- **Script as data:** `shared/booth-lines.js` holds every line (`id`, speaker, category, text, delivery note, tier). A line may contain one team slot at its start or end. The team name is a separate recorded clip, so 64 short recordings (32 cities, 32 nicknames) let calls name any club without recording every combination. Player names appear only on screen because they're generated randomly.
- **Playback** (`public/js/booth/voice.js`): it uses the studio take in this browser if there is one, then `public/voice/<id>.mp3` (listed by `/voice/index.json`), then browser text-to-speech, then a caption on its own. The crowd ducks under the voices.
- **Live director** (`director.js`): engine events and snapshot changes become prioritised calls. A goal (100) beats the final horn and period ends (90), which beat penalties (70), big saves and posts (60), big hits (50), shots (20) and filler (5). Small calls expire after 1.5 seconds and minor ones are spaced at least 2.5 seconds apart. A goal interrupts anything, then chains the context line ("Saltmarsh takes the lead!") and Eddie's replay breakdown.
- **Shows** (`shows.js`): the running order is built from game context (records, streaks, standings rank, series state, ratings, specialties, box score) and played over an animated pixel desk with stat cards.
- **Studio** (`studio.js`): mic capture through an AudioWorklet, silence trimming, peak normalisation, MP3 encoding with lamejs, IndexedDB storage and zip export with JSZip. Both libraries are loaded from cdnjs only on the studio page.

## What we took from the classics

| Source | What made it work | How Top Shelf does it |
|---|---|---|
| **NHL '94** (Genesis/SNES) | A vertical rink with the camera following the puck. Three buttons whose meaning changes with possession. One-timers, wraparounds, fast and readable play. | Vertical scroll on a 400 px canvas, with the camera on the puck. The same three context-sensitive buttons. One-timers fire when you press shoot while a pass is moving. Carrying around the net and shooting from beside the post counts as a wraparound. |
| **NHL '94** controls | Offense: pass / shoot / speed burst. Defense: switch / check / hook. | Pass·switch / shoot·check / deke·poke, plus a separate sprint so the speed burst is always available. |
| **NHL '94** goalie play | Goalies square up to the shooter, and cross-crease passes beat them. | Goalies play the angle and track the shot only after a reaction delay based on their rating. A save is decided where the puck reaches the goalie, so a goalie moving across the crease on a one-timer is weaker. |
| **Blades of Steel / NHL Hitz** | Big hits, crowd noise, arcade swagger. | Body checks are lunges. A strong hit flattens the carrier and shakes the screen. The horn, organ riffs and crowd roar are synthesized. Banners announce ONE-TIMER!, TOP SHELF!, FIVE HOLE!, and the like. |
| **NES Ice Hockey** | Different player types, readable at a glance. | Archetypes (Sniper, Playmaker, Power Fwd, Grinder, Bruiser, ...) shift each player's ratings, and every club has a specialty (Cannon, Brick Wall, Sandpaper, ...). |
| **NHL '94 menus** | Team select with ratings bars, cursor-driven menus, an attract demo. | The whole front end: team select, season menu, versus screen, paged stats, PRESS START. |
| **NHL '94 options** | Toggle penalties and offside; choose period length. | Penalties and icing can be turned off. Period length is 2/3/5/8/10/20 minutes, and 10- and 20-minute periods run an accelerated clock (2x / 3x). Offside isn't modelled, as in NHL '94's default. |

## NHL rules and structure we follow

- **League:** 32 teams, 2 conferences × 2 divisions × 8 teams. Win = 2 points, OT/SO loss = 1 point, regulation loss = 0. The top 8 per conference make the playoffs, seeded 1v8, 4v5, 3v6, 2v7 with no reseeding, with a 2-2-1-1-1 home pattern.
- **Game:** three periods. The regular season has 3-on-3 sudden-death overtime, then a shootout: three rounds and then sudden death, with the shootout goal counted as one goal for the winner. Playoffs have full 5-on-5 sudden-death overtime periods until someone scores.
- **Penalties:** 2-minute minors, scaled to period length so short games aren't dominated by power plays. A team has at most 2 players in the box (5-on-3). A power-play goal releases the earliest minor. Penalties are called on poke checks that catch the skater (hooking/tripping), on dangerous hits (boarding/charging), and on hits against players without the puck (interference).
- **Icing:** puck shot from behind the red line that crosses the goal line untouched. It is waived for a shorthanded team. The faceoff goes back to the icing team's end, and that team can't change lines.
- **Lines and fatigue:** 4 forward lines and 3 D pairs. Energy drains with speed and sprinting and lowers top speed. Lines change at whistles, and tired players swap on the fly from the bench. The power play sends out the top unit.

## Engine overview (`shared/engine.js`)

- The state is plain JSON, and randomness comes from a serializable PRNG. The same engine runs in the browser for local games and on the server for online games.
- Fixed 60 Hz step. Skaters accelerate toward a target velocity, which gives the ice its glide. The boards are a rounded rectangle and the nets are solid boxes, so players can go behind the net.
- The puck has height. Shots are aimed with a target height and lateral spot. Crossing the goal line under the crossbar and inside the posts is a goal, and anything in the post's few inches rings the post. Tags such as TOP SHELF and FIVE HOLE come from the actual crossing point.
- **AI:** each team assigns roles every step: one presser on the puck carrier, goal-side marking for everyone else, one chaser on loose pucks, and support spots on offense that shift with the puck. The CPU puck carrier weighs shoot, pass, deke and carry using distance, shooting lane, pressure and how open teammates are.
- **Difficulty:** Rookie/Pro/All-Star adjust CPU ratings (−9 / 0 / +5) and how quickly CPU defenders react.
- **Pace:** with long periods the clock runs faster and the CPU shoots less, so games land around 3–6 goals per team at every period length.

### Tuning targets (from `npm test`)

| Metric | Target | Current (3-min periods, CPU vs CPU) |
|---|---|---|
| Goals per team | 3–4 | ~4.0 |
| Save % | .85–.90 | ~.855 |
| Minor penalties per game | 2–4 | ~2.5 |
| Games decided in OT/SO | ~20% | ~10–20% |

## Online model

- The server owns the game. Clients send their stick and button state whenever it changes, with press counters so a quick tap is never dropped between server ticks. The server steps at 60 Hz and broadcasts compact snapshots (about 1 KB) at 30 Hz.
- Clients render about 75 ms behind the newest snapshot and interpolate positions between snapshots. Sound and banners come from the event lists sent with each snapshot.
- The guest's view is rotated 180°, so both players attack up the screen. Input is converted to world coordinates before it is sent.
- Rooms close when either player leaves, disconnects, or the room sits idle for 30 minutes.

## Ideas for next steps

1. **Accounts + ranked ladder:** add Postgres on Railway, an Elo rating per player, and a matchmaking queue alongside room codes.
2. **Online leagues:** friends share one season. Move league state server-side and let each owner play their own games.
3. **Fights** (Blades of Steel): when the fight setting is on, two big hits in a row trigger a mini-game, and the loser gets 5 minutes.
4. **Delayed penalties and pulling the goalie:** play continues until the penalized team touches the puck, plus an extra attacker late in games.
5. **Offside toggle** for people who want the simulation feel.
