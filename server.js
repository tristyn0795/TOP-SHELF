// TOP SHELF server: static files + WebSocket rooms. Railway sets PORT.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import { attachRooms, roomCount } from './server/rooms.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => res.json({ ok: true, rooms: roomCount(), uptime: Math.round(process.uptime()) }));

// Google Play (Trusted Web Activity): the Android app proves it owns this site through Digital
// Asset Links. ANDROID_SHA256 holds the signing-key fingerprints from Play Console, comma separated.
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || 'com.topshelfhockey.app';
app.get('/.well-known/assetlinks.json', (req, res) => {
  const prints = (process.env.ANDROID_SHA256 || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  res.set('Cache-Control', 'no-cache');
  res.json(prints.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: prints },
  }] : []);
});

// Service worker for offline play: precaches every game file, versioned by a hash of their
// contents so each deploy that changes something rolls out a new cache.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]));
const swFiles = ['/', '/privacy',
  ...walk(path.join(dir, 'public')).filter((f) => !f.includes(`${path.sep}voice${path.sep}`)).map((f) => '/' + path.relative(path.join(dir, 'public'), f).split(path.sep).join('/')),
  ...walk(path.join(dir, 'shared')).filter((f) => f.endsWith('.js')).map((f) => '/shared/' + path.relative(path.join(dir, 'shared'), f).split(path.sep).join('/')),
].filter((f) => f !== '/index.html');
const hash = createHash('sha256');
for (const f of [...walk(path.join(dir, 'public')), ...walk(path.join(dir, 'shared')), path.join(dir, 'server', 'privacy.html')].sort()) {
  if (!f.includes(`${path.sep}voice${path.sep}`)) hash.update(fs.readFileSync(f));
}
const swSource = fs.readFileSync(path.join(dir, 'server', 'sw.js'), 'utf8')
  .replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__FILES__', JSON.stringify(swFiles));
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript').send(swSource);
});

// Privacy policy (required for the Play listing). CONTACT_EMAIL fills in the contact line.
const privacyTpl = fs.readFileSync(path.join(dir, 'server', 'privacy.html'), 'utf8');
const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
app.get(['/privacy', '/privacy.html'], (req, res) => {
  const email = process.env.CONTACT_EMAIL;
  const contact = email
    ? `email <a href="mailto:${escHtml(email)}">${escHtml(email)}</a>`
    : 'use the contact email on the TOP SHELF Google Play listing';
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(privacyTpl.replace('{{CONTACT}}', contact));
});
app.use('/shared', express.static(path.join(dir, 'shared'), { maxAge: '1h' }));

// Recorded commentary: public/voice/<line id>.mp3. The index lets the game know what exists.
const voiceDir = path.join(dir, 'public', 'voice');
app.get('/voice/index.json', (req, res) => {
  fs.readdir(voiceDir, (err, files) => {
    res.set('Cache-Control', 'no-cache');
    res.json(err ? [] : files.filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort());
  });
});
app.use('/voice', express.static(voiceDir, { maxAge: 0 }), (req, res) => res.status(404).end());
app.use(express.static(path.join(dir, 'public'), { maxAge: '1h', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(dir, 'public', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });
attachRooms(wss);

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`TOP SHELF on http://localhost:${port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
