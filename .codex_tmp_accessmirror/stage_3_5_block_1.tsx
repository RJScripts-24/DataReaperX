<main style={{ padding: "32px 24px", maxWidth: "1400px", margin: "0 auto" }}>
  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
    <PressureText
      as="h1"
      style={{ fontFamily: "'Dancing Script', cursive", fontSize: "3rem", marginBottom: "8px", color: COLORS.text }}
    >
      Access Mirror
    </PressureText>
    <PressureText
      as="p"
      style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "32px", fontSize: "1.05rem" }}
    >
      Your data footprint, laid bare. Audit every access grant. Upload any export. Delete what they shouldn't have.
    </PressureText>
  </motion.div>

  <div
    className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    style={{ alignItems: "start" }}
  >
    {/* LEFT PANEL — Google Hub */}
    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
      {/* filled in Stage 3.6 */}
    </div>

    {/* RIGHT PANEL — Universal Data Drop */}
    <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
      {/* filled in Stage 3.7 */}
    </div>
  </div>
</main>
