// ============================================================================
// DataReaper Tripwire Shield — Icon Generator
// Generates icon16.png, icon48.png, icon128.png using the `canvas` npm package.
// Run: node generate-icons.js
// ============================================================================

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  // Background
  ctx.fillStyle = "#1a0a0a";
  ctx.fillRect(0, 0, size, size);

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#8b0000";
  ctx.fill();

  // Skull cranium (white ellipse, top portion)
  const skullR = r * 0.65;
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.08, skullR * 0.75, skullR * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#f5f5f5";
  ctx.fill();

  // Left eye socket
  const eyeR = skullR * 0.22;
  const eyeY = cy - r * 0.15;
  const eyeOffsetX = skullR * 0.28;
  ctx.beginPath();
  ctx.ellipse(cx - eyeOffsetX, eyeY, eyeR, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1a0a0a";
  ctx.fill();

  // Right eye socket
  ctx.beginPath();
  ctx.ellipse(cx + eyeOffsetX, eyeY, eyeR, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1a0a0a";
  ctx.fill();

  // Nasal cavity (tiny triangle notch)
  const noseSize = skullR * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + eyeR * 1.5);
  ctx.lineTo(cx - noseSize, eyeY + eyeR * 1.5 + noseSize * 1.6);
  ctx.lineTo(cx + noseSize, eyeY + eyeR * 1.5 + noseSize * 1.6);
  ctx.closePath();
  ctx.fillStyle = "#1a0a0a";
  ctx.fill();

  // Teeth (3 rectangles at bottom of skull)
  const teethY = cy + r * 0.22;
  const toothW = skullR * 0.18;
  const toothH = skullR * 0.22;
  const teethGap = skullR * 0.06;
  const teethStartX = cx - toothW * 1.5 - teethGap;

  for (let i = 0; i < 3; i++) {
    const tx = teethStartX + i * (toothW + teethGap);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(tx, teethY, toothW, toothH);
  }

  return canvas.toBuffer("image/png");
}

const ICONS_DIR = path.join(__dirname, "icons");
fs.mkdirSync(ICONS_DIR, { recursive: true });

for (const size of [16, 48, 128]) {
  const buf = drawIcon(size);
  const outPath = path.join(ICONS_DIR, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`[DataReaper] Generated icons/icon${size}.png (${size}x${size})`);
}

console.log("[DataReaper] All icons generated successfully.");