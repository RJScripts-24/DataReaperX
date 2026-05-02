export function Footer() {
  const productLinks = [
    { label: "Data Pivot Engine", href: "#" },
    { label: "Multi-Agent AI", href: "#" },
    { label: "Privacy Shield Dashboard", href: "#" },
  ];

  const companyLinks = [
    { label: "About DataReaper", href: "#" },
    { label: "GitHub Architecture", href: "#" },
    { label: "Documentation", href: "#" },
  ];

  const resourceLinks = [
    { label: "OSINT Tools", href: "#" },
    { label: "DPDP Guidelines", href: "#" },
    { label: "GDPR Rights", href: "#" },
    { label: "Threat Map Analysis", href: "#" },
  ];

  return (
    <footer
      className="pencil-fill-dark"
      style={{
        padding: "80px 24px 40px",
      }}
    >
      <div style={{ maxWidth: "1160px", margin: "0 auto" }}>
        {/* Top: Logo + Link Columns */}
        <div className="footer-grid-v2" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "48px", marginBottom: "60px" }}>
          {/* Logo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <svg width="26" height="26" viewBox="0 0 30 30" fill="none" style={{ filter: "url(#pencil-sketch)" }}>
                <circle cx="15" cy="15" r="13" stroke="rgba(168,165,240,0.6)" strokeWidth="1.5" />
                <circle cx="15" cy="15" r="7" stroke="rgba(168,165,240,0.4)" strokeWidth="1" />
                <circle cx="15" cy="15" r="2.5" fill="#a8a5f0" />
              </svg>
              <span className="pencil-heading-light" style={{ fontSize: "22px", fontWeight: 700 }}>
                DataReaper
              </span>
            </div>
            <p 
              className="pencil-text-light" 
              style={{ fontSize: "16px", lineHeight: 1.6, maxWidth: "240px" }}
              data-reaper-expression="happy"
              data-reaper-phrases="I'll be seeing you.||Keep your data clean.||Your privacy is my prize."
            >
              An autonomous, multi-agent AI system designed to be your personal privacy "Search & Destroy" unit.
            </p>
          </div>

          {/* Product (Features) */}
          <div>
            <h4 className="pencil-text-light" style={{ fontSize: "14px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px" }}>Features</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {productLinks.map((link, i) => (
                <a key={i} href={link.href} className="pencil-text-light" style={{ fontSize: "16px", textDecoration: "none", transition: "color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#a8a5f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                >{link.label}</a>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="pencil-text-light" style={{ fontSize: "14px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px" }}>Development</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {companyLinks.map((link, i) => (
                <a key={i} href={link.href} className="pencil-text-light" style={{ fontSize: "16px", textDecoration: "none", transition: "color 0.2s", display: "flex", alignItems: "center", gap: "8px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#a8a5f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="pencil-text-light" style={{ fontSize: "14px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "20px" }}>Resources</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {resourceLinks.map((link, i) => (
                <a key={i} href={link.href} className="pencil-text-light" style={{ fontSize: "16px", textDecoration: "none", transition: "color 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#a8a5f0")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                >{link.label}</a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div 
          className="hand-drawn-border" 
          style={{ borderTop: "2px dashed rgba(255,255,255,0.25)", borderLeft: "none", borderRight: "none", borderBottom: "none", borderRadius: "0 !important", paddingTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}
          data-reaper-expression="thinking"
          data-reaper-phrases="Zzz... data clean... Zzz...||Wake me if a broker acts up.||Scanning in my dreams."
          data-reaper-zoom="1.2"
        >
          <span className="pencil-text-light" style={{ fontSize: "16px" }}>© 2026 DataReaper. 100% Free / Open-Source.</span>
          <a href="#" className="pencil-text-light" style={{ fontSize: "16px", textDecoration: "none" }}>Privacy Policy</a>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .footer-grid-v2 { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 480px) {
          .footer-grid-v2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}