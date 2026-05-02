<div className="hand-drawn-card p-5" style={{ marginBottom: "16px" }}>
  {/* Header row */}
  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
    {GoogleLogo}
    <span style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem" }}>Google Account</span>
    <span style={{
      backgroundColor: "rgba(185,74,72,0.1)", color: COLORS.red,
      fontFamily: "'Patrick Hand', cursive", fontSize: "0.8rem",
      padding: "2px 10px", borderRadius: "20px", marginLeft: "auto",
    }}>Not connected</span>
  </div>
  <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "16px", fontSize: "0.92rem" }}>
    DataReaper will connect with read-only OAuth scopes. We can see your Gmail grants and basic account info.
    For the full list of every app you've authorized via 'Sign in with Google', use the Takeout path below.
  </p>
  <button className="hand-drawn-button w-full" onClick={handleGoogleConnect}>
    Connect with Google
  </button>
  <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.78rem", color: COLORS.textSec, marginTop: "8px" }}>
    // TODO: Real Google OAuth PKCE flow — preview mode active
  </p>
</div>
