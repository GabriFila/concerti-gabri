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
