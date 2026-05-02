import { useEffect, useState } from "react";
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

function formatTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function ShieldLogs() {
  const authenticatedEmail = useRequireAuth();
  const [threatLog, setThreatLog] = useState<ThreatLogEntry[]>([]);
  const [passwordLog, setPasswordLog] = useState<PasswordLogEntry[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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

  if (!authenticatedEmail) {
    return null;
  }

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
              className="hand-drawn-button"
              onClick={requestLogs}
              style={{ padding: "8px 14px", backgroundColor: COLORS.blue, color: "#fff" }}
            >
              Refresh
            </button>
          </div>
        )}
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <PressureText
              as="h1"
              variant="strong"
              className="paper-text"
              style={{ fontFamily: "'Dancing Script', cursive", fontSize: 34, color: COLORS.text, display: "block", marginBottom: 4 }}
            >
              Shield Threat Log
            </PressureText>
            <PressureText
              as="p"
              variant="lite"
              className="paper-text"
              style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec, display: "block" }}
            >
              Malicious sites and password interception attempts recorded by Tripwire.
            </PressureText>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          <section className="hand-drawn-card" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: 20 }}>
            <PressureText
              as="h2"
              variant="strong"
              className="paper-text"
              style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 20, color: COLORS.red, display: "block" }}
            >
              Malicious Sites Visited
            </PressureText>
            {threatLog.length === 0 ? (
              <p style={{ marginTop: 12, color: COLORS.textSec, display: "block" }}>No detections yet.</p>
            ) : (
              <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {threatLog.map((entry, index) => (
                  <li key={`${entry.url}-${index}`} style={{ borderBottom: `1px dashed ${COLORS.border}`, paddingBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{entry.hostname}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>{entry.url}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>{formatTime(entry.occurredAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="hand-drawn-card" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, padding: 20 }}>
            <PressureText
              as="h2"
              variant="strong"
              className="paper-text"
              style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 20, color: COLORS.green, display: "block" }}
            >
              Password Interception Attempts
            </PressureText>
            {passwordLog.length === 0 ? (
              <p style={{ marginTop: 12, color: COLORS.textSec, display: "block" }}>No password attempts recorded.</p>
            ) : (
              <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {passwordLog.map((entry, index) => (
                  <li key={`${entry.url}-${index}`} style={{ borderBottom: `1px dashed ${COLORS.border}`, paddingBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{entry.hostname}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>{entry.url}</div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>
                      Field: {entry.field.name || entry.field.id || entry.field.placeholder || "(unnamed)"}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>
                      Attempt {entry.attempt} · {entry.allowed ? "Allowed" : "Blocked"}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSec }}>{formatTime(entry.occurredAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div style={{ marginTop: 18, color: COLORS.textSec, fontSize: 12 }}>
          Status: {status} {lastUpdated ? `· Updated ${lastUpdated}` : ""}
        </div>
      </div>
    </div>
  );
}
