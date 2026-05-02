import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AppNavbar } from "../components/AppNavbar";
import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import { useRequireAuth } from "../lib/scanContext";

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

type DataMirrorReport = {
  company: string;
  summary: string;
  stats: { label: string; value: string; icon: string }[];
  timeline: { year: string; event: string; severity: "low" | "medium" | "high" }[];
  thirdParties: string[];
  recommendations: { action: string; priority: "high" | "medium" | "low" }[];
  authorizedApps?: { app: string; grantedDate: string; scopes: string[] }[];
};

const MOCK_GOOGLE_TOKENS: OAuthToken[] = [
  { id: "g1", app: "Notion",    permissions: ["Read Drive files", "See email address"],                           risk: "LOW",    source: "drive_grant"    },
  { id: "g2", app: "Slack",     permissions: ["Read Gmail", "Send email on your behalf"],                         risk: "HIGH",   source: "gmail_grant"    },
  { id: "g3", app: "Zapier",    permissions: ["Manage calendar", "Read contacts", "Read Gmail"],                  risk: "HIGH",   source: "gmail_grant"    },
  { id: "g4", app: "Figma",     permissions: ["See email address"],                                               risk: "LOW",    source: "signin"         },
  { id: "g5", app: "Linear",    permissions: ["See email address", "Read Drive"],                                 risk: "MEDIUM", source: "drive_grant"    },
  { id: "g6", app: "Zoom",      permissions: ["Read calendar", "Write calendar"],                                 risk: "MEDIUM", source: "calendar_grant" },
  { id: "g7", app: "Typeform",  permissions: ["Read Gmail", "Access contacts"],                                   risk: "HIGH",   source: "gmail_grant"    },
  { id: "g8", app: "Calendly",  permissions: ["Manage calendar"],                                                 risk: "LOW",    source: "calendar_grant" },
];

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

function generateMockReport(company: string, _filename: string): DataMirrorReport {
  const reports: Record<string, DataMirrorReport> = {
    Google: {
      company: "Google",
      summary: "Google has 4 years of location history, 312 ad interest topics, 58 linked devices, and 9,421 search & activity events stored against your account. Your contact graph of 247 people has been retained since 2022.",
      stats: [
        { label: "Location history events", value: "4,832", icon: "" },
        { label: "Ad interest topics",       value: "312",   icon: "" },
        { label: "Linked devices",           value: "58",    icon: "" },
        { label: "Activity events",          value: "9,421", icon: "" },
        { label: "Uploaded contacts",        value: "247",   icon: "" },
        { label: "Years of data retained",   value: "4 yrs", icon: "" },
      ],
      timeline: [
        { year: "2021", event: "Location tracking became active across 3 devices",           severity: "high"   },
        { year: "2022", event: "Contact graph uploaded and stored (247 contacts)",            severity: "high"   },
        { year: "2023", event: "Ad interest profile expanded to 312 topics",                 severity: "medium" },
        { year: "2024", event: "14 old inactive devices still retained in records",           severity: "low"    },
      ],
      thirdParties: ["DoubleClick", "Google Ads", "Firebase Analytics", "YouTube Analytics", "Google Marketing Platform"],
      recommendations: [
        { action: "Delete location history at myaccount.google.com → Data & Privacy → Location History", priority: "high"   },
        { action: "Clear your ad interest profile at myadcenter.google.com",                              priority: "high"   },
        { action: "Delete uploaded contact graph under Google Contacts settings",                          priority: "high"   },
        { action: "Remove inactive devices from your account",                                             priority: "medium" },
        { action: "Pause Web & App Activity tracking",                                                     priority: "medium" },
        { action: "Request deletion of historical activity logs under GDPR/DPDP",                          priority: "low"    },
      ],
      authorizedApps: [
        { app: "Notion",   grantedDate: "2022-03-14", scopes: ["See your email address", "See your personal info"]                          },
        { app: "Slack",    grantedDate: "2021-07-22", scopes: ["Read your email", "View your Google Drive files"]                            },
        { app: "Zapier",   grantedDate: "2020-11-05", scopes: ["Manage your calendar", "Read your contacts", "Read your email"]              },
        { app: "Figma",    grantedDate: "2022-01-10", scopes: ["See your email address"]                                                     },
        { app: "Linear",   grantedDate: "2023-02-28", scopes: ["See your email address", "View your Google Drive files"]                     },
        { app: "Zoom",     grantedDate: "2021-04-15", scopes: ["View and edit your Google Calendar"]                                         },
      ],
    },
    Instagram: {
      company: "Instagram",
      summary: "Instagram has retained 3 years of your activity including 1,847 posts you've liked, 284 accounts you've followed and unfollowed, your inferred ad profile with 89 interest categories, and login history across 12 devices.",
      stats: [
        { label: "Posts liked",                value: "1,847", icon: "" },
        { label: "Ad interest categories",     value: "89",    icon: "" },
        { label: "Devices logged in from",     value: "12",    icon: "" },
        { label: "Accounts followed/unfollowed", value: "284", icon: "" },
        { label: "Stories viewed",             value: "5,203", icon: "" },
        { label: "Messages retained",          value: "3,891", icon: "" },
      ],
      timeline: [
        { year: "2021", event: "Ad interest profile created from browsing behavior",          severity: "high"   },
        { year: "2022", event: "Phone contact list uploaded and matched to accounts",          severity: "high"   },
        { year: "2023", event: "Location data inferred from photo metadata",                  severity: "medium" },
        { year: "2024", event: "Old device sessions from 8 inactive devices still stored",    severity: "low"    },
      ],
      thirdParties: ["Meta Audience Network", "Facebook Business", "LiveRamp", "Acxiom"],
      recommendations: [
        { action: "Clear your ad interest categories in Settings → Ads → Ad topics",                             priority: "high"   },
        { action: "Delete uploaded phone contacts under Settings → Account → Contacts syncing",                  priority: "high"   },
        { action: "Remove old device sessions under Settings → Security → Login activity",                       priority: "medium" },
        { action: "Request deletion of message history from inactive conversations",                             priority: "medium" },
        { action: "Submit GDPR/DPDP deletion request for retained activity logs",                                priority: "low"    },
      ],
    },
    LinkedIn: {
      company: "LinkedIn",
      summary: "LinkedIn has stored 5 years of your professional activity including 312 connection messages, your full job application history across 47 applications, inferenced salary data, and a detailed recruiter-visible ad profile.",
      stats: [
        { label: "Connections",               value: "847",   icon: "" },
        { label: "Job applications stored",   value: "47",    icon: "" },
        { label: "Ad targeting attributes",   value: "156",   icon: "" },
        { label: "Profile views tracked",     value: "2,341", icon: "" },
        { label: "Messages retained",         value: "312",   icon: "" },
        { label: "Years of data",             value: "5 yrs", icon: "" },
      ],
      timeline: [
        { year: "2020", event: "Job application history tracking began",                       severity: "medium" },
        { year: "2021", event: "Salary inference profile built from job titles and connections", severity: "high"   },
        { year: "2022", event: "Ad targeting profile expanded to 156 attributes",              severity: "high"   },
        { year: "2024", event: "Old email addresses still retained on account",                severity: "low"    },
      ],
      thirdParties: ["LinkedIn Audience Network", "Microsoft Advertising", "Bing Ads", "LiveRamp"],
      recommendations: [
        { action: "Opt out of salary data inference under Settings → Privacy → Profile visibility", priority: "high"   },
        { action: "Clear ad targeting attributes under Settings → Advertising data",                priority: "high"   },
        { action: "Delete old job application data via Settings → Job seeking preferences",         priority: "medium" },
        { action: "Remove old email addresses retained on your account",                            priority: "medium" },
        { action: "Request GDPR data deletion for pre-2022 activity",                              priority: "low"    },
      ],
    },
    Amazon: {
      company: "Amazon",
      summary: "Amazon has 7 years of your purchase history, 4,219 browsing events, all your Alexa voice commands retained since 2020, and a detailed purchase-behavior ad profile shared with third-party sellers.",
      stats: [
        { label: "Orders in history",         value: "634",    icon: "" },
        { label: "Browsing events tracked",   value: "4,219",  icon: "" },
        { label: "Alexa voice commands",      value: "1,847",  icon: "" },
        { label: "Wishlist items retained",   value: "203",    icon: "" },
        { label: "Addresses stored",          value: "7",      icon: "" },
        { label: "Years of purchase data",    value: "7 yrs",  icon: "" },
      ],
      timeline: [
        { year: "2020", event: "Alexa voice command logging enabled across 2 devices",                   severity: "high"   },
        { year: "2021", event: "Purchase behavior profile shared with third-party marketplace sellers",   severity: "high"   },
        { year: "2022", event: "Browsing history used to build predictive purchase model",               severity: "medium" },
        { year: "2024", event: "5 old delivery addresses still retained on account",                     severity: "low"    },
      ],
      thirdParties: ["Amazon DSP", "Amazon Attribution", "IMDb", "Twitch", "AWS Advertising"],
      recommendations: [
        { action: "Delete all Alexa voice recordings at alexa.amazon.com → Review Voice History",        priority: "high"   },
        { action: "Opt out of interest-based ads under Account → Advertising Preferences",               priority: "high"   },
        { action: "Remove old delivery addresses no longer in use",                                      priority: "medium" },
        { action: "Clear browsing history under Account → Browsing History → Manage History",            priority: "medium" },
        { action: "Request deletion of purchase behavior profile data",                                  priority: "low"    },
      ],
    },
    Spotify: {
      company: "Spotify",
      summary: "Spotify has retained your complete streaming history — 28,441 track plays, your inferred mood and personality profile, listening pattern data used for ad targeting, and search history across 3 devices.",
      stats: [
        { label: "Track plays recorded",       value: "28,441", icon: "" },
        { label: "Playlists created",          value: "47",     icon: "" },
        { label: "Inferred mood tags",         value: "34",     icon: "" },
        { label: "Search history events",      value: "1,203",  icon: "" },
        { label: "Podcast episodes played",    value: "312",    icon: "" },
        { label: "Years of stream history",    value: "6 yrs",  icon: "" },
      ],
      timeline: [
        { year: "2019", event: "Listening behavior analysis began for ad targeting",                    severity: "medium" },
        { year: "2021", event: "Mood and personality profile inferred from listening patterns",         severity: "high"   },
        { year: "2022", event: "Location data inferred from playlist usage timing",                    severity: "high"   },
        { year: "2024", event: "Full streaming history retained — no auto-deletion",                    severity: "low"    },
      ],
      thirdParties: ["Spotify Audience Network", "The Trade Desk", "Google DV360", "Nielsen"],
      recommendations: [
        { action: "Opt out of personalized ads under Privacy Settings → Tailored Ads",               priority: "high"   },
        { action: "Request deletion of inferred mood and interest profile data",                      priority: "high"   },
        { action: "Clear search history under Account → Security and Privacy",                        priority: "medium" },
        { action: "Review and revoke third-party app access under Apps settings",                     priority: "medium" },
        { action: "Submit GDPR request for deletion of pre-2021 behavioral data",                     priority: "low"    },
      ],
    },
    Uber: {
      company: "Uber",
      summary: "Uber has stored 5 years of trip data including precise pickup and drop-off coordinates for 847 trips, your home and work addresses derived from trip patterns, device fingerprint data from 6 phones, and payment method history.",
      stats: [
        { label: "Trips recorded",            value: "847",    icon: "" },
        { label: "Location points stored",    value: "12,400+",icon: "" },
        { label: "Devices fingerprinted",     value: "6",      icon: "" },
        { label: "Payment methods retained",  value: "4",      icon: "" },
        { label: "Support tickets stored",    value: "23",     icon: "" },
        { label: "Years of trip history",     value: "5 yrs",  icon: "" },
      ],
      timeline: [
        { year: "2020", event: "Home and work addresses inferred from repeated trip patterns",  severity: "high"   },
        { year: "2021", event: "Device fingerprinting expanded across 6 devices",              severity: "high"   },
        { year: "2022", event: "Trip data shared with city transit authorities",               severity: "medium" },
        { year: "2024", event: "3 expired payment methods still retained in system",           severity: "low"    },
      ],
      thirdParties: ["Google Maps", "Braintree Payments", "Segment Analytics", "AppsFlyer"],
      recommendations: [
        { action: "Request deletion of trip history older than 1 year at privacy.uber.com",             priority: "high"   },
        { action: "Remove inferred home and work addresses from your profile",                           priority: "high"   },
        { action: "Delete expired payment methods from your account",                                   priority: "medium" },
        { action: "Opt out of data sharing with transit authorities where available",                   priority: "medium" },
        { action: "Submit GDPR/DPDP request for full account data purge",                               priority: "low"    },
      ],
    },
    Other: {
      company: "Unknown Platform",
      summary: "DataReaper detected data across multiple categories in your export. Review the breakdown below and use the recommendations to reduce your exposure.",
      stats: [
        { label: "Records detected",           value: "2,300+",  icon: "" },
        { label: "Unique identifiers found",   value: "14",      icon: "" },
        { label: "Date range of data",         value: "3+ yrs",  icon: "" },
        { label: "Inferred attributes",        value: "Unknown", icon: "" },
        { label: "Third parties detected",     value: "3+",      icon: "" },
        { label: "Location records",           value: "Present", icon: "" },
      ],
      timeline: [
        { year: "2022", event: "Initial data collection began at account creation",         severity: "medium" },
        { year: "2023", event: "Behavioral data retained beyond expected window",           severity: "high"   },
        { year: "2024", event: "Third-party data sharing detected in export",               severity: "high"   },
      ],
      thirdParties: ["Unknown analytics provider", "Ad network partner", "Data broker partner"],
      recommendations: [
        { action: "Request full account deletion through the platform's privacy settings",      priority: "high"   },
        { action: "Revoke any third-party app access connected to this account",                priority: "high"   },
        { action: "Submit a GDPR/CCPA/DPDP data deletion request by email",                   priority: "medium" },
        { action: "Review and clear any synced contact or location data",                       priority: "medium" },
        { action: "Monitor for data broker listings using DataReaper's War Room",               priority: "low"    },
      ],
    },
  };

  return reports[company] ?? reports["Other"];
}

export default function AccessMirror() {
  const authenticatedEmail = useRequireAuth();

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

  if (!authenticatedEmail) {
    return null;
  }

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
