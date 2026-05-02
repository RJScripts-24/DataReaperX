import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { PressureText } from "./PressureText";
import { useLandingResourcesQuery } from "../lib/hooks";

export function FinalCTASection() {
  const navigate = useNavigate();
  const resourcesQuery = useLandingResourcesQuery();

  const resources = resourcesQuery.data?.items ?? [];

  return (
    <>
      {/* Resources Section */}
      <section
        id="dashboard"
        style={{
          backgroundColor: "transparent",
          padding: "80px 24px 120px",
          borderTop: "2px dashed rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
          <PressureText
            as="h2"
            variant="strong"
            className="paper-text"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: "clamp(2rem, 4vw, 3.2rem)",
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: "48px",
              letterSpacing: "-0.02em",
              display: "block"
            }}
          >
            Explore the framework.
          </PressureText>

          <div className="resources-grid-v2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            {resourcesQuery.isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`resource-skeleton-${index}`}
                  className="hand-drawn-card"
                  style={{
                    display: "block",
                    overflow: "hidden",
                    minHeight: "320px",
                    background: "repeating-linear-gradient(-45deg, rgba(0,0,0,0.02), rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.04) 8px, rgba(0,0,0,0.04) 16px)",
                  }}
                />
              ))}

            {!resourcesQuery.isLoading && resourcesQuery.isError && (
              <div className="hand-drawn-card p-6" style={{ gridColumn: "1 / -1" }}>
                <PressureText as="p" variant="lite" className="paper-text text-xl" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                  Could not load resources right now.
                </PressureText>
                <button
                  type="button"
                  className="hand-drawn-button mt-3 px-4 py-2"
                  onClick={() => resourcesQuery.refetch()}
                >
                  Retry
                </button>
              </div>
            )}

            {!resourcesQuery.isLoading &&
              !resourcesQuery.isError &&
              resources.map((resource, index) => (
                <motion.a
                  key={resource.id}
                  href={resource.href}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="hand-drawn-card"
                  data-reaper-expression="thinking"
                  data-reaper-zoom="1.35"
                  data-reaper-phrases="Analyzing this route.||Intel packet identified.||This resource looks promising.||Shall I open this file?"
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textDecoration: "none",
                    transition: "transform 0.3s ease, box-shadow 0.3s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ height: "200px", overflow: "hidden" }}>
                    <img
                      src={resource.imageUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", filter: "url(#pencil-sketch) contrast(1.1) saturate(0.8)" }}
                    />
                  </div>
                  <div style={{ padding: "24px" }}>
                    <PressureText as="span" variant="lite" className="paper-text" style={{ fontSize: "14px", fontWeight: 600, color: "#2b2b2b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px", display: "block" }}>
                      {resource.tag}
                    </PressureText>
                    <PressureText as="h4" variant="medium" className="paper-text" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "20px", fontWeight: 700, color: "#2b2b2b", lineHeight: 1.4, display: "block" }}>
                      {resource.title}
                    </PressureText>
                  </div>
                </motion.a>
              ))}
          </div>
        </div>
        <style>{`
          @media (max-width: 768px) {
            .resources-grid-v2 { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      {/* Final CTA Section */}
      <section
        className="hand-drawn-border"
        style={{
          padding: "120px 24px",
          position: "relative",
          overflow: "hidden",
          borderTop: "2px dashed rgba(0,0,0,0.15)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(90deg, hsla(0,0%,100%,0.08) 1px, transparent 0)",
            backgroundRepeat: "repeat-x",
            backgroundSize: "8.333% 100%",
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center", position: "relative", zIndex: 10 }}>
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
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              fontWeight: 700,
              lineHeight: 1.05,
              marginBottom: "40px",
              letterSpacing: "-0.02em",
              display: "block"
            }}
          >
            Deploy the agents.
            <br />
            Reclaim your privacy.
          </PressureText>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            onClick={() => navigate("/onboarding")}
            className="hand-drawn-button"
            data-reaper-expression="happy"
            data-reaper-zoom="1.35"
            data-reaper-phrases="Ready to cross over?||Click to initiate.||Let's get you inside.||Full deployment starts now."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "18px",
              padding: "15px 48px",
              cursor: "pointer",
            }}
          >
            <PressureText variant="medium" className="paper-text" style={{ fontFamily: "'Patrick Hand', cursive" }}>
              Initialize Screening
            </PressureText>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ filter: "url(#pencil-sketch)" }}>
              <path d="M9.32553 2.69477H9.34054C9.75528 2.71294 10.0799 3.05816 10.0736 3.4729V10.2502C10.0728 10.6634 9.7387 10.9983 9.32553 10.9999H2.54441C2.12967 11.0062 1.78445 10.6815 1.76627 10.2668C1.76232 10.0653 1.83974 9.87179 1.98036 9.728C2.12097 9.58422 2.31372 9.50364 2.51438 9.50364H6.51174C6.6808 9.50364 6.83407 9.40173 6.89884 9.24533C6.96362 9.08891 6.92728 8.90879 6.8072 8.78951L0.218809 2.19949C0.0766144 2.05809-0.00239468 1.86455-8.58307e-06 1.6639C0.0015707 1.46324 0.0837278 1.27128 0.228293 1.13224C0.534801 0.851015 1.0088 0.865232 1.29793 1.16305L7.86975 7.73102C7.98982 7.8511 8.16994 7.88744 8.32635 7.82187C8.48277 7.75709 8.58466 7.60384 8.58388 7.43477V3.43902C8.58625 3.02982 8.91645 2.69801 9.32567 2.69486L9.32553 2.69477Z" fill="currentColor"/>
            </svg>
          </motion.button>
        </div>
      </section>
    </>
  );
}