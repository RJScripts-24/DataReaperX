// Config is seeded into chrome.storage.local by background-config-init.js (auto-generated).
import "./background-config-init.js";
import {
  initShadowBrowser,
  handleShadowAlarm,
  setShadowEnabled,
  getShadowLog,
  resolveDisplayPersona,
  getShadowBrowserEnabled,
  runShadowNoiseWarmUp,
  maybeTriggerReactiveShadowPack,
} from "./shadow-browser.js";
// ============================================================================
// DataReaper Tripwire Shield — Background Service Worker (MV3)
// ============================================================================

// These defaults are overwritten at install time and on every service worker wake-up
// by fetching /api/shield/config and reading chrome.storage.local.
let DASHBOARD_ORIGIN = "http://localhost:5173";
let API_BASE = "http://localhost:8000/api";
let SAFE_BROWSING_API_KEY = "";
let SAFE_BROWSING_URL = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
const HEARTBEAT_ALARM = "dr_heartbeat";
const THREAT_CACHE_TTL_MS = 5 * 60 * 1000;

// Restore persisted config immediately on service worker wake-up
(async () => {
  const stored = await chrome.storage.local.get([
    "dr_dashboard_origin",
    "dr_api_base",
    "dr_safe_browsing_key",
  ]);
  if (stored.dr_dashboard_origin) DASHBOARD_ORIGIN = stored.dr_dashboard_origin;
  if (stored.dr_api_base) API_BASE = stored.dr_api_base;
  if (stored.dr_safe_browsing_key) {
    SAFE_BROWSING_API_KEY = stored.dr_safe_browsing_key;
    SAFE_BROWSING_URL = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_API_KEY}`;
  }
  await initShadowBrowser();
})();

function normalizeOrigin(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function getDashboardOrigins() {
  const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
  const configured = normalizeOrigin(DASHBOARD_ORIGIN);
  if (configured) {
    origins.add(configured);
    if (configured.includes("://localhost")) {
      origins.add(configured.replace("://localhost", "://127.0.0.1"));
    }
    if (configured.includes("://127.0.0.1")) {
      origins.add(configured.replace("://127.0.0.1", "://localhost"));
    }
  }
  return [...origins];
}

function isDashboardTabUrl(url) {
  const origin = normalizeOrigin(url);
  if (!origin) return false;
  return getDashboardOrigins().includes(origin);
}

function injectTokenBridgeIntoDashboardTabs(reason) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id || !tab.url || !isDashboardTabUrl(tab.url)) {
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id, allFrames: false },
          files: ["token-bridge.js"],
        },
        () => {
          if (chrome.runtime.lastError) {
            console.debug(
              `[DataReaper] token-bridge injection skipped (${reason}) for tab ${tab.id}:`,
              chrome.runtime.lastError.message
            );
          } else {
            console.log(`[DataReaper] token-bridge injected (${reason}) into tab ${tab.id}.`);
          }
        }
      );
    });
  });
}

// --------------------------------------------------------------------------
// Install — create heartbeat alarm, fetch runtime config
// --------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("shield_token", (items) => {
    if (items.shield_token) {
      console.log("[DataReaper] Shield token found from previous session.");
    } else {
      console.log("[DataReaper] Shield token not yet set. User must visit dashboard.");
    }
  });

  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
  injectTokenBridgeIntoDashboardTabs("onInstalled:initial");

  // Fetch runtime config from backend to avoid hardcoded URLs
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/shield/config`);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.dashboard_origin) DASHBOARD_ORIGIN = cfg.dashboard_origin;
        if (cfg.api_base) API_BASE = cfg.api_base;
        await chrome.storage.local.set({
          dr_dashboard_origin: cfg.dashboard_origin,
          dr_api_base: cfg.api_base,
          dr_safe_browsing_enabled: cfg.safe_browsing_enabled,
        });
        console.log("[DataReaper] Runtime config loaded from backend.", cfg);
      }
    } catch (e) {
      console.warn("[DataReaper] Could not fetch runtime config — using defaults.", e.message);
    } finally {
      injectTokenBridgeIntoDashboardTabs("onInstalled:postConfig");
    }
  })();
});

// --------------------------------------------------------------------------
// Heartbeat
// --------------------------------------------------------------------------
async function sendHeartbeat() {
  const items = await chrome.storage.local.get("shield_token");
  const token = items.shield_token;
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/shield/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      await chrome.storage.local.remove("shield_token");
      broadcastToAllTabs({ type: "DR_SHIELD_DEACTIVATED" });
      console.warn("[DataReaper] Shield token expired. Deactivated.");
      return;
    }

    if (res.ok) {
      broadcastToAllTabs({ type: "DR_SHIELD_ACTIVE" });
    }
  } catch (err) {
    console.warn("[DataReaper] Heartbeat failed:", err.message);
  }
}

// --------------------------------------------------------------------------
// Alarm handler
// --------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    sendHeartbeat();
  }
  handleShadowAlarm(alarm.name);
});

// --------------------------------------------------------------------------
// Tab navigation — check every completed http(s) page load
// --------------------------------------------------------------------------
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !tab.url.startsWith("http")) return;

  handleTabNavigation(tabId, tab.url);
});

async function handleTabNavigation(tabId, url) {
  try {
    const hostname = new URL(url).hostname;

    // Check cache
    const cacheKey = `threat_cache_${hostname}`;
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      const entry = cached[cacheKey];
      if (Date.now() - entry.ts < THREAT_CACHE_TTL_MS) {
        if (entry.isThreat) {
          chrome.tabs.sendMessage(tabId, {
            type: "DR_THREAT_DETECTED",
            hostname,
          }).catch(() => {});
        } else {
          chrome.tabs.sendMessage(tabId, {
            type: "DR_THREAT_CLEAR",
          }).catch(() => {});
          void maybeTriggerReactiveShadowPack(tabId, url);
        }
        return;
      }
    }

    // No valid cache — query Safe Browsing
    const isThreat = await checkSafeBrowsing(url);

    // Cache result
    await chrome.storage.local.set({
      [cacheKey]: { isThreat, ts: Date.now() },
    });

    if (isThreat) {
      await appendLog("dr_threat_log", {
        hostname,
        url,
        occurredAt: new Date().toISOString(),
      });
      chrome.tabs.sendMessage(tabId, {
        type: "DR_THREAT_DETECTED",
        hostname,
      }).catch(() => {});
    } else {
      chrome.tabs.sendMessage(tabId, {
        type: "DR_THREAT_CLEAR",
      }).catch(() => {});
      void maybeTriggerReactiveShadowPack(tabId, url);
    }
  } catch (err) {
    console.warn("[DataReaper] Tab navigation handler error:", err.message);
  }
}

// --------------------------------------------------------------------------
// Google Safe Browsing API (v4)
// --------------------------------------------------------------------------
async function checkSafeBrowsing(url) {
  // Read the injected key from storage (written by inject-config.js at packaging time)
  const stored = await chrome.storage.local.get("dr_safe_browsing_key");
  const activeKey = stored.dr_safe_browsing_key || SAFE_BROWSING_API_KEY;
  if (!activeKey) {
    console.warn("[DataReaper] No Safe Browsing API key — running in mock-safe mode.");
    return false;
  }
  const activeSafeBrowsingUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${activeKey}`;

  try {
    const res = await fetch(activeSafeBrowsingUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "datareaper-tripwire", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
    });

    if (!res.ok) {
      console.warn("[DataReaper] Safe Browsing API error:", res.status);
      return false;
    }

    const data = await res.json();
    return !!(data.matches && data.matches.length > 0);
  } catch (err) {
    console.warn("[DataReaper] Safe Browsing API call failed:", err.message);
    return false;
  }
}

// --------------------------------------------------------------------------
// Token bridge — handle DR_REGISTER_TOKEN from token-bridge content script
// --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DR_REGISTER_TOKEN") {
    chrome.storage.local.set({ shield_token: message.token }, () => {
      console.log("[DataReaper] Shield token stored.");
      sendHeartbeat();
    });
    broadcastToAllTabs({ type: "DR_SHIELD_ACTIVE" });
    sendResponse({ ok: true });
    return true; // keep channel open for async sendResponse
  }

  if (message.type === "DR_PASSWORD_ATTEMPT") {
    appendLog("dr_password_log", message.payload).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "DR_TOGGLE_SHADOW_BROWSER") {
    const enabled = Boolean(message.enabled);
    setShadowEnabled(enabled).then(() => {
      if (enabled) {
        runShadowNoiseWarmUp().catch(() => {});
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "DR_GET_SHADOW_LOG") {
    getShadowLog().then((log) => sendResponse({ log }));
    return true;
  }

  if (message.type === "DR_GET_SHADOW_PERSONA") {
    resolveDisplayPersona(Boolean(message.forceRandom)).then((persona) => sendResponse({ persona }));
    return true;
  }

  if (message.type === "DR_GET_SHADOW_BROWSER_ENABLED") {
    getShadowBrowserEnabled().then((enabled) => sendResponse({ enabled }));
    return true;
  }

  if (message.type === "DR_GET_LOGS") {
    Promise.all([
      chrome.storage.local.get("dr_threat_log"),
      chrome.storage.local.get("dr_password_log"),
    ]).then(([threat, password]) => {
      sendResponse({
        threatLog: threat.dr_threat_log || [],
        passwordLog: password.dr_password_log || [],
      });
    });
    return true;
  }

  return false;
});

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function broadcastToAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}

async function appendLog(key, entry) {
  const stored = await chrome.storage.local.get(key);
  const existing = Array.isArray(stored[key]) ? stored[key] : [];
  const next = [entry, ...existing].slice(0, 200);
  await chrome.storage.local.set({ [key]: next });
}
