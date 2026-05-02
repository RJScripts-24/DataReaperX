import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { Activity, Shield, Trash2, Scale, Maximize2, X } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import { AnimatedDataReaperLogo } from "../components/AnimatedDataReaperLogo";
import { ApiClientError } from "../lib/apiClient";
import apiClient from "../lib/apiClient";
import { stopScan } from "../lib/api";
import { useScanContext, useRequireScan } from "../lib/scanContext";
import { type RealtimeConnectionStatus } from "../lib/wsClient";
import { useDashboard } from "../lib/useDashboard";
import { useEngagementsQuery, useScanStatusQuery } from "../lib/hooks";

const COLORS = {
  bg: "#f5f3ef",
  card: "#f1eee8",
  blue: "#4a6fa5",
  orange: "#d17a22",
  red: "#b94a48",
  green: "#4f7d5c",
  text: "#1f1f1f",
  textSec: "#5a5a5a",
};

type ThreatColorMap = Record<"email" | "phone" | "location", string>;
const THREAT_COLORS: ThreatColorMap = {
  email: COLORS.blue,
  phone: COLORS.orange,
  location: COLORS.red,
};
const VISIBLE_THREAT_TYPES = ["email"] as const;

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = useMemo(() => data.map((value) => ({ value })), [data]);

  return (
    <div style={{ width: "100%", height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.06} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#spark-${color.replace("#", "")})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function trendLabel(series: number[]) {
  if (series.length < 2) {
    return { text: "stable", up: true };
  }

  const previous = series[series.length - 2] ?? 0;
  const current = series[series.length - 1] ?? 0;
  const delta = current - previous;

  if (delta === 0) {
    return { text: "stable", up: true };
  }

  return {
    text: `${delta > 0 ? "+" : ""}${delta}`,
    up: delta > 0,
  };
}

function radarSignalLabel(distance: number): string {
  if (distance <= 35) {
    return "Near";
  }
  if (distance <= 70) {
    return "Mid";
  }
  return "Far";
}

function formatThreatLabel(type: "email" | "phone" | "location"): string {
  if (type === "email") {
    return "Email Exposure";
  }
  if (type === "phone") {
    return "Phone Leak";
  }
  return "Location Trace";
}

function StatCard({
  icon,
  title,
  value,
  trend,
  trendUp,
  series,
  accentColor,
  tint,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  trend: string;
  trendUp: boolean;
  series: number[];
  accentColor: string;
  tint: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="hand-drawn-card p-4"
      style={{
        backgroundColor: tint,
        border: "1px solid rgba(31,31,31,0.06)",
        boxShadow: "inset 0 0 20px rgba(0,0,0,0.02), 2px 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div style={{ color: accentColor }}>{icon}</div>
        <span
          className="text-sm font-semibold"
          style={{ fontFamily: "'Patrick Hand', cursive", color: trendUp ? COLORS.green : COLORS.red }}
        >
          {trend}
        </span>
      </div>
      <div className="text-3xl mb-1 font-bold" style={{ fontFamily: "'Dancing Script', cursive", color: accentColor }}>
        {value}
      </div>
      <div className="text-lg mb-2" style={{ fontFamily: "'Caveat', cursive", color: COLORS.text }}>
        {title}
      </div>
      <MiniSparkline data={series} color={accentColor} />
    </motion.div>
  );
}

function ThreatItem({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  return (
    <div className="border-b-[1.5px] border-dashed border-black/10 pb-2 px-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-base" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text, opacity: 0.8 }}>
          {label}
        </span>
        <span className="text-xl font-bold" style={{ fontFamily: "'Caveat', cursive", color }}>
          {value}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-black/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
          transition={{ duration: 0.9 }}
        />
      </div>
    </div>
  );
}

function AgentStatusRow({ name, status, task, progress }: { name: string; status: string; task: string; progress: number }) {
  const normalized = status.toLowerCase();
  const statusColor = normalized.includes("stopped")
    ? COLORS.red
    : normalized.includes("complete") || normalized.includes("resolved")
      ? COLORS.green
      : normalized.includes("active") || normalized.includes("monitor")
        ? COLORS.blue
        : normalized.includes("queued")
          ? COLORS.orange
          : normalized.includes("warn")
            ? COLORS.orange
            : COLORS.textSec;

  return (
    <div className="border-b-[1.5px] border-dashed border-black/10 pb-3 px-1">
      <div className="flex items-center justify-between mb-1">
        <div className="text-lg" style={{ fontFamily: "'Caveat', cursive", color: COLORS.text }}>
          {name}
        </div>
        <span className="text-xs" style={{ fontFamily: "'Patrick Hand', cursive", color: statusColor }}>
          {status}
        </span>
      </div>
      <div className="text-sm mb-1.5 italic" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, opacity: 0.8 }}>
        {task}
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
      >
        <motion.div
          className="h-full"
          style={{ backgroundColor: statusColor }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          transition={{ duration: 1.2 }}
        />
      </div>
    </div>
  );
}

function ConnectionBanner({ status }: { status: RealtimeConnectionStatus }) {
  if (status === "connected" || status === "idle") {
    return null;
  }

  const label =
    status === "offline"
      ? "You are offline. Data is temporarily paused."
      : status === "reconnecting"
        ? "Reconnecting to live updates..."
        : status === "connecting"
          ? "Connecting to live updates..."
          : "Realtime channel unavailable. Auto-retry is active.";

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 lg:px-12 pt-3">
      <div
        className="hand-drawn-card px-4 py-2"
        style={{
          backgroundColor: "rgba(209, 122, 34, 0.12)",
          borderColor: "rgba(209, 122, 34, 0.45)",
          color: "#8d4b08",
        }}
      >
        <p style={{ fontFamily: "'Patrick Hand', cursive" }}>{label}</p>
      </div>
    </div>
  );
}

function formatTimestamp(input: string | undefined): string {
  if (!input) {
    return "--";
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return input;
  }

  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MetadataPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-full px-4 py-2"
      style={{
        border: "1px dashed rgba(0,0,0,0.16)",
        backgroundColor: "rgba(255,255,255,0.52)",
      }}
    >
      <div
        className="text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          fontFamily: "'Patrick Hand', cursive",
          color: "rgba(31,31,31,0.58)",
        }}
      >
        {label}
      </div>
      <div
        className="truncate text-base md:text-lg"
        style={{
          fontFamily: "'Patrick Hand', cursive",
          color: COLORS.text,
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ProgressPill({ percent, status }: { percent: number; status: string }) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      className="min-w-[220px] rounded-full px-4 py-2"
      style={{
        border: "1px dashed rgba(0,0,0,0.16)",
        backgroundColor: "rgba(255,255,255,0.52)",
      }}
    >
      <div
        className="text-[0.72rem] uppercase tracking-[0.16em]"
        style={{
          fontFamily: "'Patrick Hand', cursive",
          color: "rgba(31,31,31,0.58)",
        }}
      >
        Progress
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="h-2.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(31,31,31,0.08)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: COLORS.green }}
            animate={{ width: `${safePercent}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
        <span style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text }}>
          {safePercent}%
        </span>
      </div>
      <div
        className="text-[0.72rem] uppercase tracking-[0.08em] mt-1"
        style={{
          fontFamily: "'Patrick Hand', cursive",
          color: "rgba(31,31,31,0.54)",
        }}
      >
        {status}
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const navigate = useNavigate();
  const { setActiveScan } = useScanContext();
  const scanId = useRequireScan();
  const scanQuery = useScanStatusQuery(scanId);
  const engagementsQuery = useEngagementsQuery(scanId);

  const [isRadarExpanded, setIsRadarExpanded] = useState(false);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [hoveredRadarDotId, setHoveredRadarDotId] = useState<string | null>(null);
  const [isStoppingScan, setIsStoppingScan] = useState(false);
  const [isStartingNewScan, setIsStartingNewScan] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const { state, connectionStatus, hasError, refetch } = useDashboard(scanId);
  const realtimeStatus = connectionStatus;

  useEffect(() => {
    if (!scanId) {
      console.debug("[datareaper:command-center] missing scanId; rendering null until scan is available");
    }
  }, [scanId]);

  useEffect(() => {
    const status = String(scanQuery.data?.status ?? "").trim().toLowerCase();
    if (!status) {
      return;
    }

    if (status === "cancelled" || status === "stopped") {
      setIsStopped(true);
      return;
    }

    setIsStopped(false);
  }, [scanQuery.data?.status]);

  useEffect(() => {
    if (!hasError) {
      return;
    }

    console.error("[datareaper:command-center] dashboard is in error state", {
      scanId,
      connectionStatus,
      brokerCount: state.brokerCount,
      exposureCount: state.exposureCount,
      activityCount: state.activityFeed.length,
      radarCount: state.radarTargets.length,
    });
  }, [
    connectionStatus,
    hasError,
    scanId,
    state.activityFeed.length,
    state.brokerCount,
    state.exposureCount,
    state.radarTargets.length,
  ]);

  const radarTargets = state.radarTargets.filter((target) => target.type === "email");
  const activityLogs = state.activityFeed;
  const agents = state.agentStatuses;
  const engagements = engagementsQuery.data?.items ?? [];

  const warRoomScenario = useMemo(() => {
    if (!engagementsQuery.data) {
      return null;
    }

    const hasEngagementRows = engagements.length > 0;
    const shouldTrustEmptyWarRoom = state.brokerCount === 0;
    if (!hasEngagementRows && !shouldTrustEmptyWarRoom) {
      return null;
    }

    const deletionsSecured = engagements.filter((item) => item.status === "resolved").length;
    const activeDisputes = engagements.filter((item) => item.status !== "resolved").length;

    return {
      deletionsSecured,
      activeDisputes,
    };
  }, [engagements, engagementsQuery.data, state.brokerCount]);

  const stats = {
    brokersScanned: state.brokerCount,
    exposuresFound: state.exposureCount,
    deletionsSecured: warRoomScenario?.deletionsSecured ?? state.deletionCount,
    activeDisputes: warRoomScenario?.activeDisputes ?? state.disputeCount,
  };

  const trends = {
    brokersScanned: [Math.max(0, state.brokerCount - 1), state.brokerCount],
    exposuresFound: [Math.max(0, state.exposureCount - 1), state.exposureCount],
    deletionsSecured: [Math.max(0, stats.deletionsSecured - 1), stats.deletionsSecured],
    activeDisputes: [Math.max(0, stats.activeDisputes - 1), stats.activeDisputes],
  };

  const threatTotal = Math.max(1, state.threatBreakdown.email);

  const threatBreakdown = {
    email: {
      count: state.threatBreakdown.email,
      percentOfTotal: (state.threatBreakdown.email / threatTotal) * 100,
    },
  };

  const pivotColumns = [
    { label: "Emails", values: state.pivotGraph.emails },
    { label: "Usernames", values: state.pivotGraph.usernames },
    { label: "Platforms", values: state.pivotGraph.platforms },
    { label: "Brokers", values: state.pivotGraph.brokers },
  ];

  const lastUpdatedAt = activityLogs[0]?.createdAt;
  const seedValue = scanQuery.data?.seed?.value?.trim() || "Awaiting seed sync";
  const seedLabel = scanQuery.data?.seed?.type === "phone" ? "Phone number" : "Email";
  const backendProgress = Math.max(0, Math.min(100, Math.round(Number(scanQuery.data?.progress ?? 0))));
  const backendStatus = String(scanQuery.data?.status ?? "discovering").replace(/_/g, " ");

  useEffect(() => {
    setDisplayProgress(0);
  }, [scanId]);

  useEffect(() => {
    if (displayProgress === backendProgress) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDisplayProgress((previous) => {
        if (previous === backendProgress) {
          return previous;
        }
        const direction = backendProgress > previous ? 1 : -1;
        const nextValue = previous + direction;
        if (direction > 0 && nextValue > backendProgress) {
          return backendProgress;
        }
        if (direction < 0 && nextValue < backendProgress) {
          return backendProgress;
        }
        return nextValue;
      });
    }, 24);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [backendProgress, displayProgress]);

  if (!scanId) {
    return null;
  }

  const statusLabel =
    isStopped
      ? "STOPPED"
      :
    connectionStatus === "connected"
      ? "LIVE"
      : connectionStatus === "reconnecting" || connectionStatus === "connecting"
        ? "RECONNECTING..."
        : connectionStatus === "offline"
          ? "OFFLINE"
          : "STANDBY";

  const statusColor =
    isStopped
      ? COLORS.red
      :
    connectionStatus === "connected"
      ? COLORS.green
      : connectionStatus === "reconnecting" || connectionStatus === "connecting"
        ? COLORS.orange
        : connectionStatus === "offline"
          ? COLORS.red
          : COLORS.textSec;

  const threatCounts = radarTargets.reduce(
    (acc, target) => {
      acc[target.type] += 1;
      return acc;
    },
    { email: 0, phone: 0, location: 0 } as Record<"email" | "phone" | "location", number>
  );

  const hoveredRadarDot = useMemo(
    () => radarTargets.find((target) => target.id === hoveredRadarDotId) ?? null,
    [hoveredRadarDotId, radarTargets]
  );

  useEffect(() => {
    if (!hoveredRadarDotId) {
      return;
    }
    const stillExists = radarTargets.some((target) => target.id === hoveredRadarDotId);
    if (!stillExists) {
      setHoveredRadarDotId(null);
    }
  }, [hoveredRadarDotId, radarTargets]);

  useEffect(() => {
    if (!isRadarExpanded) {
      return;
    }
    if (!hoveredRadarDot && radarTargets.length > 0) {
      setHoveredRadarDotId(radarTargets[0]?.id ?? null);
    }
  }, [hoveredRadarDot, isRadarExpanded, radarTargets]);

  const renderRadar = (expanded: boolean) => (
    <div className={`relative w-full aspect-square mx-auto ${expanded ? "max-w-[700px]" : "max-w-[460px]"}`}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" style={{ filter: "url(#pencil-sketch)" }}>
        <defs>
          <radialGradient id="radar-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={COLORS.green} stopOpacity="0.24" />
            <stop offset="100%" stopColor={COLORS.green} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radar-sweep" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={COLORS.green} stopOpacity="0" />
            <stop offset="100%" stopColor={COLORS.green} stopOpacity="0.45" />
          </linearGradient>
        </defs>

        <circle cx="200" cy="200" r="180" fill="url(#radar-glow)" opacity="0.45" />

        {[80, 120, 160, 200].map((radius, index) => (
          <circle
            key={radius}
            cx="200"
            cy="200"
            r={radius}
            fill="none"
            stroke={COLORS.blue}
            strokeWidth={index === 3 ? 1.5 : 0.8}
            strokeDasharray={index === 3 ? "none" : "6,6"}
            opacity={index === 3 ? 0.15 : 0.08}
          />
        ))}

        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 200 200"
            to="360 200 200"
            dur={expanded ? "3.8s" : "5s"}
            repeatCount="indefinite"
          />
          <path
            d="M200 200 L194 2 A200 200 0 0 1 206 2 Z"
            fill="url(#radar-sweep)"
            opacity="0.52"
          />
          <line
            x1="200"
            y1="200"
            x2="200"
            y2="2"
            stroke={COLORS.green}
            strokeOpacity="0.75"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="200" cy="2" r="4" fill={COLORS.green} opacity="0.5" />
        </g>

        <circle cx="200" cy="200" r="5" fill={COLORS.green} opacity="0.5" />

        {radarTargets.map((dot) => {
          const radians = (dot.angle * Math.PI) / 180;
          const x = 200 + Math.cos(radians) * (dot.distance * 2);
          const y = 200 + Math.sin(radians) * (dot.distance * 2);
          const isHovered = hoveredRadarDotId === dot.id;

          return (
            <g
              key={dot.id}
              role="button"
              tabIndex={0}
              onMouseEnter={() => setHoveredRadarDotId(dot.id)}
              onMouseLeave={() => setHoveredRadarDotId((previous) => (previous === dot.id ? null : previous))}
              onFocus={() => setHoveredRadarDotId(dot.id)}
              onBlur={() => setHoveredRadarDotId((previous) => (previous === dot.id ? null : previous))}
              style={{ cursor: "pointer" }}
            >
              <title>{`${dot.broker} | ${formatThreatLabel(dot.type)} | ${dot.status}`}</title>
              <motion.circle
                cx={x}
                cy={y}
                r="15"
                fill={dot.color}
                opacity={isHovered ? 0.3 : 0.18}
              />
              <motion.circle
                cx={x}
                cy={y}
                r={isHovered ? 6.2 : 5}
                fill={dot.color}
                stroke={COLORS.card}
                strokeWidth="1"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: isHovered ? 1 : 0.95 }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r={isHovered ? 9 : 6}
                fill="none"
                stroke={dot.color}
                strokeWidth="1.3"
                strokeDasharray="2,2"
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 2.8, opacity: 0 }}
                transition={{ duration: 2.6, repeat: Infinity }}
              />
            </g>
          );
        })}
      </svg>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="text-center bg-[#fdfbf7]/70 px-4 py-2 rounded-full border border-black/10"
          style={{ filter: "url(#pencil-sketch)" }}
        >
          <div className="text-2xl font-bold" style={{ fontFamily: "'Caveat', cursive", color: COLORS.green }}>
            LIVE SCAN
          </div>
          <div className="text-xs" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text, opacity: 0.75 }}>
            {radarTargets.length} targets tracked
          </div>
        </div>
      </div>

      {hoveredRadarDot && !expanded && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 bottom-2 -translate-x-1/2 px-3 py-2 rounded-lg border shadow-sm"
          style={{
            minWidth: 230,
            borderColor: "rgba(0,0,0,0.15)",
            backgroundColor: "rgba(253,251,247,0.92)",
            pointerEvents: "none",
          }}
        >
          <div className="text-base" style={{ fontFamily: "'Caveat', cursive", color: COLORS.text }}>
            {hoveredRadarDot.broker}
          </div>
          <div className="text-xs flex items-center justify-between" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
            <span>{formatThreatLabel(hoveredRadarDot.type)}</span>
            <span>{hoveredRadarDot.status}</span>
          </div>
        </motion.div>
      )}

      {expanded && hoveredRadarDot && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 bottom-2 -translate-x-1/2 rounded-xl px-4 py-3 border shadow-sm"
          style={{
            width: "min(92%, 560px)",
            borderColor: "rgba(0,0,0,0.16)",
            backgroundColor: "rgba(253,251,247,0.96)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl" style={{ fontFamily: "'Caveat', cursive", color: COLORS.text }}>
                {hoveredRadarDot.broker}
              </div>
              <div className="text-sm" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                {formatThreatLabel(hoveredRadarDot.type)} detected
              </div>
            </div>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hoveredRadarDot.color }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
            <div>Status: {hoveredRadarDot.status}</div>
            <div>Signal: {radarSignalLabel(hoveredRadarDot.distance)}</div>
            <div>Bearing: {Math.round(hoveredRadarDot.angle)} deg</div>
            <div>Range: {Math.round(hoveredRadarDot.distance)}</div>
          </div>
        </motion.div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden pb-8" style={{ backgroundColor: COLORS.bg }}>
      <PressureFilter />
      <ConnectionBanner status={realtimeStatus} />

      <nav
        className="sticky top-0 z-50 pt-4 pb-3 px-6 md:px-12 lg:px-16 flex items-center justify-between backdrop-blur-sm"
        style={{ backgroundColor: "rgba(245, 243, 239, 0.85)", borderBottom: "1.5px dashed rgba(0,0,0,0.15)" }}
      >
        <div className="max-w-[1600px] w-full mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}> 
            <AnimatedDataReaperLogo imageStyle={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }} />
            <PressureText as="span" className="text-3xl tracking-tight" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 700 }}>
              DataReaper
            </PressureText>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button 
              className="text-xl pencil-text transition-colors opacity-100 hover:opacity-70"
              data-reaper-expression="happy"
              data-reaper-phrases="Dashboard view. I see everything from up here.||The operations center is humming with activity."
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate("/war-room")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="To the War Room! Let's initiate some disputes.||Tactical transition. Let's get aggressive."
            >
              War Room
            </button>
            <button 
              onClick={() => navigate("/identity-graph")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="Viewing the web of connections.||Time to see who's really hiding behind the data."
            >
              Identity Graph
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2">
              <motion.div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: statusColor, boxShadow: `0 0 8px ${statusColor}55` }}
                animate={{ opacity: [1, 0.5, 1], scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <PressureText
                as="span"
                className="text-lg px-2 py-0.5 rounded-full border"
                style={{
                  color: statusColor,
                  borderColor: `${statusColor}66`,
                  backgroundColor: `${statusColor}11`,
                  fontWeight: 700,
                  fontFamily: "'Patrick Hand', cursive",
                }}
              >
                {statusLabel}
              </PressureText>
            </div>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              disabled={isStoppingScan || isStopped}
              onClick={async () => {
                if (!scanId || isStoppingScan || isStopped) {
                  return;
                }
                try {
                  setIsStoppingScan(true);
                  await stopScan(scanId, "manual_stop_button");
                  setIsStopped(true);
                  toast.success("Scan stopped. Live crawling halted.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to stop scan.");
                } finally {
                  setIsStoppingScan(false);
                }
              }}
            >
              {isStopped ? "Scan Stopped" : isStoppingScan ? "Stopping..." : "Stop Scan"}
            </button>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              disabled={isStartingNewScan}
              onClick={async () => {
                if (isStartingNewScan) {
                  return;
                }

                const currentSeed = scanQuery.data?.seed;
                const seedValue = String(currentSeed?.value ?? "").trim();
                if (!seedValue) {
                  toast.error("Current scan seed is unavailable. Start a new scan from onboarding.");
                  return;
                }

                try {
                  setIsStartingNewScan(true);
                  setIsStopped(false);

                  const response = await apiClient.post<{
                    scan_id: string;
                    status: string;
                  }>("/api/onboarding/initialize", {
                    seeds: [seedValue],
                    seed_type: currentSeed?.type ?? "auto",
                    jurisdiction: "DPDP",
                    consent_confirmed: true,
                  });

                  const nextScanId = String(response.data?.scan_id ?? "").trim();
                  if (!nextScanId) {
                    throw new Error("Scan initialization did not return a scan ID.");
                  }

                  setActiveScan(nextScanId);
                  await Promise.all([scanQuery.refetch(), refetch()]);
                  toast.success("New scan started.");
                } catch (error) {
                  const message =
                    error instanceof ApiClientError
                      ? error.message
                      : error instanceof Error
                        ? error.message
                        : "Failed to start a new scan.";
                  toast.error(message);
                } finally {
                  setIsStartingNewScan(false);
                }
              }}
              data-reaper-expression="happy"
              data-reaper-phrases="A new target? I'm always hungry for more.||Let's fire up a fresh sequence.||Resetting coordinates for a new hunt."
            >
              {isStartingNewScan ? "Starting..." : "Start New Scan"}
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto px-4 py-4 relative z-10">
        <div className="mb-6 border-b-[1.5px] border-dashed border-black/10 pb-5">
          <PressureText as="h1" className="text-5xl mb-3" style={{ fontFamily: "'Caveat', cursive" }}>
            Cyber Operations Center
          </PressureText>
          {/*
            <MetadataPill label={seedLabel} value={seedValue} />
            <MetadataPill label="Scan ID" value={scanId} />
            <MetadataPill label="Last update" value={formatTimestamp(lastUpdatedAt)} />
          </div>
          <div className="flex flex-wrap items-start gap-3 md:gap-4">
            Scan ID: {scanId} · Last update: {formatTimestamp(lastUpdatedAt)}
          */}
          <div className="flex flex-wrap items-start gap-3 md:gap-4">
            <MetadataPill label={seedLabel} value={seedValue} />
            <MetadataPill label="Scan ID" value={scanId} />
            <MetadataPill label="Last update" value={formatTimestamp(lastUpdatedAt)} />
            <ProgressPill percent={displayProgress} status={backendStatus} />
          </div>
        </div>

        {hasError && (
          <div className="hand-drawn-card p-4 mb-4" style={{ backgroundColor: "rgba(185, 74, 72, 0.08)" }}>
            <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.red }}>
              One or more data streams failed to load.
            </p>
            <button
              type="button"
              className="hand-drawn-button mt-2 px-3 py-1"
              onClick={() => {
                void refetch();
              }}
            >
              Retry Data Fetch
            </button>
          </div>
        )}

        <div 
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4"
          data-reaper-expression="thinking"
          data-reaper-phrases="Numbers don't lie. They're definitely leaking your data.||Look at that spike. Someone just sold your address again.||The statistics of your digital betrayal.||I love tracking the fallout."
        >
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            title="Brokers Scanned"
            value={`${stats.brokersScanned}+`}
            trend={trendLabel(trends.brokersScanned).text}
            trendUp={trendLabel(trends.brokersScanned).up}
            series={trends.brokersScanned}
            tint="rgba(209, 122, 34, 0.04)"
            accentColor={COLORS.orange}
          />
          <StatCard
            icon={<Shield className="w-5 h-5" />}
            title="Exposures Found"
            value={String(stats.exposuresFound)}
            trend={trendLabel(trends.exposuresFound).text}
            trendUp={trendLabel(trends.exposuresFound).up}
            series={trends.exposuresFound}
            tint="rgba(185, 74, 72, 0.04)"
            accentColor={COLORS.red}
          />
          <StatCard
            icon={<Trash2 className="w-5 h-5" />}
            title="Deletions Secured"
            value={String(stats.deletionsSecured)}
            trend={trendLabel(trends.deletionsSecured).text}
            trendUp={trendLabel(trends.deletionsSecured).up}
            series={trends.deletionsSecured}
            tint="rgba(79, 125, 92, 0.04)"
            accentColor={COLORS.green}
          />
          <StatCard
            icon={<Scale className="w-5 h-5" />}
            title="Active Disputes"
            value={String(stats.activeDisputes)}
            trend={trendLabel(trends.activeDisputes).text}
            trendUp={trendLabel(trends.activeDisputes).up}
            series={trends.activeDisputes}
            tint="rgba(74, 111, 165, 0.04)"
            accentColor={COLORS.blue}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-4">
          <div className="flex flex-col gap-4">
            <div 
              className="hand-drawn-card p-4" 
              style={{ backgroundColor: COLORS.card }}
              data-reaper-expression="happy"
              data-reaper-phrases="Your inbox footprint is bleeding into the open web.||Threat levels are elevated. Stay alert.||Email exposure is still the easiest thread to pull."
            >
              <PressureText as="h3" className="text-2xl mb-3" style={{ fontFamily: "'Caveat', cursive" }}>
                Threat Intelligence
              </PressureText>
              <div className="space-y-3">
                <ThreatItem
                  label="Emails Exposed"
                  value={threatBreakdown.email?.count ?? 0}
                  percent={threatBreakdown.email?.percentOfTotal ?? 0}
                  color={COLORS.blue}
                />
              </div>
            </div>

            <div 
              className="hand-drawn-card p-4" 
              style={{ backgroundColor: COLORS.card }}
              data-reaper-expression="happy"
              data-reaper-phrases="My minions are working hard. Look at that efficiency!||Deploying digital scouts to every corner of the web.||I've got an eye on every process. No room for error.||Digital recon in progress. They're finding the leaks."
            >
              <PressureText as="h3" className="text-2xl mb-3" style={{ fontFamily: "'Caveat', cursive" }}>
                Agent Status
              </PressureText>
              <div className="space-y-3">
                {agents.length === 0 && (
                  <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                    No active agents reported yet.
                  </p>
                )}
                {agents.map((agent) => (
                  <AgentStatusRow
                    key={`${agent.mode}-${agent.name}`}
                    name={agent.name}
                    status={agent.status}
                    task={agent.task}
                    progress={agent.progress}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div 
              className="hand-drawn-card p-5 relative" 
              style={{ backgroundColor: COLORS.card }}
              data-reaper-expression="happy"
              data-reaper-phrases="Target ping! I've localized another broker.||The radar is lighting up. They're all around us.||I love it when they show up on my scope."
            >
              <div className="w-full flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <PressureText as="h3" className="text-2xl" style={{ fontFamily: "'Caveat', cursive" }}>
                    Live Radar
                  </PressureText>
                  <button
                    type="button"
                    onClick={() => setIsRadarExpanded(true)}
                    className="p-1.5 rounded-full hover:bg-black/5 transition-colors border border-black/10"
                    title="Expand Radar"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {VISIBLE_THREAT_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: THREAT_COLORS[type] }} />
                      <span className="text-xs capitalize" style={{ fontFamily: "'Patrick Hand', cursive", opacity: 0.75 }}>
                        {type} ({threatCounts[type]})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative w-full flex justify-center py-3">{renderRadar(false)}</div>
            </div>

            <div 
              className="hand-drawn-card p-4" 
              style={{ backgroundColor: COLORS.card }}
              data-reaper-expression="thinking"
              data-reaper-phrases="The web of lies is unraveling. I can see the connections now.||One lead leads to another. They can't hide from my logic.||The trail of digital rot is getting clearer.||Mapping the betrayal. Every node is a broker's secret."
            >
              <PressureText as="h3" className="text-2xl mb-2" style={{ fontFamily: "'Caveat', cursive" }}>
                Intelligence Pivot Chain
              </PressureText>
              <p className="text-xs mb-3" style={{ fontFamily: "'Patrick Hand', cursive", opacity: 0.55 }}>
                Exposed seed to broker graph, generated from live reconnaissance.
              </p>

              {pivotColumns.every((column) => column.values.length === 0) && (
                <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                  Pivot chain is still building.
                </p>
              )}

              {!pivotColumns.every((column) => column.values.length === 0) && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {pivotColumns.map((column) => (
                    <div key={column.label} className="p-3" style={{ border: "1px dashed rgba(0,0,0,0.12)", borderRadius: 12 }}>
                      <div className="text-base mb-2" style={{ fontFamily: "'Caveat', cursive", color: COLORS.text }}>
                        {column.label}
                      </div>
                      <div className="space-y-1">
                        {column.values.length === 0 && (
                          <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.85rem", color: COLORS.textSec }}>
                            No entries
                          </p>
                        )}
                        {column.values.slice(0, 6).map((value, index, values) => (
                          <p
                            key={`${column.label}-${value}`}
                            style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "0.85rem", color: COLORS.text }}
                            title={value}
                          >
                            {value.length > 20 ? `${value.slice(0, 20)}...` : value}
                            {index < values.length - 1 ? "," : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div
              className="hand-drawn-card pencil-fill-dark p-4 flex flex-col"
              style={{ borderTop: `3px solid ${COLORS.blue}`, boxShadow: "inset 0 0 30px rgba(74, 111, 165, 0.15)" }}
              data-reaper-expression="happy"
              data-reaper-phrases="Live feed of the digital hunt. Satisfying, isn't it?||Watch the logs. Every entry is a small victory.||My minions are reporting in. They're doing well."
            >
              <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: "1.5px dashed rgba(255,255,255,0.2)" }}>
                <span className="pencil-heading-light text-lg" style={{ color: "#a8c0e6" }}>
                  Activity Feed
                </span>
                <button
                  type="button"
                  onClick={() => setIsFeedExpanded(true)}
                  className="p-1 rounded-full hover:bg-white/10 transition-colors border border-white/20"
                  title="Expand Feed"
                >
                  <Maximize2 className="w-3 h-3 text-white/70" />
                </button>
              </div>
              <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-[280px] max-h-[420px]">
                {activityLogs.length === 0 && (
                  <p className="pencil-text-light text-sm opacity-75">No activity logs yet.</p>
                )}
                {activityLogs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 p-1.5 border-b border-white/5 rounded"
                    style={{ backgroundColor: `${log.color}11` }}
                  >
                    <span className="pencil-text-light text-xs opacity-85 shrink-0" style={{ color: log.color }}>
                      [{log.type}]
                    </span>
                    <span className="pencil-text-light text-sm tracking-wide opacity-90">{log.message}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isRadarExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12"
            style={{ background: "rgba(253, 251, 247, 0.82)", backdropFilter: "blur(12px)" }}
          >
            <div className="absolute top-8 right-8">
              <button
                type="button"
                onClick={() => setIsRadarExpanded(false)}
                className="p-3 rounded-full hover:bg-black/10 transition-colors border-2 border-black/20 bg-white/50"
              >
                <X className="w-6 h-6 text-[#1a1a1a]" />
              </button>
            </div>
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-[880px] bg-[#fdfbf7] p-8 rounded-2xl"
              style={{ border: "1.5px solid rgba(0,0,0,0.15)", boxShadow: "10px 10px 0 rgba(0,0,0,0.05)" }}
              data-reaper-expression="happy"
              data-reaper-phrases="Look at them all scurrying! They don't even know I'm here.||Expanded vision. I see the whole battlefield now.||Target saturation achieved. My radar never misses a ping.||The hunt is going global. Look at all those leads."
            >
              <div className="flex items-center justify-between mb-6">
                <PressureText as="h2" className="text-4xl" style={{ fontFamily: "'Caveat', cursive" }}>
                  Expanded Radar View
                </PressureText>
                <div className="flex items-center gap-4">
                  {VISIBLE_THREAT_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: THREAT_COLORS[type] }} />
                      <span className="text-sm capitalize" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                        {type} ({threatCounts[type]})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="w-full flex justify-center">{renderRadar(true)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFeedExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12"
            style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)" }}
          >
            <div className="absolute top-8 right-8">
              <button
                type="button"
                onClick={() => setIsFeedExpanded(false)}
                className="p-3 rounded-full hover:bg-white/10 transition-colors border-2 border-white/20 bg-black/50"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-[920px] h-[80vh] bg-[#1a1a1a] p-8 rounded-2xl flex flex-col"
              style={{ border: "1.5px solid rgba(255,255,255,0.15)" }}
              data-reaper-expression="default"
              data-reaper-phrases="Deep dive into the system pulse.||Every byte tells a story of betrayal.||The archive of their digital sins is growing.||I'm cataloging every failure. No one gets a clean record."
            >
              <div className="mb-6 pb-4 border-b border-white/10">
                <PressureText as="h2" className="text-4xl text-white" style={{ fontFamily: "'Caveat', cursive" }}>
                  Live System Logs
                </PressureText>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-3">
                {activityLogs.map((log) => (
                  <motion.div
                    key={`expanded-${log.id}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-4 p-4 border-b border-white/5 rounded-lg bg-white/5"
                    style={{ borderLeft: `4px solid ${log.color}` }}
                  >
                    <span className="text-white/40 font-mono text-sm mt-1">{formatTimestamp(log.createdAt)}</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: log.color }}>
                        {log.type}
                      </span>
                      <span className="text-white/90 text-lg leading-relaxed" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                        {log.message}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
