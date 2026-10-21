import { useContext } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ritratto } from "../ritratto/Ritratto.tsx";
import { ShellContext } from "../shell/Shell.tsx";

/* "Sul palco": il Ritratto. */
export const Route = createFileRoute("/$handle/")({
  component: SulPalcoPage,
});

function SulPalcoPage() {
  const { openChat } = useContext(ShellContext);
  const { handle } = Route.useParams();
  const navigate = useNavigate();
  return <Ritratto openChat={openChat} onExplore={() => navigate({ to: "/$handle/dati", params: { handle } })} />;
}
