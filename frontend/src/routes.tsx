import { createBrowserRouter } from "react-router";
import Landing from "./pages/Landing";
import Onboarding from "./pages/Onboarding";
import CommandCenter from "./pages/CommandCenter";
import IdentityGraph from "./pages/IdentityGraph";
import WarRoom from "./pages/WarRoom";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/command-center",
    Component: CommandCenter,
  },
  {
    path: "/identity-graph",
    Component: IdentityGraph,
  },
  {
    path: "/war-room",
    Component: WarRoom,
  },
]);