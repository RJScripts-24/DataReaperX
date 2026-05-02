import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { PressureText } from "./PressureText";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section
      className="hand-drawn-border"
      style={{
        overflow: "hidden",
        position: "relative",
        zIndex: 10,
        marginBottom: "-60px",
        paddingTop: "222px",
        paddingBottom: 0,
      }}
    >
      {/* Grid lines overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          top: "-100%",
          pointerEvents: "none",
          backgroundColor: "transparent",
          backgroundImage:
            "linear-gradient(90deg, hsla(0,0%,100%,0.08) 1px, transparent 0)",
          backgroundRepeat: "repeat-x",
          backgroundSize: "8.333% 100%",
        }}
      />

      {/* Text content container */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          paddingTop: "16px",
          maxWidth: "1160px",
          margin: "0 auto",
          textAlign: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
        }}
      >
        <motion.h1
          data-reaper-expression="happy"
          data-reaper-zoom="1.35"
          data-reaper-phrases="Welcome sir!||Search, destroy, reclaim.||Signal locked on your identity footprint.||The hunt begins here."
          style={{
            marginBottom: "26px",
          }}
        >
          <PressureText
            variant="strong"
            as="span"
            className="paper-text"
            style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: "clamp(2.1875rem, calc(-0.29412rem + 8.27vw), 5rem)",
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
              display: "block",
            }}
          >
            Search.{" "}
            <span style={{ color: "#a8a5f0" }}>Destroy.</span> Reclaim your{" "}
            <span style={{ color: "#a8a5f0" }}>identity.</span>
          </PressureText>
        </motion.h1>

        <motion.div
          style={{
            maxWidth: "558px",
            margin: "0 auto",
          }}
        >
          <PressureText
            as="p"
            variant="lite"
            className="paper-text"
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "22px",
              lineHeight: 1.4,
              fontWeight: 400,
            }}
          >
            DataReaper is an autonomous, multi-agent AI system designed as your personal privacy "Search & Destroy" unit. It forces brokers to delete your data via automated legal battles.
          </PressureText>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          style={{ marginTop: "32px", display: "flex", justifyContent: "center" }}
        >
          <button
            onClick={() => navigate("/onboarding")}
            className="group hand-drawn-button"
            data-reaper-expression="happy"
            data-reaper-zoom="1.35"
            data-reaper-phrases="Ready to cross over?||Click to initiate.||Let's get you inside.||All agents standing by."
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              fontSize: "18px",
              padding: "15px 48px",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <PressureText variant="medium" className="paper-text" style={{ fontFamily: "'Patrick Hand', cursive" }}>
              Initialize Screening
            </PressureText>
            <svg
              width="11"
              height="11"
              viewBox="0 0 11 11"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ filter: "url(#pencil-sketch)" }}
            >
              <path
                d="M9.32553 2.69477H9.34054C9.75528 2.71294 10.0799 3.05816 10.0736 3.4729V10.2502C10.0728 10.6634 9.7387 10.9983 9.32553 10.9999H2.54441C2.12967 11.0062 1.78445 10.6815 1.76627 10.2668C1.76232 10.0653 1.83974 9.87179 1.98036 9.728C2.12097 9.58422 2.31372 9.50364 2.51438 9.50364H6.51174C6.6808 9.50364 6.83407 9.40173 6.89884 9.24533C6.96362 9.08891 6.92728 8.90879 6.8072 8.78951L0.218809 2.19949C0.0766144 2.05809 -0.00239468 1.86455 -8.58307e-06 1.6639C0.0015707 1.46324 0.0837278 1.27128 0.228293 1.13224C0.534801 0.851015 1.0088 0.865232 1.29793 1.16305L7.86975 7.73102C7.98982 7.8511 8.16994 7.88744 8.32635 7.82187C8.48277 7.75709 8.58466 7.60384 8.58388 7.43477V3.43902C8.58625 3.02982 8.91645 2.69801 9.32567 2.69486L9.32553 2.69477Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </motion.div>
      </div>

      {/* Hero illustration area */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          marginTop: "-264px",
        }}
      >
        <img
          src="/images/hero-mast.png"
          alt=""
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            objectFit: "contain",
            transform: "translateY(1px) translateZ(0)",
            filter: "url(#pencil-sketch) contrast(1.1) saturate(0.8)",
            opacity: 0.9,
          }}
        />

        {/* Floating caveman */}
        <motion.div
          style={{
            position: "absolute",
            left: "7vw",
            top: "11vw",
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <img
            src="/images/hero-caveman.png"
            alt="Character in dome"
            style={{
              width: "17vw",
              maxWidth: "17rem",
              height: "auto",
              filter: "url(#pencil-sketch-heavy) contrast(1.1) saturate(0.8)",
            }}
          />
        </motion.div>

        {/* Floating newton */}
        <motion.div
          className="hidden md:block"
          style={{
            position: "absolute",
            left: "34vw",
            top: "20vw",
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        >
          <img
            src="/images/hero-newton.png"
            alt="Character in dome"
            style={{
              width: "17vw",
              maxWidth: "17rem",
              height: "auto",
              filter: "url(#pencil-sketch-heavy) contrast(1.1) saturate(0.8)",
            }}
          />
        </motion.div>

        {/* Floating astronaut */}
        <motion.div
          style={{
            position: "absolute",
            right: "15vw",
            top: "13vw",
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{
            duration: 4.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        >
          <img
            src="/images/hero-astronaut.png"
            alt="Character in dome"
            style={{
              width: "22vw",
              maxWidth: "22rem",
              height: "auto",
              filter: "url(#pencil-sketch-heavy) contrast(1.1) saturate(0.8)",
            }}
          />
        </motion.div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          section:first-of-type {
            padding-top: 96px !important;
            border-bottom-left-radius: 30px !important;
            border-bottom-right-radius: 30px !important;
            margin-bottom: -30px !important;
          }
        }
      `}</style>
    </section>
  );
}