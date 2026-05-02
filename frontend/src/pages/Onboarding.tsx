import { useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { PressureText } from "../components/PressureText";
import { PressureInput } from "../components/PressureInput";
import { PressureFilter } from "../components/PressureFilter";
import { ApiClientError } from "../lib/apiClient";
import apiClient from "../lib/apiClient";
import { useScanContext } from "../lib/scanContext";

export default function Onboarding() {
  const navigate = useNavigate();
  const { setActiveScan } = useScanContext();
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [bootLogLines, setBootLogLines] = useState<string[]>([]);

  const playBootLog = async (lines: string[]) => {
    for (const line of lines) {
      setBootLogLines((previous) => [...previous, line]);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });
    }
  };

  const handleInitialize = async () => {
    const normalized = input.trim();
    if (!normalized || isLaunching) {
      return;
    }

    setInputError(null);
    setBootLogLines([]);
    setIsLaunching(true);

    try {
      const response = await apiClient.post<{
        scan_id: string;
        boot_log: string[];
      }>("/api/onboarding/initialize", {
        seeds: [normalized],
        seed_type: "auto",
        jurisdiction: "DPDP",
        consent_confirmed: true,
      });

      const { scan_id, boot_log } = response.data;
      setActiveScan(scan_id);

      const lines = Array.isArray(boot_log) && boot_log.length > 0 ? boot_log : ["Booting Sleuth Agent..."];
      await playBootLog(lines);
      navigate("/command-center");
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : "Failed to launch scan. Please retry.";
      setInputError(message);
      setIsLaunching(false);
    }
  };

  return (
    <div
      className="h-screen overflow-hidden relative w-full"
    >
      <PressureFilter />

      <main
        className="flex flex-col items-center h-full w-full relative z-10 p-8 md:p-16"
      >
        {/* Handwriting Welcome Message - Pushed to top */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.2 }}
          className="text-center relative flex flex-col items-center mb-12"
        >
            <PressureText
              as="h2"
              variant="strong"
              className="paper-text"
              style={{
                fontFamily: "'Dancing Script', cursive",
                fontSize: "clamp(3.5rem, 6vw, 5rem)",
                transform: "rotate(-1deg)",
                letterSpacing: "0.02em",
              }}
              data-reaper-expression="happy"
              data-reaper-phrases="Operative. I'll be your digital handler.||Everything you enter remains in the vault.||The scan is strictly confidential."
            >
              Welcome, Operative.
            </PressureText>
          <PressureText
            as="p"
            variant="lite"
            className="paper-text mt-4 text-2xl opacity-70"
            style={{
              fontFamily: "'Caveat', cursive",
              transform: "rotate(0.5deg)",
            }}
          >
            The digital trail starts now.
          </PressureText>
        </motion.div>

        {/* Illustrations are absolute, they don't affect flex flow */}
        <motion.div
          className="absolute left-[2vw] top-[20vh] hidden lg:block"
          data-reaper-expression="thinking"
          data-reaper-phrases="Sleuth Agent waiting for orders.||Look at that cute little scythe.||Recon phase incoming.||He's already sniffing for your data trail."
          initial={{ opacity: 0, x: -20 }}
          animate={{
            opacity: 1,
            x: 0,
            y: [0, -10, 0],
            rotate: [-0.4, 0.35, -0.4],
          }}
          transition={{
            opacity: { duration: 0.9, delay: 0.35 },
            x: { duration: 0.9, delay: 0.35 },
            y: { duration: 8.8, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 10.5, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformOrigin: "50% 72%" }}
        >
          <motion.div
            aria-hidden="true"
            className="absolute left-[12%] top-[10%] h-[72%] w-[70%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(197, 227, 255, 0.18) 0%, rgba(197, 227, 255, 0.08) 35%, transparent 72%)",
              filter: "blur(22px)",
            }}
            animate={{ opacity: [0.12, 0.22, 0.12], scale: [0.98, 1.04, 0.98] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <img
            src="/images/onboarding-sleuth-dome.png"
            alt="Sleuth Agent"
            style={{ width: "398px", filter: "url(#pencil-sketch) contrast(1.15) brightness(1.05)", mixBlendMode: "multiply" }}
          />
        </motion.div>

        <motion.div
          className="absolute right-[2vw] bottom-[15vh] hidden lg:block"
          data-reaper-expression="happy"
          data-reaper-phrases="The Security Shield. Nothing gets past us.||Your fortress in the digital wasteland.||Defense systems online.||Safe and sound under my watch."
          initial={{ opacity: 0, x: 20 }}
          animate={{
            opacity: 1,
            x: 0,
            y: [0, 9, 0],
            rotate: [0.35, -0.35, 0.35],
          }}
          transition={{
            opacity: { duration: 0.9, delay: 0.45 },
            x: { duration: 0.9, delay: 0.45 },
            y: { duration: 9.6, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 11.4, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformOrigin: "50% 74%" }}
        >
          <motion.div
            aria-hidden="true"
            className="absolute left-[14%] top-[12%] h-[68%] w-[68%] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(168, 165, 240, 0.18) 0%, rgba(168, 165, 240, 0.08) 36%, transparent 74%)",
              filter: "blur(24px)",
            }}
            animate={{ opacity: [0.1, 0.19, 0.1], scale: [0.985, 1.035, 0.985] }}
            transition={{ duration: 7.2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          />
          <img
            src="/images/onboarding-shield-dome.png"
            alt="Security Shield"
            style={{ width: "374px", filter: "url(#pencil-sketch) contrast(1.15) brightness(1.05)", mixBlendMode: "multiply" }}
          />
        </motion.div>

        {/* Centered Form Container */}
        <div className="flex-grow flex flex-col items-center justify-center w-full max-w-[640px] px-6 relative z-10">
            <motion.div
              key="input-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: [0, -2, 0] }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                opacity: { duration: 0.6 },
                y: { duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 },
              }}
              className="hand-drawn-card p-10 relative overflow-hidden"
            >
              <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 right-10 h-32 w-32 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(168, 165, 240, 0.16) 0%, rgba(168, 165, 240, 0.06) 40%, transparent 75%)",
                  filter: "blur(20px)",
                }}
                animate={{ opacity: [0.08, 0.18, 0.08], scale: [0.96, 1.06, 0.96] }}
                transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative z-10">
                <PressureText as="h1" variant="strong" className="paper-text mb-4 leading-tight" style={{ fontFamily: "'Caveat', cursive", fontSize: "clamp(2.5rem, 5vw, 3.2rem)" }}>
                  Initialize Target Acquisition
                </PressureText>
                <PressureText as="p" variant="lite" className="paper-text mb-10 text-xl" style={{ fontFamily: "'Patrick Hand', cursive", opacity: 0.8 }}>
                  Enter one email to begin the autonomous identity scan.
                </PressureText>

                <div className="mb-8 relative group">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <span
                      className="text-sm"
                      style={{
                        fontFamily: "'Patrick Hand', cursive",
                        color: "rgba(31, 31, 31, 0.58)",
                      }}
                    >
                      Use one email only
                    </span>
                  </div>
                  <PressureInput
                    type="email"
                    value={input}
                    disabled={isLaunching}
                    onChange={(e: any) => {
                      setInput(e.target.value);
                      if (inputError) {
                        setInputError(null);
                      }
                    }}
                    onKeyDown={(e: any) => {
                      if (e.key === "Enter") handleInitialize();
                    }}
                    placeholder="Email"
                    className="w-full bg-transparent border-none pb-4 text-[2rem] leading-tight outline-none"
                    style={{
                      color: "#1f1f1f",
                      borderBottom: "2px solid #2b2b2b",
                      paddingLeft: "4px",
                      paddingRight: "4px",
                      letterSpacing: "0.01em",
                      textShadow: "none",
                    }}
                    data-reaper-expression="thinking"
                    data-reaper-phrases="Searching for digital rot...||Type carefully, Operative.||I'm ready to track this down.||Enter your target lead."
                  />
                  <div
                    className="absolute bottom-0 left-0 w-full h-[2px] bg-[#a8a5f0] opacity-0 group-focus-within:opacity-100 transition-opacity"
                    style={{ transform: "translateY(1px)", filter: "url(#pencil-sketch-heavy)" }}
                  />
                </div>

                {bootLogLines.length > 0 && (
                  <div className="pencil-fill-dark rounded-[14px] border border-[#3b3b4f] px-4 py-4 mb-6 min-h-[120px]">
                    <div className="space-y-1">
                      {bootLogLines.map((line, index) => {
                        const isCurrentLine = index === bootLogLines.length - 1;
                        return (
                          <motion.p
                            key={`${line}-${index}`}
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-lg md:text-xl leading-relaxed"
                            style={{
                              fontFamily: "'Patrick Hand', cursive",
                              color: "#edf1ff",
                              textShadow: "none",
                              mixBlendMode: "normal",
                              opacity: 1,
                              display: "block",
                            }}
                          >
                            {line}
                            {isCurrentLine && <span className="terminal-cursor ml-1">|</span>}
                          </motion.p>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inputError && (
                  <div
                    data-reaper-expression="sad"
                    data-reaper-phrases="Invalid input. My scythe missed the target.||That doesn't look like a real data trail.||Check your typing, Operative. I'm getting nothing."
                  >
                    <PressureText
                      as="p"
                      variant="lite"
                      className="paper-text mb-6 text-lg"
                      style={{ fontFamily: "'Patrick Hand', cursive", color: "#b94a48" }}
                    >
                      {inputError}
                    </PressureText>
                  </div>
                )}

                <motion.button
                  onClick={handleInitialize}
                  disabled={!input.trim() || isLaunching}
                  whileHover={{ scale: input.trim() && !isLaunching ? 1.02 : 1, rotate: -0.5 }}
                  whileTap={{ scale: input.trim() && !isLaunching ? 0.98 : 1 }}
                  className="w-full py-5 hand-drawn-button text-2xl"
                  data-reaper-expression="happy"
                  data-reaper-phrases="Initiate the hunt.||Release the Sleuth Agent!||Let's burn their data logs.||No mercy for brokers."
                  style={{ opacity: !input.trim() || isLaunching ? 0.5 : 1 }}
                >
                  <PressureText className="paper-text">
                    {isLaunching ? "Initializing..." : "Launch Sleuth Agent"}
                  </PressureText>
                </motion.button>
              </div>
            </motion.div>
        </div>
      </main>

      <div 
        className="absolute bottom-0 left-0 w-full pointer-events-none z-0 overflow-hidden" 
        style={{ height: "160px", pointerEvents: "auto" }}
        data-reaper-expression="default"
        data-reaper-phrases="The digital horizon. End of the trail.||Nothing but dust and deleted logs down here.||The wasteland is quiet today."
      >
        <svg
          viewBox="0 0 1440 160"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          style={{ filter: "url(#pencil-sketch)", opacity: 0.15 }}
        >
          {/* Main ground line */}
          <path
            d="M-20 120 Q 300 110 720 130 T 1460 115"
            stroke="#1a1a1a"
            strokeWidth="3"
            fill="none"
          />
          <path
            d="M-20 125 Q 350 118 750 135 T 1460 120"
            stroke="#1a1a1a"
            strokeWidth="1.5"
            fill="none"
            opacity="0.6"
          />

          {/* Abstract node towers */}
          <path d="M 200 120 L 200 80 L 230 80 L 230 125" stroke="#1a1a1a" strokeWidth="2" fill="none" />
          <path d="M 210 120 L 210 95 L 220 95 L 220 120" stroke="#1a1a1a" strokeWidth="1" fill="none" opacity="0.5" />

          <path d="M 450 130 L 450 60 L 480 50 L 500 60 L 500 135" stroke="#1a1a1a" strokeWidth="2" fill="none" />
          <circle cx="475" cy="75" r="3" stroke="#1a1a1a" strokeWidth="1.5" fill="none" />

          <path d="M 900 125 L 900 40 L 980 40 L 980 128" stroke="#1a1a1a" strokeWidth="2.5" fill="none" />
          <path d="M 910 60 L 970 60 M 910 80 L 970 80 M 910 100 L 970 100" stroke="#1a1a1a" strokeWidth="1.5" fill="none" opacity="0.6" />

          <path d="M 1200 118 L 1200 70" stroke="#1a1a1a" strokeWidth="3" fill="none" />
          <path d="M 1180 50 Q 1200 70 1220 50" stroke="#1a1a1a" strokeWidth="2" fill="none" />

          {/* Faint connecting lines */}
          <path d="M 230 80 Q 340 50 450 60" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="5,5" fill="none" opacity="0.4" />
          <path d="M 500 70 Q 700 30 900 60" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="5,5" fill="none" opacity="0.4" />
        </svg>
      </div>

      <style>{`
        .hand-drawn-card {
          border: 2px solid #2b2b2b !important;
          border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px !important;
          background-color: #fdfbf7;
          box-shadow: 8px 8px 0px rgba(0,0,0,0.05) !important;
          filter: url(#pencil-texture);
          position: relative;
        }
        
        .hand-drawn-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: -1;
        }
        
        input::placeholder {
          font-family: 'Patrick Hand', cursive;
          opacity: 1;
          color: rgba(31, 31, 31, 0.42);
        }

        .pencil-fill-dark {
          background: repeating-linear-gradient(
            45deg,
            #2b2b3d,
            #2b2b3d 2px,
            #252535 2px,
            #252535 4px
          ) !important;
          border-color: #3b3b4f !important;
        }

        .terminal-cursor {
          display: inline-block;
          animation: terminal-blink 1s steps(2, start) infinite;
          color: #d7dcf3;
        }

        @keyframes terminal-blink {
          to {
            visibility: hidden;
          }
        }
      `}</style>
    </div>
  );

}
