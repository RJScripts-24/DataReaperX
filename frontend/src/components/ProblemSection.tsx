import { motion } from "motion/react";
import { PressureText } from "./PressureText";

export function ProblemSection() {
  const drawLine = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => {
      const delay = 0.5 + i * 0.2;
      return {
        pathLength: 1,
        opacity: 1,
        transition: {
          pathLength: { delay, type: "spring", duration: 1.5, bounce: 0 },
          opacity: { delay, duration: 0.1 }
        }
      };
    }
  };

  return (
    <section style={{ backgroundColor: "transparent", position: "relative", zIndex: 5 }}>
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          padding: "80px 48px 100px",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
          
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7 }}
          >
            <PressureText
              as="h2"
              variant="strong"
              className="paper-text"
              style={{
                fontFamily: "'Dancing Script', cursive",
                fontSize: "clamp(2rem, 4.5vw, 3rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                marginBottom: "32px",
                display: "block"
              }}
            >
              Brokers profit off your info. <br/> Opting out is a nightmare.
            </PressureText>
            <div 
              className="hand-drawn-border" 
              style={{ padding: "24px", marginBottom: "32px", backgroundColor: "rgba(255,255,255,0.4)" }}
              data-reaper-expression="confused"
              data-reaper-zoom="1.4"
              data-reaper-phrases="I don't like these brokers.||They think they own you.||Time for a digital harvesting.||I'll slice their servers."
            >
              <PressureText as="h3" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.8rem", marginBottom: "16px", color: "#6360D8", display: "block" }}>
                ⚠️ The Problem
              </PressureText>
              <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "20px", lineHeight: 1.4, fontWeight: 400 }}>
                Data brokers constantly scrape, compile, and sell deeply personal information. For the average user, reclaiming this data is a logistical nightmare. Manually tracking down hundreds of data brokers, navigating their intentionally obfuscated opt-out processes, and sending legally binding data-deletion requests (under frameworks like GDPR or the DPDP Act) is practically a full-time job.
              </PressureText>
            </div>
            
            <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "22px", lineHeight: 1.5, fontWeight: 500 }}>
              <span style={{ color: "#a8a5f0", fontWeight: 700 }}>DataReaper</span> tackles the massive, unregulated data broker industry by continuously scouring the web for your exposed personal information and deploying a suite of AI agents to legally mandate its deletion. From initial OSINT footprinting to fighting automated legal battles in the inbox, DataReaper reclaims your privacy without requiring human intervention.
            </PressureText>
          </motion.div>

          {/* Animated SVG Graphic */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 1 }}
            style={{ position: "relative", width: "100%", height: "400px" }}
          >
            <svg viewBox="0 0 400 400" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
              {/* Web Connections */}
              <motion.path custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 200 L 100 80" stroke="#333" strokeWidth="2" strokeDasharray="5,5" fill="none" />
              <motion.path custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 200 L 320 120" stroke="#333" strokeWidth="2" strokeDasharray="5,5" fill="none" />
              <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 200 L 80 250" stroke="#333" strokeWidth="2" strokeDasharray="5,5" fill="none" />
              <motion.path custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 200 L 300 320" stroke="#333" strokeWidth="2" strokeDasharray="5,5" fill="none" />
              <motion.path custom={4} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 200 L 180 360" stroke="#333" strokeWidth="2" strokeDasharray="5,5" fill="none" />

              {/* Data Broker Nodes */}
              <motion.circle custom={5} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="100" cy="80" r="25" fill="#fbc387" stroke="#333" strokeWidth="2" />
              <motion.circle custom={6} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="320" cy="120" r="35" fill="#fcd73a" stroke="#333" strokeWidth="2" />
              <motion.circle custom={7} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="80" cy="250" r="30" fill="#e0a300" stroke="#333" strokeWidth="2" />
              <motion.circle custom={8} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="300" cy="320" r="25" fill="#ffb3c1" stroke="#333" strokeWidth="2" />
              <motion.circle custom={9} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="180" cy="360" r="20" fill="#d4d8e0" stroke="#333" strokeWidth="2" />

              {/* Central User Data Node */}
              <motion.circle custom={10} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="200" cy="200" r="45" fill="#EEEAFF" stroke="#6360D8" strokeWidth="4" />
              
              {/* User Icon inside central node */}
              <motion.path custom={11} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 185 A 12 12 0 1 0 200 209 A 12 12 0 1 0 200 185 Z" fill="none" stroke="#6360D8" strokeWidth="3" />
              <motion.path custom={11} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 175 225 Q 200 195 225 225" fill="none" stroke="#6360D8" strokeWidth="3" strokeLinecap="round" />

              {/* THE REAPER SLASH */}
              <motion.path 
                custom={14} 
                variants={drawLine} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true }} 
                d="M 350 50 Q 200 200 50 350 M 50 340 Q 200 210 360 70" 
                stroke="#ff4a4a" 
                strokeWidth="12" 
                strokeLinecap="round" 
                fill="none" 
                style={{ filter: "url(#pencil-sketch-heavy)" }}
              />
            </svg>
          </motion.div>

        </div>
      </div>
      <style>{`
        @media (max-width: 968px) {
          .ProblemSection-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}