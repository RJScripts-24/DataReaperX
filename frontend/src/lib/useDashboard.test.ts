import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import apiClient from "./apiClient";
import { useDashboard } from "./useDashboard";
import { useRealtimeSubscription } from "./wsClient";

vi.mock("./apiClient", () => ({
  default: {
    get: vi.fn(),
  },
}));

let capturedOnEvent:
  | ((event: { event: string; occurredAt: string; scanId: string; payload: Record<string, unknown> }) => void)
  | undefined;

vi.mock("./wsClient", () => ({
  useRealtimeSubscription: vi.fn((options: { onEvent?: typeof capturedOnEvent }) => {
    capturedOnEvent = options.onEvent;
    return "connected";
  }),
}));

describe("useDashboard", () => {
  beforeEach(() => {
    capturedOnEvent = undefined;
    vi.clearAllMocks();
  });

  it("increments exposureCount on exposure_found", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        scan_id: "scan_test_1",
        stats: [
          { title: "Brokers Scanned", value: 1 },
          { title: "Exposures Found", value: 0 },
          { title: "Deletions Secured", value: 0 },
          { title: "Active Legal Disputes", value: 0 },
        ],
        threat_breakdown: {
          emails_exposed: 0,
          phone_leaks: 0,
          location_traces: 0,
        },
        radar_targets: [],
        activity_feed: [],
        agent_statuses: [],
      },
    });

    const { result } = renderHook(() => useDashboard("scan_test_1"));

    await waitFor(() => {
      expect(result.current.state.exposureCount).toBe(0);
    });

    act(() => {
      capturedOnEvent?.({
        event: "exposure_found",
        occurredAt: "2026-04-18T10:00:00Z",
        scanId: "scan_test_1",
        payload: {
          broker_name: "Apollo.io",
          data_types: ["Email", "Phone"],
          priority_score: 91,
          angle: 220,
          distance: 0.7,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.state.exposureCount).toBe(1);
      expect(result.current.state.radarTargets.length).toBe(1);
      expect(result.current.state.activityFeed.length).toBeGreaterThan(0);
    });

    expect(vi.mocked(useRealtimeSubscription)).toHaveBeenCalled();
  });
});
