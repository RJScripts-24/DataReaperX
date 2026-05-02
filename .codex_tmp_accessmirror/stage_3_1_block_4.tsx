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
  { name: "Google",    emoji: "🔵" },
  { name: "Instagram", emoji: "📸" },
  { name: "LinkedIn",  emoji: "💼" },
  { name: "Amazon",    emoji: "📦" },
  { name: "Spotify",   emoji: "🎵" },
  { name: "Uber",      emoji: "🚗" },
  { name: "Other",     emoji: "📂" },
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
