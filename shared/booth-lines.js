// The TOP SHELF broadcast booth: every line Mick Embers and Eddie O'Shea can say.
// This file is the recording script. Each line's id is its file name: /voice/<id>.mp3
//
// Slots: a line may contain ONE team slot, at the very start or the very end, e.g.
//   '{team} strikes first!'   -> plays the recorded team clip, then this line's clip.
// Record only the words, not the team name. {x} is the city ("Saltmarsh"),
// {x.nick} is the nickname with "the" ("the Narwhals"). Team clips are Mick's voice.
//
// tier 1 = record these first (full coverage), tier 2 = extra variety.
import { TEAMS } from './teams.js';

export const VOICES = {
  mick: { name: 'MICK EMBERS', role: 'PLAY-BY-PLAY', color: '#f8e000' },
  eddie: { name: "EDDIE O'SHEA", role: 'ANALYST', color: '#7fd4ff' },
};

export const GROUPS = ['PRE-GAME SHOW', 'IN-GAME', 'POST-GAME SHOW', 'TEAM NAMES'];

// Category id -> where it lives and when it plays (shown in the studio).
export const CATS = {};
function cat(id, group, label, ctx) { CATS[id] = { id, group, label, ctx }; }

export const LINES = [];
const counters = {};
function add(who, c, tier, text, note = '') {
  if (!CATS[c]) throw new Error(`unknown category ${c}`);
  const key = `${who}.${c}`;
  counters[key] = (counters[key] || 0) + 1;
  const id = `${key}.${String(counters[key]).padStart(2, '0')}`;
  LINES.push({ id, who, cat: c, tier, text, note, parts: parse(text) });
}
const M = (c, tier, text, note) => add('mick', c, tier, text, note);
const E = (c, tier, text, note) => add('eddie', c, tier, text, note);

export const SLOT_NAMES = ['home', 'away', 'team', 'other', 'winner', 'loser', 'lead', 'trail'];

// "{team} strikes first!" -> [{ slot: 'team', nick: false }, 'strikes first!']
export function parse(text) {
  const m = text.match(/^\{(\w+)(\.nick)?\}\s*(.*)$/) || text.match(/^(.*?)\s*\{(\w+)(\.nick)?\}([.!?]*)$/);
  if (!m) return [text];
  if (text.startsWith('{')) return [{ slot: m[1], nick: !!m[2] }, m[3]];
  return [m[1], { slot: m[2], nick: !!m[3], tail: m[4] || '' }];
}

// Team-name clips (Mick).
export const teamClipId = (teamId, nick) => `team.${nick ? 'nick' : 'city'}.${String(teamId).padStart(2, '0')}`;
export function teamClipText(teamId, nick) {
  const t = TEAMS[teamId];
  return nick ? `the ${t.name}` : t.city;
}

// ======================================================================== PRE-GAME SHOW
cat('pre_open', 'PRE-GAME SHOW', 'Show open', 'First line of every pre-game show.');
M('pre_open', 1, 'Good evening, everybody, and welcome to Top Shelf Hockey.', 'Warm, unhurried. The show is starting.');
M('pre_open', 1, "Hello again, everyone. The ice is fresh, the building is buzzing, and we've got a hockey game for you tonight.", 'Smile in the voice.');
M('pre_open', 2, 'Welcome in, hockey fans. Pull up a chair. This one should be a beauty.', '');
M('pre_open', 2, 'Good evening from rinkside. The anthem is done, the stands are full, and we are just about ready.', '');

cat('pre_away', 'PRE-GAME SHOW', 'Introduce the visitors', 'Names the away team. Team name plays first.');
M('pre_away', 1, '{away.nick} are in town tonight.', 'Say only "are in town tonight." Picks up right after the team name.');
M('pre_away', 2, '{away.nick} come calling, and they did not come for the scenery.', 'Say only the words after the team name.');
M('pre_away', 2, "{away.nick} are the visitors this evening, a long bus ride behind them.", 'Say only the words after the team name.');

cat('pre_home', 'PRE-GAME SHOW', 'Introduce the home team', 'Names the home team. Team name plays first.');
M('pre_home', 1, '{home.nick} play host, in front of their own people.', 'Say only the words after the team name.');
M('pre_home', 2, '{home.nick} are at home, and this crowd expects a show.', 'Say only the words after the team name.');
M('pre_home', 2, "{home.nick} have the last change and the loudest building. Let's see if it matters.", 'Say only the words after the team name.');

cat('pre_hello', 'PRE-GAME SHOW', "Eddie says hello", 'Eddie joins the broadcast.');
E('pre_hello', 1, 'Thanks, Mick. Great to be here. Great night for hockey.', 'Easygoing, happy to be there.');
E('pre_hello', 2, "Mick, I've been looking forward to this one all week. Let's get after it.", '');
E('pre_hello', 2, "Evening, Mick. I had a good feeling driving in tonight, I'll tell ya that.", '');

cat('pre_early', 'PRE-GAME SHOW', 'Early-season stakes', 'Regular season, first few games.');
M('pre_early', 1, "It's early in the season, but every point you bank now is one you won't be chasing in March.", '');
M('pre_early', 2, 'New season, clean slate. First impressions start tonight.', '');
cat('pre_mid', 'PRE-GAME SHOW', 'Mid-season stakes', 'Regular season, middle stretch.');
M('pre_mid', 1, "We're into the heart of the schedule now. This is where good teams separate themselves.", '');
M('pre_mid', 2, 'The grind of the season. No shortcuts, just two points sitting at center ice.', '');
cat('pre_late', 'PRE-GAME SHOW', 'Stretch-run stakes', 'Regular season, final quarter.');
M('pre_late', 1, 'The stretch run is here. Every shift feels a little heavier this time of year.', '');
M('pre_late', 2, 'Late in the season, the standings are tight, and nobody wants to be scoreboard watching in April.', '');
cat('pre_exhibition', 'PRE-GAME SHOW', 'Exhibition stakes', 'Exhibition games (no standings).');
M('pre_exhibition', 1, "No standings on the line tonight, but don't tell that to the players. Pride is on the line.", '');
M('pre_exhibition', 2, "It's an exhibition, but there's no such thing as a friendly game once the puck drops.", '');

cat('pre_series_opener', 'PRE-GAME SHOW', 'Playoffs: series opener', 'Game 1 of a playoff series.');
M('pre_series_opener', 1, "It's the playoffs, and it's game one. Everything you did in the regular season is in the rear-view mirror now.", '');
M('pre_series_opener', 2, 'Game one of the series. The chess match begins tonight.', '');
cat('pre_series_tied', 'PRE-GAME SHOW', 'Playoffs: series tied', 'Series tied after at least one game.');
M('pre_series_tied', 1, 'This series is dead even. Somebody has to grab it by the collar tonight.', '');
M('pre_series_tied', 2, "All square in the series, and you can feel it. Tonight's a swing game.", '');
cat('pre_series_lead', 'PRE-GAME SHOW', 'Playoffs: series lead', 'One team leads the series (team name first).');
M('pre_series_lead', 1, '{lead.nick} hold the upper hand in this series.', 'Say only the words after the team name.');
M('pre_series_lead', 2, '{lead.nick} have the lead in the series and a chance to tighten the grip.', 'Say only the words after the team name.');
cat('pre_elimination', 'PRE-GAME SHOW', 'Playoffs: elimination game', 'One team faces elimination (team name first).');
M('pre_elimination', 1, '{trail.nick} are one loss from the golf course.', 'Say only the words after the team name. Serious.');
M('pre_elimination', 2, '{trail.nick} face elimination. Win or go home, the oldest words in hockey.', 'Say only the words after the team name.');
cat('pre_game7', 'PRE-GAME SHOW', 'Playoffs: game 7', 'Deciding game of a series.');
M('pre_game7', 1, 'Game seven. The two most beautiful words in sports. One team moves on, one team goes home.', 'Savour it.');
M('pre_game7', 2, "It all comes down to tonight. Game seven. Nobody's sleeping well after this one.", '');
cat('pre_final', 'PRE-GAME SHOW', 'Playoffs: Cup final', 'Any game of the Silver Cup final.');
M('pre_final', 1, 'This is the Silver Cup Final. Childhood dreams, sixty minutes at a time.', 'Big moment, but restrained.');
M('pre_final', 2, "The Silver Cup is in the building tonight. You can almost see it shining from up here.", '');

cat('pre_hot', 'PRE-GAME SHOW', 'Form: winning streak', 'A team has won 3+ in a row (team name first).');
M('pre_hot', 1, '{team.nick} are red hot coming into this one.', 'Say only the words after the team name.');
M('pre_hot', 2, '{team.nick} have been rolling. Winners of three straight, at least.', 'Say only the words after the team name.');
cat('pre_cold', 'PRE-GAME SHOW', 'Form: losing streak', 'A team has lost 3+ in a row (team name first).');
M('pre_cold', 1, '{team.nick} are searching for answers.', 'Say only the words after the team name.');
M('pre_cold', 2, '{team.nick} have dropped a few in a row and need to stop the bleeding.', 'Say only the words after the team name.');
cat('pre_leader', 'PRE-GAME SHOW', 'Form: division leader', 'A team leads its division (team name first).');
M('pre_leader', 1, '{team.nick} sit on top of their division.', 'Say only the words after the team name.');
M('pre_leader', 2, '{team.nick} come in as the team everybody in the division is chasing.', 'Say only the words after the team name.');
cat('pre_form_eddie', 'PRE-GAME SHOW', 'Eddie on form', 'Eddie reacts to the form lines.');
E('pre_form_eddie', 1, "Momentum's a real thing, Mick. When you're going good, the puck just seems to find you.", '');
E('pre_form_eddie', 2, "Streaks come and go. What matters is the first ten minutes tonight.", '');
E('pre_form_eddie', 2, "You can't win the whole season in one night, but you sure can lose your confidence in one.", '');

cat('pre_tape', 'PRE-GAME SHOW', 'Tale of the tape intro', 'Mick throws to the ratings comparison.');
M('pre_tape', 1, "Let's look at how these two stack up. Eddie?", 'Hand-off to Eddie.');
M('pre_tape', 2, "The tale of the tape. Eddie, what jumps out at you?", '');
cat('pre_edge_off_home', 'PRE-GAME SHOW', 'Edge: home offense', 'Home team rates clearly better on offense.');
E('pre_edge_off_home', 1, 'The home side has more firepower up front. If they get their legs going, look out.', '');
E('pre_edge_off_home', 2, "On paper, the home team can score with anybody. The visitors have to keep 'em to the outside.", '');
cat('pre_edge_off_away', 'PRE-GAME SHOW', 'Edge: away offense', 'Away team rates clearly better on offense.');
E('pre_edge_off_away', 1, "The visitors bring more skill up front. The home team's gonna have to defend well tonight.", '');
E('pre_edge_off_away', 2, "Don't let the road jerseys fool ya, the visitors can really fill the net.", '');
cat('pre_edge_g_home', 'PRE-GAME SHOW', 'Edge: home goalie', 'Home goaltending rates clearly better.');
E('pre_edge_g_home', 1, "I like the home team's goaltending. That guy can steal you a game.", '');
E('pre_edge_g_home', 2, "Home team's got the edge in net, and in this league that's half the battle.", '');
cat('pre_edge_g_away', 'PRE-GAME SHOW', 'Edge: away goalie', 'Away goaltending rates clearly better.');
E('pre_edge_g_away', 1, "The visitors have the better goalie tonight. You gotta get traffic in front of him.", '');
E('pre_edge_g_away', 2, "If you're the home team, you better make that goalie uncomfortable. He's been terrific.", '');
cat('pre_goalie_duel', 'PRE-GAME SHOW', 'Both goalies excellent', 'Both goalies rate very high.');
E('pre_goalie_duel', 1, "Two great goalies tonight, Mick. Could be one of those two-to-one hockey games.", '');
E('pre_goalie_duel', 2, "Goals are gonna be hard to come by. Both these guys are seeing the puck like a beach ball.", '');
cat('pre_edge_even', 'PRE-GAME SHOW', 'Evenly matched', 'No clear edge either way.');
E('pre_edge_even', 1, "Honestly? These two are about as even as it gets. Coin flip. It'll come down to who wants it more.", '');
E('pre_edge_even', 2, "Tough to separate 'em. I think special teams decide this one.", '');

cat('pre_keys_for', 'PRE-GAME SHOW', 'Keys to the game (ask Eddie)', 'Mick asks about a team; team name plays LAST.');
M('pre_keys_for', 1, "Eddie, what's the key for {team.nick}?", 'Say only "Eddie, what\'s the key for", rising like a question; the team name follows.');
M('pre_keys_for', 2, 'And what do you want to see from {team.nick}?', 'Say only "And what do you want to see from"; the team name follows.');
const KEYS = {
  CANNON: ['They can really shoot it from the point. Get the puck to the blue line and let it rip.', "Big shots from up top. If there's traffic in front, somebody's goin' in."],
  BRICK_WALL: ["Their goalie's their backbone. Keep shots to the outside and let him do his thing.", 'Play in front of your netminder. Clear the rebounds and he will handle the rest.'],
  SANDPAPER: ['Finish your checks. These guys win games by wearing you down shift after shift.', 'Be physical. Make the other team pay a price for every inch of ice.'],
  SNIPERS: ["They don't need many chances. Get 'em the puck in the slot and they'll pick a corner.", 'Pure shooters. Find the open man, and the puck finds twine.'],
  SPEEDSTERS: ['Use your speed. Back the defense off the line and attack the middle.', "Get to your game. They're quicker than anybody out there, like a thoroughbred out of the gate."],
  GRINDERS: ['Roll four lines and outwork them in the third. Their legs will still be fresh at the end.', 'Win the battles along the wall. That grind pays off late in the game.'],
  DANGLERS: ["Let your skill guys make plays. They've got hands, Mick, they can make you look silly.", 'Puck possession. Hold onto it, make a move, make the defender commit.'],
  PLAYMAKERS: ['Move the puck quick. One-timers are their bread and butter.', "Tape-to-tape passes, and somebody's waiting on the back door. Pass, pass, shoot."],
  DISCIPLINED: ['Stay out of the penalty box. They play clean and make you pay when you don\'t.', "Keep it five on five. They don't give you power plays, so you have to earn it at even strength."],
};
for (const [perk, lines] of Object.entries(KEYS)) {
  cat(`pre_key_${perk.toLowerCase()}`, 'PRE-GAME SHOW', `Keys: ${perk.replace('_', ' ').toLowerCase()} specialty`, `Eddie's key for a team whose specialty is ${perk}.`);
  E(`pre_key_${perk.toLowerCase()}`, 1, lines[0], '');
  E(`pre_key_${perk.toLowerCase()}`, 2, lines[1], '');
}

cat('pre_watch_intro', 'PRE-GAME SHOW', 'Players to watch (Mick)', 'Shown with the players-to-watch card.');
M('pre_watch_intro', 1, "A few names to keep an eye on tonight. They're up on your screen.", '');
M('pre_watch_intro', 2, 'Here are the players who could tilt this game.', '');
cat('pre_watch', 'PRE-GAME SHOW', 'Players to watch (Eddie)', 'Eddie reacts to the players card.');
E('pre_watch', 1, "Those top guys have to be the best players on the ice tonight. That's what you pay 'em for.", '');
E('pre_watch', 2, 'Watch the goalies early. Whoever settles in first sets the tone.', '');
E('pre_watch', 2, "Your stars score in streaks, Mick. Somebody's due tonight, I can feel it.", '');

cat('pre_pick_home', 'PRE-GAME SHOW', "Eddie's pick: home", 'Home team rates better overall.');
E('pre_pick_home', 1, "I'm taking the home team tonight. Crowd behind 'em, last change, I like it.", '');
E('pre_pick_home', 2, 'Gimme the home side. They just have a little more horse in this race.', '');
cat('pre_pick_away', 'PRE-GAME SHOW', "Eddie's pick: away", 'Away team rates better overall.');
E('pre_pick_away', 1, 'I like the visitors. Quiet the crowd early and they take it.', '');
E('pre_pick_away', 2, "I'm going with the road team. Sometimes you just get that feeling.", '');
cat('pre_pick_even', 'PRE-GAME SHOW', "Eddie's pick: too close", 'Teams rated about the same.');
E('pre_pick_even', 1, "Too close to call, Mick. I'm saying overtime.", '');
E('pre_pick_even', 2, "I'll take the team that wins the third period. How's that for a cop-out?", 'Laughing.');

cat('pre_throw', 'PRE-GAME SHOW', 'Throw to the game', 'Last line before puck drop.');
M('pre_throw', 1, "The teams are lined up at center ice. Let's drop the puck.", 'Rising energy.');
M('pre_throw', 2, 'Enough talk. The officials are ready, the crowd is ready. Here we go.', '');
M('pre_throw', 2, "Sticks on the ice, hearts in throats. It's time.", '');

// ======================================================================== IN-GAME
cat('g_open', 'IN-GAME', 'Opening faceoff', 'Puck drops to start the game.');
M('g_open', 1, "And we're underway!", 'Crisp.');
M('g_open', 1, 'The puck is dropped, and off they go.', '');
M('g_open', 2, 'Here we go. Hockey night is underway.', '');
M('g_open', 2, 'Puck is down, sticks are clattering, and we have begun.', '');

cat('g_period2', 'IN-GAME', 'Second period starts', 'Faceoff to start the 2nd.');
M('g_period2', 1, 'The second period is underway.', '');
M('g_period2', 2, 'Back at it for the middle frame.', '');
cat('g_period3', 'IN-GAME', 'Third period starts', 'Faceoff to start the 3rd.');
M('g_period3', 1, 'Third period. Twenty minutes to decide it.', 'Use "twenty" even if periods are shorter.');
M('g_period3', 2, 'Here comes the third. This is where legends are made.', '');

cat('g_shot', 'IN-GAME', 'Shot', 'Wrist shot on goal. Keep these short!');
M('g_shot', 1, 'Shot.', 'Quick.');
M('g_shot', 1, 'Fires!', '');
M('g_shot', 1, 'Wrister on goal.', '');
M('g_shot', 2, 'Snaps it toward the net.', '');
M('g_shot', 2, 'Lets it go.', '');
M('g_shot', 2, 'Quick release!', '');
cat('g_slap', 'IN-GAME', 'Slap shot', 'Big wind-up slapper.');
M('g_slap', 1, 'Big slapper!', '');
M('g_slap', 1, 'Winds up, blasts it!', '');
M('g_slap', 2, 'A cannon from the point!', '');
M('g_slap', 2, 'Hammers it!', '');
cat('g_save', 'IN-GAME', 'Routine save', 'Goalie stops a normal shot.');
M('g_save', 1, 'Saved.', '');
M('g_save', 1, 'Kicked aside.', '');
M('g_save', 2, 'Gloved down.', '');
M('g_save', 2, 'Turned away.', '');
M('g_save', 2, 'Blocker save.', '');
cat('g_save_big', 'IN-GAME', 'Big save', 'Spectacular save.');
M('g_save_big', 1, 'What a save!', 'Big!');
M('g_save_big', 1, 'Robbed! Absolutely robbed!', '');
M('g_save_big', 2, 'Oh, the leg went out like a gate!', '');
M('g_save_big', 2, 'Spectacular! How did he get there?', '');
cat('e_save_big', 'IN-GAME', 'Eddie on a big save', 'Follows a big save sometimes.');
E('e_save_big', 1, "That's highway robbery right there.", '');
E('e_save_big', 2, "He had no business stopping that one, Mick.", '');
E('e_save_big', 2, "That's why you get paid the big bucks. Unbelievable.", '');
cat('g_post', 'IN-GAME', 'Off the post', 'Shot rings off a post.');
M('g_post', 1, 'Off the post!', '');
M('g_post', 2, 'Clang! Iron!', '');
M('g_post', 2, 'Hits the post and stays out!', '');
cat('g_bar', 'IN-GAME', 'Off the crossbar', 'Shot rings off the crossbar.');
M('g_bar', 1, 'Off the crossbar!', '');
M('g_bar', 2, 'Rings it off the bar!', '');

cat('g_goal', 'IN-GAME', 'Goal call', 'The big call when a goal goes in.');
M('g_goal', 1, 'He shoots... he scores!', 'Build on "shoots", explode on "scores".');
M('g_goal', 1, 'Scores!', 'Full voice.');
M('g_goal', 1, "It's in! Goal!", '');
M('g_goal', 2, 'Behind him! Goal!', '');
M('g_goal', 2, 'He beats him! Scores!', '');
M('g_goal', 2, 'In the back of the net!', '');
M('g_goal', 2, 'What a finish! Goal!', '');
cat('g_goal_onetimer', 'IN-GAME', 'Goal: one-timer', 'Goal scored on a one-timer.');
M('g_goal_onetimer', 1, 'One-timer! Scores!', '');
M('g_goal_onetimer', 2, 'Caught it on the fly, and it is in!', '');
cat('g_goal_topshelf', 'IN-GAME', 'Goal: top shelf', 'Goal under the crossbar.');
M('g_goal_topshelf', 1, 'Top shelf! Scores!', '');
M('g_goal_topshelf', 2, 'Up high, under the bar! Goal!', '');
cat('g_goal_fivehole', 'IN-GAME', 'Goal: five-hole', 'Goal between the goalie\'s legs.');
M('g_goal_fivehole', 1, 'Right through the legs! Scores!', '');
M('g_goal_fivehole', 2, 'Five-hole! It squeaks through!', '');
cat('g_goal_wrap', 'IN-GAME', 'Goal: wraparound', 'Wraparound goal.');
M('g_goal_wrap', 1, 'Comes around the net... stuffs it in!', '');
cat('g_goal_slap', 'IN-GAME', 'Goal: slap shot', 'Hard slap-shot goal.');
M('g_goal_slap', 1, 'A rocket! Scores!', '');
M('g_goal_slap', 2, 'He hammered it home!', '');
cat('g_goal_ppg', 'IN-GAME', 'Goal: power play', 'Power-play goal follow-up.');
M('g_goal_ppg', 1, 'And the power play delivers.', '');
M('g_goal_ppg', 2, 'Power-play goal. Make them pay.', '');
cat('g_goal_shg', 'IN-GAME', 'Goal: shorthanded', 'Shorthanded goal follow-up.');
M('g_goal_shg', 1, 'Shorthanded! What a stunner!', '');
cat('g_goal_first', 'IN-GAME', 'Goal context: first goal', 'Opening goal of the game (team name first).');
M('g_goal_first', 1, '{team} strikes first!', 'Say only "strikes first!"');
M('g_goal_first', 2, '{team} draws first blood.', 'Say only "draws first blood."');
cat('g_goal_tie', 'IN-GAME', 'Goal context: ties it', 'Goal ties the game (team name first).');
M('g_goal_tie', 1, '{team} has tied it up!', 'Say only "has tied it up!"');
M('g_goal_tie', 2, '{team} pulls even!', 'Say only "pulls even!"');
cat('g_goal_ahead', 'IN-GAME', 'Goal context: go-ahead', 'Goal puts a team ahead (team name first).');
M('g_goal_ahead', 1, '{team} takes the lead!', 'Say only "takes the lead!"');
M('g_goal_ahead', 2, '{team} goes in front!', 'Say only "goes in front!"');
cat('g_goal_more', 'IN-GAME', 'Goal context: extends lead', 'Goal extends a lead (team name first).');
M('g_goal_more', 1, '{team} adds another.', 'Say only "adds another."');
M('g_goal_more', 2, '{team} pulls away.', 'Say only "pulls away."');
cat('g_ot_winner', 'IN-GAME', 'Overtime winner', 'Goal ends the game in overtime.');
M('g_ot_winner', 1, "It's over! Overtime winner!", 'Biggest call in the game.');
M('g_ot_winner', 2, 'Sudden death... and it is sudden! Game over!', '');
cat('g_ot_team', 'IN-GAME', 'Overtime winner team', 'After the OT winner call (team name first).');
M('g_ot_team', 1, '{team} wins it in overtime!', 'Say only "wins it in overtime!"');

cat('e_replay', 'IN-GAME', "Eddie's goal replay", 'Eddie breaks down a goal during the replay.');
E('e_replay', 1, "Look at the release on that. He didn't even look up, Mick.", '');
E('e_replay', 1, "Watch the defenseman here. He gets caught puck-watching, and that's all it takes.", '');
E('e_replay', 1, "Great pass to set it up. That's an assist you frame and hang on the wall.", '');
E('e_replay', 2, "The goalie's moving side to side, and he just can't get there in time.", '');
E('e_replay', 2, "Here's the key: he gets inside position, and from there it's over.", '');
E('e_replay', 2, 'Picked his spot. Just a great shot, nothing the goalie could do.', '');
E('e_replay', 2, "Traffic in front. The goalie never saw it. That's why you go to the net.", '');
cat('e_replay_onetimer', 'IN-GAME', "Eddie's one-timer replay", 'Replay of a one-timer goal.');
E('e_replay_onetimer', 1, "Pass across, and he's waiting with the stick cocked. Textbook one-timer.", '');
E('e_replay_onetimer', 2, "You can't stop the cross-ice pass, and then it's a coin toss for the goalie.", '');

cat('g_hit_big', 'IN-GAME', 'Big hit', 'A crushing body check.');
M('g_hit_big', 1, 'Big hit!', '');
M('g_hit_big', 1, 'Oh, he got leveled!', '');
M('g_hit_big', 2, 'Thunderous check along the wall!', '');
M('g_hit_big', 2, 'Flattened him!', '');
cat('e_hit', 'IN-GAME', 'Eddie on a big hit', 'Sometimes follows a big hit.');
E('e_hit', 1, "He's gonna feel that one in the morning.", '');
E('e_hit', 2, 'Keep your head up, kid. Welcome to the league.', '');
E('e_hit', 2, 'Clean hit. Shoulder to shoulder. Love it.', '');
cat('g_steal', 'IN-GAME', 'Poke check / steal', 'Puck poked away.');
M('g_steal', 1, 'Poked away!', '');
M('g_steal', 2, 'Stripped of the puck!', '');
M('g_steal', 2, 'Picks his pocket!', '');

cat('g_penalty', 'IN-GAME', 'Penalty called', 'Any penalty (generic).');
M('g_penalty', 1, "There's a whistle. Somebody's headed to the box.", '');
M('g_penalty', 2, 'The arm goes up, and that will be a penalty.', '');
for (const [k, label, text] of [
  ['hooking', 'Hooking', 'Hooking is the call.'],
  ['tripping', 'Tripping', 'Tripping. Two minutes.'],
  ['boarding', 'Boarding', 'Boarding. A dangerous one into the wall.'],
  ['charging', 'Charging', 'Charging is the call.'],
  ['interference', 'Interference', "Interference. He didn't have the puck."],
]) {
  cat(`g_pen_${k}`, 'IN-GAME', `Penalty: ${label}`, `A ${label.toLowerCase()} penalty is called.`);
  M(`g_pen_${k}`, 1, text, '');
}
cat('g_pp', 'IN-GAME', 'Power play starts', 'After a penalty (team name first).');
M('g_pp', 1, '{team} goes to the power play.', 'Say only "goes to the power play."');
M('g_pp', 2, '{team} will have the man advantage.', 'Say only "will have the man advantage."');
cat('e_penalty', 'IN-GAME', 'Eddie on a penalty', 'Sometimes follows a penalty.');
E('e_penalty', 1, "That's a lazy penalty. You can't take that one.", '');
E('e_penalty', 2, 'Gotta move your feet there. Stick gets you in trouble when your legs stop.', '');
E('e_penalty', 2, 'Now the penalty kill has to bail him out.', '');
cat('g_pp_end', 'IN-GAME', 'Back to even strength', 'A penalty expires.');
M('g_pp_end', 1, "And we're back to even strength.", '');
M('g_pp_end', 2, 'The penalty has expired.', '');
cat('g_icing', 'IN-GAME', 'Icing', 'Icing is called.');
M('g_icing', 1, 'Icing.', '');
M('g_icing', 2, "That'll be icing, and the tired legs stay out there.", '');

cat('g_flow', 'IN-GAME', 'Play-by-play flow', 'Filler while play goes on with nothing big happening.');
M('g_flow', 1, 'Into the corner they go.', '');
M('g_flow', 1, 'Through the neutral zone, looking for room.', '');
M('g_flow', 1, 'Battle along the boards.', '');
M('g_flow', 2, 'Chipped out, and chased down.', '');
M('g_flow', 2, 'A scramble in front!', '');
M('g_flow', 2, 'Behind the net, looking for a passing lane.', '');
M('g_flow', 2, 'Up the wall, and out to center.', '');
M('g_flow', 2, 'Sticks and skates everywhere.', '');
cat('e_filler', 'IN-GAME', 'Eddie hockey talk', "Eddie's color commentary when things are quiet.");
E('e_filler', 1, "You gotta get pucks to the net, Mick. Good things happen when you throw it at the goalie.", '');
E('e_filler', 1, "These teams don't like each other, and you can feel it in every battle.", '');
E('e_filler', 1, 'Short shifts. That\'s the key. Get on, work hard, get off.', '');
E('e_filler', 2, 'When I played, we had a saying: the puck never lies.', '');
E('e_filler', 2, "This is like the far turn at the racetrack. Nobody's made their move yet.", '');
E('e_filler', 2, "Look at the effort on the backcheck. That doesn't show up on the scoresheet.", '');
E('e_filler', 2, "You win your battles along the wall, you win the hockey game. Simple as that.", '');
E('e_filler', 2, "Defensemen are joining the rush tonight. It's a different game than it used to be.", '');

cat('g_late2', 'IN-GAME', 'Two minutes left', 'Two minutes left in the 3rd.');
M('g_late2', 1, 'Two minutes to go in regulation.', '');
M('g_late2', 2, "Under two minutes left. Here's where it gets interesting.", '');
cat('g_late_close', 'IN-GAME', 'Last minute, one-goal game', 'Under a minute left, one-goal game.');
M('g_late_close', 1, "Under a minute, one goal game! They're pressing!", 'Urgent.');
M('g_late_close', 2, 'The clock is the enemy now. One goal in it!', '');
cat('g_late_tied', 'IN-GAME', 'Last minute, tied', 'Under a minute left, tied.');
M('g_late_tied', 1, 'Under a minute to go, and this one is all square!', '');
M('g_late_tied', 2, 'Tied, and the seconds are slipping away!', '');
cat('e_late_blowout', 'IN-GAME', 'Late, game decided', 'Late in the 3rd with a big lead.');
E('e_late_blowout', 1, 'This one has been decided, Mick. Now it\'s about building good habits.', '');
E('e_late_blowout', 2, "Long night for the guys on the wrong side of this one.", '');

cat('g_end1', 'IN-GAME', 'End of 1st', 'Horn ends the 1st period.');
M('g_end1', 1, "That's the end of the first period.", '');
M('g_end1', 2, "And there's the horn. One period in the books.", '');
cat('g_end2', 'IN-GAME', 'End of 2nd', 'Horn ends the 2nd period.');
M('g_end2', 1, 'Two periods done. Twenty minutes to play.', '');
M('g_end2', 2, 'Horn sounds on the second. Plenty of hockey still to play.', '');
cat('e_intermission', 'IN-GAME', 'Eddie at intermission', 'Plays over the "around the league" board.');
E('e_intermission', 1, "Big thing in the next period: shoot the puck. You can't score if you don't shoot.", '');
E('e_intermission', 1, 'Coaches are making adjustments right now. Watch the first five minutes coming out.', '');
E('e_intermission', 2, "Let's check in around the league. Lots of hockey tonight.", '');
E('e_intermission', 2, 'Gotta wipe the slate clean. New period, new game.', '');

cat('g_ot_start', 'IN-GAME', 'Overtime starts', 'Regular-season 3-on-3 overtime.');
M('g_ot_start', 1, 'Overtime! Three on three, and the next goal wins!', '');
M('g_ot_start', 2, 'Open ice, three skaters a side. Somebody is going to be a hero.', '');
cat('g_ot_playoff', 'IN-GAME', 'Playoff overtime starts', 'Sudden-death playoff overtime.');
M('g_ot_playoff', 1, 'Playoff overtime. Next goal wins. Breathe if you can.', 'Hushed, intense.');
M('g_ot_playoff', 2, 'Sudden death. The most nerve-racking words in hockey.', '');
cat('g_so_start', 'IN-GAME', 'Shootout starts', 'Game goes to a shootout.');
M('g_so_start', 1, "Still tied. We're going to a shootout!", '');
M('g_so_start', 2, 'One on one. Shooter against goalie. Here comes the shootout.', '');
cat('g_so_shooter', 'IN-GAME', 'Shootout shooter', 'A shooter starts an attempt.');
M('g_so_shooter', 1, 'Here he comes...', 'Hushed.');
M('g_so_shooter', 2, 'Picks up speed... moves in...', '');
M('g_so_shooter', 2, 'Takes the puck from center...', '');
cat('g_so_score', 'IN-GAME', 'Shootout goal', 'Shootout attempt scores.');
M('g_so_score', 1, 'Scores!', '');
M('g_so_score', 2, 'He beats him!', '');
cat('g_so_stop', 'IN-GAME', 'Shootout save', 'Shootout attempt stopped.');
M('g_so_stop', 1, 'Denied!', '');
M('g_so_stop', 2, 'Stopped!', '');
M('g_so_stop', 2, 'The goalie wins that duel!', '');

cat('g_final', 'IN-GAME', 'Final horn', 'Game ends.');
M('g_final', 1, "There's the final horn!", '');
M('g_final', 2, "And that's the ball game! Er, the hockey game!", 'Playful self-correction.');
cat('g_final_team', 'IN-GAME', 'Final: winner', 'After the final horn (team name first).');
M('g_final_team', 1, '{team} wins it!', 'Say only "wins it!"');
M('g_final_team', 2, '{team} takes the two points!', 'Say only "takes the two points!"');

// ======================================================================== POST-GAME SHOW
cat('post_open', 'POST-GAME SHOW', 'Post-game open', 'First line of the post-game show.');
M('post_open', 1, "Welcome back to the post-game show. What a night.", '');
M('post_open', 2, "We're back, and there is a lot to talk about.", '');
cat('post_close', 'POST-GAME SHOW', 'Result: tight game', 'Winner by one goal in regulation (team name first).');
M('post_close', 1, '{winner.nick} hang on to win a tight one.', 'Say only the words after the team name.');
M('post_close', 2, '{winner.nick} squeak out a one-goal win.', 'Say only the words after the team name.');
cat('post_blowout', 'POST-GAME SHOW', 'Result: blowout', 'Winner by 3 or more (team name first).');
M('post_blowout', 1, '{winner.nick} roll to a big win tonight.', 'Say only the words after the team name.');
M('post_blowout', 2, '{winner.nick} turned this one into a rout.', 'Say only the words after the team name.');
cat('post_win', 'POST-GAME SHOW', 'Result: regular win', 'Winner by two in regulation (team name first).');
M('post_win', 1, '{winner.nick} take care of business.', 'Say only the words after the team name.');
M('post_win', 2, '{winner.nick} come away with the win.', 'Say only the words after the team name.');
cat('post_shutout', 'POST-GAME SHOW', 'Result: shutout', 'Loser scored zero (team name first).');
M('post_shutout', 1, '{winner.nick} pitch a shutout.', 'Say only the words after the team name.');
M('post_shutout', 2, '{winner.nick} keep the opposition off the board entirely.', 'Say only the words after the team name.');
cat('post_ot', 'POST-GAME SHOW', 'Result: overtime', 'Won in overtime (team name first).');
M('post_ot', 1, '{winner.nick} win it in overtime.', 'Say only the words after the team name.');
M('post_ot', 2, '{winner.nick} survive in extra time.', 'Say only the words after the team name.');
cat('post_so', 'POST-GAME SHOW', 'Result: shootout', 'Won in a shootout (team name first).');
M('post_so', 1, '{winner.nick} take it in the shootout.', 'Say only the words after the team name.');
cat('post_comeback', 'POST-GAME SHOW', 'Result: comeback', 'Winner trailed after two periods (team name first).');
M('post_comeback', 1, '{winner.nick} storm back to win it.', 'Say only the words after the team name.');
M('post_comeback', 2, '{winner.nick} were down after two, and they found a way.', 'Say only the words after the team name.');
cat('post_upset', 'POST-GAME SHOW', 'Result: upset', 'Lower-rated team wins (team name first).');
M('post_upset', 1, '{winner.nick} pull off the upset.', 'Say only the words after the team name.');

cat('post_stars', 'POST-GAME SHOW', 'Three stars intro', 'Shown with the three stars card.');
M('post_stars', 1, "Tonight's three stars are up on your screen.", '');
M('post_stars', 2, "Let's hand out the hardware. Your three stars of the game.", '');

cat('post_e_shots', 'POST-GAME SHOW', 'Eddie: outshot them', 'Winner had many more shots.');
E('post_e_shots', 1, "They threw everything at the net tonight, Mick. Eventually the dam breaks.", '');
E('post_e_shots', 2, 'Shot totals tell the story. They spent the whole night in the other end.', '');
cat('post_e_goalie', 'POST-GAME SHOW', 'Eddie: goalie stole it', 'Winner was outshot clearly.');
E('post_e_goalie', 1, 'Their goalie stole one tonight. Plain and simple.', '');
E('post_e_goalie', 2, "They got outplayed for long stretches, but the goalie said 'not tonight.'", '');
cat('post_e_pp', 'POST-GAME SHOW', 'Eddie: special teams', '2+ power-play goals in the game.');
E('post_e_pp', 1, 'Special teams were the difference. Take penalties against good teams and you pay.', '');
cat('post_e_physical', 'POST-GAME SHOW', 'Eddie: physical game', 'Lots of hits.');
E('post_e_physical', 1, "That was a heavyweight fight out there. Both teams are gonna need the ice packs.", '');
cat('post_e_faceoff', 'POST-GAME SHOW', 'Eddie: faceoffs', 'Winner dominated faceoffs.');
E('post_e_faceoff', 1, 'They owned the faceoff dot tonight. You start with the puck, you play with the puck.', '');
cat('post_e_generic', 'POST-GAME SHOW', 'Eddie: general takeaway', 'Fallback analysis.');
E('post_e_generic', 1, "Good hockey game, Mick. The winners just made one or two more plays when it mattered.", '');
E('post_e_generic', 2, 'Hard-fought from start to finish. Both teams should be proud of the effort.', '');
E('post_e_generic', 2, "Little details win hockey games. A blocked shot here, a good change there.", '');

cat('post_points', 'POST-GAME SHOW', 'Implication: points', 'Regular season, no streak story.');
M('post_points', 1, 'Two big points in the standings tonight.', '');
M('post_points', 2, "Every point matters, and the standings will look a little different in the morning.", '');
cat('post_streak', 'POST-GAME SHOW', 'Implication: winning streak', 'Winner has won 3+ straight (team name first).');
M('post_streak', 1, '{winner.nick} have won three in a row, at least.', 'Say only the words after the team name.');
cat('post_exhib', 'POST-GAME SHOW', 'Implication: exhibition', 'Exhibition game.');
M('post_exhib', 1, "Just an exhibition, but you'd never know it from the way they played.", '');
cat('post_series_lead', 'POST-GAME SHOW', 'Series: takes the lead', 'Playoffs, series continues with a leader (team name first).');
M('post_series_lead', 1, '{lead.nick} take control of the series.', 'Say only the words after the team name.');
M('post_series_lead', 2, '{lead.nick} are in the driver\'s seat in this series.', 'Say only the words after the team name.');
cat('post_series_tied', 'POST-GAME SHOW', 'Series: tied', 'Playoffs, series now tied.');
M('post_series_tied', 1, 'And this series is all tied up.', '');
cat('post_advance', 'POST-GAME SHOW', 'Series: advances', 'Winner wins the series (team name first).');
M('post_advance', 1, '{winner.nick} are moving on!', 'Say only the words after the team name.');
M('post_advance', 2, '{winner.nick} punch their ticket to the next round.', 'Say only the words after the team name.');
cat('post_e_elim', 'POST-GAME SHOW', 'Eddie: eliminated', 'Loser is knocked out of the playoffs.');
E('post_e_elim', 1, "Tough way for a season to end. You feel for those guys in the other room.", '');
E('post_e_elim', 2, 'Somebody always has to go home. Hurts every time.', '');
cat('post_champ', 'POST-GAME SHOW', 'Silver Cup champions', 'Winner wins the Cup final (team name first).');
M('post_champ', 1, '{winner.nick} are your Silver Cup champions!', 'Say only the words after the team name. Biggest read in the script.');
cat('post_e_champ', 'POST-GAME SHOW', 'Eddie: champions', 'After the champions call.');
E('post_e_champ', 1, "Mick, there's no better feeling in the world. They'll remember this night forever.", 'Emotional.');

cat('post_around', 'POST-GAME SHOW', 'Around the league', 'Shown with the other scores.');
M('post_around', 1, "Let's take a look around the league tonight.", '');
M('post_around', 2, 'Elsewhere around the league...', '');
cat('post_signoff', 'POST-GAME SHOW', 'Sign-off (Mick)', 'Mick closes the show.');
M('post_signoff', 1, "That'll do it for us tonight. For Eddie O'Shea, I'm Mick Embers. Good night, everybody.", '');
M('post_signoff', 2, "Thanks for spending the evening with us. We'll see you next time on Top Shelf Hockey.", '');
cat('post_e_signoff', 'POST-GAME SHOW', 'Sign-off (Eddie)', 'Eddie closes the show.');
E('post_e_signoff', 1, 'Good night, everybody. Drive safe.', '');
E('post_e_signoff', 2, "See ya next time, folks. Get some sleep. I won't.", '');

// ======================================================================== TEAM NAMES
cat('team_city', 'TEAM NAMES', 'Team city names', 'Spliced into calls, e.g. "[Saltmarsh] strikes first!"');
cat('team_nick', 'TEAM NAMES', 'Team nicknames', 'Spliced into show lines, e.g. "[the Narwhals] are in town tonight."');
for (const t of TEAMS) {
  LINES.push({ id: teamClipId(t.id, false), who: 'mick', cat: 'team_city', tier: 1, text: t.city, note: 'Clear and punchy, like the start of a sentence.', parts: [t.city] });
  LINES.push({ id: teamClipId(t.id, true), who: 'mick', cat: 'team_nick', tier: 1, text: `the ${t.name}`, note: 'Say "the" lightly, stress the nickname.', parts: [`the ${t.name}`] });
}

export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const linesIn = (c) => LINES.filter((l) => l.cat === c);
