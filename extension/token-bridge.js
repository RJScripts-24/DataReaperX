// ============================================================================
// DataReaper Tripwire Shield — Token Bridge Content Script
// Runs ONLY on the DataReaper dashboard origin (defined in manifest).
// Reads the shield token exposed by the React app and sends it to the bg.
// Uses two paths: polling retry loop + immediate CustomEvent listener.
// ============================================================================

(function () {
  const MAX_RETRIES = 15;
  const RETRY_INTERVAL_MS = 400;
  let attempts = 0;
  let registered = false;

  function sendToken(token) {
    if (registered) return;
    registered = true;

    chrome.runtime.sendMessage(
      { type: "DR_REGISTER_TOKEN", token },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[DataReaper] Token bridge error:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log(
            "[DataReaper] Shield token registered with background.",
            response
          );
        }
      }
    );
  }

  // Path 1: polling retry loop
  function tryRegisterToken() {
    if (registered) return;

    const token = window.__DR_SHIELD_TOKEN__;
    if (token && String(token).trim().length > 0) {
      sendToken(String(token).trim());
      return;
    }

    attempts++;
    if (attempts < MAX_RETRIES) {
      setTimeout(tryRegisterToken, RETRY_INTERVAL_MS);
    } else {
      console.warn(
        "[DataReaper] Shield token not detected after max retries. Reload the dashboard tab."
      );
    }
  }

  tryRegisterToken();

  // Path 2: immediate CustomEvent listener from React app
  document.addEventListener("dr:shield-token-ready", (e) => {
    if (e.detail && e.detail.token) {
      sendToken(e.detail.token);
    }
  });

  // Relay background heartbeat signal to the dashboard tab
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "DR_SHIELD_ACTIVE") {
      window.postMessage({ type: "DR_EXTENSION_READY" }, window.location.origin);
    }
  });

  // Dashboard ↔ extension: shield logs + shadow browser (postMessage bridge)
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const type = event.data?.type;
    if (!type) return;

    if (type === "DR_REQUEST_SHIELD_LOGS") {
      chrome.runtime.sendMessage({ type: "DR_GET_LOGS" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[DataReaper] Shield log request failed:", chrome.runtime.lastError.message);
          return;
        }
        window.postMessage(
          { type: "DR_SHIELD_LOGS", payload: response },
          window.location.origin
        );
      });
      return;
    }

    if (type === "DR_GET_SHADOW_PERSONA") {
      chrome.runtime.sendMessage(
        { type: "DR_GET_SHADOW_PERSONA", forceRandom: Boolean(event.data?.forceRandom) },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn("[DataReaper] Shadow persona request failed:", chrome.runtime.lastError.message);
            return;
          }
          window.postMessage(
            { type: "DR_SHADOW_PERSONA", persona: response?.persona },
            window.location.origin
          );
        }
      );
      return;
    }

    if (type === "DR_GET_SHADOW_LOG") {
      chrome.runtime.sendMessage({ type: "DR_GET_SHADOW_LOG" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[DataReaper] Shadow log request failed:", chrome.runtime.lastError.message);
          return;
        }
        window.postMessage(
          { type: "DR_SHADOW_LOG", log: response?.log ?? [] },
          window.location.origin
        );
      });
      return;
    }

    if (type === "DR_GET_SHADOW_BROWSER_ENABLED") {
      chrome.runtime.sendMessage({ type: "DR_GET_SHADOW_BROWSER_ENABLED" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[DataReaper] Shadow enabled state failed:", chrome.runtime.lastError.message);
          return;
        }
        window.postMessage(
          { type: "DR_SHADOW_BROWSER_ENABLED", enabled: response?.enabled !== false },
          window.location.origin
        );
      });
      return;
    }

    if (type === "DR_TOGGLE_SHADOW_BROWSER") {
      const enabled = Boolean(event.data?.enabled);
      chrome.runtime.sendMessage({ type: "DR_TOGGLE_SHADOW_BROWSER", enabled }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[DataReaper] Shadow toggle failed:", chrome.runtime.lastError.message);
          return;
        }
        void response;
      });
      return;
    }

  });
})();