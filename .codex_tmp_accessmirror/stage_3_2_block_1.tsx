export default function AccessMirror() {
  const navigate = useNavigate();

  // ── Left panel state ────────────────────────────────────────────
  const [googleConnected, setGoogleConnected]   = useState(false);
  const [googleTokens, setGoogleTokens]         = useState<OAuthToken[]>([]);
  const [severedIds, setSeveredIds]             = useState<Set<string>>(new Set());
  const [isSevering, setIsSevering]             = useState(false);

  // ── Right panel state ───────────────────────────────────────────
  const [selectedCompany, setSelectedCompany]   = useState<string | null>(null);
  const [isDragOver, setIsDragOver]             = useState(false);
  const [uploadedFile, setUploadedFile]         = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing]           = useState(false);
  const [report, setReport]                     = useState<DataMirrorReport | null>(null);
  const fileInputRef                            = useRef<HTMLInputElement>(null);

  // ── Derived values ──────────────────────────────────────────────
  const highRiskTokens = googleTokens.filter(t => t.risk === "HIGH" && !severedIds.has(t.id));
  const highRiskCount  = highRiskTokens.length;

  // ── Handlers ────────────────────────────────────────────────────
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
    setSeveredIds(prev => new Set([...prev, id]));
    toast.success(`${appName} access revoked.`);
  }

  async function handleSeverAll() {
    setIsSevering(true);
    await new Promise(resolve => setTimeout(resolve, 1800));
    const ids = highRiskTokens.map(t => t.id);
    setSeveredIds(prev => new Set([...prev, ...ids]));
    setIsSevering(false);
    toast.success(`${ids.length} high-risk connections severed. Google will enforce within minutes.`);
  }

  async function handleFileUpload(file: File) {
    setUploadedFile(file);
    setReport(null);
    setIsAnalyzing(true);
    toast(`Parsing ${file.name}...`);
    await new Promise(resolve => setTimeout(resolve, 2200));
    const mockReport = generateMockReport(selectedCompany!, file.name);
    setReport(mockReport);
    setIsAnalyzing(false);
    toast.success(`Report ready — ${selectedCompany} data parsed.`);
    // TODO: Replace with real backend call:
    // const formData = new FormData();
    // formData.append("file", file);
    // formData.append("company", selectedCompany!);
    // const res = await apiClient.post("/api/access-mirror/parse", formData);
    // setReport(res.data);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  return null; // replaced in Stage 3.3
}
