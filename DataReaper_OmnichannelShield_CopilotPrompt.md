# DataReaper Omnichannel Shield — End-to-End Copilot Implementation Prompt

> **How to use this document:**  
> Execute each Phase as a **separate prompt** to your AI copilot (Cursor, GitHub Copilot, Claude, etc.).  
> Never paste multiple phases at once. This prevents hallucination and keeps each context window focused.  
> At the start of every phase prompt, paste the Phase block verbatim.

---

## Project Context (Paste This With Every Phase)

```
Project: DataReaper — a privacy-focused web app that scans data brokers and automates opt-out requests.

Stack:
- Frontend: React + TypeScript + Vite, Tailwind CSS, shadcn/ui, Framer Motion (motion/react), Recharts, Lucide icons, Sonner (toast), React Router v7
- Backend: FastAPI (Python), LangGraph orchestration, PostgreSQL, Redis, async SQLAlchemy
- Auth: Session-based via `X-Session-Id` header stored in `sessionStorage` under key `dr_session_id`
- API Client: Axios instance at `frontend/src/lib/apiClient.ts`
- Design language: "hand-drawn" sketchbook aesthetic. Key CSS classes: `hand-drawn-card`, `hand-drawn-button`. Key fonts: Patrick Hand, Dancing Script, Caveat. Key palette — bg: #f5f3ef, blue: #4a6fa5, orange: #d17a22, red: #b94a48, green: #4f7d5c
- Main dashboard page: `frontend/src/pages/CommandCenter.tsx` — contains the "Data Reaped" ProgressPill and StatCards
- Backend router: `backend/src/datareaper/api/router.py` — all new routes go in a new file under `backend/src/datareaper/api/routes/`
```

---

## Phase 1 — Backend: Shield Session Token API + Static Extension File Serving

### Goal
Create the backend infrastructure that:
1. Issues a short-lived `shield_token` tied to the user's session so the extension can authenticate without a second login.
2. Serves the pre-packaged Chrome extension zip (`datareaper-tripwire.zip`) as a static download.
3. Exposes a `/shield/status` endpoint the frontend polls to know whether the extension is active.

### Prompt

```
You are working inside the DataReaper FastAPI backend located at `backend/src/datareaper/`.

**Task: Create a new route file `backend/src/datareaper/api/routes/shield.py` with the following endpoints.**

--- Endpoint 1: POST /shield/token ---
- Path: POST /api/shield/token
- Auth: Reads the `X-Session-Id` header (same pattern used by every other route in this project — check `backend/src/datareaper/api/routes/dashboard.py` for the exact header extraction pattern).
- Logic:
  - Generate a UUID4 token.
  - Store it in Redis with key `shield_token:{token}` → value = `session_id`, TTL = 3600 seconds.
  - Return JSON: `{ "shield_token": "<token>", "expires_in": 3600 }`
- Error: If `X-Session-Id` is missing, return 401.

--- Endpoint 2: GET /shield/status ---
- Path: GET /api/shield/status
- Auth: Same `X-Session-Id` header extraction.
- Logic:
  - Scan Redis for any key matching `shield_active:{session_id}` (set by the extension on install — see Phase 2).
  - Return JSON: `{ "active": true/false, "last_seen": "<ISO timestamp or null>" }`

--- Endpoint 3: POST /shield/heartbeat ---
- Path: POST /api/shield/heartbeat
- Auth: Reads `Authorization: Bearer <shield_token>` header.
- Logic:
  - Look up Redis key `shield_token:{token}`. If not found → 401.
  - Set Redis key `shield_active:{session_id}` → `{ "last_seen": "<current UTC ISO timestamp>" }`, TTL = 120 seconds.
  - Return JSON: `{ "ok": true }`

--- Endpoint 4: GET /shield/download ---
- Path: GET /api/shield/download
- No auth required.
- Logic: Serve the file at `backend/static/datareaper-tripwire.zip` using FastAPI's `FileResponse`.
- If the file does not exist, return a 404 JSON response: `{ "detail": "Extension package not found." }`
- Set header: `Content-Disposition: attachment; filename="datareaper-tripwire.zip"`

**After creating `shield.py`:**

1. Open `backend/src/datareaper/api/router.py`.
2. Import the new shield router.
3. Register it: `api_router.include_router(shield.router, prefix="/shield", tags=["shield"])`

**Also:**
- Create the directory `backend/static/` and add a `.gitkeep` inside it.
- Add a note in the file: `# Place the compiled datareaper-tripwire.zip in backend/static/ before deployment`.

Use the same async Redis client pattern already used in this codebase (check how other routes get the Redis dependency via FastAPI `Depends`). Do not introduce new dependencies. Match the existing error-handling style from `backend/src/datareaper/api/errors.py`.
```

---

## Phase 2 — Chrome Extension: Core Manifest + Background Script

### Goal
Build the Chrome extension skeleton:
- `manifest.json` (MV3)
- Background service worker (`background.js`) that:
  - Reads the shield token from the web dashboard's origin storage on install.
  - Starts a heartbeat loop to the backend.
  - Queries Google Safe Browsing API for every new tab URL.
  - Broadcasts threat status to content scripts.

### Prompt

```
You are creating a new Chrome Extension (Manifest V3) for DataReaper.
Create all files inside a new top-level directory: `extension/`.

--- File: extension/manifest.json ---
{
  "manifest_version": 3,
  "name": "DataReaper Tripwire Shield",
  "version": "1.0.0",
  "description": "Active defense layer for DataReaper. Monitors for malicious sites and blocks credential theft.",
  "permissions": ["storage", "tabs", "scripting", "webNavigation", "alarms"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "web_accessible_resources": [
    {
      "resources": ["icons/*"],
      "matches": ["<all_urls>"]
    }
  ]
}

--- File: extension/background.js ---

Implement the following logic as a single background service worker file. Use only vanilla JS (no imports, no bundler).

**Constants (make these easy to find at the top of the file):**
```js
const DASHBOARD_ORIGIN = "http://localhost:5173"; // Vite dev default; user replaces with prod URL
const API_BASE = "http://localhost:8000/api";     // FastAPI base
const SAFE_BROWSING_API_KEY = "";                 // User fills in their Google Safe Browsing API key
const SAFE_BROWSING_URL = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
const HEARTBEAT_ALARM = "dr_heartbeat";
const THREAT_CACHE_TTL_MS = 5 * 60 * 1000;       // 5 min cache
```

**On Extension Install (`chrome.runtime.onInstalled`):**
1. Try to read `shield_token` from `chrome.storage.local`.
2. If found, skip. If not, log "Shield token not yet set. User must visit dashboard."
3. Create a Chrome alarm named `dr_heartbeat` that fires every 60 seconds.

**Heartbeat Alarm Handler (`chrome.alarms.onAlarm`):**
1. Read `shield_token` from `chrome.storage.local`.
2. If no token, return early.
3. POST to `${API_BASE}/shield/heartbeat` with header `Authorization: Bearer ${token}`.
4. On 401 response, clear the token from storage and broadcast `{ type: "DR_SHIELD_DEACTIVATED" }` to all tabs.
5. On success, broadcast `{ type: "DR_SHIELD_ACTIVE" }` to all tabs.

**Tab Navigation Handler (`chrome.tabs.onUpdated`):**
1. Only fire when `changeInfo.status === "complete"` and tab has a URL starting with `http`.
2. Extract the hostname from the URL.
3. Check `chrome.storage.local` for a cached threat result for this hostname (key: `threat_cache_${hostname}`). If cached and not expired, use cached result.
4. If not cached, call `checkSafeBrowsing(url)`.
5. Cache the result with a timestamp.
6. If threat found, call `chrome.tabs.sendMessage(tabId, { type: "DR_THREAT_DETECTED", hostname })`.
7. If clean, call `chrome.tabs.sendMessage(tabId, { type: "DR_THREAT_CLEAR" })`.

**`async function checkSafeBrowsing(url)`:**
- If `SAFE_BROWSING_API_KEY` is empty, always return `false` (safe). Log a warning.
- POST to SAFE_BROWSING_URL with body:
  ```json
  {
    "client": { "clientId": "datareaper-tripwire", "clientVersion": "1.0.0" },
    "threatInfo": {
      "threatTypes": ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
      "platformTypes": ["ANY_PLATFORM"],
      "threatEntryTypes": ["URL"],
      "threatEntries": [{ "url": "<url>" }]
    }
  }
  ```
- Return `true` if `response.matches` has any items, else `false`.

**Message Listener (`chrome.runtime.onMessage`):**
Listen for `{ type: "DR_REGISTER_TOKEN", token: "<token>" }`.
On receive: store `shield_token` in `chrome.storage.local`. Immediately send one heartbeat. Broadcast `{ type: "DR_SHIELD_ACTIVE" }` to all open tabs.
```

---

## Phase 3 — Chrome Extension: Content Script (Tripwire Active Defense)

### Goal
Build `extension/content.js` — the script injected into every page that:
- Applies the red warning cursor.
- Freezes password inputs.
- Shows the kill-screen overlay.

### Prompt

```
You are adding the content script for the DataReaper Tripwire Chrome Extension.

Create the file `extension/content.js`. Use only vanilla JS, no imports.

**State variables at top:**
```js
let isThreatActive = false;
let overlayInjected = false;
let cursorStyleEl = null;
let cursorTimeout = null;
```

**Message listener (`chrome.runtime.onMessage`):**
Listen for messages from the background script:
- `{ type: "DR_THREAT_DETECTED" }` → call `activateTripwire()`.
- `{ type: "DR_THREAT_CLEAR" }` → call `deactivateTripwire()`.
- `{ type: "DR_SHIELD_ACTIVE" }` → log "Shield active on this tab."
- `{ type: "DR_SHIELD_DEACTIVATED" }` → call `deactivateTripwire()` and remove overlay.

**`function activateTripwire()`:**
1. Set `isThreatActive = true`.
2. Call `injectRedCursor()`.
3. Call `freezePasswordInputs()`.
4. Call `showKillScreen()`.

**`function deactivateTripwire()`:**
1. Set `isThreatActive = false`.
2. Remove the red cursor style element if present.
3. Remove the kill-screen overlay if present.
4. Remove all password event listeners (use a named handler stored in a WeakMap so you can remove them).

**`function injectRedCursor()`:**
- Create a `<style>` element with: `* { cursor: url('data:image/svg+xml,...') 16 16, crosshair !important; }`
  Use an inline SVG data URI for a red crosshair/skull cursor. Keep the SVG simple (a red circle with an X).
- Append to `document.head`.
- Store reference in `cursorStyleEl`.
- Clear any existing cursor timeout.
- Set `cursorTimeout = setTimeout(() => { cursorStyleEl?.remove(); }, 20000)`.

**`function freezePasswordInputs()`:**
- Query `document.querySelectorAll('input[type="password"]')`.
- For each input, attach two event listeners: `focus` and `keydown`.
  - `focus` handler: call `event.preventDefault()`, then `element.blur()`. Also call `showKillScreen()` if not already shown.
  - `keydown` handler: call `event.preventDefault()`, `event.stopImmediatePropagation()`.
- Use a `MutationObserver` on `document.body` to also freeze any password inputs added dynamically after page load.

**`function showKillScreen()`:**
- If `overlayInjected` is true, return early.
- Set `overlayInjected = true`.
- Create a `div` and set its `innerHTML` to the following HTML structure. Style it as a full-viewport frosted-glass overlay using only inline styles (no external CSS):

```
Position: fixed, top:0, left:0, width:100vw, height:100vh
z-index: 2147483647
background: rgba(10, 0, 0, 0.72)
backdrop-filter: blur(12px)
display: flex, align-items: center, justify-content: center
font-family: system-ui, sans-serif
```

- Inside the overlay, render a centered card (white bg, border-radius: 16px, padding: 40px, max-width: 480px, text-align: center, box-shadow: 0 0 60px rgba(220,0,0,0.4)):
  - A large red warning icon (⛔ unicode or inline SVG skull).
  - `<h1>` in dark red (#8b0000): "DataReaper Intercept"
  - `<p>` in #333: "Malicious domain detected. Credential input has been disabled to protect your identity."
  - A second `<p>` in #666, smaller: "Close this tab immediately and run a DataReaper scan to assess damage."
  - A dismiss button styled in dark red — on click, removes the overlay and sets `overlayInjected = false`.

- Also briefly animate the page body with a dim effect:
  ```js
  document.body.style.transition = "filter 0.3s ease";
  document.body.style.filter = "brightness(0.4)";
  setTimeout(() => { document.body.style.filter = "brightness(1)"; }, 400);
  ```

**`function observeNewPasswordInputs()`:**
Use a MutationObserver watching `{ childList: true, subtree: true }` on `document.body`.
On each mutation, if `isThreatActive`, call `freezePasswordInputs()` again to catch late-loaded inputs.

Call `observeNewPasswordInputs()` immediately when the content script loads.
```

---

## Phase 4 — Extension Packaging Script

### Goal
Create a Node.js script to zip the extension into `backend/static/datareaper-tripwire.zip` so the backend can serve it.

### Prompt

```
You are adding a build/packaging script for the DataReaper Chrome extension.

Create the file `extension/package-extension.js`. This is a Node.js script (no npm packages, only Node built-ins: `fs`, `path`, `child_process`).

**Logic:**
1. Define `SRC_DIR = path.resolve(__dirname)` (the extension/ directory itself).
2. Define `OUT_PATH = path.resolve(__dirname, "../backend/static/datareaper-tripwire.zip")`.
3. Ensure `backend/static/` exists (`fs.mkdirSync` with `recursive: true`).
4. Use `child_process.execSync` to call the system `zip` command:
   `zip -r "${OUT_PATH}" manifest.json background.js content.js icons/`
   Run from the `extension/` directory as `cwd`.
5. Print: `✅ Extension packaged to ${OUT_PATH}`.

Also create `extension/package.json`:
```json
{
  "name": "datareaper-tripwire-extension",
  "version": "1.0.0",
  "scripts": {
    "package": "node package-extension.js"
  }
}
```

Also create `extension/icons/README.md` with content:
```
Place your extension icons here:
- icon16.png  (16x16)
- icon48.png  (48x48)
- icon128.png (128x128)

These should follow the DataReaper visual identity (dark red / skull motif).
You can generate them from the AnimatedDataReaperLogo component or use any icon tool.
```

Finally, update the root `.gitignore` (at `DataReaper-main/.gitignore`) to add:
```
backend/static/datareaper-tripwire.zip
extension/icons/*.png
```
```

---

## Phase 5 — Frontend: Shield Hook + API Integration

### Goal
Add a React hook and API function to the frontend that:
1. Polls `/api/shield/status` every 10 seconds.
2. Requests a `shield_token` and sends it to the installed extension.
3. Triggers the extension download flow.

### Prompt

```
You are adding frontend integration for the DataReaper Omnichannel Shield feature.

**Step 1: Add API functions to `frontend/src/lib/api.ts` (or create it if not present).**

Add these three functions, using the existing `apiClient` from `frontend/src/lib/apiClient.ts`:

```ts
export async function requestShieldToken(): Promise<{ shield_token: string; expires_in: number }> {
  const res = await apiClient.post("/api/shield/token");
  return res.data;
}

export async function fetchShieldStatus(): Promise<{ active: boolean; last_seen: string | null }> {
  const res = await apiClient.get("/api/shield/status");
  return res.data;
}

export function downloadShieldExtension(): void {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  window.location.href = `${apiBase}/api/shield/download`;
}
```

**Step 2: Create `frontend/src/lib/useShield.ts`**

This custom hook manages the full shield lifecycle:

```ts
import { useState, useEffect, useCallback, useRef } from "react";
import { requestShieldToken, fetchShieldStatus } from "./api";

export type ShieldState = "idle" | "downloading" | "pending_install" | "active" | "error";

export function useShield() {
  const [shieldState, setShieldState] = useState<ShieldState>("idle");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll shield status every 10 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await fetchShieldStatus();
        if (status.active) {
          setShieldState("active");
          setLastSeen(status.last_seen);
        } else if (shieldState === "active") {
          setShieldState("pending_install"); // went offline
        }
      } catch {
        // silent — don't interrupt the user
      }
    };

    poll();
    pollRef.current = setInterval(poll, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Listen for messages from the installed extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "DR_EXTENSION_READY") {
        setShieldState("active");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const deployShield = useCallback(async () => {
    try {
      setShieldState("downloading");
      const { shield_token } = await requestShieldToken();
      // Broadcast the token to any already-installed extension via window.postMessage
      window.postMessage({ type: "DR_REGISTER_TOKEN", token: shield_token }, window.location.origin);
      // Also store in sessionStorage as a fallback for the extension to read on next visit
      sessionStorage.setItem("dr_shield_token", shield_token);
      setShieldState("pending_install");
      return shield_token;
    } catch (e) {
      setError("Failed to generate shield token. Please try again.");
      setShieldState("error");
      throw e;
    }
  }, []);

  return { shieldState, lastSeen, error, deployShield };
}
```

Note: The extension's content script will pick up `DR_REGISTER_TOKEN` from `window.postMessage` because content scripts injected at `document_idle` can listen to `window` messages on the same origin.

Actually — correct the above: Chrome extensions don't receive `window.postMessage` from the page in the background script. The token handoff approach should instead be:
1. The dashboard stores `dr_shield_token` in `sessionStorage`.
2. A content script injected ONLY on `DASHBOARD_ORIGIN` reads it from the DOM via `document.querySelector('meta[name="dr-shield-token"]')` OR the dashboard sets it in `window.__DR_SHIELD_TOKEN__`.
3. Update the `background.js` `onMessage` listener to also check: on the tab for DASHBOARD_ORIGIN, inject a tiny script to read `window.__DR_SHIELD_TOKEN__`.

**Add this to the hook's `deployShield` function after getting the token:**
```ts
// Expose token for extension to pick up via injected content script
(window as any).__DR_SHIELD_TOKEN__ = shield_token;
```

**Step 3: Update `extension/background.js`** (add to the existing tab handler):
After the Safe Browsing check, also check: if the tab's URL matches `DASHBOARD_ORIGIN`, inject a tiny script to harvest the token:
```js
chrome.scripting.executeScript({
  target: { tabId },
  func: () => window.__DR_SHIELD_TOKEN__ || null,
}, (results) => {
  const token = results?.[0]?.result;
  if (token) {
    chrome.storage.local.set({ shield_token: token });
    chrome.runtime.sendMessage({ type: "DR_REGISTER_TOKEN", token });
  }
});
```
```

---

## Phase 6 — Frontend: ShieldButton Component

### Goal
Build the `ShieldButton` component that lives next to the ProgressPill on the CommandCenter page. It handles all three visual states: idle (deploy button), pending_install (onboarding modal), and active (green badge).

### Prompt

```
You are adding the ShieldButton component to the DataReaper frontend.
The design must strictly follow DataReaper's hand-drawn sketchbook aesthetic:
- CSS classes: `hand-drawn-card`, `hand-drawn-button`
- Fonts: 'Patrick Hand', 'Caveat', 'Dancing Script' (cursive)
- Colors: bg #f5f3ef, blue #4a6fa5, red #b94a48, green #4f7d5c, text #1f1f1f
- Motion: use `motion` from `motion/react` for animations
- Toast: use `toast` from `sonner`

**Create `frontend/src/components/ShieldButton.tsx`**

This component receives no props and uses the `useShield` hook internally.

**State: "idle"** — render a pulsing button:
- Label: "⚔️ Deploy Active Shield"
- Style: `hand-drawn-button` with a subtle CSS `box-shadow` pulse animation (keyframe: alternate between no shadow and `0 0 12px rgba(74,111,165,0.6)`)
- Font: Patrick Hand, 14px
- On click: call `deployShield()`, then trigger a confetti animation (use the `canvas-confetti` library — check if already in `package.json`; if not, add it). Show a sonner toast: `toast.success("Shield deployment initiated! Download starting...")`. Call `downloadShieldExtension()`.

**State: "downloading"** — render a spinning scythe emoji with "Packaging shield..." text in Caveat font.

**State: "pending_install"** — render the button as disabled/grey with label "⏳ Awaiting Extension Install", and immediately show the OnboardingModal (see below).

**State: "active"** — render a glowing green badge:
```tsx
<div style={{
  display: "inline-flex", alignItems: "center", gap: 8,
  backgroundColor: "rgba(79,125,92,0.12)",
  border: "1.5px solid #4f7d5c",
  borderRadius: 999,
  padding: "4px 14px",
  fontFamily: "'Patrick Hand', cursive",
  color: "#4f7d5c",
  fontSize: 13,
  boxShadow: "0 0 10px rgba(79,125,92,0.35)"
}}>
  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#4f7d5c", display: "inline-block", animation: "drPulse 1.5s infinite" }} />
  Shield Active · Monitoring DOM
</div>
```

**OnboardingModal sub-component (inside the same file):**
Render as a shadcn/ui `Dialog` (import from `../components/ui/dialog`).
Title: "Install Your Active Shield" (Dancing Script font, 22px)
Body: Three numbered steps in a `<ol>` styled with Patrick Hand font:
1. "The extension zip just downloaded — find it in your Downloads folder."
2. "Open Chrome and go to `chrome://extensions`. Enable **Developer Mode** (top right toggle)."
3. "Click **Load unpacked** → select the unzipped `datareaper-tripwire` folder. Done."

Show a note in small Caveat text: "Shield status will update automatically once installed. This tab must remain open for the first sync."

Show a "Got it!" close button styled as `hand-drawn-button`. On close, keep `shieldState` as `pending_install` (the poll will update it when active).

**Also add the required keyframe to `frontend/src/styles/index.css`:**
```css
@keyframes drPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
```
```

---

## Phase 7 — Frontend: Wire ShieldButton Into CommandCenter

### Goal
Integrate the `ShieldButton` into `CommandCenter.tsx` next to the `ProgressPill`, matching the existing layout and design exactly.

### Prompt

```
You are integrating the ShieldButton component into `frontend/src/pages/CommandCenter.tsx`.

**Step 1: Add the import at the top of `CommandCenter.tsx`:**
```tsx
import { ShieldButton } from "../components/ShieldButton";
```

**Step 2: Locate the JSX block that renders `<ProgressPill>`.**
It currently looks like:
```tsx
<ProgressPill percent={displayProgress} status={backendStatus} />
```

Wrap both in a flex container and add `<ShieldButton />` right after it:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
  <ProgressPill percent={displayProgress} status={backendStatus} />
  <ShieldButton />
</div>
```

**Step 3: Verify visual consistency.**
The `ShieldButton` must fit visually inside the existing `hand-drawn-card` context. The active badge should align vertically with the `ProgressPill` pill height. The idle button should use the same `hand-drawn-button` class as other buttons on the page (e.g., the "Stop Scan" button at line ~799).

Do not change any other part of `CommandCenter.tsx`. Do not reformat the file. Make only the minimum changes described above.

After making the changes, output a summary of exactly which lines were modified and why.
```

---

## Phase 8 — Extension: Content Script Token Bridge (Dashboard Origin Only)

### Goal
Add a special content script that only runs on the DataReaper dashboard origin to silently pick up the shield token and register it with the background script.

### Prompt

```
You are adding a token-bridge content script to the DataReaper Chrome extension.

**Step 1: Create `extension/token-bridge.js`:**

```js
// Runs only on the DataReaper dashboard origin.
// Reads the shield token exposed by the React app and sends it to the background.

(function () {
  const token = window.__DR_SHIELD_TOKEN__;
  if (token) {
    chrome.runtime.sendMessage({ type: "DR_REGISTER_TOKEN", token }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[DataReaper] Token bridge error:", chrome.runtime.lastError.message);
      } else {
        console.log("[DataReaper] Shield token registered with background.", response);
      }
    });
  }
})();
```

**Step 2: Update `extension/manifest.json`.**
Add a second content script entry for the token bridge. This one only runs on the dashboard origin:

```json
{
  "matches": ["http://localhost:5173/*", "https://<YOUR_PROD_DOMAIN>/*"],
  "js": ["token-bridge.js"],
  "run_at": "document_idle"
}
```

Add this as a second object in the `content_scripts` array of the manifest. Do not remove or modify the existing first entry.

**Step 3: Update `extension/background.js`.**
In the `chrome.runtime.onMessage` listener, handle `DR_REGISTER_TOKEN`:
```js
if (message.type === "DR_REGISTER_TOKEN") {
  chrome.storage.local.set({ shield_token: message.token }, () => {
    console.log("[DataReaper] Shield token stored.");
    // Fire an immediate heartbeat
    sendHeartbeat();
  });
  // Notify all tabs that shield is now active
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: "DR_SHIELD_ACTIVE" }).catch(() => {});
      }
    });
  });
  sendResponse({ ok: true });
  return true; // keep channel open for async
}
```

Also extract the heartbeat call into a named `async function sendHeartbeat()` so it can be called from both the alarm handler and here.

**Step 4: Re-run the packaging script** to update `backend/static/datareaper-tripwire.zip`.
Add `token-bridge.js` to the zip command in `extension/package-extension.js`:
```
zip -r "${OUT_PATH}" manifest.json background.js content.js token-bridge.js icons/
```
```

---

## Phase 9 — End-to-End Testing Checklist + Environment Setup

### Goal
Document the manual steps and automated tests needed to verify the full feature.

### Prompt

```
You are adding a test and verification layer for the DataReaper Omnichannel Shield feature.

**Step 1: Create `extension/TESTING.md`** with the following content (write it out fully):

# Shield Feature — Manual Test Checklist

## Prerequisites
- [ ] Backend running: `cd backend && uvicorn datareaper.main:app --reload`
- [ ] Frontend running: `cd frontend && npm run dev`
- [ ] Redis running (check `docker-compose` or local Redis)
- [ ] Extension packaged: `cd extension && node package-extension.js`
- [ ] Google Safe Browsing API key set in `extension/background.js` (or left empty for mock mode)

## Test 1: Token Generation
- [ ] Open the dashboard at `http://localhost:5173/command-center`
- [ ] Open DevTools → Network tab
- [ ] Click "Deploy Active Shield"
- [ ] Verify: POST `/api/shield/token` returns 200 with `{ shield_token: "...", expires_in: 3600 }`
- [ ] Verify: A zip file download begins
- [ ] Verify: The onboarding modal appears

## Test 2: Extension Install
- [ ] Unzip `datareaper-tripwire.zip` into a folder
- [ ] Open `chrome://extensions`, enable Developer Mode
- [ ] Click "Load unpacked", select the unzipped folder
- [ ] Verify: Extension appears with "DataReaper Tripwire Shield" name

## Test 3: Token Handoff
- [ ] Return to the dashboard tab (still open from Test 1)
- [ ] Open DevTools → Console
- [ ] Verify: The token-bridge content script logs "Shield token registered with background."
- [ ] Verify: Background script fires a heartbeat POST to `/api/shield/heartbeat`
- [ ] Verify: Within 10 seconds, the dashboard UI updates — "Deploy Active Shield" button becomes the green "Shield Active · Monitoring DOM" badge

## Test 4: Threat Detection (Mock)
- [ ] In `background.js`, temporarily hardcode `checkSafeBrowsing` to return `true` for all URLs
- [ ] Navigate to any HTTP page in a new tab
- [ ] Verify: Red cursor appears
- [ ] Verify: The kill-screen overlay appears
- [ ] Verify: Clicking a password field does nothing (input is frozen)
- [ ] Verify: The "DataReaper Intercept" overlay title is visible

## Test 5: Heartbeat Timeout
- [ ] Kill the backend server
- [ ] Wait 2+ minutes (heartbeat TTL is 120s)
- [ ] Verify: The dashboard status badge changes from "Shield Active" back to a grey/pending state

**Step 2: Create `backend/tests/integration/test_shield_api.py`** with async tests (using the same `pytest` + `httpx` pattern as the existing integration tests in this project):

Test `POST /api/shield/token`:
- Without `X-Session-Id` header → expect 401
- With valid `X-Session-Id` → expect 200 with `shield_token` and `expires_in`

Test `GET /api/shield/status`:
- With no active shield in Redis → expect `{ "active": false, "last_seen": null }`
- After seeding Redis with an active shield key → expect `{ "active": true, "last_seen": "..." }`

Test `POST /api/shield/heartbeat`:
- With invalid Bearer token → expect 401
- With valid token (pre-seeded in Redis) → expect `{ "ok": true }`

Test `GET /api/shield/download`:
- When `backend/static/datareaper-tripwire.zip` doesn't exist → expect 404
- When it exists → expect 200 with `Content-Disposition: attachment` header

Match the exact test structure, fixture usage, and async patterns found in `backend/tests/integration/test_dashboard_api.py`.
```

---

## Manual Steps You Must Do Yourself

The AI cannot perform these actions — they require your local environment, accounts, or browser:

### 1. Google Safe Browsing API Key
- Go to [https://console.cloud.google.com](https://console.cloud.google.com)
- Enable the **Safe Browsing API**
- Create an API key and paste it into `extension/background.js` at the `SAFE_BROWSING_API_KEY` constant

### 2. Update `DASHBOARD_ORIGIN` in `extension/background.js`
- Change `http://localhost:5173` to your actual production frontend URL before deploying

### 3. Create Extension Icons
- You need three PNG icon files in `extension/icons/`:
  - `icon16.png` (16×16)
  - `icon48.png` (48×48)
  - `icon128.png` (128×128)
- Use the DataReaper scythe/skull motif and dark red (`#8b0000`) palette
- You can export these from the `AnimatedDataReaperLogo.tsx` component or use any design tool (Figma, Canva, etc.)

### 4. Install `canvas-confetti` in the Frontend
Run in the `frontend/` directory:
```bash
npm install canvas-confetti
npm install --save-dev @types/canvas-confetti
```

### 5. Package the Extension
After completing all phases, run:
```bash
cd extension
node package-extension.js
```
This creates `backend/static/datareaper-tripwire.zip` which the backend will serve.

### 6. Update Manifest `matches` for Production
In `extension/manifest.json`, in the second content-scripts entry (the token-bridge), replace `https://<YOUR_PROD_DOMAIN>/*` with your real deployed frontend domain.

### 7. Chrome Web Store (Post-Hackathon)
The hackathon approach uses "Load unpacked" via Developer Mode. For a production release:
- Create a developer account at [https://chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) (one-time $5 fee)
- Zip the extension folder (not the whole repo)
- Submit for review — approval takes 1-7 days
- Once approved, replace the "Load unpacked" instructions in `ShieldButton`'s `OnboardingModal` with a Chrome Web Store install link

### 8. Redis Configuration
Ensure the Redis client in your `backend` is configured to support the `shield_token:*` and `shield_active:*` key namespaces. Check `backend/src/datareaper/core/config.py` for `REDIS_URL` — no schema changes needed, just key naming convention.

### 9. CORS for Extension Origin
The extension's background script will make requests to your backend from a `chrome-extension://` origin. Add this to FastAPI's CORS settings in `backend/src/datareaper/main.py`:
```python
allow_origins=[
    "http://localhost:5173",
    "chrome-extension://*",   # Add this for extension support
    # ... other existing origins
]
```

---

## Architecture Diagram

```
┌──────────────────────────────────────┐
│        DataReaper Dashboard          │
│   (CommandCenter.tsx)                │
│                                      │
│  [ProgressPill] [ShieldButton]       │
│                   │                  │
│         useShield hook               │
│         │         │                  │
│    /shield/token  /shield/status     │
└──────────────────────────────────────┘
         │                    ▲
         │ token              │ heartbeat
         ▼                    │
┌──────────────────────────────────────┐
│        FastAPI Backend               │
│   /api/shield/token                  │
│   /api/shield/status                 │
│   /api/shield/heartbeat              │
│   /api/shield/download               │
│            │                         │
│          Redis                       │
│  shield_token:{token} → session_id   │
│  shield_active:{session_id} → ts     │
└──────────────────────────────────────┘
         │
         │ zip download
         ▼
┌──────────────────────────────────────┐
│     Chrome Extension (MV3)           │
│                                      │
│  background.js                       │
│  ├── Heartbeat (60s alarm)           │
│  ├── Safe Browsing check per tab     │
│  └── Broadcasts DR_THREAT_DETECTED   │
│                                      │
│  content.js (all tabs)               │
│  ├── Red cursor (20s)                │
│  ├── Password field freeze           │
│  └── Kill-screen overlay             │
│                                      │
│  token-bridge.js (dashboard only)    │
│  └── Reads __DR_SHIELD_TOKEN__       │
│      Sends to background.js          │
└──────────────────────────────────────┘
```

---

*Generated for DataReaper · Omnichannel Shield Feature · Phase-by-phase copilot implementation guide*
