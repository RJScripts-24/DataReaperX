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
        { label: "Location history events", value: "4,832", icon: "📍" },
        { label: "Ad interest topics",       value: "312",   icon: "🎯" },
        { label: "Linked devices",           value: "58",    icon: "📱" },
        { label: "Activity events",          value: "9,421", icon: "🔍" },
        { label: "Uploaded contacts",        value: "247",   icon: "👥" },
        { label: "Years of data retained",   value: "4 yrs", icon: "📅" },
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
        { label: "Posts liked",                value: "1,847", icon: "❤️" },
        { label: "Ad interest categories",     value: "89",    icon: "🎯" },
        { label: "Devices logged in from",     value: "12",    icon: "📱" },
        { label: "Accounts followed/unfollowed", value: "284", icon: "👤" },
        { label: "Stories viewed",             value: "5,203", icon: "👁️" },
        { label: "Messages retained",          value: "3,891", icon: "💬" },
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
        { label: "Connections",               value: "847",   icon: "🤝" },
        { label: "Job applications stored",   value: "47",    icon: "📋" },
        { label: "Ad targeting attributes",   value: "156",   icon: "🎯" },
        { label: "Profile views tracked",     value: "2,341", icon: "👁️" },
        { label: "Messages retained",         value: "312",   icon: "💬" },
        { label: "Years of data",             value: "5 yrs", icon: "📅" },
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
        { label: "Orders in history",         value: "634",    icon: "📦" },
        { label: "Browsing events tracked",   value: "4,219",  icon: "🔍" },
        { label: "Alexa voice commands",      value: "1,847",  icon: "🎙️" },
        { label: "Wishlist items retained",   value: "203",    icon: "⭐" },
        { label: "Addresses stored",          value: "7",      icon: "🏠" },
        { label: "Years of purchase data",    value: "7 yrs",  icon: "📅" },
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
        { label: "Track plays recorded",       value: "28,441", icon: "🎵" },
        { label: "Playlists created",          value: "47",     icon: "📋" },
        { label: "Inferred mood tags",         value: "34",     icon: "🧠" },
        { label: "Search history events",      value: "1,203",  icon: "🔍" },
        { label: "Podcast episodes played",    value: "312",    icon: "🎙️" },
        { label: "Years of stream history",    value: "6 yrs",  icon: "📅" },
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
        { label: "Trips recorded",            value: "847",    icon: "🚗" },
        { label: "Location points stored",    value: "12,400+",icon: "📍" },
        { label: "Devices fingerprinted",     value: "6",      icon: "📱" },
        { label: "Payment methods retained",  value: "4",      icon: "💳" },
        { label: "Support tickets stored",    value: "23",     icon: "🎫" },
        { label: "Years of trip history",     value: "5 yrs",  icon: "📅" },
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
        { label: "Records detected",           value: "2,300+",  icon: "📄" },
        { label: "Unique identifiers found",   value: "14",      icon: "🔑" },
        { label: "Date range of data",         value: "3+ yrs",  icon: "📅" },
        { label: "Inferred attributes",        value: "Unknown", icon: "🧠" },
        { label: "Third parties detected",     value: "3+",      icon: "🔗" },
        { label: "Location records",           value: "Present", icon: "📍" },
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
