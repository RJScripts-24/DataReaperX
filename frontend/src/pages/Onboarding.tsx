import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import apiClient, { ApiClientError } from "../lib/apiClient";
import { useScanContext } from "../lib/scanContext";
import { createGoogleSession, getAuthSession, setScanPending } from "../lib/sessionManager";

type GoogleCredentialResponse = { credential?: string };
type GoogleAuthConfigResponse = { configured: boolean; clientId: string };

const DASHBOARD_ROUTE = "/command-center";
let initializedGoogleApiRef: unknown = null;
let initializedGoogleClientId: string | null = null;
let activeGoogleCredentialHandler: ((response: GoogleCredentialResponse) => void) | null = null;

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.4-.2-2.1H12z" />
      <path fill="#34A853" d="M12 22c2.6 0 4.9-.9 6.5-2.5l-3.1-2.4c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5C4.8 19.8 8.1 22 12 22z" />
      <path fill="#4A90E2" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L3.2 7.5C2.4 8.9 2 10.4 2 12s.4 3.1 1.2 4.5L6.4 14z" />
      <path fill="#FBBC05" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.9 3 14.6 2 12 2 8.1 2 4.8 4.2 3.2 7.5L6.4 10c.8-2.4 3-4.1 5.6-4.1z" />
    </svg>
  );
}

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google OAuth is unavailable in this environment."));
  }

  const googleApi = (window as any).google?.accounts?.id;
  if (googleApi) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity script.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script."));
    document.head.appendChild(script);
  });
}

async function ensureGoogleIdentityClient(clientId: string): Promise<any> {
  await loadGoogleIdentityScript();

  const googleApi = (window as any).google?.accounts?.id;
  if (!googleApi) {
    throw new Error("Google Identity API is unavailable.");
  }

  // If the runtime swaps the Google API object (test/dev reload), reset cached init state.
  if (initializedGoogleApiRef && initializedGoogleApiRef !== googleApi) {
    initializedGoogleClientId = null;
    activeGoogleCredentialHandler = null;
  }
  initializedGoogleApiRef = googleApi;

  if (initializedGoogleClientId && initializedGoogleClientId !== clientId) {
    throw new Error("Google OAuth client changed during runtime. Refresh and retry.");
  }

  if (!initializedGoogleClientId) {
    googleApi.initialize({
      client_id: clientId,
      callback: (response: GoogleCredentialResponse) => {
        if (activeGoogleCredentialHandler) {
          activeGoogleCredentialHandler(response);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
    });
    initializedGoogleClientId = clientId;
  }

  return googleApi;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { scanId } = useScanContext();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const [sessionEmail, setSessionEmail] = useState<string | null>(() => getAuthSession()?.email ?? null);
  const [googleClientId, setGoogleClientId] = useState<string>("");
  const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAutoRouting, setIsAutoRouting] = useState(false);
  const [isGoogleButtonReady, setIsGoogleButtonReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsAuthConfigLoading(true);

    void apiClient
      .get<GoogleAuthConfigResponse>("/v1/auth/google/config")
      .then((response) => {
        if (!isMounted) {
          return;
        }
        const clientId = String(response.data.clientId ?? "").trim();
        if (response.data.configured && clientId) {
          setGoogleClientId(clientId);
          return;
        }
        setGoogleClientId("");
        setErrorMessage("Google OAuth is not configured on backend yet. Add GMAIL_CLIENT_ID and retry.");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setGoogleClientId("");
        setErrorMessage("Unable to load Google OAuth configuration from backend.");
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthConfigLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (sessionEmail && scanId) {
      navigate(DASHBOARD_ROUTE, { replace: true });
    }
  }, [navigate, scanId, sessionEmail]);

  useEffect(() => {
    if (!sessionEmail || scanId || isAutoRouting || isSigningIn) {
      return;
    }
    setIsAutoRouting(true);
    setErrorMessage(null);

    setScanPending(true);
    navigate(DASHBOARD_ROUTE, { replace: true });
    setIsAutoRouting(false);
  }, [isAutoRouting, isSigningIn, scanId, sessionEmail]);

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current || sessionEmail) {
      return;
    }

    let cancelled = false;
    setIsGoogleButtonReady(false);

    activeGoogleCredentialHandler = async (response: GoogleCredentialResponse) => {
      const idToken = String(response?.credential ?? "").trim();
      if (!idToken) {
        setErrorMessage("Google did not return a valid credential.");
        return;
      }

      if (cancelled) {
        return;
      }
      setErrorMessage(null);
      setIsSigningIn(true);
      try {
        const session = await createGoogleSession(idToken);
        const normalizedEmail = String(session.email).trim().toLowerCase();
        setSessionEmail(normalizedEmail);
        setScanPending(true);
        toast.success(`Signed in as ${normalizedEmail}`);
        navigate(DASHBOARD_ROUTE, { replace: true });
      } catch (error) {
        const message =
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Google sign-in failed. Please retry.";
        setErrorMessage(message);
      } finally {
        setIsSigningIn(false);
      }
    };

    void ensureGoogleIdentityClient(googleClientId)
      .then((googleApi) => {
        if (cancelled || !googleButtonRef.current) {
          return;
        }
        googleButtonRef.current.innerHTML = "";
        googleApi.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: Math.min(Math.max(window.innerWidth - 96, 260), 540),
          logo_alignment: "left",
        });
        setIsGoogleButtonReady(true);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unable to initialize Google Sign-In button. Please refresh.";
        setErrorMessage(message);
      });

    return () => {
      cancelled = true;
      if (activeGoogleCredentialHandler) {
        activeGoogleCredentialHandler = null;
      }
    };
  }, [googleClientId, sessionEmail]);

  return (
    <div className="h-screen overflow-hidden relative w-full">
      <PressureFilter />

      <main className="flex h-full w-full items-center justify-center px-6 md:px-12 relative z-10">
        <motion.div
          className="absolute left-[2vw] top-[20vh] hidden lg:block"
          data-reaper-expression="thinking"
          data-reaper-phrases="Sleuth Agent waiting for orders.||Recon phase incoming.||He's already sniffing for your data trail."
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
          data-reaper-phrases="The Security Shield. Nothing gets past us.||Defense systems online.||Safe and sound under my watch."
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

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="hand-drawn-card w-full max-w-[620px] p-8 md:p-10"
        >
          <PressureText
            as="h1"
            variant="strong"
            className="paper-text mb-3"
            style={{ fontFamily: "'Caveat', cursive", fontSize: "clamp(2.3rem, 4vw, 3rem)" }}
          >
            Initialize Target Acquisition
          </PressureText>

          <PressureText
            as="p"
            variant="lite"
            className="paper-text mb-8"
            style={{ fontFamily: "'Patrick Hand', cursive", opacity: 0.82, fontSize: "1.2rem" }}
          >
            Sign in with Google to begin the autonomous identity scan.
          </PressureText>

          {!sessionEmail ? (
            <div className="w-full">
              {!isGoogleButtonReady || isAuthConfigLoading ? (
                <motion.button
                  type="button"
                  className="hand-drawn-button w-full px-5 py-4"
                  disabled
                  whileHover={{ scale: 1 }}
                  whileTap={{ scale: 1 }}
                >
                  <span className="flex items-center justify-center gap-3">
                    <GoogleMark />
                    <PressureText as="span" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "1.15rem" }}>
                      {isAuthConfigLoading ? "Loading Google OAuth..." : "Preparing Google sign-in..."}
                    </PressureText>
                  </span>
                </motion.button>
              ) : null}

              <div
                ref={googleButtonRef}
                className={isGoogleButtonReady ? "w-full flex justify-center" : "w-full hidden"}
                aria-label="Login with Google"
              />

              {isSigningIn ? (
                <PressureText
                  as="p"
                  variant="lite"
                  className="paper-text mt-4"
                  style={{ fontFamily: "'Patrick Hand', cursive", color: "#5a5a5a", fontSize: "1.1rem" }}
                >
                  Connecting Google...
                </PressureText>
              ) : null}
            </div>
          ) : (
            <PressureText
              as="p"
              variant="lite"
              className="paper-text"
              style={{ fontFamily: "'Patrick Hand', cursive", color: "#5a5a5a", fontSize: "1.1rem" }}
            >
              Opening dashboard...
            </PressureText>
          )}

          {errorMessage ? (
            <div className="mt-5">
              <PressureText as="p" style={{ fontFamily: "'Patrick Hand', cursive", color: "#b94a48" }}>
                {errorMessage}
              </PressureText>
            </div>
          ) : null}
        </motion.div>
      </main>
    </div>
  );
}
