// ============================================================================
// DataReaper Tripwire Shield — Extension Packaging Script
// No npm dependencies — Node built-ins only (fs, path, child_process)
//
// Usage:
//   node package-extension.js
//
// Required env vars (read by inject-config.js):
//   GOOGLE_SAFE_BROWSING_API_KEY  — your Google Safe Browsing API key
//   SHIELD_DASHBOARD_ORIGIN       — e.g. http://localhost:5173
//   SHIELD_API_BASE               — e.g. http://localhost:8000/api
// ============================================================================

const fs          = require("fs");
const path        = require("path");
const { execSync } = require("child_process");

const SRC_DIR  = path.resolve(__dirname);
const OUT_DIR  = path.resolve(__dirname, "../backend/static");
const OUT_PATH = path.join(OUT_DIR, "datareaper-tripwire.zip");

const FILES_TO_ZIP = [
  "manifest.json",
  "background.js",
  "background-config-init.js",
  "content.js",
  "token-bridge.js",
  "icons/",
];

// ── Step 1: Generate icons if any are missing ────────────────────────────────
const iconSizes   = [16, 48, 128];
const missingIcons = iconSizes.filter(
  (s) => !fs.existsSync(path.join(SRC_DIR, `icons/icon${s}.png`))
);

if (missingIcons.length > 0) {
  console.log(`\n[1/3] Missing icons: ${missingIcons.map((s) => s + "px").join(", ")}. Generating...`);
  try {
    execSync("node generate-icons.js", { cwd: SRC_DIR, stdio: "inherit" });
  } catch (e) {
    console.error(
      "\n[ERROR] Icon generation failed. Make sure canvas is installed:\n" +
      "  cd extension && npm install\n"
    );
    process.exit(1);
  }
} else {
  console.log("\n[1/3] Icons present — skipping generation.");
}

// ── Step 2: Inject config (API key + URLs) into chrome.storage shim ──────────
console.log("\n[2/3] Injecting config shim...");
try {
  execSync("node inject-config.js", {
    cwd: SRC_DIR,
    stdio: "inherit",
    env: { ...process.env },
  });
} catch (e) {
  console.error("\n[ERROR] Config injection failed:", e.message);
  process.exit(1);
}

// ── Step 3: Package into zip ──────────────────────────────────────────────────
console.log("\n[3/3] Packaging extension zip...");
fs.mkdirSync(OUT_DIR, { recursive: true });

if (fs.existsSync(OUT_PATH)) {
  fs.unlinkSync(OUT_PATH);
}

if (process.platform === "win32") {
  const pwshItems = FILES_TO_ZIP.map((f) => `"${f}"`).join(", ");
  const dest      = OUT_PATH.replace(/\\/g, "\\\\");
  const pwshScript =
    `$dest = "${dest}"; ` +
    `$items = @(${pwshItems}); ` +
    `if (Test-Path $dest) { Remove-Item $dest -Force } ` +
    `Compress-Archive -Path $items -DestinationPath $dest -Force; ` +
    `Write-Output "Packaged to $dest"`;
  execSync(`powershell -NoProfile -Command "${pwshScript.replace(/"/g, '\\"')}"`, {
    cwd: SRC_DIR,
    stdio: "inherit",
  });
} else {
  const filesArg = FILES_TO_ZIP.join(" ");
  execSync(`zip -r "${OUT_PATH}" ${filesArg}`, { cwd: SRC_DIR, stdio: "inherit" });
}

console.log(`\n✅ Extension packaged → ${OUT_PATH}\n`);