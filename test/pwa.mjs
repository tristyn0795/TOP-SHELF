// Play Store / PWA readiness: manifest and icons, the Bubblewrap config, store listing limits,
// and the server's service worker, asset links and privacy routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const ok = (m) => console.log('✔', m);
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));
const pngSize = (p) => { const b = fs.readFileSync(new URL(`../${p}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// 1. web manifest
const m = JSON.parse(read('public/manifest.webmanifest'));
for (const k of ['id', 'name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color', 'icons']) assert.ok(m[k], `manifest needs ${k}`);
for (const i of m.icons.filter((x) => x.type === 'image/png')) {
  const [w, h] = pngSize(`public${i.src}`);
  assert.equal(`${w}x${h}`, i.sizes, `${i.src} size`);
}
assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'maskable icon');
for (const s of m.screenshots || []) assert.ok(exists(`public${s.src}`), `${s.src} exists`);
ok(`manifest: ${m.icons.length} icons, ${m.screenshots.length} screenshots, ${m.shortcuts.length} shortcuts, display ${m.display}`);

// 2. Bubblewrap (TWA) config
const twa = JSON.parse(read('android/twa-manifest.json'));
assert.equal(twa.packageId, 'com.topshelfhockey.app');
assert.match(twa.host, /^[a-z0-9.-]+$/);
for (const k of ['iconUrl', 'maskableIconUrl', 'webManifestUrl', 'fullScopeUrl']) assert.ok(twa[k].startsWith(`https://${twa.host}/`), `${k} on ${twa.host}`);
assert.ok(twa.appVersion && Number.isInteger(twa.appVersionCode), 'version fields (appVersion / appVersionCode)');
assert.equal(twa.display, 'fullscreen');
assert.equal(twa.startUrl, '/?src=twa');
ok(`twa-manifest: ${twa.packageId} → https://${twa.host}${twa.startUrl}, v${twa.appVersion}`);

// 3. store listing limits and graphics
const listing = read('store/listing.md');
const block = (title) => listing.split(`## ${title}`)[1].split('```')[1].replace(/^\n/, '').replace(/\n$/, '');
const lim = [['App name', 30], ['Short description', 80], ['Full description', 4000], ['Release notes for the first release', 500]];
for (const [t, max] of lim) {
  const n = [...block(t)].length;
  assert.ok(n > 0 && n <= max, `${t}: ${n}/${max}`);
}
assert.ok(!/\bNHL\b/i.test(listing), 'no league trademarks in the listing');
ok('listing text within limits: ' + lim.map(([t, max]) => `${t.split(' ')[0].toLowerCase()} ${[...block(t)].length}/${max}`).join(', '));
const g = (f) => pngSize(`store/graphics/${f}`).join('x');
assert.equal(g('icon-512.png'), '512x512');
assert.equal(g('feature-graphic-1024x500.png'), '1024x500');
const shots = fs.readdirSync(new URL('../store/graphics/', import.meta.url)).filter((f) => /^(phone|tablet)/.test(f));
for (const f of shots) {
  const [w, h] = pngSize(`store/graphics/${f}`);
  assert.ok(Math.min(w, h) >= 320 && Math.max(w, h) <= 3840 && Math.max(w, h) / Math.min(w, h) <= 2, `${f} ${w}x${h}`);
}
assert.ok(shots.filter((f) => f.startsWith('phone')).length >= 2, 'at least 2 phone screenshots');
ok(`graphics: icon, feature graphic, ${shots.length} screenshots within Play limits`);

// 4. server routes
const port = 3197;
const srv = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), ANDROID_SHA256: 'aa:bb, cc:dd', CONTACT_EMAIL: 'help@example.com' }, stdio: 'ignore',
});
try {
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(`${base}/health`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const al = await fetch(`${base}/.well-known/assetlinks.json`);
  assert.equal(al.headers.get('content-type').split(';')[0], 'application/json');
  const links = await al.json();
  assert.deepEqual(links[0].target, { namespace: 'android_app', package_name: 'com.topshelfhockey.app', sha256_cert_fingerprints: ['AA:BB', 'CC:DD'] });
  ok('assetlinks.json lists the package and both fingerprints');
  const pv = await (await fetch(`${base}/privacy`)).text();
  assert.ok(pv.includes('mailto:help@example.com') && !pv.includes('{{'), 'privacy contact filled in');
  ok('privacy policy served with the contact email');
  const sw = await fetch(`${base}/sw.js`);
  assert.equal(sw.headers.get('cache-control'), 'no-cache');
  const src = await sw.text();
  const files = JSON.parse(src.match(/const FILES = (\[.*\]);/)[1]);
  assert.ok(!src.includes('__VERSION__') && /const VERSION = '[0-9a-f]{12}'/.test(src), 'versioned');
  for (const f of ['/', '/js/main.js', '/shared/engine.js', '/css/style.css', '/fonts/PressStart2P-latin.woff2', '/manifest.webmanifest']) assert.ok(files.includes(f), `precaches ${f}`);
  const bad = [];
  for (const f of files) { const r = await fetch(base + f); if (!r.ok) bad.push(`${f} ${r.status}`); }
  assert.deepEqual(bad, [], 'every precached file is served');
  ok(`service worker precaches ${files.length} files, all served`);
} finally {
  srv.kill();
}
console.log('PWA / PLAY CHECKS PASSED');
