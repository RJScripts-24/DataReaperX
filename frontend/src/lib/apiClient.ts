/**
 * Centralized Axios client for DataReaper frontend API access.
 * - Uses VITE_API_BASE_URL
 * - Injects X-Session-Id from sessionStorage
 * - Normalizes backend errors to ApiClientError
 */

import axios, { AxiosError, AxiosHeaders } from "axios";

export type ApiErrorDetails = Record<string, unknown>[];

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: ApiErrorDetails;
}

export class ApiClientError extends Error implements ApiErrorShape {
  code: string;
  details?: ApiErrorDetails;
  status?: number;

  constructor(payload: ApiErrorShape & { status?: number }) {
    super(payload.message);
    this.name = "ApiClientError";
    this.code = payload.code;
    this.message = payload.message;
    this.details = payload.details;
    this.status = payload.status;
  }
}

const SESSION_STORAGE_KEY = "dr_session_id";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const sessionId = typeof window !== "undefined" ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;
  if (sessionId) {
    const headers = config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers);
    headers.set("X-Session-Id", sessionId);
    config.headers = headers;
  }
  return config;
});

function normalizeApiError(error: AxiosError): ApiClientError {
  const status = error.response?.status;
  const payload = error.response?.data as
    | { code?: string; message?: string; details?: ApiErrorDetails; detail?: string | ApiErrorShape }
    | undefined;

  if (payload?.code && payload?.message) {
    return new ApiClientError({
      code: payload.code,
      message: payload.message,
      details: payload.details,
      status,
    });
  }

  if (typeof payload?.detail === "object" && payload.detail && "message" in payload.detail) {
    const detail = payload.detail as ApiErrorShape;
    return new ApiClientError({
      code: detail.code ?? "api_error",
      message: detail.message,
      details: detail.details,
      status,
    });
  }

  if (typeof payload?.detail === "string") {
    return new ApiClientError({
      code: status ? `http_${status}` : "api_error",
      message: payload.detail,
      status,
    });
  }

  return new ApiClientError({
    code: status ? `http_${status}` : "network_error",
    message: error.message || "Request failed.",
    status,
  });
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(normalizeApiError(error))
);

export default apiClient;
