import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AppNavbar } from "../components/AppNavbar";
import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import { useRequireAuth } from "../lib/scanContext";
import apiClient from "../lib/apiClient";

const COLORS = {
  bg: "#f5f3ef",
  card: "#f1eee8",
  paper: "#fdfbf7",
  blue: "#4a6fa5",
  orange: "#d17a22",
  red: "#b94a48",
  green: "#4f7d5c",
  purple: "#6360D8",
  text: "#1f1f1f",
  textSec: "#5a5a5a",
};

type OAuthToken = {
  id: string;
  app: string;
  permissions: string[];
  risk: "HIGH" | "MEDIUM" | "LOW";
  source: "gmail_grant" | "calendar_grant" | "drive_grant" | "signin";
};

const RISK_WEIGHT: Record<OAuthToken["risk"], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const SOURCE_WEIGHT: Record<OAuthToken["source"], number> = {
  signin: 0,
  drive_grant: 1,
  calendar_grant: 1,
  gmail_grant: 2,
};

type GoogleOAuthConfigResponse = {
  configured: boolean;
  clientId: string;
};

type DataMirrorReport = {
  company: string;
  summary: string;
  stats: { label: string; value: string; icon: string }[];
  timeline: { year: string; event: string; severity: "low" | "medium" | "high" }[];
  thirdParties: string[];
  recommendations: { action: string; priority: "high" | "medium" | "low" }[];
  authorizedApps?: { app: string; grantedDate: string; scopes: string[] }[];
};

function normalizePermissionLabel(input: string): string {
  const scopeMap: Record<string, string> = {
    openid: "Verify your identity",
    email: "See your email address",
    profile: "See your basic profile info",
    "https://www.googleapis.com/auth/userinfo.email": "See your email address",
    "https://www.googleapis.com/auth/userinfo.profile": "See your basic profile info",
    "https://www.googleapis.com/auth/gmail.readonly": "Read Gmail",
    "https://www.googleapis.com/auth/gmail.send": "Send email on your behalf",
    "https://www.googleapis.com/auth/drive.readonly": "Read Drive files",
    "https://www.googleapis.com/auth/drive": "Manage Drive files",
    "https://www.googleapis.com/auth/calendar.readonly": "Read your calendar",
    "https://www.googleapis.com/auth/calendar": "Manage your calendar",
    "https://www.googleapis.com/auth/contacts.readonly": "Read your contacts",
  };
  return scopeMap[input] ?? input;
}

function normalizeGoogleTokens(tokens: OAuthToken[]): OAuthToken[] {
  const grouped = new Map<string, OAuthToken>();

  for (const token of tokens) {
    const mappedPermissions = token.permissions.map((permission) => normalizePermissionLabel(permission));
    const looksLikeSignIn = mappedPermissions.every((permission) =>
      ["Verify your identity", "See your email address", "See your basic profile info"].includes(permission)
    );
    const app = token.app === "Google Account" && looksLikeSignIn ? "Google Sign-in" : token.app;
    const key = app.trim().toLowerCase();
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...token,
        app,
        permissions: [...new Set(mappedPermissions)],
      });
      continue;
    }

    existing.permissions = [...new Set([...existing.permissions, ...mappedPermissions])];
    if (RISK_WEIGHT[token.risk] > RISK_WEIGHT[existing.risk]) {
      existing.risk = token.risk;
    }
    if (SOURCE_WEIGHT[token.source] > SOURCE_WEIGHT[existing.source]) {
      existing.source = token.source;
    }
  }

  return [...grouped.values()].sort((left, right) => {
    const riskDelta = RISK_WEIGHT[right.risk] - RISK_WEIGHT[left.risk];
    if (riskDelta !== 0) {
      return riskDelta;
    }
    return left.app.localeCompare(right.app);
  });
}

function isGmailScope(scope: string): boolean {
  return scope.toLowerCase().includes("gmail");
}

function isGoogleSignInScope(scope: string): boolean {
  const normalized = scope.toLowerCase().trim();
  return (
    normalized === "openid" ||
    normalized === "email" ||
    normalized === "profile" ||
    normalized.includes("userinfo") ||
    normalized.includes("sign-in") ||
    normalized.includes("verify your identity") ||
    normalized.includes("see your email address") ||
    normalized.includes("see your basic profile info")
  );
}

const COMPANIES = [
  { name: "Google",    emoji: "" },
  { name: "Instagram", emoji: "" },
  { name: "LinkedIn",  emoji: "" },
  { name: "Amazon",    emoji: "" },
  { name: "Spotify",   emoji: "" },
  { name: "Uber",      emoji: "" },
  { name: "Other",     emoji: "" },
];

const INSTRUCTIONS: Record<string, { steps: string[]; link: string; note: string }> = {
  Google: {
    steps: [
      "Go to takeout.google.com",
      "Select the data categories you want (or export all)",
      "Choose export format: ZIP, delivery: download link",
      "Google emails you a download link — usually within minutes",
      "Download the ZIP and drop it below ↓",
    ],
    link: "https://takeout.google.com",
    note: "Takeout ZIPs include your search history, location, YouTube, Gmail metadata, and authorized apps list.",
  },
  Instagram: {
    steps: [
      "Open Instagram → Profile → ≡ Menu → Settings",
      "Your activity → Download your information",
      "Select 'JSON' format (not HTML)",
      "Request download — Instagram emails you within 24–48 hours",
      "Download and drop the ZIP below ↓",
    ],
    link: "https://www.instagram.com/download/request/",
    note: "Instagram exports include your messages, stories, ad interests, location data, and device history.",
  },
  LinkedIn: {
    steps: [
      "Go to linkedin.com → Me → Settings & Privacy",
      "Data privacy → Get a copy of your data",
      "Select 'Download larger data archive'",
      "LinkedIn emails you a link — usually within 24 hours",
      "Download and drop the ZIP below ↓",
    ],
    link: "https://www.linkedin.com/mypreferences/d/download-my-data",
    note: "LinkedIn exports include your connections, messages, job applications, ad targeting data, and profile views.",
  },
  Amazon: {
    steps: [
      "Go to amazon.com → Account → Request My Data",
      "Select all categories or specific ones",
      "Submit request — Amazon sends you a link within 30 days",
      "Download the ZIP and drop it below ↓",
    ],
    link: "https://www.amazon.com/hz/privacy-central/data-requests/preview.html",
    note: "Amazon exports include your order history, browsing, Alexa commands, Prime Video, and ad profile.",
  },
  Spotify: {
    steps: [
      "Go to spotify.com → Account → Privacy Settings",
      "Scroll to 'Download your data'",
      "Request data — Spotify emails you within 30 days",
      "Download the ZIP and drop it below ↓",
    ],
    link: "https://www.spotify.com/account/privacy/",
    note: "Spotify exports include your streaming history, playlist data, search history, and inferred preferences.",
  },
  Uber: {
    steps: [
      "Open the Uber app → Menu → Privacy Center",
      "Or go to privacy.uber.com",
      "Select 'Download my data'",
      "Uber emails you a link — usually within 30 days",
      "Download and drop the ZIP below ↓",
    ],
    link: "https://privacy.uber.com/",
    note: "Uber exports include your trip history, location points, payment info, device data, and support history.",
  },
  Other: {
    steps: [
      "Go to the platform's Privacy or Account Settings",
      "Look for 'Download my data', 'Export data', or 'Request data archive'",
      "Select ZIP or JSON format where available",
      "Wait for the platform to email you a download link",
      "Download and drop the file below ↓",
    ],
    link: "",
    note: "DataReaper will attempt to parse any ZIP or JSON export. Results depend on the platform's export format.",
  },
};

function buildDeletionRequest(report: DataMirrorReport): string {
  const lines = report.recommendations.map(r => `- ${r.action}`).join("\n");
  return `I am submitting a formal data deletion request under GDPR/CCPA/DPDP.\n\nPlease delete the following data associated with my account:\n${lines}\n\nI expect a response within 30 days as required by applicable law.`;
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export default function AccessMirror() {
  const authenticatedEmail = useRequireAuth();

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleTokens, setGoogleTokens] = useState<OAuthToken[]>([]);
  const [googleClientId, setGoogleClientId] = useState("");
  const [isGoogleConfigLoading, setIsGoogleConfigLoading] = useState(true);
  const [googleConfigError, setGoogleConfigError] = useState<string | null>(null);
  const [severedIds, setSeveredIds] = useState<Set<string>>(new Set());
  const [isSevering, setIsSevering] = useState(false);

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<DataMirrorReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTokens = googleTokens.filter((token) => !severedIds.has(token.id));
  const activeTokenCount = activeTokens.length;
  const highRiskTokens = activeTokens.filter((token) => token.risk === "HIGH");
  const highRiskCount = highRiskTokens.length;
  const activeScopeCount = activeTokens.reduce((total, token) => total + token.permissions.length, 0);
  const reportAuthorizedApps = report?.authorizedApps ?? [];
  const appsWithGmailAccessCount = reportAuthorizedApps.filter((app) =>
    app.scopes.some((scope) => isGmailScope(scope))
  ).length;
  const appsWithSignInAccessCount = reportAuthorizedApps.filter((app) =>
    app.scopes.some((scope) => isGoogleSignInScope(scope))
  ).length;
  const appsWithBothAccessCount = reportAuthorizedApps.filter((app) => {
    const hasGmailAccess = app.scopes.some((scope) => isGmailScope(scope));
    const hasSignInAccess = app.scopes.some((scope) => isGoogleSignInScope(scope));
    return hasGmailAccess && hasSignInAccess;
  }).length;

  useEffect(() => {
    let isMounted = true;
    const callbackParams = new URLSearchParams(window.location.search);
    const isOAuthCallback = callbackParams.has("code") || callbackParams.has("error");
    setIsGoogleConfigLoading(true);

    void apiClient
      .get<GoogleOAuthConfigResponse>("/api/access-mirror/google/config")
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        const clientId = String(data.clientId ?? "").trim();
        if (data.configured && clientId) {
          setGoogleClientId(clientId);
          setGoogleConfigError(null);
          return;
        }
        setGoogleClientId("");
        setGoogleConfigError("Google OAuth is not configured on backend.");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setGoogleClientId("");
        setGoogleConfigError("Unable to load Google OAuth configuration from backend.");
      })
      .finally(() => {
        if (isMounted) {
          setIsGoogleConfigLoading(false);
        }
      });

    if (!isOAuthCallback) {
      void apiClient
        .get("/api/access-mirror/google/grants")
        .then(({ data }: any) => {
          if (!isMounted) {
            return;
          }
          const grants: OAuthToken[] = normalizeGoogleTokens(Array.isArray(data?.grants) ? data.grants : []);
          setGoogleConnected(Boolean(data?.connected));
          setGoogleTokens(grants);

          const revocationLog = data?.revocation_log ?? data?.revocationLog ?? {};
          const nextSevered = new Set<string>();
          if (revocationLog && typeof revocationLog === "object") {
            for (const token of grants) {
              if ((revocationLog as Record<string, any>)[token.app]?.revoked) {
                nextSevered.add(token.id);
              }
            }
          }
          setSeveredIds(nextSevered);
        })
        .catch(() => {
          if (!isMounted) {
            return;
          }
          setGoogleConnected(false);
          setGoogleTokens([]);
        });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      toast.error(`Google sign-in was cancelled: ${error}`);
      window.history.replaceState({}, "", "/access-mirror");
      return;
    }

    if (!code) {
      return;
    }

    const codeVerifier = sessionStorage.getItem("google_pkce_verifier");
    const redirectUri = sessionStorage.getItem("google_pkce_redirect_uri");
    sessionStorage.removeItem("google_pkce_verifier");
    sessionStorage.removeItem("google_pkce_redirect_uri");

    if (!codeVerifier || !redirectUri) {
      toast.error("OAuth state lost. Please try connecting again.");
      window.history.replaceState({}, "", "/access-mirror");
      return;
    }

    void (async () => {
      toast("Exchanging authorization code with DataReaper...");
      try {
        const { data } = await apiClient.post("/api/access-mirror/google/connect", {
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
        });
        setGoogleConnected(true);
        setGoogleTokens(normalizeGoogleTokens(data.grants ?? []));
        setSeveredIds(new Set());
        toast.success(`Connected — ${(data.grants ?? []).length} app grants found.`);
      } catch (error: any) {
        const detail = error?.message ?? "Connection failed.";
        toast.error(`Google connect failed: ${detail}`);
      } finally {
        window.history.replaceState({}, "", "/access-mirror");
      }
    })();
  }, []);

  if (!authenticatedEmail) {
    return null;
  }

  async function handleGoogleConnect() {
    if (isGoogleConfigLoading) {
      toast("Loading Google OAuth configuration...");
      return;
    }

    const clientId = googleClientId.trim();
    if (!clientId) {
      toast.error(googleConfigError ?? "Google OAuth is not configured on backend yet.");
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = `${window.location.origin}/auth/google/callback`;

    sessionStorage.setItem("google_pkce_verifier", codeVerifier);
    sessionStorage.setItem("google_pkce_redirect_uri", redirectUri);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
    });

    toast("Redirecting to Google sign-in...");
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async function handleRevokeToken(id: string, appName: string) {
    try {
      await apiClient.post(`/api/access-mirror/google/revoke/${encodeURIComponent(appName)}`);
      setSeveredIds((previous) => new Set([...previous, id]));
      toast.success(`${appName} access revoked.`);
    } catch {
      setSeveredIds((previous) => new Set([...previous, id]));
      toast(`${appName} marked as revoked. Confirm removal at myaccount.google.com/permissions.`);
    }
  }

  async function handleSeverAll() {
    setIsSevering(true);
    const toSever = [...highRiskTokens];
    let count = 0;

    for (const token of toSever) {
      try {
        await apiClient.post(`/api/access-mirror/google/revoke/${encodeURIComponent(token.app)}`);
      } catch {
        // Best effort revoke; still update local state.
      }
      setSeveredIds((previous) => new Set([...previous, token.id]));
      count += 1;
    }

    setIsSevering(false);
    toast.success(`${count} high-risk connections severed. Confirm at myaccount.google.com/permissions.`);
  }

  async function handleFileUpload(file: File) {
    if (!selectedCompany) {
      return;
    }

    setUploadedFile(file);
    setReport(null);
    setIsAnalyzing(true);
    toast(`Uploading ${file.name} to DataReaper...`);

    try {
      const formData = new FormData();
      formData.append("platform", selectedCompany);
      formData.append("file", file);

      const { data } = await apiClient.post("/api/access-mirror/parse", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const mapped: DataMirrorReport = {
        company: data.company,
        summary: data.summary,
        stats: data.stats ?? [],
        timeline: data.timeline ?? [],
        thirdParties: data.thirdParties ?? data.third_parties ?? [],
        recommendations: data.recommendations ?? [],
        authorizedApps: data.authorizedApps ?? data.authorized_apps ?? undefined,
      };

      setReport(mapped);
      setIsAnalyzing(false);
      toast.success(`Report ready — ${selectedCompany} data parsed.`);
    } catch (error: any) {
      setIsAnalyzing(false);
      setUploadedFile(null);
      const detail = error?.message ?? "Parse failed. Try a different file.";
      toast.error(detail);
    }
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

      <AppNavbar
        active="access-mirror"
        rightSlot={(
          <PressureText
            as="span"
            style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.95rem" }}
          >
            Signed in: {authenticatedEmail}
          </PressureText>
        )}
      />

      <main style={{ padding: "24px 12px", maxWidth: "1660px", margin: "0 auto" }}>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10" style={{ alignItems: "start" }}>
          <div className="overflow-y-auto hand-drawn-scrollbar lg:pr-2" style={{ maxHeight: "calc(100vh - 120px)" }}>
            <PressureText as="h2" style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", marginBottom: "8px" }}>
              The Google Hub
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
                  <PressureText
                    as="p"
                    style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.purple, marginBottom: "12px", fontSize: "0.82rem" }}
                  >
                    Full third-party app history is extracted from your Google Takeout file after upload in the Data Drop panel.
                  </PressureText>
                  <button
                    className="hand-drawn-button w-full"
                    disabled={isGoogleConfigLoading || !googleClientId}
                    onClick={() => void handleGoogleConnect()}
                  >
                    {isGoogleConfigLoading ? "Loading Google OAuth..." : "Connect with Google"}
                  </button>
                  <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.78rem", color: COLORS.textSec, marginTop: "8px" }}>
                    Uses Google OAuth (PKCE). You can review connected app access after sign-in.
                  </PressureText>
                  {googleConfigError ? (
                    <PressureText
                      as="p"
                      style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.8rem", color: COLORS.red, marginTop: "8px" }}
                    >
                      {googleConfigError}
                    </PressureText>
                  ) : null}
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
                    {activeTokenCount} app grants detected. Review high-risk scopes and revoke any app that can read your inbox or act on your behalf.
                  </PressureText>
                  <PressureText
                    as="p"
                    style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.purple, marginBottom: "12px", fontSize: "0.82rem" }}
                  >
                    This list shows scopes from your current OAuth grant. Full third-party app history comes from Google Takeout parsing in Data Drop.
                  </PressureText>

                  <div className="flex flex-wrap gap-2" style={{ marginBottom: "12px" }}>
                    {[
                      { label: "Apps", value: activeTokenCount },
                      { label: "Scopes", value: activeScopeCount },
                      { label: "High-risk", value: highRiskCount },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="hand-drawn-card"
                        style={{
                          minWidth: "96px",
                          padding: "8px 10px",
                          backgroundColor: COLORS.paper,
                          border: "1px dashed rgba(0,0,0,0.16)",
                        }}
                      >
                        <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.2rem", lineHeight: 1 }}>
                          {stat.value}
                        </PressureText>
                        <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.76rem" }}>
                          {stat.label}
                        </PressureText>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: "1.5px dashed rgba(0,0,0,0.14)", paddingTop: "12px", marginTop: "8px" }}>
                    <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", marginBottom: "10px", color: COLORS.text }}>
                      Authorized apps ({activeTokenCount})
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
                                <button className="hand-drawn-button" onClick={() => void handleRevokeToken(token.id, token.app)}>
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
                Full App List via Google Takeout
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
              <button className="hand-drawn-button" onClick={() => window.open("https://takeout.google.com", "_blank")}>Open takeout.google.com</button>
              <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.82rem", color: COLORS.textSec, marginTop: "10px", fontStyle: "italic" }}>
                When you drop a Takeout ZIP on the right and select Google, DataReaper automatically extracts
                the authorized apps section alongside your full privacy report.
              </PressureText>
            </div>
          </div>

          <div className="overflow-y-auto hand-drawn-scrollbar lg:pl-2" style={{ maxHeight: "calc(100vh - 120px)" }}>
            <PressureText as="h2" style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", marginBottom: "8px" }}>
              Universal Data Drop
            </PressureText>
            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, marginBottom: "24px" }}>
              Upload your data export from any platform. DataReaper parses it and shows you the version of you
              that company has built — then helps you delete it.
            </PressureText>

            <div className="flex flex-wrap gap-2" style={{ marginBottom: "20px" }}>
              {COMPANIES.map((company) => (
                <button
                  key={company.name}
                  className="hand-drawn-button min-w-[118px] px-4 py-1.5 text-center"
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
                  {company.name}
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
                    <button className="hand-drawn-button" onClick={() => window.open(INSTRUCTIONS[selectedCompany].link, "_blank")}>Open download page</button>
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
                <PressureText
                  as="p"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "1.5rem", marginBottom: "8px", display: "block" }}
                >
                  Drop your {selectedCompany} export here
                </PressureText>
                <PressureText
                  as="p"
                  style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, display: "block", lineHeight: 1.35 }}
                >
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
                      <div className="flex flex-wrap gap-2" style={{ marginBottom: "10px" }}>
                        {[
                          { label: "Places with Gmail access", value: appsWithGmailAccessCount },
                          { label: "Places with Google Sign-in", value: appsWithSignInAccessCount },
                          { label: "Places with both", value: appsWithBothAccessCount },
                        ].map((metric) => (
                          <div
                            key={metric.label}
                            className="hand-drawn-card"
                            style={{
                              minWidth: "160px",
                              padding: "8px 10px",
                              backgroundColor: COLORS.paper,
                              border: "1px dashed rgba(0,0,0,0.16)",
                            }}
                          >
                            <PressureText as="p" style={{ fontFamily: "'Caveat', cursive", fontSize: "1.2rem", lineHeight: 1 }}>
                              {metric.value}
                            </PressureText>
                            <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.76rem" }}>
                              {metric.label}
                            </PressureText>
                          </div>
                        ))}
                      </div>
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
                          {stat.value}
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
