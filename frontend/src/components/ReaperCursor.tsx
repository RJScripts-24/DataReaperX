import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../styles/reaper-cursor.css";

const DEFAULT_REAPER_IDLE_TIME = 5000;
const AUTONOMOUS_PHRASES = [
  "Scanning for digital rot...",
  "I see your data... it's everywhere.",
  "Brokers are sweating today.",
  "Signal locked on identity footpaints.",
  "Searching for hidden leaks...",
  "The hunt never sleeps.",
  "Identity theft is my favorite game.",
  "Reclaiming what was lost.",
];

type ReaperMood = "default" | "happy" | "thinking" | "sad" | "confused";
type ReaperZoom = "base" | "mid" | "high";

type HoverConfig = {
  mood: ReaperMood;
  zoom: ReaperZoom;
  phrases: string[];
};

const MOOD_IMAGE_MAP: Record<ReaperMood, string> = {
  default: "/cursor/reaper.png",
  happy: "/cursor/happy-reaper.png",
  thinking: "/cursor/thinking-reaper.png",
  sad: "/cursor/sad-reaper.png",
  confused: "/cursor/reaperconfuse.png",
};

const DEFAULT_MOOD: ReaperMood = "default";
const DEFAULT_ZOOM: ReaperZoom = "base";
const NATIVE_CURSOR_GAP_OFFSET_X = 55;
const NATIVE_CURSOR_GAP_OFFSET_X_FLIPPED = 49;
const NATIVE_CURSOR_GAP_OFFSET_Y = 50;

const HOVERABLE_SELECTOR = [
  "[data-reaper-phrases]",
  "[data-reaper-expression]",
  "[data-reaper-zoom]",
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "[role='button']",
].join(",");

const HEADLINE_PHRASES = [
  "Portal awake.",
  "We hunt what leaks.",
  "Target acquired.",
  "Your privacy, reclaimed.",
];

const ACTION_PHRASES = [
  "Ready to cross over?",
  "Click to initiate.",
  "Let's get you inside.",
  "Signal received.",
];

const INPUT_PHRASES = [
  "Fill your details.",
  "Enter your email ID.",
  "I need your credentials.",
  "Who goes there? Type it.",
];

const DISABLED_PHRASES = [
  "Locked for now.",
  "That path is blocked.",
  "Not ready yet.",
];

function pickRandom(items: string[]): string {
  return items[Math.floor(Math.random() * items.length)] ?? "";
}

function parsePhrases(source: string | null): string[] {
  if (!source) {
    return [];
  }

  return source
    .split("||")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMood(value: string | null): ReaperMood | null {
  if (!value) {
    return null;
  }

  switch (value.trim()) {
    case "default":
    case "happy":
    case "sad":
    case "confused":
      return value.trim() as ReaperMood;
    default:
      return null;
  }
}

function parseZoom(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function zoomFromValue(value: number): ReaperZoom {
  if (value >= 1.3) {
    return "high";
  }

  if (value >= 1.15) {
    return "mid";
  }

  return "base";
}

function isFormField(target: HTMLElement): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function isDisabledElement(target: HTMLElement): boolean {
  if (target instanceof HTMLButtonElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target.disabled;
  }

  return target.getAttribute("aria-disabled") === "true";
}

function resolveHoverConfig(target: HTMLElement): HoverConfig {
  const explicitPhrases = parsePhrases(target.dataset.reaperPhrases ?? null);
  const explicitMood = parseMood(target.dataset.reaperExpression ?? null);
  const explicitZoom = parseZoom(target.dataset.reaperZoom ?? null);

  if (explicitMood || explicitZoom || explicitPhrases.length > 0) {
    return {
      mood: explicitMood ?? DEFAULT_MOOD,
      zoom: zoomFromValue(explicitZoom ?? (explicitMood === "thinking" || explicitMood === "happy" ? 1.35 : 1)),
      phrases: explicitPhrases,
    };
  }

  if (isDisabledElement(target)) {
    return {
      mood: "confused",
      zoom: "high",
      phrases: DISABLED_PHRASES,
    };
  }

  if (isFormField(target)) {
    return {
      mood: "thinking",
      zoom: "high",
      phrases: INPUT_PHRASES,
    };
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "button" || tagName === "a" || target.getAttribute("role") === "button") {
    return {
      mood: "happy",
      zoom: "high",
      phrases: ACTION_PHRASES,
    };
  }

  return {
    mood: "happy",
    zoom: "mid",
    phrases: HEADLINE_PHRASES,
  };
}

export function ReaperCursor({ enabled = true }: { enabled?: boolean }) {
  const trackerRef = useRef<HTMLDivElement>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);

  const [isVisible, setIsVisible] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [mood, setMood] = useState<ReaperMood>(DEFAULT_MOOD);
  const [zoom, setZoom] = useState<ReaperZoom>(DEFAULT_ZOOM);
  const [isFacingLeft, setIsFacingLeft] = useState(false);
  const [bubbleSide, setBubbleSide] = useState<"top" | "bottom">("top");
  const [showNativeCursor, setShowNativeCursor] = useState(false);

  const lastX = useRef(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestMousePos = useRef({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 });
  const canRender = useMemo(() => {
    if (!enabled || typeof window === "undefined") {
      return false;
    }

    if (typeof window.matchMedia !== "function") {
      return true;
    }

    return !window.matchMedia("(pointer: coarse)").matches;
  }, [enabled]);

  useLayoutEffect(() => {
    if (!canRender) {
      document.documentElement.classList.remove("hide-native-cursor");
      setIsVisible(false);
      return;
    }

    if (showNativeCursor) {
      document.documentElement.classList.remove("hide-native-cursor");
    } else {
      document.documentElement.classList.add("hide-native-cursor");
    }
    setIsVisible(true);

    if (trackerRef.current) {
      trackerRef.current.style.transition = "none";
      trackerRef.current.style.transform = `translate(${latestMousePos.current.x}px, ${latestMousePos.current.y}px)`;
      trackerRef.current.style.opacity = "1";
      trackerRef.current.getBoundingClientRect();
      trackerRef.current.style.transition = "transform 0.08s ease-out, opacity 0.18s ease-out";
    }

    return () => {
      document.documentElement.classList.remove("hide-native-cursor");
    };
  }, [canRender, showNativeCursor]);

  useEffect(() => {
    if (!canRender) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - lastX.current;
      if (Math.abs(deltaX) > 2) {
        setIsFacingLeft(deltaX < 0);
      }
      lastX.current = event.clientX;

      latestMousePos.current = { x: event.clientX, y: event.clientY };
      if (trackerRef.current) {
        trackerRef.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      }
      setIsVisible((previous) => (previous ? previous : true));

      // Check collision for bubble
      if (event.clientY < 250) {
        setBubbleSide("bottom");
      } else {
        setBubbleSide("top");
      }

      // Autonomous chatter timer reset
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!activeTargetRef.current && isVisible) {
          setBubbleText(pickRandom(AUTONOMOUS_PHRASES));
          setBubbleVisible(true);
          setMood("thinking");
          setTimeout(() => {
            setBubbleVisible(false);
            setMood(DEFAULT_MOOD);
          }, 3000);
        }
      }, DEFAULT_REAPER_IDLE_TIME);
    };

    const handleOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const hoverTarget = target.closest<HTMLElement>(HOVERABLE_SELECTOR);
      if (!hoverTarget || activeTargetRef.current === hoverTarget) {
        return;
      }

      activeTargetRef.current = hoverTarget;
      const config = resolveHoverConfig(hoverTarget);
      setMood(config.mood);
      setZoom(config.zoom);

      if (config.phrases.length > 0) {
        setBubbleText(pickRandom(config.phrases));
        setBubbleVisible(true);
      } else {
        setBubbleVisible(false);
      }
    };

    const handleOut = (event: MouseEvent) => {
      const activeTarget = activeTargetRef.current;
      if (!activeTarget) {
        return;
      }

      const fromTarget = event.target as Node | null;
      if (!fromTarget || !activeTarget.contains(fromTarget)) {
        return;
      }

      const toTarget = event.relatedTarget as Node | null;
      if (toTarget && activeTarget.contains(toTarget)) {
        return;
      }

      activeTargetRef.current = null;
      setBubbleVisible(false);

      if (isFormField(activeTarget)) {
        const rawValue = String(activeTarget.value ?? "").trim();
        if (rawValue.length > 0 && rawValue.length < 6) {
          setMood("sad");
          setZoom("high");
          return;
        }
      }

      setMood(DEFAULT_MOOD);
      setZoom(DEFAULT_ZOOM);
    };

    const handleWindowBlur = () => {
      activeTargetRef.current = null;
      setBubbleVisible(false);
      setMood(DEFAULT_MOOD);
      setZoom(DEFAULT_ZOOM);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "u") {
        return;
      }

      event.preventDefault();
      setShowNativeCursor((previous) => !previous);
    };

    document.addEventListener("mousemove", handleMove, { passive: true });
    document.addEventListener("mouseover", handleOver);
    document.addEventListener("mouseout", handleOut);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseover", handleOver);
      document.removeEventListener("mouseout", handleOut);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown);
      activeTargetRef.current = null;
    };
  }, [canRender]);

  if (!canRender) {
    return null;
  }

  const nativeCursorOffsetX = isFacingLeft ? NATIVE_CURSOR_GAP_OFFSET_X_FLIPPED : NATIVE_CURSOR_GAP_OFFSET_X;
  const shellTransform = `${showNativeCursor ? `translate(${nativeCursorOffsetX}px, ${NATIVE_CURSOR_GAP_OFFSET_Y}px) ` : ""}${isFacingLeft ? "scaleX(-1)" : "scaleX(1)"}`;

  return (
    <div
      ref={trackerRef}
      className={`reaper-cursor-root${isVisible ? " is-visible" : ""}`}
      aria-hidden="true"
      style={{
        opacity: isVisible ? undefined : 0,
        transition: 'opacity 0.2s ease-in-out',
        zIndex: 99999
      }}
    >
      <div
        className={`reaper-cursor-shell bubble-side-${bubbleSide}`}
        style={{
          transform: shellTransform,
          transition: "transform 0.2s ease-out",
        }}
      >
        <div className={`reaper-cursor-bubble${bubbleVisible ? "" : " hidden"}`}>
          <div className="bubble-content" style={{ transform: isFacingLeft ? 'scaleX(-1)' : 'scaleX(1)' }}>{bubbleText}</div>
        </div>
        <img
          src={MOOD_IMAGE_MAP[mood]}
          alt=""
          className={`reaper-cursor-image reaper-cursor-zoom-${zoom}`}
          loading="eager"
          decoding="async"
        />
      </div>
    </div>
  );
}
