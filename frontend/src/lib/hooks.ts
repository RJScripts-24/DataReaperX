import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createEngagementMessage,
  createScan,
  escalateEngagement,
  getActivityLogs,
  getAgentStatuses,
  getDashboardSummary,
  getEngagement,
  getIdentityGraph,
  getIdentityGraphNode,
  getPivotChain,
  getRadarTargets,
  getScan,
  listEngagementMessages,
  listEngagements,
  listResources,
  type CreateMessageRequest,
  type CreateScanRequest,
  type EngagementStatus,
  type EscalateEngagementRequest,
} from "./api";

export const dataReaperQueryKeys = {
  resources: ["content", "resources"] as const,
  scan: (scanId: string) => ["scan", scanId] as const,
  dashboardSummary: (scanId: string) => ["dashboard", scanId, "summary"] as const,
  radarTargets: (scanId: string) => ["dashboard", scanId, "radar-targets"] as const,
  activityLogs: (scanId: string) => ["dashboard", scanId, "activity-logs"] as const,
  agentStatuses: (scanId: string) => ["dashboard", scanId, "agent-statuses"] as const,
  pivotChain: (scanId: string) => ["dashboard", scanId, "pivot-chain"] as const,
  identityGraph: (
    scanId: string,
    filters: { includePlatforms: boolean; includeIdentity: boolean; includeTargets: boolean }
  ) => ["identity-graph", scanId, filters.includePlatforms, filters.includeIdentity, filters.includeTargets] as const,
  identityGraphNode: (scanId: string, nodeId: string) => ["identity-graph", scanId, "node", nodeId] as const,
  engagements: (scanId: string, statuses?: EngagementStatus[]) => ["war-room", scanId, "engagements", statuses?.join(",") ?? "all"] as const,
  engagementDetail: (scanId: string, engagementId: string) => ["war-room", scanId, "engagement", engagementId] as const,
  engagementMessages: (scanId: string, engagementId: string) => ["war-room", scanId, "messages", engagementId] as const,
};

export function useLandingResourcesQuery() {
  return useQuery({
    queryKey: dataReaperQueryKeys.resources,
    queryFn: () => listResources("framework"),
  });
}

export function useCreateScanMutation() {
  return useMutation({
    mutationFn: (payload: CreateScanRequest) => createScan(payload),
  });
}

export function useScanStatusQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.scan(scanId) : ["scan", "none"],
    queryFn: () => getScan(scanId as string),
    enabled: Boolean(scanId),
    refetchInterval: 1200,
  });
}

export function useDashboardSummaryQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.dashboardSummary(scanId) : ["dashboard", "none", "summary"],
    queryFn: () => getDashboardSummary(scanId as string),
    enabled: Boolean(scanId),
    refetchInterval: 10000,
  });
}

export function useRadarTargetsQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.radarTargets(scanId) : ["dashboard", "none", "radar-targets"],
    queryFn: () => getRadarTargets(scanId as string),
    enabled: Boolean(scanId),
    refetchInterval: 10000,
  });
}

export function useActivityLogsQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.activityLogs(scanId) : ["dashboard", "none", "activity-logs"],
    queryFn: () => getActivityLogs(scanId as string, { limit: 25 }),
    enabled: Boolean(scanId),
    refetchInterval: 8000,
  });
}

export function useAgentStatusesQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.agentStatuses(scanId) : ["dashboard", "none", "agent-statuses"],
    queryFn: () => getAgentStatuses(scanId as string),
    enabled: Boolean(scanId),
    refetchInterval: 10000,
  });
}

export function usePivotChainQuery(scanId: string | null) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.pivotChain(scanId) : ["dashboard", "none", "pivot-chain"],
    queryFn: () => getPivotChain(scanId as string),
    enabled: Boolean(scanId),
    refetchInterval: 12000,
  });
}

export function useIdentityGraphQuery(
  scanId: string | null,
  filters: { includePlatforms: boolean; includeIdentity: boolean; includeTargets: boolean }
) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.identityGraph(scanId, filters) : ["identity-graph", "none"],
    queryFn: () => getIdentityGraph(scanId as string, filters),
    enabled: Boolean(scanId),
    refetchInterval: 12000,
  });
}

export function useIdentityGraphNodeQuery(scanId: string | null, nodeId: string | null) {
  return useQuery({
    queryKey: scanId && nodeId ? dataReaperQueryKeys.identityGraphNode(scanId, nodeId) : ["identity-graph", "none", "node"],
    queryFn: () => getIdentityGraphNode(scanId as string, nodeId as string),
    enabled: Boolean(scanId && nodeId),
  });
}

export function useEngagementsQuery(scanId: string | null, statuses?: EngagementStatus[]) {
  return useQuery({
    queryKey: scanId ? dataReaperQueryKeys.engagements(scanId, statuses) : ["war-room", "none", "engagements"],
    queryFn: () => listEngagements(scanId as string, statuses),
    enabled: Boolean(scanId),
    refetchInterval: 3000,
  });
}

export function useEngagementDetailQuery(scanId: string | null, engagementId: string | null) {
  return useQuery({
    queryKey: scanId && engagementId ? dataReaperQueryKeys.engagementDetail(scanId, engagementId) : ["war-room", "none", "engagement"],
    queryFn: () => getEngagement(scanId as string, engagementId as string),
    enabled: Boolean(scanId && engagementId),
    refetchInterval: 10000,
  });
}

export function useEngagementMessagesQuery(scanId: string | null, engagementId: string | null) {
  return useQuery({
    queryKey: scanId && engagementId ? dataReaperQueryKeys.engagementMessages(scanId, engagementId) : ["war-room", "none", "messages"],
    queryFn: () => listEngagementMessages(scanId as string, engagementId as string, { limit: 100 }),
    enabled: Boolean(scanId && engagementId),
    refetchInterval: 10000,
  });
}

export function useCreateEngagementMessageMutation(scanId: string | null, engagementId: string | null) {
  return useMutation({
    mutationFn: (payload: CreateMessageRequest) =>
      createEngagementMessage(scanId as string, engagementId as string, payload),
  });
}

export function useEscalateEngagementMutation(scanId: string | null, engagementId: string | null) {
  return useMutation({
    mutationFn: (payload: EscalateEngagementRequest) =>
      escalateEngagement(scanId as string, engagementId as string, payload),
  });
}
