/**
 * PhoneChat Extension for SillyTavern
 * Phase 1: Chat App with iPhone UI, Bot replies, Call screen
 * Version: 1.0.0
 */

import { getContext, saveSettingsDebounced, extension_settings } from '../../../../script.js';
// Fallback for environments where imports differ
const MODULE = 'phone-chat';

// ── State ────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  accentColor: 'blue',
  lightMode: false,
  chatBg: '',
  userNotes: [],          // [{id, title, content, date}]
  botNotes: [],           // notes written by bot
  savedStickers: [],      // custom stickers (emoji / text)
  chatHistory: [],        // [{id, role, type, content, time}]
  botTypingSpeed: 'normal', // slow | normal | fast
  userName: '',
  userAvatar: '',
};

let settings = Object.assign({}, DEFAULT_SETTINGS);
let currentView = 'home';
let viewHistory = [];
let callTimer = null;
let callSeconds = 0;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let noteDirty = false;
let editingNoteId = null;
let isMuted = false;

const STICKER_PACKS = [
  '😀','😂','🥹','😍','🥰','😎','🤩','😢','😭','😡','🤬',
  '👍','👎','❤️','💔','🔥','💯','✨','🎉','🥳','😘','💋',
  '🤔','😴','🙄','😱','🫡','🫶','💪','🙏','👀','💀','🫠',
  '🌸','🌙','⭐','🌈','🍑','🍒','🍓','☕','🧋','🎵','🎶',
];

// ── Init ─────────────────────────────────────────────────────────────────────
jQuery(async () => {
  await loadSettings();
  buildPhoneUI();
  attachAllListeners();
  injectFAB();
  console.log('[PhoneChat] Extension loaded ✅');
});

function loadSettings() {
  if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
  settings = Object.assign({}, DEFAULT_SETTINGS, extension_settings[MODULE]);
}

function saveSettings() {
  extension_settings[MODULE] = settings;
  saveSettingsDebounced();
}

// ── FAB (Floating Action Button) ─────────────────────────────────────────────
function injectFAB() {
  if (document.getElementById('pc-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'pc-fab';
  fab.innerHTML = '📱<span class="pc-fab-notif"></span>';
  fab.title = 'เปิด PhoneChat';
  fab.addEventListener('click', openPhone);
  document.body.appendChild(fab);
}

// ── HTML Structure ────────────────────────────────────────────────────────────
function buildPhoneUI() {
  if (document.getElementById('pc-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pc-overlay';
  overlay.innerHTML = buildPhoneHTML();
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePhone();
  });
}

function buildPhoneHTML() {
  return `
<div id="pc-phone">

  <!-- Dynamic Island -->
  <div id="pc-island">
    <div class="pc-island-dot"></div>
    <div class="pc-island-camera"></div>
    <div class="pc-island-dot"></div>
  </div>

  <!-- Status Bar -->
  <div id="pc-statusbar">
    <span id="pc-clock">9:41</span>
    <div class="pc-status-right">
      <span>📶</span>
      <span>📡</span>
      <span>🔋</span>
    </div>
  </div>

  <!-- Screen -->
  <div id="pc-screen">

    <!-- ══ HOME ══ -->
    <div id="pc-view-home" class="pc-view active">
      <div class="pc-home-header">
        <h2 id="pc-home-greeting">สวัสดี 👋</h2>
        <p id="pc-home-sub">วันนี้เป็นยังไงบ้าง?</p>
      </div>
      <div class="pc-app-grid" id="pc-app-grid">
        <div class="pc-app-icon" data-app="chat">
          <div class="pc-app-icon-img ic-chat" id="pc-chat-app-icon">💬
            <span class="pc-app-badge" id="pc-chat-badge" style="display:none">1</span>
          </div>
          <span>ข้อความ</span>
        </div>
        <div class="pc-app-icon" data-app="notes">
          <div class="pc-app-icon-img ic-notes">📝</div>
          <span>โน้ต</span>
        </div>
        <div class="pc-app-icon" data-app="contacts">
          <div class="pc-app-icon-img ic-contacts">👥</div>
          <span>ผู้ติดต่อ</span>
        </div>
        <div class="pc-app-icon" data-app="sticker-mgr">
          <div class="pc-app-icon-img ic-sticker">🎭</div>
          <span>สติกเกอร์</span>
        </div>
        <div class="pc-app-icon" data-app="settings">
          <div class="pc-app-icon-img ic-settings">⚙️</div>
          <span>ตั้งค่า</span>
        </div>
      </div>
    </div>

    <!-- ══ CHAT ══ -->
    <div id="pc-view-chat" class="pc-view">
      <div class="pc-chat-header">
        <button class="pc-chat-header-back" id="pc-chat-back">‹</button>
        <div class="pc-chat-header-avatar" id="pc-chat-avatar">🤖</div>
        <div class="pc-chat-header-info">
          <div class="pc-chat-header-name" id="pc-chat-name">ตัวละคร</div>
          <div class="pc-chat-header-status" id="pc-chat-status">● ออนไลน์</div>
        </div>
        <div class="pc-chat-header-actions">
          <button id="pc-btn-call" title="โทร">📞</button>
          <button id="pc-btn-more" title="เพิ่มเติม">⋯</button>
        </div>
      </div>

      <div id="pc-messages"></div>
      <div id="pc-typing">
        <div class="pc-typing-avatar" id="pc-typing-avatar">🤖</div>
        <div class="pc-typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>

      <div id="pc-input-bar">
        <div class="pc-input-actions">
          <button class="pc-input-action-btn" id="pc-btn-attach" title="แนบ">＋</button>
        </div>
        <div class="pc-input-wrap">
          <textarea id="pc-input-text" placeholder="ข้อความ…" rows="1"></textarea>
        </div>
        <div class="pc-send-btns">
          <button class="pc-send-btn" id="pc-btn-send" title="ส่งข้อความ">▲</button>
          <button class="pc-send-btn" id="pc-btn-bot-reply" title="ให้บอทตอบ">🤖</button>
        </div>
      </div>

      <!-- Sheet Backdrop -->
      <div class="pc-sheet-backdrop" id="pc-sheet-backdrop"></div>

      <!-- Attach Sheet -->
      <div class="pc-action-sheet" id="pc-attach-sheet">
        <div class="pc-sheet-handle"></div>
        <div class="pc-sheet-title">แนบไฟล์</div>
        <div class="pc-attach-grid">
          <div class="pc-attach-item" data-type="photo">
            <div class="pc-attach-icon ai-photo">📷</div>
            <span>รูปภาพ</span>
          </div>
          <div class="pc-attach-item" data-type="audio">
            <div class="pc-attach-icon ai-audio">🎤</div>
            <span>คลิปเสียง</span>
          </div>
          <div class="pc-attach-item" data-type="location">
            <div class="pc-attach-icon ai-location">📍</div>
            <span>โลเคชั่น</span>
          </div>
          <div class="pc-attach-item" data-type="transfer">
            <div class="pc-attach-icon ai-transfer">💸</div>
            <span>โอนเงิน</span>
          </div>
          <div class="pc-attach-item" data-type="sticker">
            <div class="pc-attach-icon ai-sticker">🎭</div>
            <span>สติกเกอร์</span>
          </div>
        </div>
      </div>

      <!-- Sticker Sheet -->
      <div class="pc-action-sheet" id="pc-sticker-sheet">
        <div class="pc-sheet-handle"></div>
        <div class="pc-sheet-title">สติกเกอร์</div>
        <div class="pc-sticker-grid" id="pc-sticker-grid"></div>
      </div>

      <!-- Location Sheet -->
      <div class="pc-action-sheet" id="pc-location-sheet">
        <div class="pc-sheet-handle"></div>
        <div class="pc-sheet-title">แชร์โลเคชั่น</div>
        <div class="pc-location-map-preview">
          <div class="pc-location-grid"></div>
          <div class="pc-location-pin">📍</div>
        </div>
        <div style="padding:10px 16px 14px">
          <div style="font-size:14px;color:var(--pc-text2);margin-bottom:4px">📌 ตำแหน่งปัจจุบัน</div>
          <div style="font-size:13px;color:var(--pc-text3)" id="pc-location-text">กำลังค้นหาตำแหน่ง...</div>
        </div>
        <button class="pc-location-send-btn" id="pc-btn-send-location">ส่งโลเคชั่น</button>
      </div>

      <!-- Transfer Sheet -->
      <div class="pc-action-sheet" id="pc-transfer-sheet">
        <div class="pc-sheet-handle"></div>
        <div class="pc-sheet-title">โอนเงิน</div>
        <div class="pc-transfer-body">
          <label>จำนวนเงิน</label>
          <div class="pc-transfer-amount-wrap">
            <span class="pc-transfer-currency">฿</span>
            <input type="number" class="pc-transfer-input" id="pc-transfer-amount" placeholder="0.00">
          </div>
          <label>หมายเหตุ (ไม่บังคับ)</label>
          <input type="text" class="pc-transfer-note" id="pc-transfer-note" placeholder="เช่น ค่าข้าว">
          <button class="pc-transfer-confirm" id="pc-btn-confirm-transfer">โอนเงิน</button>
        </div>
      </div>

      <!-- Call Screen -->
      <div id="pc-call-screen">
        <div id="pc-call-bg"></div>
        <div class="pc-call-content">
          <div class="pc-call-avatar" id="pc-call-avatar">🤖</div>
          <div class="pc-call-name" id="pc-call-name">ตัวละคร</div>
          <div class="pc-call-status" id="pc-call-status-text">กำลังโทร...</div>
          <div class="pc-call-timer" id="pc-call-timer">0:00</div>
          <div id="pc-call-subtitles"></div>
        </div>
        <div id="pc-call-chat-wrap">
          <input type="text" id="pc-call-input" placeholder="พิมพ์ข้อความระหว่างโทร…">
          <button id="pc-call-send">▲</button>
        </div>
        <div class="pc-call-controls">
          <button class="pc-call-btn pcb-mute" id="pc-btn-mute">🔇</button>
          <button class="pc-call-btn pcb-end" id="pc-btn-end-call">📵</button>
          <button class="pc-call-btn pcb-speaker" id="pc-btn-speaker">🔊</button>
        </div>
      </div>
    </div>

    <!-- ══ NOTES ══ -->
    <div id="pc-view-notes" class="pc-view">
      <div class="pc-navbar">
        <button class="pc-back" id="pc-notes-back">‹ กลับ</button>
        <div class="pc-nav-title">โน้ต</div>
        <div class="pc-nav-right">
          <button class="pc-nav-btn" id="pc-btn-new-note">＋</button>
        </div>
      </div>
      <div class="pc-notes-list pc-scroll-view" id="pc-notes-list"></div>
    </div>

    <!-- ══ NOTE EDITOR ══ -->
    <div id="pc-view-note-editor" class="pc-view">
      <div class="pc-navbar">
        <button class="pc-back" id="pc-note-editor-back">‹ โน้ต</button>
        <div class="pc-nav-title" id="pc-note-editor-title">โน้ตใหม่</div>
        <div class="pc-nav-right">
          <button class="pc-nav-btn" id="pc-btn-save-note" style="font-size:14px;font-weight:600">บันทึก</button>
        </div>
      </div>
      <input type="text" id="pc-note-title-input" placeholder="หัวข้อ…">
      <textarea id="pc-note-content" placeholder="เขียนโน้ตที่นี่…"></textarea>
    </div>

    <!-- ══ CONTACTS ══ -->
    <div id="pc-view-contacts" class="pc-view">
      <div class="pc-navbar">
        <button class="pc-back" id="pc-contacts-back">‹ กลับ</button>
        <div class="pc-nav-title">ผู้ติดต่อ</div>
      </div>
      <div class="pc-contacts-search">
        <span>🔍</span>
        <input type="text" id="pc-contacts-search" placeholder="ค้นหา…">
      </div>
      <div class="pc-scroll-view" id="pc-contacts-list"></div>
    </div>

    <!-- ══ STICKER MANAGER ══ -->
    <div id="pc-view-sticker-mgr" class="pc-view">
      <div class="pc-navbar">
        <button class="pc-back" id="pc-sticker-mgr-back">‹ กลับ</button>
        <div class="pc-nav-title">จัดการสติกเกอร์</div>
        <div class="pc-nav-right">
          <button class="pc-nav-btn" id="pc-btn-add-sticker">＋</button>
        </div>
      </div>
      <div style="padding:16px">
        <div style="font-size:13px;color:var(--pc-text2);margin-bottom:12px">สติกเกอร์ที่บันทึกไว้</div>
        <div class="pc-sticker-grid" id="pc-saved-sticker-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:0"></div>
        <div style="margin-top:20px;font-size:13px;color:var(--pc-text2);margin-bottom:12px">เพิ่มสติกเกอร์ใหม่</div>
        <div style="display:flex;gap:8px">
          <input type="text" id="pc-new-sticker-input" placeholder="วางอีโมจิหรือข้อความ" style="flex:1;background:var(--pc-surface);border:1px solid var(--pc-border);border-radius:12px;padding:10px 14px;color:var(--pc-text);font-size:18px;outline:none;font-family:var(--pc-font)">
          <button id="pc-btn-save-sticker" style="background:var(--pc-accent);color:#fff;border:none;border-radius:12px;padding:10px 16px;font-size:14px;cursor:pointer;font-family:var(--pc-font);font-weight:600">เพิ่ม</button>
        </div>
      </div>
    </div>

    <!-- ══ SETTINGS ══ -->
    <div id="pc-view-settings" class="pc-view">
      <div class="pc-navbar">
        <button class="pc-back" id="pc-settings-back">‹ กลับ</button>
        <div class="pc-nav-title">ตั้งค่า</div>
      </div>
      <div class="pc-scroll-view">
        <div class="pc-settings-section">
          <div class="pc-settings-label">การแสดงผล</div>
          <div class="pc-settings-group">
            <div class="pc-settings-row">
              <div class="pc-settings-row-icon" style="background:#1c1c1e">🌙</div>
              <div class="pc-settings-row-label">โหมดมืด</div>
              <button class="pc-toggle" id="pc-toggle-dark" data-pref="lightMode" data-invert="true"></button>
            </div>
            <div class="pc-settings-row">
              <div class="pc-settings-row-icon" style="background:#0a84ff">🎨</div>
              <div class="pc-settings-row-label">สีธีม</div>
            </div>
            <div class="pc-color-picker-row">
              <div class="pc-color-opt" data-color="blue" style="background:#0a84ff" title="น้ำเงิน"></div>
              <div class="pc-color-opt" data-color="green" style="background:#30d158" title="เขียว"></div>
              <div class="pc-color-opt" data-color="pink" style="background:#ff375f" title="ชมพู"></div>
              <div class="pc-color-opt" data-color="purple" style="background:#bf5af2" title="ม่วง"></div>
              <div class="pc-color-opt" data-color="yellow" style="background:#ffd60a" title="เหลือง"></div>
              <div class="pc-color-opt" data-color="orange" style="background:#ff9f0a" title="ส้ม"></div>
            </div>
          </div>
        </div>

        <div class="pc-settings-section">
          <div class="pc-settings-label">แชท</div>
          <div class="pc-settings-group">
            <div class="pc-settings-row" id="pc-row-bg">
              <div class="pc-settings-row-icon" style="background:#2c2c2e">🖼️</div>
              <div class="pc-settings-row-label">พื้นหลังแชท</div>
              <span class="pc-settings-row-chevron">›</span>
            </div>
            <div class="pc-settings-row">
              <div class="pc-settings-row-icon" style="background:#3a3a3c">⚡</div>
              <div class="pc-settings-row-label">ความเร็วการตอบบอท</div>
              <select id="pc-select-speed" style="background:none;border:none;color:var(--pc-text2);font-size:14px;font-family:var(--pc-font);outline:none;cursor:pointer">
                <option value="slow">ช้า</option>
                <option value="normal" selected>ปกติ</option>
                <option value="fast">เร็ว</option>
              </select>
            </div>
            <div class="pc-settings-row" id="pc-row-clear-chat">
              <div class="pc-settings-row-icon" style="background:#ff453a">🗑️</div>
              <div class="pc-settings-row-label" style="color:var(--pc-red)">ล้างประวัติแชท</div>
            </div>
          </div>
        </div>

        <div class="pc-settings-section">
          <div class="pc-settings-label">โปรไฟล์</div>
          <div class="pc-settings-group">
            <div class="pc-settings-row" id="pc-row-username">
              <div class="pc-settings-row-icon" style="background:#636366">👤</div>
              <div class="pc-settings-row-label">ชื่อของฉัน</div>
              <span class="pc-settings-row-value" id="pc-display-username">ผู้ใช้</span>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /#pc-screen -->

  <!-- Bottom Dock -->
  <div id="pc-dock">
    <button class="pc-dock-btn active" data-view="home">
      <span class="pc-dock-icon">🏠</span>
      <span class="pc-dock-label">หน้าหลัก</span>
    </button>
    <button class="pc-dock-btn" data-view="chat">
      <span class="pc-dock-icon">💬</span>
      <span class="pc-dock-label">แชท</span>
    </button>
    <button class="pc-dock-btn" data-view="notes">
      <span class="pc-dock-icon">📝</span>
      <span class="pc-dock-label">โน้ต</span>
    </button>
    <button class="pc-dock-btn" data-view="settings">
      <span class="pc-dock-icon">⚙️</span>
      <span class="pc-dock-label">ตั้งค่า</span>
    </button>
  </div>

  <!-- Home Indicator -->
  <div id="pc-home-indicator">
    <div id="pc-home-indicator-bar"></div>
  </div>

</div><!-- /#pc-phone -->
`;
}

// ── Open / Close Phone ────────────────────────────────────────────────────────
function openPhone() {
  document.getElementById('pc-overlay').classList.add('open');
  applySettings();
  updateClock();
  setInterval(updateClock, 60000);
  refreshHome();
  refreshChatHeader();
  renderMessages();
  renderNotesList();
  renderContacts();
  renderStickerGrid();
  renderSavedStickers();
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

function closePhone() {
  // Save everything before closing
  autoSaveBeforeClose();
  document.getElementById('pc-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function autoSaveBeforeClose() {
  // Save note in progress
  if (currentView === 'note-editor' && noteDirty) {
    saveCurrentNote();
  }
  saveSettings();
}

// ── Apply Settings ────────────────────────────────────────────────────────────
function applySettings() {
  const phone = document.getElementById('pc-phone');
  phone.dataset.accent = settings.accentColor;
  phone.classList.toggle('light', settings.lightMode);

  const msgs = document.getElementById('pc-messages');
  if (settings.chatBg) {
    msgs.style.backgroundImage = `url('${settings.chatBg}')`;
  } else {
    msgs.style.backgroundImage = '';
  }

  const darkToggle = document.getElementById('pc-toggle-dark');
  if (darkToggle) darkToggle.classList.toggle('on', !settings.lightMode);

  const speedSel = document.getElementById('pc-select-speed');
  if (speedSel) speedSel.value = settings.botTypingSpeed || 'normal';

  // Color options
  document.querySelectorAll('.pc-color-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === settings.accentColor);
  });

  const unameEl = document.getElementById('pc-display-username');
  if (unameEl) unameEl.textContent = settings.userName || 'ผู้ใช้';
}

// ── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const el = document.getElementById('pc-clock');
  if (el) el.textContent = `${h}:${m}`;
}

// ── View Navigation ───────────────────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.pc-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`pc-view-${viewId}`);
  if (target) {
    target.classList.add('active');
    viewHistory.push(currentView);
    currentView = viewId;
  }
  updateDockActive(viewId);
}

function updateDockActive(viewId) {
  const map = { home: 'home', chat: 'chat', notes: 'notes', settings: 'settings' };
  document.querySelectorAll('.pc-dock-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === (map[viewId] || viewId));
  });
}

function goBack() {
  const prev = viewHistory.pop() || 'home';
  document.querySelectorAll('.pc-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`pc-view-${prev}`);
  if (target) {
    target.classList.add('active');
    currentView = prev;
  }
  updateDockActive(prev);
}

// ── Home ─────────────────────────────────────────────────────────────────────
function refreshHome() {
  const ctx = getContext ? getContext() : null;
  const charName = ctx?.name2 || 'ตัวละคร';
  const userName = settings.userName || ctx?.name1 || 'คุณ';
  settings.userName = userName;

  const hour = new Date().getHours();
  let greeting = hour < 12 ? 'สวัสดีตอนเช้า ☀️' : hour < 18 ? 'สวัสดีตอนบ่าย 🌤️' : 'สวัสดีตอนเย็น 🌙';

  const greetEl = document.getElementById('pc-home-greeting');
  if (greetEl) greetEl.textContent = `${greeting}, ${userName}`;

  const subEl = document.getElementById('pc-home-sub');
  if (subEl) subEl.textContent = charName ? `${charName} รอคุณอยู่นะ 💭` : 'วันนี้เป็นยังไงบ้าง?';
}

// ── Chat Header ───────────────────────────────────────────────────────────────
function refreshChatHeader() {
  const ctx = getContext ? getContext() : null;
  const charName = ctx?.name2 || 'ตัวละคร';
  const avatarUrl = ctx?.characterAvatar || '';

  const nameEl = document.getElementById('pc-chat-name');
  if (nameEl) nameEl.textContent = charName;

  const callNameEl = document.getElementById('pc-call-name');
  if (callNameEl) callNameEl.textContent = charName;

  // Avatar
  ['pc-chat-avatar', 'pc-typing-avatar', 'pc-call-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (avatarUrl) {
      el.innerHTML = `<img src="${avatarUrl}" alt="${charName}" onerror="this.parentElement.textContent='🤖'">`;
    } else {
      el.textContent = '🤖';
    }
  });

  // Call background
  const callBg = document.getElementById('pc-call-bg');
  if (callBg && avatarUrl) {
    callBg.style.backgroundImage = `url('${avatarUrl}')`;
  }
}

// ── Messages Rendering ────────────────────────────────────────────────────────
function renderMessages() {
  const container = document.getElementById('pc-messages');
  if (!container) return;
  container.innerHTML = '';

  if (settings.chatHistory.length === 0) {
    const ctx = getContext ? getContext() : null;
    const charName = ctx?.name2 || 'ตัวละคร';
    container.innerHTML = `
      <div class="pc-empty-state">
        <div class="pc-empty-icon">💬</div>
        <p>เริ่มสนทนากับ<br><strong style="color:var(--pc-text)">${charName}</strong></p>
      </div>`;
    return;
  }

  // Group by date
  let lastDate = '';
  settings.chatHistory.forEach(msg => {
    const msgDate = new Date(msg.time).toLocaleDateString('th-TH', { day:'numeric', month:'short' });
    if (msgDate !== lastDate) {
      lastDate = msgDate;
      const dateEl = document.createElement('div');
      dateEl.className = 'pc-msg-date';
      dateEl.textContent = msgDate;
      container.appendChild(dateEl);
    }
    container.appendChild(buildMessageEl(msg));
  });

  container.scrollTop = container.scrollHeight;
}

function buildMessageEl(msg) {
  const isOut = msg.role === 'user';
  const ctx = getContext ? getContext() : null;
  const avatarUrl = ctx?.characterAvatar || '';
  const userAvatarUrl = settings.userAvatar || '';

  const row = document.createElement('div');
  row.className = `pc-msg-row ${isOut ? 'out' : 'in'}`;
  row.dataset.id = msg.id;

  let bubbleHTML = '';
  switch (msg.type) {
    case 'sticker':
      bubbleHTML = `<div class="pc-bubble sticker">${msg.content}</div>`;
      break;
    case 'image':
      bubbleHTML = `<div class="pc-bubble image-msg"><img src="${msg.content}" class="pc-photo-preview"></div>`;
      break;
    case 'location':
      bubbleHTML = `<div class="pc-bubble location-msg">📍 <span>${msg.content}</span></div>`;
      break;
    case 'transfer':
      bubbleHTML = `<div class="pc-bubble transfer-msg">
        <div style="font-size:13px;margin-bottom:4px;opacity:0.7">โอนเงิน</div>
        <div class="transfer-amount">฿${msg.amount}</div>
        ${msg.note ? `<div style="font-size:13px;margin-top:4px;opacity:0.7">${msg.note}</div>` : ''}
      </div>`;
      break;
    case 'audio':
      bubbleHTML = `<div class="pc-bubble audio-msg">
        <button class="pc-audio-play" data-src="${msg.content}">▶</button>
        <div class="pc-audio-wave">${generateWave()}</div>
        <span style="font-size:11px;color:var(--pc-text3)">${msg.duration || '0:05'}</span>
      </div>`;
      break;
    default:
      bubbleHTML = `<div class="pc-bubble">${escapeHtml(msg.content)}</div>`;
  }

  const timeStr = new Date(msg.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  const avatarEl = !isOut ? `<div class="pc-msg-avatar">${
    avatarUrl ? `<img src="${avatarUrl}" onerror="this.parentElement.textContent='🤖'">` : '🤖'
  }</div>` : '';

  row.innerHTML = `
    ${avatarEl}
    <div class="pc-bubble-wrap">
      ${bubbleHTML}
      <div class="pc-msg-time">${timeStr}${isOut ? ' ✓✓' : ''}</div>
    </div>`;

  // Re-roll bot message on long press
  if (!isOut) {
    let pressTimer;
    row.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => showMsgMenu(msg.id), 600);
    });
    row.addEventListener('touchend', () => clearTimeout(pressTimer));
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); showMsgMenu(msg.id); });
  }

  return row;
}

function generateWave() {
  const heights = [6,10,16,20,14,18,22,14,10,8,12,16,20,16,10,8,14,18,12,8];
  return heights.map(h => `<span style="height:${h}px"></span>`).join('');
}

function showMsgMenu(msgId) {
  const msg = settings.chatHistory.find(m => m.id === msgId);
  if (!msg || msg.role === 'user') return;
  const idx = settings.chatHistory.indexOf(msg);
  if (confirm(`🔄 สร้างคำตอบใหม่สำหรับข้อความนี้?`)) {
    settings.chatHistory.splice(idx, 1);
    saveSettings();
    renderMessages();
    triggerBotReply();
  }
}

// ── Send User Message ─────────────────────────────────────────────────────────
function sendUserMessage(content, type = 'text', extra = {}) {
  const msg = {
    id: Date.now().toString(),
    role: 'user',
    type,
    content,
    time: new Date().toISOString(),
    ...extra
  };
  settings.chatHistory.push(msg);
  saveSettings();
  appendMessage(msg);

  const container = document.getElementById('pc-messages');
  // Remove empty state
  const empty = container.querySelector('.pc-empty-state');
  if (empty) empty.remove();

  container.scrollTop = container.scrollHeight;

  // Check if bot should mention note changes
  checkNoteChangeMention();
}

function appendMessage(msg) {
  const container = document.getElementById('pc-messages');
  if (!container) return;

  // Remove empty state
  const empty = container.querySelector('.pc-empty-state');
  if (empty) empty.remove();

  const el = buildMessageEl(msg);
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ── Bot Reply ─────────────────────────────────────────────────────────────────
async function triggerBotReply(customPrompt = null) {
  const ctx = getContext ? getContext() : null;
  if (!ctx) {
    appendBotMessage('ไม่พบตัวละคร กรุณาเลือกตัวละครใน SillyTavern ก่อนนะคะ');
    return;
  }

  showTyping(true);

  try {
    // Build context for the bot
    const history = settings.chatHistory.slice(-10).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.type === 'text' ? m.content : `[${m.type}: ${m.content || ''}]`
    }));

    const charName = ctx.name2 || 'ตัวละคร';
    const userName = settings.userName || ctx.name1 || 'ผู้ใช้';
    const charDesc = ctx.description || ctx.personality || '';
    const userNotesText = settings.userNotes.length
      ? `\n\n[บันทึกของ ${userName}: ${settings.userNotes.map(n => n.title + ': ' + n.content).join(' | ')}]`
      : '';

    const systemPrompt = `คุณคือ ${charName}. ตอบเหมือนมนุษย์จริงๆ ในบทสนทนาผ่านมือถือ ตอบภาษาไทยเท่านั้น ห้ามใช้ภาษาอื่น ตอบสั้นๆ เป็นธรรมชาติเหมือนส่ง SMS/LINE ไม่ต้องมีพิธีรีตอง ไม่มีการโรลเพลย์ใดๆ ทั้งสิ้น ตอบตรงๆ เหมือนคนจริง
${charDesc}${userNotesText}`;

    const speedMap = { slow: 2000, normal: 1000, fast: 300 };
    const delay = speedMap[settings.botTypingSpeed || 'normal'];
    await sleep(delay + Math.random() * 800);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: customPrompt
          ? [...history, { role: 'user', content: customPrompt }]
          : history.length > 0 ? history : [{ role: 'user', content: 'สวัสดี' }]
      })
    });

    const data = await response.json();
    let reply = data?.content?.[0]?.text || 'ขอโทษนะ ตอบไม่ได้ตอนนี้';

    showTyping(false);
    const botMsg = {
      id: Date.now().toString(),
      role: 'bot',
      type: 'text',
      content: reply,
      time: new Date().toISOString()
    };
    settings.chatHistory.push(botMsg);
    saveSettings();
    appendMessage(botMsg);

  } catch (err) {
    showTyping(false);
    console.error('[PhoneChat] Bot reply error:', err);
    appendBotMessage('ขอโทษค่ะ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  }
}

function appendBotMessage(text) {
  const msg = {
    id: Date.now().toString(),
    role: 'bot',
    type: 'text',
    content: text,
    time: new Date().toISOString()
  };
  settings.chatHistory.push(msg);
  saveSettings();
  appendMessage(msg);
}

// ── Typing Indicator ──────────────────────────────────────────────────────────
function showTyping(show) {
  const el = document.getElementById('pc-typing');
  if (el) el.classList.toggle('show', show);
  const container = document.getElementById('pc-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

// ── Call Screen ───────────────────────────────────────────────────────────────
function startCall() {
  const screen = document.getElementById('pc-call-screen');
  if (!screen) return;
  screen.classList.add('active');

  const ctx = getContext ? getContext() : null;
  const avatarUrl = ctx?.characterAvatar || '';
  const callBg = document.getElementById('pc-call-bg');
  if (callBg) callBg.style.backgroundImage = avatarUrl ? `url('${avatarUrl}')` : 'linear-gradient(135deg,#1a1a2e,#16213e)';

  const statusEl = document.getElementById('pc-call-status-text');
  if (statusEl) statusEl.textContent = 'กำลังโทร...';

  const timerEl = document.getElementById('pc-call-timer');
  if (timerEl) timerEl.classList.remove('show');

  clearSubtitles();

  // Simulate connection after 2s
  setTimeout(() => {
    if (statusEl) statusEl.textContent = 'กำลังคุย';
    if (timerEl) timerEl.classList.add('show');
    callSeconds = 0;
    callTimer = setInterval(updateCallTimer, 1000);
    triggerCallBotLine();
  }, 2000);
}

function updateCallTimer() {
  callSeconds++;
  const m = Math.floor(callSeconds / 60);
  const s = (callSeconds % 60).toString().padStart(2, '0');
  const el = document.getElementById('pc-call-timer');
  if (el) el.textContent = `${m}:${s}`;
}

function endCall() {
  clearInterval(callTimer);
  callTimer = null;
  callSeconds = 0;
  const screen = document.getElementById('pc-call-screen');
  if (screen) screen.classList.remove('active');

  const timerEl = document.getElementById('pc-call-timer');
  if (timerEl) timerEl.classList.remove('show');

  clearSubtitles();
}

function clearSubtitles() {
  const el = document.getElementById('pc-call-subtitles');
  if (el) el.innerHTML = '';
}

async function triggerCallBotLine() {
  const ctx = getContext ? getContext() : null;
  if (!ctx) return;
  const charName = ctx.name2 || 'ตัวละคร';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 120,
        system: `คุณคือ ${charName} กำลังรับโทรศัพท์ พูดสั้นๆ เป็นธรรมชาติ 1-2 ประโยค ภาษาไทยเท่านั้น เหมือนรับสายจริงๆ`,
        messages: [{ role: 'user', content: 'รับสาย' }]
      })
    });
    const data = await response.json();
    const line = data?.content?.[0]?.text || `${charName} รับสายแล้วนะ สวัสดี~`;
    addCallSubtitle(line);
  } catch {
    addCallSubtitle('สวัสดี รับสายแล้วนะ~');
  }
}

function addCallSubtitle(text) {
  const container = document.getElementById('pc-call-subtitles');
  if (!container) return;

  // Show word by word with delays
  const words = text.split('');
  const lineEl = document.createElement('div');
  lineEl.className = 'pc-call-line';
  lineEl.textContent = '';
  container.appendChild(lineEl);

  const speedMap = { slow: 120, normal: 60, fast: 25 };
  const charDelay = speedMap[settings.botTypingSpeed || 'normal'];

  let i = 0;
  const interval = setInterval(() => {
    if (i < words.length) {
      lineEl.textContent += words[i++];
    } else {
      clearInterval(interval);
      // Fade out after 4s
      setTimeout(() => {
        lineEl.style.transition = 'opacity 1s';
        lineEl.style.opacity = '0';
        setTimeout(() => lineEl.remove(), 1000);
      }, 4000);
    }
  }, charDelay);
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function renderNotesList() {
  const container = document.getElementById('pc-notes-list');
  if (!container) return;

  const allNotes = [
    ...settings.userNotes.map(n => ({ ...n, author: 'user' })),
    ...settings.botNotes.map(n => ({ ...n, author: 'bot' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (allNotes.length === 0) {
    container.innerHTML = `<div class="pc-empty-state" style="margin-top:60px">
      <div class="pc-empty-icon">📝</div>
      <p>ยังไม่มีโน้ต<br>กด + เพื่อเพิ่ม</p>
    </div>`;
    return;
  }

  container.innerHTML = allNotes.map(note => {
    const ctx = getContext ? getContext() : null;
    const charName = ctx?.name2 || 'ตัวละคร';
    const authorLabel = note.author === 'bot' ? `✍️ ${charName}` : '';
    return `
    <div class="pc-note-card" data-note-id="${note.id}" data-author="${note.author}">
      ${authorLabel ? `<div class="pc-note-author">${authorLabel}</div>` : ''}
      <h4>${escapeHtml(note.title || 'ไม่มีหัวข้อ')}</h4>
      <p>${escapeHtml(note.content || '')}</p>
      <div class="pc-note-meta">${new Date(note.date).toLocaleDateString('th-TH')}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.pc-note-card').forEach(card => {
    card.addEventListener('click', () => {
      const noteId = card.dataset.noteId;
      const author = card.dataset.author;
      const noteArr = author === 'bot' ? settings.botNotes : settings.userNotes;
      const note = noteArr.find(n => n.id === noteId);
      if (note) openNoteEditor(note, author === 'bot');
    });
  });
}

function openNoteEditor(note = null, readOnly = false) {
  editingNoteId = note?.id || null;
  noteDirty = false;
  const titleInput = document.getElementById('pc-note-title-input');
  const contentArea = document.getElementById('pc-note-content');
  const editorTitle = document.getElementById('pc-note-editor-title');
  const saveBtn = document.getElementById('pc-btn-save-note');

  if (titleInput) titleInput.value = note?.title || '';
  if (contentArea) contentArea.value = note?.content || '';
  if (editorTitle) editorTitle.textContent = note ? 'แก้ไขโน้ต' : 'โน้ตใหม่';

  if (readOnly) {
    if (titleInput) titleInput.readOnly = true;
    if (contentArea) contentArea.readOnly = true;
    if (saveBtn) saveBtn.style.display = 'none';
  } else {
    if (titleInput) titleInput.readOnly = false;
    if (contentArea) contentArea.readOnly = false;
    if (saveBtn) saveBtn.style.display = '';
  }

  showView('note-editor');
}

function saveCurrentNote() {
  const title = document.getElementById('pc-note-title-input')?.value.trim() || '';
  const content = document.getElementById('pc-note-content')?.value.trim() || '';

  if (!title && !content) return;

  if (editingNoteId) {
    const idx = settings.userNotes.findIndex(n => n.id === editingNoteId);
    if (idx !== -1) {
      settings.userNotes[idx] = { ...settings.userNotes[idx], title, content, date: new Date().toISOString() };
    }
  } else {
    settings.userNotes.unshift({
      id: Date.now().toString(),
      title,
      content,
      date: new Date().toISOString()
    });
  }

  noteDirty = false;
  saveSettings();
  renderNotesList();
}

function checkNoteChangeMention() {
  // If notes changed recently, maybe bot notices
  if (settings.userNotes.length > 0) {
    const lastNote = settings.userNotes[0];
    const noteAge = Date.now() - new Date(lastNote.date).getTime();
    if (noteAge < 300000) { // 5 minutes
      // 30% chance bot mentions note
      if (Math.random() < 0.3) {
        const el = document.createElement('div');
        el.className = 'pc-note-mention';
        el.innerHTML = `<strong>📝 ${lastNote.title}</strong> — บันทึกไว้แล้ว`;
        const msgs = document.getElementById('pc-messages');
        if (msgs) msgs.appendChild(el);
      }
    }
  }
}

// ── Contacts ─────────────────────────────────────────────────────────────────
function renderContacts() {
  const container = document.getElementById('pc-contacts-list');
  if (!container) return;

  const ctx = getContext ? getContext() : null;
  // Get all characters from ST if available
  let chars = [];
  if (ctx?.characters) {
    chars = ctx.characters.slice(0, 20).map(c => ({
      name: c.name,
      avatar: c.avatar,
      sub: c.personality?.slice(0, 40) || 'ตัวละคร'
    }));
  }

  if (chars.length === 0) {
    const charName = ctx?.name2 || 'ตัวละคร';
    chars = [{
      name: charName,
      avatar: ctx?.characterAvatar || '',
      sub: 'ตัวละครปัจจุบัน'
    }];
  }

  container.innerHTML = chars.map(c => `
    <div class="pc-contact-item" data-char="${escapeHtml(c.name)}">
      <div class="pc-contact-avatar">${
        c.avatar
          ? `<img src="${c.avatar}" onerror="this.parentElement.textContent='👤'">`
          : '👤'
      }</div>
      <div>
        <div class="pc-contact-name">${escapeHtml(c.name)}</div>
        <div class="pc-contact-sub">${escapeHtml(c.sub)}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.pc-contact-item').forEach(item => {
    item.addEventListener('click', () => {
      showView('chat');
      refreshChatHeader();
    });
  });
}

// ── Stickers ─────────────────────────────────────────────────────────────────
function renderStickerGrid() {
  const grid = document.getElementById('pc-sticker-grid');
  if (!grid) return;
  const allStickers = [...STICKER_PACKS, ...settings.savedStickers];
  grid.innerHTML = allStickers.map(s => `
    <div class="pc-sticker-item" data-sticker="${escapeHtml(s)}">${s}</div>
  `).join('');

  grid.querySelectorAll('.pc-sticker-item').forEach(item => {
    item.addEventListener('click', () => {
      sendUserMessage(item.dataset.sticker, 'sticker');
      closeAllSheets();
    });
  });
}

function renderSavedStickers() {
  const grid = document.getElementById('pc-saved-sticker-grid');
  if (!grid) return;
  if (settings.savedStickers.length === 0) {
    grid.innerHTML = '<div style="color:var(--pc-text3);font-size:13px;grid-column:span 5">ยังไม่มีสติกเกอร์ที่บันทึก</div>';
    return;
  }
  grid.innerHTML = settings.savedStickers.map((s, i) => `
    <div class="pc-sticker-item" data-sticker="${escapeHtml(s)}" data-idx="${i}" style="position:relative">
      ${s}
      <span data-del="${i}" style="position:absolute;top:2px;right:2px;font-size:10px;background:var(--pc-red);color:#fff;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;cursor:pointer">×</span>
    </div>
  `).join('');

  grid.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.del);
      settings.savedStickers.splice(idx, 1);
      saveSettings();
      renderSavedStickers();
    });
  });
}

// ── Sheets ────────────────────────────────────────────────────────────────────
function openSheet(sheetId) {
  closeAllSheets();
  const sheet = document.getElementById(sheetId);
  const backdrop = document.getElementById('pc-sheet-backdrop');
  if (sheet) sheet.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeAllSheets() {
  document.querySelectorAll('.pc-action-sheet').forEach(s => s.classList.remove('open'));
  const backdrop = document.getElementById('pc-sheet-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

// ── Location ─────────────────────────────────────────────────────────────────
function fetchLocation() {
  const el = document.getElementById('pc-location-text');
  if (!navigator.geolocation) {
    if (el) el.textContent = 'ไม่รองรับ GPS';
    return;
  }
  if (el) el.textContent = 'กำลังค้นหา...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(4);
      const lng = pos.coords.longitude.toFixed(4);
      if (el) el.textContent = `${lat}, ${lng}`;
    },
    () => {
      if (el) el.textContent = 'Bangkok, Thailand (ตัวอย่าง)';
    }
  );
}

// ── Audio Recording ───────────────────────────────────────────────────────────
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      sendUserMessage(url, 'audio', { duration: '0:' + callSeconds.toString().padStart(2, '0') });
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    isRecording = true;
    closeAllSheets();
    toastNotify('🔴 กำลังบันทึก... กด ⊕ เพื่อหยุด');
  } catch {
    toastNotify('ไม่สามารถเข้าถึงไมค์ได้');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}

// ── Photo ─────────────────────────────────────────────────────────────────────
function openPhotoPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      sendUserMessage(ev.target.result, 'image');
      closeAllSheets();
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toastNotify(text) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:absolute;bottom:120px;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:20px;
    font-size:13px;font-family:var(--pc-font);z-index:500;white-space:nowrap;
    animation:pc-msg-in 0.3s ease;
  `;
  toast.textContent = text;
  document.getElementById('pc-screen')?.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ── Settings Actions ─────────────────────────────────────────────────────────
function pickChatBg() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      settings.chatBg = ev.target.result;
      saveSettings();
      applySettings();
      toastNotify('✅ เปลี่ยนพื้นหลังแล้ว');
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function attachAllListeners() {
  // Overlay close button (top right)
  // (handled by overlay click)

  // App icons on home
  document.addEventListener('click', (e) => {
    const appIcon = e.target.closest('.pc-app-icon');
    if (appIcon) {
      const app = appIcon.dataset.app;
      if (app === 'chat') { showView('chat'); }
      else if (app === 'notes') { showView('notes'); renderNotesList(); }
      else if (app === 'contacts') { showView('contacts'); renderContacts(); }
      else if (app === 'sticker-mgr') { showView('sticker-mgr'); renderSavedStickers(); }
      else if (app === 'settings') { showView('settings'); applySettings(); }
    }
  });

  // Dock buttons
  document.querySelectorAll('.pc-dock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      showView(view);
      if (view === 'notes') renderNotesList();
      if (view === 'settings') applySettings();
    });
  });

  // Back buttons
  on('pc-chat-back', 'click', () => showView('home'));
  on('pc-notes-back', 'click', () => showView('home'));
  on('pc-contacts-back', 'click', () => showView('home'));
  on('pc-settings-back', 'click', () => showView('home'));
  on('pc-sticker-mgr-back', 'click', () => showView('home'));
  on('pc-note-editor-back', 'click', () => {
    if (noteDirty) saveCurrentNote();
    showView('notes');
  });

  // Chat input auto-resize
  on('pc-input-text', 'input', (e) => {
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
  });
  on('pc-input-text', 'keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // Send buttons
  on('pc-btn-send', 'click', sendChat);
  on('pc-btn-bot-reply', 'click', () => triggerBotReply());

  // Attach button
  on('pc-btn-attach', 'click', () => {
    if (document.getElementById('pc-attach-sheet')?.classList.contains('open')) {
      closeAllSheets();
    } else {
      openSheet('pc-attach-sheet');
    }
  });

  // Attach sheet items
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.pc-attach-item');
    if (!item) return;
    const type = item.dataset.type;
    if (type === 'photo') { closeAllSheets(); openPhotoPicker(); }
    else if (type === 'audio') { closeAllSheets(); toggleRecording(); }
    else if (type === 'location') { closeAllSheets(); openSheet('pc-location-sheet'); fetchLocation(); }
    else if (type === 'transfer') { closeAllSheets(); openSheet('pc-transfer-sheet'); }
    else if (type === 'sticker') { closeAllSheets(); openSheet('pc-sticker-sheet'); renderStickerGrid(); }
  });

  // Sheet backdrop close
  on('pc-sheet-backdrop', 'click', closeAllSheets);

  // Location send
  on('pc-btn-send-location', 'click', () => {
    const locText = document.getElementById('pc-location-text')?.textContent || 'Bangkok, Thailand';
    sendUserMessage(locText, 'location');
    closeAllSheets();
  });

  // Transfer confirm
  on('pc-btn-confirm-transfer', 'click', () => {
    const amount = document.getElementById('pc-transfer-amount')?.value;
    const note = document.getElementById('pc-transfer-note')?.value || '';
    if (!amount || parseFloat(amount) <= 0) { toastNotify('กรุณาใส่จำนวนเงิน'); return; }
    sendUserMessage(`โอนเงิน ฿${amount}`, 'transfer', { amount, note });
    closeAllSheets();
    if (document.getElementById('pc-transfer-amount')) document.getElementById('pc-transfer-amount').value = '';
    if (document.getElementById('pc-transfer-note')) document.getElementById('pc-transfer-note').value = '';
  });

  // Call
  on('pc-btn-call', 'click', startCall);
  on('pc-btn-end-call', 'click', endCall);
  on('pc-btn-mute', 'click', () => {
    isMuted = !isMuted;
    document.getElementById('pc-btn-mute')?.classList.toggle('active', isMuted);
    toastNotify(isMuted ? '🔇 ปิดไมค์แล้ว' : '🎤 เปิดไมค์แล้ว');
  });

  // Call chat input
  on('pc-call-input', 'keydown', (e) => {
    if (e.key === 'Enter') sendCallChat();
  });
  on('pc-call-send', 'click', sendCallChat);

  // Notes
  on('pc-btn-new-note', 'click', () => openNoteEditor(null));
  on('pc-note-content', 'input', () => { noteDirty = true; });
  on('pc-note-title-input', 'input', () => { noteDirty = true; });
  on('pc-btn-save-note', 'click', () => {
    saveCurrentNote();
    showView('notes');
    toastNotify('✅ บันทึกโน้ตแล้ว');
  });

  // Sticker manager
  on('pc-btn-save-sticker', 'click', () => {
    const val = document.getElementById('pc-new-sticker-input')?.value.trim();
    if (!val) return;
    settings.savedStickers.push(val);
    saveSettings();
    renderSavedStickers();
    if (document.getElementById('pc-new-sticker-input')) document.getElementById('pc-new-sticker-input').value = '';
    toastNotify('✅ เพิ่มสติกเกอร์แล้ว');
  });

  // Settings
  on('pc-toggle-dark', 'click', () => {
    settings.lightMode = !settings.lightMode;
    saveSettings();
    applySettings();
  });

  document.addEventListener('click', (e) => {
    const colorOpt = e.target.closest('.pc-color-opt');
    if (colorOpt) {
      settings.accentColor = colorOpt.dataset.color;
      saveSettings();
      applySettings();
    }
  });

  on('pc-row-bg', 'click', pickChatBg);
  on('pc-row-clear-chat', 'click', () => {
    if (confirm('ล้างประวัติแชทในส่วนเสริมนี้?')) {
      settings.chatHistory = [];
      saveSettings();
      renderMessages();
      toastNotify('🗑️ ล้างประวัติแล้ว');
    }
  });
  on('pc-select-speed', 'change', (e) => {
    settings.botTypingSpeed = e.target.value;
    saveSettings();
  });
  on('pc-row-username', 'click', () => {
    const newName = prompt('ชื่อของคุณ:', settings.userName || '');
    if (newName !== null) {
      settings.userName = newName.trim() || 'ผู้ใช้';
      saveSettings();
      applySettings();
      refreshHome();
    }
  });

  // Audio play buttons
  document.getElementById('pc-messages')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pc-audio-play');
    if (btn) {
      const src = btn.dataset.src;
      if (src) {
        const audio = new Audio(src);
        audio.play();
      }
    }
  });
}

function sendChat() {
  const input = document.getElementById('pc-input-text');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  sendUserMessage(text, 'text');
}

async function sendCallChat() {
  const input = document.getElementById('pc-call-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  try {
    const ctx = getContext ? getContext() : null;
    const charName = ctx?.name2 || 'ตัวละคร';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 80,
        system: `คุณคือ ${charName} กำลังคุยโทรศัพท์อยู่ ตอบสั้นๆ 1 ประโยค ภาษาไทย เหมือนพูดคุยระหว่างโทร`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await response.json();
    const reply = data?.content?.[0]?.text || '...';
    addCallSubtitle(reply);
  } catch {
    addCallSubtitle('ฉันได้ยินนะ~');
  }
}

// ── Utils ────────────────────────────────────────────────────────────────────
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
  else {
    // Retry after DOM is ready
    setTimeout(() => {
      const el2 = document.getElementById(id);
      if (el2) el2.addEventListener(event, handler);
    }, 500);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
