
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

  import App from "./App.tsx";
  import { ReaperCursor } from "./components/ReaperCursor";
  import { queryClient } from "./lib/queryClient";
  import { ScanProvider } from "./lib/scanContext";
  import { initializeSession } from "./lib/sessionManager";
  import "./styles/index.css";

  if (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    (typeof window.matchMedia !== "function" || !window.matchMedia("(pointer: coarse)").matches)
  ) {
    document.documentElement.classList.add("hide-native-cursor");
  }

  function Bootstrap() {
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [sessionError, setSessionError] = useState<string | null>(null);

    useEffect(() => {
      let isMounted = true;

      initializeSession()
        .catch((error) => {
          if (!isMounted) {
            return;
          }
          setSessionError(error instanceof Error ? error.message : "Unable to initialize session.");
        })
        .finally(() => {
          if (isMounted) {
            setIsSessionReady(true);
          }
        });

      return () => {
        isMounted = false;
      };
    }, []);

    if (!isSessionReady) {
      return (
        <>
          <ReaperCursor />
          <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f3ef" }}>
            <p style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "1.25rem", color: "#1f1f1f" }}>
              Initializing secure session...
            </p>
          </div>
        </>
      );
    }

    if (sessionError) {
      return (
        <>
          <ReaperCursor />
          <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f5f3ef" }}>
            <div className="max-w-lg w-full hand-drawn-card p-6" style={{ backgroundColor: "#fdfbf7" }}>
              <h1 style={{ fontFamily: "'Caveat', cursive", fontSize: "2rem", marginBottom: "0.5rem" }}>Session Error</h1>
              <p style={{ fontFamily: "'Patrick Hand', cursive", color: "#5a5a5a" }}>{sessionError}</p>
              <button
                type="button"
                className="hand-drawn-button mt-4 px-4 py-2"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          </div>
        </>
      );
    }

    return (
      <QueryClientProvider client={queryClient}>
        <ReaperCursor />
        <ScanProvider>
          <App />
          <Toaster position="top-right" richColors />
        </ScanProvider>
      </QueryClientProvider>
    );
  }

  createRoot(document.getElementById("root")!).render(<Bootstrap />);
