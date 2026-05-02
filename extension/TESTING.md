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

## Test 6: API Key Injection Verification
- [ ] After running `node package-extension.js` with the key set, open `chrome://extensions`
- [ ] Click **Inspect** on the DataReaper extension service worker
- [ ] In the Console, confirm: `[DataReaper] Config injected into storage.`
- [ ] In **Application → Extension Storage**, confirm `dr_safe_browsing_key` has your key value
- [ ] Navigate to any HTTPS site — confirm no false-positive threat overlay

## Test 7: Mock-Safe Mode (no key)
- [ ] Run `node package-extension.js` WITHOUT setting `GOOGLE_SAFE_BROWSING_API_KEY`
- [ ] Install the extension
- [ ] Confirm service worker logs: `[DataReaper] No Safe Browsing API key — running in mock-safe mode.`
- [ ] Confirm no threat overlays appear during normal browsing

## Test 8: Config Endpoint
- [ ] With the backend running, open `http://localhost:8000/api/shield/config`
- [ ] Confirm JSON response: `{ "dashboard_origin": "...", "api_base": "...", "safe_browsing_enabled": true/false }`
- [ ] Confirm `safe_browsing_enabled` is `false` when key is empty, `true` when set
