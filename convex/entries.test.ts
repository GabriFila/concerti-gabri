/* entries.list e il filtro da_completare: ogni riga dice cosa manca
   (`mancano`, lo stesso elenco del riquadro «Da completare» di #concerti e
   degli avvisi della pagina, partenza compresa); gli eventi in programma non
   sono mai da completare. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { conProfilo, setup, venue } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00+02:00"));
});
afterEach(() => vi.useRealTimers());

describe("entries.list", () => {
  it("da_completare: voto, posizione, canzoni note e partenza, come la dashboard", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    const base = { kind: "concert", venue: "Fabrique", city: "Milano", with: [] } as const;
    const add = (input: Record<string, unknown>) => a.as.mutation(api.entries.add, { input: { ...base, ...input } as never });
    await add({ artist: "Completo", date: "01/01/2025", voto: 4, vicinanza: 6, canzoniNote: 3, from: "Casa" });
    await add({ artist: "Senza partenza", date: "02/01/2025", voto: 4, vicinanza: 6, canzoniNote: "na" });
    await add({ artist: "Senza voto", date: "03/01/2025", vicinanza: 5, canzoniNote: 3, from: "Casa" });
    await add({ artist: "Futuro", date: "25/12/2026" });
    await a.as.mutation(api.entries.add, {
      input: {
        kind: "festival", name: "MI AMI", date: "21–24/05/2025", venue: "Fabrique", city: "Milano", from: "Casa",
        concerts: [{ artist: "Rares", with: [], voto: 4, vicinanza: 5, canzoniNote: 3 }, { artist: "Patagarri", with: [] }],
      },
    });

    const tutti = (await a.as.query(api.entries.list, {})).concerts;
    const per = (x: { artist?: string; name?: string }) => x.artist ?? x.name;
    expect(Object.fromEntries(tutti.map(e => [per(e), e.mancano]))).toEqual({
      Completo: [],
      "Senza partenza": ["partenza"],
      "Senza voto": ["voto"],
      Futuro: [],
      "MI AMI": ["voto (1 concerto)", "posizione (1 concerto)", "canzoni note (1 concerto)"],
    });
    for (const e of tutti) expect(e.daCompletare).toBe(e.mancano.length > 0);

    const daFare = (await a.as.query(api.entries.list, { input: { da_completare: true } })).concerts;
    expect(daFare.map(per).sort()).toEqual(["MI AMI", "Senza partenza", "Senza voto"]);
  });
});

describe("tour", () => {
  it("si scrive, si cambia e si toglie; in un festival sta nei concerti; la pagina pubblica lo vede", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const { id } = await a.as.mutation(api.entries.add, {
      input: { kind: "concert", artist: "Verdena", tour: "Volevo magia tour", date: "01/03/2025", venue: "Fabrique", city: "Milano", with: [] } as never,
    });
    const leggi = async () => (await a.as.query(api.entries.list, {})).concerts.find(e => e.id === id) as { tour?: string };
    expect((await leggi()).tour).toBe("Volevo magia tour");
    await a.as.mutation(api.entries.update, { input: { id, patch: { tour: "Altro tour" } } as never });
    expect((await leggi()).tour).toBe("Altro tour");
    await a.as.mutation(api.entries.update, { input: { id, patch: { tour: null } } as never });
    expect(await leggi()).not.toHaveProperty("tour");

    const f = await a.as.mutation(api.entries.add, {
      input: { kind: "festival", name: "MI AMI", date: "21–24/05/2025", venue: "Fabrique", city: "Milano", concerts: [{ artist: "Rares", tour: "Tour R", with: [] }, { artist: "Patagarri", with: [] }] } as never,
    });
    await expect(a.as.mutation(api.entries.update, { input: { id: f.id, patch: { tour: "x" } } as never })).rejects.toThrow(/concerts/);
    const pagina = await t.query(api.pages.byHandle, { handle: "utente-a" });
    const fest = (pagina as { entries: { kind: string; concerts?: { tour?: string }[] }[] }).entries.find(e => e.kind === "festival");
    expect(fest?.concerts?.map(c => c.tour)).toEqual(["Tour R", undefined]);
  });
});

describe("bulk_update_concerts (entries.updateMany)", () => {
  async function base() {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    await a.as.mutation(api.people.add, { input: { name: "Lu" } });
    const add = async (artist: string) =>
      (await a.as.mutation(api.entries.add, { input: { kind: "concert", artist, date: "01/03/2025", venue: "Fabrique", city: "Milano", with: [] } as never })).id;
    const leggi = async () => Object.fromEntries((await a.as.query(api.entries.list, {})).concerts.map(e => [e.id, e as { voto?: number; with?: string[]; artist?: string }]));
    return { t, a, add, leggi };
  }

  it("modifica più concerti in una volta, in un solo lotto che un undo annulla tutto", async () => {
    const { a, add, leggi } = await base();
    const [x, y, z] = [await add("X"), await add("Y"), await add("Z")];
    const r = await a.as.mutation(api.entries.updateMany, {
      input: { updates: [{ id: x, patch: { voto: 5, with: ["Lu"] } }, { id: y, patch: { voto: 2 } }] } as never,
    });
    expect(r).toMatchObject({ modificati: 2, ids: [x, y] });
    let righe = await leggi();
    expect(righe[x]).toMatchObject({ voto: 5, with: ["Lu"] });
    expect(righe[y].voto).toBe(2);
    expect(righe[z].voto).toBeUndefined();

    const voci = (await a.as.query(api.activity.list, {})).voci.slice(0, 2);
    expect(new Set(voci.map(v => (v as { lotto?: string }).lotto))).toEqual(new Set([r.batchId]));
    await a.as.mutation(api.activity.undo, { input: { activityId: voci[1].id } });
    righe = await leggi();
    expect(righe[x].voto).toBeUndefined();
    expect(righe[x].with).toEqual([]);
    expect(righe[y].voto).toBeUndefined();
  });

  it("tutte o nessuna: un errore in una modifica non salva le altre e dice quale", async () => {
    const { a, add, leggi } = await base();
    const [x, y] = [await add("X"), await add("Y")];
    const err = await a.as
      .mutation(api.entries.updateMany, { input: { updates: [{ id: x, patch: { voto: 5 } }, { id: y, patch: { with: ["Sconosciuto"] } }] } as never })
      .then(() => null, e => (e as { data: Record<string, unknown> }).data);
    expect(err).toMatchObject({ code: "nome_sconosciuto", indice: 1, campo: "updates.1.patch.with.0" });
    expect(String(err?.messaggio)).toMatch(/^updates\.1: /);
    expect((await leggi())[x].voto).toBeUndefined();
  });

  it("al massimo 20, un id una volta sola, id altrui come inesistenti", async () => {
    const { t, a, add } = await base();
    const x = await add("X");
    const codice = (input: unknown) => a.as.mutation(api.entries.updateMany, { input: input as never }).then(() => "ok", e => (e as { data: { code: string } }).data.code);
    expect(await codice({ updates: [] })).toBe("input_non_valido");
    expect(await codice({ updates: Array.from({ length: 21 }, () => ({ id: x, patch: { voto: 1 } })) })).toBe("input_non_valido");
    expect(await codice({ updates: [{ id: x, patch: { voto: 1 } }, { id: x, patch: { voto: 2 } }] })).toBe("input_non_valido");
    const b = await conProfilo(t, "u-b", "utente-b");
    const daB = await b.as.mutation(api.entries.updateMany, { input: { updates: [{ id: x, patch: { voto: 1 } }] } as never }).then(() => null, e => (e as { data: Record<string, unknown> }).data);
    expect(daB).toMatchObject({ code: "not_found", indice: 0, campo: "updates.0.id" });
  });
});
