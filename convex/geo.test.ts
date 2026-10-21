import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { USER_AGENT } from "./geo.ts";
import { codiceDi } from "./lib/errors.ts";
import { conProfilo, setup } from "./test.setup";

const POI = { lat: "45.4014", lon: "9.1422", display_name: "Unipol Forum, Via G. di Vittorio, Assago, Lombardia, Italia", name: "Unipol Forum", osm_type: "way", osm_id: 26626007, category: "leisure", type: "sports_centre", addresstype: "leisure", address: { town: "Assago" } };
const CASA = { lat: "45.40", lon: "9.14", display_name: "Via Roma 1, Assago", name: "", osm_type: "node", osm_id: 1, category: "building", type: "house", addresstype: "house", address: { town: "Assago" } };
const STRADA = { lat: "45.40", lon: "9.14", display_name: "Via di Vittorio, Assago", name: "Via di Vittorio", osm_type: "way", osm_id: 2, category: "highway", type: "residential", addresstype: "road", address: { town: "Assago" } };
const CITTA = { lat: "45.405", lon: "9.131", display_name: "Assago, Milano, Lombardia", name: "Assago", osm_type: "relation", osm_id: 3, category: "boundary", type: "administrative", addresstype: "town", address: { town: "Assago" } };

function finto(risposte: unknown[][]) {
  const chiamate: { url: URL; headers: Record<string, string>; at: number }[] = [];
  const fetchFinto = vi.fn(async (input: string | URL, init?: RequestInit) => {
    chiamate.push({ url: new URL(String(input)), headers: Object.fromEntries(new Headers(init?.headers).entries()), at: Date.now() });
    return new Response(JSON.stringify(risposte[Math.min(chiamate.length - 1, risposte.length - 1)]), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchFinto);
  return chiamate;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const codice = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return codiceDi(e) ?? String((e as Error).message);
  }
};

describe("geo.searchVenue (Nominatim simulato)", () => {
  it("User-Agent, parametri e risultati non POI scartati", async () => {
    vi.stubEnv("NOMINATIM_URL", "http://127.0.0.1:9");
    const chiamate = finto([[POI, CASA, STRADA]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const r = await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    expect(chiamate.length).toBe(1);
    const [c] = chiamate;
    expect(c.headers["user-agent"]).toBe(USER_AGENT);
    expect(c.url.origin).toBe("http://127.0.0.1:9");
    expect(c.url.pathname).toBe("/search");
    expect(Object.fromEntries(c.url.searchParams)).toMatchObject({ q: "Forum di Assago", layer: "poi", format: "jsonv2", "accept-language": "it" });
    expect(r.candidati).toEqual([expect.objectContaining({ name: "Unipol Forum", city: "Assago", osm: "W26626007", featureType: "poi" })]);
    expect(r.attribuzione).toContain("OpenStreetMap");
  });

  it("senza POI ripiega sulla città, mai su una via", async () => {
    finto([[CASA, STRADA], [CITTA]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const r = await a.as.action(api.geo.searchVenue, { input: { query: "Via di Vittorio Assago" } });
    expect(r.candidati).toEqual([expect.objectContaining({ name: "Assago", featureType: "city" })]);
  });

  it("cache con chiave hashata, usata alla seconda ricerca identica", async () => {
    const chiamate = finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    await a.as.action(api.geo.searchVenue, { input: { query: "  forum DI assago " } });
    expect(chiamate.length).toBe(1);
    const cache = await t.run(async ctx => await ctx.db.query("venueSearchCache").collect());
    expect(cache.length).toBe(1);
    expect(cache[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(cache).toLowerCase()).not.toContain("forum di assago");
  });

  it("coda globale: al massimo una richiesta al secondo", async () => {
    const chiamate = finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.action(api.geo.searchVenue, { input: { query: "uno" } });
    await a.as.action(api.geo.searchVenue, { input: { query: "due" } });
    expect(chiamate.length).toBe(2);
    expect(chiamate[1].at - chiamate[0].at).toBeGreaterThanOrEqual(900);
  });

  it("limite per profilo: 30 ricerche all'ora, anche divise tra due attori", async () => {
    finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    // 15 dalla dashboard e 15 dall'Oracolo: nessuno dei due attori arriva al
    // suo limite (30), quindi il 31° lo ferma solo il limite del profilo
    for (let i = 0; i < 15; i++) {
      await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
      await a.as.action(api.geo.searchVenue, { as: "oracolo", input: { query: "Forum di Assago" } });
    }
    expect(await codice(a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } }))).toBe("limite_superato");
    expect(await codice(a.as.action(api.geo.searchVenue, { as: "oracolo", input: { query: "Forum di Assago" } }))).toBe("limite_superato");
    // un altro profilo non ne risente
    const b = await conProfilo(t, "u-b", "utente-b");
    expect(await codice(b.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } }))).toBe("ok");
  });

  it("limite per attore: 30 ricerche all'ora per lo stesso attore", async () => {
    finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    for (let i = 0; i < 30; i++) await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    expect(await codice(a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } }))).toBe("limite_superato");
  });

  it("geocodeDeparture: niente cache, candidati privati, al browser solo indice ed etichetta; mai da un agente", async () => {
    const chiamate = finto([[POI, CASA]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const { id } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    const r = await a.as.action(api.geo.geocodeDeparture, { input: { departureId: id, address: "Via dei Canarini 7, Genova" } });
    expect(JSON.stringify(r)).not.toMatch(/45\.40|9\.14/);
    expect(r.candidati.map(c => c.indice)).toEqual([0, 1]);
    expect(chiamate[0].url.searchParams.get("layer")).toBeNull();
    expect(await t.run(async ctx => (await ctx.db.query("venueSearchCache").collect()).length)).toBe(0);
    expect(await codice(a.as.action(api.geo.geocodeDeparture, { as: "oracolo", input: { departureId: id, address: "Via dei Canarini 7, Genova" } }))).toBe("solo_dashboard");
  });
});

describe("venues.createFromCandidate: solo candidati emessi dal server", () => {
  const CANARINO = { lng: 8.9345678, lat: 44.4123456 };

  it("un candidato inventato dal chiamante (coordinate, osm, tipo) è rifiutato", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const forgiato = { osm: "W26626007", name: "Unipol Forum", city: "Assago", ...CANARINO, featureType: "poi", label: "x" };
    expect(await codice(a.as.mutation(api.venues.createFromCandidate, { input: { candidate: forgiato } }))).toBe("input_non_valido");
    expect(await codice(a.as.mutation(api.venues.createFromCandidate, { input: { candidate: forgiato, ref: "k".repeat(32) + ":0" } }))).toBe("input_non_valido");
    // un ref che non viene da una ricerca: not_found
    expect(await codice(a.as.mutation(api.venues.createFromCandidate, { input: { ref: "k".repeat(32) + ":0" } }))).toBe("not_found");
    expect(await t.run(async ctx => (await ctx.db.query("venues").collect()).length)).toBe(0);
  });

  it("coordinate, osm e città vengono dalla cache: nessuno occupa un id OSM o un nome+città con coordinate sue", async () => {
    finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const b = await conProfilo(t, "u-b", "utente-b");
    const r = await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    const [c] = r.candidati;
    expect(c.ref).toMatch(/^[A-Za-z0-9]+:0$/);
    const creata = await a.as.mutation(api.venues.createFromCandidate, { input: { ref: c.ref } });
    expect(creata.esistente).toBe(false);
    const v = await t.run(async ctx => (await ctx.db.query("venues").collect())[0]);
    expect(v).toMatchObject({ name: "Unipol Forum", city: "Assago", osm: "W26626007", lng: 9.1422, lat: 45.4014, source: "osm" });
    // B con lo stesso candidato ritrova la stessa venue
    const r2 = await b.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    expect(await b.as.mutation(api.venues.createFromCandidate, { input: { ref: r2.candidati[0].ref } })).toEqual({ id: creata.id, esistente: true });
    const tutte = JSON.stringify(await t.run(async ctx => await ctx.db.query("venues").collect()));
    expect(tutte).not.toContain("8.9345");
    expect(tutte).not.toContain("44.4123");
  });

  it("indice fuori dai risultati → not_found", async () => {
    finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const r = await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    const fuori = r.candidati[0].ref.replace(/:0$/, ":7");
    expect(await codice(a.as.mutation(api.venues.createFromCandidate, { input: { ref: fuori } }))).toBe("not_found");
  });

  it("la creazione di una venue non risulta annullabile e Annulla lo dice chiaramente", async () => {
    finto([[POI]]);
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const r = await a.as.action(api.geo.searchVenue, { input: { query: "Forum di Assago" } });
    await a.as.mutation(api.venues.createFromCandidate, { input: { ref: r.candidati[0].ref } });
    const [voce] = (await a.as.query(api.activity.list, {})).voci;
    expect(voce).toMatchObject({ tabella: "venues", annullabile: false });
    try {
      await a.as.mutation(api.activity.undo, { input: { activityId: voce.id } });
      throw new Error("doveva fallire");
    } catch (e) {
      expect(codiceDi(e)).toBe("conflitto");
      expect((e as { data: { messaggio: string } }).data.messaggio).toContain("catalogo condiviso");
    }
  });
});
