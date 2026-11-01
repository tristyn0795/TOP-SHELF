// Commentary studio: walk the script, record each line into the mic, play it back,
// and export everything as a zip of correctly named MP3s for public/voice/.
// Takes are kept in this browser (IndexedDB) and are used in-game right away.
import { LINES, CATS, GROUPS, VOICES } from '/shared/booth-lines.js';
import { TEAMS } from '/shared/teams.js';
import * as idb from './idb.js';

const LAME = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const scripts = {};
function loadScript(src) {
  scripts[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
  return scripts[src];
}

const WORKLET = `class Rec extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('ts-rec', Rec);`;

const FILTERS = [['all', 'ALL LINES'], ['missing', 'NOT RECORDED'], ['essential', 'ESSENTIALS']];
const SAMPLE_TEAM = 3; // Saltmarsh: used to preview slot lines in context

/** h: { A, render, screen, back, win, btn, mi, esc, voice, audio, nav } */
export function createStudio(h) {
  const st = { group: 0, filter: 'all', cat: null, id: null, rec: null, msg: '', level: 0 };

  const visible = () => LINES.filter((l) => CATS[l.cat].group === GROUPS[st.group] && (
    st.filter === 'all' || (st.filter === 'missing' && !h.voice.has(l.id)) || (st.filter === 'essential' && l.tier === 1)));
  const catsInGroup = () => Object.values(CATS).filter((c) => c.group === GROUPS[st.group]);
  const lineAt = () => LINES.find((l) => l.id === st.id);

  function ensureSelection() {
    const vis = visible();
    if (!vis.find((l) => l.id === st.id)) {
      const inCat = vis.filter((l) => l.cat === st.cat);
      st.id = (inCat[0] || vis[0])?.id || null;
    }
    st.cat = lineAt()?.cat || st.cat;
  }

  function lineHtml(l) {
    return l.parts.map((p) => (typeof p === 'string' ? h.esc(p) : `<mark>${p.nick ? 'THE TEAM' : 'TEAM'}</mark>${h.esc(p.tail || '')}`)).join(' ');
  }

  function screen() {
    ensureSelection();
    const l = lineAt();
    const total = LINES.length;
    const done = LINES.filter((x) => h.voice.has(x.id)).length;
    const local = LINES.filter((x) => h.voice.local.has(x.id)).length;
    const cats = catsInGroup().map((c) => {
      const ls = LINES.filter((x) => x.cat === c.id);
      const n = ls.filter((x) => h.voice.has(x.id)).length;
      return `<button class="mi ${n === ls.length ? 'done' : ''}" data-act="stCat" data-cat="${c.id}">${h.esc(c.label).toUpperCase()}<span class="prog">${n}/${ls.length}</span></button>`;
    }).join('');
    const inCat = visible().filter((x) => x.cat === st.cat);
    const list = inCat.map((x) => `<button class="mi ${h.voice.has(x.id) ? 'done' : ''}" data-act="stPick" data-id="${x.id}">${h.voice.has(x.id) ? '✔' : '·'} ${h.esc(x.text).slice(0, 46)}</button>`).join('');
    let take = '<p class="note">Nothing to record with this filter. Nice work!</p>';
    if (l) {
      const v = VOICES[l.who];
      const has = h.voice.has(l.id);
      const slot = l.parts.some((p) => typeof p === 'object');
      const state = st.rec ? `<div class="take-state rec blink">● RECORDING… PRESS R TO STOP</div>`
        : has ? `<div class="take-state ok">✔ RECORDED${h.voice.local.has(l.id) ? ' (IN THIS BROWSER)' : ' (IN THE GAME FILES)'}</div>` : '<div class="take-state">NOT RECORDED YET</div>';
      take = `
        <div class="take-meta"><b style="color:${v.color}">${v.name}</b> · ${v.role} · ${l.tier === 1 ? 'ESSENTIAL' : 'VARIETY'}</div>
        <div class="take-line">${lineHtml(l)}</div>
        ${slot ? '<p class="note">⚠ The boxed TEAM part is a separate clip. Record only the other words, as if the team name was just said (or is about to be).</p>' : ''}
        <div class="take-meta">PLAYS: ${h.esc(CATS[l.cat].ctx)}${l.note ? `<br>DIRECTION: ${h.esc(l.note)}` : ''}<br>FILE: voice/${l.id}.mp3</div>
        ${state}
        <div class="meter"><i id="stMeter"></i></div>
        ${st.msg ? `<p class="notice">${h.esc(st.msg)}</p>` : ''}
        <div class="btnrow">
          ${h.btn('stRec', st.rec ? '■ STOP (R)' : '● RECORD (R)', '', 'red default')}
          ${h.btn('stPlay', '▶ TAKE (P)', has ? '' : 'disabled')}
          ${h.btn('stContext', '▶ IN CONTEXT (C)')}
          ${h.btn('stDelete', 'DELETE', h.voice.local.has(l.id) ? '' : 'disabled', 'mini')}
        </div>
        <div class="btnrow">${h.btn('stStep', '◀ PREV', 'data-d="-1"')}${h.btn('stStep', 'NEXT ▶ (N)', 'data-d="1"')}</div>`;
    }
    return {
      html: `
        <header class="topbar"><h1>COMMENTARY STUDIO</h1><span>${done} OF ${total} LINES RECORDED · ${local} IN THIS BROWSER</span></header>
        <div class="studio">
          <div>
            ${h.win('SCRIPT', `
              <button class="opt" data-act="stGroup" data-left="stGroupBack" data-right="stGroup"><span class="ol">SECTION</span><span class="ov"><i>◀</i> ${GROUPS[st.group]} <i>▶</i></span></button>
              <button class="opt" data-act="stFilter" data-left="stFilterBack" data-right="stFilter"><span class="ol">SHOW</span><span class="ov"><i>◀</i> ${FILTERS.find((f) => f[0] === st.filter)[1]} <i>▶</i></span></button>
              <div class="menu-list">${cats}</div>`)}
          </div>
          <div>
            ${h.win(l ? h.esc(CATS[l.cat].label).toUpperCase() : 'TAKE', take)}
            ${h.win('LINES IN THIS CATEGORY', `<div class="line-list menu-list">${list || '<p class="note">None with this filter.</p>'}</div>`)}
            ${h.win('EXPORT', `
              <p class="note">Your takes play in the game right away, in this browser. To put them in the real game for everyone: download the zip, then upload the MP3s inside its <b>voice</b> folder into <b>public/voice/</b> in your GitHub repo (Add file > Upload files). Railway redeploys automatically.</p>
              <div class="btnrow">${h.btn('stExport', `DOWNLOAD ALL (${local})`, local ? '' : 'disabled', 'red')}${h.btn('stExportNew', 'DOWNLOAD NEW', local ? '' : 'disabled')}${h.btn('stPrint', 'PRINT SCRIPT')}</div>`)}
          </div>
        </div>
        <div class="btnrow">${h.btn('stBack', 'BACK')}<span class="hint">R RECORD · P PLAY · C IN CONTEXT · N NEXT</span></div>`,
      back: () => { stopRec(true); h.back(); },
      prefer: '[data-act="stRec"]',
    };
  }

  // ------------------------------------------------------------ recording

  async function startRec() {
    const l = lineAt();
    if (!l || st.rec) return;
    st.msg = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const chunks = [];
      let node;
      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        node = new AudioWorkletNode(ctx, 'ts-rec');
        node.port.onmessage = (e) => chunks.push(e.data);
      } else {
        node = ctx.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      }
      const mute = ctx.createGain();
      mute.gain.value = 0;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(node); node.connect(mute); mute.connect(ctx.destination); src.connect(an);
      st.rec = { stream, ctx, chunks, an, id: l.id };
      h.render();
      meterLoop();
    } catch (e) {
      st.msg = `MIC NOT AVAILABLE: ${e.message || e}`;
      h.render();
    }
  }

  function meterLoop() {
    const r = st.rec;
    if (!r) return;
    const buf = new Float32Array(r.an.fftSize);
    r.an.getFloatTimeDomainData(buf);
    let pk = 0;
    for (const v of buf) pk = Math.max(pk, Math.abs(v));
    const el = document.getElementById('stMeter');
    if (el) el.style.width = `${Math.min(100, Math.round(pk * 110))}%`;
    requestAnimationFrame(meterLoop);
  }

  async function stopRec(discard = false) {
    const r = st.rec;
    if (!r) return;
    st.rec = null;
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    await r.ctx.close();
    if (discard) return;
    const pcm = process(r.chunks, rate);
    if (!pcm) { st.msg = 'TOO QUIET: NOTHING WAS SAVED. CHECK YOUR MIC AND TRY AGAIN.'; h.render(); return; }
    try {
      const blob = await encodeMp3(pcm, rate);
      await idb.put('takes', r.id, { blob, at: Date.now(), dur: pcm.length / rate });
      h.voice.local.add(r.id);
      h.voice.cache.delete(r.id);
      st.msg = `SAVED · ${(pcm.length / rate).toFixed(1)}S`;
    } catch (e) {
      st.msg = `COULD NOT SAVE: ${e.message || e}`;
    }
    h.render();
  }

  // Trim silence at both ends (keep ~80 ms), normalise the peak to -1 dBFS.
  function process(chunks, rate) {
    const n = chunks.reduce((a, c) => a + c.length, 0);
    const all = new Float32Array(n);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    const th = 0.02;
    let a = 0, b = n - 1;
    while (a < n && Math.abs(all[a]) < th) a++;
    while (b > a && Math.abs(all[b]) < th) b--;
    if (b - a < rate * 0.1) return null;
    const pad = Math.round(rate * 0.08);
    const out = all.slice(Math.max(0, a - pad), Math.min(n, b + pad));
    let pk = 0;
    for (const v of out) pk = Math.max(pk, Math.abs(v));
    const g = 0.891 / pk;
    for (let i = 0; i < out.length; i++) out[i] *= g;
    return out;
  }

  async function encodeMp3(pcm, rate) {
    await loadScript(LAME);
    const enc = new window.lamejs.Mp3Encoder(1, rate, 96);
    const i16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
    const parts = [];
    for (let i = 0; i < i16.length; i += 1152) {
      const buf = enc.encodeBuffer(i16.subarray(i, i + 1152));
      if (buf.length) parts.push(new Uint8Array(buf));
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  // ------------------------------------------------------------ export

  async function exportZip(onlyNew) {
    st.msg = 'BUILDING ZIP…';
    h.render();
    try {
      await loadScript(JSZIP);
      const zip = new window.JSZip();
      const last = (await idb.get('meta', 'lastExport')) || 0;
      let n = 0;
      for (const id of await idb.keys('takes')) {
        const rec = await idb.get('takes', id);
        if (onlyNew && rec.at <= last) continue;
        zip.file(`voice/${id}.mp3`, rec.blob);
        n++;
      }
      zip.file('README.txt', 'TOP SHELF commentary recordings.\n\nUpload every .mp3 in the voice folder into public/voice/ in the game repository\n(GitHub: open public/voice, then Add file -> Upload files, drag them in, Commit).\nRailway redeploys and the game uses them automatically. File names must not change.\n');
      if (!n) { st.msg = 'NO NEW TAKES SINCE YOUR LAST DOWNLOAD.'; h.render(); return; }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `top-shelf-voice-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await idb.put('meta', 'lastExport', Date.now());
      st.msg = `DOWNLOADED ${n} CLIP${n === 1 ? '' : 'S'}.`;
    } catch (e) {
      st.msg = `EXPORT FAILED: ${e.message || e}`;
    }
    h.render();
  }

  function printScript() {
    const rows = GROUPS.map((g) => `<h2>${g}</h2>` + Object.values(CATS).filter((c) => c.group === g).map((c) => `<h3>${h.esc(c.label)} <small>${h.esc(c.ctx)}</small></h3><table>${LINES.filter((l) => l.cat === c.id).map((l) => `<tr><td>${h.voice.has(l.id) ? '✔' : '☐'}</td><td><b>${VOICES[l.who].name}</b></td><td>${h.esc(l.text)}${l.note ? `<br><i>${h.esc(l.note)}</i>` : ''}</td><td><code>${l.id}.mp3</code></td></tr>`).join('')}</table>`).join('')).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>TOP SHELF recording script</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:900px}h2{border-bottom:3px solid #c00;margin-top:32px}h3{margin:18px 0 6px}h3 small{font-weight:normal;color:#666}table{border-collapse:collapse;width:100%}td{border-top:1px solid #ddd;padding:6px;vertical-align:top}code{font-size:11px;color:#666}i{color:#666}</style><h1>TOP SHELF recording script</h1><p>Lines with {team} in them: record only the words; the team name is a separate clip. "{team.nick}" means "the Narwhals"-style names.</p>${rows}`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  }

  // ------------------------------------------------------------ actions

  const move = (d) => {
    const vis = visible();
    const i = vis.findIndex((x) => x.id === st.id);
    const nx = vis[(i + d + vis.length) % vis.length];
    if (nx) { st.id = nx.id; st.cat = nx.cat; st.msg = ''; }
    h.render();
  };
  Object.assign(h.A, {
    stCat: (d) => { st.cat = d.cat; st.id = null; st.msg = ''; ensureSelection(); h.render(); },
    stPick: (d) => { st.id = d.id; st.msg = ''; h.render(); },
    stGroup: () => { st.group = (st.group + 1) % GROUPS.length; st.cat = null; st.id = null; h.render(); },
    stGroupBack: () => { st.group = (st.group + GROUPS.length - 1) % GROUPS.length; st.cat = null; st.id = null; h.render(); },
    stFilter: () => { st.filter = FILTERS[(FILTERS.findIndex((f) => f[0] === st.filter) + 1) % FILTERS.length][0]; h.render(); },
    stFilterBack: () => { st.filter = FILTERS[(FILTERS.findIndex((f) => f[0] === st.filter) + FILTERS.length - 1) % FILTERS.length][0]; h.render(); },
    stRec: () => (st.rec ? stopRec() : startRec()),
    stPlay: async () => {
      const rec = await idb.get('takes', st.id);
      if (rec) { new window.Audio(URL.createObjectURL(rec.blob)).play(); return; }
      if (h.voice.has(st.id)) new window.Audio(`/voice/${st.id}.mp3`).play();
    },
    stContext: () => {
      const l = lineAt();
      if (!l) return;
      const slots = Object.fromEntries(['home', 'away', 'team', 'other', 'winner', 'loser', 'lead', 'trail'].map((k) => [k, SAMPLE_TEAM]));
      h.audio.unlock();
      h.voice.say(l, slots);
    },
    stDelete: async () => {
      await idb.del('takes', st.id);
      h.voice.local.delete(st.id);
      h.voice.cache.delete(st.id);
      st.msg = 'TAKE DELETED.';
      h.render();
    },
    stStep: (d) => move(+d.d),
    stExport: () => exportZip(false),
    stExportNew: () => exportZip(true),
    stPrint: printScript,
    stBack: () => { stopRec(true); h.back(); },
  });

  // Studio keyboard shortcuts (only while the studio is on screen).
  window.addEventListener('keydown', (e) => {
    if (!h.isOpen() || e.repeat || (e.target && e.target.tagName === 'INPUT')) return;
    const k = e.code;
    if (k === 'KeyR') { e.preventDefault(); h.A.stRec(); }
    else if (k === 'KeyP') { e.preventDefault(); h.A.stPlay(); }
    else if (k === 'KeyC') { e.preventDefault(); h.A.stContext(); }
    else if (k === 'KeyN') { e.preventDefault(); move(1); }
    else if (k === 'Delete') { e.preventDefault(); h.A.stDelete(); }
  });

  return { screen, sampleTeam: TEAMS[SAMPLE_TEAM] };
}
