import { motion } from "motion/react";
import { PressureText } from "./PressureText";

export function ProcessFlowSection() {
  const drawLine = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: (i: number) => {
      const delay = 0.5 + i * 0.15;
      return {
        pathLength: 1,
        opacity: 1,
        transition: {
          pathLength: { delay, type: "tween", duration: 1, ease: "easeOut" },
          opacity: { delay, duration: 0.1 }
        }
      };
    }
  };

  const agents = [
    {
      title: "The Sleuth Agent",
      role: "Reconnaissance Specialist",
      desc: "Executes web scraping and proxy rotation, navigating the clear and dark web to find footprints of your data.",
      color: "#fbc387", // Orange/Gold
      svg: (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          {/* Magnifying Glass */}
          <motion.circle custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} cx="40" cy="40" r="25" fill="none" stroke="#333" strokeWidth="6" />
          <motion.path custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 58 58 L 85 85" fill="none" stroke="#333" strokeWidth="8" strokeLinecap="round" />
          {/* Glare */}
          <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 25 30 Q 30 20 45 25" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )
    },
    {
      title: "The Legal Agent",
      role: "Compliance Expert",
      desc: "Drafts highly specific, legally binding takedown requests tailored to your jurisdiction (e.g., DPDP Act 2023 or GDPR Article 17).",
      color: "#ff7f99", // Pink
      svg: (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          {/* Gavel */}
          <motion.rect custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} x="35" y="20" width="40" height="20" rx="4" fill="none" stroke="#333" strokeWidth="6" transform="rotate(20, 55, 30)" />
          <motion.path custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 55 30 L 30 80" fill="none" stroke="#333" strokeWidth="8" strokeLinecap="round" transform="rotate(20, 55, 30)" />
          {/* Sound block */}
          <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 10 90 L 50 90 M 15 80 L 45 80" fill="none" stroke="#333" strokeWidth="6" strokeLinecap="round" />
        </svg>
      )
    },
    {
      title: "The Comms Agent",
      role: "Front-line Fighter",
      desc: "Manages outbound emails and actively monitors the inbox to fight automated legal battles and squash data broker resistance.",
      color: "#a8a5f0", // Purple
      svg: (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          {/* Shield/Bot */}
          <motion.path custom={0} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 20 20 L 80 20 M 20 20 Q 20 80 50 90 M 80 20 Q 80 80 50 90" fill="none" stroke="#333" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <motion.path custom={1} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 50 20 L 50 90" fill="none" stroke="#333" strokeWidth="4" strokeDasharray="5,5" />
          {/* Enveloper letter inside shield */}
          <motion.path custom={2} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 35 40 L 65 40 L 65 60 L 35 60 Z" fill="none" stroke="#333" strokeWidth="4" strokeLinejoin="round" />
          <motion.path custom={3} variants={drawLine} initial="hidden" whileInView="visible" viewport={{ once: true }} d="M 35 40 L 50 50 L 65 40" fill="none" stroke="#333" strokeWidth="4" />
        </svg>
      )
    }
  ];

  return (
    <section id="agents" style={{ backgroundColor: "transparent", padding: "0 24px 100px", position: "relative", zIndex: 5 }}>
      
      <div style={{ maxWidth: "1160px", margin: "0 auto", textAlign: "center", marginBottom: "60px" }}>
        <PressureText
          as="h2"
          variant="strong"
          className="paper-text"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          style={{
            fontFamily: "'Dancing Script', cursive",
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            display: "block"
          }}
        >
          Multi-Agent <span style={{ color: "#25B876" }}>Architecture</span>
        </PressureText>
        <PressureText
          as="p"
          variant="lite"
          className="paper-text"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: "24px",
            maxWidth: "700px",
            margin: "20px auto 0",
            lineHeight: 1.4,
            display: "block"
          }}
        >
          The backend is powered by a robust, orchestrator-driven network of specialized LLM agents. They work autonomously to map and destroy your digital footprint.
        </PressureText>
      </div>

      <div style={{ maxWidth: "1160px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "40px" }}>
        {agents.map((agent, index) => {
          const getReaperData = () => {
            if (agent.title.includes("Sleuth")) {
              return {
                expression: "thinking",
                phrases: "He's my best scout. Found things even I missed.||Scanning the shadows...||No proxy can hide from him.||He's the eyes of the operation."
              };
            }
            if (agent.title.includes("Legal")) {
              return {
                expression: "thinking",
                phrases: "Boring, but effective. He's got a lawyer's cold heart.||Filing the digital lawsuits.||The law is a scythe in his hands.||He speaks fluent 'fine print'."
              };
            }
            return {
              expression: "happy",
              phrases: "He loves a good argument. Squashing broker resistance.||Inbox combat in progress.||Fighting the good fight.||Deleting their emails is his hobby."
            };
          };

          const reaperData = getReaperData();

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: index * 0.2 }}
              className="hand-drawn-card"
              data-reaper-expression={reaperData.expression}
              data-reaper-phrases={reaperData.phrases}
              style={{
                padding: "40px 32px",
                backgroundColor: "rgba(255,255,255,0.4)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center"
              }}
            >
              <div style={{ width: "120px", height: "120px", marginBottom: "24px", backgroundColor: "#fff", borderRadius: "50%", padding: "20px", border: "3px solid #333", boxShadow: "4px 4px 0 rgba(0,0,0,0.2)" }}>
                {agent.svg}
              </div>
              
              <PressureText as="h3" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "2rem", marginBottom: "8px", display: "block" }}>
                {agent.title}
              </PressureText>
              
              <div style={{ backgroundColor: "rgba(255,255,255,0.6)", padding: "4px 12px", borderRadius: "100px", border: "1.5px solid #333", marginBottom: "20px" }}>
                <PressureText as="span" variant="lite" className="paper-text" style={{ fontSize: "16px", letterSpacing: "0.05em", textTransform: "uppercase", display: "block" }}>
                  {agent.role}
                </PressureText>
              </div>

              <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "20px", lineHeight: 1.4, fontWeight: 500, margin: 0 }}>
                {agent.desc}
              </PressureText>
            </motion.div>
          );
        })}
      </div>

    </section>
  );
}