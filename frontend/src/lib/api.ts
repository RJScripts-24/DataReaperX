import apiClient from "./apiClient";
import type { components, operations } from "../types/api.generated";

export type Scan = components["schemas"]["Scan"];
export type DashboardSummary = components["schemas"]["DashboardSummary"];
export type PivotChain = components["schemas"]["PivotChain"];
export type IdentityGraphPayload = components["schemas"]["IdentityGraphPayload"];
export type IdentityGraphNode = components["schemas"]["IdentityGraphNode"];
export type EngagementDetail = components["schemas"]["EngagementDetail"];
export type EngagementMessage = components["schemas"]["EngagementMessage"];
export type EngagementStatus = components["schemas"]["EngagementStatus"];
export type ResourceCard = components["schemas"]["ResourceCard"];
export type RealtimeChannel = components["schemas"]["CreateRealtimeConnectionRequest"]["channels"][number];

export type CreateScanRequest = components["schemas"]["CreateScanRequest"];
export type CreateScanResponse = components["schemas"]["CreateScanResponse"];
export type CreateMessageRequest = components["schemas"]["CreateMessageRequest"];
export type EscalateEngagementRequest = components["schemas"]["EscalateEngagementRequest"];
export type CreateRealtimeConnectionRequest = components["schemas"]["CreateRealtimeConnectionRequest"];
export type CreateRealtimeConnectionResponse = components["schemas"]["CreateRealtimeConnectionResponse"];

export type RadarTargetsResponse = operations["getRadarTargets"]["responses"][200]["content"]["application/json"];
export type AgentStatusesResponse = operations["getAgentStatuses"]["responses"][200]["content"]["application/json"];
export type ActivityLogPage = components["schemas"]["ActivityLogPage"];
export type ListEngagementsResponse = operations["listEngagements"]["responses"][200]["content"]["application/json"];
export type MessagePage = components["schemas"]["MessagePage"];
export type ResourceListResponse = operations["listResources"]["responses"][200]["content"]["application/json"];

export async function createScan(payload: CreateScanRequest): Promise<CreateScanResponse> {
  const { data } = await apiClient.post<CreateScanResponse>("/v1/scans", payload);
  return data;
}

export async function stopScan(
  scanId: string,
  reason?: string
): Promise<{ scanId: string; status: string; currentStage: string; progress: number }> {
  const { data } = await apiClient.post<{ scanId: string; status: string; currentStage: string; progress: number }>(
    `/v1/scans/${scanId}/actions/stop`,
    { reason: reason ?? null }
  );
  return data;
}

export async function getScan(scanId: string): Promise<Scan> {
  const { data } = await apiClient.get<Scan>(`/v1/scans/${scanId}`);
  return data;
}

export async function getDashboardSummary(scanId: string): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>(`/v1/scans/${scanId}/dashboard/summary`);
  return data;
}

export async function getRadarTargets(scanId: string, limit = 50): Promise<RadarTargetsResponse> {
  const { data } = await apiClient.get<RadarTargetsResponse>(`/v1/scans/${scanId}/dashboard/radar-targets`, {
    params: { limit },
  });
  return data;
}

export async function getActivityLogs(
  scanId: string,
  options?: { cursor?: string; limit?: number; types?: string[] }
): Promise<ActivityLogPage> {
  const { data } = await apiClient.get<ActivityLogPage>(`/v1/scans/${scanId}/dashboard/activity-logs`, {
    params: {
      cursor: options?.cursor,
      limit: options?.limit,
      types: options?.types?.length ? options.types.join(",") : undefined,
    },
  });
  return data;
}

export async function getAgentStatuses(scanId: string): Promise<AgentStatusesResponse> {
  const { data } = await apiClient.get<AgentStatusesResponse>(`/v1/scans/${scanId}/dashboard/agents`);
  return data;
}

export async function getPivotChain(scanId: string): Promise<PivotChain> {
  const { data } = await apiClient.get<PivotChain>(`/v1/scans/${scanId}/dashboard/pivot-chain`);
  return data;
}

export async function getIdentityGraph(
  scanId: string,
  filters: { includePlatforms: boolean; includeIdentity: boolean; includeTargets: boolean }
): Promise<IdentityGraphPayload> {
  const { data } = await apiClient.get<IdentityGraphPayload>(`/v1/scans/${scanId}/identity-graph`, {
    params: filters,
  });
  return data;
}

export async function getIdentityGraphNode(scanId: string, nodeId: string): Promise<IdentityGraphNode> {
  const { data } = await apiClient.get<IdentityGraphNode>(`/v1/scans/${scanId}/identity-graph/nodes/${nodeId}`);
  return data;
}

export async function listEngagements(
  scanId: string,
  statuses?: EngagementStatus[],
  options?: { cursor?: string; limit?: number }
): Promise<ListEngagementsResponse> {
  const { data } = await apiClient.get<ListEngagementsResponse>(`/v1/scans/${scanId}/war-room/engagements`, {
    params: {
      statuses: statuses?.length ? statuses.join(",") : undefined,
      cursor: options?.cursor,
      limit: options?.limit ?? 200,
    },
  });
  return data;
}

export async function getEngagement(scanId: string, engagementId: string): Promise<EngagementDetail> {
  const { data } = await apiClient.get<EngagementDetail>(`/v1/scans/${scanId}/war-room/engagements/${engagementId}`);
  return data;
}

export async function listEngagementMessages(
  scanId: string,
  engagementId: string,
  options?: { cursor?: string; limit?: number }
): Promise<MessagePage> {
  const { data } = await apiClient.get<MessagePage>(
    `/v1/scans/${scanId}/war-room/engagements/${engagementId}/messages`,
    {
      params: {
        cursor: options?.cursor,
        limit: options?.limit,
      },
    }
  );
  return data;
}

export async function createEngagementMessage(
  scanId: string,
  engagementId: string,
  payload: CreateMessageRequest
): Promise<EngagementMessage> {
  const { data } = await apiClient.post<EngagementMessage>(
    `/v1/scans/${scanId}/war-room/engagements/${engagementId}/messages`,
    payload
  );
  return data;
}

export async function escalateEngagement(
  scanId: string,
  engagementId: string,
  payload: EscalateEngagementRequest
): Promise<components["schemas"]["EscalateEngagementResponse"]> {
  const { data } = await apiClient.post<components["schemas"]["EscalateEngagementResponse"]>(
    `/v1/scans/${scanId}/war-room/engagements/${engagementId}/actions/escalate`,
    payload
  );
  return data;
}

export async function listResources(section = "framework"): Promise<ResourceListResponse> {
  const { data } = await apiClient.get<ResourceListResponse>("/v1/content/resources", {
    params: { section },
  });
  return data;
}

export async function createRealtimeConnection(
  payload: CreateRealtimeConnectionRequest
): Promise<CreateRealtimeConnectionResponse> {
  const { data } = await apiClient.post<CreateRealtimeConnectionResponse>("/v1/realtime/connection", payload);
  return data;
}

export async function resumeAgent(scanId: string): Promise<{ status: string }> {
  const { data } = await apiClient.post<{ status: string }>("/api/agent/resume", { scanId });
  return data;
}
