import { useCallback, useEffect, useMemo, useState } from "react";

import apiClient from "./apiClient";
import type { RealtimeChannel } from "./api";
import { useRealtimeSubscription, type RealtimeConnectionStatus } from "./wsClient";
import type { SleuthEvent } from "../types/ws";

const DASHBOARD_LOG_PREFIX = "[datareaper:dashboard]";
const DASHBOARD_DEBUG_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEBUG_DASHBOARD === "true";

function dashboardDebug(message: string, context?: Record<string, unknown>): void {
  if (!DASHBOARD_DEBUG_ENABLED) {
    return;
  }
  if (context) {
    console.debug(`${DASHBOARD_LOG_PREFIX} ${message}`, context);
    return;
  }
  console.debug(`${DASHBOARD_LOG_PREFIX} ${message}`);
}

function dashboardWarn(message: string, context?: Record<string, unknown>): void {
  if (context) {
    console.warn(`${DASHBOARD_LOG_PREFIX} ${message}`, context);
    return;
  }
  console.warn(`${DASHBOARD_LOG_PREFIX} ${message}`);
}

function dashboardError(message: string, context?: Record<string, unknown>): void {
  if (context) {
    console.error(`${DASHBOARD_LOG_PREFIX} ${message}`, context);
    return;
  }
  console.error(`${DASHBOARD_LOG_PREFIX} ${message}`);
}

function toErrorContext(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) {
    return { error: String(error) };
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown; data?: unknown };
    config?: { url?: unknown; method?: unknown };
  };

  return {
    name: typeof candidate.name === "string" ? candidate.name : "UnknownError",
    message: typeof candidate.message === "string" ? candidate.message : String(error),
    code: candidate.code,
    status: candidate.response?.status,
    url: candidate.config?.url,
    method: candidate.config?.method,
    responseData: candidate.response?.data,
  };
}

type DashboardStat = {
  title: string;
  value: number;
};

type DashboardRadarTarget = {
  id: string;
  broker: string;
  status: string;
  angle: number;
  distance: number;
  severity: string;
};

type DashboardActivityItem = {
  id: string;
  type: string;
  message: string;
  created_at: string;
};

type DashboardAgentStatus = {
  name: string;
  status: string;
  detail: string;
};

type DashboardResponse = {
  scan_id: string;
  stats: DashboardStat[];
  threat_breakdown: Record<string, number>;
  radar_targets: DashboardRadarTarget[];
  activity_feed: DashboardActivityItem[];
  agent_statuses: DashboardAgentStatus[];
};

type PivotChainResponse = {
  columns?: Array<{ label?: string; values?: string[] }>;
};

type ScanStatusResponse = {
  status?: string;
};

export type RadarDot = {
  id: string;
  angle: number;
  distance: number;
  broker: string;
  status: string;
  color: string;
  type: "email" | "phone" | "location";
};

export type ActivityItem = {
  id: string;
  type: string;
  message: string;
  color: string;
  createdAt: string;
};

export type AgentStatus = {
  mode: string;
  name: string;
  status: string;
  task: string;
  progress: number;
};

type AgentMode = "sleuth" | "legal" | "communications";

export interface LiveDashboardState {
  brokerCount: number;
  exposureCount: number;
  deletionCount: number;
  disputeCount: number;
  threatBreakdown: { email: number; phone: number; location: number };
  radarTargets: RadarDot[];
  activityFeed: ActivityItem[];
  agentStatuses: AgentStatus[];
  pivotGraph: {
    emails: string[];
    usernames: string[];
    platforms: string[];
    brokers: string[];
  };
  isLive: boolean;
}

const RADAR_COLORS: Record<"email" | "phone" | "location", string> = {
  email: "#4a6fa5",
  phone: "#d17a22",
  location: "#b94a48",
};

const EMPTY_STATE: LiveDashboardState = {
  brokerCount: 0,
  exposureCount: 0,
  deletionCount: 0,
  disputeCount: 0,
  threatBreakdown: { email: 0, phone: 0, location: 0 },
  radarTargets: [],
  activityFeed: [],
  agentStatuses: [],
  pivotGraph: {
    emails: [],
    usernames: [],
    platforms: [],
    brokers: [],
  },
  isLive: false,
};

const ACTIVE_SCAN_STATUSES = new Set(["queued", "discovering", "identifying", "engaging", "stabilizing"]);

function isActiveScanStatus(status: string | undefined): boolean {
  return ACTIVE_SCAN_STATUSES.has(String(status || "").trim().toLowerCase());
}

function brokerDiscoveryKey(value: { broker: string }): string {
  return String(value.broker || "").trim().toLowerCase();
}

const DASHBOARD_CACHE_KEY_PREFIX = "datareaper.dashboard.state.v1";

function dashboardCacheKey(scanId: string): string {
  return `${DASHBOARD_CACHE_KEY_PREFIX}:${scanId}`;
}

function loadCachedDashboardState(scanId: string): LiveDashboardState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(dashboardCacheKey(scanId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LiveDashboardState;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    return {
      ...EMPTY_STATE,
      ...parsed,
      threatBreakdown: {
        ...EMPTY_STATE.threatBreakdown,
        ...(parsed.threatBreakdown || {}),
      },
      pivotGraph: {
        ...EMPTY_STATE.pivotGraph,
        ...(parsed.pivotGraph || {}),
      },
      isLive: false,
    };
  } catch (error) {
    dashboardWarn("failed to load cached dashboard state", {
      scanId,
      ...toErrorContext(error),
    });
    return null;
  }
}

function saveCachedDashboardState(scanId: string, state: LiveDashboardState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      dashboardCacheKey(scanId),
      JSON.stringify({
        ...state,
        isLive: false,
      })
    );
  } catch (error) {
    dashboardWarn("failed to save cached dashboard state", {
      scanId,
      ...toErrorContext(error),
    });
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDistance(distance: number): number {
  if (distance <= 1) {
    return Math.max(5, Math.round(distance * 100));
  }
  return distance;
}

function inferThreatTypeFromData(dataTypes: string[]): "email" | "phone" | "location" {
  const joined = dataTypes.join(" ").toLowerCase();
  if (joined.includes("phone")) {
    return "phone";
  }
  if (joined.includes("location") || joined.includes("address")) {
    return "location";
  }
  return "email";
}

function inferThreatTypeFromSeverity(
  severity: string,
  index: number
): "email" | "phone" | "location" {
  const normalized = severity.toLowerCase();
  if (normalized === "critical") {
    return "location";
  }
  if (normalized === "high") {
    return "phone";
  }
  if (normalized === "medium") {
    return "email";
  }

  const fallbackTypes: Array<"email" | "phone" | "location"> = ["email", "phone", "location"];
  return fallbackTypes[index % fallbackTypes.length] ?? "email";
}

function colorForType(type: "email" | "phone" | "location"): string {
  return RADAR_COLORS[type];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function modeFromAgentName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("sleuth")) {
    return "sleuth";
  }
  if (normalized.includes("legal")) {
    return "legal";
  }
  if (normalized.includes("comm")) {
    return "communications";
  }
  return "agent";
}

const DEFAULT_AGENT_BLUEPRINT: Array<{ mode: AgentMode; name: string; status: string; task: string }> = [
  { mode: "sleuth", name: "Sleuth Agent", status: "Queued", task: "Waiting to start OSINT pipeline." },
  { mode: "legal", name: "Legal Agent", status: "Idle", task: "Awaiting discovered targets." },
  { mode: "communications", name: "Communications Agent", status: "Idle", task: "Awaiting legal dispatch." },
];

function canonicalAgentName(mode: AgentMode): string {
  return DEFAULT_AGENT_BLUEPRINT.find((entry) => entry.mode === mode)?.name ?? "Agent";
}

function toAgentMode(name: string): AgentMode {
  const mode = modeFromAgentName(name);
  if (mode === "sleuth" || mode === "legal" || mode === "communications") {
    return mode;
  }
  return "sleuth";
}

function progressFromAgent(mode: string, status: string, task: string): number {
  const normalized = `${status} ${task}`.toLowerCase();
  if (normalized.includes("stopped") || normalized.includes("halted")) {
    return 8;
  }
  if (normalized.includes("complete") || normalized.includes("resolved") || normalized.includes("finished")) {
    return 100;
  }
  if (normalized.includes("monitor")) {
    return 88;
  }
  if (normalized.includes("dispatch")) {
    return mode === "legal" ? 78 : 42;
  }
  if (normalized.includes("active") || normalized.includes("processing") || normalized.includes("engaged")) {
    if (mode === "communications") {
      return 86;
    }
    if (mode === "legal") {
      return 72;
    }
    return 60;
  }
  if (normalized.includes("queued") || normalized.includes("waiting")) {
    return mode === "sleuth" ? 18 : 10;
  }
  if (normalized.includes("idle") || normalized.includes("awaiting")) {
    return mode === "sleuth" ? 14 : 6;
  }
  return 30;
}

function activityColorForEventType(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized === "system") {
    return "#4a6fa5";
  }
  if (normalized === "legal") {
    return "#d17a22";
  }
  if (normalized === "comm") {
    return "#d17a22";
  }
  if (normalized === "boot_log" || normalized === "osint_debug" || normalized === "target_debug") {
    return "#4a6fa5";
  }
  if (normalized === "exposure_found") {
    return "#b94a48";
  }
  if (normalized === "broker_contacted" || normalized === "stage_complete") {
    return "#d17a22";
  }
  if (normalized === "deletion_confirmed" || normalized === "agent_resumed") {
    return "#4f7d5c";
  }
  if (normalized === "captcha_block" || normalized === "scan_stopped") {
    return "#b94a48";
  }
  return "#4a6fa5";
}

function buildAgentStatus(
  agent: { name: string; status: string; detail: string } | { mode: AgentMode; name?: string; status: string; task: string }
): AgentStatus {
  const rawName =
    "name" in agent && agent.name
      ? agent.name
      : "mode" in agent
        ? canonicalAgentName(agent.mode)
        : "Agent";
  const mode = toAgentMode(rawName);
  const status = String(agent.status || "Idle");
  const task = "detail" in agent ? String(agent.detail || "Processing") : String(agent.task || "Processing");

  return {
    mode,
    name: canonicalAgentName(mode),
    status,
    task,
    progress: progressFromAgent(mode, status, task),
  };
}

function mergeAgentStatuses(existing: AgentStatus[], updates: AgentStatus[]): AgentStatus[] {
  const byMode = new Map<AgentMode, AgentStatus>();
  for (const blueprint of DEFAULT_AGENT_BLUEPRINT) {
    byMode.set(blueprint.mode, buildAgentStatus(blueprint));
  }
  for (const agent of existing) {
    byMode.set(toAgentMode(agent.name), buildAgentStatus({ name: agent.name, status: agent.status, detail: agent.task }));
  }
  for (const agent of updates) {
    byMode.set(toAgentMode(agent.name), agent);
  }
  return DEFAULT_AGENT_BLUEPRINT.map((blueprint) => byMode.get(blueprint.mode) ?? buildAgentStatus(blueprint));
}

function applyStageAgentUpdates(
  previous: AgentStatus[],
  stage: string,
  payload: Record<string, unknown>
): AgentStatus[] {
  const normalizedStage = stage.toLowerCase();
  switch (normalizedStage) {
    case "osint_started":
      return mergeAgentStatuses(previous, [
        buildAgentStatus({ mode: "sleuth", status: "Active", task: "Running OSINT pipeline." }),
        buildAgentStatus({ mode: "legal", status: "Idle", task: "Awaiting discovered targets." }),
        buildAgentStatus({ mode: "communications", status: "Idle", task: "Awaiting legal dispatch." }),
      ]);
    case "osint_cycle": {
      const newAccounts = toNumber(payload.new_accounts ?? payload.accounts);
      const sitesFound = toNumber(payload.sites_found);
      const hasFollowup = Boolean(payload.next_job_id);
      const hasDiscoverHandoff = Boolean(payload.discover_job_id);

      return mergeAgentStatuses(previous, [
        buildAgentStatus({
          mode: "sleuth",
          status: hasFollowup ? "Active" : "Complete",
          task: hasFollowup
            ? `Continuing reconnaissance. ${sitesFound} live site(s) found in the latest cycle.`
            : `Recon finished. ${newAccounts} account(s) and ${sitesFound} site hit(s) handed off.`,
        }),
        buildAgentStatus({
          mode: "legal",
          status: hasDiscoverHandoff ? "Queued" : "Idle",
          task: hasDiscoverHandoff
            ? "Preparing broker target review from OSINT handoff."
            : "Awaiting discovered targets.",
        }),
      ]);
    }
    case "broker_discovery": {
      const count = toNumber(payload.count);
      return mergeAgentStatuses(previous, [
        buildAgentStatus({
          mode: "legal",
          status: count > 0 ? "Active" : "Idle",
          task: count > 0 ? `Mapped ${count} broker target(s) for legal review.` : "No broker targets matched yet.",
        }),
        buildAgentStatus({
          mode: "communications",
          status: count > 0 ? "Queued" : "Idle",
          task: count > 0 ? "Standing by for legal dispatch." : "Awaiting legal dispatch.",
        }),
      ]);
    }
    case "legal_dispatch": {
      const sent = toNumber(payload.sent);
      return mergeAgentStatuses(previous, [
        buildAgentStatus({
          mode: "legal",
          status: sent > 0 ? "Complete" : "Idle",
          task: sent > 0 ? `Dispatched ${sent} deletion notice(s).` : "No dispatch sent yet.",
        }),
        buildAgentStatus({
          mode: "communications",
          status: sent > 0 ? "Active" : "Idle",
          task: sent > 0 ? `Monitoring broker inbox replies for ${sent} notice(s).` : "Awaiting legal dispatch.",
        }),
      ]);
    }
    default:
      return previous;
  }
}

function applyLifecycleAgentUpdates(
  previous: AgentStatus[],
  status: string,
  currentStage?: string
): AgentStatus[] {
  const normalizedStatus = status.toLowerCase();
  const normalizedStage = String(currentStage || "").toLowerCase();

  if (normalizedStatus === "connected") {
    return previous.length === 0 ? mergeAgentStatuses([], []) : previous;
  }

  if (normalizedStatus === "cancelled" || normalizedStage === "stopped_by_user") {
    return mergeAgentStatuses(previous, [
      buildAgentStatus({ mode: "sleuth", status: "Stopped", task: "Scan stopped by user." }),
      buildAgentStatus({ mode: "legal", status: "Stopped", task: "Target review halted." }),
      buildAgentStatus({ mode: "communications", status: "Stopped", task: "Inbox monitoring halted." }),
    ]);
  }

  if (normalizedStage === "osint") {
    return applyStageAgentUpdates(previous, "osint_started", {});
  }
  if (normalizedStage === "legal_dispatch") {
    return mergeAgentStatuses(previous, [
      buildAgentStatus({
        mode: "legal",
        status: "Active",
        task: "Preparing legal action for discovered broker targets.",
      }),
      buildAgentStatus({
        mode: "communications",
        status: "Queued",
        task: "Standing by for legal dispatch.",
      }),
    ]);
  }
  if (normalizedStage === "inbox_monitoring") {
    return mergeAgentStatuses(previous, [
      buildAgentStatus({
        mode: "legal",
        status: "Complete",
        task: "Legal notices dispatched. Monitoring for broker responses.",
      }),
      buildAgentStatus({
        mode: "communications",
        status: "Active",
        task: "Monitoring broker inbox replies.",
      }),
    ]);
  }
  return previous;
}

function statValue(stats: DashboardStat[], title: string): number {
  const found = stats.find((item) => item.title === title);
  return found ? toNumber(found.value) : 0;
}

function mapDashboardResponse(response: DashboardResponse): LiveDashboardState {
  const radarTargets = response.radar_targets.map((target, index) => {
    const type = inferThreatTypeFromSeverity(target.severity, index);

    return {
      id: target.id,
      angle: toNumber(target.angle),
      distance: normalizeDistance(toNumber(target.distance)),
      broker: String(target.broker || "Unknown Broker"),
      status: String(target.status || "active"),
      type,
      color: colorForType(type),
    } satisfies RadarDot;
  });

  const brokers = uniqueStrings(radarTargets.map((target) => target.broker));

  return {
    brokerCount: statValue(response.stats, "Brokers Scanned"),
    exposureCount: statValue(response.stats, "Exposures Found"),
    deletionCount: statValue(response.stats, "Deletions Secured"),
    disputeCount: statValue(response.stats, "Active Legal Disputes"),
    threatBreakdown: {
      email: toNumber(response.threat_breakdown.emails_exposed),
      phone: toNumber(response.threat_breakdown.phone_leaks),
      location: toNumber(response.threat_breakdown.location_traces),
    },
    radarTargets,
    activityFeed: response.activity_feed.map((item) => ({
      id: item.id,
      type: String(item.type || "System"),
      message: String(item.message || "No message"),
      color: activityColorForEventType(String(item.type || "System")),
      createdAt: String(item.created_at || new Date().toISOString()),
    })),
    agentStatuses: mergeAgentStatuses(
      [],
      response.agent_statuses.map((agent) =>
        buildAgentStatus({
          name: String(agent.name || "Agent"),
          status: String(agent.status || "Active"),
          detail: String(agent.detail || "Processing"),
        })
      )
    ),
    pivotGraph: {
      emails: [],
      usernames: [],
      platforms: [],
      brokers,
    },
    isLive: false,
  };
}

function eventMessage(event: SleuthEvent): string {
  switch (event.event) {
    case "stage_complete": {
      if (event.payload.stage === "osint_cycle") {
        return "OSINT cycle complete. Continuing live reconnaissance.";
      }
      if (event.payload.stage === "username_pivot") {
        const count = toNumber(event.payload.count ?? event.payload.usernames?.length ?? 0);
        return `Username pivot complete: ${count} usernames discovered.`;
      }
      if (event.payload.stage === "email_probe") {
        return `Email probe matched platform ${event.payload.platform ?? "unknown"}.`;
      }
      if (event.payload.stage === "broker_discovery") {
        return "Broker discovery updated.";
      }
      if (event.payload.stage === "identity_assembly") {
        return "Identity assembly refreshed.";
      }
      return `Stage complete: ${event.payload.stage}`;
    }
    case "exposure_found":
      return `Exposure confirmed at ${event.payload.broker_name}.`;
    case "broker_contacted":
      return `Contacted ${event.payload.broker_name} via ${event.payload.legal_framework}.`;
    case "deletion_confirmed":
      return `Deletion confirmed by ${event.payload.broker_name}.`;
    case "agent_status_change":
      return `${event.payload.agent}: ${event.payload.status} - ${event.payload.detail}`;
    case "captcha_block":
      return `CAPTCHA encountered at ${event.payload.broker}.`;
    case "agent_resumed":
      return "Agent resumed after CAPTCHA resolution.";
    case "scan_stopped":
      return "Scan stopped by user command.";
    case "scan_lifecycle_updated":
      return `Scan lifecycle updated: ${event.payload.status}${
        event.payload.current_stage ? ` (${event.payload.current_stage})` : ""
      }.`;
    default:
      return "Realtime update received.";
  }
}

function pushActivity(
  previous: ActivityItem[],
  event: SleuthEvent,
  occurredAt: string
): ActivityItem[] {
  const entry: ActivityItem = {
    id: `${event.event}-${occurredAt}`,
    type: event.event,
    message: eventMessage(event),
    color: activityColorForEventType(event.event),
    createdAt: occurredAt,
  };

  return [entry, ...previous].slice(0, 120);
}

function parseSleuthEvent(raw: { event: string; payload: Record<string, unknown> }): SleuthEvent | null {
  const { event, payload } = raw;

  switch (event) {
    case "stage_complete":
      return {
        event,
        payload: {
          stage: String(payload.stage ?? "unknown"),
          platform: typeof payload.platform === "string" ? payload.platform : undefined,
          username: typeof payload.username === "string" ? payload.username : undefined,
          usernames: Array.isArray(payload.usernames)
            ? payload.usernames.map((item) => String(item))
            : undefined,
          count: typeof payload.count === "number" ? payload.count : undefined,
          emails: Array.isArray(payload.emails) ? payload.emails.map((item) => String(item)) : undefined,
          broker_names: Array.isArray(payload.broker_names)
            ? payload.broker_names.map((item) => String(item))
            : undefined,
          broker_name: typeof payload.broker_name === "string" ? payload.broker_name : undefined,
          summary: typeof payload.summary === "boolean" ? payload.summary : undefined,
          angle: typeof payload.angle === "number" ? payload.angle : undefined,
          distance: typeof payload.distance === "number" ? payload.distance : undefined,
        },
      };
    case "exposure_found":
      return {
        event,
        payload: {
          broker_name: String(payload.broker_name ?? "Unknown Broker"),
          data_types: Array.isArray(payload.data_types) ? payload.data_types.map((item) => String(item)) : [],
          priority_score: toNumber(payload.priority_score),
          angle: toNumber(payload.angle),
          distance: toNumber(payload.distance),
        },
      };
    case "broker_contacted":
      return {
        event,
        payload: {
          broker_name: String(payload.broker_name ?? "Data Broker"),
          legal_framework: String(payload.legal_framework ?? "DPDP"),
          status: String(payload.status ?? "sent"),
        },
      };
    case "deletion_confirmed":
      return {
        event,
        payload: {
          broker_name: String(payload.broker_name ?? "Data Broker"),
        },
      };
    case "agent_status_change":
      return {
        event,
        payload: {
          agent: String(payload.agent ?? "agent"),
          status: String(payload.status ?? "active"),
          detail: String(payload.detail ?? "Working"),
        },
      };
    case "captcha_block":
      return {
        event,
        payload: {
          broker: String(payload.broker ?? "Unknown"),
          type: String(payload.type ?? "captcha"),
        },
      };
    case "agent_resumed":
      return {
        event,
        payload: {},
      };
    case "scan_stopped":
      return {
        event,
        payload: {
          status: String(payload.status ?? "cancelled"),
          current_stage: String(payload.current_stage ?? "stopped_by_user"),
          reason: String(payload.reason ?? "manual"),
        },
      };
    case "scans.lifecycle.updated":
      return {
        event: "scan_lifecycle_updated",
        payload: {
          status: String(payload.status ?? "unknown"),
          current_stage:
            payload.current_stage === undefined
              ? undefined
              : String(payload.current_stage),
          reason: payload.reason === undefined ? undefined : String(payload.reason),
        },
      };
    default:
      return null;
  }
}

export function useDashboard(scanId: string | null): {
  state: LiveDashboardState;
  connectionStatus: RealtimeConnectionStatus;
  hasError: boolean;
  refetch: () => Promise<void>;
} {
  const [state, setState] = useState<LiveDashboardState>(() => {
    if (!scanId) {
      return EMPTY_STATE;
    }
    return loadCachedDashboardState(scanId) ?? EMPTY_STATE;
  });
  const [hasError, setHasError] = useState(false);
  const [pendingBrokerTargets, setPendingBrokerTargets] = useState<RadarDot[]>([]);

  const enqueueBrokerTargets = useCallback((targets: RadarDot[]) => {
    if (targets.length === 0) {
      return;
    }

    setPendingBrokerTargets((previous) => {
      const seen = new Set(previous.map((item) => brokerDiscoveryKey(item)));
      const nextQueue = [...previous];

      for (const target of targets) {
        const key = brokerDiscoveryKey(target);
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        nextQueue.push(target);
      }

      return nextQueue;
    });
  }, []);

  const realtimeChannels = useMemo<RealtimeChannel[]>(
    () => ["dashboard.summary", "dashboard.radar", "dashboard.activity", "dashboard.agents", "scans.lifecycle"],
    []
  );

  const connectionStatus = useRealtimeSubscription({
    scanId,
    enabled: Boolean(scanId),
    channels: realtimeChannels,
    onEvent: (event) => {
      if (!scanId || event.scanId !== scanId) {
        dashboardDebug("ignoring realtime event for different scan", {
          activeScanId: scanId,
          eventScanId: event.scanId,
          event: event.event,
        });
        return;
      }

      const sleuthEvent = parseSleuthEvent({ event: event.event, payload: event.payload });
      if (!sleuthEvent) {
        dashboardDebug("received unsupported realtime event", {
          scanId,
          event: event.event,
          payload: event.payload,
        });
        return;
      }

      dashboardDebug("processing realtime event", {
        scanId,
        event: sleuthEvent.event,
        occurredAt: event.occurredAt,
      });

      setState((previous) => {
        let next = previous;

        switch (sleuthEvent.event) {
          case "stage_complete": {
            next = {
              ...next,
              agentStatuses: applyStageAgentUpdates(next.agentStatuses, sleuthEvent.payload.stage, sleuthEvent.payload),
            };

            if (sleuthEvent.payload.stage === "username_pivot") {
              const usernames = sleuthEvent.payload.usernames ?? [];
              next = {
                ...next,
                pivotGraph: {
                  ...next.pivotGraph,
                  usernames: uniqueStrings([...next.pivotGraph.usernames, ...usernames]),
                },
              };
            }

            if (sleuthEvent.payload.stage === "email_probe" && sleuthEvent.payload.platform) {
              next = {
                ...next,
                pivotGraph: {
                  ...next.pivotGraph,
                  platforms: uniqueStrings([...next.pivotGraph.platforms, sleuthEvent.payload.platform]),
                },
              };
            }

            if (sleuthEvent.payload.stage === "broker_discovery") {
              const stageBrokerNamesRaw = uniqueStrings(
                sleuthEvent.payload.broker_names ??
                  (sleuthEvent.payload.broker_name ? [sleuthEvent.payload.broker_name] : [])
              );
              const isSummary =
                sleuthEvent.payload.summary === true ||
                stageBrokerNamesRaw.length > 1 ||
                Math.max(0, toNumber(sleuthEvent.payload.count)) > stageBrokerNamesRaw.length;

              const radarTargetsFromNames: RadarDot[] = stageBrokerNamesRaw.map((brokerName, index) => {
                const angle = toNumber(sleuthEvent.payload.angle ?? ((index * 57) % 360));
                const distance = normalizeDistance(toNumber(sleuthEvent.payload.distance ?? (0.5 + ((index % 4) * 0.1))));
                return {
                  id: `broker-discovery-${event.occurredAt}-${brokerName}-${index}`,
                  angle,
                  distance,
                  broker: brokerName,
                  status: "active",
                  type: "email",
                  color: colorForType("email"),
                };
              });

              if (radarTargetsFromNames.length > 0) {
                enqueueBrokerTargets(radarTargetsFromNames);
              }

              if (!isSummary && stageBrokerNamesRaw.length === 1) {
                next = {
                  ...next,
                  agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                    buildAgentStatus({
                      mode: "legal",
                      status: "Active",
                      task: `Mapped broker target ${stageBrokerNamesRaw[0]} for legal review.`,
                    }),
                  ]),
                };
              }
            }

            if (sleuthEvent.payload.stage === "identity_assembly") {
              const emails = sleuthEvent.payload.emails ?? [];
              next = {
                ...next,
                pivotGraph: {
                  ...next.pivotGraph,
                  emails: uniqueStrings([...next.pivotGraph.emails, ...emails]),
                },
              };
            }
            break;
          }

          case "exposure_found": {
            const threatType = inferThreatTypeFromData(sleuthEvent.payload.data_types);
            const nextExposureCount = next.exposureCount + 1;
            const isNewBroker = !next.pivotGraph.brokers.includes(sleuthEvent.payload.broker_name);
            const nextBrokers = isNewBroker
              ? uniqueStrings([...next.pivotGraph.brokers, sleuthEvent.payload.broker_name])
              : next.pivotGraph.brokers;
            const radarTarget: RadarDot = {
              id: `exposure-${event.occurredAt}-${sleuthEvent.payload.broker_name}`,
              angle: toNumber(sleuthEvent.payload.angle),
              distance: normalizeDistance(toNumber(sleuthEvent.payload.distance)),
              broker: sleuthEvent.payload.broker_name,
              status: "active",
              type: threatType,
              color: colorForType(threatType),
            };

            next = {
              ...next,
              brokerCount: Math.max(next.brokerCount + (isNewBroker ? 1 : 0), nextBrokers.length),
              exposureCount: nextExposureCount,
              radarTargets: [radarTarget, ...next.radarTargets].slice(0, 200),
              pivotGraph: {
                ...next.pivotGraph,
                brokers: nextBrokers,
              },
              threatBreakdown: {
                ...next.threatBreakdown,
                [threatType]: next.threatBreakdown[threatType] + 1,
              },
              agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                buildAgentStatus({
                  mode: "sleuth",
                  status: "Active",
                  task: `Running OSINT pipeline. ${nextExposureCount} live exposure(s) confirmed.`,
                }),
              ]),
            };
            break;
          }

          case "broker_contacted": {
            next = {
              ...next,
              disputeCount: next.disputeCount + 1,
              agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                buildAgentStatus({
                  mode: "communications",
                  status: "Active",
                  task: `Broker outreach active for ${sleuthEvent.payload.broker_name}.`,
                }),
              ]),
            };
            break;
          }

          case "deletion_confirmed": {
            next = {
              ...next,
              deletionCount: next.deletionCount + 1,
              disputeCount: Math.max(0, next.disputeCount - 1),
              agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                buildAgentStatus({
                  mode: "legal",
                  status: "Complete",
                  task: `Deletion confirmed by ${sleuthEvent.payload.broker_name}.`,
                }),
              ]),
            };
            break;
          }

          case "agent_status_change": {
            const normalizedAgent = sleuthEvent.payload.agent.toLowerCase();
            const existingIndex = next.agentStatuses.findIndex((entry) =>
              entry.name.toLowerCase().includes(normalizedAgent)
            );

            const updatedStatus: AgentStatus = {
              mode: toAgentMode(sleuthEvent.payload.agent),
              name:
                existingIndex >= 0
                  ? next.agentStatuses[existingIndex]?.name ?? sleuthEvent.payload.agent
                  : sleuthEvent.payload.agent,
              status: sleuthEvent.payload.status,
              task: sleuthEvent.payload.detail,
              progress: progressFromAgent(
                toAgentMode(sleuthEvent.payload.agent),
                sleuthEvent.payload.status,
                sleuthEvent.payload.detail
              ),
            };

            if (existingIndex >= 0) {
              const cloned = [...next.agentStatuses];
              cloned[existingIndex] = updatedStatus;
              next = {
                ...next,
                agentStatuses: cloned,
              };
            } else {
              next = {
                ...next,
                agentStatuses: [...next.agentStatuses, updatedStatus],
              };
            }
            break;
          }

          case "captcha_block":
            next = {
              ...next,
              agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                buildAgentStatus({
                  mode: "communications",
                  status: "Active",
                  task: `Manual action required at ${sleuthEvent.payload.broker}.`,
                }),
              ]),
            };
            break;

          case "agent_resumed":
            next = {
              ...next,
              agentStatuses: mergeAgentStatuses(next.agentStatuses, [
                buildAgentStatus({
                  mode: "communications",
                  status: "Active",
                  task: "Inbox monitoring resumed after manual intervention.",
                }),
              ]),
            };
            break;

          case "scan_stopped":
            next = {
              ...next,
              agentStatuses: applyLifecycleAgentUpdates(
                next.agentStatuses,
                sleuthEvent.payload.status,
                sleuthEvent.payload.current_stage
              ),
            };
            break;

          case "scan_lifecycle_updated":
            next = {
              ...next,
              agentStatuses: applyLifecycleAgentUpdates(
                next.agentStatuses,
                sleuthEvent.payload.status,
                sleuthEvent.payload.current_stage
              ),
            };
            break;
        }

        return {
          ...next,
          activityFeed: pushActivity(next.activityFeed, sleuthEvent, event.occurredAt),
        };
      });
    },
  });

  const refetch = useCallback(async () => {
    if (!scanId) {
      dashboardDebug("refetch skipped because scanId is missing");
      setState(EMPTY_STATE);
      setHasError(false);
      return;
    }

    dashboardDebug("dashboard refetch started", { scanId });

    try {
      const [dashboardResponse, pivotResponse, scanResponse] = await Promise.all([
        apiClient.get<DashboardResponse>(`/api/dashboard/${scanId}`),
        apiClient.get<PivotChainResponse>(`/v1/scans/${scanId}/dashboard/pivot-chain`),
        apiClient.get<ScanStatusResponse>(`/v1/scans/${scanId}`),
      ]);

      const mappedDashboard = mapDashboardResponse(dashboardResponse.data);
      const shouldStreamBrokers = isActiveScanStatus(scanResponse.data?.status);
      const pivotColumns = Array.isArray(pivotResponse.data?.columns)
        ? pivotResponse.data.columns
        : [];

      const columnValues = (label: string) => {
        const found = pivotColumns.find(
          (column) => String(column?.label || "").trim().toLowerCase() === label
        );
        return Array.isArray(found?.values) ? found.values.map((value) => String(value)) : [];
      };

      if (shouldStreamBrokers && mappedDashboard.radarTargets.length > 0) {
        enqueueBrokerTargets(mappedDashboard.radarTargets);
      }

      setState((previous) => {
        if (shouldStreamBrokers) {
          return {
            ...previous,
            deletionCount: mappedDashboard.deletionCount,
            disputeCount: mappedDashboard.disputeCount,
            pivotGraph: {
              emails: uniqueStrings([...previous.pivotGraph.emails, ...columnValues("emails")]),
              usernames: uniqueStrings([...previous.pivotGraph.usernames, ...columnValues("usernames")]),
              platforms: uniqueStrings([...previous.pivotGraph.platforms, ...columnValues("platforms")]),
              brokers: uniqueStrings(previous.pivotGraph.brokers),
            },
            agentStatuses:
              previous.agentStatuses.length > 0 ? previous.agentStatuses : mappedDashboard.agentStatuses,
            activityFeed:
              previous.activityFeed.length > 0
                ? previous.activityFeed
                : mappedDashboard.activityFeed.slice(0, 3),
            isLive: previous.isLive,
          };
        }

        return {
          ...mappedDashboard,
          pivotGraph: {
            emails: uniqueStrings(columnValues("emails")),
            usernames: uniqueStrings(columnValues("usernames")),
            platforms: uniqueStrings(columnValues("platforms")),
            brokers: uniqueStrings([
              ...mappedDashboard.pivotGraph.brokers,
              ...columnValues("brokers"),
            ]),
          },
          isLive: previous.isLive,
        };
      });
      setHasError(false);
      dashboardDebug("dashboard refetch succeeded", {
        scanId,
        brokers: mappedDashboard.brokerCount,
        exposures: mappedDashboard.exposureCount,
        activityCount: mappedDashboard.activityFeed.length,
        radarCount: mappedDashboard.radarTargets.length,
        streamMode: shouldStreamBrokers,
      });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isLive: false,
      }));
      setHasError(true);
      dashboardError("dashboard refetch failed", {
        scanId,
        ...toErrorContext(error),
      });
    }
  }, [enqueueBrokerTargets, scanId]);

  useEffect(() => {
    if (!scanId) {
      setState(EMPTY_STATE);
      setPendingBrokerTargets([]);
      setHasError(false);
      return;
    }

    const cachedState = loadCachedDashboardState(scanId);
    if (cachedState) {
      setState(cachedState);
    } else {
      setState(EMPTY_STATE);
    }
    setPendingBrokerTargets([]);
    setHasError(false);
  }, [scanId]);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      if (cancelled) {
        dashboardDebug("initial dashboard load skipped because effect was cancelled", { scanId });
        return;
      }
      await refetch();
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [refetch]);

  useEffect(() => {
    if (!scanId || pendingBrokerTargets.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nextTarget = pendingBrokerTargets[0];
      if (!nextTarget) {
        return;
      }

      setPendingBrokerTargets((previous) => previous.slice(1));

      setState((previous) => {
        const key = brokerDiscoveryKey(nextTarget);
        if (!key) {
          return previous;
        }

        const alreadyKnown = previous.pivotGraph.brokers.some((brokerName) => brokerDiscoveryKey({ broker: brokerName }) === key);
        if (alreadyKnown) {
          return previous;
        }

        const nextBrokers = uniqueStrings([...previous.pivotGraph.brokers, nextTarget.broker]);
        const nextExposureCount = previous.exposureCount + 1;
        const nextOccurredAt = new Date().toISOString();
        return {
          ...previous,
          brokerCount: Math.max(previous.brokerCount + 1, nextBrokers.length),
          exposureCount: nextExposureCount,
          threatBreakdown: {
            ...previous.threatBreakdown,
            [nextTarget.type]: previous.threatBreakdown[nextTarget.type] + 1,
          },
          radarTargets: [nextTarget, ...previous.radarTargets].slice(0, 200),
          activityFeed: [
            {
              id: `broker-discovery-queue-${nextOccurredAt}-${nextTarget.broker}`,
              type: "stage_complete",
              message: `Broker discovery updated: ${nextTarget.broker}.`,
              color: activityColorForEventType("stage_complete"),
              createdAt: nextOccurredAt,
            },
            ...previous.activityFeed,
          ].slice(0, 120),
          pivotGraph: {
            ...previous.pivotGraph,
            brokers: nextBrokers,
          },
        };
      });
    }, 280);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingBrokerTargets, scanId]);

  useEffect(() => {
    dashboardDebug("realtime connection status changed", {
      scanId,
      connectionStatus,
    });
    setState((previous) => ({
      ...previous,
      isLive: connectionStatus === "connected",
    }));
  }, [connectionStatus, scanId]);

  useEffect(() => {
    if (!scanId) {
      return;
    }
    saveCachedDashboardState(scanId, state);
  }, [scanId, state]);

  return {
    state,
    connectionStatus,
    hasError,
    refetch,
  };
}
