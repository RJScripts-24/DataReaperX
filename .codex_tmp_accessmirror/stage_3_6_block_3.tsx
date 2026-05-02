<div className="hand-drawn-card p-5" style={{ borderTop: `3px solid ${COLORS.purple}` }}>
  <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.3rem", marginBottom: "12px" }}>
    🗂️ Full App List via Google Takeout
  </PressureText>
  <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "12px" }}>
    Google doesn't expose a public API for every app you've authorized via 'Sign in with Google'.
    To see the complete list, download your Google Takeout export and drop it in the Data Drop panel →
  </p>
  <ol className="list-decimal pl-5 space-y-2" style={{ fontFamily: "'Patrick Hand', cursive", marginBottom: "16px" }}>
    <li>Go to takeout.google.com</li>
    <li>Deselect all → select only "Google Account activity and settings"</li>
    <li>Export and download the ZIP</li>
    <li>Drop the ZIP in the Data Drop panel on the right</li>
    <li>DataReaper will extract and display your full authorized app list</li>
  </ol>
  <button className="hand-drawn-button" onClick={() => window.open("https://takeout.google.com", "_blank")}>
    Open takeout.google.com ↗
  </button>
  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.82rem", color: COLORS.textSec, marginTop: "10px", fontStyle: "italic" }}>
    When you drop a Takeout ZIP on the right and select Google, DataReaper automatically extracts
    the authorized apps section alongside your full privacy report.
  </p>
</div>
