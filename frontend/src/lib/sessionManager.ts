import apiClient from "./apiClient";

const SESSION_ID_STORAGE_KEY = "dr_session_id";
const SESSION_EMAIL_STORAGE_KEY = "dr_session_email";
const SESSION_GOOGLE_SUB_STORAGE_KEY = "dr_session_google_sub";
const SESSION_EXPIRY_STORAGE_KEY = "dr_session_expires_at";
const SCAN_PENDING_STORAGE_KEY = "dr_scan_pending";

export type AuthSession = {
  sessionId: string;
  email: string;
  googleSub: string;
  expiresAt: string;
};

type CreateSessionResponse = {
  sessionId: string;
  email: string;
  googleSub: string;
  expiresAt: string;
};

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function normalizeEmail(value: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function readSessionFromStorage(): AuthSession | null {
  if (!hasWindow()) {
    return null;
  }

  const sessionId = sessionStorage.getItem(SESSION_ID_STORAGE_KEY);
  const email = sessionStorage.getItem(SESSION_EMAIL_STORAGE_KEY);
  const googleSub = sessionStorage.getItem(SESSION_GOOGLE_SUB_STORAGE_KEY);
  const expiresAt = sessionStorage.getItem(SESSION_EXPIRY_STORAGE_KEY);

  if (!sessionId || !email || !googleSub || !expiresAt) {
    return null;
  }

  return {
    sessionId,
    email: normalizeEmail(email),
    googleSub,
    expiresAt,
  };
}

function persistSession(session: AuthSession): void {
  if (!hasWindow()) {
    return;
  }

  sessionStorage.setItem(SESSION_ID_STORAGE_KEY, session.sessionId);
  sessionStorage.setItem(SESSION_EMAIL_STORAGE_KEY, normalizeEmail(session.email));
  sessionStorage.setItem(SESSION_GOOGLE_SUB_STORAGE_KEY, session.googleSub);
  sessionStorage.setItem(SESSION_EXPIRY_STORAGE_KEY, session.expiresAt);
}

function isExpired(expiresAt: string): boolean {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) {
    return true;
  }
  return Date.now() >= expiry;
}

export function clearSession(): void {
  if (!hasWindow()) {
    return;
  }
  sessionStorage.removeItem(SESSION_ID_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_EMAIL_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_GOOGLE_SUB_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_STORAGE_KEY);
  sessionStorage.removeItem(SCAN_PENDING_STORAGE_KEY);
  localStorage.removeItem("dr_shield_ui_active");
}

export function getAuthSession(): AuthSession | null {
  const session = readSessionFromStorage();
  if (!session) {
    return null;
  }
  if (isExpired(session.expiresAt)) {
    clearSession();
    return null;
  }
  return session;
}

export function getSessionId(): string | null {
  return getAuthSession()?.sessionId ?? null;
}

export function getAuthenticatedEmail(): string | null {
  return getAuthSession()?.email ?? null;
}

export function isAuthenticated(): boolean {
  return getAuthSession() !== null;
}

export function setScanPending(isPending: boolean): void {
  if (!hasWindow()) {
    return;
  }
  if (isPending) {
    sessionStorage.setItem(SCAN_PENDING_STORAGE_KEY, "true");
  } else {
    sessionStorage.removeItem(SCAN_PENDING_STORAGE_KEY);
  }
}

export function isScanPending(): boolean {
  if (!hasWindow()) {
    return false;
  }
  return sessionStorage.getItem(SCAN_PENDING_STORAGE_KEY) === "true";
}

export async function createGoogleSession(idToken: string): Promise<AuthSession> {
  const trimmedToken = idToken.trim();
  if (!trimmedToken) {
    throw new Error("Missing Google credential.");
  }

  const payload = {
    idToken: trimmedToken,
    client: {
      appVersion: "web-1.0.0",
      platform: "browser",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    },
  };

  const response = await apiClient.post<CreateSessionResponse>("/v1/sessions", payload);
  const session: AuthSession = {
    sessionId: response.data.sessionId,
    email: normalizeEmail(response.data.email),
    googleSub: response.data.googleSub,
    expiresAt: response.data.expiresAt,
  };
  persistSession(session);
  return session;
}
