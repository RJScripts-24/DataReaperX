import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import Onboarding from "./Onboarding";
import { createScan } from "../lib/api";
import apiClient, { ApiClientError } from "../lib/apiClient";
import { createGoogleSession } from "../lib/sessionManager";

const mockNavigate = vi.fn();
const mockSetActiveScan = vi.fn();
const mockToastSuccess = vi.fn();

let mockSession: { email: string } | null = null;
let mockScanId: string | null = null;
let googleCredentialCallback: ((response: { credential?: string }) => void) | null = null;

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock("../lib/api", () => ({
  createScan: vi.fn(),
}));

vi.mock("../lib/apiClient", () => {
  class MockApiClientError extends Error {
    code: string;
    details?: Record<string, unknown>[];
    status?: number;
    constructor(payload: { code: string; message: string; details?: Record<string, unknown>[]; status?: number }) {
      super(payload.message);
      this.name = "ApiClientError";
      this.code = payload.code;
      this.details = payload.details;
      this.status = payload.status;
    }
  }

  return {
    default: {
      get: vi.fn(),
    },
    ApiClientError: MockApiClientError,
  };
});

vi.mock("../lib/sessionManager", () => ({
  createGoogleSession: vi.fn(),
  getAuthSession: () => mockSession,
}));

vi.mock("../lib/scanContext", () => ({
  useScanContext: () => ({
    scanId: mockScanId,
    setActiveScan: mockSetActiveScan,
  }),
}));

vi.mock("../components/PressureFilter", () => ({
  PressureFilter: () => null,
}));

vi.mock("../components/PressureText", () => ({
  PressureText: ({ as: Tag = "span", children, ...props }: Record<string, any>) => <Tag {...props}>{children}</Tag>,
}));

describe("Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
    mockScanId = null;
    googleCredentialCallback = null;
    vi.stubGlobal("google", {
      accounts: {
        id: {
          initialize: (config: { callback: (response: { credential: string }) => void }) => {
            googleCredentialCallback = config.callback;
          },
          renderButton: () => undefined,
          cancel: () => undefined,
        },
      },
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { configured: true, clientId: "google-client-id" },
    } as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a single Google login button and redirects to dashboard after sign-in", async () => {
    vi.mocked(createGoogleSession).mockResolvedValueOnce({
      sessionId: "ses_123",
      email: "user@email.com",
      googleSub: "sub_123",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(createScan).mockResolvedValueOnce({
      scanId: "scan_123",
      status: "discovering",
      startedAt: new Date().toISOString(),
      routeHints: {
        commandCenter: "/dashboard",
        identityGraph: "/identity-graph",
        warRoom: "/war-room",
      },
      estimatedDuration: 180,
    });

    render(<Onboarding />);

    const loginTarget = await screen.findByLabelText(/login with google/i);
    expect(loginTarget).toBeInTheDocument();
    expect(screen.queryByText(/signed-in account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open dashboard/i })).not.toBeInTheDocument();
    expect(googleCredentialCallback).not.toBeNull();
    googleCredentialCallback?.({ credential: "google-token" });

    await waitFor(
      () => {
        expect(createGoogleSession).toHaveBeenCalledWith("google-token");
        expect(createScan).toHaveBeenCalledWith({
          seed: { type: "email", value: "user@email.com" },
          jurisdictionHint: "AUTO",
        });
        expect(mockSetActiveScan).toHaveBeenCalledWith("scan_123");
        expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
        expect(mockToastSuccess).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("auto-redirects authenticated users to dashboard", async () => {
    mockSession = { email: "user@email.com" };
    mockScanId = "scan_existing";

    render(<Onboarding />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });

  it("recovers active scan id from 409 conflict and routes to dashboard", async () => {
    mockSession = { email: "user@email.com" };
    vi.mocked(createScan).mockRejectedValueOnce(
      new ApiClientError({
        code: "scan_in_progress",
        message: "A scan is already in progress for this account.",
        details: [{ scanId: "scan_conflict_1" }],
        status: 409,
      }),
    );

    render(<Onboarding />);

    await waitFor(() => {
      expect(mockSetActiveScan).toHaveBeenCalledWith("scan_conflict_1");
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });
});
