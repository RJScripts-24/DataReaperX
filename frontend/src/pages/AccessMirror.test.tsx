import React from "react";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

import AccessMirror from "./AccessMirror";

// ── Shared mock state ──────────────────────────────────────────────────────
const mockNavigate = vi.fn();
let mockAuthEmail: string | null = "user@example.com";

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/access-mirror" }),
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../lib/scanContext", () => ({
  useRequireAuth: () => mockAuthEmail,
}));

vi.mock("../components/PressureFilter", () => ({
  PressureFilter: () => null,
}));

vi.mock("../components/PressureText", () => ({
  PressureText: ({ as: Tag = "span", children, ...props }: Record<string, any>) => (
    <Tag {...props}>{children}</Tag>
  ),
}));

vi.mock("../components/AnimatedDataReaperLogo", () => ({
  AnimatedDataReaperLogo: () => <span data-testid="dr-logo">Logo</span>,
}));

vi.mock("motion/react", async () => {
  const actual = await vi.importActual("motion/react");
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) => {
          const Tag = tag as keyof JSX.IntrinsicElements;
          return ({ children, ...props }: Record<string, any>) => {
            // Remove motion-specific props that cause DOM warnings
            const {
              initial, animate, exit, transition, whileHover, whileTap,
              layout, layoutId, variants, custom, ...rest
            } = props;
            void initial; void animate; void exit; void transition;
            void whileHover; void whileTap; void layout; void layoutId;
            void variants; void custom;
            return <Tag {...rest}>{children}</Tag>;
          };
        },
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ── Helpers ────────────────────────────────────────────────────────────────
function renderAccessMirror() {
  return render(<AccessMirror />);
}

// ── Test suite ─────────────────────────────────────────────────────────────
describe("AccessMirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthEmail = "user@example.com";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // ── Authentication guard ─────────────────────────────────────────────────
  describe("authentication guard", () => {
    it("renders nothing when user is not authenticated", () => {
      mockAuthEmail = null;
      const { container } = renderAccessMirror();
      expect(container.firstChild).toBeNull();
    });

    it("renders the page when user is authenticated", () => {
      mockAuthEmail = "user@example.com";
      renderAccessMirror();
      expect(screen.getByText("Access Mirror")).toBeInTheDocument();
    });

    it("shows the signed-in email in the navigation bar", () => {
      mockAuthEmail = "alice@test.com";
      renderAccessMirror();
      expect(screen.getByText(/Signed in: alice@test\.com/i)).toBeInTheDocument();
    });
  });

  // ── Page structure ───────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders the page heading", () => {
      renderAccessMirror();
      expect(screen.getByRole("heading", { level: 1, name: /access mirror/i })).toBeInTheDocument();
    });

    it("renders the page subtitle text about data footprint", () => {
      renderAccessMirror();
      expect(screen.getByText(/your data footprint, laid bare/i)).toBeInTheDocument();
    });

    it("renders the Google Hub section heading", () => {
      renderAccessMirror();
      expect(screen.getByText(/the google hub/i)).toBeInTheDocument();
    });

    it("renders the Universal Data Drop section heading", () => {
      renderAccessMirror();
      expect(screen.getByText(/universal data drop/i)).toBeInTheDocument();
    });

    it("renders the navigation logo", () => {
      renderAccessMirror();
      expect(screen.getByTestId("dr-logo")).toBeInTheDocument();
    });

    it("renders the Dashboard nav button", () => {
      renderAccessMirror();
      expect(screen.getByRole("button", { name: /dashboard/i })).toBeInTheDocument();
    });

    it("renders the War Room nav button", () => {
      renderAccessMirror();
      expect(screen.getByRole("button", { name: /war room/i })).toBeInTheDocument();
    });

    it("renders the Identity Graph nav button", () => {
      renderAccessMirror();
      expect(screen.getByRole("button", { name: /identity graph/i })).toBeInTheDocument();
    });
  });

  // ── Google connection panel ──────────────────────────────────────────────
  describe("Google Hub — disconnected state", () => {
    it("shows the Google Account label", () => {
      renderAccessMirror();
      expect(screen.getByText("Google Account")).toBeInTheDocument();
    });

    it("shows 'Not connected' status badge initially", () => {
      renderAccessMirror();
      expect(screen.getByText(/not connected/i)).toBeInTheDocument();
    });

    it("shows the 'Connect with Google' button when disconnected", () => {
      renderAccessMirror();
      expect(screen.getByRole("button", { name: /connect with google/i })).toBeInTheDocument();
    });

    it("shows OAuth scope explanation text", () => {
      renderAccessMirror();
      expect(screen.getByText(/read-only oauth scopes/i)).toBeInTheDocument();
    });

    it("shows the Google Takeout section", () => {
      renderAccessMirror();
      expect(screen.getByText(/full app list via google takeout/i)).toBeInTheDocument();
    });

    it("shows the takeout instructions list", () => {
      renderAccessMirror();
      expect(screen.getByText(/takeout\.google\.com/i)).toBeInTheDocument();
    });

    it("shows the 'Open takeout.google.com' button", () => {
      renderAccessMirror();
      expect(screen.getByRole("button", { name: /open takeout\.google\.com/i })).toBeInTheDocument();
    });
  });

  describe("Google Hub — connect flow", () => {
    it("transitions to connected state after clicking Connect with Google", async () => {
      renderAccessMirror();
      const connectButton = screen.getByRole("button", { name: /connect with google/i });

      fireEvent.click(connectButton);

      // Advance past the 1500ms setTimeout in handleGoogleConnect
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    it("shows 8 authorized apps after connecting", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      // MOCK_GOOGLE_TOKENS has 8 entries
      expect(screen.getByText(/authorized apps \(8\)/i)).toBeInTheDocument();
    });

    it("shows app names from MOCK_GOOGLE_TOKENS after connecting", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      // Notion is LOW risk (g1), should be visible
      expect(screen.getByText("Notion")).toBeInTheDocument();
      // Slack is HIGH risk (g2)
      expect(screen.getByText("Slack")).toBeInTheDocument();
      // Zapier is HIGH risk (g3)
      expect(screen.getByText("Zapier")).toBeInTheDocument();
    });

    it("shows Revoke buttons only for HIGH risk tokens", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      // 3 HIGH risk tokens (Slack g2, Zapier g3, Typeform g7) → 3 Revoke buttons
      const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
      expect(revokeButtons).toHaveLength(3);
    });

    it("shows Sever All button with correct count after connecting", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      expect(screen.getByRole("button", { name: /sever all \(3\)/i })).toBeInTheDocument();
    });

    it("shows risk level badges for tokens", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      expect(screen.getAllByText("HIGH").length).toBeGreaterThan(0);
      expect(screen.getAllByText("MEDIUM").length).toBeGreaterThan(0);
      expect(screen.getAllByText("LOW").length).toBeGreaterThan(0);
    });

    it("shows source labels for tokens", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));

      await act(async () => {
        vi.advanceTimersByTime(1600);
      });

      expect(screen.getAllByText(/via gmail grant/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/via drive grant/i).length).toBeGreaterThan(0);
    });
  });

  // ── Token revocation ─────────────────────────────────────────────────────
  describe("token revocation", () => {
    async function connectGoogle() {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /connect with google/i }));
      await act(async () => {
        vi.advanceTimersByTime(1600);
      });
    }

    it("removes a revoked app from the list", async () => {
      await connectGoogle();
      // Click the first Revoke button (Slack is the first HIGH risk token)
      const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
      fireEvent.click(revokeButtons[0]);

      expect(screen.queryByText("Slack")).not.toBeInTheDocument();
    });

    it("decrements the authorized apps count after revocation", async () => {
      await connectGoogle();
      expect(screen.getByText(/authorized apps \(8\)/i)).toBeInTheDocument();

      const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
      fireEvent.click(revokeButtons[0]);

      expect(screen.getByText(/authorized apps \(7\)/i)).toBeInTheDocument();
    });

    it("decrements the Sever All count after individual revocation", async () => {
      await connectGoogle();
      const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
      fireEvent.click(revokeButtons[0]);

      // Was 3 HIGH, now 2
      expect(screen.getByRole("button", { name: /sever all \(2\)/i })).toBeInTheDocument();
    });

    it("shows the severed banner after severing all high-risk tokens", async () => {
      await connectGoogle();
      const severButton = screen.getByRole("button", { name: /sever all/i });
      fireEvent.click(severButton);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText(/access severed successfully/i)).toBeInTheDocument();
    });

    it("disables the Sever All button when count is zero", async () => {
      await connectGoogle();
      const severButton = screen.getByRole("button", { name: /sever all/i });
      fireEvent.click(severButton);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // After severing all, count should be 0 → button disabled
      const disabledSeverButton = screen.getByRole("button", { name: /sever all \(0\)/i });
      expect(disabledSeverButton).toBeDisabled();
    });
  });

  // ── Company selector ─────────────────────────────────────────────────────
  describe("company selector — COMPANIES data", () => {
    it("renders all 7 company buttons", () => {
      renderAccessMirror();
      const expectedCompanies = ["Google", "Instagram", "LinkedIn", "Amazon", "Spotify", "Uber", "Other"];
      for (const company of expectedCompanies) {
        expect(screen.getByRole("button", { name: company })).toBeInTheDocument();
      }
    });

    it("shows export instructions when a company is selected", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));
      expect(screen.getByText(/google export instructions/i)).toBeInTheDocument();
    });

    it("shows the file drop zone when a company is selected", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
      expect(screen.getByText(/drop your instagram export here/i)).toBeInTheDocument();
    });

    it("shows Google-specific Takeout tip when Google is selected", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));
      expect(screen.getByText(/google exports include authorized apps metadata/i)).toBeInTheDocument();
    });

    it("does not show Takeout tip for non-Google companies", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Spotify" }));
      expect(screen.queryByText(/google exports include authorized apps metadata/i)).not.toBeInTheDocument();
    });

    it("shows the 'Open download page' button for companies with a link", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "LinkedIn" }));
      expect(screen.getByRole("button", { name: /open download page/i })).toBeInTheDocument();
    });

    it("does not show an open download page button for 'Other' (no link)", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Other" }));
      expect(screen.queryByRole("button", { name: /open download page/i })).not.toBeInTheDocument();
    });

    it("resets the instructions when a different company is selected", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));
      expect(screen.getByText(/google export instructions/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Amazon" }));
      expect(screen.getByText(/amazon export instructions/i)).toBeInTheDocument();
      expect(screen.queryByText(/google export instructions/i)).not.toBeInTheDocument();
    });

    it("shows the instructions note text for each company", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Uber" }));
      // INSTRUCTIONS["Uber"].note contains "trip history"
      expect(screen.getByText(/trip history/i)).toBeInTheDocument();
    });

    it("shows INSTRUCTIONS steps for Spotify", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Spotify" }));
      expect(screen.getByText(/spotify\.com → account → privacy settings/i)).toBeInTheDocument();
    });
  });

  // ── File upload and report generation ───────────────────────────────────
  describe("file upload and report flow", () => {
    it("shows 'Analyzing your export...' text while processing a file", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      // Should be in analyzing state immediately (before 2200ms timeout)
      expect(screen.getByText(/analyzing your export/i)).toBeInTheDocument();
    });

    it("shows the report after the analysis completes", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText(/google access mirror summary/i)).toBeInTheDocument();
    });

    it("shows the report summary text for the Google company", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText(/4 years of location history/i)).toBeInTheDocument();
    });

    it("shows the 'Generate Legal Deletion Request' button in the report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByRole("button", { name: /generate legal deletion request/i })).toBeInTheDocument();
    });

    it("shows the third parties section in the report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText("Third Parties")).toBeInTheDocument();
      expect(screen.getByText("DoubleClick")).toBeInTheDocument();
    });

    it("shows the recommendations section in the report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText("Recommendations")).toBeInTheDocument();
    });

    it("shows the Creepiness Timeline section in the report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText("Creepiness Timeline")).toBeInTheDocument();
    });

    it("shows authorized apps section for Google report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText("Authorized Apps Detected")).toBeInTheDocument();
    });

    it("shows 'Upload a different file' button in the report", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByRole("button", { name: /upload a different file/i })).toBeInTheDocument();
    });

    it("clears the report when 'Upload a different file' is clicked", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      const resetButton = screen.getByRole("button", { name: /upload a different file/i });
      fireEvent.click(resetButton);

      expect(screen.queryByText(/google access mirror summary/i)).not.toBeInTheDocument();
    });

    it("shows the Instagram report when Instagram is selected and file uploaded", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Instagram" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "instagram_data.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText(/instagram access mirror summary/i)).toBeInTheDocument();
    });

    it("does not show the analyzing state before a company is selected", () => {
      renderAccessMirror();
      // No company selected — no file input should be visible / triggerable
      expect(screen.queryByText(/analyzing your export/i)).not.toBeInTheDocument();
    });
  });

  // ── buildDeletionRequest output — via clipboard ──────────────────────────
  describe("buildDeletionRequest output", () => {
    async function renderWithReport() {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Google" }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "takeout.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });
    }

    it("copies a GDPR/CCPA/DPDP deletion request to clipboard on button click", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });

      await renderWithReport();

      const btn = screen.getByRole("button", { name: /generate legal deletion request/i });
      await act(async () => { fireEvent.click(btn); });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledOnce();
        const content = writeText.mock.calls[0][0] as string;
        expect(content).toContain("GDPR/CCPA/DPDP");
        expect(content).toContain("Please delete the following data associated with my account:");
        expect(content).toContain("I expect a response within 30 days");
      });
    });

    it("includes recommendation actions as bullet points in the deletion request", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });

      await renderWithReport();

      const btn = screen.getByRole("button", { name: /generate legal deletion request/i });
      await act(async () => { fireEvent.click(btn); });

      await waitFor(() => {
        const content = writeText.mock.calls[0][0] as string;
        // Google report recommendations start with known action text
        expect(content).toContain("- Delete location history at myaccount.google.com");
        expect(content).toContain("- Clear your ad interest profile at myadcenter.google.com");
      });
    });

    it("'Copy All as Privacy Request' button writes same format to clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });

      await renderWithReport();

      const btn = screen.getByRole("button", { name: /copy all as privacy request/i });
      await act(async () => { fireEvent.click(btn); });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledOnce();
        const content = writeText.mock.calls[0][0] as string;
        expect(content).toContain("GDPR/CCPA/DPDP");
      });
    });
  });

  // ── generateMockReport — via rendered report content ─────────────────────
  describe("generateMockReport — output validation", () => {
    async function getReportFor(company: string) {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: company }));

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const mockFile = new File(["{}"], "data.zip", { type: "application/zip" });
      fireEvent.change(input, { target: { files: [mockFile] } });

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });
    }

    it("Google report contains DoubleClick as a third party", async () => {
      await getReportFor("Google");
      expect(screen.getByText("DoubleClick")).toBeInTheDocument();
    });

    it("Instagram report contains Meta Audience Network as a third party", async () => {
      await getReportFor("Instagram");
      expect(screen.getByText("Meta Audience Network")).toBeInTheDocument();
    });

    it("LinkedIn report contains LinkedIn Audience Network as a third party", async () => {
      await getReportFor("LinkedIn");
      expect(screen.getByText("LinkedIn Audience Network")).toBeInTheDocument();
    });

    it("Amazon report contains Twitch as a third party", async () => {
      await getReportFor("Amazon");
      expect(screen.getByText("Twitch")).toBeInTheDocument();
    });

    it("Spotify report contains Nielsen as a third party", async () => {
      await getReportFor("Spotify");
      expect(screen.getByText("Nielsen")).toBeInTheDocument();
    });

    it("Uber report contains Braintree Payments as a third party", async () => {
      await getReportFor("Uber");
      expect(screen.getByText("Braintree Payments")).toBeInTheDocument();
    });

    it("Other company falls back to the Other report (unknown platform)", async () => {
      await getReportFor("Other");
      expect(screen.getByText(/unknown platform access mirror summary/i)).toBeInTheDocument();
    });

    it("Google report shows authorized apps section with Notion", async () => {
      await getReportFor("Google");
      expect(screen.getByText("Authorized Apps Detected")).toBeInTheDocument();
      expect(screen.getByText("Notion")).toBeInTheDocument();
    });

    it("Instagram report does NOT show authorized apps section", async () => {
      await getReportFor("Instagram");
      expect(screen.queryByText("Authorized Apps Detected")).not.toBeInTheDocument();
    });

    it("Google report shows timeline events with years 2021–2024", async () => {
      await getReportFor("Google");
      expect(screen.getByText("2021")).toBeInTheDocument();
      expect(screen.getByText("2022")).toBeInTheDocument();
      expect(screen.getByText("2023")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });

    it("Google report shows stat labels", async () => {
      await getReportFor("Google");
      expect(screen.getByText("Location history events")).toBeInTheDocument();
      expect(screen.getByText("Ad interest topics")).toBeInTheDocument();
    });

    it("Google report shows stat values", async () => {
      await getReportFor("Google");
      expect(screen.getByText("4,832")).toBeInTheDocument();
      expect(screen.getByText("312")).toBeInTheDocument();
    });
  });

  // ── Drag and drop ────────────────────────────────────────────────────────
  describe("drag and drop file upload", () => {
    it("shows the drop zone for the selected company", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Spotify" }));
      expect(screen.getByText(/drop your spotify export here/i)).toBeInTheDocument();
    });

    it("does not show the drop zone when no company is selected", () => {
      renderAccessMirror();
      expect(screen.queryByText(/drop your .* export here/i)).not.toBeInTheDocument();
    });

    it("processes a file dropped on the drop zone", async () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: "Uber" }));

      const dropZone = screen.getByText(/drop your uber export here/i).closest("div")!;
      const mockFile = new File(["{}"], "uber_data.zip", { type: "application/zip" });

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [mockFile] },
      });

      expect(screen.getByText(/analyzing your export/i)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2300);
      });

      expect(screen.getByText(/uber access mirror summary/i)).toBeInTheDocument();
    });
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  describe("navigation buttons", () => {
    it("navigates to / when Dashboard button is clicked", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /dashboard/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("navigates to /war-room when War Room is clicked", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /war room/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/war-room");
    });

    it("navigates to /identity-graph when Identity Graph is clicked", () => {
      renderAccessMirror();
      fireEvent.click(screen.getByRole("button", { name: /identity graph/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/identity-graph");
    });
  });
});
