// ============================================================
// iPhone Simulator Extension for SillyTavern - index.js
// ============================================================
// Installed path: /scripts/extensions/third-party/<name>/index.js
// From here:  ../../../../scripts/extensions.js = /scripts/extensions.js

// Safe references — populated by resolveImports() before anything runs
let getContextFn   = () => (typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : {});
let saveDebounced  = () => {};
let extSettings    = null;   // will point to the live extension_settings object

const _lsKey = 'iphone_sim_settings';

async function resolveImports() {
    // 1. SillyTavern global (recommended for all modern ST versions)
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
        getContextFn = () => SillyTavern.getContext();
    }

    // 2. Import extension_settings from scripts/extensions.js
    //    This is the authoritative path per official ST docs.
    //    We also try script.js as a fallback for older builds.
    const tryPaths = [
        '../../../../scripts/extensions.js',
        '../../../../script.js',
    ];
    for (const p of tryPaths) {
        if (extSettings) break;
        try {
            const m = await import(p);
            if (m.extension_settings && typeof m.extension_settings === 'object') {
                extSettings = m.extension_settings;
            }
            if (!saveDebounced.isReal && typeof m.saveSettingsDebounced === 'function') {
                saveDebounced = m.saveSettingsDebounced;
                saveDebounced.isReal = true;
            }
        } catch (_) { /* try next path */ }
    }

    // 3. Final fallback — use localStorage so the extension still works
    if (!extSettings) {
        extSettings = {};
    }
}

// Wrapper so the rest of the code always calls the same name
function getContext() { return getContextFn(); }


// ---- Extension name & defaults ----
const EXT_NAME = 'iphone-simulator';

const DEFAULT_SETTINGS = {
    theme: 'dark',
    accentColor: '#0a84ff',
    chatBg: '',
    stickers: ['😂', '❤️', '👍', '🔥', '😭', '✨', '💀', '😊'],
    friends: [],
    chatHistory: {},
    notes: {},
    botNotes: {},
    transfers: [],
    tweetFeed: [],
    notifications: [],
    tweetIdCounter: 1,
    userHandle: '@user',
    userName: 'Me',
};

// Returns true when extSettings is not a real ST object (fall back to localStorage)
function useLS() { return !extSettings || typeof extSettings !== 'object' || Object.keys(extSettings).length === 0 && !extSettings[EXT_NAME]; }

function getSettings() {
    if (useLS()) {
        try {
            const raw = localStorage.getItem(_lsKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                for (const k of Object.keys(DEFAULT_SETTINGS)) {
                    if (parsed[k] === undefined) parsed[k] = DEFAULT_SETTINGS[k];
                }
                return parsed;
            }
        } catch(e) {}
        const def = Object.assign({}, DEFAULT_SETTINGS);
        localStorage.setItem(_lsKey, JSON.stringify(def));
        return def;
    }
    if (!extSettings[EXT_NAME]) {
        extSettings[EXT_NAME] = Object.assign({}, DEFAULT_SETTINGS);
    }
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
        if (extSettings[EXT_NAME][k] === undefined) {
            extSettings[EXT_NAME][k] = DEFAULT_SETTINGS[k];
        }
    }
    return extSettings[EXT_NAME];
}

function persistSettings() {
    if (useLS()) {
        try { localStorage.setItem(_lsKey, JSON.stringify(getSettings())); } catch(e) {}
    } else {
        saveDebounced();
    }
}

// ---- State ----
let state = {
    currentApp: null,          // 'messages'|'friends'|'twitter'|'settings'
    activeFriend: null,        // friend object
    isTyping: false,
    callActive: false,
    callTimer: 0,
    callTimerInterval: null,
    callMuted: false,
    currentTweetId: null,
    openSheet: null,
    theme: 'dark',
    accentColor: '#0a84ff',
};

// ============================================================
// BOOTSTRAP
// ============================================================
jQuery(async () => {
    await resolveImports();
    await injectHTML();
    loadFromSettings();
    bindGlobalEvents();
    bindStickerAndMediaEvents();
    startClock();
});

// ============================================================
// HTML INJECTION
// ============================================================
async function injectHTML() {
    // FAB
    $('body').append(`
<button id="iphone-fab" title="iPhone Simulator">
  <svg viewBox="0 0 24 24"><path d="M17 2H7C5.34 2 4 3.34 4 5v14c0 1.66 1.34 3 3 3h10c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3zm-5 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5-4H7V5h10v11.5z"/></svg>
  <span class="notif-dot" id="fab-notif-dot"></span>
</button>`);

    // Overlay + Frame
    $('body').append(`
<div id="iphone-overlay">
  <div id="iphone-frame" class="theme-dark">

    <!-- Dynamic Island -->
    <div id="dynamic-island"><span class="di-content" id="di-text"></span></div>

    <!-- Status Bar -->
    <div id="iphone-statusbar">
      <span class="sb-time" id="sb-clock">9:41</span>
      <div class="sb-icons">
        <svg viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.237 4.237 0 00-6 0zm-4-4l2 2a7.074 7.074 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
        <svg viewBox="0 0 24 24"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
      </div>
    </div>

    <!-- Screen -->
    <div id="iphone-screen">

      <!-- Home Screen -->
      <div id="home-screen">
        <div class="home-date">
          <div class="home-date-day" id="home-date-day">Sunday, May 10</div>
          <div class="home-date-time" id="home-date-time">9:41</div>
        </div>
        <div class="app-grid">
          <div class="app-icon-wrap" data-app="messages">
            <div class="app-icon app-messages">
              <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              <span class="app-badge" id="badge-messages"></span>
            </div>
            <span class="app-label">Messages</span>
          </div>
          <div class="app-icon-wrap" data-app="friends">
            <div class="app-icon app-friends">
              <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            </div>
            <span class="app-label">Contacts</span>
          </div>
          <div class="app-icon-wrap" data-app="twitter">
            <div class="app-icon app-twitter">
              <svg viewBox="0 0 24 24"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 01-1.93.07 4.28 4.28 0 004 2.98 8.521 8.521 0 01-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/></svg>
            </div>
            <span class="app-label">Tweeter</span>
          </div>
          <div class="app-icon-wrap" data-app="settings">
            <div class="app-icon app-settings">
              <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </div>
            <span class="app-label">Settings</span>
          </div>
        </div>
        <!-- Dock -->
        <div class="home-dock">
          <div class="app-icon-wrap" data-app="messages" style="gap:4px">
            <div class="app-icon app-messages" style="width:52px;height:52px;border-radius:14px">
              <svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            </div>
          </div>
          <div class="app-icon-wrap" data-app="friends" style="gap:4px">
            <div class="app-icon app-friends" style="width:52px;height:52px;border-radius:14px">
              <svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            </div>
          </div>
          <div class="app-icon-wrap" data-app="twitter" style="gap:4px">
            <div class="app-icon app-twitter" style="width:52px;height:52px;border-radius:14px">
              <svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M22.46 6c-.77.35-1.6.58-2.46.69.88-.53 1.56-1.37 1.88-2.38-.83.5-1.75.85-2.72 1.05C18.37 4.5 17.26 4 16 4c-2.35 0-4.27 1.92-4.27 4.29 0 .34.04.67.11.98C8.28 9.09 5.11 7.38 3 4.79c-.37.63-.58 1.37-.58 2.15 0 1.49.75 2.81 1.91 3.56-.71 0-1.37-.2-1.95-.5v.03c0 2.08 1.48 3.82 3.44 4.21a4.22 4.22 0 01-1.93.07 4.28 4.28 0 004 2.98 8.521 8.521 0 01-5.33 1.84c-.34 0-.68-.02-1.02-.06C3.44 20.29 5.7 21 8.12 21 16 21 20.33 14.46 20.33 8.79c0-.19 0-.37-.01-.56.84-.6 1.56-1.36 2.14-2.23z"/></svg>
            </div>
          </div>
          <div class="app-icon-wrap" data-app="settings" style="gap:4px">
            <div class="app-icon app-settings" style="width:52px;height:52px;border-radius:14px">
              <svg viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </div>
          </div>
        </div>
      </div>

      <!-- MESSAGES APP -->
      <div class="app-screen" id="app-messages">
        <div class="nav-bar">
          <button class="nav-back" id="msg-back">
            <svg viewBox="0 0 10 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 1L1 9l8 8"/></svg>
          </button>
          <span class="nav-title" id="chat-title">Chat</span>
          <button class="nav-action" id="chat-call-btn" title="Call">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--accent);vertical-align:middle"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button>
        </div>
        <!-- Contact switcher strip -->
        <div id="contact-switcher" style="display:none;overflow-x:auto;white-space:nowrap;padding:8px 12px;background:var(--bg);border-bottom:0.5px solid var(--separator);flex-shrink:0"></div>

        <div class="chat-header" id="chat-header">
          <img class="chat-header-avatar" id="chat-header-avatar" src="" alt="">
          <div class="chat-header-name" id="chat-header-name"></div>
          <div class="chat-header-status" id="chat-header-status">Active now</div>
          <div class="chat-header-actions">
            <button class="chat-action-btn" id="chat-note-btn">
              <div class="chat-action-btn-icon"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg></div>
              <span>Note</span>
            </button>
            <button class="chat-action-btn" id="chat-botnote-btn">
              <div class="chat-action-btn-icon"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></div>
              <span>Bot Note</span>
            </button>
            <button class="chat-action-btn" id="chat-cancel-btn">
              <div class="chat-action-btn-icon"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
              <span>Cancel</span>
            </button>
            <button class="chat-action-btn" id="chat-bg-btn">
              <div class="chat-action-btn-icon"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>
              <span>Wallpaper</span>
            </button>
            <button class="chat-action-btn" id="chat-retry-header-btn">
              <div class="chat-action-btn-icon"><svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></div>
              <span>Retry</span>
            </button>
          </div>
        </div>
        <!-- Note edit panel -->
        <div class="note-edit-panel" id="note-edit-panel">
          <div style="font-size:11px;color:var(--text3);font-family:-apple-system,sans-serif;margin-bottom:4px;padding:0 2px">My Note (bot will react when changed)</div>
          <textarea id="note-textarea" placeholder="Write a note..."></textarea>
          <div class="note-edit-actions">
            <button class="note-cancel-btn" id="note-cancel-btn">Cancel</button>
            <button class="note-save-btn" id="note-save-btn">Save</button>
          </div>
        </div>
        <!-- Bot note panel -->
        <div class="note-edit-panel" id="botnote-edit-panel" style="background:#e8f4fd">
          <div style="font-size:11px;color:#1e40af;font-family:-apple-system,sans-serif;margin-bottom:4px;padding:0 2px">Note to Bot (bot reads this as context)</div>
          <textarea id="botnote-textarea" placeholder="Write instructions for the bot..." style="background:#dbeafe;color:#1e3a5f"></textarea>
          <div class="note-edit-actions">
            <button class="note-cancel-btn" id="botnote-cancel-btn">Cancel</button>
            <button class="note-save-btn" id="botnote-save-btn" style="background:#1d4ed8">Save</button>
          </div>
        </div>
        <div id="chat-messages-list"></div>
        <!-- Sticker panel -->
        <div class="sticker-panel" id="sticker-panel">
          <div class="sticker-panel-inner" id="sticker-panel-inner"></div>
        </div>
        <div class="chat-input-bar">
          <div class="chat-input-extras">
            <button class="chat-extra-btn" id="btn-sticker" title="Sticker">
              <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 14.24c-1.03 1.03-2.4 1.6-3.86 1.6H12c-1.45 0-2.82-.57-3.85-1.6C7.12 15.21 6.55 13.84 6.55 12.39v-.33c0-.15.12-.27.27-.27h.49c.15 0 .27.12.27.27v.33c0 1.17.46 2.27 1.29 3.09.83.83 1.93 1.28 3.1 1.28h.37c1.17 0 2.26-.45 3.09-1.28.83-.82 1.29-1.92 1.29-3.09v-.33c0-.15.12-.27.27-.27h.49c.15 0 .27.12.27.27v.33c-.01 1.45-.58 2.82-1.61 3.85zM9 11c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1s1 .45 1 1v1c0 .55-.45 1-1 1zm6 0c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1s1 .45 1 1v1c0 .55-.45 1-1 1z"/></svg>
            </button>
            <button class="chat-extra-btn" id="btn-image" title="Image">
              <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            </button>
            <button class="chat-extra-btn" id="btn-audio" title="Audio">
              <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
            </button>
            <button class="chat-extra-btn" id="btn-location" title="Location">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </button>
            <button class="chat-extra-btn" id="btn-transfer" title="Transfer">
              <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
            </button>
          </div>
          <div class="chat-input-row">
            <textarea class="chat-input-field" id="chat-input" placeholder="Message" rows="1"></textarea>
            <button class="chat-nudge-btn" id="chat-nudge-btn" title="Nudge bot to reply">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
            <button class="chat-send-btn" id="chat-send-btn">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
          <div class="chat-retry-bar">
            <button class="chat-retry-btn" id="chat-retry-btn">Retry last bot reply</button>
          </div>
        </div>
      </div>

      <!-- FRIENDS APP -->
      <div class="app-screen" id="app-friends">
        <div class="nav-bar">
          <button class="nav-back" id="friends-back">
            <svg viewBox="0 0 10 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 1L1 9l8 8"/></svg>
          </button>
          <span class="nav-title" style="color:var(--text)">Contacts</span>
          <button class="nav-action" id="friends-refresh-btn" style="color:var(--accent)">Refresh</button>
        </div>
        <div class="friends-search">
          <input type="text" id="friends-search-input" placeholder="Search...">
        </div>
        <div id="friends-list"></div>
      </div>

      <!-- TWITTER APP -->
      <div class="app-screen" id="app-twitter">
        <div class="nav-bar" style="background:var(--nav-bg);backdrop-filter:blur(20px);border-bottom:0.5px solid var(--separator);">
          <button class="nav-back" id="twitter-back">
            <svg viewBox="0 0 10 18" fill="none" stroke="var(--accent)" stroke-width="2.5"><path d="M9 1L1 9l8 8"/></svg>
          </button>
          <span class="nav-title" style="color:var(--text)">Tweeter</span>
          <button class="nav-action" id="twitter-notif-btn" style="color:var(--accent);position:relative">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--accent);vertical-align:middle"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            <span id="twitter-notif-count" style="position:absolute;top:-2px;right:-4px;background:#ff3b30;color:#fff;border-radius:8px;font-size:9px;padding:0 4px;min-width:14px;text-align:center;display:none;font-family:-apple-system,sans-serif;font-weight:700;line-height:14px"></span>
          </button>
        </div>
        <div class="tweeter-tabs">
          <div class="tweeter-tab active" data-tab="feed">For You</div>
          <div class="tweeter-tab" data-tab="trends">Trending</div>
          <div class="tweeter-tab" data-tab="profile">Profile</div>
          <div class="tweeter-tab" data-tab="notifs">Alerts</div>
        </div>
        <!-- Feed -->
        <div class="tweeter-page active" id="tweeter-feed-page">
          <div class="compose-bar">
            <img class="compose-avatar" id="compose-avatar" src="" alt="">
            <div class="compose-right">
              <textarea class="compose-input" id="compose-input" placeholder="What's happening?"></textarea>
              <div class="compose-footer">
                <button class="compose-send-btn" id="compose-send-btn" disabled>Post</button>
              </div>
            </div>
          </div>
          <div class="tweet-feed" id="tweet-feed"></div>
        </div>
        <!-- Trends -->
        <div class="tweeter-page" id="tweeter-trends-page">
          <div class="trends-list" id="trends-list"></div>
        </div>
        <!-- Profile -->
        <div class="tweeter-page" id="tweeter-profile-page">
          <div style="overflow-y:auto;flex:1">
            <div class="profile-header"></div>
            <div class="profile-avatar-wrap">
              <img class="profile-avatar" id="profile-avatar" src="" alt="">
            </div>
            <div class="profile-info">
              <div class="profile-name" id="profile-name">Me</div>
              <div class="profile-handle" id="profile-handle">@user</div>
              <div class="profile-stats">
                <div class="profile-stat">
                  <span class="profile-stat-num" id="profile-tweets-count">0</span>
                  <span class="profile-stat-label">Posts</span>
                </div>
                <div class="profile-stat">
                  <span class="profile-stat-num" id="profile-likes-count">0</span>
                  <span class="profile-stat-label">Likes</span>
                </div>
              </div>
            </div>
            <div class="tweet-feed" id="profile-tweets-feed"></div>
          </div>
        </div>
        <!-- Notifications -->
        <div class="tweeter-page" id="tweeter-notifs-page">
          <div class="tweet-feed" id="twitter-notifs-list"></div>
        </div>
      </div>

      <!-- TWEET THREAD SCREEN -->
      <div class="app-screen" id="tweet-thread-screen">
        <div class="nav-bar" style="background:var(--nav-bg);backdrop-filter:blur(20px);border-bottom:0.5px solid var(--separator);">
          <button class="nav-back" id="thread-back">
            <svg viewBox="0 0 10 18" fill="none" stroke="var(--accent)" stroke-width="2.5"><path d="M9 1L1 9l8 8"/></svg>
          </button>
          <span class="nav-title" style="color:var(--text)">Post</span>
        </div>
        <div class="thread-content" id="thread-content"></div>
        <div class="reply-compose">
          <img class="compose-avatar" id="thread-compose-avatar" src="" alt="" style="width:36px;height:36px">
          <textarea id="thread-reply-input" placeholder="Tweet your reply" style="font-size:14px"></textarea>
          <button class="reply-send-btn" id="thread-reply-send">Reply</button>
        </div>
      </div>

      <!-- SETTINGS APP -->
      <div class="app-screen" id="app-settings">
        <div class="nav-bar">
          <button class="nav-back" id="settings-back">
            <svg viewBox="0 0 10 18" fill="none" stroke="var(--accent)" stroke-width="2.5"><path d="M9 1L1 9l8 8"/></svg>
          </button>
          <span class="nav-title" style="color:var(--text)">Settings</span>
        </div>
        <div class="settings-scroll">
          <!-- Appearance -->
          <div class="settings-section">
            <div class="settings-section-title">Appearance</div>
            <div class="settings-group">
              <div class="settings-row">
                <div class="settings-row-icon" style="background:#636366"><svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7v14z"/></svg></div>
                <span class="settings-row-label">Dark Mode</span>
                <label class="ios-toggle">
                  <input type="checkbox" id="toggle-dark" checked>
                  <div class="ios-toggle-track"></div>
                  <div class="ios-toggle-thumb"></div>
                </label>
              </div>
            </div>
          </div>
          <!-- Accent color -->
          <div class="settings-section">
            <div class="settings-section-title">Accent Color</div>
            <div class="settings-color-row" id="accent-colors">
              <div class="settings-color-swatch selected" data-color="#0a84ff" style="background:#0a84ff"></div>
              <div class="settings-color-swatch" data-color="#30d158" style="background:#30d158"></div>
              <div class="settings-color-swatch" data-color="#ff375f" style="background:#ff375f"></div>
              <div class="settings-color-swatch" data-color="#ff9f0a" style="background:#ff9f0a"></div>
              <div class="settings-color-swatch" data-color="#bf5af2" style="background:#bf5af2"></div>
              <div class="settings-color-swatch" data-color="#32ade6" style="background:#32ade6"></div>
              <div class="settings-color-swatch" data-color="#ff6961" style="background:#ff6961"></div>
              <div class="settings-color-swatch" data-color="#ac8e68" style="background:#ac8e68"></div>
            </div>
          </div>
          <!-- Stickers -->
          <div class="settings-section">
            <div class="settings-section-title">Stickers</div>
            <div class="settings-group">
              <div class="settings-row" id="manage-stickers-row" style="cursor:pointer">
                <div class="settings-row-icon" style="background:#ff9f0a"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 14.24c-1.03 1.03-2.4 1.6-3.86 1.6H12c-1.45 0-2.82-.57-3.85-1.6C7.12 15.21 6.55 13.84 6.55 12.39v-.33c0-.15.12-.27.27-.27h.49c.15 0 .27.12.27.27v.33c0 1.17.46 2.27 1.29 3.09.83.83 1.93 1.28 3.1 1.28h.37c1.17 0 2.26-.45 3.09-1.28.83-.82 1.29-1.92 1.29-3.09v-.33c0-.15.12-.27.27-.27h.49c.15 0 .27.12.27.27v.33c-.01 1.45-.58 2.82-1.61 3.85z"/></svg></div>
                <span class="settings-row-label">Manage Stickers</span>
                <svg class="settings-row-chevron" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6"/></svg>
              </div>
            </div>
          </div>
          <!-- Chat -->
          <div class="settings-section">
            <div class="settings-section-title">Chat</div>
            <div class="settings-group">
              <div class="settings-row">
                <div class="settings-row-icon" style="background:#30d158"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div>
                <span class="settings-row-label">Reply Language: Thai</span>
                <span class="settings-row-value">Always</span>
              </div>
              <div class="settings-row" id="set-chat-bg-row" style="cursor:pointer">
                <div class="settings-row-icon" style="background:#0a84ff"><svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z"/></svg></div>
                <span class="settings-row-label">Chat Wallpaper</span>
                <svg class="settings-row-chevron" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6"/></svg>
              </div>
            </div>
          </div>
          <!-- About -->
          <div class="settings-section">
            <div class="settings-section-title">About</div>
            <div class="settings-group">
              <div class="settings-row">
                <div class="settings-row-label">Version</div>
                <span class="settings-row-value">1.0.0</span>
              </div>
              <div class="settings-row">
                <div class="settings-row-label">Extension</div>
                <span class="settings-row-value">iPhone Simulator</span>
              </div>
            </div>
          </div>
          <div class="settings-bottom-pad"></div>
        </div>
      </div>

      <!-- CALL SCREEN -->
      <div id="call-screen">
        <div class="call-bg" id="call-bg"></div>
        <div id="call-float-text"></div>
        <div class="call-content">
          <img class="call-avatar" id="call-avatar" src="" alt="">
          <div class="call-name" id="call-name"></div>
          <div class="call-status" id="call-status">Calling...</div>
          <div class="call-timer" id="call-timer">0:00</div>
        </div>
        <div class="call-chat-area">
          <div class="call-chat-row">
            <input class="call-chat-input" id="call-chat-input" placeholder="Type during call...">
            <button class="call-chat-send" id="call-chat-send">
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
        <div class="call-controls">
          <button class="call-ctrl-btn" id="call-mute-btn">
            <div class="call-ctrl-circle mute" id="call-mute-circle">
              <svg viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
            </div>
            <span class="call-ctrl-label">Mute</span>
          </button>
          <button class="call-ctrl-btn" id="call-end-btn">
            <div class="call-ctrl-circle end-call">
              <svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.12-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>
            </div>
            <span class="call-ctrl-label">End</span>
          </button>
          <button class="call-ctrl-btn" id="call-speaker-btn">
            <div class="call-ctrl-circle">
              <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
            </div>
            <span class="call-ctrl-label">Speaker</span>
          </button>
        </div>
      </div>

      <!-- Toast -->
      <div class="ios-toast" id="ios-toast"></div>

      <!-- Home Indicator -->
      <div class="home-indicator"></div>

      <!-- Sheet backdrop -->
      <div class="sheet-backdrop" id="sheet-backdrop"></div>

      <!-- Transfer Sheet -->
      <div class="bottom-sheet" id="transfer-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Transfer Money</div>
        <div class="transfer-form">
          <input class="transfer-amount-input" id="transfer-amount" type="number" placeholder="0">
          <input class="transfer-note-input" id="transfer-note" type="text" placeholder="Note (optional)">
          <button class="transfer-confirm-btn" id="transfer-confirm-btn">Transfer</button>
        </div>
      </div>

      <!-- Image input (hidden) -->
      <input type="file" id="image-file-input" accept="image/*" style="display:none">
      <input type="file" id="audio-file-input" accept="audio/*" style="display:none">
      <input type="file" id="bg-file-input" accept="image/*" style="display:none">
      <input type="file" id="sticker-file-input" accept="image/*" style="display:none">

    </div><!-- /iphone-screen -->
  </div><!-- /iphone-frame -->
</div><!-- /iphone-overlay -->`);
}

// ============================================================
// LOAD / SAVE SETTINGS
// ============================================================
function loadFromSettings() {
    const s = getSettings();
    state.theme = s.theme || 'dark';
    state.accentColor = s.accentColor || '#0a84ff';
    applyTheme(state.theme);
    applyAccent(state.accentColor);

    // Sync toggle
    $('#toggle-dark').prop('checked', state.theme === 'dark');
    // Sync color swatches
    $('#accent-colors .settings-color-swatch').each(function() {
        $(this).toggleClass('selected', $(this).data('color') === state.accentColor);
    });
}

function saveSettings() {
    const s = getSettings();
    s.theme = state.theme;
    s.accentColor = state.accentColor;
    persistSettings();
}

// ============================================================
// THEME
// ============================================================
function applyTheme(theme) {
    const frame = $('#iphone-frame');
    frame.removeClass('theme-light theme-dark').addClass('theme-' + theme);
}

function applyAccent(color) {
    document.documentElement.style.setProperty('--accent-override', color);
    $('#iphone-frame').css('--accent', color);
    document.getElementById('iphone-frame').style.setProperty('--accent', color);
}

// ============================================================
// CLOCK
// ============================================================
function startClock() {
    function tick() {
        const now = new Date();
        const h = now.getHours();
        const m = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${h}:${m}`;
        $('#sb-clock').text(timeStr);
        $('#home-date-time').text(timeStr);
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        $('#home-date-day').text(`${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`);
    }
    tick();
    setInterval(tick, 10000);
}

// ============================================================
// NAVIGATION HELPERS
// ============================================================
function openApp(appId) {
    $('#home-screen').addClass('hidden');
    $('.app-screen').removeClass('active');
    $(`#app-${appId}`).addClass('active');
    state.currentApp = appId;
    if (appId === 'messages') renderFriendInChat();
    if (appId === 'friends') loadFriendsList();
    if (appId === 'twitter') renderTweetFeed();
}

function goHome() {
    $('.app-screen').removeClass('active');
    $('#tweet-thread-screen').removeClass('active');
    $('#home-screen').removeClass('hidden');
    state.currentApp = null;
    endCall();
}

function openThreadScreen(tweetId) {
    state.currentTweetId = tweetId;
    $('#tweet-thread-screen').addClass('active');
    renderThreadView(tweetId);
}

function closeThreadScreen() {
    $('#tweet-thread-screen').removeClass('active');
}

// ============================================================
// GLOBAL EVENTS
// ============================================================
function bindGlobalEvents() {
    // FAB
    $('#iphone-fab').on('click', () => {
        const overlay = $('#iphone-overlay');
        overlay.hasClass('open') ? overlay.removeClass('open') : overlay.addClass('open');
    });

    // Close overlay on backdrop click
    $('#iphone-overlay').on('click', function(e) {
        if ($(e.target).is('#iphone-overlay')) $(this).removeClass('open');
    });

    // App icons
    $(document).on('click', '.app-icon-wrap', function() {
        openApp($(this).data('app'));
    });

    // Back buttons
    $('#msg-back, #friends-back, #twitter-back, #settings-back').on('click', goHome);
    $('#thread-back').on('click', closeThreadScreen);

    // Dark mode toggle
    $('#toggle-dark').on('change', function() {
        state.theme = $(this).is(':checked') ? 'dark' : 'light';
        applyTheme(state.theme);
        saveSettings();
    });

    // Accent colors
    $(document).on('click', '.settings-color-swatch', function() {
        $('.settings-color-swatch').removeClass('selected');
        $(this).addClass('selected');
        state.accentColor = $(this).data('color');
        applyAccent(state.accentColor);
        saveSettings();
    });

    // Sheet backdrop close
    $('#sheet-backdrop').on('click', closeSheet);

    // Settings rows
    $('#manage-stickers-row').on('click', openStickerManager);
    $('#set-chat-bg-row').on('click', () => $('#bg-file-input').trigger('click'));
    $('#bg-file-input').on('change', handleBgUpload);

    // Chat events
    bindChatEvents();
    // Twitter events
    bindTwitterEvents();
    // Call events
    bindCallEvents();
    // Friends events
    bindFriendsEvents();
}

// ============================================================
// CHAT APP
// ============================================================
function renderFriendInChat() {
    const s = getSettings();
    const friend = s.friends && s.friends.length > 0 ? s.friends[0] : null;
    if (!friend) {
        $('#chat-header-name').text('No contact selected');
        $('#chat-header-status').text('Go to Contacts to add a bot');
        $('#chat-messages-list').html('');
        $('#contact-switcher').hide();
        return;
    }
    // Keep activeFriend if already set and still exists
    if (state.activeFriend && s.friends.find(f => f.id === state.activeFriend.id)) {
        // use existing
    } else {
        state.activeFriend = friend;
    }
    $('#chat-header-avatar').attr('src', state.activeFriend.avatar || '');
    $('#chat-header-name').text(state.activeFriend.name);
    $('#chat-header-status').text('Active now');
    loadChatHistory(state.activeFriend.id);
    updateChatBg();
    renderContactSwitcher();
}

function updateChatBg() {
    const s = getSettings();
    if (s.chatBg) {
        $('#chat-messages-list').css('background-image', `url(${s.chatBg})`).css('background-size', 'cover');
    }
}

function loadChatHistory(friendId) {
    const s = getSettings();
    const msgs = s.chatHistory[friendId] || [];
    const list = $('#chat-messages-list');
    list.html('');
    if (msgs.length === 0) {
        addSystemMessage(`Start a conversation with ${state.activeFriend.name}`);
    }
    msgs.forEach(m => appendChatMessage(m, false));
    list.scrollTop(list[0].scrollHeight);
    // Show note if exists
    showNoteIfExists(friendId);
}

function addSystemMessage(text) {
    $('#chat-messages-list').append(`<div class="msg-system">${text}</div>`);
}

function appendChatMessage(msg, animate = true) {
    const list = $('#chat-messages-list');
    let bubble = '';
    const timeStr = msg.time || formatTime(new Date());

    if (msg.type === 'text') {
        bubble = `<div class="msg-bubble">${escHtml(msg.content)}</div>`;
    } else if (msg.type === 'sticker') {
        bubble = `<div class="msg-bubble sticker"><span style="font-size:44px">${msg.content}</span></div>`;
    } else if (msg.type === 'sticker-img') {
        bubble = `<div class="msg-bubble sticker"><img src="${msg.content}" alt="sticker"></div>`;
    } else if (msg.type === 'image') {
        bubble = `<div class="msg-bubble image-msg"><img src="${msg.content}" alt="photo"></div>`;
    } else if (msg.type === 'audio') {
        bubble = renderAudioBubble(msg.content);
    } else if (msg.type === 'location') {
        bubble = renderLocationBubble(msg.content);
    } else if (msg.type === 'transfer') {
        bubble = renderTransferBubble(msg.content);
    } else if (msg.type === 'note') {
        bubble = renderNoteBubble(msg.content, msg.author);
    }

    const dir = msg.from === 'user' ? 'out' : 'in';
    const avatar = msg.from === 'bot'
        ? `<img class="msg-avatar" src="${state.activeFriend?.avatar || ''}" alt="">`
        : '';

    list.append(`
      <div class="msg-row ${dir}">
        ${avatar}
        <div class="msg-bubble-wrap">
          ${bubble}
          <span class="msg-meta">${timeStr}</span>
        </div>
      </div>`);

    list.scrollTop(list[0].scrollHeight);
}

function renderAudioBubble(src) {
    const bars = Array.from({length: 20}, (_, i) => {
        const h = 4 + Math.floor(Math.random() * 16);
        return `<div class="audio-bar" style="height:${h}px"></div>`;
    }).join('');
    return `<div class="msg-bubble">
      <div class="audio-msg">
        <button class="audio-play-btn" onclick="this.querySelector('svg path').setAttribute('d', '${escHtml('M6 19h4V5H6v14zm8-14v14h4V5h-4z')}')">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="audio-waveform">${bars}</div>
      </div>
    </div>`;
}

function renderLocationBubble(loc) {
    return `<div class="msg-bubble location-card">
      <div class="location-map-placeholder">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </div>
      <div class="location-label">${escHtml(loc)}</div>
    </div>`;
}

function renderTransferBubble(data) {
    return `<div class="msg-bubble transfer-card">
      <div class="tc-label">Bank Transfer</div>
      <div class="tc-amount">${escHtml(data.amount)} THB</div>
      <div class="tc-note">${escHtml(data.note || '')}</div>
    </div>`;
}

function renderNoteBubble(text, author) {
    return `<div class="msg-bubble note-card">
      <div class="nc-title">${author === 'user' ? 'My Note' : 'Note from Bot'}</div>
      <div class="nc-text">${escHtml(text)}</div>
    </div>`;
}

function saveBotNote() {
    const s = getSettings();
    const fid = state.activeFriend?.id;
    if (!fid) return;
    const text = $('#botnote-textarea').val().trim();
    s.botNotes[fid] = text;
    persistSettings();
    $('#botnote-edit-panel').removeClass('open');
    showToast('Bot note saved');
}

function cancelBotMessage() {
    if (state.isTyping) {
        $('#typing-indicator').remove();
        state.isTyping = false;
        // Remove last pending bot entry if was added optimistically
        addSystemMessage('Message cancelled');
        showToast('Bot message cancelled');
    } else {
        // Cancel last bot message visually — remove last bot bubble from view and history
        const s = getSettings();
        const fid = state.activeFriend?.id;
        if (!fid) return;
        const hist = s.chatHistory[fid] || [];
        if (hist.length > 0 && hist[hist.length - 1].from === 'bot') {
            hist.pop();
            persistSettings();
            const list = $('#chat-messages-list');
            list.find('.msg-row.in').last().remove();
            showToast('Last bot message removed');
        }
    }
}

function renderContactSwitcher() {
    const s = getSettings();
    const friends = s.friends || [];
    const switcher = $('#contact-switcher');
    if (friends.length <= 1) { switcher.hide(); return; }
    switcher.show().html('');
    friends.forEach(f => {
        const isActive = state.activeFriend?.id === f.id;
        const pill = $(`<span style="
          display:inline-flex;align-items:center;gap:6px;
          padding:5px 12px 5px 6px;margin-right:8px;
          border-radius:20px;cursor:pointer;font-size:13px;
          font-family:-apple-system,sans-serif;
          background:${isActive ? 'var(--accent)' : 'var(--bg3)'};
          color:${isActive ? '#fff' : 'var(--text)'};
          border:${isActive ? 'none' : '0.5px solid var(--separator)'};
          white-space:nowrap;vertical-align:middle;
        " data-fid="${escHtml(f.id)}">
          <img src="${escHtml(f.avatar || '')}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;background:var(--separator)" onerror="this.style.display='none'">
          ${escHtml(f.name)}
        </span>`);
        pill.on('click', () => switchActiveFriend(f.id));
        switcher.append(pill);
    });
}

function switchActiveFriend(fid) {
    const s = getSettings();
    const friend = s.friends.find(f => f.id === fid);
    if (!friend || friend.id === state.activeFriend?.id) return;
    state.activeFriend = friend;
    $('#chat-header-avatar').attr('src', friend.avatar || '');
    $('#chat-header-name').text(friend.name);
    loadChatHistory(friend.id);
    renderContactSwitcher();
}

function showNoteIfExists(friendId) {
    const s = getSettings();
    const note = s.notes[friendId];
    if (note) {
        $('#note-textarea').val(note);
    }
}

function saveChatMessage(msg) {
    const s = getSettings();
    const fid = state.activeFriend?.id;
    if (!fid) return;
    if (!s.chatHistory[fid]) s.chatHistory[fid] = [];
    s.chatHistory[fid].push(msg);
    persistSettings();
}

function bindChatEvents() {
    // Send button
    $('#chat-send-btn').on('click', sendUserMessage);
    $('#chat-input').on('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendUserMessage();
        }
    });
    // Auto-resize textarea
    $('#chat-input').on('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    // Nudge (prompt bot to respond without user message)
    $('#chat-nudge-btn').on('click', () => {
        if (!state.activeFriend) { showToast('Select a contact first'); return; }
        botReply('');
    });

    // Retry
    $('#chat-retry-btn, #chat-retry-header-btn').on('click', retryLastBotMessage);

    // Call
    $('#chat-call-btn').on('click', startCall);

    // Note
    $('#chat-note-btn').on('click', () => {
        $('#botnote-edit-panel').removeClass('open');
        $('#note-edit-panel').toggleClass('open');
    });
    $('#note-cancel-btn').on('click', () => $('#note-edit-panel').removeClass('open'));
    $('#note-save-btn').on('click', saveNote);

    // Bot Note
    $('#chat-botnote-btn').on('click', () => {
        $('#note-edit-panel').removeClass('open');
        const fid = state.activeFriend?.id;
        if (fid) {
            const s = getSettings();
            $('#botnote-textarea').val(s.botNotes[fid] || '');
        }
        $('#botnote-edit-panel').toggleClass('open');
    });
    $('#botnote-cancel-btn').on('click', () => $('#botnote-edit-panel').removeClass('open'));
    $('#botnote-save-btn').on('click', saveBotNote);

    // Cancel bot message
    $('#chat-cancel-btn').on('click', cancelBotMessage);

    // Bg
    $('#chat-bg-btn').on('click', () => $('#bg-file-input').trigger('click'));

    // Stickers
    $('#btn-sticker').on('click', toggleStickerPanel);
    renderStickerPanel();

    // Image
    $('#btn-image').on('click', () => $('#image-file-input').trigger('click'));
    $('#image-file-input').on('change', handleImageUpload);

    // Audio
    $('#btn-audio').on('click', () => $('#audio-file-input').trigger('click'));
    $('#audio-file-input').on('change', handleAudioUpload);

    // Location
    $('#btn-location').on('click', shareLocation);

    // Transfer
    $('#btn-transfer').on('click', () => openSheet('transfer'));
    $('#transfer-confirm-btn').on('click', confirmTransfer);
}

async function sendUserMessage() {
    if (!state.activeFriend) { showToast('Select a contact first'); return; }
    const input = $('#chat-input');
    const text = input.val().trim();
    if (!text) return;
    input.val('').css('height', 'auto');

    const msg = { from: 'user', type: 'text', content: text, time: formatTime(new Date()) };
    appendChatMessage(msg);
    saveChatMessage(msg);
    botReply(text);
}

async function botReply(userText) {
    if (!state.activeFriend) return;
    if (state.isTyping) return;
    state.isTyping = true;

    // Show typing
    $('#chat-messages-list').append(`
      <div class="typing-indicator" id="typing-indicator">
        <img class="msg-avatar" src="${state.activeFriend.avatar || ''}" alt="">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`);
    const list = document.getElementById('chat-messages-list');
    list.scrollTop = list.scrollHeight;

    try {
        const s = getSettings();
        const context = getContext();
        const friend = state.activeFriend;
        const history = (s.chatHistory[friend.id] || []).slice(-12);
        const userNote = s.notes[friend.id] || '';

        // Build messages array
        const messages = [];
        history.forEach(m => {
            messages.push({
                role: m.from === 'user' ? 'user' : 'assistant',
                content: m.type === 'text' ? m.content : `[${m.type}]`
            });
        });
        if (userText) {
            messages.push({ role: 'user', content: userText });
        } else {
            messages.push({ role: 'user', content: '(ส่งสัญญาณ)' });
        }

        const systemPrompt = `คุณคือ ${friend.name}. ${friend.persona || ''}
${userNote ? `โน้ตจากผู้ใช้: ${userNote}` : ''}
${s.botNotes[friend.id] ? `คำสั่งพิเศษ: ${s.botNotes[friend.id]}` : ''}
กรุณาตอบเป็นภาษาไทยเท่านั้น สั้นกระชับเหมือนส่ง SMS จริง ไม่เกิน 3 ประโยค ห้ามใช้อีโมจิ ห้ามแสดงว่าตัวเองเป็น AI`;

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: systemPrompt,
                messages: messages
            })
        });
        const data = await resp.json();
        const reply = data.content?.map(c => c.text || '').join('') || '...';

        $('#typing-indicator').remove();
        state.isTyping = false;

        const botMsg = { from: 'bot', type: 'text', content: reply, time: formatTime(new Date()) };
        appendChatMessage(botMsg);
        saveChatMessage(botMsg);

        // Check if user note changed - bot reacts
        const newNote = s.notes[friend.id];
        if (newNote && !userText) {
            // nudge with note context
        }

        // If call is active, show floating text
        if (state.callActive) {
            showCallFloatText(reply);
        }

    } catch (err) {
        $('#typing-indicator').remove();
        state.isTyping = false;
        appendChatMessage({ from: 'bot', type: 'text', content: 'ขอโทษ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง', time: formatTime(new Date()) });
    }
}

function retryLastBotMessage() {
    const s = getSettings();
    const fid = state.activeFriend?.id;
    if (!fid) return;
    const hist = s.chatHistory[fid] || [];
    // Remove last bot messages
    while (hist.length > 0 && hist[hist.length - 1].from === 'bot') hist.pop();
    persistSettings();

    // Re-render
    const list = $('#chat-messages-list');
    list.html('');
    hist.forEach(m => appendChatMessage(m, false));
    // Get last user msg
    const lastUser = [...hist].reverse().find(m => m.from === 'user');
    botReply(lastUser?.content || '');
}

function saveNote() {
    const s = getSettings();
    const fid = state.activeFriend?.id;
    if (!fid) return;
    const text = $('#note-textarea').val().trim();
    const old = s.notes[fid];
    s.notes[fid] = text;
    persistSettings();
    $('#note-edit-panel').removeClass('open');
    // Add note message
    const msg = { from: 'user', type: 'note', content: text, author: 'user', time: formatTime(new Date()) };
    appendChatMessage(msg);
    saveChatMessage(msg);
    showToast('Note saved');

    // If note changed, bot reacts
    if (old !== text && text) {
        setTimeout(() => botReply(`[ผู้ใช้อัปเดตโน้ต: "${text}"]`), 800);
    }
}

// Stickers
function renderStickerPanel() {
    const s = getSettings();
    const inner = $('#sticker-panel-inner');
    inner.html('');
    (s.stickers || []).forEach(st => {
        if (st.startsWith('data:') || st.startsWith('http')) {
            inner.append(`<div class="sticker-item" data-sticker-img="${st}"><img src="${st}" style="width:48px;height:48px;object-fit:contain"></div>`);
        } else {
            inner.append(`<div class="sticker-item" data-sticker="${st}">${st}</div>`);
        }
    });
    inner.append(`<div class="sticker-add-btn" id="sticker-add-inline">+</div>`);
    $('#sticker-add-inline').on('click', () => $('#sticker-file-input').trigger('click'));
}

function bindStickerAndMediaEvents() {
    // Sticker file upload
    $('#sticker-file-input').on('change', function() {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const s = getSettings();
            s.stickers.push(e.target.result);
            persistSettings();
            renderStickerPanel();
            showToast('Sticker added');
        };
        reader.readAsDataURL(file);
        this.value = '';
    });

    // Sticker tap
    $(document).on('click', '.sticker-item', function() {
        if (!state.activeFriend) return;
        const imgSrc = $(this).data('sticker-img');
        const emoji = $(this).data('sticker');
        if (imgSrc) {
            const msg = { from: 'user', type: 'sticker-img', content: imgSrc, time: formatTime(new Date()) };
            appendChatMessage(msg);
            saveChatMessage(msg);
            botReply('[ผู้ใช้ส่งสติ๊กเกอร์]');
        } else if (emoji) {
            const msg = { from: 'user', type: 'sticker', content: emoji, time: formatTime(new Date()) };
            appendChatMessage(msg);
            saveChatMessage(msg);
            botReply(`[ผู้ใช้ส่งสติ๊กเกอร์ ${emoji}]`);
        }
        $('#sticker-panel').removeClass('open');
    });

    // Image upload
    $('#image-file-input').on('change', function() {
        const file = this.files[0];
        if (!file || !state.activeFriend) return;
        const reader = new FileReader();
        reader.onload = e => {
            const msg = { from: 'user', type: 'image', content: e.target.result, time: formatTime(new Date()) };
            appendChatMessage(msg);
            saveChatMessage(msg);
            botReply('[ผู้ใช้ส่งรูปภาพ]');
        };
        reader.readAsDataURL(file);
        this.value = '';
    });

    // Audio upload
    $('#audio-file-input').on('change', function() {
        const file = this.files[0];
        if (!file || !state.activeFriend) return;
        const reader = new FileReader();
        reader.onload = e => {
            const msg = { from: 'user', type: 'audio', content: e.target.result, time: formatTime(new Date()) };
            appendChatMessage(msg);
            saveChatMessage(msg);
            botReply('[ผู้ใช้ส่งคลิปเสียง]');
        };
        reader.readAsDataURL(file);
        this.value = '';
    });
}

function toggleStickerPanel() {
    const panel = $('#sticker-panel');
    panel.toggleClass('open');
}

function handleImageUpload() {}  // stub — real handler in bindStickerAndMediaEvents
function handleAudioUpload() {}  // stub — real handler in bindStickerAndMediaEvents

function shareLocation() {
    if (!state.activeFriend) return;
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
            sendLocationMsg(loc);
        }, () => sendLocationMsg('Bangkok, Thailand'));
    } else {
        sendLocationMsg('Bangkok, Thailand');
    }
}

function sendLocationMsg(loc) {
    const msg = { from: 'user', type: 'location', content: loc, time: formatTime(new Date()) };
    appendChatMessage(msg);
    saveChatMessage(msg);
    botReply(`[ผู้ใช้แชร์โลเคชั่น: ${loc}]`);
}

// Transfer
function confirmTransfer() {
    const amount = $('#transfer-amount').val();
    const note = $('#transfer-note').val();
    if (!amount || Number(amount) <= 0) { showToast('Enter amount'); return; }
    const msg = { from: 'user', type: 'transfer', content: { amount, note }, time: formatTime(new Date()) };
    appendChatMessage(msg);
    saveChatMessage(msg);
    closeSheet();
    $('#transfer-amount').val('');
    $('#transfer-note').val('');
    showToast('Transfer sent');
    botReply(`[ผู้ใช้โอนเงิน ${amount} บาท หมายเหตุ: ${note || 'ไม่มี'}]`);
}

function openStickerManager() {
    showToast('Add stickers from chat panel');
}

function handleBgUpload() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const s = getSettings();
        s.chatBg = e.target.result;
        persistSettings();
        updateChatBg();
        showToast('Wallpaper set');
    };
    reader.readAsDataURL(file);
    this.value = '';
}

// ============================================================
// CALL SCREEN
// ============================================================
function bindCallEvents() {
    $('#call-end-btn').on('click', endCall);
    $('#call-mute-btn').on('click', toggleMute);
    $('#call-chat-send').on('click', sendCallMessage);
    $('#call-chat-input').on('keydown', function(e) {
        if (e.key === 'Enter') sendCallMessage();
    });
}

function startCall() {
    if (!state.activeFriend) { showToast('Select a contact first'); return; }
    const friend = state.activeFriend;
    $('#call-bg').css('background-image', `url(${friend.avatar || ''})`);
    $('#call-avatar').attr('src', friend.avatar || '');
    $('#call-name').text(friend.name);
    $('#call-status').text('Calling...');
    $('#call-timer').text('0:00');
    $('#call-float-text').html('');
    $('#call-screen').addClass('active');
    $('#dynamic-island').addClass('call-active');
    $('#di-text').text(friend.name);
    state.callActive = true;
    state.callTimer = 0;

    setTimeout(() => {
        if (!state.callActive) return;
        $('#call-status').text('Connected');
        state.callTimerInterval = setInterval(() => {
            state.callTimer++;
            const m = Math.floor(state.callTimer / 60);
            const s = state.callTimer % 60;
            $('#call-timer').text(`${m}:${String(s).padStart(2,'0')}`);
        }, 1000);
        // Bot says hello
        botCallSay('สวัสดี รับสายได้เลย');
    }, 1500);
}

function endCall() {
    if (!state.callActive) return;
    state.callActive = false;
    clearInterval(state.callTimerInterval);
    $('#call-screen').removeClass('active');
    $('#dynamic-island').removeClass('call-active');
    showToast('Call ended');
}

function toggleMute() {
    state.callMuted = !state.callMuted;
    $('#call-mute-circle').toggleClass('active', state.callMuted);
    showToast(state.callMuted ? 'Muted' : 'Unmuted');
}

async function sendCallMessage() {
    const input = $('#call-chat-input');
    const text = input.val().trim();
    if (!text) return;
    input.val('');
    // Show user text briefly
    showCallFloatText(text, true);
    // Bot replies
    setTimeout(() => botCallReply(text), 800);
}

async function botCallReply(userText) {
    try {
        const s = getSettings();
        const friend = state.activeFriend;
        const systemPrompt = `คุณคือ ${friend.name}. ${friend.persona || ''} กำลังคุยโทรศัพท์ ตอบสั้นๆ เป็นภาษาไทย ไม่เกิน 2 ประโยค ห้ามใช้อีโมจิ`;
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: systemPrompt,
                messages: [{ role: 'user', content: userText }]
            })
        });
        const data = await resp.json();
        const reply = data.content?.map(c => c.text || '').join('') || '...';
        if (state.callActive) showCallFloatText(reply);
    } catch(e) {}
}

async function botCallSay(text) {
    if (state.callActive) showCallFloatText(text);
}

function showCallFloatText(text, isUser = false) {
    const container = $('#call-float-text');
    container.html('');
    const words = text.split(' ');
    const baseDelay = isUser ? 0 : 0;
    let delay = baseDelay;
    words.forEach((word, i) => {
        const el = $(`<span class="call-float-word" style="animation-delay:${delay}ms;${isUser ? 'opacity:0.5;font-size:16px' : ''}">${escHtml(word)} </span>`);
        container.append(el);
        delay += Math.max(80, word.length * 60);
    });
    // Clear after reading time
    const clearTime = delay + 2000;
    setTimeout(() => { if (state.callActive) container.html(''); }, clearTime);
}

// ============================================================
// FRIENDS APP
// ============================================================
function bindFriendsEvents() {
    $('#friends-refresh-btn').on('click', loadFriendsList);
    $(document).on('input', '#friends-search-input', filterFriends);
    $(document).on('click', '.friend-add-btn', function() {
        const fid = $(this).data('fid');
        addFriend(fid);
    });
    $(document).on('click', '.friend-item', function() {
        const fid = $(this).data('fid');
        const s = getSettings();
        const friend = s.friends.find(f => f.id === fid);
        if (friend) {
            state.activeFriend = friend;
            // Move to messages
            openApp('messages');
        }
    });
}

function loadFriendsList() {
    const context = getContext();
    const $list = $('#friends-list');
    $list.html('');

    // Get bots from SillyTavern context
    let bots = [];
    try {
        if (context.characters && context.characters.length > 0) {
            bots = context.characters.filter(c => !c.isUser).map(c => ({
                id: c.avatar || c.name,
                name: c.name,
                avatar: c.avatar ? `/characters/${c.avatar}` : '',
                persona: c.description || c.personality || '',
            }));
        }
    } catch(e) {}

    if (bots.length === 0) {
        // Demo entries
        bots = [
            { id: 'demo-1', name: 'Aria', avatar: '', persona: 'A friendly assistant.' },
            { id: 'demo-2', name: 'Kai', avatar: '', persona: 'Cool and laid back.' },
        ];
    }

    const s = getSettings();
    const addedIds = new Set((s.friends || []).map(f => f.id));

    bots.forEach(bot => {
        const isAdded = addedIds.has(bot.id);
        $list.append(`
          <div class="friend-item" data-fid="${escHtml(bot.id)}">
            <img class="friend-avatar" src="${escHtml(bot.avatar)}" alt="" onerror="this.src=''">
            <div class="friend-info">
              <div class="friend-name">${escHtml(bot.name)}</div>
              <div class="friend-desc">${escHtml(bot.persona?.substring(0,60) || 'No description')}</div>
            </div>
            ${isAdded
              ? `<span class="friend-added-badge">Added</span>`
              : `<button class="friend-add-btn" data-fid="${escHtml(bot.id)}">Add</button>`}
          </div>`);
        // Store full bot data for add action
        $(`.friend-add-btn[data-fid="${escHtml(bot.id)}"]`).data('botData', bot);
    });

    // Store bot list for reference
    $('#friends-list').data('bots', bots);
}

function filterFriends() {
    const query = $('#friends-search-input').val().toLowerCase();
    $('.friend-item').each(function() {
        const name = $(this).find('.friend-name').text().toLowerCase();
        $(this).toggle(name.includes(query));
    });
}

function addFriend(fid) {
    const bots = $('#friends-list').data('bots') || [];
    const bot = bots.find(b => b.id === fid);
    if (!bot) return;
    const s = getSettings();
    if (!s.friends.find(f => f.id === fid)) {
        s.friends.push(bot);
        persistSettings();
        showToast(`${bot.name} added`);
        loadFriendsList();
        state.activeFriend = bot;
        updateBadges();
        renderContactSwitcher();
    }
}

// ============================================================
// TWITTER APP
// ============================================================
function bindTwitterEvents() {
    // Tabs
    $(document).on('click', '.tweeter-tab', function() {
        const tab = $(this).data('tab');
        $('.tweeter-tab').removeClass('active');
        $(this).addClass('active');
        $('.tweeter-page').removeClass('active');
        $(`#tweeter-${tab}-page`).addClass('active');
        if (tab === 'trends') renderTrends();
        if (tab === 'profile') renderProfile();
        if (tab === 'notifs') renderTwitterNotifs();
        // Clear notif count
        if (tab === 'notifs') {
            $('#twitter-notif-count').text('').hide();
            $('#fab-notif-dot').removeClass('active');
        }
    });

    // Compose
    $('#compose-input').on('input', function() {
        $('#compose-send-btn').prop('disabled', !$(this).val().trim());
    });
    $('#compose-send-btn').on('click', composeTweet);

    // Thread reply
    $('#thread-reply-send').on('click', sendThreadReply);

    // Notif button
    $('#twitter-notif-btn').on('click', () => {
        $('.tweeter-tab').removeClass('active');
        $('.tweeter-tab[data-tab="notifs"]').addClass('active');
        $('.tweeter-page').removeClass('active');
        $('#tweeter-notifs-page').addClass('active');
        renderTwitterNotifs();
        $('#twitter-notif-count').text('').hide();
    });

    // Tweet actions & thread open
    $(document).on('click', '.tweet-action[data-action="like"]', function(e) {
        e.stopPropagation();
        const tid = $(this).closest('[data-tweet-id]').data('tweet-id');
        toggleLike(tid, this);
    });
    $(document).on('click', '.tweet-action[data-action="repost"]', function(e) {
        e.stopPropagation();
        const tid = $(this).closest('[data-tweet-id]').data('tweet-id');
        toggleRepost(tid, this);
    });
    $(document).on('click', '.tweet-item', function() {
        const tid = $(this).data('tweet-id');
        if (tid) openThreadScreen(tid);
    });
}

function getOrCreateFeed() {
    const s = getSettings();
    if (!s.tweetFeed || s.tweetFeed.length === 0) {
        // Seed feed
        s.tweetFeed = [
            {
                id: 100, from: 'bot', author: 'Aria', handle: '@aria_ai',
                text: 'สวัสดีวันใหม่ทุกคน วันนี้อากาศดีมาก น่าออกไปเดินเล่น',
                likes: 12, reposts: 3, views: 450, comments: [],
                liked: false, reposted: false, time: '9:00 AM'
            },
            {
                id: 101, from: 'bot', author: 'Kai', handle: '@kai_cool',
                text: 'เพิ่งดูหนังมา ดีมากเลย แนะนำสุดๆ',
                likes: 8, reposts: 1, views: 200, comments: [],
                liked: false, reposted: false, time: '8:30 AM'
            },
        ];
        s.tweetIdCounter = 102;
        persistSettings();
    }
    return s.tweetFeed;
}

function renderTweetFeed() {
    const feed = getOrCreateFeed();
    const $feed = $('#tweet-feed');
    $feed.html('');
    const s = getSettings();

    // User avatar
    try {
        const ctx = getContext();
        const userAvatar = ctx.user_avatar ? `/User Avatars/${ctx.user_avatar}` : '';
        $('#compose-avatar').attr('src', userAvatar);
        $('#profile-avatar').attr('src', userAvatar);
        $('#thread-compose-avatar').attr('src', userAvatar);
        s.userHandle = '@' + (ctx.name || 'user').toLowerCase().replace(/\s+/, '_');
        s.userName = ctx.name || 'Me';
    } catch(e) {}

    [...feed].reverse().forEach(tw => {
        $feed.append(buildTweetHTML(tw));
    });

    // Auto-generate bot tweets occasionally
    if (feed.length < 5) autoGenBotTweets();
}

function buildTweetHTML(tw) {
    const s = getSettings();
    const isUser = tw.from === 'user';
    let avatarSrc = '';
    if (isUser) {
        try { avatarSrc = $('#compose-avatar').attr('src') || ''; } catch(e) {}
    } else {
        const friend = (s.friends || []).find(f => f.name === tw.author);
        avatarSrc = friend?.avatar || '';
    }
    return `<div class="tweet-item" data-tweet-id="${tw.id}">
      <img class="tweet-avatar" src="${escHtml(avatarSrc)}" alt="" onerror="this.style.background='#333'">
      <div class="tweet-main">
        <div class="tweet-header">
          <span class="tweet-name">${escHtml(tw.author)}</span>
          <span class="tweet-handle">${escHtml(tw.handle)}</span>
          <span class="tweet-time">${escHtml(tw.time || '')}</span>
        </div>
        <div class="tweet-text">${escHtml(tw.text)}</div>
        <div class="tweet-actions">
          <button class="tweet-action ${tw.liked ? 'liked' : ''}" data-action="like">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>${tw.likes}</span>
          </button>
          <button class="tweet-action ${tw.reposted ? 'reposted' : ''}" data-action="repost">
            <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            <span>${tw.reposts}</span>
          </button>
          <button class="tweet-action" data-action="comment">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
            <span>${(tw.comments || []).length}</span>
          </button>
          <span style="margin-left:auto;font-size:11px;color:var(--text3);font-family:-apple-system,sans-serif">${tw.views} views</span>
        </div>
      </div>
    </div>`;
}

function composeTweet() {
    const text = $('#compose-input').val().trim();
    if (!text) return;
    const s = getSettings();
    const feed = getOrCreateFeed();
    const now = formatTime(new Date());
    const tweet = {
        id: s.tweetIdCounter++,
        from: 'user',
        author: s.userName || 'Me',
        handle: s.userHandle || '@user',
        text,
        likes: 0, reposts: 0, views: 1, comments: [],
        liked: false, reposted: false, time: now
    };
    feed.push(tweet);
    persistSettings();
    $('#compose-input').val('');
    $('#compose-send-btn').prop('disabled', true);
    renderTweetFeed();
    showToast('Posted');

    // Bot responds after delay
    setTimeout(() => botReactToTweet(tweet), 3000 + Math.random() * 4000);
}

async function botReactToTweet(tweet) {
    const s = getSettings();
    if (!s.friends || s.friends.length === 0) return;
    const friend = s.friends[Math.floor(Math.random() * s.friends.length)];

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: `คุณคือ ${friend.name} กำลังตอบกลับทวีตบนโซเชียลมีเดีย ตอบสั้นๆ เป็นภาษาไทย ไม่เกิน 1 ประโยค ห้ามใช้อีโมจิ สไตล์พูดคุยสบายๆ`,
                messages: [{ role: 'user', content: `ทวีต: "${tweet.text}" - ตอบกลับเป็นคอมเมนต์` }]
            })
        });
        const data = await resp.json();
        const reply = data.content?.map(c => c.text || '').join('') || '...';

        tweet.comments = tweet.comments || [];
        tweet.comments.push({
            author: friend.name,
            handle: '@' + friend.name.toLowerCase(),
            text: reply,
            time: formatTime(new Date())
        });
        tweet.views += Math.floor(Math.random() * 50) + 10;

        // Add notification
        s.notifications = s.notifications || [];
        s.notifications.unshift({
            type: 'reply',
            text: `${friend.name} ตอบกลับโพสต์ของคุณ`,
            time: formatTime(new Date())
        });
        persistSettings();
        renderTweetFeed();

        // Update notif badge
        const cnt = parseInt($('#twitter-notif-count').text() || '0') + 1;
        $('#twitter-notif-count').text(cnt).show();
        $('#fab-notif-dot').addClass('active');

    } catch(e) {}
}

async function autoGenBotTweets() {
    const s = getSettings();
    if (!s.friends || s.friends.length === 0) return;
    const friend = s.friends[0];

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                system: `คุณคือ ${friend.name} ${friend.persona || ''} โพสต์ทวีตสั้นๆ เป็นภาษาไทย เหมือนชีวิตประจำวัน ไม่เกิน 2 ประโยค ห้ามใช้อีโมจิ`,
                messages: [{ role: 'user', content: 'โพสต์ทวีตเกี่ยวกับชีวิตประจำวัน' }]
            })
        });
        const data = await resp.json();
        const text = data.content?.map(c => c.text || '').join('') || '...';

        const feed = getOrCreateFeed();
        feed.push({
            id: s.tweetIdCounter++,
            from: 'bot',
            author: friend.name,
            handle: '@' + friend.name.toLowerCase(),
            text,
            likes: Math.floor(Math.random() * 30),
            reposts: Math.floor(Math.random() * 8),
            views: Math.floor(Math.random() * 500) + 50,
            comments: [],
            liked: false, reposted: false,
            time: formatTime(new Date())
        });
        persistSettings();
        renderTweetFeed();
    } catch(e) {}
}

function toggleLike(tid, btn) {
    const s = getSettings();
    const tweet = s.tweetFeed.find(t => t.id === tid);
    if (!tweet) return;
    tweet.liked = !tweet.liked;
    tweet.likes += tweet.liked ? 1 : -1;
    persistSettings();
    const $btn = $(btn);
    $btn.toggleClass('liked', tweet.liked);
    $btn.find('span').text(tweet.likes);
}

function toggleRepost(tid, btn) {
    const s = getSettings();
    const tweet = s.tweetFeed.find(t => t.id === tid);
    if (!tweet) return;
    tweet.reposted = !tweet.reposted;
    tweet.reposts += tweet.reposted ? 1 : -1;
    persistSettings();
    const $btn = $(btn);
    $btn.toggleClass('reposted', tweet.reposted);
    $btn.find('span').text(tweet.reposts);
    if (tweet.reposted) showToast('Reposted');
}

function renderThreadView(tweetId) {
    const s = getSettings();
    const tweet = s.tweetFeed.find(t => t.id === tweetId);
    if (!tweet) return;
    const $content = $('#thread-content');
    $content.html('');

    let avatarSrc = '';
    if (tweet.from !== 'user') {
        const friend = (s.friends || []).find(f => f.name === tweet.author);
        avatarSrc = friend?.avatar || '';
    }

    $content.append(`
      <div class="thread-original">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <img style="width:48px;height:48px;border-radius:50%;object-fit:cover;background:var(--bg3)" src="${escHtml(avatarSrc)}" alt="">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text);font-family:-apple-system,sans-serif">${escHtml(tweet.author)}</div>
            <div style="font-size:13px;color:var(--text3);font-family:-apple-system,sans-serif">${escHtml(tweet.handle)}</div>
          </div>
        </div>
        <div class="tweet-text" style="font-size:18px;margin-top:10px">${escHtml(tweet.text)}</div>
        <div class="thread-original tweet-stats">
          <span>${tweet.reposts} Reposts</span>
          <span>${tweet.likes} Likes</span>
          <span>${tweet.views} Views</span>
        </div>
        <div class="tweet-actions thread-original">
          <button class="tweet-action ${tweet.liked ? 'liked' : ''}" data-action="like" data-tweet-id="${tweet.id}">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>${tweet.likes}</span>
          </button>
          <button class="tweet-action ${tweet.reposted ? 'reposted' : ''}" data-action="repost" data-tweet-id="${tweet.id}">
            <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
            <span>${tweet.reposts}</span>
          </button>
        </div>
      </div>`);

    // Replies
    (tweet.comments || []).forEach(c => {
        $content.append(`
          <div class="tweet-item" style="cursor:default">
            <img class="tweet-avatar" src="" alt="" style="background:#333">
            <div class="tweet-main">
              <div class="tweet-header">
                <span class="tweet-name">${escHtml(c.author)}</span>
                <span class="tweet-handle">${escHtml(c.handle)}</span>
                <span class="tweet-time">${escHtml(c.time || '')}</span>
              </div>
              <div class="tweet-text">${escHtml(c.text)}</div>
            </div>
          </div>`);
    });
}

async function sendThreadReply() {
    const text = $('#thread-reply-input').val().trim();
    if (!text || !state.currentTweetId) return;
    const s = getSettings();
    const tweet = s.tweetFeed.find(t => t.id === state.currentTweetId);
    if (!tweet) return;

    tweet.comments = tweet.comments || [];
    tweet.comments.push({
        author: s.userName || 'Me',
        handle: s.userHandle || '@user',
        text,
        time: formatTime(new Date())
    });
    persistSettings();
    $('#thread-reply-input').val('');
    renderThreadView(state.currentTweetId);
    showToast('Reply sent');

    // Bot responds
    setTimeout(() => botReactToTweet(tweet), 2000);
}

function renderTrends() {
    const trends = [
        { tag: '#ภาษาไทย', count: '12.4K posts' },
        { tag: '#SillyTavern', count: '8.2K posts' },
        { tag: '#AI', count: '45.1K posts' },
        { tag: '#โปรแกรม', count: '6.7K posts' },
        { tag: '#ชีวิตดี', count: '22.3K posts' },
        { tag: '#เทคโนโลยี', count: '18.9K posts' },
        { tag: '#มือถือ', count: '14.2K posts' },
        { tag: '#แชทบอท', count: '9.8K posts' },
    ];
    const $list = $('#trends-list');
    $list.html('');
    trends.forEach((t, i) => {
        $list.append(`
          <div class="trend-item">
            <div class="trend-num">Trending #${i + 1}</div>
            <div class="trend-tag">${escHtml(t.tag)}</div>
            <div class="trend-count">${t.count}</div>
          </div>`);
    });
}

function renderProfile() {
    const s = getSettings();
    const myTweets = (s.tweetFeed || []).filter(t => t.from === 'user');
    const totalLikes = myTweets.reduce((a, t) => a + (t.likes || 0), 0);
    $('#profile-name').text(s.userName || 'Me');
    $('#profile-handle').text(s.userHandle || '@user');
    $('#profile-tweets-count').text(myTweets.length);
    $('#profile-likes-count').text(totalLikes);
    const $feed = $('#profile-tweets-feed');
    $feed.html('');
    [...myTweets].reverse().forEach(tw => $feed.append(buildTweetHTML(tw)));
}

function renderTwitterNotifs() {
    const s = getSettings();
    const $list = $('#twitter-notifs-list');
    $list.html('');
    const notifs = s.notifications || [];
    if (notifs.length === 0) {
        $list.html('<div style="padding:30px;text-align:center;color:var(--text3);font-family:-apple-system,sans-serif;font-size:14px">No notifications yet</div>');
        return;
    }
    notifs.forEach(n => {
        const typeMap = {
            reply: { cls: 'reply', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
            like:  { cls: 'like',  icon: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
            repost:{ cls: 'repost',icon: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z' },
        };
        const t = typeMap[n.type] || typeMap.reply;
        $list.append(`
          <div class="notif-item">
            <div class="notif-icon ${t.cls}"><svg viewBox="0 0 24 24"><path d="${t.icon}"/></svg></div>
            <span class="notif-text">${escHtml(n.text)}</span>
            <span class="notif-time">${escHtml(n.time || '')}</span>
          </div>`);
    });
}

// ============================================================
// SHEETS
// ============================================================
function openSheet(name) {
    state.openSheet = name;
    $(`#${name}-sheet`).addClass('open');
    $('#sheet-backdrop').addClass('open');
}

function closeSheet() {
    if (state.openSheet) {
        $(`#${state.openSheet}-sheet`).removeClass('open');
    }
    $('#sheet-backdrop').removeClass('open');
    state.openSheet = null;
}

// ============================================================
// BADGES
// ============================================================
function updateBadges() {
    const s = getSettings();
    const friendCount = (s.friends || []).length;
    if (friendCount > 0) {
        $('#badge-messages').addClass('show').text('');
    }
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
    const toast = $('#ios-toast');
    toast.text(msg).addClass('show');
    setTimeout(() => toast.removeClass('show'), 2000);
}

// ============================================================
// UTILS
// ============================================================
function formatTime(d) {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
