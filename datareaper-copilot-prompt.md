# DataReaper — Copilot Implementation Prompt
## Feature: ToS Interceptor + Shadow Browser (Noise Generator)

> **How to use this document:** Paste each Stage's block into Copilot (or Claude) one at a time.
> Wait for it to finish and verify the output before moving to the next stage.
> Never paste multiple stages at once — this causes hallucination and context bleed.

---

## PRE-READ (paste this once at the very start of the session)

```
I am working on a project called DataReaper — a privacy tool consisting of:
- A Python/FastAPI backend at `backend/src/datareaper/`
- A React/TypeScript frontend at `frontend/src/`
- A Chrome Extension (Manifest V3) at `extension/`

The extension already has:
- `extension/manifest.json` — MV3 manifest with permissions: storage, tabs, scripting, webNavigation, alarms
- `extension/background.js` — service worker; handles tab navigation, Safe Browsing API, token bridge, message routing
- `extension/content.js` — content script injected on all URLs; handles threat overlay, password freezing, cursor injection
- `extension/token-bridge.js` — bridges auth token from dashboard to extension
- `extension/background-config-init.js` — auto-generated config shim

The backend already has:
- `backend/src/datareaper/integrations/llm/groq_client.py` — Groq LLM client
- `backend/src/datareaper/api/routes/shield.py` — shield API routes
- A `GROQ_API_KEY` environment variable already set in `.env`

The frontend uses React + TypeScript + Tailwind + shadcn/ui, and has a consistent hand-drawn design system
(CSS classes: `hand-drawn-card`, `hand-drawn-button`, `pencil-text`, `pencil-heading`, `pencil-fill-dark`).

I will give you tasks one stage at a time. For each stage:
1. Read the existing file(s) I reference before writing any code.
2. Make only the changes described — do not refactor unrelated code.
3. Use vanilla JS (no imports) for all extension files.
4. All extension files must be compatible with Chrome MV3 service workers (no DOM access in background.js).
```

---

## FEATURE 1: ToS Interceptor

### STAGE 1 — Backend: New `/api/shield/analyze-tos` endpoint

```
Read: `backend/src/datareaper/api/routes/shield.py`
Read: `backend/src/datareaper/integrations/llm/groq_client.py`
Read: `backend/src/datareaper/core/config.py`

Task: Add a new POST route `POST /api/shield/analyze-tos` to the existing shield router.

Endpoint spec:
- Path: `/api/shield/analyze-tos`
- Method: POST
- Auth: same bearer-token auth already used in shield.py (copy the pattern from existing routes)
- Request body (JSON):
  {
    "tos_text": string,      // raw ToS/Privacy Policy text, max 8000 chars
    "site_hostname": string  // e.g. "spotify.com"
  }
- Business logic:
  1. Truncate `tos_text` to 8000 characters if longer (add a note in truncation).
  2. Call Groq API (use the existing groq_client.py). Use model: `"llama3-8b-8192"`.
  3. System prompt (hardcode this exactly):
     "You are a privacy law expert. Analyze Terms of Service and Privacy Policy text.
      Return ONLY valid JSON — no markdown, no explanation, no code fences.
      The JSON must have exactly this shape:
      {
        \"risk_level\": \"LOW\" | \"MEDIUM\" | \"HIGH\" | \"CRITICAL\",
        \"sells_data\": boolean,
        \"tracks_location\": boolean,
        \"shares_with_affiliates\": boolean,
        \"key_risks\": [string, string, string],
        \"plain_english\": [string, string, string]
      }
      key_risks: 3 specific alarming clauses found verbatim (short, under 15 words each).
      plain_english: 3 bullet points a non-lawyer would immediately understand."
  4. User prompt: `"Analyze this ToS/Privacy Policy for: {site_hostname}\n\n{truncated_tos_text}"`
  5. Parse the Groq response as JSON. If parsing fails, return HTTP 422 with detail "LLM returned unparseable response".
  6. Return the parsed JSON directly as the response body.
- Error handling: wrap Groq call in try/except; return HTTP 503 with detail "AI analysis unavailable" on failure.

Do not modify any other routes. Do not change authentication logic.
```

---

### STAGE 2 — Extension: ToS text scraper utility function in `content.js`

```
Read: `extension/content.js` (full file)

Task: Add a new function `scrapeTermsText()` to content.js. Add it after the existing helper functions at the bottom of the file. Do not modify any existing functions.

Function spec:
function scrapeTermsText() {
  /*
   * Attempts to extract Terms of Service / Privacy Policy text from the current page.
   * Returns a string of up to 8000 characters, or null if nothing useful is found.
   *
   * Strategy (try each in order, return first non-empty result):
   * 1. Look for elements matching these selectors (in order):
   *    '[data-testid*="terms"]', '[id*="terms"]', '[class*="terms"]',
   *    '[id*="privacy"]', '[class*="privacy"]', '[id*="tos"]',
   *    'article', 'main', '.legal-content', '#legal'
   *    Take the innerText of the first match with > 200 characters.
   * 2. If nothing found, take document.body.innerText.
   * 3. Clean the result: collapse whitespace (replace /\s+/g with ' '), trim.
   * 4. Truncate to 8000 characters.
   * 5. If result is shorter than 100 chars after cleaning, return null.
   */
}

Also add a function `findTermsLinks()`:
function findTermsLinks() {
  /*
   * Scans all anchor tags on the page for links that look like ToS or Privacy Policy links.
   * Returns an array of { text: string, href: string } objects (max 5 results).
   * Match anchor text (case-insensitive) against: "terms", "privacy", "tos", "legal", "conditions"
   * Only include hrefs that are absolute URLs (start with http).
   */
}
```

---

### STAGE 3 — Extension: Detect "I Agree" / consent buttons in `content.js`

```
Read: `extension/content.js` (full file, including the functions added in Stage 2)

Task: Add the ToS interception logic to content.js. Add after the scrapeTermsText function. Do not modify existing functions.

Step A — Add a function `findConsentButtons()`:
function findConsentButtons() {
  /*
   * Returns an array of DOM button/input/anchor elements that look like ToS consent buttons.
   * Match elements whose visible text (trimmed, lowercased) contains any of:
   *   "i agree", "accept", "agree and continue", "i accept", "sign up", "create account", "register", "join now"
   * Exclude elements that are already tagged with data-dr-intercepted="true".
   * Search: button, input[type=submit], input[type=button], a[role=button], [role=button]
   * Return max 10 results.
   */
}

Step B — Add a function `interceptConsentButton(btn)`:
function interceptConsentButton(btn) {
  /*
   * Wraps a single consent button to intercept it:
   * 1. Tag it: btn.dataset.drIntercepted = "true"
   * 2. Store its original click handlers by cloning it (btn.cloneNode(true)) — save as btn._drOriginalClone
   * 3. Add a capturing click/mousedown event listener that:
   *    a. Calls event.preventDefault() and event.stopImmediatePropagation()
   *    b. Triggers showTosModal() (defined in Stage 4)
   * 4. Visually dim the button: add outline: 2px solid #f59e0b and opacity: 0.75
   */
}

Step C — Add a `MutationObserver` that watches for consent buttons appearing on the page:
- Create an observer in a function `startTosInterceptor()`
- The observer watches `document.body` for childList + subtree changes
- On each mutation, call `findConsentButtons()` and call `interceptConsentButton()` on any new unintercepted ones
- Also scan immediately when `startTosInterceptor()` is called
- Only run if `tosInterceptorEnabled` (a module-level boolean, default true) is true

Step D — Call `startTosInterceptor()` at the very bottom of the file (after all existing initialization code, if any).
```

---

### STAGE 4 — Extension: ToS Modal UI in `content.js`

```
Read: `extension/content.js` (full file, including Stages 2 and 3 additions)

Task: Add the `showTosModal()` function and its helpers to content.js. Do not modify existing functions.

Add these functions:

1. `showTosModal()` — the main modal orchestrator:
   - If a modal with id "dr-tos-modal" already exists, do nothing (prevent double-showing).
   - Call `scrapeTermsText()` to get the ToS text.
   - Create and inject a full-screen frosted-glass overlay (position: fixed, inset: 0, z-index: 2147483646).
   - The modal card (max-width: 520px, centered) must have:
     * Header: DataReaper logo (chrome.runtime.getURL("icons/icon128.png"), 32px), title "⚖️ DataReaper Legal Firewall", subtitle "Analyzing Terms of Service..."
     * A loading spinner div (id="dr-tos-spinner") — a simple CSS animation using a border-top trick
     * A results div (id="dr-tos-results") — initially hidden (display:none)
     * Two action buttons (initially hidden): "Accept the Risk" (red) and "✓ Proceed Safely" (green)
     * A small "Dismiss" text link at the bottom
   - Style everything inline (no external CSS). Use font-family: system-ui. Match the dark/dramatic DataReaper aesthetic: dark background (#0d0d0d), red accents (#dc2626), white text.
   - After injecting the modal, call `analyzeTosWithBackend(tosText)`.

2. `analyzeTosWithBackend(tosText)`:
   - Reads `shield_token` and `dr_api_base` from chrome.storage.local.
   - If no token: show error in results div: "Shield not active — visit the DataReaper dashboard first."
   - POSTs to `{dr_api_base}/shield/analyze-tos` with JSON body `{ tos_text: tosText, site_hostname: window.location.hostname }`.
   - On success: call `renderTosResults(data)`.
   - On fetch failure or non-200: show error message in results div.
   - In all cases: hide spinner, show results div.

3. `renderTosResults(data)`:
   - data shape: { risk_level, sells_data, tracks_location, shares_with_affiliates, key_risks[], plain_english[] }
   - Renders into #dr-tos-results:
     * Risk badge: risk_level with color coding (LOW=green, MEDIUM=yellow, HIGH=orange, CRITICAL=red)
     * Three icon+text rows for sells_data, tracks_location, shares_with_affiliates (✅/⚠️ icons)
     * A "Plain English Summary" section listing the 3 plain_english bullets
     * A "Detected Clauses" section listing the 3 key_risks in a monospace/code style
   - Show the two action buttons.
   - "Accept the Risk" button: removes the modal and removes the data-dr-intercepted attribute from all intercepted buttons (restoring them).
   - "Proceed Safely" button: removes the modal, does NOT restore buttons. Shows a small toast: "Consent blocked. Stay safe."

4. `removeTosModal()`:
   - Removes #dr-tos-modal from DOM if it exists.
```

---

### STAGE 5 — Extension: Wire ToS feature on/off via background message

```
Read: `extension/background.js` (full file)
Read: `extension/content.js` (full file, all stages applied)

Task A — In `background.js`, add handling for a new message type `"DR_TOGGLE_TOS_INTERCEPTOR"` inside the existing `chrome.runtime.onMessage.addListener` block:

if (message.type === "DR_TOGGLE_TOS_INTERCEPTOR") {
  // Broadcast the toggle to all tabs
  broadcastToAllTabs({ type: "DR_TOS_INTERCEPTOR_STATE", enabled: message.enabled });
  sendResponse({ ok: true });
  return true;
}

Task B — In `content.js`, add handling for `"DR_TOS_INTERCEPTOR_STATE"` in the existing `chrome.runtime.onMessage.addListener` block:

} else if (message.type === "DR_TOS_INTERCEPTOR_STATE") {
  tosInterceptorEnabled = message.enabled;
  if (!message.enabled) removeTosModal();
}

Task C — In `extension/manifest.json`, add `"contextMenus"` to the `permissions` array. No other changes.
```

---

### STAGE 6 — Frontend: ToS toggle in `ShieldLogs.tsx`

```
Read: `frontend/src/pages/ShieldLogs.tsx` (full file)
Read: `frontend/src/lib/useShield.ts` (full file)

Task: Add a ToS Interceptor toggle card to the ShieldLogs page.

Add to ShieldLogs.tsx (find a logical place near the top of the rendered UI, e.g., after the page header):

1. A new state: `const [tosEnabled, setTosEnabled] = useState(true)`
2. A `toggleTos(enabled: boolean)` function that:
   - Sets state: `setTosEnabled(enabled)`
   - Sends a message to the extension (use the existing pattern in the file for sending messages to the extension, or if none exists, use: `window.postMessage({ type: 'DR_TOGGLE_TOS_INTERCEPTOR', enabled }, '*')`)
3. A UI card using the existing `hand-drawn-card` class:
   ```tsx
   <div className="hand-drawn-card p-4 flex items-center justify-between">
     <div>
       <h3 className="pencil-heading text-lg">⚖️ ToS Interceptor</h3>
       <p className="pencil-text text-sm opacity-60">
         Freezes consent buttons and analyzes Terms of Service with AI before you agree.
       </p>
     </div>
     <Switch checked={tosEnabled} onCheckedChange={toggleTos} />
   </div>
   ```
   Import Switch from `@/components/ui/switch` if not already imported.

Do not modify the existing Shield log table/list rendering.
```

---

## FEATURE 2: Shadow Browser (Noise Generator)

### STAGE 7 — Extension: Shadow Browser engine in a new file `extension/shadow-browser.js`

```
Task: Create a brand new file `extension/shadow-browser.js`. This file runs as an ES module import inside the service worker (background.js). It must use only Chrome extension APIs and fetch — no DOM APIs.

Implement the following:

// ── Constants ──────────────────────────────────────────────────────────────────
const SHADOW_ALARM = "dr_shadow_tick";
const SHADOW_ENABLED_KEY = "dr_shadow_browser_enabled";
const SHADOW_LOG_KEY = "dr_shadow_log";
const SHADOW_INTERVAL_MINUTES = 2; // fire every 2 minutes

// ── Fake identity pool ─────────────────────────────────────────────────────────
// An array of 20 "personas" — each has: name, age, occupation, interests[]
// Example entries:
// { name: "Harold Finch", age: 67, occupation: "Retired Farmer", interests: ["tractors", "seed catalogs", "grain prices", "county fair", "used farm equipment"] }
// { name: "Brenda Kowalski", age: 34, occupation: "Amateur Genealogist", interests: ["ancestry records", "14th century pottery", "medieval history", "Ellis Island manifests"] }
// { name: "Desmond Chu", age: 52, occupation: "Birdwatcher", interests: ["binoculars review", "migratory bird patterns", "birdwatching trails Ohio", "bird feeder types"] }
// { name: "Marguerite DuPont", age: 29, occupation: "Real Estate Hobbyist", interests: ["fixer upper homes Ohio", "mortgage rates 2008", "real estate auctions Iowa", "rural property listings"] }
// ... create 16 more with similarly random, benign personas and interests.

// ── URL generator ─────────────────────────────────────────────────────────────
function generateFakeUrl(persona) {
  /*
   * Picks a random interest from persona.interests and constructs a plausible search URL.
   * Randomly choose one of these URL templates:
   *   - `https://www.google.com/search?q=${encodeURIComponent(interest + ' ' + randomSuffix)}`
   *   - `https://en.wikipedia.org/wiki/${encodeURIComponent(interest.replace(/ /g,'_'))}`
   *   - `https://www.reddit.com/search/?q=${encodeURIComponent(interest)}`
   *   - `https://www.amazon.com/s?k=${encodeURIComponent(interest)}`
   *   - `https://www.youtube.com/results?search_query=${encodeURIComponent(interest)}`
   * randomSuffix is one of: "near me", "reviews", "best", "how to", "cheap", "" (empty)
   * Returns the constructed URL string.
   */
}

// ── Core shadow fetch ─────────────────────────────────────────────────────────
async function runShadowTick() {
  /*
   * 1. Check if shadow browser is enabled: read SHADOW_ENABLED_KEY from chrome.storage.local.
   *    If disabled, return immediately.
   * 2. Pick a random persona from the pool.
   * 3. Generate 3 fake URLs using generateFakeUrl(persona) — one per call.
   * 4. For each URL, call fetch(url, { method: 'HEAD', redirect: 'follow' }) wrapped in try/catch.
   *    Use HEAD to avoid downloading response bodies. Ignore errors silently.
   * 5. Log the activity: call appendShadowLog with:
   *    { persona: persona.name, occupation: persona.occupation, urls: [url1, url2, url3], ts: Date.now() }
   */
}

async function appendShadowLog(entry) {
  /*
   * Appends entry to SHADOW_LOG_KEY in chrome.storage.local.
   * Keep only the last 50 entries.
   */
}

// ── Public API (exported for background.js to call) ───────────────────────────
export async function initShadowBrowser() {
  /*
   * Called once from background.js on install and on service worker wake-up.
   * Creates (or re-creates) the SHADOW_ALARM alarm with periodInMinutes: SHADOW_INTERVAL_MINUTES.
   */
}

export async function handleShadowAlarm(alarmName) {
  /*
   * Called from background.js alarm handler.
   * If alarmName === SHADOW_ALARM, call runShadowTick().
   */
}

export async function setShadowEnabled(enabled) {
  /*
   * Writes enabled (boolean) to SHADOW_ENABLED_KEY in chrome.storage.local.
   */
}

export async function getShadowLog() {
  /*
   * Returns the array stored at SHADOW_LOG_KEY, or [] if empty.
   */
}

export async function getCurrentPersona() {
  /*
   * Returns a random persona object from the pool (for display in the UI).
   * This is called by background.js when the frontend requests the current fake identity.
   */
}
```

---

### STAGE 8 — Extension: Wire Shadow Browser into `background.js`

```
Read: `extension/background.js` (full file)
Read: `extension/shadow-browser.js` (just created in Stage 7)

Task: Integrate shadow-browser.js into background.js. Make minimal, surgical changes only.

Change 1 — Add import at the very top of background.js (after the existing import):
import { initShadowBrowser, handleShadowAlarm, setShadowEnabled, getShadowLog, getCurrentPersona } from "./shadow-browser.js";

Change 2 — In the `chrome.runtime.onInstalled.addListener` callback, after the existing `chrome.alarms.create(HEARTBEAT_ALARM, ...)` line, add:
await initShadowBrowser();

Change 3 — In the service worker wake-up IIFE at the top (the async IIFE that reads chrome.storage.local), add after the config reads:
await initShadowBrowser();

Change 4 — In `chrome.alarms.onAlarm.addListener`, add after the existing heartbeat check:
await handleShadowAlarm(alarm.name);

Change 5 — In `chrome.runtime.onMessage.addListener`, add three new message handlers:

if (message.type === "DR_TOGGLE_SHADOW_BROWSER") {
  setShadowEnabled(message.enabled).then(() => sendResponse({ ok: true }));
  return true;
}

if (message.type === "DR_GET_SHADOW_LOG") {
  getShadowLog().then((log) => sendResponse({ log }));
  return true;
}

if (message.type === "DR_GET_SHADOW_PERSONA") {
  getCurrentPersona().then((persona) => sendResponse({ persona }));
  return true;
}

Do not change any other logic. Do not remove existing handlers.
```

---

### STAGE 9 — Extension: Add `shadow-browser.js` to manifest and package script

```
Read: `extension/manifest.json`
Read: `extension/package-extension.js`

Task A — In `manifest.json`, the background service_worker is already `"background.js"` with `"type": "module"`. No manifest change is needed for shadow-browser.js since it's an ES module import. Confirm this is correct and make no changes to manifest.json.

Task B — In `package-extension.js`, add `"shadow-browser.js"` to the `FILES_TO_ZIP` array. It should appear right after `"background.js"`. No other changes.
```

---

### STAGE 10 — Frontend: Shadow Identity page in a new file `frontend/src/pages/ShadowIdentity.tsx`

```
Read: `frontend/src/pages/ShieldLogs.tsx` (for design patterns and component usage)
Read: `frontend/src/routes.tsx` (to understand how routes are registered)
Read: `frontend/src/styles/index.css` (for available CSS classes)

Task: Create `frontend/src/pages/ShadowIdentity.tsx` — a new page that shows the Shadow Browser status.

The page must:

1. State:
   - `shadowEnabled: boolean` (default: true)
   - `currentPersona: { name, age, occupation, interests } | null`
   - `shadowLog: Array<{ persona, occupation, urls, ts }>` (last 20 entries)
   - `isLoading: boolean`

2. On mount, send messages to the extension to fetch current state:
   Use `window.postMessage` to request `DR_GET_SHADOW_LOG` and `DR_GET_SHADOW_PERSONA`.
   Listen for responses via `window.addEventListener('message', ...)`.
   (Or use the existing bridge pattern if one exists in the codebase.)

3. Toggle handler: when toggled, send `DR_TOGGLE_SHADOW_BROWSER` message with `{ enabled }`.

4. UI layout (use hand-drawn design system classes throughout):

   Header section:
   - Title: "👻 Shadow Browser" (pencil-heading, large)
   - Subtitle: "Your fake digital twin is browsing the web so data brokers think you're someone else."
   - Toggle switch (shadcn Switch component) labeled "Shadow Mode Active"

   Current Fake Identity card (hand-drawn-card, pencil-fill-dark for dark background):
   - Title: "Current Fake Identity"
   - If `currentPersona` is set, show:
     * Name (large, pencil-heading-light)
     * Age and occupation (pencil-text-light, smaller)
     * Interest tags: map persona.interests to small pill badges
   - A "Randomize" button (hand-drawn-button) that sends DR_GET_SHADOW_PERSONA again

   Activity Feed card (hand-drawn-card):
   - Title: "Recent Shadow Activity"
   - Map over `shadowLog` (most recent first), each entry shows:
     * Persona name + occupation (bold)
     * List of 3 URLs as truncated gray text (max 50 chars each, overflow ellipsis)
     * Relative timestamp (e.g., "2 min ago")
   - If log is empty, show: "Shadow Browser is warming up... it will start generating noise shortly."

   Explanation card at bottom:
   - Title: "How it works"
   - Text: "While you browse normally, DataReaper silently visits random websites in the background — shopping for tractors, reading Wikipedia, browsing Ohio real estate — creating a fake browsing profile. Data brokers harvest this noise, making your real profile worthless to advertisers."

5. Export default ShadowIdentity.

Do not add the route to routes.tsx yet — that is Stage 11.
```

---

### STAGE 11 — Frontend + Extension: Register route and add nav link

```
Read: `frontend/src/routes.tsx` (full file)
Read: `frontend/src/App.tsx` or wherever the nav/sidebar is defined
Read: `frontend/src/pages/ShadowIdentity.tsx` (just created)

Task A — In `routes.tsx`, register the new page:
- Import ShadowIdentity: `import ShadowIdentity from "./pages/ShadowIdentity"`
- Add a new route: `{ path: "/shadow-identity", element: <ShadowIdentity /> }`
  Place it alongside the other protected/dashboard routes (same nesting level as ShieldLogs, CommandCenter, etc.)

Task B — In the navigation component (App.tsx, Navbar.tsx, or sidebar — read first to find the right file):
- Add a nav link: label "Shadow ID", icon: Ghost (from lucide-react), path: "/shadow-identity"
- Place it near the "Shield Logs" nav item for logical grouping.

Do not change any existing routes or nav items.
```

---

## FINAL CHECKLIST (paste after all stages are done)

```
Review the following and fix any issues:

1. `extension/manifest.json` — confirm "contextMenus" is in permissions (added in Stage 5).
2. `extension/package-extension.js` — confirm FILES_TO_ZIP includes "shadow-browser.js".
3. `extension/background.js` — confirm it imports from "./shadow-browser.js" and all 5 new message types are handled.
4. `extension/content.js` — confirm `startTosInterceptor()` is called at the bottom, and `tosInterceptorEnabled` is a module-level `let` variable.
5. `backend/src/datareaper/api/routes/shield.py` — confirm the new route is registered on the existing router (not a new FastAPI app).
6. `frontend/src/routes.tsx` — confirm `/shadow-identity` is registered.
7. Confirm no TypeScript `any` errors in ShadowIdentity.tsx by checking that all state types are explicit.
8. Confirm the Groq model used in the backend endpoint is `"llama3-8b-8192"` (fast, cheap, good for JSON extraction).

Report any issues found and fix them.
```
