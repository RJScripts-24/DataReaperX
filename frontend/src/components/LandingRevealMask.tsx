import { useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { RevealContext } from '../contexts/RevealContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number; }

interface BrushStroke {
  spine: Vec2[];
  perps: Vec2[];
  widths: number[];   // half-widths per spine point
  bristles: BristleLine[];
  startMs: number;
  durationMs: number;
}

interface BristleLine {
  offset: number;
  width: number;
  opacity: number;
  startFrac: number;
  endFrac: number;
}

// ─── Tuning ───────────────────────────────────────────────────────────────────

const PAPER_COLOR = '#fdfbf7';
const NUM_STROKES = 30;    // further increased density
const TOTAL_MS = 3840;
const STROKE_MS = 840;
const CASCADE_MS = TOTAL_MS - STROKE_MS;
const MIN_WIDTH = 140;   // wider strokes to prevent gaps
const MAX_WIDTH = 260;   // wider strokes to prevent gaps
const BRISTLES = 6;
const WOBBLE = 8;     // reduced wobble so strokes stay parallel & gap-free
const STROKE_STEPS = 28;

// ─── Component ────────────────────────────────────────────────────────────────

export function LandingRevealMask({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const [done, setDone] = useState(false);
  const [almostDone, setAlmostDone] = useState(false);

  useLayoutEffect(() => {
    if (done) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // ── Visible canvas ────────────────────────────────────────────────────────
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;

    const ctx = canvas.getContext('2d', { alpha: true })!;
    ctx.scale(dpr, dpr);

    // Fill immediately to prevent 1-frame UI flash before first rAF tick
    ctx.fillStyle = PAPER_COLOR;
    ctx.fillRect(0, 0, vw, vh);

    // ── Offscreen accumulator canvas ──────────────────────────────────────────
    // THE FIX FOR WHITE GAPS:
    // Instead of re-drawing every stroke from scratch each frame and using
    // destination-out on the visible canvas (which leaves gaps wherever no
    // stroke has reached yet), we maintain a separate offscreen canvas that
    // accumulates ALL painted stroke area across all frames.
    // Completed strokes are baked into it permanently.
    // Each frame we composite the full accumulated mask in ONE drawImage call,
    // which means the visible canvas is either fully covered (paper) or fully
    // revealed (transparent) — no partial-frame gaps possible.
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    offscreenRef.current = offscreen;

    const offCtx = offscreen.getContext('2d')!;
    offCtx.scale(dpr, dpr);

    const strokes = buildAllStrokes(vw, vh);
    const strokeDone = new Array(strokes.length).fill(false);

    let startTime: number | null = null;
    let rafId: number;
    let finished = false;

    const maxTime = strokes.length > 0 ? Math.max(...strokes.map((s) => s.startMs + s.durationMs)) : 0;
    let almostDoneTriggered = false;

    function animate(ts: number) {
      if (finished) return;
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;

      if (!almostDoneTriggered && elapsed >= maxTime - 500) {
        setAlmostDone(true);
        almostDoneTriggered = true;
      }

      // ── 1. Repaint paper cover on visible canvas ──────────────────────────
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = PAPER_COLOR;
      ctx.fillRect(0, 0, vw, vh);

      // ── 2. Build this frame's full mask on a temp canvas ──────────────────
      // Start from the permanently-baked offscreen, then paint still-animating
      // strokes on top. This temp canvas holds ALL revealed area cumulatively.
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = canvas.width;
      frameCanvas.height = canvas.height;
      const fCtx = frameCanvas.getContext('2d')!;
      fCtx.scale(dpr, dpr);

      // Copy the permanent accumulator (all finished strokes already baked)
      fCtx.drawImage(offscreen, 0, 0, vw, vh);

      let allDone = true;

      for (let si = 0; si < strokes.length; si++) {
        const stroke = strokes[si];
        const strokeElapsed = elapsed - stroke.startMs;

        if (strokeElapsed <= 0) { allDone = false; continue; }

        const raw = strokeElapsed / stroke.durationMs;
        const prog = Math.min(raw, 1.0);
        if (prog < 1.0) allDone = false;

        // Skip strokes already baked permanently
        if (strokeDone[si]) continue;

        paintStroke(fCtx, stroke, easeOutCubic(prog));

        // Bake finished strokes into offscreen so they never get redrawn
        if (prog >= 1.0) {
          strokeDone[si] = true;
          paintStroke(offCtx, stroke, 1.0);
        }
      }

      // ── 3. Punch the accumulated mask through the paper cover ─────────────
      // destination-out: wherever frameCanvas is opaque → visible canvas
      // becomes transparent → page content shows through.
      // ONE composite operation = zero gaps between strokes.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(frameCanvas, 0, 0, vw, vh);

      if (!allDone) {
        rafId = requestAnimationFrame(animate);
      } else {
        if (!almostDoneTriggered) {
          setAlmostDone(true);
          almostDoneTriggered = true;
        }
        finished = true;
        setTimeout(() => {
          fadeOut(canvas, () => {
            setDone(true);
          });
        }, 80);
      }
    }

    const kickoff = setTimeout(() => {
      rafId = requestAnimationFrame(animate);
    }, 50);

    return () => {
      clearTimeout(kickoff);
      cancelAnimationFrame(rafId);
      finished = true;
    };
  }, [done]);

  if (done) return <RevealContext.Provider value={{done: true, almostDone: true}}>{children}</RevealContext.Provider>;

  return (
    <RevealContext.Provider value={{done: false, almostDone}}>
      {children}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </RevealContext.Provider>
  );
}

// ─── Stroke builder ────────────────────────────────────────────────────────────
// All geometry + seeded randomness decided once at init — never in draw loop.

function buildAllStrokes(vw: number, vh: number): BrushStroke[] {
  const strokes: BrushStroke[] = [];

  // ── Direction: TOP-LEFT → BOTTOM-RIGHT ───────────────────────────────────
  //
  // The main stroke direction is the viewport diagonal: angle = atan2(vh, vw).
  // Each stroke travels parallel to this diagonal.
  //
  // The SWEEP direction (how strokes are ordered) is perpendicular to the
  // diagonal. We sweep from the top-left region toward the bottom-right,
  // so the first strokes appear near the top-left corner and the last near
  // the bottom-right corner.
  //
  // Perpendicular to diagonal (cosA, sinA) is (-sinA, cosA).
  // Projecting viewport corners onto this perpendicular:
  //   Top-left  (0,  0):  proj = 0
  //   Top-right (vw, 0):  proj = vw*(-sinA)  → negative (far from TL)
  //   Bot-left  (0, vh):  proj = vh*(cosA)   → positive (far from TL)
  //   Bot-right (vw,vh):  proj = vw*(-sinA) + vh*cosA
  //
  // We sort strokes from most-negative to most-positive projection,
  // so i=0 starts nearest the TL corner and i=N-1 starts nearest BR corner.

  const diagAngle = Math.atan2(-vh, vw);
  const cosA = Math.cos(diagAngle);
  const sinA = Math.sin(diagAngle);

  // Sweep perpendicular unit vector (points roughly bottom-right when stroke is bottom-left to top-right)
  const sweepX = -sinA;
  const sweepY = cosA;

  // Viewport center — reference point for placing start points
  const cx = vw / 2;
  const cy = vh / 2;

  // Project all four corners onto sweep axis to find coverage range
  const corners = [
    { x: 0, y: 0 },
    { x: vw, y: 0 },
    { x: 0, y: vh },
    { x: vw, y: vh },
  ];
  // Calculate projection relative to the center so all strokes start near the center depth
  const projections = corners.map(c => (c.x - cx) * sweepX + (c.y - cy) * sweepY);
  const projMin = Math.min(...projections) - MAX_WIDTH * 1.0; // increased overshoot to cover corners
  const projMax = Math.max(...projections) + MAX_WIDTH * 1.0;
  const projRange = projMax - projMin;

  // Each stroke needs to be long enough to cross the full viewport diagonally
  const fullDiag = Math.sqrt(vw * vw + vh * vh);
  const STROKE_LEN = fullDiag * 1.3;
  const PUSH_BACK = fullDiag * 0.6; // how far back from center the stroke starts


  for (let i = 0; i < NUM_STROKES; i++) {
    const t = i / (NUM_STROKES - 1); // 0 = top-left region, 1 = bottom-right region

    // Position along the sweep axis
    const sweepPos = projMin + t * projRange;

    // Reference point on the stroke's line (relative to viewport center)
    const refX = cx + sweepX * sweepPos;
    const refY = cy + sweepY * sweepPos;

    // Push start point back along stroke direction so it begins off-screen
    const sx = refX - cosA * PUSH_BACK;
    const sy = refY - sinA * PUSH_BACK;
    const ex = sx + cosA * STROKE_LEN;
    const ey = sy + sinA * STROKE_LEN;

    const spine = buildSpine(sx, sy, ex, ey, i);
    const perps = computePerps(spine);

    const centeredness = 1 - Math.abs(t - 0.5) * 2;
    const peakWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * (0.4 + centeredness * 0.6);
    const widths = buildWidths(spine.length, peakWidth);
    const bristles = buildBristles(peakWidth, i);

    // Timing: i=0 strokes start first (top-left), i=N-1 last (bottom-right)
    const baseDelay = t * CASCADE_MS;
    const jitter = (seededRandom(i * 13 + 5) - 0.5) * 50;
    const startMs = Math.max(0, baseDelay + jitter);
    const durationMs = STROKE_MS * (0.85 + centeredness * 0.3);

    strokes.push({ spine, perps, widths, bristles, startMs, durationMs });
  }

  return strokes;
}

// ─── Spine ───────────────────────────────────────────────────────────────────

function buildSpine(x1: number, y1: number, x2: number, y2: number, idx: number): Vec2[] {
  const pts: Vec2[] = [];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const phase = idx * 1.618033;

  for (let s = 0; s <= STROKE_STEPS; s++) {
    const frac = s / STROKE_STEPS;
    const bx = x1 + dx * frac;
    const by = y1 + dy * frac;
    const wobble =
      Math.sin(frac * Math.PI * 2.1 + phase) * WOBBLE +
      Math.sin(frac * Math.PI * 5.3 + phase * 2.7) * (WOBBLE * 0.3);
    pts.push({ x: bx + nx * wobble, y: by + ny * wobble });
  }
  return pts;
}

// ─── Width profile (stored as half-widths) ───────────────────────────────────

function buildWidths(numPts: number, peakWidth: number): number[] {
  const w: number[] = [];
  for (let i = 0; i < numPts; i++) {
    const frac = i / (numPts - 1);
    const entry = Math.min(frac / 0.12, 1.0);
    const exit = Math.min((1 - frac) / 0.25, 1.0);
    const micro = 1 - seededRandom(i * 3 + 17) * 0.08;
    w.push((peakWidth * entry * exit * micro) / 2);
  }
  return w;
}

// ─── Bristles ─────────────────────────────────────────────────────────────────

function buildBristles(peakWidth: number, strokeIdx: number): BristleLine[] {
  const result: BristleLine[] = [];
  for (let b = 0; b < BRISTLES; b++) {
    const norm = b / (BRISTLES - 1);
    const sign = norm - 0.5;
    const edgeness = Math.abs(sign) * 2;
    const offset = sign * peakWidth * 0.50;
    const width = peakWidth * (0.025 + seededRandom(b * 7 + strokeIdx) * 0.04) * (1 - edgeness * 0.35);
    const opacity = (0.8 - edgeness * 0.5) * (0.6 + seededRandom(b * 4 + strokeIdx * 3) * 0.4);
    const startFrac = edgeness * 0.04 * seededRandom(b + 11);
    const endFrac = 1 - edgeness * 0.05 * seededRandom(b + 21);
    result.push({ offset, width, opacity, startFrac, endFrac });
  }
  return result;
}

// ─── Per-frame stroke painter ─────────────────────────────────────────────────

function paintStroke(ctx: CanvasRenderingContext2D, stroke: BrushStroke, progress: number) {
  const { spine, perps, widths, bristles } = stroke;
  const n = spine.length;
  const draw = progress * (n - 1);
  const full = Math.floor(draw);
  const frac = draw - full;

  if (full < 1) return;

  // ── Filled capsule body ────────────────────────────────────────────────────
  ctx.beginPath();

  for (let p = 0; p <= full; p++) {
    const px = spine[p].x + perps[p].x * widths[p];
    const py = spine[p].y + perps[p].y * widths[p];
    p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }

  const tipX = full < n - 1 ? lerp(spine[full].x, spine[full + 1].x, frac) : spine[full].x;
  const tipY = full < n - 1 ? lerp(spine[full].y, spine[full + 1].y, frac) : spine[full].y;
  const tipW = full < n - 1 ? lerp(widths[full], widths[full + 1], frac) : widths[full];
  const tipP = full < n - 1
    ? lerpVec(perps[full], perps[Math.min(full + 1, n - 1)], frac)
    : perps[full];

  ctx.lineTo(tipX + tipP.x * tipW, tipY + tipP.y * tipW);
  const tipAngle = Math.atan2(tipP.y, tipP.x);
  ctx.arc(tipX, tipY, tipW, tipAngle, tipAngle + Math.PI, false);

  for (let p = full; p >= 0; p--) {
    ctx.lineTo(
      spine[p].x - perps[p].x * widths[p],
      spine[p].y - perps[p].y * widths[p]
    );
  }

  const tailAngle = Math.atan2(perps[0].y, perps[0].x);
  ctx.arc(spine[0].x, spine[0].y, widths[0], tailAngle + Math.PI, tailAngle, false);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fill();

  // ── Bristle fringe ─────────────────────────────────────────────────────────
  for (const br of bristles) {
    const bStart = Math.floor(br.startFrac * (n - 1));
    const bEnd = Math.min(full, Math.floor(br.endFrac * (n - 1)));
    if (bEnd <= bStart + 1) continue;
    ctx.beginPath();
    for (let p = bStart; p <= bEnd; p++) {
      const px = spine[p].x + perps[p].x * br.offset;
      const py = spine[p].y + perps[p].y * br.offset;
      p === bStart ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.strokeStyle = `rgba(0,0,0,${br.opacity})`;
    ctx.lineWidth = br.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computePerps(spine: Vec2[]): Vec2[] {
  return spine.map((_, i) => {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  const x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
  const l = Math.sqrt(x * x + y * y) || 1;
  return { x: x / l, y: y / l };
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

function seededRandom(seed: number): number {
  const s = Math.sin(seed * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

function fadeOut(canvas: HTMLCanvasElement, onDone: () => void) {
  const start = performance.now();
  const dur = 400;
  function tick(ts: number) {
    const p = Math.min((ts - start) / dur, 1);
    canvas.style.opacity = String(1 - easeOutCubic(p));
    p < 1 ? requestAnimationFrame(tick) : onDone();
  }
  requestAnimationFrame(tick);
}