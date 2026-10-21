import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { codiceDi } from "./errors.ts";
import { conProfilo, setup } from "../test.setup";

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

describe("requireOwner e getOwned", () => {
  it("senza identità → unauthorized", async () => {
    const t = setup();
    expect(await codice(t.query(api.profiles.get, {}))).toBe("unauthorized");
    expect(await codice(t.mutation(api.people.add, { input: { name: "Marco R." } }))).toBe("unauthorized");
  });

  it("senza profilo, o con un profilo in onboarding → no_profile con fix /benvenuto", async () => {
    const t = setup();
    const anon = t.withIdentity({ subject: "nessuno", sessionId: "s" });
    expect(await codice(anon.query(api.profiles.get, {}))).toBe("no_profile");
    const { as } = await conProfilo(t, "u-onb", "onb", { status: "onboarding", handle: undefined, onboardingStep: "partenze" });
    try {
      await as.query(api.profiles.get, {});
      throw new Error("doveva fallire");
    } catch (e) {
      expect((e as { data: { code: string; fix: string } }).data).toMatchObject({ code: "no_profile", fix: "/benvenuto" });
    }
  });

  it("un documento altrui → not_found, identico a uno inesistente o malformato", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const b = await conProfilo(t, "u-b", "utente-b");
    const { id } = await a.as.mutation(api.people.add, { input: { name: "Marco R." } });
    expect(await codice(b.as.mutation(api.people.rename, { input: { id, name: "Preso" } }))).toBe("not_found");
    expect(await codice(b.as.mutation(api.people.rename, { input: { id: "k" + "x".repeat(31), name: "Preso" } }))).toBe("not_found");
    // A resta invariata
    const elenco = await a.as.query(api.people.list, {});
    expect(elenco.people.map(p => p.name)).toEqual(["Marco R."]);
  });

  it("as: \"oracolo\" declassa la sessione e rifiuta le funzioni dashboardOnly", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const { id } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    expect(await codice(a.as.mutation(api.departures.confirmAddress, { as: "oracolo", input: { departureId: id, indice: 0 } }))).toBe("solo_dashboard");
    // T2: nessun token agente è valido (le API key arrivano col traguardo 7)
    expect(await codice(a.as.mutation(api.departures.confirmAddress, { agentToken: "cgk_finto", input: { departureId: id, indice: 0 } }))).toBe("unauthorized");
    await a.as.mutation(api.people.add, { as: "oracolo", input: { name: "Lu" } });
    const voci = await a.as.query(api.activity.list, {});
    expect(voci.voci[0].autore).toBe("Oracolo");
  });

  it("un input non valido non viene ripetuto nell'errore", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const CANARINO = "Via dei Canarini 7, Genova";
    for (const input of [
      { kind: "concert", date: CANARINO, artist: "X", venue: "Y", city: "Z" },
      { kind: "concert", date: "01/01/2026", artist: "X", venue: "Y", city: "Z", voto: CANARINO },
      { kind: CANARINO },
    ]) {
      try {
        await a.as.mutation(api.entries.add, { input });
        throw new Error("doveva fallire");
      } catch (e) {
        const testo = JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message);
        expect(testo).not.toContain("Canarini");
        expect(codiceDi(e)).toBe("input_non_valido");
      }
    }
    // nemmeno una chiave di record scelta dal chiamante (layout.titoli.<chiave>)
    try {
      await a.as.mutation(api.profiles.setTheme, { input: { layout: { ordine: [], nascoste: [], titoli: { [CANARINO]: "x" } } } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect(JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message)).not.toContain("Canarini");
      expect((e as { data: { campo: string } }).data.campo).toBe("layout.titoli.*");
    }
    // anche un token agente malformato non compare
    try {
      await a.as.query(api.profiles.get, { agentToken: "cgk_" + CANARINO });
    } catch (e) {
      expect(JSON.stringify((e as { data?: unknown }).data) + String((e as Error).message)).not.toContain("Canarini");
    }
  });
});
