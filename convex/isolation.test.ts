/* Isolamento (PIANO §4.7.5), generato dal registro: ogni funzione del
   proprietario che prende id viene chiamata come B con gli id di A e deve
   rispondere solo `not_found` o `unauthorized`; quelle senza id agiscono
   solo su B. Alla fine i dati di A sono identici. */

import { describe, expect, it } from "vitest";
import { codiceDi } from "./lib/errors.ts";
import { registro } from "./test.registry.ts";
import { conProfilo, setup, venue, type T } from "./test.setup";
import { api } from "./_generated/api";

/** Input con gli id di A, per funzione. `null` = la funzione non prende id. */
function inputCon(ids: Record<string, string>): Record<string, unknown | null> {
  return {
    "profiles:get": null,
    "profiles:update": null,
    "profiles:setTheme": null,
    "profiles:setOnboardingStep": null,
    "people:list": null,
    "people:add": null,
    "people:rename": { id: ids.person, name: "Preso" },
    "people:merge": { from: ids.person, into: ids.person2 },
    "people:remove": { id: ids.person, confirm: true },
    "departures:list": null,
    "departures:add": null,
    "departures:rename": { id: ids.departure, name: "Presa" },
    "departures:remove": { id: ids.departure, confirm: true },
    "departures:confirmAddress": { departureId: ids.departure, indice: 0 },
    "gifters:list": null,
    "gifters:add": null,
    "gifters:update": { id: ids.gifter, label: "Preso" },
    "gifters:remove": { id: ids.gifter, confirm: true },
    "wishlist:list": null,
    "wishlist:set": null,
    "venues:createFromCandidate": null,
    "geo:searchVenue": null,
    "geo:geocodeDeparture": { departureId: ids.departure, address: "Via dei Canarini 7, Genova" },
    "entries:list": null,
    "entries:get": { id: ids.entry },
    "entries:add": null,
    "entries:update": { id: ids.entry, patch: { artist: "Preso" } },
    "entries:remove": { id: ids.entry, confirm: true },
    "activity:list": null,
    "activity:undo": { activityId: ids.activity },
  };
}

async function datiDi(t: T, profileId: string) {
  return await t.run(async ctx => {
    const out: Record<string, unknown[]> = {};
    for (const tab of ["people", "departures", "gifters", "entries", "wishlist", "activity"] as const) {
      out[tab] = (await ctx.db.query(tab).collect()).filter(d => (d as { profileId: string }).profileId === profileId);
    }
    out.profile = [await ctx.db.get(profileId as never)];
    return out;
  });
}

describe("isolamento tra profili", () => {
  it("B con gli id di A ottiene solo not_found/unauthorized e A resta invariata", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    const b = await conProfilo(t, "u-b", "utente-b");
    await venue(t, "Fabrique", "Milano", 9.25, 45.45);
    const person = (await a.as.mutation(api.people.add, { input: { name: "Marco R." } })).id;
    const person2 = (await a.as.mutation(api.people.add, { input: { name: "Lu" } })).id;
    const departure = (await a.as.mutation(api.departures.add, { input: { name: "Casa" } })).id;
    const gifter = (await a.as.mutation(api.gifters.add, { input: { label: "Amici" } })).id;
    const entry = (await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/01/2026", artist: "X", venue: "Fabrique", city: "Milano", with: ["Lu"], from: "Casa" } })).id;
    const activity = (await a.as.query(api.activity.list, {})).voci[0].id;
    const ids = { person, person2, departure, gifter, entry, activity };
    const prima = await datiDi(t, a.profileId);

    const tabella = inputCon(ids);
    const owner = registro().filter(f => f.meta?.kind === "owner");
    // ogni funzione del proprietario è classificata qui (una nuova va aggiunta)
    expect(owner.map(f => f.path).filter(p => !(p in tabella))).toEqual([]);

    for (const f of owner) {
      const input = tabella[f.path];
      if (input === null) continue;
      const fn = f.fn as never;
      let codice = "ok";
      try {
        if (f.fn.isQuery) await b.as.query(fn, { input });
        else if (f.fn.isMutation) await b.as.mutation(fn, { input });
        else await b.as.action(fn, { input });
      } catch (e) {
        codice = codiceDi(e) ?? "altro";
      }
      expect(["not_found", "unauthorized"], `${f.path} → ${codice}`).toContain(codice);
    }
    expect(await datiDi(t, a.profileId)).toEqual(prima);
  });
});
