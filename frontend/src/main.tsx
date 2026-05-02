import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import App from "./App.tsx";
import { ReaperCursor } from "./components/ReaperCursor";
import { queryClient } from "./lib/queryClient";
import { ScanProvider } from "./lib/scanContext";
import "./styles/index.css";

if (
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  (typeof window.matchMedia !== "function" || !window.matchMedia("(pointer: coarse)").matches)
) {
  document.documentElement.classList.add("hide-native-cursor");
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ReaperCursor />
    <ScanProvider>
      <App />
      <Toaster position="top-right" richColors />
    </ScanProvider>
  </QueryClientProvider>
);
