import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Clock, AlertCircle, Send, Siren, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import { AnimatedDataReaperLogo } from "../components/AnimatedDataReaperLogo";
import {
  dataReaperQueryKeys,
  useCreateEngagementMessageMutation,
  useEngagementDetailQuery,
  useEngagementMessagesQuery,
  useEngagementsQuery,
  useEscalateEngagementMutation,
  useScanStatusQuery,
} from "../lib/hooks";
import { resumeAgent, type EngagementStatus } from "../lib/api";
import { useScanContext, useRequireScan } from "../lib/scanContext";
import { useRealtimeSubscription, type RealtimeConnectionStatus } from "../lib/wsClient";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { type AgentEvent } from "../types/ws";

const COLORS = {
  bg: "#f5f3ef",
  card: "#f1eee8",
  paper: "#fdfbf7",
  blue: "#4a6fa5",
  orange: "#d17a22",
  red: "#b94a48",
  green: "#4f7d5c",
  text: "#1f1f1f",
  textSec: "#5a5a5a",
};

type Classification = "Violation" | "Delay" | "Warning" | "Progress" | "Resolved";

type CaptchaBlockState = {
  broker: string;
  type: string;
};

function getStatusColor(status: string) {
  switch (status) {
    case "resolved":
      return COLORS.green;
    case "stalling":
      return COLORS.orange;
    case "illegal":
      return COLORS.red;
    case "in-progress":
      return COLORS.blue;
    default:
      return COLORS.textSec;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "resolved":
      return "Resolved";
    case "stalling":
      return "Stalling";
    case "illegal":
      return "Illegal Pushback";
    case "in-progress":
      return "In Progress";
    default:
      return "Unknown";
  }
}

function ConnectionBanner({ status }: { status: RealtimeConnectionStatus }) {
  if (status === "connected" || status === "idle") {
    return null;
  }

  const label =
    status === "offline"
      ? "Offline mode enabled. War Room updates are paused."
      : status === "reconnecting"
        ? "Reconnecting to War Room stream..."
        : status === "connecting"
          ? "Connecting to War Room stream..."
          : "Realtime stream unavailable. Auto-retry is active.";

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 lg:px-12 pt-3">
      <div className="hand-drawn-card px-4 py-2" style={{ backgroundColor: "rgba(185, 74, 72, 0.12)" }}>
        <p style={{ fontFamily: "'Patrick Hand', cursive", color: "#8f2d2a" }}>{label}</p>
      </div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function BrokerMessage({ content, timestamp }: { content: string; timestamp: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[72%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs" style={{ color: "#717182" }}>
            Broker Support
          </span>
          <span className="text-xs" style={{ color: "#A0AEC0" }}>
            {timestamp}
          </span>
        </div>
        <div className="px-4 py-3 rounded-2xl shadow-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.1)" }}>
          <div className="text-sm" style={{ color: "#0B0F1A" }}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentMessage({
  content,
  timestamp,
  legalCitation,
  explanation,
}: {
  content: string;
  timestamp: string;
  legalCitation?: string;
  explanation?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex justify-end">
      <div className="max-w-[72%]">
        <div className="flex items-center gap-2 mb-1 justify-end">
          <span className="text-xs" style={{ color: "#A0AEC0" }}>
            {timestamp}
          </span>
          <span className="text-xs" style={{ color: "#6C63FF" }}>
            Communications Agent
          </span>
        </div>
        <div
          className="px-4 py-3 rounded-2xl shadow-lg relative"
          style={{ background: "linear-gradient(135deg, #6C63FF 0%, #8B85FF 100%)" }}
          onMouseEnter={() => setShowTooltip(Boolean(legalCitation && explanation))}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="text-sm" style={{ color: "#FFFFFF" }}>
            {content}
          </div>

          {showTooltip && legalCitation && explanation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-full right-0 mb-2 p-3 rounded-lg shadow-xl max-w-xs z-10"
              style={{ backgroundColor: "#0B0F1A", border: "1px solid rgba(79, 209, 197, 0.3)" }}
            >
              <div className="text-xs mb-1" style={{ color: "#4FD1C5" }}>
                {legalCitation}
              </div>
              <div className="text-xs" style={{ color: "#E0E0E0" }}>
                {explanation}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemMessage({
  content,
  timestamp,
  classification,
}: {
  content: string;
  timestamp: string;
  classification?: Classification;
}) {
  const classificationColor =
    classification === "Violation"
      ? "#FF6B6B"
      : classification === "Delay" || classification === "Warning"
        ? "#FF9F43"
        : classification === "Progress"
          ? "#4A90E2"
          : classification === "Resolved"
            ? "#4FD1C5"
            : "#717182";

  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2">
        <div
          className="px-3 py-1.5 rounded-full flex items-center gap-2 text-xs shadow-sm"
          style={{
            backgroundColor: `${classificationColor}15`,
            color: classificationColor,
            border: `1px solid ${classificationColor}55`,
          }}
        >
          <AlertCircle className="w-3 h-3" />
          <span>{content}</span>
        </div>
        <span className="text-xs" style={{ color: "#A0AEC0" }}>
          {timestamp}
        </span>
      </div>
    </div>
  );
}

export default function WarRoom() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearActiveScan } = useScanContext();
  const scanId = useRequireScan();

  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | EngagementStatus>("all");
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [escalationNote, setEscalationNote] = useState("Non-compliant response pattern detected.");
  const [captchaBlock, setCaptchaBlock] = useState<CaptchaBlockState | null>(null);
  const [resumePending, setResumePending] = useState(false);

  const statusesFilter = useMemo(
    () => (selectedStatusFilter === "all" ? undefined : [selectedStatusFilter]),
    [selectedStatusFilter]
  );

  const scanQuery = useScanStatusQuery(scanId);
  const engagementsQuery = useEngagementsQuery(scanId, statusesFilter);
  const engagements = engagementsQuery.data?.items ?? [];

  useEffect(() => {
    if (engagements.length === 0) {
      setSelectedEngagementId(null);
      return;
    }

    if (!selectedEngagementId || !engagements.some((item) => item.id === selectedEngagementId)) {
      setSelectedEngagementId(engagements[0].id);
    }
  }, [engagements, selectedEngagementId]);

  const engagementDetailQuery = useEngagementDetailQuery(scanId, selectedEngagementId);
  const engagementMessagesQuery = useEngagementMessagesQuery(scanId, selectedEngagementId);

  const createMessageMutation = useCreateEngagementMessageMutation(scanId, selectedEngagementId);
  const escalateMutation = useEscalateEngagementMutation(scanId, selectedEngagementId);

  const realtimeStatus = useRealtimeSubscription({
    scanId,
    enabled: Boolean(scanId),
    channels: ["warroom.engagements", "warroom.messages", "scans.lifecycle"],
    onEvent: (event) => {
      if (!scanId || event.scanId !== scanId) {
        return;
      }

      const payload = event.payload as Record<string, unknown>;
      if (event.event === "captcha_block") {
        const broker = typeof payload.broker === "string" ? payload.broker : "Unknown broker";
        const type = typeof payload.type === "string" ? payload.type : "unknown";
        const agentEvent: AgentEvent = { event: "captcha_block", broker, type };
        setCaptchaBlock({ broker: agentEvent.broker, type: agentEvent.type });
        setResumePending(false);
        return;
      }

      if (event.event === "agent_resumed") {
        const agentEvent: AgentEvent = { event: "agent_resumed" };
        if (agentEvent.event === "agent_resumed") {
          setCaptchaBlock(null);
          setResumePending(false);
          toast.success("Sleuth Agent resumed.");
        }
      }

      void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.engagements(scanId, statusesFilter) });

      if (selectedEngagementId) {
        void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.engagementDetail(scanId, selectedEngagementId) });
        void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.engagementMessages(scanId, selectedEngagementId) });
      }

      if (event.event.startsWith("scans.lifecycle")) {
        void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.scan(scanId) });
      }
    },
  });

  const handleResumeAgent = async () => {
    if (!scanId || resumePending) {
      return;
    }
    try {
      setResumePending(true);
      await resumeAgent(scanId);
      toast.success("Resume signal sent. Waiting for agent confirmation...");
    } catch (error) {
      setResumePending(false);
      toast.error(error instanceof Error ? error.message : "Failed to resume agent.");
    }
  };

  if (!scanId) {
    return null;
  }

  const selectedEngagement = engagementDetailQuery.data;
  const messageItems = engagementMessagesQuery.data?.items ?? selectedEngagement?.conversation ?? [];

  const isLoading = engagementsQuery.isLoading || engagementDetailQuery.isLoading;
  const hasError = engagementsQuery.isError || engagementDetailQuery.isError;

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedEngagementId || createMessageMutation.isPending) {
      return;
    }

    try {
      await createMessageMutation.mutateAsync({
        type: "agent",
        content: messageInput.trim(),
      });
      setMessageInput("");
      toast.success("Message queued successfully.");
      void engagementMessagesQuery.refetch();
      void engagementsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message.");
    }
  };

  const handleEscalate = async () => {
    if (!selectedEngagementId || escalateMutation.isPending) {
      return;
    }

    try {
      await escalateMutation.mutateAsync({
        reasonCode: "non_compliance",
        note: escalationNote.trim() || "Escalation requested by operator.",
        legalFramework: "DPDP",
      });
      toast.success("Escalation accepted and queued.");
      void engagementsQuery.refetch();
      void engagementDetailQuery.refetch();
      void engagementMessagesQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Escalation failed.");
    }
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden" style={{ backgroundColor: COLORS.bg }}>
      <PressureFilter />
      <ConnectionBanner status={realtimeStatus} />

      {captchaBlock && (
        <div className="mx-auto max-w-[1600px] px-4 md:px-8 lg:px-12 pt-3">
          <Alert variant="destructive" className="border border-red-700 bg-red-50 text-red-900">
            <AlertTitle>Sleuth Agent Blocked - Manual CAPTCHA Required on {captchaBlock.broker}</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Detected challenge type: {captchaBlock.type}</span>
                <button
                  type="button"
                  className="hand-drawn-button px-3 py-1.5 flex items-center gap-2"
                  onClick={() => void handleResumeAgent()}
                  disabled={resumePending}
                >
                  {resumePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {resumePending ? "Waiting for agent_resumed..." : "Resume Agent"}
                </button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <nav
        className="sticky top-0 z-50 px-4 md:px-8 lg:px-12 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(245, 243, 239, 0.88)", borderBottom: "1.5px dashed rgba(0,0,0,0.15)" }}
      >
        <div className="w-full flex flex-col gap-3 md:grid md:grid-cols-3 md:items-center">
          <div className="flex items-center justify-center md:justify-start gap-2 cursor-pointer" onClick={() => navigate("/")}> 
            <AnimatedDataReaperLogo />
            <PressureText as="span" className="text-3xl tracking-tight" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 700 }}>
              DataReaper
            </PressureText>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8">
            <button 
              onClick={() => navigate("/command-center")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="Switching lenses. Same data, different angle.||Checking the global overview.||Back to the command deck."
            >
              Dashboard
            </button>
            <button 
              className="text-xl pencil-text transition-colors opacity-100 hover:opacity-70" 
              aria-current="page"
              data-reaper-expression="happy"
              data-reaper-phrases="Tactical view. Every packet, scrutinized.||I like the smell of legal disputes.||The War Room is quite cozy, isn't it?"
            >
              War Room
            </button>
            <button 
              onClick={() => navigate("/identity-graph")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="The full picture. They can't hide.||Connecting the digital dots.||Let's see who's really behind this."
            >
              Identity Graph
            </button>
          </div>

          <div className="flex items-center justify-center md:justify-end gap-2">
            <PressureText as="span" className="text-base hidden lg:block" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
              {scanQuery.data?.status ? `Lifecycle: ${scanQuery.data.status}` : "Loading scan"}
            </PressureText>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              onClick={() => {
                clearActiveScan();
                navigate("/onboarding");
              }}
              data-reaper-expression="happy"
              data-reaper-phrases="Back to base? A fresh hunt begins.||New targets, new data to reap.||Let's fire up a clean scan."
            >
              Start New Scan
            </button>
          </div>
        </div>
      </nav>

      <div className="px-4 md:px-6 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <span style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>Status filter:</span>
          <select
            value={selectedStatusFilter}
            onChange={(event) => setSelectedStatusFilter(event.target.value as "all" | EngagementStatus)}
            className="hand-drawn-button px-3 py-1 bg-transparent"
            style={{ fontFamily: "'Patrick Hand', cursive" }}
          >
            <option value="all">All</option>
            <option value="resolved">Resolved</option>
            <option value="stalling">Stalling</option>
            <option value="illegal">Illegal Pushback</option>
            <option value="in-progress">In Progress</option>
          </select>
        </div>
      </div>

      {hasError && (
        <div className="px-4 md:px-6 pb-2">
          <div className="hand-drawn-card p-4" style={{ backgroundColor: "rgba(185, 74, 72, 0.08)" }}>
            <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.red }}>
              Failed to load War Room data.
            </p>
            <button
              type="button"
              className="hand-drawn-button mt-2 px-3 py-1"
              onClick={() => {
                void engagementsQuery.refetch();
                void engagementDetailQuery.refetch();
                void engagementMessagesQuery.refetch();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="flex h-[calc(100vh-150px)] w-full p-4 md:p-6 gap-6">
        <div className="w-[30%] hand-drawn-card overflow-hidden flex flex-col">
          <div className="p-6 border-b z-10" style={{ borderBottom: "2px solid #2b2b2b" }}>
            <PressureText as="h2" variant="strong" className="paper-text text-3xl mb-1" style={{ fontFamily: "'Caveat', cursive" }}>
              Active Engagements
            </PressureText>
            <PressureText as="p" variant="lite" className="paper-text text-lg opacity-80" style={{ fontFamily: "'Patrick Hand', cursive" }}>
              Monitoring legal disputes
            </PressureText>
          </div>

          <div 
            className="p-4 space-y-4 overflow-y-auto flex-1"
            data-reaper-expression="happy"
            data-reaper-phrases="The hit list. Watch them squirm.||Multiple targets locked.||Data brokers on the run.||This list will be their undoing.||I've got my scythe ready for these guys."
          >
            {isLoading && <p style={{ fontFamily: "'Patrick Hand', cursive" }}>Loading engagements...</p>}
            {!isLoading && engagements.length === 0 && (
              <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                No engagements match this filter.
              </p>
            )}

            {engagements.map((target) => (
              <motion.div key={target.id} onClick={() => setSelectedEngagementId(target.id)} whileHover={{ scale: 1.01, rotate: 0.5 }} className="p-4 cursor-pointer relative">
                <div
                  className="absolute inset-0 border-2 border-transparent transition-colors"
                  style={{
                    borderColor: selectedEngagementId === target.id ? "#2b2b2b" : "transparent",
                    borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                    backgroundColor: selectedEngagementId === target.id ? "rgba(123, 111, 181, 0.05)" : "transparent",
                  }}
                />

                <div className="relative z-10 flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <PressureText as="h3" variant="strong" className="paper-text text-xl mb-1" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                      {target.brokerName}
                    </PressureText>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 relative">
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundColor: getStatusColor(target.status),
                          borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                        }}
                      />
                      <motion.div
                        className="w-1.5 h-1.5 rounded-full relative z-10"
                        style={{ backgroundColor: getStatusColor(target.status) }}
                        animate={{ opacity: [1, 0.5, 1], scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-sm font-bold relative z-10" style={{ color: getStatusColor(target.status), fontFamily: "'Caveat', cursive" }}>
                        {getStatusLabel(target.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex items-center justify-between text-sm opacity-70" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {target.lastActivity}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {target.messageCount} msgs
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col hand-drawn-card overflow-hidden">
          <div className="p-6 border-b" style={{ borderBottom: "2px solid #2b2b2b" }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <PressureText as="h2" variant="strong" className="paper-text text-4xl mb-1" style={{ fontFamily: "'Dancing Script', cursive" }}>
                  {selectedEngagement?.brokerName ?? "No engagement selected"}
                </PressureText>
                {selectedEngagement && (
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 relative">
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundColor: getStatusColor(selectedEngagement.status),
                          borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                        }}
                      />
                      <motion.div
                        className="w-2 h-2 rounded-full relative z-10"
                        style={{ backgroundColor: getStatusColor(selectedEngagement.status) }}
                        animate={{ opacity: [1, 0.5, 1], scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-base font-bold relative z-10" style={{ color: getStatusColor(selectedEngagement.status), fontFamily: "'Caveat', cursive" }}>
                        {getStatusLabel(selectedEngagement.status)}
                      </span>
                    </div>
                    <span className="text-base opacity-70" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                      Last activity: {selectedEngagement.lastActivity}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => navigate("/identity-graph")} className="px-4 py-2 text-lg hand-drawn-button" style={{ color: COLORS.blue }}>
                  <PressureText className="paper-text">View Graph</PressureText>
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-lg hand-drawn-button flex items-center gap-2"
                  style={{ color: COLORS.red }}
                  onClick={handleEscalate}
                  disabled={!selectedEngagementId || escalateMutation.isPending}
                  data-reaper-expression="confused"
                  data-reaper-phrases="Burn it down. No more warnings.||Unleash the legal hounds.||Escalation is my favorite part.||They had their chance."
                >
                  <Siren className="w-4 h-4" />
                  {escalateMutation.isPending ? "Escalating..." : "Escalate"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            {!selectedEngagementId && (
              <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                Select an engagement from the left panel.
              </p>
            )}

            <AnimatePresence>
              {messageItems.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10, rotate: index % 2 === 0 ? -0.5 : 0.5 }}
                  animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -0.5 : 0.5 }}
                  transition={{ delay: index * 0.03 }}
                >
                  {message.type === "system" ? (
                    <SystemMessage
                      content={message.content}
                      timestamp={formatTimestamp(String(message.timestamp))}
                      classification={message.metadata?.classification as Classification | undefined}
                    />
                  ) : message.type === "broker" ? (
                    <BrokerMessage content={message.content} timestamp={formatTimestamp(String(message.timestamp))} />
                  ) : (
                    <AgentMessage
                      content={message.content}
                      timestamp={formatTimestamp(String(message.timestamp))}
                      legalCitation={message.metadata?.legalCitation}
                      explanation={message.metadata?.explanation}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="border-t p-4" style={{ borderTop: "2px solid #2b2b2b" }}>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3 mb-3">
              <input
                type="text"
                value={escalationNote}
                onChange={(event) => setEscalationNote(event.target.value)}
                className="hand-drawn-button px-3 py-2 bg-transparent"
                style={{ fontFamily: "'Patrick Hand', cursive" }}
                placeholder="Escalation note"
              />
              <button
                type="button"
                className="hand-drawn-button px-3 py-2"
                onClick={handleEscalate}
                disabled={!selectedEngagementId || escalateMutation.isPending}
              >
                {escalateMutation.isPending ? "Escalating..." : "Submit Escalation"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[3fr_1fr] gap-3">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(event) => setMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleSendMessage();
                    }
                  }}
                  className="hand-drawn-button px-3 py-2 bg-transparent"
                  style={{ fontFamily: "'Patrick Hand', cursive" }}
                  placeholder="Add operator note or outbound response"
                  data-reaper-expression="thinking"
                  data-reaper-phrases="Drop them a memo. Keep it sharp.||Strategic communication in progress.||Every word counts in this battle.||Writing their digital obituary."
                />
              <button
                type="button"
                className="hand-drawn-button px-3 py-2 flex items-center justify-center gap-2"
                onClick={() => void handleSendMessage()}
                disabled={!selectedEngagementId || createMessageMutation.isPending || !messageInput.trim()}
              >
                <Send className="w-4 h-4" />
                {createMessageMutation.isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hand-drawn-card {
          border: 2px solid #2b2b2b !important;
          border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px !important;
          background-color: #fdfbf7;
          box-shadow: 8px 8px 0px rgba(0,0,0,0.05) !important;
          position: relative;
        }

        .hand-drawn-button {
          background-color: transparent;
          border: 2px solid #2b2b2b;
          border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
          cursor: pointer;
          transition: transform 0.1s ease-in-out;
        }

        .hand-drawn-button:hover {
          transform: scale(1.02) rotate(-1deg);
        }

        .hand-drawn-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
    </div>
  );
}
