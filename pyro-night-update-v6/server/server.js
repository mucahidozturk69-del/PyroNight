'use strict';
/* Pyro Night room server. No npm packages needed: `node server.js`.
   - serves the game files (so http://localhost:8788 works) and WebSocket on the same port
   - rooms with custom codes, host-only settings, chat (room + global), map gallery with authors
   - relays gameplay events between players in a room; the host owns shared settings and the nextbot */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8788);
const ROOT = path.resolve(__dirname, '..');
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean); // empty = allow all
const MAX_ROOM = 5;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.mp3':'audio/mpeg','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml'};
const MAPFILE = path.join(__dirname, 'published-maps.json');
let gallery = [];
try { const s = JSON.parse(fs.readFileSync(MAPFILE, 'utf8')); if (Array.isArray(s)) gallery = s.slice(-200); } catch {}
let saveTimer = null;
const saveGallery = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(MAPFILE, JSON.stringify(gallery), () => {}), 400); };

const clients = new Set();
const rooms = new Map();
let nextId = 1;
const clean = (s, n) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const roomCode = () => crypto.randomBytes(4).toString('hex').slice(0, 5).toUpperCase();
const validCode = c => /^[A-Z0-9]{3,8}$/.test(c);
const HOST_ONLY = new Set(['settings', 'nbplace', 'nbstate', 'nbremove', 'flplace', 'flstate', 'flremove', 'mapchange']);
const RELAY = new Set(['add', 'mv', 'rm', 'lit', 'igniteAll', 'wipe', 'badd', 'bmod', 'brm', 'bwipe', 'settings', 'nbplace', 'nbstate', 'nbremove', 'flplace', 'flstate', 'flremove', 'caught', 'mapchange', 'emote']);

// ---------- static files
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/health') { res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify({ok: true, rooms: rooms.size, players: clients.size})); return; }
  if (p === '/') p = '/index.html';
  const target = path.resolve(ROOT, '.' + p);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
  if (target.startsWith(path.join(ROOT, 'server'))) { res.writeHead(403).end('Forbidden'); return; }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
    const headers = {'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes'};
    const range = req.headers.range, match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (range && !match) { res.writeHead(416, {'Content-Range': 'bytes */' + st.size}); res.end(); return; }
    if (match) {
      const start = match[1] ? Number(match[1]) : Math.max(0, st.size - Number(match[2]));
      const end = match[2] && match[1] ? Math.min(st.size - 1, Number(match[2])) : st.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= st.size || start > end) { res.writeHead(416, {'Content-Range': 'bytes */' + st.size}); res.end(); return; }
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size; headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers); if (req.method === 'HEAD') res.end(); else fs.createReadStream(target, {start, end}).pipe(res); return;
    }
    headers['Content-Length'] = st.size; res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
  });
});

// ---------- minimal RFC 6455 websocket
function frame(opcode, payload) {
  const len = payload.length; let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
class Client {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.alive = true;
    this.id = nextId++; this.name = 'Player' + this.id; this.fcode = ''; this.room = null; this.friends = [];
    this.bucket = 60; this.bucketAt = Date.now(); this.lastChat = 0; this.lastSfx = 0;
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.close()); socket.on('error', () => this.close());
  }
  send(obj) { if (!this.alive) return; try { this.socket.write(frame(1, Buffer.from(JSON.stringify(obj)))); } catch { this.close(); } }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 400000) return this.kill();
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const op = b[0] & 15, fin = !!(b[0] & 128), masked = !!(b[1] & 128); let len = b[1] & 127, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > 300000n) return this.kill(); len = Number(big); off = 10; }
      if (!masked) return this.kill();
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) { this.socket.write(frame(8, Buffer.alloc(0))); return this.close(); }
      if (op === 9) { this.socket.write(frame(10, data)); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { this.frag = fin ? null : [data]; if (fin) this.onMessage(data.toString('utf8')); }
      else if (op === 0 && this.frag) { this.frag.push(data); if (fin) { const all = Buffer.concat(this.frag); this.frag = null; this.onMessage(all.toString('utf8')); } }
    }
  }
  kill() { try { this.socket.destroy(); } catch {} this.close(); }
  close() {
    if (!this.alive) return; this.alive = false; clients.delete(this);
    leave(this); presence();
  }
  onMessage(text) {
    const now = Date.now(); this.bucket = Math.min(120, this.bucket + (now - this.bucketAt) * 0.06); this.bucketAt = now;
    if (--this.bucket < 0) return;                       // rate limit: drop
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    handle(this, m);
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const origin = req.headers.origin || '';
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  if (ORIGINS.length && !ORIGINS.includes(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  if (clients.size >= 400) { socket.write('HTTP/1.1 503 Busy\r\n\r\n'); socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = new Client(socket); clients.add(c);
  c.send({t: 'welcome', id: c.id});
  presence();
});

// ---------- helpers
const pub = c => ({id: c.id, name: c.name, host: !!(c.room && c.room.host === c)});
const roomInfo = r => ({code: r.code, map: r.map, count: r.members.size, max: r.max, host: r.host ? r.host.name : '', public: r.pub});
function publicRooms() { return [...rooms.values()].filter(r => r.pub && r.members.size).map(roomInfo).slice(0, 40); }
function broadcastRooms() { const msg = {t: 'rooms', list: publicRooms()}; for (const c of clients) c.send(msg); }
function broadcastRoom(r, obj, except) { for (const m of r.members) if (m !== except) m.send(obj); }
function presence() { const list = [...clients].filter(c => c.fcode).map(c => ({code: c.fcode, name: c.name, room: c.room ? c.room.code : ''})); for (const c of clients) { c.send({t: 'online', n: clients.size}); if (c.friends.length) c.send({t: 'friends', list: c.friends.map(code => { const f = list.find(x => x.code === code); return {code, name: f ? f.name : '', online: !!f, room: f ? f.room : ''}; })}); } }
function leave(c, notify = true) {
  const r = c.room; if (!r) return;
  r.members.delete(c); c.room = null;
  if (!r.members.size) { if (r.host === c) r.host = null; r.grace = Date.now() + 25000; broadcastRooms(); return; }   // keep the room briefly so a map-change reload can rejoin
  if (r.host === c) { r.host = [...r.members][0]; broadcastRoom(r, {t: 'sys', ch: 'room', text: r.host.name + ' is now the host.'}); }
  broadcastRoom(r, {t: 'left', id: c.id, name: c.name, host: r.host.id, members: [...r.members].map(pub)});
  presence(); broadcastRooms();
}
function joinRoom(c, r) {
  if (r.members.size >= r.max) return c.send({t: 'err', text: 'That room is full (' + r.max + ' players).'});
  leave(c); r.members.add(c); c.room = r; r.grace = 0;
  if (!r.host) r.host = c;
  else if (r.host !== c && c.fcode && c.fcode === r.hostFcode) { r.host = c; broadcastRoom(r, {t: 'sys', ch: 'room', text: c.name + ' is the host again.'}); }
  c.send({t: 'joined', code: r.code, map: r.map, host: r.host.id, you: c.id, settings: r.settings, members: [...r.members].map(pub), pub: r.pub});
  broadcastRoom(r, {t: 'joinedother', member: pub(c), members: [...r.members].map(pub), host: r.host.id}, c);
  broadcastRoom(r, {t: 'sys', ch: 'room', text: c.name + ' joined the room.'}, c);
  if (r.host !== c) r.host.send({t: 'needsnap', to: c.id});   // host sends the current world to the newcomer
  presence(); broadcastRooms();
}
const mapMeta = ({id, name, author, created, count, mapName}) => ({id, name, author, created, count, mapName});

// ---------- message handling
function handle(c, m) {
  switch (m.t) {
    case 'hello': {
      c.name = clean(m.name, 18) || c.name;
      let code = clean(m.fcode, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 5 || [...clients].some(o => o !== c && o.fcode === code)) code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      c.fcode = code; c.friends = Array.isArray(m.friends) ? m.friends.map(x => clean(x, 8).toUpperCase()).slice(0, 50) : [];
      c.send({t: 'hi', id: c.id, name: c.name, fcode: c.fcode}); presence(); break;
    }
    case 'name': c.name = clean(m.name, 18) || c.name; if (c.room) broadcastRoom(c.room, {t: 'members', members: [...c.room.members].map(pub), host: c.room.host.id}); presence(); broadcastRooms(); break;
    case 'rooms': c.send({t: 'rooms', list: publicRooms()}); break;
    case 'quick': {
      const mapName = ['lake', 'apt', 'plains', 'flat', 'dreamcore'].includes(m.map) ? m.map : 'lake';
      const openRooms = [...rooms.values()].filter(r => r.pub && r.members.size < r.max);
      let r = openRooms.find(x => x.map === mapName) || openRooms[0];
      if (!r) {
        let code; do { code = roomCode(); } while (rooms.has(code));
        r = {code, map: mapName, host: c, hostFcode: c.fcode, members: new Set(), max: MAX_ROOM, pub: true, settings: {envdmg: 0, vox: 0, crater: 0, dmgpow: 1, nbspeed: 6.5, chaos: 0}};
        rooms.set(code, r);
      }
      joinRoom(c, r); break;
    }
    case 'create': {
      let code = clean(m.code, 24).toUpperCase().replace(/\s+/g, '');
      if (code && !validCode(code)) return c.send({t: 'err', text: 'Room codes use 3-8 letters or numbers only.'});
      if (code && rooms.has(code)) return c.send({t: 'err', text: 'That room code is taken. Try another.'});
      while (!code || rooms.has(code)) code = roomCode();
      const mapName = ['lake', 'apt', 'plains', 'flat', 'dreamcore'].includes(m.map) ? m.map : 'lake';
      const r = {code, map: mapName, host: c, hostFcode: c.fcode, members: new Set(), max: Math.min(MAX_ROOM, Math.max(2, Number(m.max) || 6)), pub: !!m.pub, settings: {envdmg: 0, vox: 0, crater: 0, dmgpow: 1, nbspeed: 6.5, chaos: 0}};
      rooms.set(code, r); joinRoom(c, r); break;
    }
    case 'join': {
      const r = rooms.get(clean(m.code, 8).toUpperCase());
      if (!r) return c.send({t: 'err', text: 'No room with that code.'});
      joinRoom(c, r); break;
    }
    case 'leave': leave(c); c.send({t: 'leftroom'}); break;
    case 'kick': {
      const r = c.room; if (!r || r.host !== c) return;
      const v = [...r.members].find(x => x.id === Number(m.id) && x !== c); if (!v) return;
      v.send({t: 'kicked'}); leave(v); v.send({t: 'leftroom'}); broadcastRoom(r, {t: 'sys', ch: 'room', text: v.name + ' was removed by the host.'}); break;
    }
    case 'state': {                                       // position/pose, relayed to the room (lossy)
      const r = c.room; if (!r) return;
      const s = {id: c.id, x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, yaw: +m.yaw || 0, tp: m.tp ? 1 : 0, mv: +m.mv || 0, lt: m.lt ? 1 : 0};
      c.pose = s; break;
    }
    case 'chat': {
      const now = Date.now(); if (now - c.lastChat < 450) return; c.lastChat = now;
      const text = clean(m.text, 240); if (!text) return;
      const msg = {t: 'chat', from: c.name, id: c.id, text, host: !!(c.room && c.room.host === c)};
      if (m.ch === 'global' || !c.room) { msg.ch = 'global'; for (const o of clients) o.send(msg); }
      else { msg.ch = 'room'; broadcastRoom(c.room, msg); }
      break;
    }
    case 'sfx': {
      const r = c.room, id = clean(m.id, 16), now = Date.now();
      if (!r || id !== 'jojo' || now - c.lastSfx < 900) return;
      c.lastSfx = now; broadcastRoom(r, {t: 'sfx', id, from: c.id}, c); break;
    }
    case 'evt': {                                         // gameplay event relay
      const r = c.room; if (!r || !RELAY.has(m.e)) return;
      if (HOST_ONLY.has(m.e) && r.host !== c) return c.send({t: 'err', text: 'Only the host can do that.'});
      if (m.e === 'settings' && m.d && typeof m.d === 'object') { for (const k of ['envdmg', 'vox', 'crater']) if (k in m.d) r.settings[k] = m.d[k] ? 1 : 0; if ('dmgpow' in m.d) r.settings.dmgpow = Math.max(.5, Math.min(2, Number(m.d.dmgpow) || 1)); if ('nbspeed' in m.d) r.settings.nbspeed = Math.max(2, Math.min(12, Number(m.d.nbspeed) || 6.5)); if ('chaos' in m.d) r.settings.chaos = m.d.chaos ? 1 : 0; m.d = r.settings; }
      if (m.e === 'mapchange') { const mp = ['lake', 'apt', 'plains', 'flat', 'dreamcore'].includes(m.d && m.d.map) ? m.d.map : null; if (!mp) return; r.map = mp; broadcastRooms(); }
      const out = {t: 'evt', e: m.e, from: c.id, d: m.d};
      if (JSON.stringify(out).length > 60000) return;
      if (m.e === 'settings' || m.e === 'mapchange') broadcastRoom(r, out); else broadcastRoom(r, out, c);
      break;
    }
    case 'snap': {                                         // host -> newcomer world snapshot
      const r = c.room; if (!r || r.host !== c) return;
      const to = [...r.members].find(x => x.id === Number(m.to)); if (!to) return;
      const out = {t: 'snap', d: m.d}; if (JSON.stringify(out).length > 250000) return; to.send(out); break;
    }
    case 'voice': {
      const r = c.room, to = r && [...r.members].find(x => x.id === Number(m.to));
      if (!r || !to || to === c || !m.d || typeof m.d !== 'object') return;
      let size; try { size = JSON.stringify(m.d).length; } catch { return; }
      if (size > 16000) return;
      to.send({t: 'voice', from: c.id, d: m.d}); break;
    }
    case 'friends': c.friends = Array.isArray(m.list) ? m.list.map(x => clean(x, 8).toUpperCase()).slice(0, 50) : []; presence(); break;
    case 'invite': {
      const to = [...clients].find(o => o.fcode === clean(m.code, 8).toUpperCase()); if (!to || !c.room) return;
      to.send({t: 'invite', from: c.name, code: c.room.code, map: c.room.map}); break;
    }
    case 'publish': {
      const name = clean(m.name, 40) || 'Untitled map', data = m.data;
      if (!data || !Array.isArray(data.blocks) || data.blocks.length > 800) return c.send({t: 'err', text: 'That map is empty or too large (800 blocks max).'});
      if (JSON.stringify(data).length > 220000) return c.send({t: 'err', text: 'That map is too large to publish.'});
      const entry = {id: crypto.randomBytes(5).toString('hex'), name, author: c.name, authorCode: c.fcode, created: Date.now(), count: data.blocks.length, mapName: ['lake', 'apt', 'plains', 'flat', 'dreamcore'].includes(m.map) ? m.map : 'flat', data};
      gallery.push(entry); if (gallery.length > 200) gallery.shift(); saveGallery();
      c.send({t: 'published', id: entry.id});
      const msg = {t: 'sys', ch: 'global', text: c.name + ' published the map "' + name + '" (' + entry.count + ' blocks).'}; for (const o of clients) o.send(msg);
      break;
    }
    case 'maps': c.send({t: 'maps', list: gallery.slice().reverse().slice(0, 80).map(mapMeta)}); break;
    case 'getmap': { const e = gallery.find(x => x.id === clean(m.id, 16)); if (!e) return c.send({t: 'err', text: 'That map is no longer available.'}); c.send({t: 'mapdata', id: e.id, name: e.name, author: e.author, data: e.data}); break; }
  }
}
setInterval(() => { const now = Date.now(); for (const [k, r] of rooms) if (!r.members.size && now > (r.grace || 0)) rooms.delete(k); }, 5000);
// broadcast positions at 15 Hz as one batched message per room
setInterval(() => {
  for (const r of rooms.values()) {
    const list = []; for (const m of r.members) if (m.pose) list.push(m.pose);
    if (list.length < 2) continue;
    const msg = {t: 'poses', list};
    for (const m of r.members) m.send(msg);
  }
}, 66);

// keep-alive ping so hosts/proxies (Render, Railway, mobile networks) don't drop idle sockets
setInterval(() => { for (const c of clients) { try { c.socket.write(frame(9, Buffer.alloc(0))); } catch {} } }, 25000);

if (require.main === module) server.listen(PORT, () => console.log('Pyro Night server on http://localhost:' + PORT));
module.exports = {server};
