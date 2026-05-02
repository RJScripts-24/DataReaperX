# DataReaper Tripwire Shield — Setup Guide

## Prerequisites
- Node.js 18+ installed
- DataReaper backend running at `http://localhost:8000`
- DataReaper frontend running at `http://localhost:5173`

---

## Step 1 — Get Your Google Safe Browsing API Key

> Skip this step to run in **mock-safe mode** (all URLs treated as clean).

1. Go to <https://console.cloud.google.com>
2. Create or select a project
3. **APIs & Services → Library** → search **"Safe Browsing API"** → **Enable**
4. **APIs & Services → Credentials** → **Create Credentials → API Key**
5. Copy the key (format: `AIzaSyXXXXXXXXXXXXXXXXXXX`)
6. Recommended: **Edit API Key → Restrict key → Safe Browsing API**

---

## Step 2 — Add Keys to `backend/.env`

```env
GOOGLE_SAFE_BROWSING_API_KEY=AIzaSyYOUR_KEY_HERE
SHIELD_DASHBOARD_ORIGIN=http://localhost:5173
SHIELD_API_BASE=http://localhost:8000/api
```

---

## Step 3 — Package the Extension

```bash
cd extension
npm install                                      # installs canvas for icon generation

# Mac / Linux
export GOOGLE_SAFE_BROWSING_API_KEY=AIzaSyYOUR_KEY_HERE
export SHIELD_DASHBOARD_ORIGIN=http://localhost:5173
export SHIELD_API_BASE=http://localhost:8000/api
node package-extension.js
```

```powershell
# Windows (PowerShell)
$env:GOOGLE_SAFE_BROWSING_API_KEY="AIzaSyYOUR_KEY_HERE"
$env:SHIELD_DASHBOARD_ORIGIN="http://localhost:5173"
$env:SHIELD_API_BASE="http://localhost:8000/api"
node package-extension.js
```

This automatically:
1. Generates `icons/icon16.png`, `icon48.png`, `icon128.png`
2. Writes `background-config-init.js` with your key embedded
3. Creates `backend/static/datareaper-tripwire.zip`

---

## Step 4 — Load the Extension in Chrome

**Option A — Load from dashboard (recommended)**
1. Start the backend and frontend
2. Open the Command Center at `http://localhost:5173`
3. Click **⚔️ Deploy Active Shield** — zip downloads automatically
4. Unzip the downloaded file

**Option B — Load directly from source folder**
- Use the `extension/` directory directly (no unzip needed)

**Both options:**
1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select the folder
4. Return to the dashboard tab — the badge turns green within 10 seconds ✅

---

## Step 5 — Verify

- Dashboard badge: **Shield Active · Monitoring DOM** (green)
- Any tab DevTools Console: `[DataReaper] Shield active on this tab.`
- `chrome://extensions` → Inspect service worker: `[DataReaper] Config injected into storage.`

---

## Production Deployment

Before shipping, update `backend/.env`:
```env
SHIELD_DASHBOARD_ORIGIN=https://your-prod-domain.com
SHIELD_API_BASE=https://api.your-prod-domain.com/api
```

Also update `extension/manifest.json` content_scripts matches to include your prod domain:
```json
"matches": ["http://localhost:5173/*", "https://your-prod-domain.com/*"]
```

Re-run `node package-extension.js` with the updated env vars.

---

## Chrome Web Store (Post-Hackathon)

1. Create developer account at <https://chrome.google.com/webstore/devconsole> ($5 one-time)
2. Submit `datareaper-tripwire.zip` for review (1–7 days)
3. Once approved, replace the "Load unpacked" steps in `OnboardingModal` with a Web Store install link