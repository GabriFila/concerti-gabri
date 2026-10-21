import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/* Un router per richiesta (Start chiama getRouter() a ogni SSR): niente stato
   condiviso tra visitatori a livello di modulo. */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
