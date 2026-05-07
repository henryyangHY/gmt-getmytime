# 🕐 GMT — GetMyTime

A lightweight Chrome Extension that converts time zones on the fly. Highlight any time text, right-click **"Get My Time"**, and instantly see it in your local time — with one-click Google Calendar integration.

Built for professionals and students managing cross-border communication, especially between US and Asian time zones.

## ✨ Features

- **Right-click to convert** — Select any time text → Right-click → "🕐 Get My Time"
- **Smart detection** — No timezone in text = already your local time. Explicit TZ = converts automatically
- **Time ranges** — Handles `9 AM – 4 PM`, `10:00 to 14:30`, etc.
- **Date-aware** — Parses `June 15th at 10 AM CT`, `Sep 22 from 2 PM to 5 PM EST`
- **Ambiguity handling** — CST, EST, IST, PST and 5 other ambiguous abbreviations show a picker (e.g., US Central vs. China Standard Time)
- **GMT+X display** — Shows `GMT-5 (NYC / TOR / MIA)` instead of city names
- **DST auto-handled** — Uses `Intl.DateTimeFormat` for accurate daylight saving time
- **Google Calendar** — One-click "📅 Add to Google Calendar" button in the tooltip
- **Zero frameworks** — Vanilla JS, ultra-lightweight

## 📦 Install (Developer Mode)

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome or Edge
3. Enable **Developer mode** (toggle in top-right)
4. Click **"Load unpacked"** → select the project folder
5. Done! The extension icon appears in your toolbar

## 🧪 Testing

Automated tests use [Playwright](https://playwright.dev/) to launch a real browser with the extension loaded.

```bash
npm install
npx playwright install chromium
node test-runner.mjs
```

A manual test page is also available at `test-cases.html` — open it in your browser and right-click the highlighted text samples.

## 📁 Project Structure

```
├── manifest.json            # Manifest V3 configuration
├── background/
│   └── background.js        # Service worker: context menu + message routing
├── content/
│   ├── content.js           # Time parsing, conversion, tooltip, calendar
│   └── content.css          # Tooltip styles
├── popup/
│   ├── popup.html           # Manual converter UI
│   ├── popup.js             # Popup conversion logic
│   └── popup.css            # Popup styles
├── icons/                   # Extension icons (16/48/128px)
├── test-cases.html          # Manual test page with 18 scenarios
└── test-runner.mjs          # Playwright automated test runner
```

## 🌐 Supported Time Zones

**Unambiguous (auto-convert):**
`CT` `ET` `PT` `MT` `HKT` `JST` `KST` `SGT` `CET` `GMT` `UTC` `GMT±X` `UTC±X`

**Ambiguous (shows picker):**
`CST` `EST` `IST` `PST` `MST` `BST` `AST` `SST`

## 🛠 Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES6+)
- `Intl.DateTimeFormat` for timezone handling
- Playwright for automated testing
- Google Calendar URL API (no OAuth)

## 📄 License

MIT

## 👤 Author

**Henry Yang** — GMT v1.0, built with Copilot CLI in 2 hours 15 minutes via Vibe Coding.
