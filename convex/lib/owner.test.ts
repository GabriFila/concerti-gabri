import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { codiceDi } from "./errors.ts";
import { components } from "../_generated/api";
import { nuovoClientOAuth, nuovoTokenOAuth } from "../test.authFinto.ts";
import { conProfilo, sessione, setup, venue } from "../test.setup";

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
    const { as: anon } = await sessione(t, "nessuno");
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
    expect(voci.voci[0].autore).toBe("Tour manager");
  });

  it("oracoloOnly (la scheda dell'Oracolo): solo con as: \"oracolo\"; la dashboard e gli agenti → solo_oracolo", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const input = { proposta: { artist: "X", date: "2026-01-01", venue: "Fabrique", city: "Milano" } };
    // la sessione senza `as` è la dashboard
    expect(await codice(a.as.mutation(api.entries.salvaScheda, { input }))).toBe("solo_oracolo");
    // un agente resta un agente, anche con as: "oracolo"
    const { chiave } = await a.as.mutation(api.agents.createApiKey, { input: { nome: "Script" } });
    await nuovoClientOAuth(t, "client-a");
    const token = await nuovoTokenOAuth(t, "u-a", "client-a");
    for (const agentToken of [chiave, token]) {
      expect(await codice(t.mutation(api.entries.salvaScheda, { agentToken, input }))).toBe("solo_oracolo");
      expect(await codice(t.mutation(api.entries.salvaScheda, { agentToken, as: "oracolo", input }))).toBe("solo_oracolo");
    }
    expect((await a.as.query(api.entries.list, {})).concerts).toEqual([]);
    // l'Oracolo sì, e nel registro firma "Oracolo"
    expect(await codice(a.as.mutation(api.entries.salvaScheda, { as: "oracolo", input }))).toBe("ok");
    expect((await a.as.query(api.activity.list, {})).voci[0]).toMatchObject({ autore: "Tour manager", riassunto: "aggiunto: X (01/01/2026)" });
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

  it("una sessione scaduta o revocata viene rifiutata, anche se il JWT è ancora valido", async () => {
    const t = setup();
    const { profileId } = await conProfilo(t, "u-a", "utente-a");
    expect(profileId).toBeTruthy();

    // scaduta
    const scaduta = await sessione(t, "u-a", { scadeTra: -1000 });
    expect(await codice(scaduta.as.query(api.profiles.get, {}))).toBe("unauthorized");
    expect(await codice(scaduta.as.mutation(api.people.add, { input: { name: "Lu" } }))).toBe("unauthorized");
    expect(await scaduta.as.query(api.me.profile, {})).toBeNull();

    // revocata (Esci, revoca, account eliminato: la riga sparisce)
    const revocata = await sessione(t, "u-a");
    expect(await codice(revocata.as.query(api.profiles.get, {}))).toBe("ok");
    await t.run(ctx =>
      ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: revocata.sessionId }] } }),
    );
    expect(await codice(revocata.as.query(api.profiles.get, {}))).toBe("unauthorized");
    expect(await revocata.as.query(api.me.profile, {})).toBeNull();

    // il JWT senza sessione, o con la sessione di un altro utente
    expect(await codice(t.withIdentity({ subject: "u-a" }).query(api.profiles.get, {}))).toBe("unauthorized");
    const diB = await sessione(t, "u-b");
    expect(await codice(t.withIdentity({ subject: "u-a", sessionId: diB.sessionId }).query(api.profiles.get, {}))).toBe("unauthorized");
    expect(await codice(t.withIdentity({ subject: "u-a", sessionId: "s-inventata" }).query(api.profiles.get, {}))).toBe("unauthorized");
  });
});
