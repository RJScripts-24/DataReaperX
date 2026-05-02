/**
 * Manages anonymous session lifecycle for API requests.
 * Session creation is idempotent and shared across concurrent callers.
 */

import apiClient from "./apiClient";
import type { components, operations } from "../types/api.generated";

const SESSION_STORAGE_KEY = "dr_session_id";

type CreateSessionRequest = operations["createSession"]["requestBody"]["content"]["application/json"];
type CreateSessionResponse = components["schemas"]["CreateSessionResponse"];

let sessionInitializationPromise: Promise<string> | null = null;

export function getSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(SESSION_STORAGE_KEY);
}

export function clearSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function initializeSession(): Promise<string> {
  const existing = getSessionId();
  if (existing) {
    return existing;
  }

  if (sessionInitializationPromise) {
    return sessionInitializationPromise;
  }

  sessionInitializationPromise = (async () => {
    const payload: CreateSessionRequest = {
      client: {
        appVersion: "web-1.0.0",
        platform: "browser",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      },
    };

    const response = await apiClient.post<CreateSessionResponse>("/v1/sessions", payload);
    const sessionId = response.data.sessionId;

    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }

    return sessionId;
  })();

  try {
    return await sessionInitializationPromise;
  } finally {
    sessionInitializationPromise = null;
  }
}
