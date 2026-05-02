import { motion } from "motion/react";
import { PressureText } from "./PressureText";

export function PrivacyEngineSection() {
  const drawLine = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => {
      const delay = 0.5 + i * 0.15;
      return {
        pathLength: 1,
        opacity: 1,
        transition: {
          pathLength: { delay, type: "tween", duration: 0.8, ease: "easeOut" },
          opacity: { delay, duration: 0.1 }
        }
      };
    }
  };

  const steps = [
    { title: "1. The Seed", desc: "You input a single email (e.g., john.doe@gmail.com) or phone number to anchor the search." },
    { title: "2. The Email Pivot", desc: "The system checks 120+ major websites for accounts registered to that specific email." },
    { title: "3. The Username Pivot", desc: "Extracting usernames from discovered accounts, the AI searches 300+ additional platforms." },
    { title: "4. Identity Assembly", desc: "The agent aggregates scraped public profiles to compile real names, locations, and employer data." },
    { title: "5. Target Acquisition", desc: "The fully assembled identity is cross-referenced against known data broker directories (Whitepages, ZoomInfo) to pinpoint exact exposed listings." }
  ];

  return (
    <section id="engine" style={{ backgroundColor: "transparent", padding: "0 24px", position: "relative", zIndex: 5 }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        style={{ maxWidth: "1160px", margin: "0 auto", padding: "120px 24px 80px", textAlign: "center" }}
      >
        <PressureText
          as="h2"
          variant="strong"
          className="paper-text"
          style={{
            fontFamily: "'Dancing Script', cursive",
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            display: "block"
          }}
        >
          💡 The "Data Pivot" <span style={{ color: "#6360D8" }}>AI Engine</span>
        </PressureText>
      </motion.div>

      <div
        className="product-card-fabric hand-drawn-border"
        style={{
          maxWidth: "1160px",
          margin: "0 auto 40px",
          backgroundColor: "#EEEAFF",
          borderRadius: "24px",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: "600px",
        }}
      >
        {/* Left Column: Flow Text */}
        <div style={{ padding: "56px 48px", borderRight: "2px dashed rgba(0,0,0,0.15)" }}>
          <PressureText as="h3" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "2rem", marginBottom: "32px", display: "block" }}>
            How it works:
          </PressureText>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {steps.map((step, index) => (
              <motion.div 
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}
              >
                <div style={{ 
                  flexShrink: 0, 
                  width: "36px", height: "36px", 
                  backgroundColor: "#6360D8", 
                  color: "#fff", 
                  borderRadius: "50%", 
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "18px", fontWeight: 700,
                  fontFamily: "'Patrick Hand', cursive",
                  border: "2px solid #333",
                  boxShadow: "2px 2px 0 #333"
                }}>
                  {index + 1}
                </div>
                <div>
                  <PressureText as="h4" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.4rem", margin: "0 0 8px 0", display: "block" }}>
                    {step.title}
                  </PressureText>
                  <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "18px", margin: 0, opacity: 0.85, lineHeight: 1.4 }}>
                    {step.desc}
                  </PressureText>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Column: Animated Pivot Tree SVG */}
        <div style={{ padding: "40px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fdfbf7" }}>
          <svg viewBox="0 0 500 600" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
            {/* The initial Seed (Top) */}
            <motion.rect custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} x="200" y="40" width="100" height="60" rx="10" fill="#fff" stroke="#333" strokeWidth="3" />
            <motion.path custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 200 40 L 250 80 L 300 40" fill="none" stroke="#333" strokeLinejoin="round" strokeWidth="3" />
            
            {/* Main Trunk */}
            <motion.path custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 250 100 L 250 180" fill="none" stroke="#6360D8" strokeWidth="4" />

            {/* Email Pivot Branches */}
            <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 250 180 L 150 240 M 250 180 L 350 240 M 250 180 L 250 260" fill="none" stroke="#6360D8" strokeWidth="3" />
            
            {/* Email Nodes */}
            <motion.circle custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="150" cy="240" r="20" fill="#fcd73a" stroke="#333" strokeWidth="2" />
            <motion.circle custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="350" cy="240" r="20" fill="#fcd73a" stroke="#333" strokeWidth="2" />
            <motion.circle custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="250" cy="260" r="25" fill="#fcd73a" stroke="#333" strokeWidth="2" />

            {/* Username Pivot Branches */}
            <motion.path custom={4} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 150 260 L 80 340 M 150 260 L 170 350" fill="none" stroke="#6360D8" strokeWidth="2" strokeDasharray="6,4"/>
            <motion.path custom={4} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 350 260 L 420 340 M 350 260 L 330 350" fill="none" stroke="#6360D8" strokeWidth="2" strokeDasharray="6,4"/>
            <motion.path custom={4} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 250 285 L 200 370 M 250 285 L 300 370" fill="none" stroke="#6360D8" strokeWidth="2" strokeDasharray="6,4"/>

            {/* Assembly Connections */}
            <motion.path custom={5} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 80 360 L 220 480 M 170 370 L 230 480 M 200 390 L 250 480" fill="none" stroke="#333" strokeWidth="2" opacity="0.5"/>
            <motion.path custom={5} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 420 360 L 280 480 M 330 370 L 270 480 M 300 390 L 250 480" fill="none" stroke="#333" strokeWidth="2" opacity="0.5"/>

            {/* Final Target Node (Broker) */}
            <motion.rect custom={6} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} x="180" y="480" width="140" height="80" rx="15" fill="#ff7f99" stroke="#333" strokeWidth="4" />
            <motion.path custom={7} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 210 520 L 230 540 L 280 500" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      
      <style>{`
        @media (max-width: 968px) {
          .product-card-fabric { grid-template-columns: 1fr !important; border-right: none !important; }
          .product-card-fabric > div:first-child { border-right: none !important; border-bottom: 2px dashed rgba(0,0,0,0.15); }
        }
      `}</style>
    </section>
  );
}