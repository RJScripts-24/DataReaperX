import { motion } from "motion/react";

export function EmailBattleSection() {
  const drawLine = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => {
      const delay = 0.5 + i * 0.15;
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

  const intents = [
    {
      title: "Intent A (Success)",
      broker: '"We have removed your data."',
      action: "Agent updates the dashboard to Resolved.",
      status: "Victory",
      color: "#C4FAE2" // Greenish mint
    },
    {
      title: "Intent B (Stalling)",
      broker: '"Please fill out this 10-page form to verify your identity."',
      action: "Agent reads requirements, extracts necessary details from your assembled profile, fills it out autonomously, and returns it.",
      status: "Countered",
      color: "#fcd73a" // Yellow
    },
    {
      title: "Intent C (Illegal Pushback)",
      broker: '"We need a scanned copy of your Passport or ID card."',
      action: "Agent identifies the unlawful request and fires back an escalated legal notice, citing data minimization principles, absolutely refusing to compromise further data.",
      status: "Escalated",
      color: "#ff7f99" // Red/Pink
    }
  ];

  return (
    <section style={{ backgroundColor: "transparent", padding: "100px 24px", position: "relative", zIndex: 5 }}>
      <div style={{ maxWidth: "1160px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "60px", alignItems: "center" }}>
        
        {/* Left Col: SVG Chat Animation */}
        <div style={{ position: "relative", width: "100%", height: "500px" }}>
          <svg viewBox="0 0 400 500" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
            {/* Broker Bot Icon */}
            <motion.rect custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} x="20" y="20" width="60" height="60" rx="10" fill="#d4d8e0" stroke="#333" strokeWidth="4" />
            <motion.circle custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="40" cy="40" r="5" fill="#333" />
            <motion.circle custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="60" cy="40" r="5" fill="#333" />
            <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 40 60 L 60 60" fill="none" stroke="#333" strokeWidth="4" />
            
            {/* Broker Message Bubble */}
            <motion.path custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 100 30 L 350 30 C 360 30 370 40 370 50 L 370 100 C 370 110 360 120 350 120 L 120 120 L 100 140 L 100 30 Z" fill="#fff" stroke="#333" strokeWidth="3" strokeLinejoin="round" />
            {/* Broker scribble text */}
            <motion.path custom={4} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 120 60 L 340 60 Q 350 60 340 70 L 120 70 M 120 90 L 250 90" fill="none" stroke="#999" strokeWidth="6" strokeDasharray="10 5 20 8" />

            {/* Comms Agent Shield Icon (Right Side) */}
            <motion.path custom={5} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 320 180 L 380 180 M 320 180 Q 320 240 350 250 M 380 180 Q 380 240 350 250" fill="#a8a5f0" stroke="#333" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            
            {/* Agent Reply Bubble */}
            <motion.path custom={6} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 300 240 L 50 240 C 40 240 30 230 30 220 L 30 170 C 30 160 40 150 50 150 L 280 150 L 300 130 L 300 240 Z" fill="#C4FAE2" stroke="#333" strokeWidth="3" strokeLinejoin="round" />
            {/* Agent scribble text */}
            <motion.path custom={7} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 50 180 L 270 180 M 50 210 L 200 210" fill="none" stroke="#333" strokeWidth="6" strokeDasharray="10 5" />
            
            {/* The "Cut Through" Slash */}
            <motion.path custom={10} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 20 120 L 380 50" fill="none" stroke="#ff4a4a" strokeWidth="8" strokeDasharray="15 10" style={{ filter: "url(#pencil-sketch-heavy)" }} />
          </svg>
        </div>

        {/* Right Col: Intent Content */}
        <div>
          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="pencil-heading" 
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "32px", letterSpacing: "-0.02em" }}
          >
            The <span style={{ color: "#ff4a4a" }}>"Email Battle"</span> Workflow
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="pencil-text"
            style={{ fontSize: "18px", lineHeight: 1.7, marginBottom: "40px" }}
          >
            Data brokers rely on heavily automated support systems designed to frustrate you into giving up. Our Communications Agent uses Advanced NLP Triage to classify their responses and fight back automatically.
          </motion.p>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {intents.map((intent, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 + (index * 0.15) }}
                className="hand-drawn-border"
                style={{ padding: "24px", backgroundColor: "#fff", position: "relative" }}
              >
                {/* Status Badge */}
                <div className="hand-drawn-border" style={{ position: "absolute", top: "-15px", right: "24px", backgroundColor: intent.color, padding: "4px 16px", fontSize: "14px", fontWeight: 700, textTransform: "uppercase" }}>
                  {intent.status}
                </div>

                <h4 className="pencil-heading" style={{ fontSize: "1.5rem", marginBottom: "12px" }}>{intent.title}</h4>
                <div style={{ display: "flex", gap: "16px", marginBottom: "12px", alignItems: "flex-start" }}>
                  <div style={{ color: "#ff4a4a", fontWeight: "bold", fontSize: "20px" }}>B:</div>
                  <p className="pencil-text" style={{ fontStyle: "italic", margin: 0, color: "#666" }}>{intent.broker}</p>
                </div>
                <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                  <div style={{ color: "#6360D8", fontWeight: "bold", fontSize: "20px" }}>A:</div>
                  <p className="pencil-text" style={{ margin: 0, fontWeight: 500 }}>{intent.action}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
      
      <style>{`
        @media (max-width: 968px) {
          section#engine > div { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}