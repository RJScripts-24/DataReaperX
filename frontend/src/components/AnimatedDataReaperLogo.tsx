import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "motion/react";

const LOGO_ANIMATION_LOOP_MS = 15000;

const glowVariants = {
  initial: { opacity: 0, scale: 0.8 },
  spinning: {
    opacity: 1,
    scale: 1.2,
    transition: { duration: 0.6, ease: "easeOut" },
  },
  done: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

const logoVariants = {
  initial: { rotateY: 0, scale: 1 },
  spinning: {
    rotateY: 360,
    scale: 1.1,
    transition: { duration: 1.2, ease: "easeInOut" },
  },
  done: {
    rotateY: 0,
    scale: 1,
    transition: { duration: 0 },
  },
};

type AnimatedDataReaperLogoProps = {
  width?: number;
  height?: number;
  initialDelayMs?: number;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
};

export function AnimatedDataReaperLogo({
  width = 104,
  height = 60,
  initialDelayMs = 0,
  style,
  imageStyle,
}: AnimatedDataReaperLogoProps) {
  const [animState, setAnimState] = useState<"initial" | "spinning" | "done">("initial");

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startTimer = setTimeout(() => {
      setAnimState("spinning");
      intervalId = setInterval(() => {
        setAnimState("spinning");
      }, LOGO_ANIMATION_LOOP_MS);
    }, initialDelayMs);

    return () => {
      clearTimeout(startTimer);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [initialDelayMs]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: `${width}px`,
        height: `${height}px`,
        perspective: "600px",
        ...style,
      }}
    >
      <motion.div
        variants={glowVariants}
        initial="initial"
        animate={animState}
        style={{
          position: "absolute",
          width: "80%",
          height: "80%",
          background: "radial-gradient(circle, rgba(168,85,247,0.8), transparent 70%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <motion.div
        variants={logoVariants}
        initial="initial"
        animate={animState}
        onAnimationComplete={() => {
          if (animState === "spinning") {
            setAnimState("done");
          }
        }}
        style={{ position: "relative", zIndex: 1, willChange: "transform" }}
      >
        <img
          src="/images/logo.png"
          alt="DataReaper logo"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            objectFit: "contain",
            flexShrink: 0,
            ...imageStyle,
          }}
        />
      </motion.div>
    </div>
  );
}
