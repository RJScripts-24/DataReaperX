export default function AccessMirror() {
  const navigate = useNavigate();

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleTokens, setGoogleTokens] = useState<OAuthToken[]>([]);
  const [severedIds, setSeveredIds] = useState<Set<string>>(new Set());
  const [isSevering, setIsSevering] = useState(false);

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<DataMirrorReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const highRiskTokens = googleTokens.filter((token) => token.risk === "HIGH" && !severedIds.has(token.id));
  const highRiskCount = highRiskTokens.length;

  function handleGoogleConnect() {
    toast("Connecting to Google...");
    setTimeout(() => {
      setGoogleConnected(true);
      setGoogleTokens(MOCK_GOOGLE_TOKENS);
      toast.success("Connected — 8 app grants found.");
      // TODO: Replace with real Google OAuth PKCE flow using
      //   scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly"
      //   Then call GET https://www.googleapis.com/oauth2/v3/userinfo
    }, 1500);
  }

  function handleRevokeToken(id: string, appName: string) {
    setSeveredIds((previous) => new Set([...previous, id]));
    toast.success(`${appName} access revoked.`);
  }

  async function handleSeverAll() {
    if (highRiskCount === 0) {
      return;
    }

    setIsSevering(true);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const ids = highRiskTokens.map((token) => token.id);
    setSeveredIds((previous) => new Set([...previous, ...ids]));
    setIsSevering(false);
    toast.success(`${ids.length} high-risk connections severed. Google will enforce within minutes.`);
  }

  async function handleFileUpload(file: File) {
    if (!selectedCompany) {
      return;
    }

    setUploadedFile(file);
    setReport(null);
    setIsAnalyzing(true);
    toast(`Parsing ${file.name}...`);
    await new Promise((resolve) => setTimeout(resolve, 2200));
    const mockReport = generateMockReport(selectedCompany, file.name);
    setReport(mockReport);
    setIsAnalyzing(false);
    toast.success(`Report ready — ${selectedCompany} data parsed.`);
    // TODO: Replace with real backend call:
    // const formData = new FormData();
    // formData.append("file", file);
    // formData.append("company", selectedCompany);
    // const res = await apiClient.post("/api/access-mirror/parse", formData);
    // setReport(res.data);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileUpload(file);
    }
  }

  const sourceLabelMap: Record<OAuthToken["source"], string> = {
    gmail_grant: "via Gmail grant",
    drive_grant: "via Drive grant",
    calendar_grant: "via Calendar grant",
    signin: "via Sign-in",
  };

  const GoogleLogo = (
    <svg width="24" height="24" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );

  return (
    <div style={{ backgroundColor: COLORS.bg, minHeight: "100vh" }}>
      <PressureFilter />

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
          <button onClick={() => navigate("/")} className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100">Dashboard</button>
          <button onClick={() => navigate("/war-room")} className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100">War Room</button>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ alignItems: "start" }}>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
            <PressureText as="h2" style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", marginBottom: "8px" }}>
              🔐 The Google Hub
            </PressureText>
            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "24px" }}>
              Connect your Google account to see which apps have access to your data — and cut off the ones that shouldn't.
            </PressureText>

            <AnimatePresence mode="wait">
              {!googleConnected ? (
                <motion.div
                  key="disconnected"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="hand-drawn-card p-5"
                  style={{ marginBottom: "16px", backgroundColor: COLORS.card }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    {GoogleLogo}
                    <PressureText as="span" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem" }}>Google Account</PressureText>
                    <PressureText
                      as="span"
                      style={{
                        backgroundColor: "rgba(185,74,72,0.1)",
                        color: COLORS.red,
                        fontFamily: "'Patrick Hand', cursive",
                        fontSize: "0.8rem",
                        padding: "2px 10px",
                        borderRadius: "20px",
                        marginLeft: "auto",
                      }}
                    >
                      Not connected
                    </PressureText>
                  </div>
                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "16px", fontSize: "0.92rem" }}>
                    DataReaper will connect with read-only OAuth scopes. We can see your Gmail grants and basic account info.
                    For the full list of every app you've authorized via 'Sign in with Google', use the Takeout path below.
                  </PressureText>
                  <button className="hand-drawn-button w-full" onClick={handleGoogleConnect}>
                    Connect with Google
                  </button>
                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.78rem", color: COLORS.textSec, marginTop: "8px" }}>
                    // TODO: Real Google OAuth PKCE flow — preview mode active
                  </PressureText>
                </motion.div>
              ) : (
                <motion.div
                  key="connected"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="hand-drawn-card p-5"
                  style={{ marginBottom: "16px", backgroundColor: COLORS.card }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                    {GoogleLogo}
                    <PressureText as="span" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem" }}>Google Account</PressureText>
                    <PressureText
                      as="span"
                      style={{
                        backgroundColor: "rgba(79,125,92,0.14)",
                        color: COLORS.green,
                        fontFamily: "'Patrick Hand', cursive",
                        fontSize: "0.8rem",
                        padding: "2px 10px",
                        borderRadius: "20px",
                        marginLeft: "auto",
                      }}
                    >
                      Connected
                    </PressureText>
                  </div>

                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "12px", fontSize: "0.92rem" }}>
                    8 app grants detected. Review high-risk scopes and revoke any app that can read your inbox or act on your behalf.
                  </PressureText>

                  <div style={{ borderTop: "1.5px dashed rgba(0,0,0,0.14)", paddingTop: "12px", marginTop: "8px" }}>
                    <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", marginBottom: "10px", color: COLORS.text }}>
                      Authorized apps ({googleTokens.length - severedIds.size})
                    </PressureText>

                    <AnimatePresence>
                      {googleTokens.map((token) => {
                        if (severedIds.has(token.id)) {
                          return null;
                        }

                        const riskStyles = token.risk === "HIGH"
                          ? { bg: "rgba(185,74,72,0.14)", color: COLORS.red }
                          : token.risk === "MEDIUM"
                            ? { bg: "rgba(209,122,34,0.14)", color: COLORS.orange }
                            : { bg: "rgba(79,125,92,0.14)", color: COLORS.green };

                        return (
                          <motion.div
                            key={token.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, height: 0 }}
                            style={{
                              borderTop: "1.5px dashed rgba(0,0,0,0.1)",
                              paddingTop: "10px",
                              marginTop: "10px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <PressureText as="span" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.2rem", color: COLORS.text }}>
                                {token.app}
                              </PressureText>
                              <PressureText
                                as="span"
                                style={{
                                  marginLeft: "auto",
                                  fontFamily: "'Patrick Hand', cursive",
                                  fontSize: "0.75rem",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  backgroundColor: riskStyles.bg,
                                  color: riskStyles.color,
                                }}
                              >
                                {token.risk}
                              </PressureText>
                            </div>
                            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.82rem", marginTop: "4px" }}>
                              {sourceLabelMap[token.source]}
                            </PressureText>
                            <div className="flex flex-wrap gap-2" style={{ marginTop: "8px" }}>
                              {token.permissions.map((permission) => (
                                <PressureText
                                  key={permission}
                                  as="span"
                                  style={{
                                    fontFamily: "'Patrick Hand', cursive",
                                    fontSize: "0.76rem",
                                    backgroundColor: "rgba(0,0,0,0.05)",
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                  }}
                                >
                                  {permission}
                                </PressureText>
                              ))}
                            </div>
                            {token.risk === "HIGH" ? (
                              <div style={{ marginTop: "8px" }}>
                                <button className="hand-drawn-button" onClick={() => handleRevokeToken(token.id, token.app)}>
                                  Revoke
                                </button>
                              </div>
                            ) : null}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <button className="hand-drawn-button" disabled={isSevering || highRiskCount === 0} onClick={() => void handleSeverAll()}>
                      {isSevering ? "Severing..." : `Sever All (${highRiskCount})`}
                    </button>
                    <PressureText as="span" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.8rem" }}>
                      Only HIGH-risk grants are revoked.
                    </PressureText>
                  </div>

                  <AnimatePresence>
                    {severedIds.size > 0 && !isSevering ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="hand-drawn-card"
                        style={{
                          marginTop: "12px",
                          padding: "12px",
                          backgroundColor: "rgba(79,125,92,0.12)",
                          border: "1px dashed rgba(79,125,92,0.45)",
                        }}
                      >
                        <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.green }}>
                          Access severed successfully. High-risk app grants have been removed from this session.
                        </PressureText>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="hand-drawn-card p-5" style={{ borderTop: `3px solid ${COLORS.purple}`, backgroundColor: COLORS.card }}>
              <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.3rem", marginBottom: "12px" }}>
                🗂️ Full App List via Google Takeout
              </PressureText>
              <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "12px" }}>
                Google doesn't expose a public API for every app you've authorized via 'Sign in with Google'.
                To see the complete list, download your Google Takeout export and drop it in the Data Drop panel →
              </PressureText>
              <ol className="list-decimal pl-5 space-y-2" style={{ fontFamily: "'Patrick Hand', cursive", marginBottom: "16px" }}>
                <li>Go to takeout.google.com</li>
                <li>Deselect all → select only "Google Account activity and settings"</li>
                <li>Export and download the ZIP</li>
                <li>Drop the ZIP in the Data Drop panel on the right</li>
                <li>DataReaper will extract and display your full authorized app list</li>
              </ol>
              <button className="hand-drawn-button" onClick={() => window.open("https://takeout.google.com", "_blank")}>Open takeout.google.com ↗</button>
              <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.82rem", color: COLORS.textSec, marginTop: "10px", fontStyle: "italic" }}>
                When you drop a Takeout ZIP on the right and select Google, DataReaper automatically extracts
                the authorized apps section alongside your full privacy report.
              </PressureText>
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 120px)" }}>
            <PressureText as="h2" style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", marginBottom: "8px" }}>
              🪞 Universal Data Drop
            </PressureText>
            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "24px" }}>
              Upload your data export from any platform. DataReaper parses it and shows you the version of you
              that company has built — then helps you delete it.
            </PressureText>

            <div className="flex flex-wrap gap-2" style={{ marginBottom: "20px" }}>
              {COMPANIES.map((company) => (
                <button
                  key={company.name}
                  className="hand-drawn-button"
                  onClick={() => {
                    setSelectedCompany(company.name);
                    setReport(null);
                    setUploadedFile(null);
                  }}
                  style={
                    selectedCompany === company.name
                      ? { backgroundColor: COLORS.purple, color: "#fff", borderColor: "#4a47b0" }
                      : {}
                  }
                >
                  {company.emoji} {company.name}
                </button>
              ))}
            </div>

            <AnimatePresence>
              {selectedCompany !== null && uploadedFile === null ? (
                <motion.div
                  key="instructions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="hand-drawn-card p-5"
                  style={{ marginBottom: "14px", backgroundColor: COLORS.card }}
                >
                  <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem", marginBottom: "8px" }}>
                    {selectedCompany} export instructions
                  </PressureText>
                  <ol className="list-decimal pl-5 space-y-2" style={{ fontFamily: "'Patrick Hand', cursive", marginBottom: "12px" }}>
                    {INSTRUCTIONS[selectedCompany].steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "10px" }}>
                    {INSTRUCTIONS[selectedCompany].note}
                  </PressureText>
                  {selectedCompany === "Google" ? (
                    <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.purple, marginBottom: "10px" }}>
                      Tip: Google exports include authorized apps metadata that powers the App Access section in your report.
                    </PressureText>
                  ) : null}
                  {INSTRUCTIONS[selectedCompany].link ? (
                    <button className="hand-drawn-button" onClick={() => window.open(INSTRUCTIONS[selectedCompany].link, "_blank")}>Open download page ↗</button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {selectedCompany !== null ? (
              <div
                className="hand-drawn-card p-5"
                style={{
                  backgroundColor: isDragOver ? "rgba(99,96,216,0.12)" : COLORS.paper,
                  border: "2px dashed rgba(99,96,216,0.5)",
                  marginBottom: "14px",
                  cursor: "pointer",
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,.csv"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFileUpload(file);
                    }
                  }}
                />
                <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.5rem", marginBottom: "6px" }}>
                  Drop your {selectedCompany} export here
                </PressureText>
                <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                  or click to choose a .zip, .json, or .csv file
                </PressureText>
              </div>
            ) : null}

            <AnimatePresence>
              {isAnalyzing ? (
                <motion.div
                  key="analyzing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: [1, 0.5, 1] }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                  className="hand-drawn-card p-5"
                  style={{ marginBottom: "14px", backgroundColor: COLORS.card }}
                >
                  <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.5rem" }}>
                    Analyzing your export...
                  </PressureText>
                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                    Parsing structures, inferring behavioral profile, mapping third-party spread.
                  </PressureText>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {report !== null && !isAnalyzing ? (
                <motion.div
                  key="report"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className="hand-drawn-card p-5" style={{ borderTop: `3px solid ${COLORS.purple}`, backgroundColor: COLORS.card }}>
                    <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.5rem", marginBottom: "8px" }}>
                      {report.company} access mirror summary
                    </PressureText>
                    <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "12px" }}>
                      {report.summary}
                    </PressureText>
                    <button
                      className="hand-drawn-button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(buildDeletionRequest(report));
                        toast.success("Legal deletion request copied.");
                      }}
                    >
                      Generate Legal Deletion Request
                    </button>
                  </div>

                  {report.authorizedApps && report.authorizedApps.length > 0 ? (
                    <div className="hand-drawn-card p-5" style={{ borderTop: `3px solid ${COLORS.blue}`, backgroundColor: COLORS.card }}>
                      <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.35rem", marginBottom: "10px" }}>
                        Authorized Apps Detected
                      </PressureText>
                      <div className="space-y-3">
                        {report.authorizedApps.map((app) => (
                          <div key={`${app.app}-${app.grantedDate}`} style={{ borderTop: "1.5px dashed rgba(0,0,0,0.12)", paddingTop: "10px" }}>
                            <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.2rem" }}>{app.app}</PressureText>
                            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                              Granted: {app.grantedDate}
                            </PressureText>
                            <div className="flex flex-wrap gap-2" style={{ marginTop: "4px" }}>
                              {app.scopes.map((scope) => (
                                <PressureText
                                  key={scope}
                                  as="span"
                                  style={{
                                    fontFamily: "'Patrick Hand', cursive",
                                    fontSize: "0.78rem",
                                    backgroundColor: "rgba(74,111,165,0.12)",
                                    color: COLORS.blue,
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                  }}
                                >
                                  {scope}
                                </PressureText>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {report.stats.map((stat, i) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className="hand-drawn-card p-4"
                        style={{ backgroundColor: COLORS.card }}
                      >
                        <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.35rem" }}>
                          {stat.icon} {stat.value}
                        </PressureText>
                        <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                          {stat.label}
                        </PressureText>
                      </motion.div>
                    ))}
                  </div>

                  <div className="hand-drawn-card p-5" style={{ backgroundColor: COLORS.card }}>
                    <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem", marginBottom: "10px" }}>
                      Creepiness Timeline
                    </PressureText>
                    <div className="space-y-2">
                      {report.timeline.map((event) => {
                        const color = event.severity === "high" ? COLORS.red : event.severity === "medium" ? COLORS.orange : COLORS.green;
                        return (
                          <div key={`${event.year}-${event.event}`} style={{ borderTop: "1.5px dashed rgba(0,0,0,0.12)", paddingTop: "8px" }}>
                            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color }}>
                              {event.year}
                            </PressureText>
                            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text }}>
                              {event.event}
                            </PressureText>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hand-drawn-card p-5" style={{ backgroundColor: COLORS.card }}>
                    <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem", marginBottom: "10px" }}>
                      Third Parties
                    </PressureText>
                    <div className="flex flex-wrap gap-2">
                      {report.thirdParties.map((party) => (
                        <PressureText
                          key={party}
                          as="span"
                          style={{
                            fontFamily: "'Patrick Hand', cursive",
                            fontSize: "0.85rem",
                            backgroundColor: "rgba(99,96,216,0.13)",
                            color: COLORS.purple,
                            padding: "4px 10px",
                            borderRadius: "999px",
                          }}
                        >
                          {party}
                        </PressureText>
                      ))}
                    </div>
                  </div>

                  <div className="hand-drawn-card p-5" style={{ backgroundColor: COLORS.card }}>
                    <PressureText as="h3" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.4rem", marginBottom: "10px" }}>
                      Recommendations
                    </PressureText>
                    <div className="space-y-2">
                      {report.recommendations.map((recommendation) => {
                        const priorityColor = recommendation.priority === "high"
                          ? COLORS.red
                          : recommendation.priority === "medium"
                            ? COLORS.orange
                            : COLORS.green;
                        return (
                          <div key={recommendation.action} style={{ borderTop: "1.5px dashed rgba(0,0,0,0.12)", paddingTop: "8px" }}>
                            <div className="flex items-start gap-2">
                              <span style={{ width: "8px", height: "8px", borderRadius: "999px", backgroundColor: priorityColor, marginTop: "8px", flexShrink: 0 }} />
                              <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text, flex: 1 }}>
                                {recommendation.action}
                              </PressureText>
                              <PressureText
                                as="span"
                                style={{
                                  fontFamily: "'Patrick Hand', cursive",
                                  fontSize: "0.78rem",
                                  textTransform: "uppercase",
                                  backgroundColor: `${priorityColor}22`,
                                  color: priorityColor,
                                  borderRadius: "999px",
                                  padding: "2px 8px",
                                }}
                              >
                                {recommendation.priority}
                              </PressureText>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="hand-drawn-button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(buildDeletionRequest(report));
                        toast.success("Privacy request copied to clipboard.");
                      }}
                    >
                      Copy All as Privacy Request
                    </button>
                    <button
                      className="hand-drawn-button"
                      onClick={() => {
                        setReport(null);
                        setUploadedFile(null);
                      }}
                    >
                      ↑ Upload a different file
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
