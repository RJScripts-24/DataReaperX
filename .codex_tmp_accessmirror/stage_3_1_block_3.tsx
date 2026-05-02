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
