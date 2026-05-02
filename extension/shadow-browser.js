// ============================================================================
// DataReaper Tripwire Shield — Shadow Browser (Noise Generator)
// ES module imported by background.js. Must use only Chrome extension APIs — no DOM.
//
// Runs on chrome.alarms while Chrome is open (service worker wakes for each alarm).
// All decoy navigations open in a dedicated minimized WINDOW so the user’s normal
// window stays calm; chrome://history still records each visit. When the user finishes
// loading a normal page, we optionally fire 3 extra decoys (cooldown) in that window.
// We never POST passwords or complete OAuth — only public GET navigations.
// ============================================================================

const SHADOW_ALARM = "dr_shadow_tick";
const SHADOW_ENABLED_KEY = "dr_shadow_browser_enabled";
const SHADOW_LOG_KEY = "dr_shadow_log";
const SHADOW_DISPLAY_PERSONA_KEY = "dr_shadow_display_persona";
const SHADOW_NOISE_WINDOW_KEY = "dr_shadow_noise_window_id";
/** Minimum 1 for chrome.alarms periodInMinutes */
const SHADOW_INTERVAL_MINUTES = 1;
/** Skip overlapping ticks if a previous round is still opening tabs */
let shadowTickBusy = false;
const SHADOW_TAB_NAV_TIMEOUT_MS = 22000;
const SHADOW_POST_LOAD_SETTLE_MS = 450;
let shadowNoiseWindowId = null;
let creatingShadowWindow = false;
let lastUserReactiveShadowTs = 0;
/** Minimum spacing between reactive 3-packs after normal page loads (busy lock still applies). */
const USER_REACTIVE_SHADOW_COOLDOWN_MS = 2000;
let reactiveShadowBusy = false;
const INTEREST_URLS_PER_TICK = 3;
const PASSIVE_URLS_PER_TICK = 2;

const DECOY_SITE_LABELS = [
  "Hobby discussion board",
  "Specialty marketplace",
  "Local events forum",
  "Regional news comments",
  "Community recipe exchange",
  "DIY project hub",
  "Developer forum (login surface)",
  "Tech Q&A community",
];

/** Only hostnames we intentionally hit — rejects polluted storage */
const ALLOWED_SHADOW_HOST_SUFFIXES = [
  "google.com",
  "wikipedia.org",
  "reddit.com",
  "amazon.com",
  "youtube.com",
  "github.com",
  "stackoverflow.com",
  "ycombinator.com",
  "gitlab.com",
  "discord.com",
];

/** Public login / feed surfaces (anonymous page load — never submits credentials). */
const PASSIVE_SURFACE_URLS = [
  "https://github.com/login",
  "https://stackoverflow.com/users/login?ssrc=head",
  "https://www.reddit.com/login/",
  "https://news.ycombinator.com/login",
  "https://en.wikipedia.org/wiki/Special:Random",
  "https://www.youtube.com/",
  "https://stackoverflow.com/questions",
  "https://gitlab.com/users/sign_in",
  "https://discord.com/login",
  "https://www.amazon.com/ap/signin",
];

// ── Fake identity pool ────────────────────────────────────────────────────────
const PERSONAS = [
  { name: "Harold Finch", age: 67, occupation: "Retired Farmer", interests: ["tractors", "seed catalogs", "grain prices", "county fair", "used farm equipment"] },
  { name: "Brenda Kowalski", age: 34, occupation: "Amateur Genealogist", interests: ["ancestry records", "14th century pottery", "medieval history", "Ellis Island manifests"] },
  { name: "Desmond Chu", age: 52, occupation: "Birdwatcher", interests: ["binoculars review", "migratory bird patterns", "birdwatching trails Ohio", "bird feeder types"] },
  { name: "Marguerite DuPont", age: 29, occupation: "Real Estate Hobbyist", interests: ["fixer upper homes Ohio", "mortgage rates 2008", "real estate auctions Iowa", "rural property listings"] },
  { name: "Wallace T. Perkins", age: 73, occupation: "Model Train Enthusiast", interests: ["HO scale locomotives", "model railroad scenery", "train show schedule", "vintage rail photos"] },
  { name: "Yuki Tanaka", age: 41, occupation: "Koi Pond Designer", interests: ["koi fish varieties", "pond filtration systems", "Japanese garden stones", "water lily care"] },
  { name: "Clarence Brown", age: 58, occupation: "Beekeeper", interests: ["honey extraction equipment", "queen bee rearing", "beehive winterizing", "local honey prices"] },
  { name: "Gloria Espinoza", age: 46, occupation: "Quilting Instructor", interests: ["quilting patterns free", "longarm quilting machines", "fabric stores Ohio", "quilting retreats"] },
  { name: "Raj Patel", age: 31, occupation: "Competitive Rubik's Cuber", interests: ["speedcube lubricant", "GAN cubes", "Rubik's cube algorithms", "WCA competitions Ohio"] },
  { name: "Mabel Thornton", age: 82, occupation: "Bridge Player", interests: ["duplicate bridge strategy", "bridge tournaments", "playing card reviews", "senior center activities"] },
  { name: "Diego Ramirez", age: 27, occupation: "Vinyl Record Collector", interests: ["vintage turntables", "record cleaning kits", "rare jazz vinyl", "record store day releases"] },
  { name: "Olga Petrov", age: 55, occupation: "Mushroom Forager", interests: ["morel mushroom hunting", "mushroom identification guide", "dehydrated mushrooms", "foraging clubs Ohio"] },
  { name: "Tyrone Williams", age: 39, occupation: "Home Brewer", interests: ["IPA recipe kits", "homebrew supplies", "kegging equipment", "beer competition entry"] },
  { name: "Fiona Gallagher", age: 44, occupation: "Dog Agility Trainer", interests: ["agility tunnel", "dog treat recipes", "AKC agility trials", "border collie training"] },
  { name: "Hector Gonzalez", age: 62, occupation: "Luthier Hobbyist", interests: ["acoustic guitar wood", "fret wire sizes", "guitar varnish", "luthier tools beginners"] },
  { name: "Agnes Kim", age: 36, occupation: "Sourdough Baker", interests: ["sourdough starter care", "bread scoring patterns", "Dutch oven baking", "artisan flour types"] },
  { name: "Norbert Fischer", age: 69, occupation: "Chess Club Organizer", interests: ["Sicilian defense variations", "chess clock reviews", "tournament chess sets", "chess openings database"] },
  { name: "Priya Srinivasan", age: 33, occupation: "Indoor Plant Collector", interests: ["rare aroids", "grow lights", "monstera care", "plant propagation stations"] },
  { name: "Earl Henderson", age: 77, occupation: "Metal Detectorist", interests: ["metal detector reviews", "beach detecting permits", "coin identification", "civil war relic hunting"] },
  { name: "Svetlana Kozlov", age: 49, occupation: "Soap Maker", interests: ["cold process soap recipes", "essential oils bulk", "soap molds silicone", "craft fair booth setup"] },
];

const URL_TEMPLATES = [
  (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  (q) => `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/ /g, "_"))}`,
  (q) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}`,
  (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  (q) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}`,
  (q) => `https://github.com/search?q=${encodeURIComponent(q)}&type=repositories`,
];

const SUFFIXES = ["near me", "reviews", "best", "how to", "cheap", ""];

function pickDistinctPassiveUrls(n) {
  const pool = [...PASSIVE_SURFACE_URLS];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function personaFromPool(p) {
  if (!p || typeof p.name !== "string" || typeof p.occupation !== "string") return false;
  return PERSONAS.some((x) => x.name === p.name && x.occupation === p.occupation);
}

function hostMatchesAllowlist(hostname) {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  return ALLOWED_SHADOW_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

function isValidDecoySession(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.site === "string" &&
    obj.site.length > 0 &&
    typeof obj.alias === "string" &&
    obj.alias.length > 0
  );
}

function isValidShadowLogEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.persona !== "string" || typeof entry.occupation !== "string") return false;
  if (typeof entry.ts !== "number" || Number.isNaN(entry.ts)) return false;
  if (!Array.isArray(entry.urls) || entry.urls.length === 0) return false;
  if (!PERSONAS.some((p) => p.name === entry.persona && p.occupation === entry.occupation)) return false;
  if (entry.decoySession != null && !isValidDecoySession(entry.decoySession)) return false;
  for (const url of entry.urls) {
    try {
      if (!hostMatchesAllowlist(new URL(url).hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ── URL generator ──────────────────────────────────────────────────────────────
function generateFakeUrl(persona) {
  const interest = persona.interests[Math.floor(Math.random() * persona.interests.length)];
  const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  const query = suffix ? `${interest} ${suffix}` : interest;
  const template = URL_TEMPLATES[Math.floor(Math.random() * URL_TEMPLATES.length)];
  return template(query);
}

/** Local-only label for the dashboard (no server login, no passwords). */
function makeDecoySession(persona) {
  const first = String(persona.name).split(/\s+/)[0] || "user";
  const slug = `${first.toLowerCase().replace(/[^a-z]/gi, "")}.${1950 + (persona.age % 50)}`;
  return {
    site: DECOY_SITE_LABELS[Math.floor(Math.random() * DECOY_SITE_LABELS.length)],
    alias: slug,
  };
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpd);
      resolve();
    };
    const timer = setTimeout(cleanup, SHADOW_TAB_NAV_TIMEOUT_MS);
    function onUpd(id, changeInfo) {
      if (id !== tabId) return;
      if (changeInfo.status === "complete") {
        cleanup();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

async function restoreShadowNoiseWindowId() {
  const s = await chrome.storage.local.get(SHADOW_NOISE_WINDOW_KEY);
  const wid = s[SHADOW_NOISE_WINDOW_KEY];
  if (typeof wid !== "number") return;
  try {
    await chrome.windows.get(wid);
    shadowNoiseWindowId = wid;
  } catch {
    await chrome.storage.local.remove(SHADOW_NOISE_WINDOW_KEY);
    shadowNoiseWindowId = null;
  }
}

async function getOrCreateShadowNoiseWindow() {
  if (shadowNoiseWindowId != null) {
    try {
      await chrome.windows.get(shadowNoiseWindowId);
      return shadowNoiseWindowId;
    } catch {
      shadowNoiseWindowId = null;
      await chrome.storage.local.remove(SHADOW_NOISE_WINDOW_KEY);
    }
  }

  while (creatingShadowWindow) {
    await new Promise((r) => setTimeout(r, 40));
  }
  creatingShadowWindow = true;
  try {
    let w;
    try {
      w = await chrome.windows.create({
        url: "about:blank",
        focused: false,
        state: "minimized",
      });
    } catch {
      w = await chrome.windows.create({ url: "about:blank", focused: false });
      try {
        await chrome.windows.update(w.id, { state: "minimized" });
      } catch {
        /* ignore */
      }
    }
    shadowNoiseWindowId = w.id;
    await chrome.storage.local.set({ [SHADOW_NOISE_WINDOW_KEY]: shadowNoiseWindowId });
    return shadowNoiseWindowId;
  } finally {
    creatingShadowWindow = false;
  }
}

async function visitUrlInShadowWindow(url) {
  const wid = await getOrCreateShadowNoiseWindow();
  let tabId;
  try {
    const tab = await chrome.tabs.create({ windowId: wid, url, active: false });
    tabId = tab.id;
    if (tabId == null) return;

    try {
      const snap = await chrome.tabs.get(tabId);
      if (snap.status !== "complete") {
        await waitForTabComplete(tabId);
      }
    } catch {
      await waitForTabComplete(tabId);
    }

    await new Promise((r) => setTimeout(r, SHADOW_POST_LOAD_SETTLE_MS));
    await chrome.tabs.remove(tabId);

    try {
      await chrome.windows.get(wid);
    } catch {
      shadowNoiseWindowId = null;
      await chrome.storage.local.remove(SHADOW_NOISE_WINDOW_KEY);
    }
  } catch {
    if (typeof tabId === "number") {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * After a real user page finishes loading (non-threat), open 3 decoy URLs in the shadow window.
 * Cooldown + busy guards avoid stacking with the periodic alarm.
 */
export async function maybeTriggerReactiveShadowPack(userTabId, userUrl) {
  let tab;
  try {
    tab = await chrome.tabs.get(userTabId);
  } catch {
    return;
  }
  if (tab.incognito) return;

  const storedWin = await chrome.storage.local.get(SHADOW_NOISE_WINDOW_KEY);
  const shadowWid = shadowNoiseWindowId ?? storedWin[SHADOW_NOISE_WINDOW_KEY];
  if (shadowWid != null && tab.windowId === shadowWid) return;

  const on = await chrome.storage.local.get(SHADOW_ENABLED_KEY);
  if (!on[SHADOW_ENABLED_KEY]) return;

  if (!userUrl.startsWith("http:") && !userUrl.startsWith("https:")) return;
  const low = userUrl.toLowerCase();
  if (low.includes("localhost") || low.includes("127.0.0.1")) return;

  if (Date.now() - lastUserReactiveShadowTs < USER_REACTIVE_SHADOW_COOLDOWN_MS) return;
  if (reactiveShadowBusy || shadowTickBusy) return;

  reactiveShadowBusy = true;
  lastUserReactiveShadowTs = Date.now();
  try {
    const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    const passive = pickDistinctPassiveUrls(1)[0];
    const pack = [generateFakeUrl(persona), generateFakeUrl(persona), passive];
    for (const u of pack) {
      await visitUrlInShadowWindow(u);
    }
    console.log("[DataReaper] Reactive 3-pack in shadow window after user page:", userUrl.slice(0, 96));
  } catch (e) {
    console.warn("[DataReaper] Reactive shadow pack failed:", e?.message || e);
  } finally {
    reactiveShadowBusy = false;
  }
}

async function appendShadowLog(entry) {
  const stored = await chrome.storage.local.get(SHADOW_LOG_KEY);
  const existing = Array.isArray(stored[SHADOW_LOG_KEY]) ? stored[SHADOW_LOG_KEY] : [];
  const next = [entry, ...existing].slice(0, 50);
  await chrome.storage.local.set({ [SHADOW_LOG_KEY]: next });
}

// ── Defaults: shadow was silently OFF while the dashboard toggle looked ON ─────────
async function ensureShadowDefaults() {
  const stored = await chrome.storage.local.get([SHADOW_ENABLED_KEY, SHADOW_DISPLAY_PERSONA_KEY]);
  const updates = {};

  if (stored[SHADOW_ENABLED_KEY] === undefined) {
    updates[SHADOW_ENABLED_KEY] = true;
  }

  let display = stored[SHADOW_DISPLAY_PERSONA_KEY];
  if (!personaFromPool(display)) {
    display = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    updates[SHADOW_DISPLAY_PERSONA_KEY] = display;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

// ── Core shadow tick ──────────────────────────────────────────────────────────
async function runShadowTick() {
  if (shadowTickBusy) {
    console.log("[DataReaper] Shadow tick skipped (still running)");
    return;
  }
  shadowTickBusy = true;

  try {
    await ensureShadowDefaults();

    const on = await chrome.storage.local.get(SHADOW_ENABLED_KEY);
    if (!on[SHADOW_ENABLED_KEY]) return;

    const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    await chrome.storage.local.set({ [SHADOW_DISPLAY_PERSONA_KEY]: persona });

    const urls = [];
    for (let i = 0; i < INTEREST_URLS_PER_TICK; i++) {
      urls.push(generateFakeUrl(persona));
    }
    urls.push(...pickDistinctPassiveUrls(PASSIVE_URLS_PER_TICK));

    for (let i = urls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [urls[i], urls[j]] = [urls[j], urls[i]];
    }

    for (const url of urls) {
      await visitUrlInShadowWindow(url);
    }

    console.log("[DataReaper] Shadow tick", persona.name, urls.length, "URLs (tabs → Chrome history)");

    const decoySession = makeDecoySession(persona);

    await appendShadowLog({
      persona: persona.name,
      occupation: persona.occupation,
      urls,
      ts: Date.now(),
      decoySession,
    });
  } finally {
    shadowTickBusy = false;
  }
}

/** One-shot (install / manual) so the dashboard is not empty until the alarm fires */
export async function runShadowNoiseWarmUp() {
  await runShadowTick();
}

// ── Public API ─────────────────────────────────────────────────────────────────
export async function initShadowBrowser() {
  await ensureShadowDefaults();
  await restoreShadowNoiseWindowId();
  const existing = await chrome.alarms.get(SHADOW_ALARM);
  if (!existing) {
    await chrome.alarms.create(SHADOW_ALARM, { periodInMinutes: SHADOW_INTERVAL_MINUTES });
    console.log("[DataReaper] Shadow browser alarm created (every", SHADOW_INTERVAL_MINUTES, "min).");
  }
}

export async function handleShadowAlarm(alarmName) {
  if (alarmName === SHADOW_ALARM) {
    await runShadowTick();
  }
}

export async function setShadowEnabled(enabled) {
  await ensureShadowDefaults();
  await chrome.storage.local.set({ [SHADOW_ENABLED_KEY]: !!enabled });
}

export async function getShadowBrowserEnabled() {
  await ensureShadowDefaults();
  const stored = await chrome.storage.local.get(SHADOW_ENABLED_KEY);
  return stored[SHADOW_ENABLED_KEY] !== false;
}

export async function getShadowLog() {
  await ensureShadowDefaults();
  const stored = await chrome.storage.local.get(SHADOW_LOG_KEY);
  const raw = Array.isArray(stored[SHADOW_LOG_KEY]) ? stored[SHADOW_LOG_KEY] : [];
  const valid = raw.filter(isValidShadowLogEntry);
  if (valid.length !== raw.length) {
    await chrome.storage.local.set({ [SHADOW_LOG_KEY]: valid });
  }
  return valid;
}

/** Dashboard card persona; overwritten each tick by the persona used that round unless forceRandom picks one now */
export async function resolveDisplayPersona(forceRandom = false) {
  await ensureShadowDefaults();
  if (forceRandom) {
    const p = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    await chrome.storage.local.set({ [SHADOW_DISPLAY_PERSONA_KEY]: p });
    return p;
  }
  const stored = await chrome.storage.local.get(SHADOW_DISPLAY_PERSONA_KEY);
  let p = stored[SHADOW_DISPLAY_PERSONA_KEY];
  if (!personaFromPool(p)) {
    p = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    await chrome.storage.local.set({ [SHADOW_DISPLAY_PERSONA_KEY]: p });
  }
  return p;
}
