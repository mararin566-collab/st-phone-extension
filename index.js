// ===== PHONE CHAT EXTENSION FOR SILLYTAVERN =====
// Standalone phone UI — does NOT affect normal ST chat

import { getContext, saveExtensionSettings, extension_settings } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';

const EXT_NAME = 'phone-chat';

// ── Default settings ──────────────────────────────────────────
const defaultSettings = {
  accentColor: '#007AFF',
  bubbleUserColor: '#007AFF',
  bubbleCharColor: '#1c1c1e',
  chatBg: '#0d1117',
  phoneBg: '#1a1a2e',
  fontSize: 15,
  showAvatars: true,
  soundEnabled: false,
  userName: 'You',
};

// ── State ─────────────────────────────────────────────────────
let settings = Object.assign({}, defaultSettings);
let phoneMessages = [];   // [{id, role, type, content, time}]
let notes = [];           // [{id, author, title, body, date}]
let stickers = {          // custom sticker packs
  recent: ['❤️','😂','🥺','😍','🎉','🔥','💯','😭'],
  fun:    ['🐱','🐶','🦊','🐼','🐸','🦋','🌸','⭐'],
  food:   ['🍕','🍔','🍣','🍰','🎂','☕','🍜','🍩'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍'],
};
let activeView = 'home';
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStart = 0;
let editingNoteId = null;
let isPhoneOpen = false;
let currentTime = '';

// ── Load / save data ──────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(`${EXT_NAME}_data`);
    if (raw) {
      const d = JSON.parse(raw);
      phoneMessages = d.messages || [];
      notes = d.notes || [];
      if (d.stickers) stickers = Object.assign(stickers, d.stickers);
      settings = Object.assign({}, defaultSettings, d.settings || {});
    }
  } catch (e) { console.warn('[PhoneChat] Load error', e); }
}

function saveData() {
  try {
    const charName = getCharName();
    const key = `${EXT_NAME}_data_${charName}`;
    localStorage.setItem(key, JSON.stringify({
      messages: phoneMessages,
      notes,
      stickers,
      settings,
    }));
  } catch (e) { console.warn('[PhoneChat] Save error', e); }
}

function loadForChar() {
  try {
    const charName = getCharName();
    const raw = localStorage.getItem(`${EXT_NAME}_data_${charName}`);
    if (raw) {
      const d = JSON.parse(raw);
      phoneMessages = d.messages || [];
      notes = d.notes || [];
      if (d.stickers) stickers = Object.assign({}, stickers, d.stickers);
      settings = Object.assign({}, defaultSettings, d.settings || {});
    } else {
      phoneMessages = [];
      notes = [];
    }
    applySettings();
    renderAllMessages();
    renderNotes();
  } catch (e) { console.warn('[PhoneChat] Load char error', e); }
}

function getCharName() {
  try {
    const ctx = getContext();
    return (ctx.name2 || ctx.characters?.[ctx.characterId]?.name || 'character').replace(/\s+/g,'_');
  } catch { return 'character'; }
}
function getCharDisplayName() {
  try {
    const ctx = getContext();
    return ctx.name2 || ctx.characters?.[ctx.characterId]?.name || 'Character';
  } catch { return 'Character'; }
}
function getUserName() { return settings.userName || 'You'; }

// ── Build HTML ────────────────────────────────────────────────
function buildPhoneUI() {
  const html = `
<!-- FAB -->
<button id="phone-chat-fab" title="Open Phone Chat">📱</button>

<!-- OVERLAY -->
<div id="phone-chat-overlay">
  <div id="phone-frame">

    <!-- NOTCH -->
    <div id="phone-notch">
      <div class="notch-camera"></div>
    </div>

    <!-- STATUS BAR -->
    <div id="phone-status-bar">
      <span class="status-time" id="phone-clock">9:41</span>
      <div class="status-icons">
        <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4" y="2" width="3" height="10" rx="1"/><rect x="8" y="0" width="3" height="12" rx="1"/><rect x="12" y="0" width="3" height="12" rx="1" opacity=".3"/></svg>
        <svg width="15" height="12" viewBox="0 0 15 12"><path d="M7.5 3C10.5 3 13.2 4.3 15 6.5L13.5 8C12.1 6.2 9.9 5 7.5 5S2.9 6.2 1.5 8L0 6.5C1.8 4.3 4.5 3 7.5 3zm0 4c1.7 0 3.2.7 4.3 1.8L10.5 10A3 3 0 007.5 9a3 3 0 00-3 1l-1.3-1.2A5 5 0 017.5 7zm0 4a1 1 0 110 2 1 1 0 010-2z"/></svg>
        <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0" y="1" width="22" height="10" rx="2" stroke="rgba(255,255,255,0.5)" stroke-width="1" fill="none"/><rect x="23" y="4" width="2" height="4" rx="1" fill="rgba(255,255,255,0.5)"/><rect x="1" y="2" width="18" height="8" rx="1" fill="rgba(255,255,255,0.9)"/></svg>
      </div>
    </div>

    <!-- SCREEN -->
    <div id="phone-screen">
      <div id="phone-toast"></div>

      <!-- HOME VIEW -->
      <div class="phone-view active" id="view-home">
        <div class="home-time" id="home-clock-big">9:41</div>
        <div class="home-date" id="home-date"></div>
        <div class="home-apps" id="home-apps-grid">
          <div class="home-app-icon" data-nav="chat">
            <div class="app-icon-wrap" style="background:linear-gradient(135deg,#007AFF,#5856d6)">💬</div>
            <span class="app-icon-label">Messages</span>
          </div>
          <div class="home-app-icon" data-nav="notes">
            <div class="app-icon-wrap" style="background:linear-gradient(135deg,#ffd60a,#ff9f0a)">📝</div>
            <span class="app-icon-label">Notes</span>
          </div>
          <div class="home-app-icon" data-nav="settings">
            <div class="app-icon-wrap" style="background:linear-gradient(135deg,#8e8e93,#636366)">⚙️</div>
            <span class="app-icon-label">Settings</span>
          </div>
        </div>
        <div class="home-dock">
          <div class="dock-icon" data-nav="chat">💬</div>
          <div class="dock-icon" data-nav="notes">📝</div>
          <div class="dock-icon" data-nav="settings">⚙️</div>
        </div>
      </div>

      <!-- CHAT VIEW -->
      <div class="phone-view" id="view-chat">
        <div class="chat-header">
          <button class="chat-header-back" id="chat-back-btn">‹ Back</button>
          <div class="char-avatar" id="chat-char-avatar">🎭</div>
          <div class="char-info">
            <div class="char-name" id="chat-char-name">Character</div>
            <div class="char-status">Online</div>
          </div>
          <div class="header-actions">
            <button class="header-btn" id="btn-ai-note" title="Char writes note">✏️</button>
            <button class="header-btn" id="btn-clear-chat" title="Clear chat">🗑️</button>
          </div>
        </div>
        <div id="phone-chat-messages"></div>
        <div id="sticker-panel">
          <div class="sticker-tabs" id="sticker-tabs"></div>
          <div class="sticker-grid" id="sticker-grid"></div>
        </div>
        <div id="phone-input-area">
          <div id="phone-media-toolbar">
            <button class="media-tool-btn" id="media-camera">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#ff9f0a,#ff6b00)">📷</div>
              <span class="media-tool-label">Camera</span>
            </button>
            <button class="media-tool-btn" id="media-image">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#5856d6,#af52de)">🖼️</div>
              <span class="media-tool-label">Photo</span>
            </button>
            <button class="media-tool-btn" id="media-voice">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#ff3b30,#ff6961)">🎤</div>
              <span class="media-tool-label">Voice</span>
            </button>
            <button class="media-tool-btn" id="media-location">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#34c759,#30d158)">📍</div>
              <span class="media-tool-label">Location</span>
            </button>
            <button class="media-tool-btn" id="media-transfer">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#34c759,#0a8a35)">💸</div>
              <span class="media-tool-label">Transfer</span>
            </button>
            <button class="media-tool-btn" id="media-note">
              <div class="media-tool-icon" style="background:linear-gradient(135deg,#ffd60a,#ff9f0a)">📝</div>
              <span class="media-tool-label">Note</span>
            </button>
          </div>
          <div class="input-actions-row">
            <button class="input-action-btn" id="toggle-media-btn" title="More">➕</button>
            <button class="input-action-btn" id="toggle-sticker-btn" title="Stickers">😊</button>
            <div class="input-text-wrap">
              <textarea id="phone-message-input" rows="1" placeholder="Message…"></textarea>
            </div>
            <button class="send-btn" id="phone-send-btn">▲</button>
          </div>
        </div>
      </div>

      <!-- NOTES VIEW -->
      <div class="phone-view" id="view-notes">
        <div class="chat-header">
          <button class="chat-header-back" id="notes-back-btn">‹ Back</button>
          <div class="char-info"><div class="char-name">Notes</div></div>
          <div class="header-actions">
            <button class="header-btn" id="btn-ai-note-home" title="Ask char to write note">🤖</button>
          </div>
        </div>
        <div class="notes-list" id="notes-list"></div>
        <button class="add-note-btn" id="add-note-btn">＋</button>
      </div>

      <!-- NOTE EDITOR VIEW -->
      <div class="phone-view" id="view-note-editor">
        <div class="chat-header">
          <button class="chat-header-back" id="note-editor-back">‹ Notes</button>
          <div class="char-info"><div class="char-name" id="note-editor-label">New Note</div></div>
        </div>
        <input type="text" id="note-editor-title" placeholder="Title…">
        <textarea id="note-editor-body" placeholder="Write something…"></textarea>
        <button class="note-save-btn" id="note-save-btn">Save Note</button>
      </div>

      <!-- SETTINGS VIEW -->
      <div class="phone-view" id="view-settings">
        <div class="chat-header">
          <button class="chat-header-back" id="settings-back-btn">‹ Back</button>
          <div class="char-info"><div class="char-name">Settings</div></div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Identity</div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Your display name</div>
              <input class="settings-input" id="setting-username" placeholder="Your name" value="${settings.userName}">
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Theme Color</div>
          <div class="color-swatches" id="color-swatches">
            ${[
              {c:'#007AFF',n:'Blue'},
              {c:'#5856d6',n:'Purple'},
              {c:'#ff3b30',n:'Red'},
              {c:'#ff9f0a',n:'Orange'},
              {c:'#34c759',n:'Green'},
              {c:'#ff2d55',n:'Pink'},
              {c:'#00c7be',n:'Teal'},
              {c:'#ffd60a',n:'Yellow'},
            ].map(s => `<div class="swatch${settings.accentColor===s.c?' active':''}" style="background:${s.c}" data-color="${s.c}" title="${s.n}"></div>`).join('')}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Chat Background</div>
          <div class="color-swatches" id="bg-swatches">
            ${[
              {c:'#0d1117',n:'Dark'},
              {c:'#000000',n:'Black'},
              {c:'#1a1a2e',n:'Navy'},
              {c:'#0f2027',n:'Deep'},
              {c:'#1a0a0a',n:'Wine'},
              {c:'#0a1a0a',n:'Forest'},
            ].map(s => `<div class="swatch${settings.chatBg===s.c?' active':''}" style="background:${s.c}" data-bg="${s.c}" title="${s.n}"></div>`).join('')}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Text Size</div>
          <div class="settings-row">
            <span class="settings-label">Font size: <span id="font-size-val">${settings.fontSize}</span>px</span>
          </div>
          <input type="range" class="settings-range" id="setting-fontsize" min="12" max="20" value="${settings.fontSize}">
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Sticker Packs</div>
          <div class="settings-row">
            <span class="settings-label">Custom sticker pack</span>
          </div>
          <input class="settings-input" id="sticker-input" placeholder="Paste emojis (eg: 🐱🐶🦊)">
          <button class="note-save-btn" id="add-sticker-pack-btn" style="margin-top:8px">Add to Recent</button>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Data</div>
          <button class="danger-btn" id="btn-export-chat">📤 Export Chat History</button>
          <button class="danger-btn" id="btn-clear-all" style="margin-top:8px">🗑️ Clear All Data</button>
        </div>
      </div>

    </div><!-- /phone-screen -->

    <!-- NAVBAR -->
    <div id="phone-nav-bar">
      <button class="nav-tab" data-nav="home">
        <span class="nav-tab-icon">🏠</span>
        <span class="nav-tab-label">Home</span>
      </button>
      <button class="nav-tab" data-nav="chat">
        <span class="nav-tab-icon">💬</span>
        <span class="nav-tab-label">Chat</span>
      </button>
      <button class="nav-tab" data-nav="notes">
        <span class="nav-tab-icon">📝</span>
        <span class="nav-tab-label">Notes</span>
      </button>
      <button class="nav-tab" data-nav="settings">
        <span class="nav-tab-icon">⚙️</span>
        <span class="nav-tab-label">Settings</span>
      </button>
    </div>

    <!-- HOME INDICATOR -->
    <div id="phone-home-indicator"><div class="home-bar"></div></div>

    <!-- MODALS -->
    <div class="modal-overlay" id="transfer-modal">
      <div class="modal-sheet">
        <div class="modal-title">💸 Money Transfer</div>
        <input class="modal-input" id="transfer-amount" type="number" placeholder="Amount (฿)">
        <input class="modal-input" id="transfer-note" placeholder="Note (optional)">
        <button class="modal-confirm-btn" id="transfer-confirm">Send</button>
        <button class="modal-cancel-btn" id="transfer-cancel">Cancel</button>
      </div>
    </div>

    <!-- HIDDEN INPUTS -->
    <input type="file" id="phone-image-input" accept="image/*">
    <input type="file" id="phone-camera-input" accept="image/*" capture="environment">
  </div><!-- /phone-frame -->
</div><!-- /overlay -->
`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ── Helpers ───────────────────────────────────────────────────
function now() {
  return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
}
function todayLabel() {
  return new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function showToast(msg) {
  const t = document.getElementById('phone-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function updateClock() {
  const t = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
  const el = document.getElementById('phone-clock');
  const big = document.getElementById('home-clock-big');
  if (el) el.textContent = t;
  if (big) big.textContent = t;
  const dateEl = document.getElementById('home-date');
  if (dateEl) dateEl.textContent = todayLabel();
}

// ── Apply settings ────────────────────────────────────────────
function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--accent', settings.accentColor);
  root.style.setProperty('--bubble-user', settings.bubbleUserColor || settings.accentColor);
  root.style.setProperty('--chat-bg', settings.chatBg);
  const screen = document.getElementById('phone-screen');
  if (screen) screen.style.fontSize = settings.fontSize + 'px';
}

// ── Navigation ────────────────────────────────────────────────
function showView(name, pushHistory = true) {
  // update char info when entering chat
  if (name === 'chat') refreshCharHeader();

  document.querySelectorAll('.phone-view').forEach(v => {
    v.classList.remove('active','slide-left');
    if (v.id !== `view-${name}`) v.classList.add('slide-left');
  });
  const target = document.getElementById(`view-${name}`);
  if (target) {
    target.classList.remove('slide-left');
    setTimeout(() => target.classList.add('active'), 10);
  }

  // show/hide navbar
  const nav = document.getElementById('phone-nav-bar');
  const showNav = ['chat','notes','settings','home'].includes(name);
  nav.classList.toggle('visible', showNav);

  // update nav tabs
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.nav === name);
  });

  activeView = name;
}

function refreshCharHeader() {
  const charName = getCharDisplayName();
  const nameEl = document.getElementById('chat-char-name');
  if (nameEl) nameEl.textContent = charName;
  // Try to get avatar
  try {
    const ctx = getContext();
    const char = ctx.characters?.[ctx.characterId];
    if (char?.avatar) {
      const avatar = document.getElementById('chat-char-avatar');
      if (avatar) avatar.innerHTML = `<img src="/characters/${char.avatar}" alt="${charName}">`;
    }
  } catch {}
}

// ── Message rendering ─────────────────────────────────────────
function renderAllMessages() {
  const container = document.getElementById('phone-chat-messages');
  if (!container) return;
  container.innerHTML = '';
  if (phoneMessages.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:40px 20px;font-size:14px;font-family:-apple-system,sans-serif">
      Start a conversation with ${getCharDisplayName()} 💬<br><br>
      <small style="opacity:0.5">This chat is separate from the main ST chat</small>
    </div>`;
    return;
  }
  // Date divider at top
  container.insertAdjacentHTML('beforeend', `<div class="date-divider"><span>${todayLabel()}</span></div>`);
  phoneMessages.forEach(msg => appendBubble(msg, false));
  container.scrollTop = container.scrollHeight;
}

function appendBubble(msg, scroll = true) {
  const container = document.getElementById('phone-chat-messages');
  if (!container) return;
  const isUser = msg.role === 'user';

  let innerHtml = '';
  switch (msg.type) {
    case 'text':
      innerHtml = `<div class="bubble ${isUser?'user':'char'}" style="font-size:${settings.fontSize}px">${escHtml(msg.content)}</div>`;
      break;
    case 'sticker':
      innerHtml = `<div class="bubble sticker">${msg.content}</div>`;
      break;
    case 'image':
      innerHtml = `<div class="bubble image-msg"><img src="${msg.content}" alt="photo" loading="lazy"></div>`;
      break;
    case 'voice':
      innerHtml = buildVoiceBubble(msg, isUser);
      break;
    case 'location':
      innerHtml = buildLocationBubble(msg, isUser);
      break;
    case 'transfer':
      innerHtml = buildTransferBubble(msg, isUser);
      break;
    case 'note':
      innerHtml = `<div class="bubble note-msg ${isUser?'user':'char'}">
        <div class="note-label">📝 NOTE</div>
        <strong>${escHtml(msg.title||'')}</strong><br>${escHtml(msg.content)}
      </div>`;
      break;
    default:
      innerHtml = `<div class="bubble ${isUser?'user':'char'}">${escHtml(msg.content)}</div>`;
  }

  const charDisplayName = getCharDisplayName();
  const group = document.createElement('div');
  group.className = `msg-group ${isUser?'user':'char'}`;
  group.dataset.msgId = msg.id;

  if (!isUser) {
    group.innerHTML = `
      <div class="msg-avatar-row">
        <div class="msg-mini-avatar" id="mini-avatar-${msg.id}">🎭</div>
        <div>${innerHtml}</div>
      </div>
      <div class="bubble-time">${charDisplayName} · ${msg.time}</div>`;
    // Try real avatar
    try {
      const ctx = getContext();
      const char = ctx.characters?.[ctx.characterId];
      if (char?.avatar) {
        setTimeout(() => {
          const a = group.querySelector(`#mini-avatar-${msg.id}`);
          if (a) a.innerHTML = `<img src="/characters/${char.avatar}">`;
        }, 100);
      }
    } catch {}
  } else {
    group.innerHTML = `${innerHtml}<div class="bubble-time">${getUserName()} · ${msg.time}</div>`;
  }

  container.appendChild(group);
  if (scroll) container.scrollTop = container.scrollHeight;
}

function buildVoiceBubble(msg, isUser) {
  const bars = Array.from({length:14}, (_,i) => {
    const h = [6,10,16,20,14,8,18,12,20,10,6,14,18,8][i] || 8;
    return `<span style="height:${h}px"></span>`;
  }).join('');
  return `<div class="bubble voice-msg ${isUser?'user':'char'}">
    <button class="voice-play-btn" data-src="${msg.audioSrc||''}">▶</button>
    <div class="voice-waveform">${bars}</div>
    <span class="voice-duration">${msg.duration||'0:05'}</span>
  </div>`;
}

function buildLocationBubble(msg, isUser) {
  return `<div class="bubble location-msg ${isUser?'user':'char'}">
    <div class="location-map" style="position:relative">
      <span style="position:relative;z-index:1;font-size:36px">📍</span>
    </div>
    <div class="location-label">📍 ${msg.content||'Shared location'}</div>
  </div>`;
}

function buildTransferBubble(msg, isUser) {
  return `<div class="bubble transfer-msg ${isUser?'user':'char'}">
    <div class="transfer-amount">฿ ${msg.amount||'0'}</div>
    <div class="transfer-note">${msg.content||'Money transfer'} ✓</div>
  </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

function showTyping() {
  const container = document.getElementById('phone-chat-messages');
  if (!container) return;
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.className = 'typing-indicator';
  el.innerHTML = `<div class="msg-mini-avatar">🎭</div>
    <div class="typing-dots"><span></span><span></span><span></span></div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ── Send message & get AI reply ───────────────────────────────
async function sendMessage(content, type = 'text', extra = {}) {
  const msg = { id: uid(), role: 'user', type, content, time: now(), ...extra };
  phoneMessages.push(msg);
  appendBubble(msg);
  saveData();
  if (type === 'text' && content.trim()) await getAIReply(content);
}

async function getAIReply(userMsg) {
  showTyping();
  try {
    const ctx = getContext();
    const charName = getCharDisplayName();
    const charDesc = ctx.characters?.[ctx.characterId]?.description || '';
    const recentHistory = phoneMessages.slice(-20).map(m =>
      `${m.role==='user'?getUserName():charName}: ${m.content}`
    ).join('\n');

    const systemPrompt = `You are ${charName}. ${charDesc ? 'Character description: ' + charDesc : ''}
You are chatting via a private mobile phone messaging app with ${getUserName()}.
This is NOT the main roleplay — respond naturally, casually, like texting.
Keep replies short (1-4 sentences usually). Be in character. Use the chat history below.`;

    const resp = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `[Recent messages]\n${recentHistory}\n\n${getUserName()}: ${userMsg}\n${charName}:` }
        ]
      })
    });

    let replyText = '';
    if (resp.ok) {
      const data = await resp.json();
      replyText = data.choices?.[0]?.message?.content || data.output || '';
    }

    hideTyping();
    if (!replyText) { showToast('No reply from AI'); return; }

    const reply = { id: uid(), role: 'char', type: 'text', content: replyText.trim(), time: now() };
    phoneMessages.push(reply);
    appendBubble(reply);
    saveData();
  } catch (e) {
    hideTyping();
    console.warn('[PhoneChat] AI reply error', e);
    showToast('Could not get reply');
  }
}

async function getAINote() {
  showTyping();
  try {
    const ctx = getContext();
    const charName = getCharDisplayName();
    const charDesc = ctx.characters?.[ctx.characterId]?.description || '';

    const resp = await fetch('/api/backends/chat-completions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: `You are ${charName}. ${charDesc}` },
          { role: 'user', content: `Write a short personal note or memo in your phone notepad. Make it in-character. Respond with ONLY: TITLE: <title>\nBODY: <body>` }
        ]
      })
    });

    let txt = '';
    if (resp.ok) {
      const data = await resp.json();
      txt = data.choices?.[0]?.message?.content || data.output || '';
    }
    hideTyping();

    const titleMatch = txt.match(/TITLE:\s*(.+)/i);
    const bodyMatch = txt.match(/BODY:\s*([\s\S]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Note';
    const body = bodyMatch ? bodyMatch[1].trim() : txt.trim();

    const note = { id: uid(), author: 'char', title, body, date: now() };
    notes.push(note);
    saveData();
    renderNotes();

    // Also send as bubble if in chat
    const msg = { id: uid(), role: 'char', type: 'note', title, content: body.slice(0,80)+(body.length>80?'…':''), time: now() };
    phoneMessages.push(msg);
    appendBubble(msg);
    showToast(`${charName} wrote a note!`);
    saveData();
  } catch (e) {
    hideTyping();
    console.warn('[PhoneChat] AI note error', e);
    showToast('Could not generate note');
  }
}

// ── Sticker panel ─────────────────────────────────────────────
function renderStickerPanel() {
  const tabs = document.getElementById('sticker-tabs');
  const grid = document.getElementById('sticker-grid');
  if (!tabs || !grid) return;

  const packNames = Object.keys(stickers);
  tabs.innerHTML = packNames.map((p,i) =>
    `<button class="sticker-tab${i===0?' active':''}" data-pack="${p}">${p==='recent'?'🕐':p==='fun'?'🎨':p==='food'?'🍕':p==='hearts'?'❤️':'📦'}</button>`
  ).join('');

  const showPack = (pack) => {
    tabs.querySelectorAll('.sticker-tab').forEach(t => t.classList.toggle('active', t.dataset.pack===pack));
    grid.innerHTML = (stickers[pack]||[]).map(s =>
      `<div class="sticker-item" data-sticker="${s}">${s}</div>`
    ).join('');
  };

  showPack('recent');

  tabs.querySelectorAll('.sticker-tab').forEach(t =>
    t.addEventListener('click', () => showPack(t.dataset.pack))
  );

  grid.addEventListener('click', e => {
    const item = e.target.closest('.sticker-item');
    if (!item) return;
    sendMessage(item.dataset.sticker, 'sticker');
    // update recent
    const s = item.dataset.sticker;
    stickers.recent = [s, ...stickers.recent.filter(x => x !== s)].slice(0, 20);
    closePanels();
  });
}

function closePanels() {
  document.getElementById('phone-media-toolbar')?.classList.remove('open');
  document.getElementById('sticker-panel')?.classList.remove('open');
}

// ── Notes ─────────────────────────────────────────────────────
function renderNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  if (notes.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:40px 20px;font-size:14px;font-family:-apple-system,sans-serif">
      No notes yet.<br>Tap ＋ to add one, or 🤖 to let ${getCharDisplayName()} write one.
    </div>`;
    return;
  }
  list.innerHTML = notes.slice().reverse().map(n => `
    <div class="note-card" data-note-id="${n.id}">
      <div class="note-card-header">
        <span class="note-author-badge ${n.author}">${n.author==='user'?getUserName():getCharDisplayName()}</span>
        <span class="note-date">${n.date||''}</span>
      </div>
      <div class="note-card-title">${escHtml(n.title||'Untitled')}</div>
      <div class="note-card-preview">${escHtml(n.body||'')}</div>
    </div>`
  ).join('');

  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      const note = notes.find(n => n.id === card.dataset.noteId);
      if (note) openNoteEditor(note);
    });
  });
}

function openNoteEditor(note = null) {
  editingNoteId = note?.id || null;
  document.getElementById('note-editor-title').value = note?.title || '';
  document.getElementById('note-editor-body').value = note?.body || '';
  document.getElementById('note-editor-label').textContent = note ? 'Edit Note' : 'New Note';
  showView('note-editor');
}

function saveNote() {
  const title = document.getElementById('note-editor-title').value.trim() || 'Untitled';
  const body = document.getElementById('note-editor-body').value.trim();
  if (editingNoteId) {
    const idx = notes.findIndex(n => n.id === editingNoteId);
    if (idx >= 0) notes[idx] = { ...notes[idx], title, body, date: now() };
  } else {
    notes.push({ id: uid(), author: 'user', title, body, date: now() });
  }
  saveData();
  renderNotes();
  showView('notes');
  showToast('Note saved!');
}

// ── Media ─────────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => sendMessage(e.target.result, 'image');
  reader.readAsDataURL(file);
}

async function startVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    recordingStart = Date.now();
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const secs = Math.round((Date.now() - recordingStart) / 1000);
      const duration = `0:${String(secs).padStart(2,'0')}`;
      sendMessage('Voice message', 'voice', { audioSrc: url, duration });
      stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      showToast('Voice sent!');
    };
    mediaRecorder.start();
    isRecording = true;
    showToast('Recording… tap mic again to stop');
  } catch (e) {
    showToast('Mic access denied');
    console.warn('[PhoneChat] Mic error', e);
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
  }
}

function shareLocation() {
  if (!navigator.geolocation) { showToast('Geolocation not supported'); return; }
  showToast('Getting location…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      sendMessage(`${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'location');
    },
    () => {
      // fallback: send mock location
      sendMessage('Bangkok, Thailand', 'location');
      showToast('Using approximate location');
    }
  );
}

function openTransferModal() {
  document.getElementById('transfer-modal').classList.add('open');
}
function closeTransferModal() {
  document.getElementById('transfer-modal').classList.remove('open');
}
function confirmTransfer() {
  const amount = document.getElementById('transfer-amount').value;
  const note = document.getElementById('transfer-note').value || 'Transfer';
  if (!amount) { showToast('Enter an amount'); return; }
  sendMessage(note, 'transfer', { amount });
  document.getElementById('transfer-amount').value = '';
  document.getElementById('transfer-note').value = '';
  closeTransferModal();
}

// ── Settings handlers ─────────────────────────────────────────
function bindSettingsEvents() {
  // Color swatches
  document.getElementById('color-swatches')?.addEventListener('click', e => {
    const sw = e.target.closest('.swatch[data-color]');
    if (!sw) return;
    settings.accentColor = sw.dataset.color;
    settings.bubbleUserColor = sw.dataset.color;
    document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.toggle('active', s===sw));
    applySettings();
    saveData();
  });

  document.getElementById('bg-swatches')?.addEventListener('click', e => {
    const sw = e.target.closest('.swatch[data-bg]');
    if (!sw) return;
    settings.chatBg = sw.dataset.bg;
    document.querySelectorAll('#bg-swatches .swatch').forEach(s => s.classList.toggle('active', s===sw));
    applySettings();
    saveData();
  });

  document.getElementById('setting-fontsize')?.addEventListener('input', e => {
    settings.fontSize = parseInt(e.target.value);
    document.getElementById('font-size-val').textContent = settings.fontSize;
    applySettings();
    saveData();
  });

  document.getElementById('setting-username')?.addEventListener('change', e => {
    settings.userName = e.target.value.trim() || 'You';
    saveData();
  });

  document.getElementById('add-sticker-pack-btn')?.addEventListener('click', () => {
    const input = document.getElementById('sticker-input').value.trim();
    if (!input) return;
    const emojis = [...input].filter(c => c.trim());
    stickers.recent = [...new Set([...emojis, ...stickers.recent])].slice(0,30);
    renderStickerPanel();
    document.getElementById('sticker-input').value = '';
    saveData();
    showToast('Stickers added!');
  });

  document.getElementById('btn-export-chat')?.addEventListener('click', exportChat);
  document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    if (confirm('Clear ALL data for this character?')) {
      phoneMessages = [];
      notes = [];
      saveData();
      renderAllMessages();
      renderNotes();
      showToast('All data cleared');
    }
  });
  document.getElementById('btn-clear-chat')?.addEventListener('click', () => {
    if (confirm('Clear chat history?')) {
      phoneMessages = [];
      saveData();
      renderAllMessages();
    }
  });
}

function exportChat() {
  const charName = getCharDisplayName();
  const lines = phoneMessages.map(m =>
    `[${m.time}] ${m.role==='user'?getUserName():charName} (${m.type}): ${m.content}`
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `phone-chat-${charName}-${Date.now()}.txt`;
  a.click();
  showToast('Chat exported!');
}

// ── Main event bindings ───────────────────────────────────────
function bindEvents() {
  // FAB
  document.getElementById('phone-chat-fab')?.addEventListener('click', () => {
    isPhoneOpen = !isPhoneOpen;
    document.getElementById('phone-chat-overlay').classList.toggle('open', isPhoneOpen);
    if (isPhoneOpen) { loadForChar(); updateClock(); }
  });

  // Close overlay on backdrop click
  document.getElementById('phone-chat-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'phone-chat-overlay') {
      saveData();
      isPhoneOpen = false;
      document.getElementById('phone-chat-overlay').classList.remove('open');
    }
  });

  // Nav (all data-nav links)
  document.addEventListener('click', e => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl && document.getElementById('phone-chat-overlay')?.classList.contains('open')) {
      showView(navEl.dataset.nav);
    }
  });

  // Back buttons
  document.getElementById('chat-back-btn')?.addEventListener('click', () => showView('home'));
  document.getElementById('notes-back-btn')?.addEventListener('click', () => showView('home'));
  document.getElementById('settings-back-btn')?.addEventListener('click', () => showView('home'));
  document.getElementById('note-editor-back')?.addEventListener('click', () => showView('notes'));

  // Send
  const sendBtn = document.getElementById('phone-send-btn');
  const msgInput = document.getElementById('phone-message-input');
  const doSend = () => {
    const txt = msgInput.value.trim();
    if (!txt) return;
    msgInput.value = '';
    msgInput.style.height = '';
    closePanels();
    sendMessage(txt, 'text');
  };
  sendBtn?.addEventListener('click', doSend);
  msgInput?.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  msgInput?.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 80) + 'px';
  });

  // Media toolbar toggle
  document.getElementById('toggle-media-btn')?.addEventListener('click', () => {
    const toolbar = document.getElementById('phone-media-toolbar');
    const stickers = document.getElementById('sticker-panel');
    stickers.classList.remove('open');
    toolbar.classList.toggle('open');
  });

  // Sticker toggle
  document.getElementById('toggle-sticker-btn')?.addEventListener('click', () => {
    const toolbar = document.getElementById('phone-media-toolbar');
    const stickerPanel = document.getElementById('sticker-panel');
    toolbar.classList.remove('open');
    stickerPanel.classList.toggle('open');
    if (stickerPanel.classList.contains('open')) renderStickerPanel();
  });

  // Media actions
  document.getElementById('media-camera')?.addEventListener('click', () => {
    document.getElementById('phone-camera-input').click();
    closePanels();
  });
  document.getElementById('media-image')?.addEventListener('click', () => {
    document.getElementById('phone-image-input').click();
    closePanels();
  });
  document.getElementById('media-voice')?.addEventListener('click', () => {
    startVoiceRecording();
    closePanels();
  });
  document.getElementById('media-location')?.addEventListener('click', () => {
    shareLocation();
    closePanels();
  });
  document.getElementById('media-transfer')?.addEventListener('click', () => {
    openTransferModal();
    closePanels();
  });
  document.getElementById('media-note')?.addEventListener('click', () => {
    openNoteEditor();
    closePanels();
  });

  // File inputs
  document.getElementById('phone-image-input')?.addEventListener('change', e => handleImageFile(e.target.files[0]));
  document.getElementById('phone-camera-input')?.addEventListener('change', e => handleImageFile(e.target.files[0]));

  // Transfer modal
  document.getElementById('transfer-confirm')?.addEventListener('click', confirmTransfer);
  document.getElementById('transfer-cancel')?.addEventListener('click', closeTransferModal);

  // Notes
  document.getElementById('add-note-btn')?.addEventListener('click', () => openNoteEditor());
  document.getElementById('note-save-btn')?.addEventListener('click', saveNote);
  document.getElementById('btn-ai-note')?.addEventListener('click', getAINote);
  document.getElementById('btn-ai-note-home')?.addEventListener('click', getAINote);

  // Voice bubbles (play)
  document.getElementById('phone-chat-messages')?.addEventListener('click', e => {
    const playBtn = e.target.closest('.voice-play-btn');
    if (playBtn && playBtn.dataset.src) {
      const audio = new Audio(playBtn.dataset.src);
      audio.play();
    }
  });

  // Save before unload
  window.addEventListener('beforeunload', saveData);
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
  loadData();
  buildPhoneUI();
  applySettings();
  bindEvents();
  bindSettingsEvents();
  updateClock();
  setInterval(updateClock, 30000);
  // Show home view by default
  showView('home');
  console.log('[PhoneChat] Extension loaded ✓');
})();
