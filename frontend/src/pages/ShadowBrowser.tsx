import { useEffect, useState, useCallback, useMemo, Fragment, type ReactNode } from "react";
import { AppNavbar } from "../components/AppNavbar";
import { PressureText } from "../components/PressureText";
import { Switch } from "../components/ui/switch";
import { Ghost, History, Search, Globe, Clock, ExternalLink, Chrome, UserRound, ChevronDown } from "lucide-react";

const COLORS = {
  bg: "#f0ebe3",
  card: "#fdfbf7",
  border: "#c9c2b6",
  text: "#1a1a1a",
  textSec: "#4a4a4a",
  green: "#4f7d5c",
  blue: "#3d5a80",
  accent: "#e94560",
};

const INITIAL_PERSONAS = 5;
const PERSONA_STEP = 5;
const INITIAL_VISITS = 6;
const VISIT_STEP = 8;

type Persona = {
  name: string;
  age: number;
  occupation: string;
  interests: string[];
};

type ShadowLogEntry = {
  persona: string;
  occupation: string;
  urls: string[];
  ts: number;
  decoySession?: { site: string; alias: string };
};

type HistoryVisit = {
  url: string;
  persona: string;
  occupation: string;
  ts: number;
  kind: "page" | "session";
  sessionLabel?: string;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const t = `${h12}:${m} ${ampm}`;
  if (isToday) return `Today, ${t}`;
  if (isYesterday) return `Yesterday, ${t}`;
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}, ${t}`;
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function extractSearchQuery(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("google.")) return u.searchParams.get("q");
    if (u.hostname.includes("reddit.com")) return new URLSearchParams(u.search).get("q");
    if (u.hostname.includes("stackoverflow.com")) return u.searchParams.get("q");
    if (u.hostname.includes("github.com") && u.pathname.includes("/search")) return u.searchParams.get("q");
    return u.searchParams.get("search_query") ?? u.searchParams.get("q");
  } catch {
    return null;
  }
}

function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function visitMatchesSearch(visit: HistoryVisit, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    visit.url.toLowerCase().includes(n) ||
    extractDomain(visit.url).toLowerCase().includes(n) ||
    (extractSearchQuery(visit.url) ?? "").toLowerCase().includes(n) ||
    (visit.sessionLabel ?? "").toLowerCase().includes(n) ||
    visit.persona.toLowerCase().includes(n) ||
    visit.occupation.toLowerCase().includes(n) ||
    formatTime(visit.ts).toLowerCase().includes(n)
  );
}

export default function ShadowBrowser() {
  const [shadowEnabled, setShadowEnabled] = useState(true);
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);
  const [shadowLog, setShadowLog] = useState<ShadowLogEntry[]>([]);
  const [selectedPersonaName, setSelectedPersonaName] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [personaShowCount, setPersonaShowCount] = useState(INITIAL_PERSONAS);
  const [visitShowCount, setVisitShowCount] = useState(INITIAL_VISITS);

  const postToBridge = useCallback((data: object) => {
    window.postMessage(data, window.location.origin);
  }, []);

  const toggleShadow = useCallback(
    (enabled: boolean) => {
      setShadowEnabled(enabled);
      postToBridge({ type: "DR_TOGGLE_SHADOW_BROWSER", enabled });
    },
    [postToBridge]
  );

  const refreshPersona = useCallback(() => {
    postToBridge({ type: "DR_GET_SHADOW_PERSONA", forceRandom: true });
  }, [postToBridge]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "DR_SHADOW_BROWSER_ENABLED" && typeof event.data?.enabled === "boolean")
        setShadowEnabled(event.data.enabled);
      if (event.data?.type === "DR_SHADOW_PERSONA" && event.data?.persona)
        setCurrentPersona(event.data.persona as Persona);
      if (event.data?.type === "DR_SHADOW_LOG" && Array.isArray(event.data?.log))
        setShadowLog(event.data.log as ShadowLogEntry[]);
    };
    window.addEventListener("message", handler);
    postToBridge({ type: "DR_GET_SHADOW_BROWSER_ENABLED" });
    postToBridge({ type: "DR_GET_SHADOW_PERSONA", forceRandom: false });
    postToBridge({ type: "DR_GET_SHADOW_LOG" });
    const iv = setInterval(() => {
      postToBridge({ type: "DR_GET_SHADOW_LOG" });
      postToBridge({ type: "DR_GET_SHADOW_PERSONA", forceRandom: false });
    }, 5000);
    return () => {
      window.removeEventListener("message", handler);
      clearInterval(iv);
    };
  }, [postToBridge]);

  useEffect(() => {
    setVisitShowCount(INITIAL_VISITS);
  }, [selectedPersonaName, historySearch]);

  const recentPersonas = useMemo(() => {
    const map = new Map<string, { name: string; occupation: string; lastTs: number }>();
    for (const e of shadowLog) {
      const prev = map.get(e.persona);
      if (!prev || e.ts > prev.lastTs) map.set(e.persona, { name: e.persona, occupation: e.occupation, lastTs: e.ts });
    }
    return Array.from(map.values())
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 10);
  }, [shadowLog]);

  const logForSelected = useMemo(
    () => (selectedPersonaName ? shadowLog.filter((e) => e.persona === selectedPersonaName) : []),
    [shadowLog, selectedPersonaName]
  );

  const allVisits = useMemo(() => {
    const visits: HistoryVisit[] = [];
    logForSelected.forEach((e) => {
      e.urls.forEach((url) =>
        visits.push({ url, persona: e.persona, occupation: e.occupation, ts: e.ts, kind: "page" })
      );
      if (e.decoySession)
        visits.push({
          url: "",
          persona: e.persona,
          occupation: e.occupation,
          ts: e.ts,
          kind: "session",
          sessionLabel: `Simulated account · ${e.decoySession.site} · @${e.decoySession.alias}`,
        });
    });
    return visits;
  }, [logForSelected]);

  const filtered = useMemo(() => allVisits.filter((v) => visitMatchesSearch(v, historySearch)), [allVisits, historySearch]);

  const sortedVisits = useMemo(() => [...filtered].sort((a, b) => b.ts - a.ts), [filtered]);

  const visibleVisits = sortedVisits.slice(0, visitShowCount);
  const personasVisible = recentPersonas.slice(0, personaShowCount);
  const morePersonas = personaShowCount < recentPersonas.length;
  const moreVisits = visitShowCount < sortedVisits.length;

  const selectedMeta = recentPersonas.find((p) => p.name === selectedPersonaName);

  const panelShadow = "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100%",
        boxSizing: "border-box",
        background: COLORS.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppNavbar
        active="shadow-browser"
        rightSlot={
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "center",
              padding: "8px 14px",
              background: COLORS.card,
              border: `1.5px solid ${COLORS.border}`,
              borderRadius: 14,
              boxShadow: panelShadow,
            }}
          >
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "1.05rem", fontWeight: 600, color: COLORS.text }}>
              Shadow Mode
            </span>
            <Switch checked={shadowEnabled} onCheckedChange={toggleShadow} />
          </div>
        }
      />

      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          padding: "16px clamp(16px, 3vw, 48px) 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Page title — below shared nav */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "stretch",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: "clamp(16px, 2vh, 28px)",
            flexShrink: 0,
            borderBottom: `2px solid ${COLORS.border}`,
            paddingBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "clamp(20px, 4vw, 48px)",
              width: "100%",
              minWidth: 0,
            }}
          >
            <PressureText
              as="h1"
              variant="strong"
              className="paper-text"
              style={{
                fontFamily: "'Dancing Script', cursive",
                fontSize: "clamp(2.25rem, 4vw, 3.25rem)",
                color: COLORS.text,
                lineHeight: 1.1,
                margin: 0,
                display: "block",
                width: "auto",
                flexShrink: 0,
              }}
            >
              <Ghost size={40} style={{ display: "inline", marginRight: 12, verticalAlign: "middle" }} />
              Shadow Browser
            </PressureText>
            <p
              style={{
                fontFamily: "'Patrick Hand', cursive",
                color: COLORS.textSec,
                margin: 0,
                fontSize: "clamp(1.05rem, 1.5vw, 1.35rem)",
                lineHeight: 1.45,
                display: "block",
                flex: "1 1 min(100%, 240px)",
                maxWidth: "min(36rem, max(12rem, calc(100% - 10rem)))",
                marginLeft: "auto",
                textAlign: "left",
                boxSizing: "border-box",
              }}
            >
              Decoy identities browse in the background so data brokers see someone else. Pick a persona on the left — their
              decoy visits appear on the right.
            </p>
          </div>
        </header>

        {/* Split — fills remaining viewport (no page scroll for main work area) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(min(100%, 340px), 22vw) 1fr",
            gap: "clamp(16px, 2vw, 28px)",
            alignItems: "stretch",
          }}
        >
          {/* LEFT */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <div
              style={{
                background: "linear-gradient(145deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%)",
                border: `2px solid ${COLORS.accent}`,
                borderRadius: 18,
                padding: "clamp(20px, 2.5vw, 28px)",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(233,69,96,0.2)",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "linear-gradient(rgba(233,69,96,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(233,69,96,0.04) 1px,transparent 1px)",
                  backgroundSize: "28px 28px",
                }}
              />
              <div style={{ textAlign: "center", position: "relative" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg,${COLORS.accent},#c23152)`,
                    margin: "0 auto 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 28px rgba(233,69,96,0.45)",
                  }}
                >
                  <Ghost size={36} color="#fff" />
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: COLORS.accent,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    fontFamily: "'Patrick Hand',cursive",
                    fontWeight: 600,
                  }}
                >
                  Currently active
                </div>
                <div
                  style={{
                    fontSize: "clamp(1.35rem, 2.2vw, 1.75rem)",
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "'Dancing Script',cursive",
                    marginTop: 6,
                  }}
                >
                  {currentPersona?.name ?? "Waiting…"}
                </div>
                {currentPersona && (
                  <div style={{ fontSize: "1rem", color: "#b8b8cc", fontFamily: "'Patrick Hand',cursive", marginTop: 4 }}>
                    {currentPersona.age} years · {currentPersona.occupation}
                  </div>
                )}
                {currentPersona && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, justifyContent: "center" }}>
                    {currentPersona.interests.slice(0, 3).map((t, i) => (
                      <span
                        key={i}
                        style={{
                          background: "rgba(233,69,96,0.15)",
                          color: "#f0c4cc",
                          padding: "6px 12px",
                          borderRadius: 999,
                          fontSize: "0.85rem",
                          fontFamily: "'Patrick Hand',cursive",
                          border: "1px solid rgba(233,69,96,0.35)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  className="hand-drawn-button"
                  onClick={refreshPersona}
                  style={{
                    marginTop: 18,
                    padding: "12px 18px",
                    fontSize: "1rem",
                    backgroundColor: "rgba(233,69,96,0.25)",
                    color: "#fff",
                    width: "100%",
                    border: "1px solid rgba(233,69,96,0.45)",
                    fontFamily: "'Patrick Hand',cursive",
                  }}
                >
                  Randomize identity
                </button>
              </div>
            </div>

            {/* Persona rail */}
            <div
              style={{
                background: COLORS.card,
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: panelShadow,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `2px solid ${COLORS.border}`,
                  fontWeight: 700,
                  fontFamily: "'Patrick Hand',cursive",
                  fontSize: "1.2rem",
                  color: COLORS.text,
                  background: "linear-gradient(180deg, rgba(61,90,128,0.08), transparent)",
                }}
              >
                Decoy identities
                <span style={{ fontWeight: 500, color: COLORS.textSec, fontSize: "0.95rem", marginLeft: 8 }}>
                  · {recentPersonas.length} recent
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {recentPersonas.length === 0 ? (
                  <div style={{ padding: 20, fontFamily: "'Patrick Hand',cursive", color: COLORS.textSec, fontSize: "1.05rem", lineHeight: 1.6 }}>
                    No log yet. Keep this tab open with Shadow Mode on — bursts from the extension will show up here.
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      {personasVisible.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setSelectedPersonaName(selectedPersonaName === p.name ? null : p.name)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "14px 18px",
                            border: "none",
                            borderBottom: `1px dashed ${COLORS.border}`,
                            borderLeft: selectedPersonaName === p.name ? `4px solid ${COLORS.blue}` : "4px solid transparent",
                            background: selectedPersonaName === p.name ? "rgba(61,90,128,0.12)" : "transparent",
                            cursor: "pointer",
                            fontFamily: "'Patrick Hand',cursive",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            if (selectedPersonaName !== p.name) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
                          }}
                          onMouseLeave={(e) => {
                            if (selectedPersonaName !== p.name) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          }}
                        >
                          <div style={{ fontWeight: 700, color: COLORS.text, fontSize: "1.1rem" }}>{p.name}</div>
                          <div style={{ fontSize: "0.95rem", color: COLORS.textSec, marginTop: 2 }}>{p.occupation}</div>
                          <div style={{ fontSize: "0.88rem", color: COLORS.blue, marginTop: 6, fontWeight: 600 }}>
                            Last burst {timeAgo(p.lastTs)}
                          </div>
                        </button>
                      ))}
                    </div>
                    {morePersonas && (
                      <button
                        type="button"
                        className="hand-drawn-button"
                        onClick={() => setPersonaShowCount((c) => Math.min(c + PERSONA_STEP, recentPersonas.length))}
                        style={{
                          margin: 12,
                          padding: "12px 16px",
                          fontFamily: "'Patrick Hand',cursive",
                          fontSize: "1.05rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          background: "#fff",
                          borderColor: COLORS.blue,
                          color: COLORS.blue,
                        }}
                      >
                        <ChevronDown size={18} />
                        View more ({recentPersonas.length - personaShowCount} hidden)
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>

          {/* RIGHT */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {!selectedPersonaName ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 48,
                  textAlign: "center",
                  fontFamily: "'Patrick Hand',cursive",
                  color: COLORS.textSec,
                  border: `1.5px solid ${COLORS.border}`,
                  background: COLORS.card,
                  borderRadius: 16,
                  boxShadow: panelShadow,
                }}
              >
                <History size={56} strokeWidth={1.5} color={COLORS.border} style={{ marginBottom: 20 }} />
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>Select a persona</div>
                <div style={{ fontSize: "1.15rem", maxWidth: 400 }}>
                  Click a name in the left column to load every decoy URL recorded for that identity.
                </div>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  background: "#fff",
                  border: `1.5px solid ${COLORS.border}`,
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: panelShadow,
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(180deg, #eef2f7, #e8ecf2)",
                    borderBottom: `2px solid ${COLORS.border}`,
                    padding: "16px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <Chrome size={26} color={COLORS.textSec} />
                  <span
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      color: COLORS.text,
                      fontFamily: "'Patrick Hand',cursive",
                    }}
                  >
                    {selectedPersonaName}
                  </span>
                  {selectedMeta && (
                    <span style={{ fontSize: "1.05rem", color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive" }}>
                      · {selectedMeta.occupation}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "1rem",
                      color: COLORS.textSec,
                      fontFamily: "'Patrick Hand',cursive",
                      fontWeight: 600,
                    }}
                  >
                    {filtered.length === allVisits.length ? `${allVisits.length} visits` : `${filtered.length} of ${allVisits.length}`}
                  </span>
                </div>

                <div style={{ padding: "14px 22px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <Search size={22} color={COLORS.textSec} />
                  <input
                    type="text"
                    placeholder="Search this persona's history…"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{
                      border: "none",
                      outline: "none",
                      fontSize: "1.05rem",
                      fontFamily: "'Patrick Hand',cursive",
                      flex: 1,
                      color: COLORS.text,
                      background: "transparent",
                    }}
                  />
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                  {sortedVisits.length === 0 ? (
                    <div style={{ padding: 48, textAlign: "center" }}>
                      <History size={48} color="#dadce0" />
                      <div style={{ marginTop: 16, fontSize: "1.1rem", color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive" }}>
                        {historySearch.trim() ? "No matches" : "No visits for this persona yet"}
                      </div>
                    </div>
                  ) : (
                    <>
                      {visibleVisits.map((visit, idx) => {
                        const showDate =
                          idx === 0 || new Date(visit.ts).toDateString() !== new Date(visibleVisits[idx - 1].ts).toDateString();
                        const blocks: ReactNode[] = [];
                        if (showDate) {
                          blocks.push(
                            <div
                              key={`d-${visit.ts}-${idx}`}
                              style={{
                                background: "#f0f3f8",
                                padding: "10px 22px",
                                borderBottom: "1px solid #dde3ec",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <Clock size={18} color={COLORS.textSec} />
                              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive" }}>
                                {dayLabel(visit.ts)}
                              </span>
                            </div>
                          );
                        }
                        if (visit.kind === "session") {
                          blocks.push(
                            <div
                              key={`s-${idx}`}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 14,
                                padding: "14px 22px",
                                borderBottom: "1px solid #eceef2",
                                background: "rgba(26,115,232,0.04)",
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: "#e8f0fe",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <UserRound size={16} color="#1a73e8" />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#174ea6", fontFamily: "'Patrick Hand',cursive" }}>
                                  {visit.sessionLabel}
                                </div>
                                <div style={{ fontSize: "0.95rem", color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive", marginTop: 4 }}>
                                  Local label only · {formatTime(visit.ts)}
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          const domain = extractDomain(visit.url);
                          const query = extractSearchQuery(visit.url);
                          blocks.push(
                            <div
                              key={`u-${visit.url}-${idx}`}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 14,
                                padding: "14px 22px",
                                borderBottom: "1px solid #eceef2",
                              }}
                            >
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: "#f1f3f6",
                                  flexShrink: 0,
                                  marginTop: 2,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                }}
                              >
                                <img
                                  src={getFaviconUrl(domain)}
                                  alt=""
                                  style={{ width: 18, height: 18 }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: "1.05rem",
                                    fontWeight: 600,
                                    color: "#1a5fb4",
                                    fontFamily: "'Patrick Hand',cursive",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {query ? (
                                    <>
                                      <Search size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                                      {query}
                                    </>
                                  ) : (
                                    <>
                                      <Globe size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                                      {visit.url}
                                    </>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.95rem",
                                    color: COLORS.textSec,
                                    marginTop: 4,
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    fontFamily: "'Patrick Hand',cursive",
                                  }}
                                >
                                  <span>{domain}</span>
                                  <span>·</span>
                                  <span>{formatTime(visit.ts)}</span>
                                </div>
                              </div>
                              <ExternalLink size={18} color="#c5cad3" style={{ flexShrink: 0, marginTop: 4 }} />
                            </div>
                          );
                        }
                        return <Fragment key={`row-${idx}`}>{blocks}</Fragment>;
                      })}
                      {moreVisits && (
                        <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}`, background: "#fafafa" }}>
                          <button
                            type="button"
                            className="hand-drawn-button"
                            onClick={() => setVisitShowCount((c) => c + VISIT_STEP)}
                            style={{
                              width: "100%",
                              padding: "14px 18px",
                              fontFamily: "'Patrick Hand',cursive",
                              fontSize: "1.1rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 10,
                              background: "#fff",
                              borderColor: COLORS.blue,
                              color: COLORS.blue,
                            }}
                          >
                            <ChevronDown size={20} />
                            View more ({sortedVisits.length - visitShowCount} more visits)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div
                  style={{
                    borderTop: `2px solid ${COLORS.border}`,
                    padding: "12px 22px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#f4f6f9",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: "0.95rem", color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive" }}>
                    Decoy tabs · Chrome history noise · local only
                  </span>
                  {logForSelected.length > 0 && (
                    <span style={{ fontSize: "0.95rem", color: COLORS.textSec, fontFamily: "'Patrick Hand',cursive", fontWeight: 600 }}>
                      Last burst {timeAgo(logForSelected[0].ts)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <p
          style={{
            marginTop: 16,
            textAlign: "center",
            color: COLORS.textSec,
            fontFamily: "'Patrick Hand',cursive",
            fontSize: "1rem",
            flexShrink: 0,
          }}
        >
          Synthetic footprint — <span style={{ color: COLORS.green, fontWeight: 700 }}>your real browsing stays on your device</span>.
        </p>
      </div>
    </div>
  );
}
