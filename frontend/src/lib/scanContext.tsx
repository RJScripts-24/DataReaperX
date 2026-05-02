import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { getAuthSession, isScanPending } from "./sessionManager";

const ACTIVE_SCAN_STORAGE_KEY = "dr_active_scan_id";

type ScanContextValue = {
  scanId: string | null;
  setActiveScan: (nextScanId: string) => void;
  clearActiveScan: () => void;
};

const ScanContext = createContext<ScanContextValue | undefined>(undefined);

function readInitialScanId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(ACTIVE_SCAN_STORAGE_KEY);
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanId, setScanId] = useState<string | null>(readInitialScanId);

  const value = useMemo<ScanContextValue>(
    () => ({
      scanId,
      setActiveScan: (nextScanId: string) => {
        setScanId(nextScanId);
        if (typeof window !== "undefined") {
          sessionStorage.setItem(ACTIVE_SCAN_STORAGE_KEY, nextScanId);
        }
      },
      clearActiveScan: () => {
        setScanId(null);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(ACTIVE_SCAN_STORAGE_KEY);
        }
      },
    }),
    [scanId]
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScanContext(): ScanContextValue {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScanContext must be used within a ScanProvider.");
  }
  return context;
}

export function useRequireScan(): string | null {
  const { scanId } = useScanContext();
  const navigate = useNavigate();
  const location = useLocation();
  const session = getAuthSession();

  useEffect(() => {
    if (!session) {
      navigate("/onboarding", { replace: true, state: { from: location.pathname } });
      return;
    }
    if (!scanId && !isScanPending()) {
      navigate("/onboarding", { replace: true, state: { from: location.pathname } });
    }
  }, [location.pathname, navigate, scanId, session]);

  return session ? scanId : null;
}

export function useRequireAuth(): string | null {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getAuthSession();

  useEffect(() => {
    if (!session) {
      navigate("/onboarding", { replace: true, state: { from: location.pathname } });
    }
  }, [location.pathname, navigate, session]);

  return session?.email ?? null;
}
