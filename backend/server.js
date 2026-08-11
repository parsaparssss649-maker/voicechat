// server.js -- realtime backend for the Voice Chat project
// Responsibilities: presence, group chat, DM, owner moderation,
// WebRTC signaling relay, and serving ICE server config (STUN + optional TURN).
//
// This process does NOT carry any audio -- audio flows peer-to-peer (or via
// the TURN relay) once WebRTC connections are established. This server only
// relays small signaling messages, so it's cheap to run on a free tier.

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const OWNER_TOKEN = process.env.OWNER_TOKEN || 'change-me';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
};

app.use(cors(corsOptions));
app.use(express.json());

// ---------- Health check (also what keeps you sane when the host says "sleeping") ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), users: users.size });
});

// ---------- ICE server config endpoint ----------
// Frontend fetches this instead of hardcoding TURN credentials in client code,
// so nothing secret ever sits in the GitHub Pages bundle.
app.get('/api/ice-config', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  res.json({ iceServers });
});

const io = new Server(server, {
  cors: corsOptions,
  // Helps mobile networks / flaky connections recover instead of just dying
  pingInterval: 10000,
  pingTimeout: 20000,
});

// ---------- In-memory state ----------
// No database: simplest possible free deployment. State resets on restart
// (including free-tier "cold sleep" restarts) -- that's an explicit trade-off,
// documented in the README.
const users = new Map(); // socket.id -> { name, muted }
let groupMessages = [];
const voiceRoom = new Set();

function publicUserList() {
  return Array.from(users.entries()).map(([id, u]) => ({
    id,
    name: u.name,
    inVoice: voiceRoom.has(id),
    muted: !!u.muted,
  }));
}

function broadcastUserList() {
  io.emit('online-users', publicUserList());
}

io.on('connection', (socket) => {
  let joined = false;

  socket.on('join', (name, ack) => {
    try {
      name = (name || '').toString().trim().slice(0, 24);
      if (!name) return ack && ack({ ok: false, error: 'Name required' });
      if (joined) return ack && ack({ ok: false, error: 'Already joined' });

      users.set(socket.id, { name, muted: false });
      joined = true;

      ack && ack({ ok: true, id: socket.id, history: groupMessages });
      broadcastUserList();
      socket.broadcast.emit('system', `${name} joined`);
    } catch (err) {
      console.error('join error:', err);
      ack && ack({ ok: false, error: 'Server error' });
    }
  });

  socket.on('group-message', (text) => {
    const user = users.get(socket.id);
    if (!user || !text) return;
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: socket.id,
      fromName: user.name,
      text: text.toString().slice(0, 2000),
      ts: Date.now(),
    };
    groupMessages.push(msg);
    if (groupMessages.length > 500) groupMessages.shift();
    io.emit('group-message', msg);
  });

  socket.on('dm-message', ({ to, text } = {}) => {
    const user = users.get(socket.id);
    if (!user || !to || !text || !users.has(to)) return;
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: socket.id,
      fromName: user.name,
      text: text.toString().slice(0, 2000),
      ts: Date.now(),
    };
    io.to(to).emit('dm-message', msg);
    socket.emit('dm-message', msg);
  });

  // Owner moderation -- clears group chat for everyone
  socket.on('clear-chat', (token) => {
    if (token !== OWNER_TOKEN) {
      socket.emit('system', 'Invalid owner token');
      return;
    }
    groupMessages = [];
    io.emit('chat-cleared');
    io.emit('system', 'Chat was cleared by the owner');
  });

  // ---------- Voice room presence ----------
  socket.on('voice-join', () => {
    if (!joined) return;
    const existing = Array.from(voiceRoom);
    voiceRoom.add(socket.id);
    socket.emit('voice-peers', existing);
    if (existing.length) socket.to(existing).emit('voice-peer-joined', socket.id);
    broadcastUserList();
  });

  socket.on('voice-leave', () => {
    const wasInVoice = voiceRoom.delete(socket.id);
    if (wasInVoice) io.emit('voice-peer-left', socket.id);
    broadcastUserList();
  });

  socket.on('voice-mute-status', (muted) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.muted = !!muted;
    broadcastUserList();
  });

  // ---------- WebRTC signaling relay ----------
  function canSignalTo(to) {
    return joined && voiceRoom.has(socket.id) && users.has(to) && voiceRoom.has(to) && to !== socket.id;
  }

  socket.on('webrtc-offer', ({ to, offer } = {}) => {
    if (!canSignalTo(to) || !offer) return;
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ to, answer } = {}) => {
    if (!canSignalTo(to) || !answer) return;
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });
  socket.on('webrtc-ice-candidate', ({ to, candidate } = {}) => {
    if (!canSignalTo(to) || !candidate) return;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    users.delete(socket.id);
    if (voiceRoom.has(socket.id)) {
      voiceRoom.delete(socket.id);
      io.emit('voice-peer-left', socket.id);
    }
    if (user) io.emit('system', `${user.name} left`);
    broadcastUserList();
  });

  socket.on('error', (err) => {
    console.error(`socket ${socket.id} error:`, err);
  });
});

server.listen(PORT, () => {
  console.log(`Voice chat backend listening on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});
