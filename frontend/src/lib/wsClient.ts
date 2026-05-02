import { useEffect, useMemo, useRef, useState } from "react";

import { createRealtimeConnection, type RealtimeChannel } from "./api";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error"
  | "disconnected";

export type RealtimeEventEnvelope = {
  event: string;
  occurredAt: string;
  scanId: string;
  payload: Record<string, unknown>;
};

type UseRealtimeSubscriptionOptions = {
  scanId: string | null;
  channels: RealtimeChannel[];
  onEvent?: (event: RealtimeEventEnvelope) => void;
  enabled?: boolean;
  directUrl?: string;
};

export function useRealtimeSubscription({
  scanId,
  channels,
  onEvent,
  enabled = true,
  directUrl,
}: UseRealtimeSubscriptionOptions): RealtimeConnectionStatus {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("idle");
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const channelKey = useMemo(
    () => [...channels].sort((left, right) => left.localeCompare(right)).join("|"),
    [channels]
  );

  useEffect(() => {
    if (!enabled || !scanId) {
      setStatus("idle");
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) {
        return;
      }
      clearReconnectTimer();
      const delayMs = Math.min(1000 * 2 ** reconnectAttempt, 12000);
      reconnectAttempt += 1;
      setStatus(navigator.onLine ? "reconnecting" : "offline");
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (disposed) {
        return;
      }

      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }

      setStatus(reconnectAttempt === 0 ? "connecting" : "reconnecting");

      try {
        let endpointUrl: URL;
        if (directUrl) {
          endpointUrl = new URL(directUrl);
        } else {
          const descriptor = await createRealtimeConnection({
            scanId,
            channels,
            preferredTransport: "websocket",
          });

          if (disposed) {
            return;
          }

          if (descriptor.transport !== "websocket") {
            setStatus("error");
            return;
          }

          endpointUrl = new URL(descriptor.endpoint);
          endpointUrl.searchParams.set("token", descriptor.token);
        }

        socket = new WebSocket(endpointUrl.toString());

        socket.onopen = () => {
          reconnectAttempt = 0;
          setStatus("connected");
        };

        socket.onmessage = (rawEvent) => {
          try {
            const parsed = JSON.parse(String(rawEvent.data)) as
              | (Partial<RealtimeEventEnvelope> & Record<string, unknown>)
              | Record<string, unknown>;

            const eventName =
              typeof (parsed as { event?: unknown }).event === "string"
                ? ((parsed as { event: string }).event as string)
                : typeof (parsed as { type?: unknown }).type === "string"
                  ? ((parsed as { type: string }).type as string)
                  : null;

            const scanIdentifier =
              typeof (parsed as { scanId?: unknown }).scanId === "string"
                ? ((parsed as { scanId: string }).scanId as string)
                : typeof (parsed as { scan_id?: unknown }).scan_id === "string"
                  ? ((parsed as { scan_id: string }).scan_id as string)
                  : null;

            if (!eventName || !scanIdentifier) {
              return;
            }

            const occurredAt =
              typeof (parsed as { occurredAt?: unknown }).occurredAt === "string"
                ? ((parsed as { occurredAt: string }).occurredAt as string)
                : typeof (parsed as { created_at?: unknown }).created_at === "string"
                  ? ((parsed as { created_at: string }).created_at as string)
                  : new Date().toISOString();

            const explicitPayload = (parsed as { payload?: unknown }).payload;
            let payload: Record<string, unknown> = {};

            if (typeof explicitPayload === "object" && explicitPayload) {
              payload = explicitPayload as Record<string, unknown>;
            } else {
              const raw = parsed as Record<string, unknown>;
              payload = Object.fromEntries(
                Object.entries(raw).filter(
                  ([key]) =>
                    ![
                      "event",
                      "type",
                      "occurredAt",
                      "created_at",
                      "scanId",
                      "scan_id",
                      "payload",
                    ].includes(key)
                )
              );
            }

            onEventRef.current?.({
              event: eventName,
              occurredAt,
              scanId: scanIdentifier,
              payload,
            });
          } catch {
            // Ignore malformed messages to keep the stream alive.
          }
        };

        socket.onerror = () => {
          setStatus("error");
        };

        socket.onclose = () => {
          if (disposed) {
            return;
          }
          scheduleReconnect();
        };
      } catch {
        if (disposed) {
          return;
        }
        setStatus("error");
        scheduleReconnect();
      }
    };

    const handleOnline = () => {
      if (disposed) {
        return;
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      reconnectAttempt = 0;
      void connect();
    };

    const handleOffline = () => {
      setStatus("offline");
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [scanId, channelKey, enabled, directUrl]);

  return status;
}
