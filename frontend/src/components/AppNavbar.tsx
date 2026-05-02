import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { AnimatedDataReaperLogo } from "./AnimatedDataReaperLogo";
import { PressureText } from "./PressureText";

export type AppNavRoute =
  | "dashboard"
  | "war-room"
  | "identity-graph"
  | "access-mirror"
  | "shield-logs"
  | "shadow-browser";

const NAV_ITEMS: Array<{ id: AppNavRoute; label: string; path: string }> = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard" },
  { id: "war-room", label: "War Room", path: "/war-room" },
  { id: "identity-graph", label: "Identity Graph", path: "/identity-graph" },
  { id: "access-mirror", label: "Access Mirror", path: "/access-mirror" },
  { id: "shield-logs", label: "Shield Logs", path: "/shield-logs" },
  { id: "shadow-browser", label: "Shadow Browser", path: "/shadow-browser" },
];

type AppNavbarProps = {
  active: AppNavRoute;
  rightSlot?: ReactNode;
};

export function AppNavbar({ active, rightSlot }: AppNavbarProps) {
  const navigate = useNavigate();

  return (
    <nav
      className="sticky top-0 z-50 px-4 md:px-8 lg:px-12 py-4"
      style={{ backgroundColor: "rgba(245, 243, 239, 0.88)", backdropFilter: "blur(10px)", borderBottom: "1.5px dashed rgba(0,0,0,0.15)" }}
    >
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-4">
        <div className="flex items-center justify-center md:justify-start gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <AnimatedDataReaperLogo />
          <PressureText as="span" className="text-3xl tracking-tight" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 700 }}>
            DataReaper
          </PressureText>
        </div>

        <div className="min-w-0 flex flex-nowrap items-center justify-center gap-4 md:gap-6 whitespace-nowrap overflow-x-auto md:overflow-visible">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`text-lg lg:text-xl pencil-text transition-colors ${isActive ? "opacity-100 hover:opacity-90" : "opacity-60 hover:opacity-100"}`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex items-center justify-center md:justify-end gap-2 min-h-[36px]">
          {rightSlot ?? null}
        </div>
      </div>
    </nav>
  );
}
