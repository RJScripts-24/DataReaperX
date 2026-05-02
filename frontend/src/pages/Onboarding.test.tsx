import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import apiClient from "../lib/apiClient";
import Onboarding from "./Onboarding";

const mockNavigate = vi.fn();
const mockSetActiveScan = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/apiClient", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("../lib/scanContext", () => ({
  useScanContext: () => ({
    setActiveScan: mockSetActiveScan,
  }),
}));

vi.mock("../components/PressureFilter", () => ({
  PressureFilter: () => null,
}));

vi.mock("../components/PressureInput", () => ({
  PressureInput: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("../components/PressureText", () => ({
  PressureText: ({ as: Tag = "span", children, ...props }: Record<string, any>) => <Tag {...props}>{children}</Tag>,
}));

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

describe("Onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to command center only after initialize response resolves", async () => {
    const pending = deferred<{ data: { scan_id: string; boot_log: string[] } }>();
    vi.mocked(apiClient.post).mockReturnValueOnce(pending.promise);

    render(<Onboarding />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@email.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Launch Sleuth Agent/i }));

    expect(mockNavigate).not.toHaveBeenCalled();

    pending.resolve({
      data: {
        scan_id: "scan_123",
        boot_log: ["Booting Sleuth Agent..."],
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockSetActiveScan).toHaveBeenCalledWith("scan_123");
      expect(mockNavigate).toHaveBeenCalledWith("/command-center");
    }, { timeout: 2000 });
  });
});
