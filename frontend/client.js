const BACKEND_URL = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || '';

if (!BACKEND_URL || BACKEND_URL.includes('your-backend')) {
  console.warn('⚠️ BACKEND_URL is not set. Edit config.js before deploying.');
}

const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

let myId = null;
let myName = '';
let currentView = 'group';
const dmHistory = new Map();
let onlineUsers = [];
const groupMessagesCache = [];
let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

// ---------- Elements ----------
const banner = document.getElementById('connection-banner');
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const loginError = document.getElementById('login-error');
const myNameEl = document.getElementById('my-name');
const onlineList = document.getElementById('online-list');
const messagesEl = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const chatTitle = document.getElementById('chat-title');
const backBtn = document.getElementById('back-to-group-btn');
const voiceToggleBtn = document.getElementById('voice-toggle-btn');
const muteToggleBtn = document.getElementById('mute-toggle-btn');
const ownerTokenInput = document.getElementById('owner-token');
const clearChatBtn = document.getElementById('clear-chat-btn');
const voiceAudiosEl = document.getElementById('voice-audios');

// ---------- Connection status banner ----------
function showBanner(text, cls) {
  banner.textContent = text;
  banner.className = 'banner ' + cls;
  banner.classList.remove('hidden');
}
function hideBanner() { banner.classList.add('hidden'); }

socket.on('connect', async () => {
  hideBanner();
  await loadIceConfig();
  // if we already had a name (i.e. this is a reconnect after a drop), rejoin automatically
  if (myName) {
    socket.emit('join', myName, (res) => {
      if (res && res.ok) {
        groupMessagesCache.length = 0;
        (res.history || []).forEach((m) => groupMessagesCache.push(m));
        if (currentView === 'group') {
          messagesEl.innerHTML = '';
          groupMessagesCache.forEach((m) => renderMessage(m, m.from === myId));
        }
        // Socket.IO gives us a new socket.id after reconnect. Keep the local mic,
        // discard stale peers, and explicitly rejoin the voice room with the new id.
        if (shouldRejoinVoice && inVoice && localStream) {
          cleanupAllPeers(true);
          socket.emit('voice-join');
          if (isMuted) socket.emit('voice-mute-status', true);
        }
      }
    });
  }
});

socket.on('disconnect', () => {
  showBanner('اتصال قطع شد... در حال تلاش برای اتصال دوباره', 'reconnecting');
});

socket.io.on('reconnect_attempt', () => {
  showBanner('در حال تلاش برای اتصال دوباره...', 'reconnecting');
});

socket.io.on('reconnect', () => {
  showBanner('دوباره وصل شد ✅', 'ok');
  setTimeout(hideBanner, 2000);
});

socket.io.on('reconnect_failed', () => {
  showBanner('اتصال به سرور برقرار نشد. اینترنتت رو چک کن.', 'reconnecting');
});

socket.on('connect_error', (err) => {
  console.error('connect_error:', err.message);
  showBanner('خطا در اتصال به سرور', 'reconnecting');
});

// ---------- ICE config ----------
async function loadIceConfig() {
  try {
    const res = await fetch(BACKEND_URL + '/api/ice-config');
    const data = await res.json();
    if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
      iceServers = data.iceServers;
    }
  } catch (err) {
    console.warn('Could not load ICE config, falling back to public STUN only:', err.message);
  }
}

// ---------- Login ----------
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    loginError.textContent = 'اول یه اسم بنویس';
    return;
  }
  joinBtn.disabled = true;
  socket.emit('join', name, (res) => {
    joinBtn.disabled = false;
    if (!res || !res.ok) {
      loginError.textContent = (res && res.error) || 'خطا در اتصال به سرور';
      return;
    }
    myId = res.id;
    myName = name;
    myNameEl.textContent = name;
    loginScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    (res.history || []).forEach((m) => { groupMessagesCache.push(m); renderMessage(m, m.from === myId); });
  });
}

// ---------- Online list ----------
socket.on('online-users', (list) => {
  onlineUsers = list;
  renderOnlineList();
});

function renderOnlineList() {
  onlineList.innerHTML = '';
  onlineUsers.forEach((u) => {
    if (u.id === myId) return;
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = u.name;
    const badges = document.createElement('span');
    badges.className = 'badges';
    if (u.inVoice) {
      const dot = document.createElement('span');
      dot.className = 'voice-dot';
      dot.title = 'در وویس چت';
      badges.appendChild(dot);
      if (u.muted) {
        const m = document.createElement('span');
        m.className = 'mute-icon';
        m.textContent = '🔇';
        badges.appendChild(m);
      }
    }
    li.appendChild(nameSpan);
    li.appendChild(badges);
    li.addEventListener('click', () => openDM(u.id, u.name));
    onlineList.appendChild(li);
  });
}

// ---------- Chat views ----------
function openDM(userId, name) {
  currentView = userId;
  chatTitle.textContent = `پیام خصوصی با ${name}`;
  backBtn.classList.remove('hidden');
  messagesEl.innerHTML = '';
  (dmHistory.get(userId) || []).forEach((m) => renderMessage(m, m.from === myId));
}

backBtn.addEventListener('click', () => {
  currentView = 'group';
  chatTitle.textContent = 'چت گروه';
  backBtn.classList.add('hidden');
  messagesEl.innerHTML = '';
  groupMessagesCache.forEach((m) => renderMessage(m, m.from === myId));
});

function renderMessage(msg, mine) {
  const div = document.createElement('div');
  div.className = 'msg' + (mine ? ' mine' : '');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = msg.fromName;
  div.appendChild(meta);
  div.appendChild(document.createTextNode(msg.text));
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderSystem(text) {
  if (currentView !== 'group') return;
  const div = document.createElement('div');
  div.className = 'msg system';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Sending ----------
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  if (currentView === 'group') {
    socket.emit('group-message', text);
  } else {
    socket.emit('dm-message', { to: currentView, text });
  }
  messageInput.value = '';
}

// ---------- Incoming messages ----------
socket.on('group-message', (msg) => {
  groupMessagesCache.push(msg);
  if (currentView === 'group') renderMessage(msg, msg.from === myId);
});

socket.on('dm-message', (msg) => {
  const otherId = msg.from === myId ? currentView : msg.from;
  if (!dmHistory.has(otherId)) dmHistory.set(otherId, []);
  dmHistory.get(otherId).push(msg);
  if (currentView === otherId) renderMessage(msg, msg.from === myId);
});

socket.on('system', renderSystem);

socket.on('chat-cleared', () => {
  groupMessagesCache.length = 0;
  if (currentView === 'group') messagesEl.innerHTML = '';
});

// ---------- Owner moderation ----------
clearChatBtn.addEventListener('click', () => {
  const token = ownerTokenInput.value.trim();
  socket.emit('clear-chat', token);
});

// ================= VOICE CHAT (WebRTC mesh) =================
let localStream = null;
let inVoice = false;
let isMuted = false;
let shouldRejoinVoice = false;
const peerConnections = new Map(); // peerId -> RTCPeerConnection
const pendingIceCandidates = new Map(); // peerId -> RTCIceCandidateInit[]

function cleanupPeer(peerId, removeAudio = true) {
  const pc = peerConnections.get(peerId);
  if (pc) {
    try { pc.onicecandidate = null; pc.ontrack = null; pc.close(); } catch (e) {}
    peerConnections.delete(peerId);
  }
  pendingIceCandidates.delete(peerId);
  if (removeAudio) {
    const audio = document.getElementById('audio-' + peerId);
    if (audio) audio.remove();
  }
}

function cleanupAllPeers(removeAudios = true) {
  for (const peerId of [...peerConnections.keys()]) cleanupPeer(peerId, removeAudios);
  if (removeAudios) voiceAudiosEl.innerHTML = '';
}

function stopLocalAudio() {
  if (localStream) {
    localStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
    localStream = null;
  }
}

voiceToggleBtn.addEventListener('click', async () => {
  if (!inVoice) {
    try {
      if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      isMuted = false;
      localStream.getAudioTracks().forEach((t) => { t.enabled = true; });
      inVoice = true;
      shouldRejoinVoice = true;
      voiceToggleBtn.textContent = '🔴 خروج از وویس چت';
      voiceToggleBtn.classList.add('active');
      muteToggleBtn.classList.remove('hidden');
      socket.emit('voice-join');
    } catch (err) {
      stopLocalAudio();
      alert('دسترسی به میکروفون داده نشد یا میکروفونی پیدا نشد: ' + err.message);
    }
  } else {
    leaveVoice();
  }
});

muteToggleBtn.addEventListener('click', () => {
  if (!localStream || !inVoice) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
  muteToggleBtn.textContent = isMuted ? '🔊 روشن کردن میکروفون' : '🔇 قطع میکروفون';
  muteToggleBtn.classList.toggle('active', isMuted);
  socket.emit('voice-mute-status', isMuted);
});

function leaveVoice() {
  shouldRejoinVoice = false;
  inVoice = false;
  isMuted = false;
  try { socket.emit('voice-leave'); } catch (e) {}
  cleanupAllPeers(true);
  stopLocalAudio();
  voiceToggleBtn.textContent = '🎙 ورود به وویس چت';
  voiceToggleBtn.classList.remove('active');
  muteToggleBtn.classList.add('hidden');
  muteToggleBtn.classList.remove('active');
  muteToggleBtn.textContent = '🔇 قطع میکروفون';
}

// A Socket.IO reconnect changes socket.id. Keep the microphone alive locally,
// discard stale peer connections, then rejoin the voice room with the new id.
socket.on('disconnect', () => {
  if (inVoice) {
    shouldRejoinVoice = true;
    cleanupAllPeers(true);
  }
});

window.addEventListener('beforeunload', () => {
  if (inVoice) {
    try { socket.emit('voice-leave'); } catch (e) {}
  }
  cleanupAllPeers(true);
  stopLocalAudio();
});

function createPeerConnection(peerId) {
  const existing = peerConnections.get(peerId);
  if (existing && existing.connectionState !== 'closed') return existing;
  if (!localStream) throw new Error('Microphone stream is not ready');

  const pc = new RTCPeerConnection({ iceServers });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate && socket.connected && inVoice) {
      socket.emit('webrtc-ice-candidate', { to: peerId, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    let audio = document.getElementById('audio-' + peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'audio-' + peerId;
      audio.autoplay = true;
      audio.playsInline = true;
      voiceAudiosEl.appendChild(audio);
    }
    if (e.streams && e.streams[0]) {
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      // Remove the failed connection. A fresh voice-peer-joined/rejoin can create it again.
      cleanupPeer(peerId, true);
    } else if (pc.connectionState === 'closed') {
      cleanupPeer(peerId, true);
    }
  };

  peerConnections.set(peerId, pc);
  return pc;
}

async function flushPendingIce(peerId, pc) {
  if (!pc.remoteDescription) return;
  const queue = pendingIceCandidates.get(peerId) || [];
  pendingIceCandidates.delete(peerId);
  for (const candidate of queue) {
    try { await pc.addIceCandidate(candidate); }
    catch (err) { console.warn('Queued ICE candidate failed:', err); }
  }
}

async function addIceCandidateSafely(peerId, candidate) {
  const pc = peerConnections.get(peerId);
  if (!pc || !pc.remoteDescription) {
    if (!pendingIceCandidates.has(peerId)) pendingIceCandidates.set(peerId, []);
    pendingIceCandidates.get(peerId).push(candidate);
    return;
  }
  try { await pc.addIceCandidate(candidate); }
  catch (err) { console.warn('Error adding ICE candidate:', err); }
}

socket.on('voice-peers', async (peerIds) => {
  if (!inVoice || !localStream) return;
  for (const peerId of peerIds) {
    if (peerId === socket.id || peerConnections.has(peerId)) continue;
    try {
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { to: peerId, offer: pc.localDescription });
    } catch (err) {
      console.error('Error creating offer for', peerId, err);
      cleanupPeer(peerId, true);
    }
  }
});

socket.on('voice-peer-joined', async (peerId) => {
  // The newly joined peer is the deterministic offerer; existing peers wait.
  // This event is intentionally ignored here to avoid offer collisions.
});

socket.on('voice-peer-left', (peerId) => cleanupPeer(peerId, true));

socket.on('webrtc-offer', async ({ from, offer }) => {
  if (!inVoice || !localStream || !from || !offer) return;
  try {
    let pc = peerConnections.get(from);
    if (!pc) pc = createPeerConnection(from);

    // Ignore a duplicate offer while this peer is already negotiating as caller.
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushPendingIce(from, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer: pc.localDescription });
  } catch (err) {
    console.error('Error handling offer from', from, err);
    cleanupPeer(from, true);
  }
});

socket.on('webrtc-answer', async ({ from, answer }) => {
  const pc = peerConnections.get(from);
  if (!pc || !answer) return;
  try {
    if (pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingIce(from, pc);
  } catch (err) {
    console.error('Error setting remote answer:', err);
    cleanupPeer(from, true);
  }
});

socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
  if (!inVoice || !candidate || !from) return;
  await addIceCandidateSafely(from, candidate);
});
