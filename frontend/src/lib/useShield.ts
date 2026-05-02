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

  // Poll shield status every 10 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await fetchShieldStatus();
        if (status.active) {
          setShieldState("active");
          setLastSeen(status.last_seen);
        } else if (shieldState === "active") {
          setShieldState("pending_install"); // went offline
        }
      } catch {
        // silent — don't interrupt the user
      }
    };

    poll();
    pollRef.current = setInterval(poll, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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

  const broadcastShieldToken = useCallback((shield_token: string) => {
    (window as unknown as { __DR_SHIELD_TOKEN__?: string }).__DR_SHIELD_TOKEN__ = shield_token;
    document.dispatchEvent(new CustomEvent("dr:shield-token-ready", { detail: { token: shield_token } }));
    sessionStorage.setItem("dr_shield_token", shield_token);
    window.postMessage(
      { type: "DR_REGISTER_TOKEN", token: shield_token },
      window.location.origin
    );
  }, []);

  const deployShield = useCallback(async () => {
    try {
      setShieldState("downloading");
      const { shield_token } = await requestShieldToken();
      broadcastShieldToken(shield_token);
      setShieldState("pending_install");
      return shield_token;
    } catch (e) {
      setError("Failed to generate shield token. Please try again.");
      setShieldState("error");
      throw e;
    }
  }, [broadcastShieldToken]);

  /** Same token + broadcast as deploy, but keeps UI in active — for downloading a fresh extension zip after updates. */
  const redeployShield = useCallback(async () => {
    try {
      setShieldState("downloading");
      const { shield_token } = await requestShieldToken();
      broadcastShieldToken(shield_token);
      setShieldState("active");
      return shield_token;
    } catch (e) {
      setError("Failed to regenerate shield token. Please try again.");
      setShieldState("error");
      throw e;
    }
  }, [broadcastShieldToken]);

  /** Fresh token + broadcast, then back to idle — for “latest zip” without entering the pending-install flow. */
  const refreshShieldPack = useCallback(async () => {
    try {
      setShieldState("downloading");
      const { shield_token } = await requestShieldToken();
      broadcastShieldToken(shield_token);
      setShieldState("idle");
      return shield_token;
    } catch (e) {
      setError("Failed to refresh shield token. Please try again.");
      setShieldState("error");
      throw e;
    }
  }, [broadcastShieldToken]);

  return { shieldState, lastSeen, error, deployShield, redeployShield, refreshShieldPack };
}