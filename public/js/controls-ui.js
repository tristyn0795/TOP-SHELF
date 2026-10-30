// OPTIONS -> CONTROLS: rebind every action for single player, couch P1 / P2, and gamepads.
import { ACTIONS_ALL, PAD_ACTIONS, getBinds, setKey, setPad, resetBinds, keyLabel, padLabel, captureKey, capturePad } from './input.js';

const PAGES = [
  ['solo', 'SINGLE PLAYER', 'Used whenever one person plays (season, exhibition vs CPU, online).'],
  ['p1', 'PLAYER 1 (COUCH)', 'Two players on one keyboard: the player on the left.'],
  ['p2', 'PLAYER 2 (COUCH)', 'Two players on one keyboard: the player on the right.'],
  ['pad', 'GAMEPAD', 'Buttons for any connected controller. The left stick and d-pad always skate.'],
];

/** h: { A, render, screen, win, btn, esc, back, setCapturing(bool) } */
export function createControls(h) {
  const st = { page: 0, capturing: null, msg: '' };

  function screen() {
    const [scheme, title, desc] = PAGES[st.page];
    const b = getBinds();
    const cap = st.capturing;
    const cell = (action, slot) => {
      const on = cap && cap.action === action && cap.slot === slot;
      const label = scheme === 'pad' ? (b.pad[action].length ? b.pad[action].map(padLabel).join(' / ') : '—') : keyLabel(b[scheme][action][slot]);
      return h.btn('ctlBind', on ? '<span class="blink">PRESS…</span>' : h.esc(label), `data-action="${action}" data-slot="${slot}"`, `keycap ${on ? 'red' : ''}`);
    };
    const rows = (scheme === 'pad' ? PAD_ACTIONS : ACTIONS_ALL).map(([a, l]) =>
      `<tr><td class="l">${l}</td><td>${cell(a, 0)}</td>${scheme === 'pad' ? '' : `<td>${cell(a, 1)}</td>`}</tr>`).join('');
    return {
      html: `
        <header class="topbar"><h1>CONTROLS</h1><span>${cap ? (scheme === 'pad' ? 'PRESS A BUTTON ON YOUR CONTROLLER · ESC CANCELS' : 'PRESS A KEY · ESC CANCELS · BACKSPACE CLEARS') : 'PICK A SLOT AND PRESS THE NEW KEY'}</span></header>
        <section class="win pager">
          <h2 class="pager-h">${h.btn('ctlPage', '◀', 'data-d="-1"', 'mini')}<span>${title}</span><small>${st.page + 1}/${PAGES.length}</small>${h.btn('ctlPage', '▶', 'data-d="1"', 'mini')}</h2>
          <p class="note">${h.esc(desc)}</p>
          ${st.msg ? `<p class="notice">${h.esc(st.msg)}</p>` : ''}
          <table class="tbl keys ctl"><tr><th class="l">ACTION</th><th>${scheme === 'pad' ? 'BUTTON' : 'KEY 1'}</th>${scheme === 'pad' ? '' : '<th>KEY 2</th>'}</tr>${rows}</table>
          <p class="note">A key can only do one job: binding it here moves it off any other action on this page. Esc always pauses a game, and menus always use the arrows, Enter and Esc, so you can't lock yourself out.</p>
        </section>
        <div class="btnrow">${h.btn('ctlReset', 'RESET THIS PAGE', '', 'red')}${h.btn('ctlResetAll', 'RESET ALL')}${h.btn('ctlBack', 'BACK', '', 'default')}</div>`,
      back: () => { if (!st.capturing) h.back(); },
      page: (d) => { if (!st.capturing) { st.page = (st.page + d + PAGES.length) % PAGES.length; st.msg = ''; h.render(); } },
    };
  }

  async function bind(d) {
    if (st.capturing) return;
    const scheme = PAGES[st.page][0];
    st.capturing = { action: d.action, slot: +d.slot };
    st.msg = '';
    h.setCapturing(true);
    h.render();
    const code = scheme === 'pad' ? await capturePad() : await captureKey();
    h.setCapturing(false);
    st.capturing = null;
    if (code !== undefined) {
      if (scheme === 'pad') setPad(d.action, code);
      else setKey(scheme, d.action, +d.slot, code);
      st.msg = code == null ? 'Cleared.' : `${scheme === 'pad' ? padLabel(code) : keyLabel(code)} saved.`;
    }
    h.render();
  }

  Object.assign(h.A, {
    ctlBind: (d) => bind(d),
    ctlPage: (d) => { st.page = (st.page + +d.d + PAGES.length) % PAGES.length; st.msg = ''; h.render(); },
    ctlReset: () => { resetBinds(PAGES[st.page][0]); st.msg = 'Page reset to defaults.'; h.render(); },
    ctlResetAll: () => { resetBinds(); st.msg = 'All controls reset to defaults.'; h.render(); },
    ctlBack: () => h.back(),
  });

  const open = () => { st.page = 0; st.msg = ''; st.capturing = null; };
  return { screen, open };
}
