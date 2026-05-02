import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import Onboarding from "./Onboarding";
import apiClient from "../lib/apiClient";
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
  setScanPending: vi.fn(),
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

  it("shows a single Google login button and redirects to command center after sign-in", async () => {
    vi.mocked(createGoogleSession).mockResolvedValueOnce({
      sessionId: "ses_123",
      email: "user@email.com",
      googleSub: "sub_123",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
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
        expect(mockNavigate).toHaveBeenCalledWith("/command-center", { replace: true });
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
      expect(mockNavigate).toHaveBeenCalledWith("/command-center", { replace: true });
    });
  });

  it("routes authenticated users to command center", async () => {
    mockSession = { email: "user@email.com" };

    render(<Onboarding />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/command-center", { replace: true });
    });
  });
});
