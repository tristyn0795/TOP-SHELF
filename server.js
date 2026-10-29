// TOP SHELF server: static files + WebSocket rooms. Railway sets PORT.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { attachRooms, roomCount } from './server/rooms.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => res.json({ ok: true, rooms: roomCount(), uptime: Math.round(process.uptime()) }));
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
