// GM screens: manage team hub, line editor, roster & contracts, trades, free agents,
// and the off-season (re-sign, entry draft, free agency, start next season).
import { TEAMS, PERKS } from '/shared/teams.js';
import * as L from '/shared/league.js';
import * as gm from '/shared/gm.js';

const T = (id) => TEAMS[id];
const POS_GROUPS = [['ALL', 'ALL'], ['F', 'FORWARDS'], ['D', 'DEFENSE'], ['G', 'GOALIES']];

/** h: { A, render, screen, win, btn, mi, esc, crest, persist, league: () => lg, seasonScreen } */
export function createGM(h) {
  const st = {
    sel: null,              // lines editor: selected slot key
    msg: '',
    trade: { partner: null, aPlayers: [], bPlayers: [], aPicks: [], bPicks: [] },
    faFilter: 'ALL',
    confirmRelease: null,
  };
  const lg = () => h.league();
  const me = () => lg().teams[lg().userTeam];
  const P = (team, id) => team.roster.find((p) => p.id === id);
  const back = () => { st.msg = ''; h.screen(h.seasonScreen); };
  const note = () => (st.msg ? `<p class="notice">${h.esc(st.msg)}</p>` : '');
  const say = (m) => { st.msg = m; h.persist(); h.render(); };

  // ------------------------------------------------------------ shared bits

  function capBar(team = me()) {
    const pay = gm.payroll(team), cap = lg().cap || gm.CAP;
    const pct = Math.min(100, Math.round((pay / cap) * 100));
    const c = gm.counts(team.roster);
    const inj = team.roster.filter((p) => p.inj).length;
    return `<div class="capbar"><div class="capfill ${pay > cap ? 'over' : ''}" style="width:${pct}%"></div></div>
      <div class="capline"><span>PAYROLL <b>${gm.money(pay)}</b></span><span>CAP ${gm.money(cap)}</span><span>ROOM <b class="${pay > cap ? 'bad' : 'good'}">${gm.money(cap - pay)}</b></span>
      <span>ROSTER <b>${team.roster.length}</b> (${c.F}F ${c.D}D ${c.G}G)</span>${team.dead ? `<span>DEAD ${gm.money(team.dead)}</span>` : ''}${inj ? `<span class="bad">${inj} INJURED</span>` : ''}</div>`;
  }

  const pl = (p, extra = '') => `#${p.num} ${h.esc(p.first[0])}. ${h.esc(p.name).toUpperCase()} <i>${p.pos} ${L.ovr(p)}</i>${p.inj ? ` <em class="inj">INJ ${p.inj}</em>` : ''}${extra}`;

  // ------------------------------------------------------------ manage team hub

  function hubScreen() {
    const team = me(), l = lg();
    const items = [
      h.mi('gmLines', 'LINES', 'SET YOUR LINES AND STARTING GOALIE'),
      h.mi('gmRoster', 'ROSTER & CONTRACTS', 'SALARIES, POTENTIAL, RELEASE PLAYERS'),
      h.mi('gmTrades', 'TRADES', gm.tradesOpen(l) ? 'DEAL WITH THE OTHER 31 CLUBS' : 'CLOSED UNTIL THE OFF-SEASON'),
      h.mi('gmFA', 'FREE AGENTS', `${l.freeAgents.length} PLAYERS AVAILABLE`),
    ];
    const injured = team.roster.filter((p) => p.inj);
    return {
      html: `
        <header class="topbar"><h1>MANAGE TEAM</h1><span>${h.esc(T(l.userTeam).fullName).toUpperCase()} · GENERAL MANAGER</span></header>
        ${note()}
        <div class="cols">
          ${h.win('FRONT OFFICE', `<div class="menu-list">${items.join('')}</div>`)}
          ${h.win('CAP SHEET', `${capBar()}
            ${injured.length ? `<div class="pv-label">INJURED</div>${injured.map((p) => `<div class="gm-row">${pl(p)}</div>`).join('')}` : '<p class="note">Everyone is healthy.</p>'}
            ${gm.tradesOpen(l) ? '' : '<p class="note">The trade deadline has passed. Trades reopen in the off-season.</p>'}`)}
        </div>
        <div class="btnrow">${h.btn('gmBack', 'BACK', '', 'default')}</div>`,
      back,
    };
  }

  // ------------------------------------------------------------ lines editor

  function slotKeys(lines) { // eslint-disable-line no-unused-vars
    const k = [];
    lines.F.forEach((l, i) => l.forEach((_, j) => k.push(`F-${i}-${j}`)));
    lines.D.forEach((l, i) => l.forEach((_, j) => k.push(`D-${i}-${j}`)));
    lines.G.forEach((_, i) => k.push(`G-${i}`));
    return k;
  }
  const getSlot = (lines, key) => { const [g, i, j] = key.split('-'); return g === 'G' ? lines.G[+i] : lines[g][+i][+j]; };
  const setSlot = (lines, key, id) => { const [g, i, j] = key.split('-'); if (g === 'G') lines.G[+i] = id; else lines[g][+i][+j] = id; };
  const ROLE = { F: ['C', 'LW', 'RW'], D: ['LD', 'RD'] };

  function linesScreen() {
    const team = me();
    gm.repairLines(team);
    const lines = team.lines;
    const inLines = new Set(gm.lineIds(lines));
    const slot = (key) => {
      const p = P(team, getSlot(lines, key));
      const [g, , j] = key.split('-');
      const role = g === 'G' ? (key.endsWith('0') ? 'G1' : 'G2') : ROLE[g][+j];
      const off = p && ((g === 'F' && !gm.isF(p)) || (g === 'D' && p.pos !== 'D'));
      return `<button class="slotbtn ${st.sel === key ? 'sel' : ''}" data-act="gmSlot" data-k="${key}"><em>${role}</em>${p ? pl(p, off ? ' <b class="bad">⚠</b>' : '') : '—'}</button>`;
    };
    const extras = team.roster.filter((p) => !inLines.has(p.id)).sort((a, b) => L.ovr(b) - L.ovr(a));
    const help = st.sel ? 'Now pick the player or slot to swap with.' : 'Pick a slot, then pick who goes there.';
    return {
      html: `
        <header class="topbar"><h1>LINES</h1><span>${h.esc(help).toUpperCase()}</span></header>
        ${note()}
        <div class="cols">
          ${h.win('FORWARD LINES', lines.F.map((l, i) => `<div class="lrow"><span>F${i + 1}</span>${l.map((_, j) => slot(`F-${i}-${j}`)).join('')}</div>`).join(''))}
          <div>
            ${h.win('DEFENSE PAIRS', lines.D.map((l, i) => `<div class="lrow"><span>D${i + 1}</span>${l.map((_, j) => slot(`D-${i}-${j}`)).join('')}</div>`).join(''))}
            ${h.win('GOALIES', `<div class="lrow g">${slot('G-0')}${slot('G-1')}</div>`)}
          </div>
        </div>
        ${h.win('SCRATCHES & INJURED', extras.length ? `<div class="extras">${extras.map((p) => `<button class="slotbtn ${st.sel === 'B-' + p.id ? 'sel' : ''}" data-act="gmSlot" data-k="B-${p.id}">${pl(p)}</button>`).join('')}</div>` : '<p class="note">No extra players. Sign or trade for depth.</p>')}
        <p class="note">F1 and D1 also form your power-play unit. Injured players in your lines are replaced automatically on game day by the best healthy extra.</p>
        <div class="btnrow">${h.btn('gmAutoLines', 'AUTO SET LINES', '', 'red')}${h.btn('gmHub', 'DONE', '', 'default')}</div>`,
      back: () => (st.sel ? (st.sel = null, h.render()) : h.screen(hubScreen)),
    };
  }

  function swap(a, b) {
    const team = me(), lines = team.lines;
    if (a.startsWith('B-') && b.startsWith('B-')) return;
    const idOf = (k) => (k.startsWith('B-') ? k.slice(2) : getSlot(lines, k));
    const ia = idOf(a), ib = idOf(b);
    const pa = P(team, ia), pb = P(team, ib);
    // slot a receives pb, slot b receives pa; goalies only in goalie slots and vice versa
    const fits = (key, p) => key.startsWith('B-') || (key.startsWith('G-') ? p.pos === 'G' : p.pos !== 'G');
    if (!fits(a, pb) || !fits(b, pa)) { st.msg = 'Goalies only go in goalie slots.'; return; }
    if (!a.startsWith('B-')) setSlot(lines, a, ib);
    if (!b.startsWith('B-')) setSlot(lines, b, ia);
    st.msg = '';
  }

  // ------------------------------------------------------------ roster & contracts

  function rosterScreen() {
    const team = me();
    const order = { C: 0, LW: 1, RW: 2, D: 3, G: 4 };
    const rows = team.roster.slice().sort((a, b) => order[a.pos] - order[b.pos] || L.ovr(b) - L.ovr(a));
    return {
      html: `
        <header class="topbar"><h1>ROSTER & CONTRACTS</h1><span>${h.esc(T(lg().userTeam).fullName).toUpperCase()}</span></header>
        ${note()}
        ${h.win('CAP SHEET', capBar())}
        ${h.win('PLAYERS', `<div class="scroll"><table class="tbl">
          <tr><th class="col-opt">#</th><th class="l">NAME</th><th>POS</th><th>AGE</th><th>OVR</th><th>POT</th><th>SALARY</th><th>YRS</th><th class="col-opt">GP</th><th class="col-opt">PTS</th><th></th></tr>
          ${rows.map((p) => `<tr><td class="col-opt">${p.num}</td><td class="l">${h.esc(p.first[0])}. ${h.esc(p.name).toUpperCase()}${p.inj ? ` <em class="inj">INJ ${p.inj}</em>` : ''}</td><td>${p.pos}</td><td>${p.age}</td><td><b>${L.ovr(p)}</b></td><td>${gm.potGrade(p)}</td>
            <td>${gm.money(p.contract.sal)}</td><td>${p.contract.yrs}</td><td class="col-opt">${p.s.gp}</td><td class="col-opt">${p.pos === 'G' ? '-' : p.s.g + p.s.a}</td>
            <td>${st.confirmRelease === p.id ? h.btn('gmRelease', `CONFIRM (${gm.money(gm.releaseCost(p))} DEAD)`, `data-id="${p.id}"`, 'mini red') : h.btn('gmReleaseAsk', 'RELEASE', `data-id="${p.id}"`, 'mini')}</td></tr>`).join('')}
        </table></div>
        <p class="note">Releasing a player leaves a third of his salary on your cap for the rest of the season. POT is your scouts' grade of how good he can become.</p>`)}
        <div class="btnrow">${h.btn('gmHub', 'BACK', '', 'default')}</div>`,
      back: () => h.screen(hubScreen),
    };
  }

  // ------------------------------------------------------------ trades

  function offer() {
    const t = st.trade;
    return { a: lg().userTeam, b: t.partner, aPlayers: t.aPlayers, bPlayers: t.bPlayers, aPicks: t.aPicks, bPicks: t.bPicks };
  }

  function tradeScreen() {
    const l = lg(), team = me();
    if (st.trade.partner == null) st.trade.partner = (l.userTeam + 1) % 32;
    const other = l.teams[st.trade.partner];
    const t = st.trade;
    const open = gm.tradesOpen(l);
    const side = (tm, list, pickList, who) => {
      const players = tm.roster.slice().sort((a, b) => gm.playerValue(b) - gm.playerValue(a)).map((p) => {
        const on = list.includes(p.id);
        return `<button class="pick ${on ? 'on' : ''}" data-act="gmToggle" data-who="${who}" data-id="${p.id}">${on ? '✔' : '·'} ${pl(p)} <span class="sal">${gm.money(p.contract.sal)}×${p.contract.yrs}</span></button>`;
      });
      const picks = l.picks.filter((k) => k.owner === tm.id).map((k) => {
        const key = gm.pickKey(k), on = pickList.includes(key);
        return `<button class="pick ${on ? 'on' : ''}" data-act="gmTogglePick" data-who="${who}" data-id="${key}">${on ? '✔' : '·'} PICK ${gm.pickLabel(k)}</button>`;
      });
      return `<div class="picklist">${players.join('')}${picks.join('')}</div>`;
    };
    const ev = gm.evaluateTrade(l, offer());
    const anything = t.aPlayers.length + t.bPlayers.length + t.aPicks.length + t.bPicks.length > 0;
    const capAfter = (tm, out, inn) => gm.payroll(tm) - tm.roster.filter((p) => out.includes(p.id)).reduce((s, p) => s + p.contract.sal, 0) + inn.reduce((s, id) => s + (l.teams.flatMap((x) => x.roster).find((p) => p.id === id)?.contract.sal || 0), 0);
    return {
      html: `
        <header class="topbar"><h1>TRADES</h1><span>${open ? 'PICK PLAYERS AND PICKS FROM BOTH SIDES, THEN PROPOSE' : 'TRADES ARE CLOSED RIGHT NOW'}</span></header>
        ${note()}
        ${h.win('', `<button class="opt" data-act="gmPartner" data-d="1" data-left="gmPartnerBack" data-right="gmPartner"><span class="ol">TRADING WITH</span><span class="ov"><i>◀</i> ${h.esc(T(other.id).fullName).toUpperCase()} <i>▶</i></span></button>
          <p class="note">${T(other.id).abbr}: ${other.rec.w}-${other.rec.l}-${other.rec.otl} · ${gm.money(gm.capRoom(l, other))} cap room · ${other.roster.length} players · SPECIALTY ${PERKS[T(other.id).perk].name.toUpperCase()}</p>`)}
        <div class="cols">
          ${h.win(`YOU GIVE · ${T(l.userTeam).abbr}`, side(team, t.aPlayers, t.aPicks, 'a'))}
          ${h.win(`YOU GET · ${T(other.id).abbr}`, side(other, t.bPlayers, t.bPicks, 'b'))}
        </div>
        ${h.win('THE DEAL', (anything ? `
          <div class="capline"><span>VALUE YOU SEND <b>${ev.get}</b></span><span>VALUE YOU GET <b>${ev.give}</b></span>
          <span>YOUR PAYROLL AFTER <b>${gm.money(capAfter(team, t.aPlayers, t.bPlayers))}</b></span><span>THEIRS <b>${gm.money(capAfter(other, t.bPlayers, t.aPlayers))}</b></span></div>
          <p class="${ev.ok ? 'good' : 'bad'}">${ev.ok ? 'They would accept this deal.' : h.esc(ev.reason)}</p>` : '<p class="note">Nothing selected yet.</p>') + `
          <div class="btnrow">${h.btn('gmPropose', 'PROPOSE TRADE', open && anything ? '' : 'disabled', 'red')}${h.btn('gmSuggest', 'WHAT DO THEY WANT?', open && anything ? '' : 'disabled')}${h.btn('gmClear', 'CLEAR')}${h.btn('gmHub', 'BACK', '', 'default')}</div>`)}`,
      back: () => h.screen(hubScreen),
    };
  }

  // ------------------------------------------------------------ free agents

  function faScreen() {
    const l = lg(), team = me();
    const list = l.freeAgents.filter((p) => st.faFilter === 'ALL' || gm.group(p) === st.faFilter).sort((a, b) => L.ovr(b) - L.ovr(a));
    const fi = POS_GROUPS.findIndex((x) => x[0] === st.faFilter);
    return {
      html: `
        <header class="topbar"><h1>FREE AGENTS</h1><span>${gm.money(gm.capRoom(l, team))} CAP ROOM · ${team.roster.length} ON ROSTER</span></header>
        ${note()}
        ${needs()}
        ${h.win('', `${capBar()}<button class="opt" data-act="gmFAFilter" data-d="1" data-left="gmFAFilterBack" data-right="gmFAFilter"><span class="ol">SHOW</span><span class="ov"><i>◀</i> ${POS_GROUPS[fi][1]} <i>▶</i></span></button>`)}
        ${h.win('AVAILABLE', list.length ? `<div class="scroll"><table class="tbl">
          <tr><th class="l">NAME</th><th>POS</th><th>AGE</th><th>OVR</th><th>POT</th><th>ASKING</th><th></th></tr>
          ${list.slice(0, 40).map((p) => `<tr><td class="l">${h.esc(p.first[0])}. ${h.esc(p.name).toUpperCase()}</td><td>${p.pos}</td><td>${p.age}</td><td><b>${L.ovr(p)}</b></td><td>${gm.potGrade(p)}</td><td>${gm.money(p.ask.sal)} × ${p.ask.yrs}</td>
            <td>${h.btn('gmSign', 'SIGN', `data-id="${p.id}"`, 'mini red')} ${h.btn('gmLowball', 'OFFER 85%', `data-id="${p.id}"`, 'mini')}</td></tr>`).join('')}
        </table></div>` : '<p class="note">Nobody available at that position.</p>')}
        <div class="btnrow">${h.btn('gmFill', 'FILL ROSTER', '', 'red')}${l.phase === 'offseason' ? h.btn('gmNextSeason', 'START NEXT SEASON ▶', '', 'red') : ''}${h.btn('gmHubOrSeason', 'BACK', '', 'default')}</div>`,
      back: () => A.gmHubOrSeason(),
    };
  }

  // What the user's roster is missing (shown in free agency).
  function needs() {
    const team = me(), c = gm.counts(team.roster);
    const miss = ['G', 'D', 'F'].filter((k) => c[k] < gm.MIN_POS[k]).map((k) => `${gm.MIN_POS[k] - c[k]} ${{ G: 'GOALIE', D: 'DEFENSEMAN', F: 'FORWARD' }[k]}${gm.MIN_POS[k] - c[k] > 1 ? 'S' : ''}`);
    if (team.roster.length < gm.ROSTER_MIN) miss.push(`${gm.ROSTER_MIN - team.roster.length} MORE PLAYERS IN TOTAL`);
    const over = team.roster.length > gm.ROSTER_MAX && lg().phase === 'offseason' ? `<p class="note">You have ${team.roster.length} players. Release down to ${gm.ROSTER_MAX} before the season starts.</p>` : '';
    return miss.length || over ? h.win('ROSTER NEEDS', `${miss.length ? `<p class="bad">YOU NEED: ${miss.join(' · ')}</p><p class="note">Sign players below, or press FILL ROSTER to sign the best affordable fits (and call up minimum-salary players from the minors if needed).</p>` : ''}${over}`) : '';
  }

  // ------------------------------------------------------------ off-season

  function resignScreen() {
    const l = lg(), team = me(), off = l.offseason;
    const rows = off.expiring.map((id) => P(team, id)).filter(Boolean);
    return {
      html: `
        <header class="topbar"><h1>RE-SIGN PLAYERS</h1><span>OFF-SEASON STEP 1 OF 3</span></header>
        ${note()}
        ${h.win('CAP SHEET', `${capBar()}<p class="note">If you let everyone listed below go, you'll have ${team.roster.length - rows.length} players under contract. You need at least ${gm.ROSTER_MIN} (2 G, 6 D, 12 F) to start the season. Free agency and FILL ROSTER come after the draft.</p>`)}
        ${h.win('EXPIRING CONTRACTS', rows.length ? `<div class="scroll"><table class="tbl">
          <tr><th class="l">NAME</th><th>POS</th><th>AGE</th><th>OVR</th><th>POT</th><th class="col-opt">OLD DEAL</th><th>ASKING</th><th></th></tr>
          ${rows.map((p) => `<tr><td class="l">${h.esc(p.first[0])}. ${h.esc(p.name).toUpperCase()}</td><td>${p.pos}</td><td>${p.age}</td><td><b>${L.ovr(p)}</b></td><td>${gm.potGrade(p)}</td><td class="col-opt">${gm.money(p.contract.sal)}</td><td>${gm.money(p.ask.sal)} × ${p.ask.yrs}</td>
            <td>${h.btn('gmResign', 'RE-SIGN', `data-id="${p.id}"`, 'mini red')} ${h.btn('gmLetGo', 'LET GO', `data-id="${p.id}"`, 'mini')}</td></tr>`).join('')}
        </table></div>` : '<p class="note">No more decisions. Anyone you let go becomes a free agent.</p>')}
        <div class="btnrow">${h.btn('gmFinishResign', rows.length ? 'LET THE REST GO & GO TO THE DRAFT ▶' : 'GO TO THE DRAFT ▶', '', 'red default')}${h.btn('gmBack', 'BACK')}</div>`,
      back,
    };
  }

  function draftScreen() {
    const l = lg(), off = l.offseason;
    const slot = gm.currentPick(l);
    const mine = slot && slot.owner === l.userTeam;
    const myPicks = off.order.map((o, i) => ({ ...o, n: i + 1 })).filter((o) => o.owner === l.userTeam);
    const board = off.pool.slice(0, 30).map((p, i) => `<tr><td>${i + 1}</td><td class="l">${h.esc(p.first[0])}. ${h.esc(p.name).toUpperCase()}</td><td>${p.pos}</td><td>${p.age}</td><td>${L.ovr(p)}</td><td><b>${gm.potGrade(p)}</b></td>
      <td>${mine ? h.btn('gmDraft', 'DRAFT', `data-id="${p.id}"`, 'mini red') : ''}</td></tr>`).join('');
    const status = off.step !== 'draft' ? 'THE DRAFT IS COMPLETE'
      : `ROUND ${slot.round} · PICK ${off.slot + 1} OF ${off.order.length} · ${T(slot.owner).abbr} ${mine ? '(YOU) ARE' : 'IS'} ON THE CLOCK`;
    return {
      html: `
        <header class="topbar"><h1>ENTRY DRAFT</h1><span>${status}</span></header>
        ${note()}
        <div class="cols">
          ${h.win('BIG BOARD', `<div class="scroll"><table class="tbl"><tr><th>RK</th><th class="l">PROSPECT</th><th>POS</th><th>AGE</th><th>OVR</th><th>POT</th><th></th></tr>${board}</table></div>`)}
          <div>
            ${h.win('YOUR PICKS', myPicks.length ? myPicks.map((o) => `<div class="gm-row">R${o.round} #${o.n} ${o.pid ? `→ ${h.esc(o.name || '').toUpperCase()} (${o.pos})` : '<i>TO COME</i>'}</div>`).join('') : '<p class="note">You traded away your picks this year.</p>')}
            ${h.win('LATEST PICKS', off.log.slice(0, 10).map((x) => `<div class="gm-row">${h.esc(x)}</div>`).join('') || '<p class="note">The draft is about to begin.</p>')}
          </div>
        </div>
        <div class="btnrow">
          ${off.step === 'draft' && !mine ? h.btn('gmSimDraft', 'SIM TO MY PICK', '', 'red default') : ''}
          ${off.step === 'draft' ? h.btn('gmAutoDraft', 'AUTO-DRAFT THE REST') : h.btn('gmToFA', 'GO TO FREE AGENCY ▶', '', 'red default')}
          ${h.btn('gmBack', 'BACK')}
        </div>
        <p class="note">POT is your scouts' grade of each prospect's ceiling. They're not always right. Draftees sign 3-year entry deals at ${gm.money(gm.ENTRY.sal)}.</p>`,
      back,
    };
  }

  // ------------------------------------------------------------ actions

  const A = h.A;
  Object.assign(A, {
    gmHub: () => { st.msg = ''; st.sel = null; st.confirmRelease = null; h.screen(hubScreen); },
    gmBack: back,
    gmHubOrSeason: () => (lg().phase === 'offseason' ? back() : A.gmHub()),
    gmLines: () => { st.sel = null; st.msg = ''; h.screen(linesScreen); },
    gmSlot: (d) => {
      if (!st.sel) { st.sel = d.k; h.render(); return; }
      if (st.sel === d.k) { st.sel = null; h.render(); return; }
      swap(st.sel, d.k);
      st.sel = null;
      h.persist();
      h.render();
    },
    gmAutoLines: () => { me().lines = gm.autoLines(me().roster); st.sel = null; say('Lines set by rating.'); },
    gmRoster: () => { st.msg = ''; st.confirmRelease = null; h.screen(rosterScreen); },
    gmReleaseAsk: (d) => { st.confirmRelease = d.id; h.render(); },
    gmRelease: (d) => { st.confirmRelease = null; const r = gm.releasePlayer(lg(), lg().userTeam, d.id); say(r.reason); },
    gmTrades: () => { st.msg = ''; h.screen(tradeScreen); },
    gmPartner: () => stepPartner(1),
    gmPartnerBack: () => stepPartner(-1),
    gmToggle: (d) => { const k = d.who === 'a' ? 'aPlayers' : 'bPlayers'; toggle(st.trade[k], d.id); st.msg = ''; h.render(); },
    gmTogglePick: (d) => { const k = d.who === 'a' ? 'aPicks' : 'bPicks'; toggle(st.trade[k], d.id); st.msg = ''; h.render(); },
    gmClear: () => { Object.assign(st.trade, { aPlayers: [], bPlayers: [], aPicks: [], bPicks: [] }); st.msg = ''; h.render(); },
    gmPropose: () => {
      const o = offer(), ev = gm.evaluateTrade(lg(), o);
      if (!ev.ok) { say(`REJECTED: ${ev.reason}`); return; }
      gm.executeTrade(lg(), o);
      const l = lg();
      l.news.unshift({ year: l.year, day: l.day, text: `TRADE: ${T(o.a).city} and ${T(o.b).city} complete a deal.` });
      A.gmClear();
      say('ACCEPTED! The trade is done.');
    },
    gmSuggest: () => {
      const s = gm.suggestAdd(lg(), offer());
      say(s ? `They'd do it if you add ${s.label}.` : "They aren't interested in anything you could add.");
    },
    gmFA: () => { st.msg = ''; h.screen(faScreen); },
    gmFAFilter: () => { st.faFilter = POS_GROUPS[(POS_GROUPS.findIndex((x) => x[0] === st.faFilter) + 1) % 4][0]; h.render(); },
    gmFAFilterBack: () => { st.faFilter = POS_GROUPS[(POS_GROUPS.findIndex((x) => x[0] === st.faFilter) + 3) % 4][0]; h.render(); },
    gmSign: (d) => say(gm.signFreeAgent(lg(), lg().userTeam, d.id).reason),
    gmFill: () => { const s2 = gm.autoFill(lg(), lg().userTeam); say(s2.length ? `Signed: ${s2.join(', ')}.` : 'Your roster already meets the minimums.'); },
    gmLowball: (d) => {
      const p = lg().freeAgents.find((x) => x.id === d.id);
      if (p) say(gm.signFreeAgent(lg(), lg().userTeam, d.id, Math.round(p.ask.sal * 85) / 100).reason);
    },
    gmStartOffseason: () => { L.startOffseason(lg()); h.persist(); st.msg = ''; h.screen(resignScreen); },
    gmResignScreen: () => { st.msg = ''; h.screen(resignScreen); },
    gmResign: (d) => say(gm.resignPlayer(lg(), d.id).reason),
    gmLetGo: (d) => { gm.letGo(lg(), d.id); say('He becomes a free agent.'); },
    gmFinishResign: () => { gm.finishResign(lg()); h.persist(); st.msg = ''; h.screen(draftScreen); },
    gmDraftScreen: () => { st.msg = ''; h.screen(draftScreen); },
    gmDraft: (d) => { const p = gm.draftPlayer(lg(), d.id); h.persist(); say(p ? `You select ${p.first} ${p.name}!` : ''); },
    gmSimDraft: () => { gm.simDraft(lg()); h.persist(); st.msg = ''; h.render(); },
    gmAutoDraft: () => { gm.simDraft(lg(), true); h.persist(); say('Draft complete.'); },
    gmToFA: () => { gm.openFreeAgency(lg()); h.persist(); st.msg = ''; h.screen(faScreen); },
    gmNextSeason: () => {
      const r = L.finishOffseason(lg());
      h.persist();
      if (!r.ok) { st.msg = r.reason; h.screen(faScreen); return; }
      st.msg = '';
      h.screen(h.seasonScreen);
    },
  });

  function toggle(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); }
  function stepPartner(d) {
    const l = lg();
    let p = st.trade.partner;
    do { p = (p + d + 32) % 32; } while (p === l.userTeam);
    st.trade = { partner: p, aPlayers: st.trade.aPlayers, bPlayers: [], aPicks: st.trade.aPicks, bPicks: [] };
    st.msg = '';
    h.render();
  }

  // Season-menu preview text for the GM item.
  function preview() {
    const team = me();
    return `<div class="pv-label">FRONT OFFICE</div>${capBar(team)}<p class="note">Lines, contracts, trades and free agents.</p>`;
  }

  return { hubScreen, linesScreen, rosterScreen, tradeScreen, faScreen, resignScreen, draftScreen, preview, capBar };
}
