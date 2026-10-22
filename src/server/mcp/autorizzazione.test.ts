/* Il cancello di /api/auth/mcp/authorize: senza sessione /accedi?next=…
   (Better Auth non vede la richiesta), con la sessione prompt=consent. */

import { describe, expect, it, vi } from "vitest";
import { cancelloAutorizzazione } from "./autorizzazione.ts";

const URL_AUTH = "https://concerti.example/api/auth/mcp/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A9%2Fcb&code_challenge=x&code_challenge_method=S256&state=s";

describe("cancello di /api/auth/mcp/authorize", () => {
  it("senza sessione: 302 a /accedi con next = percorso e query, senza chiamare Better Auth", async () => {
    const inoltra = vi.fn();
    for (const sessione of [async () => false, async () => Promise.reject(new Error("Convex giù"))]) {
      const res = await cancelloAutorizzazione(new Request(URL_AUTH), { sessione, inoltra });
      expect(res.status).toBe(302);
      const dove = res.headers.get("location")!;
      expect(dove.startsWith("/accedi?next=")).toBe(true);
      const next = new URLSearchParams(dove.split("?")[1]).get("next")!;
      expect(next).toBe(URL_AUTH.slice("https://concerti.example".length));
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(inoltra).not.toHaveBeenCalled();
  });

  it("con la sessione: inoltra a Better Auth con prompt=consent, qualunque prompt abbia chiesto il client", async () => {
    for (const prompt of ["", "&prompt=none", "&prompt=login", "&prompt=consent"]) {
      const inoltra = vi.fn(async (r: Request) => new Response(null, { status: 302, headers: { Location: `/autorizza?consent_code=x&prompt=${new URL(r.url).searchParams.get("prompt")}` } }));
      const res = await cancelloAutorizzazione(new Request(URL_AUTH + prompt, { headers: { cookie: "s=1" } }), { sessione: async () => true, inoltra });
      expect(inoltra).toHaveBeenCalledTimes(1);
      const inoltrata = inoltra.mock.calls[0][0];
      const u = new URL(inoltrata.url);
      expect(u.searchParams.getAll("prompt")).toEqual(["consent"]);
      expect(u.searchParams.get("client_id")).toBe("abc");
      expect(inoltrata.headers.get("cookie")).toBe("s=1");
      expect(res.status).toBe(302);
    }
  });
});
