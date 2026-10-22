/* L'Oracolo sui dati Convex (PIANO §1.14, traguardo 2): query_concerts su
   pageToDataset(pages.byHandle('gabrifila')) dopo seed:ensure dà gli STESSI
   risultati che sui dati statici di sempre (ALLDATA), per ogni filtro,
   raggruppamento e ordinamento; e lo stesso valgono vocabolari, schema
   dello strumento e prompt di sistema. Gira nel progetto `convex`
   (convex-test, edge-runtime) per seminare un backend vero. */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, internal } from "../../../convex/_generated/api";
import { setup } from "../../../convex/test.setup";
import { buildDataset, type Dataset } from "../../../shared/lib/dataset.ts";
import { todayKey } from "../../../shared/lib/dates.ts";
import { pageToDataset, type PaginaPubblica } from "../../../shared/lib/pageToDataset.ts";
import { GABRIFILA_INPUT } from "../../../shared/seed/gabrifila.ts";
import { chatToolDefs } from "../../chat/tools.ts";
import { CANARINO, formeCanarino } from "../../../e2e/helpers/canarino.ts";
import { datasetDaConvex, paginaDaConvex } from "./pagina.ts";
import { systemPrompt } from "./prompt.ts";
import { queryInputSchema, runConcertQuery, type ConcertQuery } from "./query.ts";

const TODAY = todayKey(Date.parse("2026-10-21T12:00:00+02:00"));

const GROUPS = ["person", "artist", "year", "city", "venue", "vicinanza", "canzoniNote"] as const;
const SORTS = ["count", "avgVoto", "avgCost", "totalCost", "avgCanzoniNote"] as const;

const QUERIES: ConcertQuery[] = [
  {},
  { status: "attended" },
  { status: "planned" },
  { years: [2025] },
  { status: "attended", years: [2025] },
  { years: [2017, 2022, 2026] },
  { people: ["Cami <3"] },
  { people: ["Cami <3", "Anna DF"], status: "attended" },
  { solo: true },
  { artist: "mi ami" },
  { artist: "emma" },
  { cities: ["Genova", "Milano"] },
  { cities: ["Roma"] },
  { gift: true },
  { gift: false },
  { accredito: true },
  { accredito: false, status: "attended" },
  { canzoniNote: ["4", "5"] },
  ...GROUPS.flatMap(groupBy => SORTS.map(sortGroupsBy => ({ groupBy, sortGroupsBy }))),
  { groupBy: "person", status: "attended", years: [2024, 2025] },
];

async function daConvex(): Promise<Dataset> {
  const t = setup();
  await t.mutation(internal.seed.ensure, {});
  // la stessa strada della route /api/chat (pagina.ts), con il backend di prova al posto dell'HTTP
  const ds = await datasetDaConvex("gabrifila", { query: ((fn: any, args: any) => t.query(fn, args)) as any });
  if (!ds) throw new Error("pages.byHandle('gabrifila') è null dopo il seed");
  return ds;
}

describe("query_concerts su Convex", () => {
  it("stessi risultati che sui dati statici, per ogni filtro e raggruppamento", async () => {
    const convex = await daConvex();
    const statico = buildDataset(GABRIFILA_INPUT);
    for (const q of QUERIES) {
      expect(runConcertQuery(convex, q, TODAY), JSON.stringify(q)).toEqual(runConcertQuery(statico, q, TODAY));
    }
    // un controllo che i dati ci siano davvero (il test di parità non è vuoto)
    expect(runConcertQuery(convex, { status: "attended", years: [2025] }, TODAY).count).toBe(16);
    expect(runConcertQuery(convex, { gift: true }, TODAY).concerts.some(l => l.includes("regalo di Wiseair"))).toBe(true);
  });

  it("stessi vocabolari, schema degli strumenti e prompt di sistema", async () => {
    const convex = await daConvex();
    const statico = buildDataset(GABRIFILA_INPUT);
    expect(convex.vocab).toEqual(statico.vocab);
    expect(z.toJSONSchema(queryInputSchema(convex.vocab))).toEqual(z.toJSONSchema(queryInputSchema(statico.vocab)));
    const a = chatToolDefs(convex.vocab), b = chatToolDefs(statico.vocab);
    expect(z.toJSONSchema(a.setFiltersDef.inputSchema as z.ZodType)).toEqual(z.toJSONSchema(b.setFiltersDef.inputSchema as z.ZodType));
    const profilo = { handle: "gabrifila", displayName: "Gabri", forma: "m" } as const;
    expect(systemPrompt(convex, TODAY, profilo)).toBe(systemPrompt(statico, TODAY, profilo));
  });

  it("nessun indirizzo: con il canarino in una partenza, pagina, prompt e risultati di query_concerts non lo contengono", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    vi.stubEnv("AUTH_DEV_OTP", "1");
    try {
      const t = setup();
      await t.mutation(internal.seed.ensure, {});
      await t.mutation(internal.devtools.setDepartureForTest, { handle: "gabrifila", departure: "Genova", address: CANARINO.indirizzo, lng: CANARINO.lng, lat: CANARINO.lat });
      const pagina = await paginaDaConvex("gabrifila", { query: ((fn: any, args: any) => t.query(fn, args)) as any });
      if (!pagina) throw new Error("pagina assente");
      expect(pagina.profilo).toEqual({ handle: "gabrifila", displayName: "Gabri", forma: "m", layout: { ordine: [], nascoste: [], titoli: {} } });
      const uscite = [
        JSON.stringify(pagina),
        systemPrompt(pagina.dataset, TODAY, pagina.profilo),
        ...QUERIES.map(q => JSON.stringify(runConcertQuery(pagina.dataset, q, TODAY))),
      ];
      for (const forma of formeCanarino()) for (const u of uscite) expect(u.includes(forma), forma).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("pagina assente o alias: niente dataset", async () => {
    const t = setup();
    const client = { query: ((fn: any, args: any) => t.query(fn, args)) as any };
    expect(await datasetDaConvex("gabrifila", client)).toBeNull();
    await t.mutation(internal.seed.ensure, {});
    const page = (await t.query(api.pages.byHandle, { handle: "gabrifila" })) as PaginaPubblica;
    expect(buildDataset(pageToDataset(page)).flat).toHaveLength(91);
  });
});
