import { createFileRoute, redirect } from "@tanstack/react-router";

/* `/` → `/gabrifila`, temporaneo (307) finché il traguardo 3 non porta la
   landing. La query string resta com'è (un vecchio link `/?chat=<id>` arriva
   a `/gabrifila?chat=<id>`); il frammento lo conserva il browser da solo. */
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/gabrifila" + location.searchStr, statusCode: 307 });
  },
});
