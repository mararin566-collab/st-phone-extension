# 📱 Phone Chat — SillyTavern Extension

A fully-featured **mobile phone UI overlay** for SillyTavern. Chat with your character inside a beautiful iPhone-style interface — completely separate from the main ST chat.

---

## ✨ Features

| Feature | Description |
|---|---|
| 📱 iPhone UI | Floating button → full phone overlay with notch, status bar |
| 💬 Separate Chat | Talks to your current character via AI, independent of main ST chat |
| 📝 Notes | You AND your character can write/edit notes |
| 📍 Location Share | Share your real or approximate location |
| 🎤 Voice Clips | Record & send voice messages |
| 💸 Money Transfer | Send "transfer" bubbles with amount & note |
| 📷 Photos | Take a photo or pick from gallery |
| 🎭 Stickers | Built-in packs + add your own custom emojis |
| 🎨 Themes | 8 accent colors, 6 chat backgrounds, adjustable font size |
| 💾 Auto-save | Everything saved per character automatically |
| 📤 Export | Export chat history as .txt |

---

## 📦 Installation

### Option A — Install via URL (Recommended)
1. Open SillyTavern
2. Go to **Extensions** → **Install Extension**
3. Paste this URL:
```
https://raw.githubusercontent.com/YOUR_USERNAME/st-phone-extension/main
```
4. Click Install → Reload

### Option B — Manual
1. Download this repo as ZIP
2. Extract to `SillyTavern/public/scripts/extensions/third-party/phone-chat/`
3. Reload SillyTavern

---

## 🚀 Usage

1. Look for the **📱 floating button** (bottom-right of screen)
2. Tap it to open the phone overlay
3. **Home screen** → tap Messages to start chatting
4. The AI uses your current ST character automatically
5. Everything auto-saves when you close

---

## 🛠️ File Structure

```
phone-chat/
├── manifest.json   ← Extension metadata
├── index.js        ← All logic
├── style.css       ← iPhone-style UI
└── README.md
```

---

## ⚙️ Settings (inside the phone)

- **Identity** — Set your display name
- **Theme Color** — 8 color options
- **Chat Background** — 6 dark backgrounds  
- **Text Size** — Slider 12–20px
- **Sticker Packs** — Add custom emojis
- **Export / Clear Data**

---

## 📝 Notes

- The phone chat is **100% separate** from your main ST chat
- Data is saved per-character in `localStorage`
- Requires a working AI backend in SillyTavern (any API)
- Voice recording requires microphone permission
- Location requires location permission (falls back to "Bangkok, Thailand")

---

## 🐛 Known Limitations

- Voice clips are stored in memory (lost on page refresh) — export important ones
- Image files are stored as base64 in localStorage (may get large over time)

---

## 📄 License

MIT — free to use, modify, share.
