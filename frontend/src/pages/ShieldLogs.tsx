import { useEffect, useMemo, useState } from "react";
import { AppNavbar } from "../components/AppNavbar";
import { PressureText } from "../components/PressureText";
import { useRequireAuth } from "../lib/scanContext";

const COLORS = {
  bg: "#f5f3ef",
  card: "#fdfbf7",
  border: "#d7d2c8",
  text: "#1f1f1f",
  textSec: "#5a5a5a",
  red: "#b94a48",
  green: "#4f7d5c",
  blue: "#4a6fa5",
  orange: "#d17a22",
};

type ThreatLogEntry = {
  hostname: string;
  url: string;
  occurredAt: string;
};

type PasswordLogEntry = {
  url: string;
  hostname: string;
  field: {
    id: string | null;
    name: string | null;
    placeholder: string | null;
  };
  attempt: number;
  allowed: boolean;
  occurredAt: string;
};

type ShieldLogsPayload = {
  threatLog: ThreatLogEntry[];
  passwordLog: PasswordLogEntry[];
};

type SiteSummary = {
  key: string;
  displayHostname: string;
  threatEvents: ThreatLogEntry[];
  passwordEvents: PasswordLogEntry[];
  lastActivityTs: number;
};

function formatTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function parseOccurred(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function normalizeHost(host: string): string {
  const s = String(host || "").trim().toLowerCase();
  return s || "__unknown__";
}

function fieldLabel(entry: PasswordLogEntry): string {
  const f = entry.field;
  return String(f.name || f.id || f.placeholder || "(unnamed field)").trim() || "(unnamed field)";
}

export default function ShieldLogs() {
  const authenticatedEmail = useRequireAuth();
  const [threatLog, setThreatLog] = useState<ThreatLogEntry[]>([]);
  const [passwordLog, setPasswordLog] = useState<PasswordLogEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const requestLogs = () => {
    setStatus("loading");
    window.postMessage({ type: "DR_REQUEST_SHIELD_LOGS" }, window.location.origin);
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "DR_SHIELD_LOGS") return;
      const payload = event.data?.payload as ShieldLogsPayload | undefined;
      if (!payload) {
        setStatus("error");
        return;
      }
      setThreatLog(payload.threatLog || []);
      setPasswordLog(payload.passwordLog || []);
      setLastUpdated(new Date().toLocaleTimeString());
      setStatus("ready");
    };

    window.addEventListener("message", handler);
    requestLogs();
    return () => window.removeEventListener("message", handler);
  }, []);

  const siteSummaries = useMemo(() => {
    type Bucket = { displayHostname: string; threatEvents: ThreatLogEntry[]; passwordEvents: PasswordLogEntry[] };
    const map = new Map<string, Bucket>();

    const touch = (key: string, display: string): Bucket => {
      let b = map.get(key);
      if (!b) {
        b = { displayHostname: display || key, threatEvents: [], passwordEvents: [] };
        map.set(key, b);
      } else if (display && b.displayHostname === key && display !== key) {
        b.displayHostname = display;
      }
      return b;
    };

    for (const e of threatLog) {
      const key = normalizeHost(e.hostname);
      const display = String(e.hostname || "").trim() || key;
      touch(key, display).threatEvents.push(e);
    }
    for (const e of passwordLog) {
      const key = normalizeHost(e.hostname);
      const display = String(e.hostname || "").trim() || key;
      touch(key, display).passwordEvents.push(e);
    }

    const rows: SiteSummary[] = [];
    for (const [key, b] of map) {
      const times = [
        ...b.threatEvents.map((t) => parseOccurred(t.occurredAt)),
        ...b.passwordEvents.map((p) => parseOccurred(p.occurredAt)),
      ];
      const lastActivityTs = times.length ? Math.max(...times) : 0;
      rows.push({
        key,
        displayHostname: b.displayHostname,
        threatEvents: b.threatEvents,
        passwordEvents: b.passwordEvents,
        lastActivityTs,
      });
    }
    rows.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
    return rows;
  }, [threatLog, passwordLog]);

  const selected = useMemo(
    () => (selectedKey ? siteSummaries.find((s) => s.key === selectedKey) ?? null : null),
    [selectedKey, siteSummaries]
  );

  useEffect(() => {
    if (selectedKey && !siteSummaries.some((s) => s.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [selectedKey, siteSummaries]);

  if (!authenticatedEmail) {
    return null;
  }

  const blockedPasswordCount = selected
    ? selected.passwordEvents.filter((p) => !p.allowed).length
    : 0;
  const allowedPasswordCount = selected
    ? selected.passwordEvents.filter((p) => p.allowed).length
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      <AppNavbar
        active="shield-logs"
        rightSlot={(
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <PressureText
              as="span"
              style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, fontSize: "0.95rem" }}
            >
              Signed in: {authenticatedEmail}
            </PressureText>
            <button
              type="button"
              className="hand-drawn-button"
              onClick={requestLogs}
              style={{ padding: "8px 14px", backgroundColor: COLORS.blue, color: "#fff" }}
            >
              Refresh
            </button>
          </div>
        )}
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 md:px-8 lg:px-12 pb-16 pt-6">
        <header
          style={{
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
              Shield Threat Log
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
              Malicious sites Tripwire has seen on your browsing. Pick a site to review shield blocks and any password
              interception attempts on that host.
            </p>
          </div>
          <div
            style={{
              color: COLORS.textSec,
              fontSize: 13,
              fontFamily: "'Patrick Hand', cursive",
              marginTop: 12,
              width: "100%",
            }}
          >
            Status: {status}
            {lastUpdated ? ` · Updated ${lastUpdated}` : ""}
          </div>
        </header>

        <div className="grid w-full grid-cols-1 items-stretch gap-6 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          {/* Left: all-time malicious sites — always in the left column */}
          <section
            className="hand-drawn-card flex flex-col overflow-hidden"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              minHeight: "min(520px, calc(100dvh - 200px))",
              maxHeight: "calc(100dvh - 200px)",
            }}
          >
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${COLORS.border}` }}>
              <PressureText
                as="h2"
                variant="strong"
                className="paper-text block"
                style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 20, color: COLORS.red }}
              >
                Malicious sites (all time)
              </PressureText>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.textSec, fontFamily: "'Patrick Hand', cursive" }}>
                {siteSummaries.length} hostname{siteSummaries.length === 1 ? "" : "s"} with logged activity
              </p>
            </div>
            <div className="hand-drawn-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ padding: 8 }}>
              {siteSummaries.length === 0 ? (
                <p style={{ padding: 16, color: COLORS.textSec, fontFamily: "'Patrick Hand', cursive" }}>
                  No detections yet. Tripwire will list risky hosts here when it records them.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 p-0" style={{ listStyle: "none", margin: 0 }}>
                  {siteSummaries.map((site) => {
                    const active = site.key === selectedKey;
                    const events = site.threatEvents.length + site.passwordEvents.length;
                    return (
                      <li key={site.key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(site.key)}
                          className="hand-drawn-button w-full text-left transition-colors"
                          style={{
                            padding: "12px 14px",
                            backgroundColor: active ? "rgba(185, 74, 72, 0.12)" : COLORS.card,
                            borderColor: active ? COLORS.red : COLORS.border,
                            borderWidth: 1.5,
                            fontFamily: "'Patrick Hand', cursive",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: COLORS.text, fontSize: "1.05rem" }}>
                            {site.displayHostname}
                          </div>
                          <div style={{ fontSize: 12, color: COLORS.textSec, marginTop: 4 }}>
                            {site.threatEvents.length} malicious hit{site.threatEvents.length === 1 ? "" : "s"}
                            {site.passwordEvents.length > 0
                              ? ` · ${site.passwordEvents.length} password event${site.passwordEvents.length === 1 ? "" : "s"}`
                              : ""}
                            {" · "}
                            {events} total · last {site.lastActivityTs ? formatTime(new Date(site.lastActivityTs).toISOString()) : "—"}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Right: split pane — placeholder until a site is selected, then detail */}
          {selectedKey && selected ? (
            <section
              className="hand-drawn-card flex flex-col gap-5"
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                padding: "22px 24px",
                minHeight: "min(520px, calc(100dvh - 200px))",
                maxHeight: "calc(100dvh - 200px)",
                overflowY: "auto",
              }}
            >
              <div>
                <PressureText
                  as="h2"
                  variant="strong"
                  className="paper-text block"
                  style={{ fontFamily: "'Dancing Script', cursive", fontSize: 28, color: COLORS.text }}
                >
                  {selected.displayHostname}
                </PressureText>
                <button
                  type="button"
                  className="mt-2 text-sm underline-offset-2 hover:underline"
                  style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.blue, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  onClick={() => setSelectedKey(null)}
                >
                  Clear selection
                </button>
              </div>

              <div
                className="grid gap-4 sm:grid-cols-2"
                style={{ fontFamily: "'Patrick Hand', cursive" }}
              >
                <div
                  style={{
                    border: `1px dashed ${COLORS.border}`,
                    borderRadius: 12,
                    padding: 16,
                    background: "rgba(185, 74, 72, 0.06)",
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.red, fontWeight: 700 }}>
                    Tripwire / malicious URL events
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.text, marginTop: 6 }}>
                    {selected.threatEvents.length}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: COLORS.textSec, lineHeight: 1.45 }}>
                    Times this host appeared in the malicious-site log (each line is a separate detection Data Reaper
                    recorded).
                  </p>
                </div>
                <div
                  style={{
                    border: `1px dashed ${COLORS.border}`,
                    borderRadius: 12,
                    padding: 16,
                    background: "rgba(79, 125, 92, 0.08)",
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: COLORS.green, fontWeight: 700 }}>
                    Password interception
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: COLORS.text, marginTop: 6 }}>
                    {selected.passwordEvents.length}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: COLORS.textSec, lineHeight: 1.45 }}>
                    Shield-monitored password fields on pages under this host. Blocked means Tripwire stopped the
                    attempt; allowed means it was recorded as permitted.
                  </p>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 16 }}>
                <h3 style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 17, margin: "0 0 10px", color: COLORS.text }}>
                  Did Tripwire block password exposure?
                </h3>
                <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.textSec, fontSize: 14, lineHeight: 1.6 }}>
                  <li>
                    <strong style={{ color: COLORS.green }}>{blockedPasswordCount}</strong> attempt
                    {blockedPasswordCount === 1 ? "" : "s"} blocked by shield (user did not get an allowed submit on
                    those events).
                  </li>
                  <li>
                    <strong style={{ color: allowedPasswordCount ? COLORS.orange : COLORS.text }}>{allowedPasswordCount}</strong>{" "}
                    attempt{allowedPasswordCount === 1 ? "" : "s"} marked allowed (recorded as passing Tripwire rules).
                  </li>
                </ul>
              </div>

              {selected.threatEvents.length > 0 && (
                <div>
                  <h3 style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 17, margin: "0 0 10px", color: COLORS.text }}>
                    Malicious URL log (this host)
                  </h3>
                  <ul className="hand-drawn-scrollbar max-h-48 space-y-2 overflow-y-auto pr-1" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                    {[...selected.threatEvents]
                      .sort((a, b) => parseOccurred(b.occurredAt) - parseOccurred(a.occurredAt))
                      .map((e, i) => (
                        <li
                          key={`${e.url}-${i}`}
                          style={{
                            fontSize: 13,
                            borderBottom: `1px dashed ${COLORS.border}`,
                            paddingBottom: 8,
                            fontFamily: "'Patrick Hand', cursive",
                          }}
                        >
                          <div style={{ wordBreak: "break-all", color: COLORS.text }}>{e.url}</div>
                          <div style={{ color: COLORS.textSec, marginTop: 4 }}>{formatTime(e.occurredAt)}</div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {selected.passwordEvents.length > 0 && (
                <div>
                  <h3 style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 17, margin: "0 0 10px", color: COLORS.text }}>
                    Password attempts (this host)
                  </h3>
                  <ul className="hand-drawn-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                    {[...selected.passwordEvents]
                      .sort((a, b) => parseOccurred(b.occurredAt) - parseOccurred(a.occurredAt))
                      .map((e, i) => (
                        <li
                          key={`${e.url}-${e.attempt}-${i}`}
                          style={{
                            fontSize: 13,
                            borderBottom: `1px dashed ${COLORS.border}`,
                            paddingBottom: 8,
                            fontFamily: "'Patrick Hand', cursive",
                          }}
                        >
                          <div style={{ color: e.allowed ? COLORS.orange : COLORS.green, fontWeight: 700 }}>
                            {e.allowed ? "Allowed" : "Blocked"} · attempt {e.attempt}
                          </div>
                          <div style={{ wordBreak: "break-all", color: COLORS.text, marginTop: 4 }}>{e.url}</div>
                          <div style={{ color: COLORS.textSec, marginTop: 4 }}>
                            Field: {fieldLabel(e)} · {formatTime(e.occurredAt)}
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            <section
              className="hand-drawn-card flex flex-col items-center justify-center gap-3 p-8 text-center"
              style={{
                background: COLORS.card,
                border: `2px dashed ${COLORS.border}`,
                minHeight: "min(520px, calc(100dvh - 200px))",
                maxHeight: "calc(100dvh - 200px)",
              }}
            >
              <PressureText
                as="p"
                variant="medium"
                className="paper-text block max-w-md"
                style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18, color: COLORS.textSec, lineHeight: 1.5 }}
              >
                Select a hostname in the list on the left to open site details — Tripwire block counts, password attempts,
                and per-URL history for that host.
              </PressureText>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
