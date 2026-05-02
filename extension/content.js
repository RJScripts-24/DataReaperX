// ============================================================================
// DataReaper Tripwire Shield — Content Script (Active Defense)
// ============================================================================

let isThreatActive = false;
let shieldActive = false;
let overlayInjected = false;
let cursorStyleEl = null;
const passwordListeners = new WeakMap();

// --------------------------------------------------------------------------
// Message listener from background script
// --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "DR_THREAT_DETECTED") {
    activateTripwire();
  } else if (message.type === "DR_THREAT_CLEAR") {
    deactivateTripwire();
  } else if (message.type === "DR_SHIELD_ACTIVE") {
    shieldActive = true;
    console.log("[DataReaper] Shield active on this tab.");
  } else if (message.type === "DR_SHIELD_DEACTIVATED") {
    shieldActive = false;
    deactivateTripwire();
    removeOverlay();
    removeCursor();
  }
});

// --------------------------------------------------------------------------
// Activation / Deactivation
// --------------------------------------------------------------------------
function activateTripwire() {
  isThreatActive = true;
  injectRedCursor();
  freezePasswordInputs();
  showKillScreen();
}

function deactivateTripwire() {
  isThreatActive = false;

  removeCursor();

  // Remove password listeners (handled via WeakMap in freezePasswordInputs)
  removeOverlay();
}

function removeOverlay() {
  const overlay = document.getElementById("dr-kill-screen-overlay");
  if (overlay) {
    overlay.remove();
  }
  overlayInjected = false;
}

function removeCursor() {
  if (cursorStyleEl) {
    cursorStyleEl.remove();
    cursorStyleEl = null;
  }
}

// --------------------------------------------------------------------------
// Red cursor injection
// --------------------------------------------------------------------------
function injectRedCursor() {
  injectCursor("#cc0000");
}

function injectGreenCursor() {
  injectCursor("#2f9e44");
}

function injectCursor(color) {
  removeCursor();

  // Inline SVG data URI for a normal arrow cursor with neon glow outline.
  const neonCursorSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="${color}" flood-opacity="0.8"/>
          <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${color}" flood-opacity="0.6"/>
        </filter>
      </defs>
      <path
        d="M4 3 L4 23 L9.5 18.5 L12.5 26 L15.5 25 L12.5 17.5 L19 17.5 Z"
        fill="none"
        stroke="${color}"
        stroke-width="2.2"
        filter="url(#glow)"
      />
      <path
        d="M4 3 L4 23 L9.5 18.5 L12.5 26 L15.5 25 L12.5 17.5 L19 17.5 Z"
        fill="#ffffff"
        stroke="#111111"
        stroke-width="1.2"
      />
    </svg>`;
  const encoded = btoa(neonCursorSvg.trim());
  const dataUri = `data:image/svg+xml;base64,${encoded}`;

  cursorStyleEl = document.createElement("style");
  cursorStyleEl.textContent = `* { cursor: url('${dataUri}') 2 2, auto !important; }`;
  document.head.appendChild(cursorStyleEl);
}

// --------------------------------------------------------------------------
// Password input freezing
// --------------------------------------------------------------------------
function freezePasswordInputs() {
  if (!isThreatActive) return;

  document.querySelectorAll('input[type="password"]').forEach(freezeSingleInput);

  if (!document.body.dataset.drMutationObserverSet) {
    document.body.dataset.drMutationObserverSet = "true";
    const observer = new MutationObserver(() => {
      if (isThreatActive) freezePasswordInputs();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function freezeSingleInput(input) {
  if (passwordListeners.has(input)) return;

  const state = {
    attempts: 0,
    allowTyping: false,
  };

  function onFocus(event) {
    if (state.allowTyping) return;
    state.attempts += 1;
    const allowTyping = handlePasswordAttempt(input, state.attempts);
    if (allowTyping) {
      state.allowTyping = true;
      unfreezeSingleInput(input);
      return;
    }
    event.preventDefault();
    input.blur();
    if (!overlayInjected) showKillScreen();
  }

  function onKeydown(event) {
    if (state.allowTyping) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!overlayInjected) showKillScreen();
  }

  input.addEventListener("focus", onFocus, true);
  input.addEventListener("keydown", onKeydown, true);

  passwordListeners.set(input, { onFocus, onKeydown, state });

  // Immediately blur if already focused
  if (document.activeElement === input) {
    input.blur();
  }
}

// --------------------------------------------------------------------------
// Kill-screen overlay
// --------------------------------------------------------------------------
function showKillScreen() {
  if (overlayInjected) return;
  overlayInjected = true;

  // Brief body dim effect
  document.body.style.transition = "filter 0.3s ease";
  document.body.style.filter = "brightness(0.4)";
  setTimeout(() => {
    document.body.style.filter = "brightness(1)";
  }, 400);

  const overlay = document.createElement("div");
  overlay.id = "dr-kill-screen-overlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    z-index: 2147483647;
    background: rgba(10, 0, 0, 0.72);
    backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 0 60px rgba(220, 0, 0, 0.4);
    ">
      <div id="dr-logo-slot" style="margin-bottom: 12px;"></div>
      <div style="font-size: 48px; margin-bottom: 16px;">⛔</div>
      <h1 style="color: #8b0000; font-size: 24px; margin: 0 0 12px 0; font-family: system-ui, sans-serif;">
        DataReaper Intercept
      </h1>
      <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0;">
        Malicious domain detected. Credential input has been disabled to protect your identity.
      </p>
      <p style="color: #666; font-size: 12px; margin: 0 0 24px 0;">
        Close this tab immediately and run a DataReaper scan to assess damage.
      </p>
      <button id="dr-kill-screen-dismiss" style="
        background: #8b0000;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
        font-size: 14px;
        cursor: pointer;
        font-family: system-ui, sans-serif;
      ">
        I understand — close this
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const logoSlot = overlay.querySelector("#dr-logo-slot");
  if (logoSlot) {
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("icons/icon128.png");
    logo.alt = "DataReaper";
    logo.style.width = "48px";
    logo.style.height = "48px";
    logo.style.borderRadius = "12px";
    logo.style.boxShadow = "0 0 18px rgba(220, 0, 0, 0.4)";
    logoSlot.appendChild(logo);
  }

  // Dismiss handler
  const dismissBtn = document.getElementById("dr-kill-screen-dismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      overlay.remove();
      overlayInjected = false;
    });
  }
}

function unfreezeSingleInput(input) {
  const handlers = passwordListeners.get(input);
  if (!handlers) return;
  input.removeEventListener("focus", handlers.onFocus, true);
  input.removeEventListener("keydown", handlers.onKeydown, true);
  passwordListeners.delete(input);
}

function handlePasswordAttempt(input, attempt) {
  const meta = {
    id: input.id || null,
    name: input.name || null,
    placeholder: input.placeholder || null,
  };

  if (attempt < 3) {
    logPasswordAttempt(meta, attempt, false);
    return false;
  }

  const allow = window.confirm(
    "This site was flagged as malicious. Are you sure you want to enter your password?"
  );
  logPasswordAttempt(meta, attempt, allow);
  return allow;
}

function logPasswordAttempt(field, attempt, allowed) {
  try {
    chrome.runtime.sendMessage({
      type: "DR_PASSWORD_ATTEMPT",
      payload: {
        url: window.location.href,
        hostname: window.location.hostname,
        field,
        attempt,
        allowed,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch {
    // Ignore logging failures
  }
}