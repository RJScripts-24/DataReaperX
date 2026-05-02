return (
  <div style={{ backgroundColor: COLORS.bg, minHeight: "100vh" }}>
    <PressureFilter />

    {/* ── Sticky Nav ─────────────────────────────────────────── */}
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "rgba(245, 243, 239, 0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1.5px dashed rgba(0,0,0,0.15)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <AnimatedDataReaperLogo />

      <div className="hidden md:flex items-center gap-8">
        <button onClick={() => navigate("/")}              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100">Dashboard</button>
        <button onClick={() => navigate("/war-room")}      className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100">War Room</button>
        <button onClick={() => navigate("/identity-graph")} className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100">Identity Graph</button>
        <button
          className="text-xl pencil-text transition-colors opacity-100"
          data-reaper-expression="surprised"
          data-reaper-phrases="Cutting off third-party access. Feels good.||Let's see what they actually know about you.||Time to audit the damage."
        >
          Access Mirror
        </button>
      </div>
    </nav>

    {/* ── Page Content placeholder — filled in next sub-stage ─── */}
  </div>
);
