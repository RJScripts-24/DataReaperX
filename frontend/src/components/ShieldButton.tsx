import { useEffect, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import confetti from "canvas-confetti";

import { useShield } from "../lib/useShield";
import { downloadShieldExtension } from "../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const CONTROL_TEXT: CSSProperties = {
  fontFamily: "'Patrick Hand', cursive",
  fontSize: "1.125rem",
  padding: "14px 28px",
  minHeight: 48,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const SECONDARY_BTN: CSSProperties = {
  ...CONTROL_TEXT,
  backgroundColor: "#fff",
  color: "#2a4a6f",
  borderColor: "#4a6fa5",
};

// --------------------------------------------------------------------------
// Onboarding Modal (shown when state === "pending_install")
// --------------------------------------------------------------------------
function OnboardingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      emoji: "📥",
      title: "Download Complete!",
      instruction:
        "Find datareaper-tripwire.zip in your Downloads folder and unzip it.",
    },
    {
      emoji: "🧩",
      title: "Enable Developer Mode",
      instruction:
        "Open chrome://extensions → toggle Developer Mode → click Load unpacked → select the unzipped folder.",
    },
    {
      emoji: "🛡️",
      title: "Shield Is Arming…",
      instruction:
        "Return to this dashboard tab — the shield status badge will turn green automatically.",
    },
  ];

  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="hand-drawn-card max-w-lg"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: 22,
            }}
          >
            Install Your Active Shield
          </DialogTitle>
        </DialogHeader>

        <div style={{ textAlign: "center", padding: "16px 0" }}>
          {/* Dot indicators */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full mx-1`}
                style={{
                  backgroundColor: i === step ? "#4a6fa5" : "#ccc",
                  transition: "background-color 0.3s ease",
                }}
              />
            ))}
          </div>

          {/* Animated step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {steps[step].emoji}
              </div>
              <h3
                style={{
                  fontFamily: "'Dancing Script', cursive",
                  fontSize: 20,
                  fontWeight: 700,
                  color: "#2a2a2a",
                  marginBottom: 8,
                }}
              >
                {steps[step].title}
              </h3>
              <p
                style={{
                  fontFamily: "'Patrick Hand', cursive",
                  fontSize: 15,
                  color: "#444",
                  lineHeight: 1.7,
                  maxWidth: 380,
                  margin: "0 auto",
                }}
              >
                {steps[step].instruction}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button
            className="hand-drawn-button"
            style={{
              backgroundColor: "#4a6fa5",
              color: "#fff",
              borderColor: "#4a6fa5",
            }}
            onClick={isLast ? onClose : () => setStep((s) => s + 1)}
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontFamily: "'Patrick Hand', cursive",
              fontSize: 12,
              color: "#999",
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Skip
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Main ShieldButton component
// --------------------------------------------------------------------------
export function ShieldButton() {
  const { shieldState, deployShield, redeployShield, refreshShieldPack } = useShield();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingInstallDismissed, setPendingInstallDismissed] = useState(false);

  useEffect(() => {
    if (shieldState !== "pending_install") {
      setPendingInstallDismissed(false);
      setModalOpen(false);
      return;
    }

    if (!pendingInstallDismissed) {
      setModalOpen(true);
    }
  }, [pendingInstallDismissed, shieldState]);

  const handleDeploy = async () => {
    setPendingInstallDismissed(false);
    await deployShield();
    // Trigger confetti
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#4a6fa5", "#4f7d5c", "#d17a22", "#b94a48"],
    });
    toast.success("Shield deployment initiated! Download starting...");
    downloadShieldExtension();
    setModalOpen(true);
  };

  const handleRedeploy = async () => {
    await redeployShield();
    confetti({
      particleCount: 40,
      spread: 55,
      origin: { y: 0.65 },
      colors: ["#4a6fa5", "#4f7d5c", "#d17a22"],
    });
    toast.success("Latest shield pack downloading — reload the extension in chrome://extensions after unzipping.");
    downloadShieldExtension();
  };

  const handlePendingRedeploy = async () => {
    await deployShield();
    toast.success("Fresh token and latest pack — download starting...");
    downloadShieldExtension();
  };

  /** Fresh token + zip without pending-install state or the onboarding modal. */
  const handleRedeployWithoutModal = async () => {
    await refreshShieldPack();
    confetti({
      particleCount: 35,
      spread: 50,
      origin: { y: 0.65 },
      colors: ["#4a6fa5", "#4f7d5c"],
    });
    toast.success("Latest shield pack downloading…");
    downloadShieldExtension();
  };

  // Force-open modal when state transitions to pending_install
  if (shieldState === "pending_install" && !modalOpen) {
    // defer to next tick to avoid render conflict
    setTimeout(() => setModalOpen(true), 0);
  }

  if (shieldState === "active") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: "rgba(79,125,92,0.12)",
            border: "1.5px solid #4f7d5c",
            borderRadius: 999,
            padding: "12px 22px",
            minHeight: 48,
            fontFamily: "'Patrick Hand', cursive",
            color: "#4f7d5c",
            fontSize: "1.125rem",
            fontWeight: 600,
            boxShadow: "0 0 12px rgba(79,125,92,0.35)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#4f7d5c",
              display: "inline-block",
              animation: "drPulse 1.5s infinite",
            }}
          />
          Shield Active · Monitoring DOM
        </motion.div>
        <motion.button
          type="button"
          className="hand-drawn-button"
          onClick={() => void handleRedeploy()}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          style={SECONDARY_BTN}
        >
          🔄 Redeploy
        </motion.button>
      </div>
    );
  }

  if (shieldState === "downloading") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          fontFamily: "'Caveat', cursive",
          fontSize: "1.35rem",
          color: "#4a6fa5",
          minHeight: 48,
        }}
      >
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          style={{ display: "inline-block", fontSize: 26 }}
        >
          ⚔️
        </motion.span>
        Packaging shield...
      </div>
    );
  }

  if (shieldState === "pending_install") {
    return (
      <>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="hand-drawn-button"
            disabled
            style={{ ...CONTROL_TEXT, opacity: 0.65, cursor: "not-allowed" }}
          >
            ⏳ Awaiting Extension Install
          </button>
          <motion.button
            type="button"
            className="hand-drawn-button"
            onClick={() => void handlePendingRedeploy()}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            style={SECONDARY_BTN}
          >
            🔄 Redeploy
          </motion.button>
        </div>

        <OnboardingModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setPendingInstallDismissed(true);
          }}
        />
      </>
    );
  }

  // "idle" or "error" — Deploy opens the install modal; Redeploy only refreshes token + zip download
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <motion.button
        className="hand-drawn-button"
        onClick={() => void handleDeploy()}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        style={{
          ...CONTROL_TEXT,
          animation: "drShieldPulse 2s infinite",
        }}
      >
        ⚔️ Deploy Active Shield
      </motion.button>
      <motion.button
        type="button"
        className="hand-drawn-button"
        onClick={() => void handleRedeployWithoutModal()}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        style={SECONDARY_BTN}
        title="Fresh token + latest tripwire zip without the install pop-up. Reload unpacked in chrome://extensions."
      >
        🔄 Redeploy
      </motion.button>
    </div>
  );
}
