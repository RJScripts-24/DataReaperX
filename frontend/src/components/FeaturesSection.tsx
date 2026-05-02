import { motion } from "motion/react";
import { PressureText } from "./PressureText";

export function FeaturesSection() {
  const dashboardFeatures = [
    {
      title: "Live Radar Interface",
      description: "As the Sleuth Agent uncovers your data across broker sites, visual 'threats' ping autonomously on a live radar map.",
      icon: (
        <svg viewBox="0 0 100 100" width="80px" height="80px" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#2b2b2b" strokeWidth="2" strokeDasharray="5,5" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="#2b2b2b" strokeWidth="2" strokeDasharray="5,5" />
          <circle cx="50" cy="50" r="10" fill="#2b2b2b" />
          <path d="M 50 50 L 80 20" stroke="#25B876" strokeWidth="4" strokeLinecap="round" />
          <circle cx="70" cy="30" r="6" fill="#ff4a4a" />
        </svg>
      )
    },
    {
      title: "The Pivot Tree",
      description: "A dynamic visual graph showing you exactly how the AI connected a single starting email into a massive web of identity footprints.",
      icon: (
        <svg viewBox="0 0 100 100" width="80px" height="80px" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          <line x1="50" y1="80" x2="50" y2="40" stroke="#2b2b2b" strokeWidth="4" />
          <line x1="50" y1="40" x2="20" y2="20" stroke="#2b2b2b" strokeWidth="3" />
          <line x1="50" y1="40" x2="80" y2="20" stroke="#2b2b2b" strokeWidth="3" />
          <circle cx="50" cy="80" r="8" fill="#a8a5f0" />
          <circle cx="20" cy="20" r="12" fill="#fbc387" />
          <circle cx="80" cy="20" r="12" fill="#fcd73a" />
        </svg>
      )
    },
    {
      title: "Live Battle Viewer",
      description: "A side-panel chat interface that lets you sit back and watch the live email thread unfold in real-time as your Comms Agent verbally spars with broker support bots.",
      icon: (
        <svg viewBox="0 0 100 100" width="80px" height="80px" style={{ filter: "url(#pencil-sketch)", overflow: "visible" }}>
          <rect x="10" y="20" width="50" height="40" rx="8" fill="#fff" stroke="#2b2b2b" strokeWidth="3" />
          <line x1="20" y1="35" x2="50" y2="35" stroke="#2b2b2b" strokeWidth="3" />
          <line x1="20" y1="45" x2="40" y2="45" stroke="#2b2b2b" strokeWidth="3" />
          <rect x="40" y="40" width="50" height="40" rx="8" fill="#C4FAE2" stroke="#2b2b2b" strokeWidth="3" />
          <line x1="50" y1="55" x2="80" y2="55" stroke="#2b2b2b" strokeWidth="3" />
          <line x1="50" y1="65" x2="70" y2="65" stroke="#2b2b2b" strokeWidth="3" />
        </svg>
      )
    }
  ];

  const techStack = [
    { cat: "Backend API", tech: "FastAPI / Uvicorn / Pydantic" },
    { cat: "Workers", tech: "ARQ / Redis / APScheduler" },
    { cat: "Data Layer", tech: "SQLAlchemy / Postgres / Alembic" },
    { cat: "OSINT", tech: "Maigret / Trafilatura / curl-cffi" },
    { cat: "Automation", tech: "Playwright / SeleniumBase / BeautifulSoup" },
    { cat: "Comms", tech: "Gmail API / Google OAuth" },
    { cat: "LLM + Triage", tech: "Groq / structured legal templates" },
    { cat: "Frontend", tech: "React / Vite / Tailwind CSS / TanStack Query" }
  ];

  return (
    <section style={{ backgroundColor: "transparent", borderTop: "2px dashed rgba(0,0,0,0.15)", paddingTop: "100px", paddingBottom: "100px" }}>
      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 48px" }}>
        
        {/* Top Segment: Dashboard */}
        <div style={{ marginBottom: "100px" }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-10"
          >
            <PressureText
              as="h2"
              variant="strong"
              className="paper-text"
              style={{
                fontFamily: "'Dancing Script', cursive",
                fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: "40px",
                display: "block"
              }}
            >
              🖥️ The <span style={{ color: "#6360D8" }}>"Privacy Shield"</span> Dashboard
            </PressureText>
          </motion.div>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "40px" }}>
            {dashboardFeatures.map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="hand-drawn-card"
                style={{ padding: "40px 32px", textAlign: "center", backgroundColor: "#fff" }}
                data-reaper-expression={i === 0 ? "surprised" : (i === 1 ? "thinking" : "happy")}
                data-reaper-zoom="1.3"
                data-reaper-phrases={
                  i === 0 ? "Pings! I love high pings.||Targets detected on the radar.||Look at them squirm." :
                  (i === 1 ? "Connecting the dots...||A massive web of lies.||I can see the root of this tree." :
                  "Watch me win.||The Comms Agent is a beast.||Negotiating their surrender.")
                }
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "24px" }}>
                  {feat.icon}
                </div>
                <PressureText as="h3" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.75rem", marginBottom: "16px", display: "block" }}>
                  {feat.title}
                </PressureText>
                <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "18px", lineHeight: 1.4, margin: 0 }}>
                  {feat.description}
                </PressureText>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom Segment: Tech Stack */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="hand-drawn-border"
          style={{ padding: "60px", borderRadius: "24px", borderTop: "2px dashed rgba(0,0,0,0.1)" }}
        >
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <PressureText as="h2" variant="strong" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "3rem", marginBottom: "16px", display: "block" }}>
              The Actual DataReaper Stack
            </PressureText>
            <PressureText as="p" variant="lite" className="paper-text" style={{ fontFamily: "'Caveat', cursive", fontSize: "20px", maxWidth: "600px", margin: "0 auto", opacity: 0.9 }}>
              DataReaper runs on a Python API, Redis-backed workers, OSINT collectors, browser automation, Gmail-based outreach, and a React command center with only a few targeted external APIs in the loop.
            </PressureText>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "24px" }}>
            {techStack.map((item, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px", borderBottom: "1px dashed rgba(255,255,255,0.2)", paddingBottom: "16px" }}>
                <PressureText as="span" variant="lite" className="paper-text" style={{ fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#6360D8", display: "block" }}>
                  {item.cat}
                </PressureText>
                <PressureText as="span" variant="medium" className="paper-text" style={{ fontSize: "20px", fontWeight: 700, display: "block" }}>
                  {item.tech}
                </PressureText>
              </div>
            ))}
          </div>

        </motion.div>

      </div>
    </section>
  );
}
