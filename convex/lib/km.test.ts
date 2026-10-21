import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { conProfilo, setup, venue, type T } from "../test.setup";
import { estraiJitter, haversineKm, J_MAX, J_MIN, kmDaDistanza } from "./km.ts";

describe("ricetta dei km", () => {
  it("su 10.000 estrazioni il jitter resta in [0.95, 1.07] e non si ripete mai", () => {
    const visti = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const j = estraiJitter();
      expect(j).toBeGreaterThanOrEqual(J_MIN);
      expect(j).toBeLessThanOrEqual(J_MAX);
      visti.add(j);
    }
    expect(visti.size).toBe(10_000);
  });

  it("la formula è deterministica a j fisso", () => {
    const d = haversineKm([8.9339, 44.4073], [9.19, 45.464]); // Genova → Milano, ~120 km
    expect(d).toBeGreaterThan(115);
    expect(d).toBeLessThan(125);
    expect(kmDaDistanza(d, 1)).toBe(Math.round(d * (1.2 + 0.25 * Math.exp(-d / 20))));
    expect(kmDaDistanza(d, 1.03)).toBe(kmDaDistanza(d, 1.03));
    expect(kmDaDistanza(10, 0.95)).toBe(Math.round(10 * (1.2 + 0.25 * Math.exp(-0.5)) * 0.95));
  });
});

/** Un profilo con una partenza CON indirizzo e due venue. */
async function scenario(t: T) {
  const a = await conProfilo(t, "u-a", "utente-a");
  const { id: dep } = await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
  await t.run(async ctx => {
    await ctx.db.insert("departureSecrets", { departureId: dep as never, profileId: a.profileId, address: "x", lng: 9.19, lat: 45.464, geocodedAt: 0 });
    await ctx.db.patch(dep as never, { hasAddress: true });
  });
  await venue(t, "Fabrique", "Milano", 9.2523, 45.4521);
  await venue(t, "Arena del Mare", "Genova", 8.9188, 44.4071);
  const concerto = (artist: string, ven = "Arena del Mare", city = "Genova") => ({ kind: "concert", date: "01/07/2026", artist, venue: ven, city, from: "Casa" });
  return { a, dep, concerto };
}

const kmDi = async (t: T, id: string) => (await t.run(async ctx => ctx.db.get(id as never))) as { km?: number; kmSource?: string; kmPending?: boolean } | null;
const coppie = (t: T) => t.run(async ctx => (await ctx.db.query("kmPairs").collect()).length);

describe("km per coppia (kmPairs)", () => {
  it("una coppia esistente si riusa", async () => {
    const t = setup();
    const { a, concerto } = await scenario(t);
    const { id: x } = await a.as.mutation(api.entries.add, { input: concerto("A") });
    const { id: y } = await a.as.mutation(api.entries.add, { input: concerto("B") });
    const kx = await kmDi(t, x);
    expect(kx?.kmSource).toBe("calcolato");
    expect(kx?.km).toBeGreaterThan(100);
    expect((await kmDi(t, y))?.km).toBe(kx?.km);
    expect(await coppie(t)).toBe(1);
  });

  it("cancellare l'ultimo concerto di una coppia e riaggiungerlo dà un km identico", async () => {
    const t = setup();
    const { a, concerto } = await scenario(t);
    const { id } = await a.as.mutation(api.entries.add, { input: concerto("A") });
    const prima = (await kmDi(t, id))?.km;
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    const { id: di_nuovo } = await a.as.mutation(api.entries.add, { input: concerto("A") });
    expect((await kmDi(t, di_nuovo))?.km).toBe(prima);
    expect(await coppie(t)).toBe(1);
  });

  it("Annulla e Rifai danno un km identico", async () => {
    const t = setup();
    const { a, concerto } = await scenario(t);
    const { id } = await a.as.mutation(api.entries.add, { input: concerto("A") });
    const prima = (await kmDi(t, id))?.km;
    await a.as.mutation(api.entries.remove, { input: { id, confirm: true } });
    const [cancellazione] = (await a.as.query(api.activity.list, {})).voci;
    await a.as.mutation(api.activity.undo, { input: { activityId: cancellazione.id } }); // ripristina (nuovo id)
    const ripristinato = (await a.as.query(api.entries.list, {})).concerts[0];
    expect(ripristinato.km).toBe(prima);
    const [annullo] = (await a.as.query(api.activity.list, {})).voci;
    await a.as.mutation(api.activity.undo, { input: { activityId: annullo.id } }); // rifà la cancellazione
    expect((await a.as.query(api.entries.list, {})).concerts).toEqual([]);
    expect(await coppie(t)).toBe(1);
  });

  it("senza indirizzo il km resta in attesa, con il link a #partenze", async () => {
    const t = setup();
    const a = await conProfilo(t, "u-a", "utente-a");
    await a.as.mutation(api.departures.add, { input: { name: "Casa" } });
    await venue(t, "Fabrique", "Milano", 9.2523, 45.4521);
    const r = await a.as.mutation(api.entries.add, { input: { kind: "concert", date: "01/07/2026", artist: "A", venue: "Fabrique", city: "Milano", from: "Casa" } });
    expect(r).toMatchObject({ avviso: "departure_address_missing", fix: "/utente-a/modifica#partenze" });
    expect((await kmDi(t, r.id))?.kmPending).toBe(true);
    expect(await coppie(t)).toBe(0);
  });
});
