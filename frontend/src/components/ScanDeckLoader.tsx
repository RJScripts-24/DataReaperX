import { useId } from "react";
import { motion } from "motion/react";

import { PressureFilter } from "./PressureFilter";
import { PressureText } from "./PressureText";

const BG = "#f5f3ef";
const BLUE = "#4a6fa5";
const GREEN = "#4f7d5c";
const TEXT = "#1f1f1f";
const TEXT_SEC = "#5a5a5a";

type ScanDeckLoaderProps = {
  variant?: "page" | "overlay";
  title?: string;
  subtitle?: string;
};

function RadarGlyph() {
  const gid = useId().replace(/:/g, "");
  const sweepId = `scan-deck-sweep-${gid}`;

  return (
    <div className="relative mx-auto" style={{ width: 132, height: 132 }}>
      <svg
        width="132"
        height="132"
        viewBox="0 0 132 132"
        className="overflow-visible"
        aria-hidden="true"
        style={{ filter: "url(#pencil-sketch)" }}
      >
        <defs>
          <linearGradient id={sweepId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0.42" />
          </linearGradient>
        </defs>
        {[44, 66, 88, 110].map((r, i) => (
          <circle
            key={r}
            cx="66"
            cy="66"
            r={r / 2}
            fill="none"
            stroke={BLUE}
            strokeWidth={i === 3 ? 1.4 : 0.9}
            strokeDasharray={i === 3 ? "none" : "5,6"}
            opacity={i === 3 ? 0.14 : 0.08}
          />
        ))}
        <motion.g
          style={{ transformOrigin: "66px 66px" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
        >
          <path d="M66 66 L62 8 A58 58 0 0 1 70 8 Z" fill={`url(#${sweepId})`} opacity={0.55} />
          <line x1="66" y1="66" x2="66" y2="8" stroke={GREEN} strokeWidth="2.2" strokeLinecap="round" opacity={0.85} />
          <circle cx="66" cy="8" r="3.2" fill={GREEN} opacity={0.55} />
        </motion.g>
        <circle cx="66" cy="66" r="4" fill={GREEN} opacity={0.45} />
        <motion.circle
          cx="66"
          cy="66"
          r="5"
          fill={GREEN}
          animate={{ opacity: [0.35, 0.85, 0.35], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

export function ScanDeckLoader({
  variant = "page",
  title = "Opening command center",
  subtitle = "Provisioning your scan deck and syncing live reconnaissance…",
}: ScanDeckLoaderProps) {
  const outer =
    variant === "overlay"
      ? "fixed inset-0 z-[200] flex items-center justify-center px-6"
      : "min-h-screen w-full flex items-center justify-center px-6";

  return (
    <div className={outer} style={{ backgroundColor: BG }}>
      <PressureFilter />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 hand-drawn-card w-full max-w-[440px] p-10 text-center"
      >
        <RadarGlyph />

        <PressureText
          as="h2"
          variant="strong"
          className="paper-text mt-6 mb-2"
          style={{ fontFamily: "'Caveat', cursive", fontSize: "clamp(1.85rem, 4vw, 2.35rem)", color: TEXT }}
        >
          {title}
        </PressureText>

        <PressureText
          as="p"
          variant="lite"
          className="paper-text"
          style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "1.15rem", color: TEXT_SEC, opacity: 0.9 }}
        >
          {subtitle}
        </PressureText>

        <div className="mt-8 flex justify-center gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, backgroundColor: BLUE, opacity: 0.35 }}
              animate={{ opacity: [0.25, 1, 0.25], y: [0, -5, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
