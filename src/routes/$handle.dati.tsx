import { createFileRoute } from "@tanstack/react-router";
import { FullDashboard } from "../dashboard/FullDashboard.tsx";

/* "I dati": la dashboard completa. */
export const Route = createFileRoute("/$handle/dati")({
  component: FullDashboard,
});
