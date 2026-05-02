import { useState, useEffect, useCallback, useRef } from "react";
import { requestShieldToken, fetchShieldStatus } from "./api";

export type ShieldState =
  | "idle"
  | "downloading"
  | "pending_install"
  | "active"
  | "error";

export function useShield() {
  const [shieldState, setShieldState] = useState<ShieldState>("idle");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollShieldStatus = useCallback(async () => {
    try {
      const status = await fetchShieldStatus();
      setShieldState((previous) => {
        if (status.active) {
          return "active";
        }
        if (previous === "active") {
          return "pending_install"; // went offline
        }
        return previous;
      });
      if (status.active) {
        setLastSeen(status.last_seen);
      }
    } catch {
      // silent — don't interrupt the user
    }
  }, []);

  // Poll shield status, with faster cadence while awaiting install/activation.
  useEffect(() => {
    void pollShieldStatus();
    const intervalMs = shieldState === "pending_install" ? 2_000 : 10_000;
    pollRef.current = setInterval(() => {
      void pollShieldStatus();
    }, intervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollShieldStatus, shieldState]);

  // Refresh immediately when user returns focus to the tab.
  useEffect(() => {
    const refresh = () => {
      void pollShieldStatus();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pollShieldStatus]);

  // Listen for messages from the installed extension (via window.postMessage)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "DR_EXTENSION_READY") {
        setShieldState("active");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const deployShield = useCallback(async () => {
    try {
      setShieldState("downloading");
      const { shield_token } = await requestShieldToken();
      // Expose token for extension to pick up via injected content script
      (window as any).__DR_SHIELD_TOKEN__ = shield_token;
      document.dispatchEvent(new CustomEvent("dr:shield-token-ready", { detail: { token: shield_token } }));
      // Store in sessionStorage as fallback
      sessionStorage.setItem("dr_shield_token", shield_token);
      // Broadcast to any already-installed extension via window.postMessage
      window.postMessage(
        { type: "DR_REGISTER_TOKEN", token: shield_token },
        window.location.origin
      );
      setShieldState("pending_install");
      return shield_token;
    } catch (e) {
      setError("Failed to generate shield token. Please try again.");
      setShieldState("error");
      throw e;
    }
  }, []);

  return { shieldState, lastSeen, error, deployShield };
}
