import apiClient from "./apiClient";

// Runtime API wrappers used across the frontend. These are intentionally
// thin wrappers around `apiClient` that mirror the backend OpenAPI paths.

export async function createScan(payload: unknown) {
  const res = await apiClient.post("/v1/scans", payload);
  return res.data;
}

export async function stopScan(scanId: string, reason?: string) {
  const res = await apiClient.post(`/v1/scans/${encodeURIComponent(scanId)}/actions/stop`, {
    reason,
  });
  return res.data;
}

export async function getScan(scanId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}`);
  return res.data;
}

export async function getDashboardSummary(scanId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/dashboard/summary`);
  return res.data;
}

export async function getRadarTargets(scanId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/dashboard/radar-targets`);
  return res.data;
}

export async function getActivityLogs(scanId: string, params?: Record<string, unknown>) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/dashboard/activity-logs`, { params });
  return res.data;
}

export async function getAgentStatuses(scanId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/dashboard/agents`);
  return res.data;
}

export async function getPivotChain(scanId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/dashboard/pivot-chain`);
  return res.data;
}

export async function getIdentityGraph(scanId: string, filters?: { includePlatforms?: boolean; includeIdentity?: boolean; includeTargets?: boolean }) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/identity-graph`, { params: filters });
  return res.data;
}

export async function getIdentityGraphNode(scanId: string, nodeId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/identity-graph/nodes/${encodeURIComponent(nodeId)}`);
  return res.data;
}

export async function listEngagements(scanId: string, statuses?: string[]) {
  const params = statuses ? { statuses: statuses.join(",") } : undefined;
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/war-room/engagements`, { params });
  return res.data;
}

export async function getEngagement(scanId: string, engagementId: string) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/war-room/engagements/${encodeURIComponent(engagementId)}`);
  return res.data;
}

export async function listEngagementMessages(scanId: string, engagementId: string, params?: Record<string, unknown>) {
  const res = await apiClient.get(`/v1/scans/${encodeURIComponent(scanId)}/war-room/engagements/${encodeURIComponent(engagementId)}/messages`, { params });
  return res.data;
}

export async function createEngagementMessage(scanId: string, engagementId: string, payload: unknown) {
  const res = await apiClient.post(`/v1/scans/${encodeURIComponent(scanId)}/war-room/engagements/${encodeURIComponent(engagementId)}/messages`, payload);
  return res.data;
}

export async function escalateEngagement(scanId: string, engagementId: string, payload: unknown) {
  const res = await apiClient.post(`/v1/scans/${encodeURIComponent(scanId)}/war-room/engagements/${encodeURIComponent(engagementId)}/actions/escalate`, payload);
  return res.data;
}

export async function listResources(section?: string) {
  const res = await apiClient.get(`/v1/content/resources`, { params: section ? { section } : undefined });
  return res.data;
}

export async function resumeAgent(scanId: string) {
  const res = await apiClient.post(`/api/agent/resume`, { scanId });
  return res.data;
}

export async function createRealtimeConnection(payload: {
  scanId: string;
  channels: RealtimeChannel[];
  preferredTransport?: "websocket" | "sse";
}) {
  const res = await apiClient.post(`/v1/realtime/connection`, payload);
  return res.data;
}

// Minimal exported types used by the frontend hooks/pages. These are intentionally
// lightweight aliases to keep the runtime module focused; for stronger typing
// the generated `src/types/api.generated.ts` may be used directly.
export type CreateMessageRequest = { type: "agent" | "system"; content: string; metadata?: unknown };
export type CreateScanRequest = unknown;
export type EngagementStatus = string;
export type EscalateEngagementRequest = unknown;

export type RealtimeChannel =
  | "dashboard.summary"
  | "dashboard.radar"
  | "dashboard.activity"
  | "dashboard.agents"
  | "identity.graph"
  | "warroom.engagements"
  | "warroom.messages"
  | "scans.lifecycle";

// Legacy shield helpers (left in place)
export async function requestShieldToken(): Promise<{
  shield_token: string;
  expires_in: number;
}> {
  const res = await apiClient.post("/api/shield/token");
  return res.data;
}

export async function fetchShieldStatus(): Promise<{
  active: boolean;
  last_seen: string | null;
}> {
  const res = await apiClient.get("/api/shield/status");
  return res.data;
}

export function downloadShieldExtension(): void {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  window.location.href = `${apiBase}/api/shield/download`;
}