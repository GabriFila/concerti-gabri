import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { v } from "convex/values";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { fields } from "../../convex/schema.ts";
import { zodFieldsToConvex } from "../../convex/lib/zodConvex.ts";
import { CATALOGO } from "../agent/catalog.ts";
import { aggiungiPartenzaInput, confermaIndirizzoInput, geocodificaPartenzaInput, rinominaPartenzaInput } from "./departure.ts";
import { cancellaConcertoInput, elencaConcertiInput, entryInput, modificaConcertoInput } from "./entry.ts";
import { percorsoSicuro, riassumiErroreZod } from "./errors.ts";
import { aggiungiRegaloInput, modificaRegaloInput } from "./gifter.ts";
import { COLONNE_CSV, rigaCsv } from "./importFormat.ts";
import { aggiornaProfiloInput, impostaTemaInput } from "./profile.ts";
import { tables } from "./tables.ts";
import { aggiungiVenueInput, cercaVenueInput } from "./venue.ts";

const concerto = { kind: "concert", date: "24/07/2026", artist: "Caparezza", venue: "Arena del Mare", city: "Genova", with: ["Cami <3"], voto: 5, vicinanza: 5, canzoniNote: 4, cost: 60.99, from: "Genova" };
const festival = {
  kind: "festival", name: "MI AMI 2026", date: "21–24/05/2026", venue: "Idroscalo", city: "Milano", cost: 147.25,
  concerts: [{ artist: "Rares", date: "2026-05-22", with: [] }, { artist: "Patagarri", with: ["Perla"], voto: 4 }],
};

describe("entryInput", () => {
  it("accetta righe valide", () => {
    expect(entryInput.safeParse(concerto).success).toBe(true);
    const f = entryInput.parse(festival);
    expect(f.kind).toBe("festival");
    if (f.kind === "festival") expect(f.concerts[0].date).toBe("22/05/2026"); // ISO → gg/mm/aaaa
  });

  it("rifiuta righe non valide", () => {
    expect(entryInput.safeParse({ ...concerto, voto: 6 }).success).toBe(false);
    expect(entryInput.safeParse({ ...concerto, vicinanza: 0 }).success).toBe(false);
    expect(entryInput.safeParse({ ...concerto, canzoniNote: "boh" }).success).toBe(false);
    expect(entryInput.safeParse({ ...concerto, cost: "gratis" }).success).toBe(false);
    expect(entryInput.safeParse({ ...concerto, cost: "na" }).success).toBe(true);
    expect(entryInput.safeParse({ ...concerto, kind: "boh" }).success).toBe(false);
    expect(entryInput.safeParse({ ...concerto, artist: "" }).success).toBe(false);
  });

  it("un festival con meno di 2 concerti è rifiutato", () => {
    expect(entryInput.safeParse({ ...festival, concerts: [festival.concerts[0]] }).success).toBe(false);
    expect(entryInput.safeParse({ ...festival, concerts: [] }).success).toBe(false);
  });

  it("date nei due formati (e più giorni)", () => {
    expect(entryInput.parse({ ...concerto, date: "2026-07-24" }).date).toBe("24/07/2026");
    expect(entryInput.parse({ ...concerto, date: "24/07/2026" }).date).toBe("24/07/2026");
    expect(entryInput.parse({ ...festival, date: "30–31/03/2017" }).date).toBe("30–31/03/2017");
    for (const bad of ["24-07-2026", "2026/07/24", "32/01/2026", "01/13/2026", "domani"]) {
      expect(entryInput.safeParse({ ...concerto, date: bad }).success, bad).toBe(false);
    }
  });

  it("gli URL devono essere https", () => {
    expect(aggiungiRegaloInput.safeParse({ label: "Wiseair", url: "https://wiseair.vision" }).success).toBe(true);
    expect(aggiungiRegaloInput.safeParse({ label: "Wiseair", url: "http://wiseair.vision" }).success).toBe(false);
    expect(aggiungiRegaloInput.safeParse({ label: "X", url: "javascript:alert(1)" }).success).toBe(false);
  });
});

/* ── descrizioni: ogni campo foglia degli schemi esterni ne ha una ── */
type Any = z.ZodType & { def: any; description?: string };
const unwrap = (s: Any): Any => {
  const t = s.def.type;
  if (t === "optional" || t === "nullable" || t === "default" || t === "readonly") return unwrap(s.def.innerType);
  if (t === "pipe") return unwrap(s.def.out.def.type === "transform" ? s.def.in : s.def.out);
  return s;
};
const descritto = (s: Any): boolean => {
  if (s.description) return true;
  const t = s.def.type;
  if (t === "optional" || t === "nullable" || t === "default" || t === "readonly") return descritto(s.def.innerType);
  if (t === "pipe") return descritto(s.def.in) || descritto(s.def.out);
  return false;
};
function senzaDescrizione(s: Any, path: string, out: string[]) {
  const u = unwrap(s);
  const t = u.def.type;
  if (t === "object") {
    for (const [k, f] of Object.entries(u.def.shape as Record<string, Any>)) {
      const p = path ? `${path}.${k}` : k;
      const fu = unwrap(f);
      if (fu.def.type === "object" || (fu.def.type === "array" && unwrap(fu.def.element).def.type === "object")) senzaDescrizione(f, p, out);
      else if (!descritto(f)) out.push(p);
    }
  } else if (t === "array") {
    senzaDescrizione(u.def.element, `${path}[]`, out);
  } else if (t === "union") {
    for (const [i, o] of (u.def.options as Any[]).entries()) senzaDescrizione(o, `${path}|${i}`, out);
  }
}

describe("descrizioni", () => {
  const ESTERNI: Record<string, z.ZodType> = {
    entryInput, modificaConcertoInput, cancellaConcertoInput, elencaConcertiInput,
    aggiornaProfiloInput, impostaTemaInput, aggiungiPartenzaInput, rinominaPartenzaInput,
    geocodificaPartenzaInput, confermaIndirizzoInput, aggiungiRegaloInput, modificaRegaloInput,
    cercaVenueInput, aggiungiVenueInput, rigaCsv,
    ...Object.fromEntries(CATALOGO.map(o => [`catalogo:${o.name}`, o.input])),
  };
  for (const [nome, schema] of Object.entries(ESTERNI)) {
    it(`${nome}: ogni campo foglia ha una descrizione`, () => {
      const out: string[] = [];
      senzaDescrizione(schema as Any, "", out);
      expect(out).toEqual([]);
    });
  }
});

describe("Zod → Convex", () => {
  it("le tabelle Zod danno esattamente i validatori di convex/schema.ts", () => {
    expect(Object.keys(tables).sort()).toEqual(Object.keys(fields).sort());
    for (const t of Object.keys(fields) as (keyof typeof fields)[]) {
      const json = (x: unknown) => (x as { json: unknown }).json;
      const daZod = json(v.object(zodFieldsToConvex(tables[t] as Record<string, z.ZodType>)));
      const scritto = json(v.object(fields[t]));
      expect(daZod, t).toEqual(scritto);
    }
  });
});

describe("formato di import (congelato)", () => {
  it("colonne CSV in quest'ordine", () => {
    expect(COLONNE_CSV.join(",")).toBe("tipo,data,data_concerto,artista,festival,venue,citta,con,voto,vicinanza,canzoni_note,costo,regalo,regalato_da,accredito,partenza,commento");
  });
});

describe("errori senza valori (§5.3)", () => {
  const CANARINO = "Via dei Canarini 7";
  it("una chiave di record scelta dal chiamante non entra nel messaggio né in campo", () => {
    for (const chiave of [CANARINO, "CANARINO_VALORE_UTENTE", "sec-canarino"]) {
      const r = impostaTemaInput.safeParse({ layout: { ordine: [], nascoste: [], titoli: { [chiave]: "" } } });
      expect(r.success).toBe(false);
      const { messaggio, campo } = riassumiErroreZod(r.error!, impostaTemaInput);
      expect(messaggio + campo, chiave).not.toContain(chiave);
      expect(campo).toBe("layout.titoli.*");
    }
  });

  it("i nomi dei campi dichiarati e gli indici restano", () => {
    const r = entryInput.safeParse({ ...festival, concerts: [festival.concerts[0], { ...festival.concerts[1], voto: 9 }] });
    expect(riassumiErroreZod(r.error!, entryInput).campo).toBe("concerts.1.voto");
  });

  it("senza schema restano solo indici e nomi da identificatore", () => {
    expect(percorsoSicuro(["layout", "titoli", CANARINO, 3, "ok_1"])).toEqual(["layout", "titoli", "*", "3", "ok_1"]);
  });
});

describe("purezza di shared/", () => {
  it("nessun import di convex/* sotto shared/ (test esclusi)", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk(root);
    const colpevoli = files.filter(f => /from\s+["'](?:convex(?:\/|["'])|[^"']*\/convex\/)/.test(readFileSync(f, "utf8")));
    expect(colpevoli).toEqual([]);
  });
});
